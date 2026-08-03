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
import java.nio.file.StandardOpenOption;
import java.nio.charset.StandardCharsets;

/**
 * 文件修改工具
 * 支持 AI 通过工具调用的方式修改文件内容
 */
@Slf4j
@Component
public class FileModifyTool extends BaseTool {

    private static final long MAX_FILE_SIZE_BYTES = 1024 * 1024;

    @Resource
    private ProjectPathResolver projectPathResolver;

    @Tool("修改文件内容，用新内容替换指定的旧内容")
    public String modifyFile(
            @P("文件的相对路径")
            String relativeFilePath,
            @P("要替换的旧内容")
            String oldContent,
            @P("替换后的新内容")
            String newContent,
            @ToolMemoryId Long appId
    ) {
        try {
            if (oldContent == null || newContent == null || newContent.getBytes(StandardCharsets.UTF_8).length > MAX_FILE_SIZE_BYTES) {
                return "错误：替换内容不合法或超过 1 MB";
            }
            Path path = projectPathResolver.resolveExistingFile(appId, relativeFilePath);
            if (Files.size(path) > MAX_FILE_SIZE_BYTES) {
                return "错误：文件过大，无法修改 - " + relativeFilePath;
            }
            String originalContent = Files.readString(path);
            if (!originalContent.contains(oldContent)) {
                return "警告：文件中未找到要替换的内容，文件未修改 - " + relativeFilePath;
            }
            String modifiedContent = originalContent.replace(oldContent, newContent);
            if (modifiedContent.getBytes(StandardCharsets.UTF_8).length > MAX_FILE_SIZE_BYTES) {
                return "错误：修改后的文件超过 1 MB - " + relativeFilePath;
            }
            if (originalContent.equals(modifiedContent)) {
                return "信息：替换后文件内容未发生变化 - " + relativeFilePath;
            }
            Files.writeString(path, modifiedContent, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            log.info("成功修改项目文件: {}", relativeFilePath);
            return "文件修改成功: " + relativeFilePath;
        } catch (IllegalArgumentException e) {
            log.warn("拒绝修改项目外文件: {}", relativeFilePath);
            return "错误：文件路径不合法 - " + relativeFilePath;
        } catch (IOException e) {
            log.error("修改项目文件失败: {}", relativeFilePath, e);
            return "错误：文件不存在、不可修改或过大 - " + relativeFilePath;
        }
    }

    @Override
    public String getToolName() {
        return "modifyFile";
    }

    @Override
    public String getDisplayName() {
        return "修改文件";
    }

    @Override
    public String generateToolExecutedResult(JSONObject arguments) {
        String relativeFilePath = arguments.getStr("relativeFilePath");
        // oldContent/newContent 可能是整段源码，不能写入聊天历史或后续模型上下文。
        return String.format("[工具调用] %s %s", getDisplayName(), relativeFilePath);
    }
}
