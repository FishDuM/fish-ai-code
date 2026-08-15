package hk.ljx.fishaicode.ai.tools;

import hk.ljx.fishaicode.constant.AppConstant;
import cn.hutool.json.JSONUtil;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FileToolsSecurityTest {

    private final ProjectPathResolver projectPathResolver = new ProjectPathResolver();
    private final FileReadTool fileReadTool = new FileReadTool(projectPathResolver);
    private final FileWriteTool fileWriteTool = new FileWriteTool(projectPathResolver);
    private final FileModifyTool fileModifyTool = new FileModifyTool(projectPathResolver);
    private final FileDeleteTool fileDeleteTool = new FileDeleteTool(projectPathResolver);
    private final FileDirReadTool fileDirReadTool = new FileDirReadTool(projectPathResolver);
    private final long appId = ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE);
    private final Path outputRoot = Path.of(AppConstant.CODE_OUTPUT_ROOT_DIR);
    private Path projectRoot;
    private Path outsideFile;

    @BeforeEach
    void setUp() throws IOException {
        projectRoot = outputRoot.resolve("vue_project_" + appId);
        outsideFile = outputRoot.resolve("outside_" + appId + ".txt");
        Files.createDirectories(projectRoot);
        Files.writeString(outsideFile, "outside");
    }

    @AfterEach
    void tearDown() throws IOException {
        Files.deleteIfExists(projectRoot.resolve("src/Component.vue"));
        Files.deleteIfExists(projectRoot.resolve("src"));
        Files.deleteIfExists(projectRoot);
        Files.deleteIfExists(outsideFile);
    }

    @Test
    void toolsCanOperateOnFilesInsideCurrentProject() throws IOException {
        assertEquals("文件写入成功: src/Component.vue",
                fileWriteTool.writeFile("src/Component.vue", "<template>old</template>", appId));
        assertEquals("<template>old</template>", fileReadTool.readFile("src/Component.vue", appId));
        assertEquals("文件修改成功: src/Component.vue",
                fileModifyTool.modifyFile("src/Component.vue", "old", "new", appId));
        // Path.toString() 使用平台分隔符（Windows 为反斜杠），断言需按平台拼接
        assertTrue(fileDirReadTool.readDir("", appId).contains("src" + File.separator + "Component.vue"));
        assertEquals("文件删除成功: src/Component.vue", fileDeleteTool.deleteFile("src/Component.vue", appId));
        assertFalse(Files.exists(projectRoot.resolve("src/Component.vue")));
    }

    @Test
    void toolsRejectPathsOutsideCurrentProject() throws IOException {
        String traversalPath = "../" + outsideFile.getFileName();

        assertTrue(fileReadTool.readFile(traversalPath, appId).contains("路径不合法"));
        assertTrue(fileReadTool.readFile(outsideFile.toString(), appId).contains("路径不合法"));
        assertTrue(fileWriteTool.writeFile(traversalPath, "changed", appId).contains("路径不合法"));
        assertTrue(fileModifyTool.modifyFile(traversalPath, "outside", "changed", appId).contains("路径不合法"));
        assertTrue(fileDeleteTool.deleteFile(traversalPath, appId).contains("路径不合法"));
        assertTrue(fileDirReadTool.readDir("..", appId).contains("路径不合法"));
        assertEquals("outside", Files.readString(outsideFile));
    }

    @Test
    void toolHistorySummariesDoNotContainSourceCode() {
        String source = "<template><main>secret source</main></template>";
        String writeSummary = fileWriteTool.generateToolExecutedResult(JSONUtil.parseObj(Map.of(
                "relativeFilePath", "src/App.vue",
                "content", source
        )));
        String modifySummary = fileModifyTool.generateToolExecutedResult(JSONUtil.parseObj(Map.of(
                "relativeFilePath", "src/App.vue",
                "oldContent", source,
                "newContent", "<template>updated</template>"
        )));

        assertTrue(writeSummary.contains("src/App.vue"));
        assertTrue(writeSummary.contains("字符"));
        assertFalse(writeSummary.contains(source));
        assertTrue(modifySummary.contains("src/App.vue"));
        assertFalse(modifySummary.contains(source));
        assertFalse(modifySummary.contains("updated"));
    }
}
