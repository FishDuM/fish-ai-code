package hk.ljx.fishaicode.ai.tools;

import cn.hutool.json.JSONObject;
import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;
import dev.langchain4j.agent.tool.ToolMemoryId;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.charset.StandardCharsets;

/**
 * 文件写入工具
 * 支持 AI 通过工具调用的方式写入文件
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FileWriteTool extends BaseTool{

    private static final int MAX_CONTENT_SIZE_BYTES = 1024 * 1024;

    private final ProjectPathResolver projectPathResolver;

    @Tool("写入文件到指定路径")
    public String writeFile(
            @P("文件的相对路径")
            String relativeFilePath,
            @P("要写入文件的内容")
            String content,
            @ToolMemoryId Long appId
    ) {
        try {
            if (content == null || content.getBytes(StandardCharsets.UTF_8).length > MAX_CONTENT_SIZE_BYTES) {
                return "错误：文件内容超过 1 MB";
            }
            Path path = projectPathResolver.resolveWritableFile(appId, relativeFilePath);
            // 写入文件内容
            Files.write(path, content.getBytes(StandardCharsets.UTF_8),
                    StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING);
            log.info("成功写入项目文件: {}", relativeFilePath);
            // 注意要返回相对路径，不能让 AI 把文件绝对路径返回给用户
            return "文件写入成功: " + relativeFilePath;
        } catch (IllegalArgumentException e) {
            log.warn("拒绝写入项目外文件: {}", relativeFilePath);
            return "错误：文件路径不合法 - " + relativeFilePath;
        } catch (IOException e) {
            log.error("写入项目文件失败: {}", relativeFilePath, e);
            return "错误：文件写入失败 - " + relativeFilePath;
        }
    }

    @Override
    public String getToolName() {
        return "writeFile";
    }

    @Override
    public String getDisplayName() {
        return "写入文件";
    }

    @Override
    public String generateToolExecutedResult(JSONObject arguments) {
        String relativeFilePath = arguments.getStr("relativeFilePath");
        String content = arguments.getStr("content");
        int contentLength = content == null ? 0 : content.length();
        // 工具调用参数内含完整源码。历史记录只保留路径和大小，防止下一轮把源码再次回灌给模型。
        return String.format("[工具调用] %s %s（%d 字符）", getDisplayName(), relativeFilePath, contentLength);
    }
}
