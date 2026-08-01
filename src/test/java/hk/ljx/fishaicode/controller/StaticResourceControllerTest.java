package hk.ljx.fishaicode.controller;

import hk.ljx.fishaicode.constant.AppConstant;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.model.entity.App;
import hk.ljx.fishaicode.service.AppService;
import hk.ljx.fishaicode.service.UserService;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class StaticResourceControllerTest {

    private final AppService appService = mock(AppService.class);
    private final UserService userService = mock(UserService.class);
    private final StaticResourceController controller = new StaticResourceController(appService, userService);
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

        // 默认：未登录用户访问（精选应用公开可见），权限校验通过
        when(userService.getLoginUserOrNull(any())).thenReturn(null);
        when(appService.getPublicAppById(any(), any()))
                .thenReturn(App.builder().id(Long.parseLong(testId)).build());
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
        assertEquals("default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
                        + "img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'none'; "
                        + "media-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'none'; "
                        + "form-action 'none'; frame-ancestors 'self'",
                response.getHeaders().getFirst("Content-Security-Policy"));
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

    @Test
    void rejectsPrivateAppWithoutPermission() {
        // 非精选应用且非本人/管理员：getPublicAppById 抛 NO_AUTH_ERROR，接口应返回 404（不泄露存在性）
        when(appService.getPublicAppById(any(), any()))
                .thenThrow(new BusinessException(ErrorCode.NO_AUTH_ERROR, "没有权限访问该应用"));

        ResponseEntity<Resource> response = serve(htmlPreviewKey, "/index.html");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertFalse(response.hasBody());
    }

    @Test
    void rejectsNonExistentApp() {
        // 应用不存在：getPublicAppById 抛 NOT_FOUND_ERROR，接口应返回 404
        when(appService.getPublicAppById(any(), any()))
                .thenThrow(new BusinessException(ErrorCode.NOT_FOUND_ERROR, "应用不存在"));

        ResponseEntity<Resource> response = serve(htmlPreviewKey, "/index.html");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertFalse(response.hasBody());
    }

    private ResponseEntity<Resource> serve(String previewKey, String resourcePath) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/static/" + previewKey + resourcePath);
        request.setAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE, "/static/" + previewKey + resourcePath);
        return controller.serveStaticResource(previewKey, request);
    }
}
