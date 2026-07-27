package hk.ljx.fishaicode.ai.tools;

import hk.ljx.fishaicode.constant.AppConstant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.ThreadLocalRandom;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FileToolsSecurityTest {

    private final ProjectPathResolver projectPathResolver = new ProjectPathResolver();
    private final FileReadTool fileReadTool = new FileReadTool();
    private final FileWriteTool fileWriteTool = new FileWriteTool();
    private final FileModifyTool fileModifyTool = new FileModifyTool();
    private final FileDeleteTool fileDeleteTool = new FileDeleteTool();
    private final FileDirReadTool fileDirReadTool = new FileDirReadTool();
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
        for (Object tool : new Object[]{fileReadTool, fileWriteTool, fileModifyTool, fileDeleteTool, fileDirReadTool}) {
            ReflectionTestUtils.setField(tool, "projectPathResolver", projectPathResolver);
        }
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
        assertTrue(fileDirReadTool.readDir("", appId).contains("src/Component.vue"));
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
}
