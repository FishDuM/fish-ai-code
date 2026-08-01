package hk.ljx.fishaicode.workflow.service;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.StrUtil;
import hk.ljx.fishaicode.workflow.ai.CodeQualityCheckService;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * 代码生成工作流服务 - 串联图片收集 → 提示词增强 → 质量检查 → 项目构建
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

    @Resource
    private CodeQualityCheckService codeQualityCheckService;

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
     * 执行代码质量检查
     *
     * @param generatedCodeDir 生成的代码目录
     * @return 质量检查结果
     */
    public QualityResult runQualityCheck(String generatedCodeDir) {
        if (StrUtil.isBlank(generatedCodeDir)) {
            log.warn("代码目录为空，跳过质量检查");
            return null;
        }
        try {
            String codeContent = readAndConcatenateCodeFiles(generatedCodeDir);
            if (StrUtil.isBlank(codeContent)) {
                log.warn("未找到可检查的代码文件，跳过质量检查");
                return null;
            }
            QualityResult result = codeQualityCheckService.checkCodeQuality(codeContent);
            log.info("代码质量检查完成 - 是否通过: {}", result.getIsValid());
            return result;
        } catch (Exception e) {
            log.error("代码质量检查异常: {}", e.getMessage(), e);
            return null;
        }
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

    /**
     * 需要检查的文件扩展名
     */
    private static final List<String> CODE_EXTENSIONS = Arrays.asList(
            ".html", ".htm", ".css", ".js", ".json", ".vue", ".ts", ".jsx", ".tsx"
    );

    /**
     * 读取并拼接代码目录下的所有代码文件
     */
    private String readAndConcatenateCodeFiles(String codeDir) {
        File directory = new File(codeDir);
        if (!directory.exists() || !directory.isDirectory()) {
            log.error("代码目录不存在: {}", codeDir);
            return "";
        }
        StringBuilder codeContent = new StringBuilder();
        codeContent.append("# 项目文件结构和代码内容\n\n");
        FileUtil.walkFiles(directory, file -> {
            if (shouldSkipFile(file, directory)) {
                return;
            }
            if (isCodeFile(file)) {
                String relativePath = FileUtil.subPath(directory.getAbsolutePath(), file.getAbsolutePath());
                codeContent.append("## 文件: ").append(relativePath).append("\n\n");
                String fileContent = FileUtil.readUtf8String(file);
                codeContent.append(fileContent).append("\n\n");
            }
        });
        return codeContent.toString();
    }

    private boolean shouldSkipFile(File file, File rootDir) {
        String relativePath = FileUtil.subPath(rootDir.getAbsolutePath(), file.getAbsolutePath());
        if (file.getName().startsWith(".")) {
            return true;
        }
        return relativePath.contains("node_modules" + File.separator) ||
                relativePath.contains("dist" + File.separator) ||
                relativePath.contains("target" + File.separator) ||
                relativePath.contains(".git" + File.separator);
    }

    private boolean isCodeFile(File file) {
        String fileName = file.getName().toLowerCase();
        return CODE_EXTENSIONS.stream().anyMatch(fileName::endsWith);
    }
}
