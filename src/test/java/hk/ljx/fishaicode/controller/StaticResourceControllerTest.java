package hk.ljx.fishaicode.controller;

import hk.ljx.fishaicode.constant.AppConstant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.servlet.HandlerMapping;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.ThreadLocalRandom;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class StaticResourceControllerTest {

    private final StaticResourceController controller = new StaticResourceController();
    private final String testId = Long.toString(ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE));
    private final Path outputRoot = Path.of(AppConstant.CODE_OUTPUT_ROOT_DIR);
    private final String htmlPreviewKey = "html_" + testId;
    private final String vuePreviewKey = "vue_project_" + testId;
    private Path htmlPreviewRoot;
    private Path vuePreviewRoot;
    private Path outsideFile;

    @BeforeEach
    void setUp() throws Exception {
        htmlPreviewRoot = outputRoot.resolve(htmlPreviewKey);
        vuePreviewRoot = outputRoot.resolve(vuePreviewKey);
        outsideFile = outputRoot.resolve("outside_" + testId + ".txt");

        Files.createDirectories(htmlPreviewRoot.resolve("assets"));
        Files.writeString(htmlPreviewRoot.resolve("index.html"), "<h1>preview</h1>");
        Files.writeString(htmlPreviewRoot.resolve("assets/app.js"), "console.log('preview');");
        Files.writeString(outsideFile, "must not be served");

        Files.createDirectories(vuePreviewRoot.resolve("dist"));
        Files.writeString(vuePreviewRoot.resolve("dist/index.html"), "<h1>vue preview</h1>");
    }

    @AfterEach
    void tearDown() throws Exception {
        Files.deleteIfExists(htmlPreviewRoot.resolve("assets/app.js"));
        Files.deleteIfExists(htmlPreviewRoot.resolve("assets"));
        Files.deleteIfExists(htmlPreviewRoot.resolve("index.html"));
        Files.deleteIfExists(htmlPreviewRoot);
        Files.deleteIfExists(vuePreviewRoot.resolve("dist/index.html"));
        Files.deleteIfExists(vuePreviewRoot.resolve("dist"));
        Files.deleteIfExists(vuePreviewRoot);
        Files.deleteIfExists(outsideFile);
    }

    @Test
    void servesPreviewFileWithinRoot() throws Exception {
        ResponseEntity<Resource> response = serve(htmlPreviewKey, "/assets/app.js");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("console.log('preview');", response.getBody().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    @Test
    void servesVuePreviewFromDistDirectory() throws Exception {
        ResponseEntity<Resource> response = serve(vuePreviewKey, "/index.html");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("<h1>vue preview</h1>", response.getBody().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    @Test
    void rejectsPathTraversal() {
        ResponseEntity<Resource> response = serve(htmlPreviewKey, "/../" + outsideFile.getFileName());

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertFalse(response.hasBody());
    }

    @Test
    void rejectsMalformedPreviewKey() {
        ResponseEntity<Resource> response = serve("html_" + testId + "_extra", "/index.html");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertFalse(response.hasBody());
    }

    private ResponseEntity<Resource> serve(String previewKey, String resourcePath) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/static/" + previewKey + resourcePath);
        request.setAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE, "/static/" + previewKey + resourcePath);
        return controller.serveStaticResource(previewKey, request);
    }
}
