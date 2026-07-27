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
 * 文件读取工具
 * 支持 AI 通过工具调用的方式读取文件内容
 */
@Slf4j
@Component
public class FileReadTool extends BaseTool{

    private static final long MAX_FILE_SIZE_BYTES = 1024 * 1024;

    @Resource
    private ProjectPathResolver projectPathResolver;

    @Tool("读取指定路径的文件内容")
    public String readFile(
            @P("文件的相对路径")
            String relativeFilePath,
            @ToolMemoryId Long appId
    ) {
        try {
            Path path = projectPathResolver.resolveExistingFile(appId, relativeFilePath);
            if (Files.size(path) > MAX_FILE_SIZE_BYTES) {
                return "错误：文件过大，无法读取 - " + relativeFilePath;
            }
            return Files.readString(path);
        } catch (IllegalArgumentException e) {
            log.warn("拒绝读取项目外文件: {}", relativeFilePath);
            return "错误：文件路径不合法 - " + relativeFilePath;
        } catch (IOException e) {
            log.error("读取项目文件失败: {}", relativeFilePath, e);
            return "错误：文件不存在、不可读取或过大 - " + relativeFilePath;
        }
    }

    @Override
    public String getToolName() {
        return "readFile";
    }

    @Override
    public String getDisplayName() {
        return "读取文件";
    }

    @Override
    public String generateToolExecutedResult(JSONObject arguments) {
        String relativeFilePath = arguments.getStr("relativeFilePath");
        return String.format("[工具调用] %s %s", getDisplayName(), relativeFilePath);
    }
}
