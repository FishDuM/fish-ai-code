package hk.ljx.fishaicode.ai.tools;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONObject;
import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;
import dev.langchain4j.agent.tool.ToolMemoryId;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * 文件目录读取工具
 * 使用 Hutool 简化文件操作
 */
@Slf4j
@Component
public class FileDirReadTool extends BaseTool {

    private static final int MAX_DEPTH = 8;
    private static final int MAX_FILE_COUNT = 500;
    private static final int MAX_OUTPUT_LENGTH = 40_000;

    @Resource
    private ProjectPathResolver projectPathResolver;

    /**
     * 需要忽略的文件和目录
     */
    private static final Set<String> IGNORED_NAMES = Set.of(
            "node_modules", ".git", "dist", "build", ".DS_Store",
            ".env", "target", ".mvn", ".idea", ".vscode", "coverage"
    );

    /**
     * 需要忽略的文件扩展名
     */
    private static final Set<String> IGNORED_EXTENSIONS = Set.of(
            ".log", ".tmp", ".cache", ".lock"
    );

    @Tool("读取目录结构，获取指定目录下的所有文件和子目录信息")
    public String readDir(
            @P("目录的相对路径，为空则读取整个项目结构")
            String relativeDirPath,
            @ToolMemoryId Long appId
    ) {
        try {
            String requestedPath = StrUtil.blankToDefault(relativeDirPath, ".");
            Path targetDir = projectPathResolver.resolveExistingDirectory(appId, requestedPath);
            List<Path> files = new ArrayList<>();
            Files.walkFileTree(targetDir, Set.of(), MAX_DEPTH, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                    return dir.equals(targetDir) || !shouldIgnore(dir.getFileName().toString())
                            ? FileVisitResult.CONTINUE
                            : FileVisitResult.SKIP_SUBTREE;
                }

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (attrs.isRegularFile() && !shouldIgnore(file.getFileName().toString())) {
                        files.add(file);
                    }
                    return files.size() >= MAX_FILE_COUNT ? FileVisitResult.TERMINATE : FileVisitResult.CONTINUE;
                }
            });

            files.sort(Comparator.comparing(path -> targetDir.relativize(path).toString()));
            StringBuilder structure = new StringBuilder();
            structure.append("项目目录结构:\n");
            for (Path file : files) {
                Path relativeFilePath = targetDir.relativize(file);
                int depth = relativeFilePath.getNameCount() - 1;
                String line = "  ".repeat(Math.max(depth, 0)) + relativeFilePath + "\n";
                if (structure.length() + line.length() > MAX_OUTPUT_LENGTH) {
                    structure.append("... 目录内容过多，已截断\n");
                    break;
                }
                structure.append(line);
            }
            if (files.size() >= MAX_FILE_COUNT) {
                structure.append("... 文件数量超过 ").append(MAX_FILE_COUNT).append("，已截断\n");
            }
            return structure.toString();

        } catch (IllegalArgumentException e) {
            log.warn("拒绝读取项目外目录: {}", relativeDirPath);
            return "错误：目录路径不合法 - " + relativeDirPath;
        } catch (IOException e) {
            log.error("读取项目目录失败: {}", relativeDirPath, e);
            return "错误：目录不存在或无法读取 - " + relativeDirPath;
        }
    }

    /**
     * 判断是否应该忽略该文件或目录
     */
    private boolean shouldIgnore(String fileName) {
        // 检查是否在忽略名称列表中
        if (IGNORED_NAMES.contains(fileName)) {
            return true;
        }

        // 检查文件扩展名
        return IGNORED_EXTENSIONS.stream().anyMatch(fileName::endsWith);
    }

    @Override
    public String getToolName() {
        return "readDir";
    }

    @Override
    public String getDisplayName() {
        return "读取目录";
    }

    @Override
    public String generateToolExecutedResult(JSONObject arguments) {
        String relativeDirPath = arguments.getStr("relativeDirPath");
        if (StrUtil.isEmpty(relativeDirPath)) {
            relativeDirPath = "根目录";
        }
        return String.format("[工具调用] %s %s", getDisplayName(), relativeDirPath);
    }
}
