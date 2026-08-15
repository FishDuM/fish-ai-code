package hk.ljx.fishaicode.service;

import hk.ljx.fishaicode.constant.AppConstant;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.model.vo.PreviewSessionVO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.concurrent.ThreadLocalRandom;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PreviewSessionServiceTest {

    private final PreviewTokenService tokenService = new PreviewTokenService("test-secret");
    private final PreviewSessionService sessionService = new PreviewSessionService(
            tokenService, "https://preview.example.com///");
    private final String suffix = Long.toString(ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE));
    private final Path outputRoot = Path.of(AppConstant.CODE_OUTPUT_ROOT_DIR);

    @AfterEach
    void tearDown() throws IOException {
        deleteRecursively(outputRoot.resolve("multi_file_" + suffix));
        deleteRecursively(outputRoot.resolve("vue_project_" + suffix));
    }

    @Test
    void createPreviewSession_acceptsMultiFileOutputDirectory() throws IOException {
        Path root = outputRoot.resolve("multi_file_" + suffix);
        Files.createDirectories(root);
        Files.writeString(root.resolve("index.html"), "<h1>preview</h1>");

        PreviewSessionVO session = sessionService.createPreviewSession("multi_file_" + suffix);

        assertTrue(session.getPreviewUrl().startsWith("https://preview.example.com/api/static/multi_file_"));
        assertEquals(900, session.getExpiresIn());
    }

    @Test
    void createPreviewSession_usesVueDistDirectory() throws IOException {
        Path dist = outputRoot.resolve("vue_project_" + suffix).resolve("dist");
        Files.createDirectories(dist);
        Files.writeString(dist.resolve("index.html"), "<h1>vue preview</h1>");

        PreviewSessionVO session = sessionService.createPreviewSession("vue_project_" + suffix);

        assertTrue(session.getPreviewUrl().contains("/api/static/vue_project_" + suffix + "/"));
        assertEquals(900, session.getExpiresIn());
    }

    @Test
    void createPreviewSession_rejectsMissingOutputDirectory() {
        BusinessException exception = assertThrows(BusinessException.class,
                () -> sessionService.createPreviewSession("html_" + suffix));

        assertEquals(ErrorCode.NOT_FOUND_ERROR.getCode(), exception.getCode());
        assertEquals("尚未生成代码", exception.getMessage());
    }

    @Test
    void createPreviewSession_rejectsNonEmptyDirectoryWithoutIndexHtml() throws IOException {
        Path root = outputRoot.resolve("multi_file_" + suffix);
        Files.createDirectories(root);
        Files.writeString(root.resolve("assets.js"), "console.log('asset');");

        BusinessException exception = assertThrows(BusinessException.class,
                () -> sessionService.createPreviewSession("multi_file_" + suffix));

        assertEquals(ErrorCode.NOT_FOUND_ERROR.getCode(), exception.getCode());
        assertEquals("尚未生成代码", exception.getMessage());
    }

    @Test
    void createPreviewSession_rejectsInvalidPreviewKey() {
        BusinessException exception = assertThrows(BusinessException.class,
                () -> sessionService.createPreviewSession("html_invalid"));

        assertEquals(ErrorCode.NOT_FOUND_ERROR.getCode(), exception.getCode());
        assertEquals("预览资源不存在", exception.getMessage());
    }

    @Test
    void createPreviewSession_rejectsMissingSecret() {
        PreviewSessionService serviceWithoutSecret = new PreviewSessionService(
                new PreviewTokenService(""), "https://preview.example.com");

        BusinessException exception = assertThrows(BusinessException.class,
                () -> serviceWithoutSecret.createPreviewSession("html_1"));

        assertEquals(ErrorCode.SYSTEM_ERROR.getCode(), exception.getCode());
        assertEquals("预览服务未配置签名密钥", exception.getMessage());
    }

    private void deleteRecursively(Path root) throws IOException {
        if (!Files.exists(root)) {
            return;
        }
        try (var paths = Files.walk(root)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            });
        }
    }
}
