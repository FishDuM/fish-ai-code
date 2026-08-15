package hk.ljx.fishaicode.controller;

import hk.ljx.fishaicode.constant.AppConstant;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.model.entity.App;
import hk.ljx.fishaicode.model.entity.User;
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

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class StaticResourceControllerTest {

    private final AppService appService = mock(AppService.class);
    private final UserService userService = mock(UserService.class);
    private final PreviewTokenController tokenController = new PreviewTokenController(appService, userService);
    private final StaticResourceController controller = new StaticResourceController(appService, userService, tokenController);
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
        // 手动 new 不走 Spring，@Value 不生效：反射注入与默认配置一致的 secret
        Field secretField = PreviewTokenController.class.getDeclaredField("previewTokenSecret");
        secretField.setAccessible(true);
        secretField.set(tokenController, "fish-ai-code-preview-secret-dev");
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
        assertEquals("console.log('preview');", response.getBody().getContentAsString(StandardCharsets.UTF_8));
        assertEquals("default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https:; "
                        + "img-src 'self' https: data: blob:; font-src 'self' data: https:; connect-src 'self'; "
                        + "media-src 'self'; object-src 'none'; worker-src 'none'; base-uri 'none'; "
                        + "form-action 'none'; frame-ancestors 'self'",
                response.getHeaders().getFirst("Content-Security-Policy"));
    }

    @Test
    void servesVuePreviewFromDistDirectory() throws Exception {
        ResponseEntity<Resource> response = serve(vuePreviewKey, "/index.html");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("<h1>vue preview</h1>", response.getBody().getContentAsString(StandardCharsets.UTF_8));
        assertEquals("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https:; "
                        + "img-src 'self' https: data: blob:; font-src 'self' data: https:; connect-src 'self'; "
                        + "media-src 'self'; object-src 'none'; worker-src 'none'; base-uri 'none'; "
                        + "form-action 'none'; frame-ancestors 'self'",
                response.getHeaders().getFirst("Content-Security-Policy"));
    }

    @Test
    void usesConfiguredPreviewConnectWhitelist() throws Exception {
        Field connectSrcField = StaticResourceController.class.getDeclaredField("previewConnectSrc");
        connectSrcField.setAccessible(true);
        connectSrcField.set(controller, "'self' https://api.example.com http://localhost:3001");

        ResponseEntity<Resource> response = serve(htmlPreviewKey, "/index.html");

        String policy = response.getHeaders().getFirst("Content-Security-Policy");
        assertTrue(policy.contains("connect-src 'self' https://api.example.com http://localhost:3001"));
    }

    @Test
    void rejectsBroadPreviewConnectWhitelist() throws Exception {
        Field connectSrcField = StaticResourceController.class.getDeclaredField("previewConnectSrc");
        connectSrcField.setAccessible(true);
        connectSrcField.set(controller, "'self' https:");

        ResponseEntity<Resource> response = serve(htmlPreviewKey, "/index.html");

        String policy = response.getHeaders().getFirst("Content-Security-Policy");
        assertTrue(policy.contains("connect-src 'self';"));
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

    @Test
    void servesWithValidPreviewTokenWithoutCookie() throws Exception {
        // 无 cookie 时，有效 previewToken 应放行（iframe 沙箱场景）
        when(appService.getPublicAppById(any(), any()))
                .thenThrow(new BusinessException(ErrorCode.NO_AUTH_ERROR, "没有权限访问该应用"));
        String token = issueTokenForTest(htmlPreviewKey, System.currentTimeMillis() + 60_000);

        ResponseEntity<Resource> response = serve(htmlPreviewKey, "/index.html", token);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("<h1>preview</h1>", response.getBody().getContentAsString(StandardCharsets.UTF_8));
    }

    @Test
    void rejectsExpiredPreviewToken() {
        when(appService.getPublicAppById(any(), any()))
                .thenThrow(new BusinessException(ErrorCode.NO_AUTH_ERROR, "没有权限访问该应用"));
        String token = issueTokenForTest(htmlPreviewKey, System.currentTimeMillis() - 1000);

        ResponseEntity<Resource> response = serve(htmlPreviewKey, "/index.html", token);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertFalse(response.hasBody());
    }

    @Test
    void rejectsTamperedPreviewToken() {
        when(appService.getPublicAppById(any(), any()))
                .thenThrow(new BusinessException(ErrorCode.NO_AUTH_ERROR, "没有权限访问该应用"));
        String token = issueTokenForTest(htmlPreviewKey, System.currentTimeMillis() + 60_000);
        String tampered = token.substring(0, token.length() - 1) + (token.endsWith("A") ? "B" : "A");

        ResponseEntity<Resource> response = serve(htmlPreviewKey, "/index.html", tampered);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertFalse(response.hasBody());
    }

    @Test
    void rejectsTokenBoundToAnotherPreviewKey() {
        when(appService.getPublicAppById(any(), any()))
                .thenThrow(new BusinessException(ErrorCode.NO_AUTH_ERROR, "没有权限访问该应用"));
        String token = issueTokenForTest(vuePreviewKey, System.currentTimeMillis() + 60_000);

        // 用 html 的 key 访问，但 token 是 vue 的：签名不匹配 → 拒绝
        ResponseEntity<Resource> response = serve(htmlPreviewKey, "/index.html", token);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertFalse(response.hasBody());
    }

    @Test
    void servesVueAssetsWithPathToken() throws Exception {
        // Vue 子资源：token 在 path 首段（相对路径继承），应放行
        Files.createDirectories(vuePreviewRoot.resolve("dist").resolve("assets"));
        Files.writeString(vuePreviewRoot.resolve("dist").resolve("assets").resolve("app.js"), "console.log('vue app')");
        when(appService.getPublicAppById(any(), any()))
                .thenThrow(new BusinessException(ErrorCode.NO_AUTH_ERROR, "没有权限访问该应用"));
        String token = issueTokenForTest(vuePreviewKey, System.currentTimeMillis() + 60_000);
        try {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/static/" + vuePreviewKey + "/" + token + "/assets/app.js");
            request.setAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE, "/static/" + vuePreviewKey + "/" + token + "/assets/app.js");

            ResponseEntity<Resource> response = controller.serveStaticResource(vuePreviewKey, null, false, request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("console.log('vue app')",
                    response.getBody().getContentAsString(StandardCharsets.UTF_8));
        } finally {
            Files.deleteIfExists(vuePreviewRoot.resolve("dist").resolve("assets").resolve("app.js"));
            Files.deleteIfExists(vuePreviewRoot.resolve("dist").resolve("assets"));
        }
    }

    @Test
    void servesVueIndexWithTrailingTokenSlash() throws Exception {
        // Vue 目录访问 /{token}/：应返回 dist/index.html（相对子资源基准正确）
        when(appService.getPublicAppById(any(), any()))
                .thenThrow(new BusinessException(ErrorCode.NO_AUTH_ERROR, "没有权限访问该应用"));
        String token = issueTokenForTest(vuePreviewKey, System.currentTimeMillis() + 60_000);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/static/" + vuePreviewKey + "/" + token + "/");
        request.setAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE, "/static/" + vuePreviewKey + "/" + token + "/");

        ResponseEntity<Resource> response = controller.serveStaticResource(vuePreviewKey, null, false, request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("<h1>vue preview</h1>",
                response.getBody().getContentAsString(StandardCharsets.UTF_8));
    }

    @Test
    void verifyRejectsTokenWhenSecretNotConfigured() throws Exception {
        // secret 未配置（置空）时：验签不抛 NPE；无权限场景应返回 404 而非 500
        Field secretField = PreviewTokenController.class.getDeclaredField("previewTokenSecret");
        secretField.setAccessible(true);
        Object original = secretField.get(tokenController);
        secretField.set(tokenController, "");
        try {
            // 非精选且非本人：cookie 鉴权也失败 → 应 404（而不是 500 NPE）
            when(appService.getPublicAppById(any(), any()))
                    .thenThrow(new BusinessException(ErrorCode.NO_AUTH_ERROR, "没有权限访问该应用"));
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/static/" + htmlPreviewKey + "/index.html");
            request.setAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE, "/static/" + htmlPreviewKey + "/index.html");

            ResponseEntity<Resource> response = controller.serveStaticResource(htmlPreviewKey, "fake.token.abc", false, request);

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        } finally {
            secretField.set(tokenController, original);
        }
    }

    private String issueTokenForTest(String previewKey, long expiresAt) {
        // 复用 token controller 的签名逻辑（同 secret 默认值），保证测试与实现一致
        return tokenController.signPreviewTokenForTest(previewKey, expiresAt);
    }

    @Test
    void listsVueSourceFiles() throws Exception {
        // 建一个 Vue 源码树：含应包含的 .vue/.js 与应排除的 node_modules、dist、图片
        Path src = vuePreviewRoot.resolve("src");
        Files.createDirectories(src.resolve("components"));
        Files.createDirectories(src.resolve("node_modules").resolve("pkg"));
        Files.createDirectories(src.resolve("dist"));
        Files.writeString(src.resolve("App.vue"), "<template>app</template>");
        Files.writeString(src.resolve("components").resolve("Nav.vue"), "<template>nav</template>");
        Files.writeString(src.resolve("main.js"), "console.log('main')");
        Files.writeString(src.resolve("node_modules").resolve("pkg").resolve("index.js"), "should be ignored");
        Files.writeString(src.resolve("dist").resolve("index.html"), "should be ignored");
        Files.writeString(src.resolve("logo.png"), "should be ignored");
        try {
            User loginUser = User.builder().id(Long.parseLong(testId)).build();
            when(userService.getLoginUserOrNull(any())).thenReturn(loginUser);
            when(appService.getAppWithPermission(Long.parseLong(testId), loginUser))
                    .thenReturn(App.builder().id(Long.parseLong(testId)).userId(Long.parseLong(testId)).build());
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/static/" + vuePreviewKey + "/__list__");
            request.setAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE, "/static/" + vuePreviewKey + "/__list__");

            @SuppressWarnings("unchecked")
            ResponseEntity<Object> response = controller.listProjectFiles(vuePreviewKey, request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            @SuppressWarnings("unchecked")
            List<Map<String, String>> files = (List<Map<String, String>>) response.getBody();
            assertEquals(3, files.size());
            // 深度优先：App.vue(深度1, 字母序在 main.js 前)，main.js(深度1)，components/Nav.vue(深度2)
            assertEquals("App.vue", files.get(0).get("path"));
            assertEquals("main.js", files.get(1).get("path"));
            assertEquals("components/Nav.vue", files.get(2).get("path"));
            assertEquals("<template>app</template>", files.get(0).get("content"));
        } finally {
            deleteRecursivelyForTest(src);
        }
    }

    @Test
    void rejectsListWithoutPermission() throws Exception {
        when(appService.getPublicAppById(any(), any()))
                .thenThrow(new BusinessException(ErrorCode.NO_AUTH_ERROR, "没有权限访问该应用"));
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/static/" + vuePreviewKey + "/__list__");
        request.setAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE, "/static/" + vuePreviewKey + "/__list__");

        ResponseEntity<Object> response = controller.listProjectFiles(vuePreviewKey, request);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    private void deleteRecursivelyForTest(Path root) throws Exception {
        if (!Files.exists(root)) return;
        try (Stream<Path> stream = Files.walk(root)) {
            stream.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (Exception ignored) {
                }
            });
        }
    }

    private ResponseEntity<Resource> serve(String previewKey, String resourcePath) {
        return serve(previewKey, resourcePath, null);
    }

    private ResponseEntity<Resource> serve(String previewKey, String resourcePath, String previewToken) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/static/" + previewKey + resourcePath);
        request.setAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE, "/static/" + previewKey + resourcePath);
        return controller.serveStaticResource(previewKey, previewToken, false, request);
    }
}
