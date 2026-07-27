package hk.ljx.fishaicode.ai.tools;

import cn.hutool.json.JSONObject;
import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;
import dev.langchain4j.agent.tool.ToolMemoryId;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 文件删除工具
 * 支持 AI 通过工具调用的方式删除文件
 */
@Slf4j
@Component
public class FileDeleteTool extends BaseTool {

    @Resource
    private ProjectPathResolver projectPathResolver;

    @Tool("删除指定路径的文件")
    public String deleteFile(
            @P("文件的相对路径")
            String relativeFilePath,
            @ToolMemoryId Long appId
    ) {
        try {
            Path path = projectPathResolver.resolveExistingFile(appId, relativeFilePath);
            // 安全检查：避免删除重要文件
            String fileName = path.getFileName().toString();
            if (isImportantFile(fileName)) {
                return "错误：不允许删除重要文件 - " + fileName;
            }
            Files.delete(path);
            log.info("成功删除项目文件: {}", relativeFilePath);
            return "文件删除成功: " + relativeFilePath;
        } catch (IllegalArgumentException e) {
            log.warn("拒绝删除项目外文件: {}", relativeFilePath);
            return "错误：文件路径不合法 - " + relativeFilePath;
        } catch (IOException e) {
            log.error("删除项目文件失败: {}", relativeFilePath, e);
            return "错误：文件不存在或无法删除 - " + relativeFilePath;
        }
    }

    /**
     * 判断是否是重要文件，不允许删除
     */
    private boolean isImportantFile(String fileName) {
        String[] importantFiles = {
                "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
                "vite.config.js", "vite.config.ts", "vue.config.js",
                "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json",
                "index.html", "main.js", "main.ts", "App.vue", ".gitignore", "README.md"
        };
        for (String important : importantFiles) {
            if (important.equalsIgnoreCase(fileName)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 获取工具的英文名称（对应方法名）
     *
     * @return 工具英文名称
     */
    @Override
    public String getToolName() {
        return "deleteFile";
    }

    /**
     * 获取工具的中文显示名称
     *
     * @return 工具中文名称
     */
    @Override
    public String getDisplayName() {
        return "删除文件";
    }

    /**
     * 生成工具执行结果格式（保存到数据库）
     *
     * @param arguments 工具执行参数
     * @return 格式化的工具执行结果
     */
    @Override
    public String generateToolExecutedResult(JSONObject arguments) {
        String relativeFilePath = arguments.getStr("relativeFilePath");
        return String.format("[工具调用] %s %s", getDisplayName(), relativeFilePath);
    }
}
