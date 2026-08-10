package hk.ljx.fishaicode.workflow.service;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.StrUtil;
import hk.ljx.fishaicode.workflow.ai.ImageCollectionPlanService;
import hk.ljx.fishaicode.workflow.model.ImageCollectionPlan;
import hk.ljx.fishaicode.workflow.model.ImageResource;
import hk.ljx.fishaicode.workflow.model.QualityResult;
import hk.ljx.fishaicode.workflow.tools.ImageSearchTool;
import hk.ljx.fishaicode.workflow.tools.UndrawIllustrationTool;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * 代码生成工作流服务 - 串联图片收集 → 提示词增强 → 产物完整性校验 → 项目构建
 * 代码生成本身由 AiCodeGeneratorFacade 直接调用 LLM 完成（支持流式 SSE 输出给前端）
 */
@Slf4j
@Service
public class WorkflowService {

    @Resource
    private ImageCollectionPlanService imageCollectionPlanService;

    @Resource
    private ImageSearchTool imageSearchTool;

    @Resource
    private UndrawIllustrationTool undrawIllustrationTool;

    @Resource(name = "virtualThreadExecutor")
    private java.util.concurrent.ExecutorService virtualThreadExecutor;

    /**
     * 增强提示词：图片收集 + 提示词增强
     *
     * @param originalPrompt 用户原始提示词
     * @return 增强后的提示词（含图片资源信息）
     */
    public String enhancePrompt(String originalPrompt) {
        // 1. 图片收集
        List<ImageResource> imageList = collectImages(originalPrompt);
        // 2. 提示词增强
        return buildEnhancedPrompt(originalPrompt, imageList);
    }

    /**
     * 校验生成产物是否完整：HTML 需 index.html、MULTI_FILE 需三个入口文件、
     * VUE_PROJECT 需 dist 构建产物，缺文件即判定不通过。
     *
     * @param generatedCodeDir 生成的代码目录
     * @param codeGenType      代码生成类型（html / multi_file / vue_project）
     * @return 校验结果（isValid=false 时 errors 列出缺失文件）
     */
    public QualityResult runQualityCheck(String generatedCodeDir, String codeGenType) {
        if (StrUtil.isBlank(generatedCodeDir)) {
            log.warn("代码目录为空，跳过产物完整性校验");
            return null;
        }
        File dir = new File(generatedCodeDir);
        if (!dir.isDirectory()) {
            return QualityResult.builder().isValid(false)
                    .errors(List.of("代码目录不存在: " + generatedCodeDir))
                    .build();
        }

        List<String> requiredFiles = resolveRequiredFiles(codeGenType);
        List<String> missing = new ArrayList<>();
        for (String fileName : requiredFiles) {
            File file = Paths.get(dir.getAbsolutePath(), fileName).toFile();
            // 0 字节文件视为缺失：AI 漏输出 css/js 时会被建成空文件，仅查 exist 会漏报
            if (!FileUtil.exist(file) || (file.isFile() && file.length() == 0)) {
                missing.add(fileName);
            }
        }
        boolean valid = missing.isEmpty();
        QualityResult.QualityResultBuilder builder = QualityResult.builder().isValid(valid);
        if (valid) {
            log.info("产物完整性校验通过: {}", dir.getAbsolutePath());
        } else {
            builder.errors(missing);
            log.warn("产物完整性校验失败，缺失文件: {}", missing);
        }
        return builder.build();
    }

    /**
     * 各生成模式必须存在的入口文件（VUE_PROJECT 需 dist 构建产物）。
     */
    private List<String> resolveRequiredFiles(String codeGenType) {
        if ("vue_project".equals(codeGenType)) {
            return List.of("dist", "dist/index.html");
        }
        if ("multi_file".equals(codeGenType)) {
            return List.of("index.html", "style.css", "script.js");
        }
        // html 及其他默认
        return List.of("index.html");
    }

    // ========== 私有方法 ==========

    /**
     * 收集图片资源
     */
    private List<ImageResource> collectImages(String prompt) {
        List<ImageResource> collectedImages = new ArrayList<>();
        try {
            // 1. 获取图片收集计划
            ImageCollectionPlan plan = imageCollectionPlanService.planImageCollection(prompt);
            log.info("获取到图片收集计划");

            // 2. 并发执行图片收集（最多取前 3 个搜索任务，避免太多）
            List<CompletableFuture<List<ImageResource>>> futures = new ArrayList<>();

            int taskCount = 0;
            int maxTasks = 3;

            if (plan.getContentImageTasks() != null) {
                for (ImageCollectionPlan.ImageSearchTask task : plan.getContentImageTasks()) {
                    if (taskCount >= maxTasks) break;
                    futures.add(CompletableFuture.supplyAsync(() ->
                            imageSearchTool.searchContentImages(task.query()), virtualThreadExecutor));
                    taskCount++;
                }
            }

            if (plan.getIllustrationTasks() != null && taskCount < maxTasks) {
                for (ImageCollectionPlan.IllustrationTask task : plan.getIllustrationTasks()) {
                    if (taskCount >= maxTasks) break;
                    futures.add(CompletableFuture.supplyAsync(() ->
                            undrawIllustrationTool.searchIllustrations(task.query()), virtualThreadExecutor));
                    taskCount++;
                }
            }

            // 3. 等待所有任务完成
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
            for (CompletableFuture<List<ImageResource>> future : futures) {
                List<ImageResource> images = future.get();
                if (images != null) {
                    collectedImages.addAll(images);
                }
            }
            log.info("图片收集完成，共收集到 {} 张图片", collectedImages.size());
        } catch (Exception e) {
            // 图片收集失败不中断主流程，记录日志即可
            log.error("图片收集失败: {}", e.getMessage(), e);
        }
        return collectedImages;
    }

    /**
     * 构建增强后的提示词
     */
    private String buildEnhancedPrompt(String originalPrompt, List<ImageResource> imageList) {
        if (CollUtil.isEmpty(imageList)) {
            return originalPrompt;
        }
        StringBuilder enhancedPromptBuilder = new StringBuilder(originalPrompt);
        enhancedPromptBuilder.append("\n\n## 可用素材资源\n");
        enhancedPromptBuilder.append("请在生成网站使用以下图片资源，将这些图片合理地嵌入到网站的相应位置中。\n");
        // 最多注入 6 张图片，避免提示词过长
        int maxImages = Math.min(imageList.size(), 6);
        for (int i = 0; i < maxImages; i++) {
            ImageResource image = imageList.get(i);
            enhancedPromptBuilder.append("- ")
                    .append(image.getCategory().getText())
                    .append("：")
                    .append(image.getDescription())
                    .append("（")
                    .append(image.getUrl())
                    .append("）\n");
        }
        if (imageList.size() > maxImages) {
            enhancedPromptBuilder.append("- 以及其他 ").append(imageList.size() - maxImages).append(" 张相关图片\n");
        }
        String enhancedPrompt = enhancedPromptBuilder.toString();
        log.info("提示词增强完成（注入{}张，总共{}张），增强后长度: {} 字符",
                maxImages, imageList.size(), enhancedPrompt.length());
        return enhancedPrompt;
    }
}
