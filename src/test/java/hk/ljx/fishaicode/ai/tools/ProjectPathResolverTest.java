package hk.ljx.fishaicode.ai.tools;

import hk.ljx.fishaicode.constant.AppConstant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.FileSystemException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.ThreadLocalRandom;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProjectPathResolverTest {

    private final ProjectPathResolver projectPathResolver = new ProjectPathResolver();
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
        Files.deleteIfExists(projectRoot.resolve("src/App.vue"));
        Files.deleteIfExists(projectRoot.resolve("src"));
        Files.deleteIfExists(projectRoot.resolve("outside-link.txt"));
        Files.deleteIfExists(projectRoot);
        Files.deleteIfExists(outsideFile);
    }

    @Test
    void resolvesWritableAndExistingFileInsideProject() throws IOException {
        Path writableFile = projectPathResolver.resolveWritableFile(appId, "src/App.vue");
        Files.writeString(writableFile, "<template />");

        Path existingFile = projectPathResolver.resolveExistingFile(appId, "src/App.vue");

        assertTrue(existingFile.startsWith(projectRoot.toRealPath()));
        assertEquals("<template />", Files.readString(existingFile));
    }

    @Test
    void rejectsAbsoluteAndTraversalPaths() {
        assertThrows(IllegalArgumentException.class,
                () -> projectPathResolver.resolveWritableFile(appId, outsideFile.toString()));
        assertThrows(IllegalArgumentException.class,
                () -> projectPathResolver.resolveWritableFile(appId, "../" + outsideFile.getFileName()));
        assertTrue(Files.exists(outsideFile));
    }

    @Test
    void rejectsSymbolicLinkThatEscapesProjectRoot() throws IOException {
        Path link = projectRoot.resolve("outside-link.txt");
        try {
            Files.createSymbolicLink(link, outsideFile);
        } catch (UnsupportedOperationException | FileSystemException e) {
            Assumptions.abort("当前文件系统不支持创建符号链接");
        }

        assertThrows(IllegalArgumentException.class,
                () -> projectPathResolver.resolveExistingFile(appId, "outside-link.txt"));
        assertFalse(Files.isRegularFile(link, java.nio.file.LinkOption.NOFOLLOW_LINKS));
    }
}
