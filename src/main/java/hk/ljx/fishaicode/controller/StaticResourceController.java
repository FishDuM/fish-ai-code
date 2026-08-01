package hk.ljx.fishaicode.controller;

import cn.hutool.crypto.digest.HMac;
import cn.hutool.crypto.digest.HmacAlgorithm;
import hk.ljx.fishaicode.constant.AppConstant;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.model.enums.CodeGenTypeEnum;
import hk.ljx.fishaicode.model.entity.User;
import hk.ljx.fishaicode.service.AppService;
import hk.ljx.fishaicode.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.HandlerMapping;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/static")
public class StaticResourceController {

    private static final Pattern PREVIEW_KEY_PATTERN = Pattern.compile("^(html|multi_file|vue_project)_([1-9]\\d*)$");

    /** 预览 token 有效期：15 分钟 */
    private static final long TOKEN_TTL_MS = 15 * 60 * 1000L;

    private final AppService appService;
    private final UserService userService;

    /** 预览 token 签名密钥，生产用环境变量 app.preview-token-secret 覆盖 */
    @Value("${app.preview-token-secret:fish-ai-code-preview-secret-dev}")
    private String previewTokenSecret;

    public StaticResourceController(AppService appService, UserService userService) {
        this.appService = appService;
        this.userService = userService;
    }

    /**
     * 签发预览访问 token（无状态 HMAC 签名）。
     * 预览 iframe 无法带 cookie（sandbox 无 allow-same-origin），静态资源改用短时 token 鉴权。
     *
     * @return { token, expiresIn }
     */
    @GetMapping("/preview-token/{previewKey}")
    public Map<String, Object> issuePreviewToken(
            @PathVariable String previewKey,
            HttpServletRequest request) {
        Matcher matcher = previewKey == null ? null : PREVIEW_KEY_PATTERN.matcher(previewKey);
        if (matcher == null || !matcher.matches()) {
            throw new BusinessException(ErrorCode.NOT_FOUND_ERROR, "预览资源不存在");
        }
        Long appId = Long.parseLong(matcher.group(2));
        User loginUser = userService.getLoginUserOrNull(request);
        try {
            appService.getPublicAppById(appId, loginUser);
        } catch (BusinessException e) {
            throw new BusinessException(ErrorCode.NOT_FOUND_ERROR, "预览资源不存在");
        }

        long expiresAt = System.currentTimeMillis() + TOKEN_TTL_MS;
        String token = signPreviewToken(previewKey, expiresAt);
        Map<String, Object> result = new HashMap<>();
        result.put("token", token);
        result.put("expiresIn", TOKEN_TTL_MS / 1000);
        return result;
    }

    String signPreviewTokenForTest(String previewKey, long expiresAt) {
        return signPreviewToken(previewKey, expiresAt);
    }

    private String signPreviewToken(String previewKey, long expiresAt) {
        String payload = previewKey + "." + expiresAt;
        HMac hmac = new HMac(HmacAlgorithm.HmacSHA256, previewTokenSecret.getBytes(StandardCharsets.UTF_8));
        String sig = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(hmac.digest(payload));
        return payload + "." + sig;
    }

    private boolean verifyPreviewToken(String previewKey, String token) {
        if (token == null || token.isBlank()) {
            return false;
        }
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return false;
        }
        // token 必须绑定请求的 previewKey：防止"持有 A 应用的 token 读 B 应用资源"
        if (!parts[0].equals(previewKey)) {
            return false;
        }
        long expiresAt;
        try {
            expiresAt = Long.parseLong(parts[1]);
            if (System.currentTimeMillis() > expiresAt) {
                return false;
            }
        } catch (NumberFormatException e) {
            return false;
        }
        String expected = signPreviewToken(parts[0], expiresAt);
        return expected.equals(token);
    }

    /** 源码清单忽略的目录与文件扩展名（与前端 vite 插件保持一致） */
    private static final java.util.Set<String> IGNORED_DIRS = java.util.Set.of(
            "node_modules", "dist", ".git", ".vscode");
    private static final java.util.Set<String> SOURCE_FILE_EXTS = java.util.Set.of(
            ".vue", ".js", ".ts", ".jsx", ".tsx", ".json", ".html", ".css",
            ".scss", ".less", ".md", ".txt", ".env", ".gitignore");

    /**
     * 返回 Vue 项目源码文件清单（供前端"代码"tab 文件树使用）。
     * 原 dev-only Vite 插件在生产无路由，这里在静态资源接口下提供等价能力，鉴权复用 previewToken/cookie。
     *
     * @return [{ path, content }, ...]，按目录优先、字母序排列
     */
    @GetMapping("/{previewKey}/__list__")
    public ResponseEntity<Object> listProjectFiles(
            @PathVariable String previewKey,
            @RequestParam(value = "previewToken", required = false) String previewToken,
            HttpServletRequest request) {
        Matcher matcher = previewKey == null ? null : PREVIEW_KEY_PATTERN.matcher(previewKey);
        if (matcher == null || !matcher.matches()) {
            return ResponseEntity.notFound().build();
        }
        if (!isAuthorized(previewKey, previewToken, request)) {
            return ResponseEntity.notFound().build();
        }
        Path projectRoot = Paths.get(AppConstant.CODE_OUTPUT_ROOT_DIR, previewKey)
                .toAbsolutePath()
                .normalize();
        Path sourceRoot = projectRoot.resolve("src").normalize();
        if (!Files.isDirectory(sourceRoot)) {
            return ResponseEntity.ok(java.util.List.of());
        }
        try {
            java.util.List<Map<String, String>> files = new java.util.ArrayList<>();
            walkSourceTree(sourceRoot, sourceRoot, files);
            files.sort(java.util.Comparator
                    .comparingInt((Map<String, String> f) -> f.get("path").split("/").length)
                    .thenComparing(f -> f.get("path")));
            return ResponseEntity.ok()
                    .header("Cache-Control", "no-store")
                    .body(files);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    private void walkSourceTree(Path sourceRoot, Path dir, java.util.List<Map<String, String>> out) throws Exception {
        try (java.util.stream.Stream<Path> stream = Files.list(dir)) {
            for (Path entry : (Iterable<Path>) stream::iterator) {
                String name = entry.getFileName().toString();
                if (IGNORED_DIRS.contains(name)) {
                    continue;
                }
                if (Files.isDirectory(entry, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
                    walkSourceTree(sourceRoot, entry, out);
                } else if (Files.isRegularFile(entry, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
                    String fileName = entry.getFileName().toString();
                    String ext = fileName.contains(".")
                            ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase()
                            : "";
                    if (!SOURCE_FILE_EXTS.contains(ext) && !fileName.startsWith(".")) {
                        continue;
                    }
                    String rel = sourceRoot.relativize(entry).toString().replace('\\', '/');
                    Map<String, String> item = new HashMap<>();
                    item.put("path", rel);
                    item.put("content", Files.readString(entry, StandardCharsets.UTF_8));
                    out.add(item);
                }
            }
        }
    }

    private boolean isAuthorized(String previewKey, String previewToken, HttpServletRequest request) {
        if (verifyPreviewToken(previewKey, previewToken)) {
            return true;
        }
        Matcher matcher = PREVIEW_KEY_PATTERN.matcher(previewKey);
        if (!matcher.matches()) {
            return false;
        }
        Long appId = Long.parseLong(matcher.group(2));
        User loginUser = userService.getLoginUserOrNull(request);
        try {
            appService.getPublicAppById(appId, loginUser);
            return true;
        } catch (BusinessException e) {
            return false;
        }
    }

    /**
     * 提供生成代码的预览资源访问，支持目录重定向。
     * 部署后的资源由 Nginx 从部署目录提供。
     *
     * <p>token 放在 URL path 首段（如 /static/{previewKey}/{token}/assets/a.js），
     * 这样 HTML 里的相对子资源请求会自动继承 token，无需在每处拼 query。</p>
     */
    @GetMapping("/{previewKey}/**")
    public ResponseEntity<Resource> serveStaticResource(
            @PathVariable String previewKey,
            @RequestParam(value = "previewToken", required = false) String previewToken,
            HttpServletRequest request) {
        try {
            Matcher matcher = previewKey == null ? null : PREVIEW_KEY_PATTERN.matcher(previewKey);
            if (matcher == null || !matcher.matches()) {
                return ResponseEntity.notFound().build();
            }
            Long appId = Long.parseLong(matcher.group(2));

            // 从 path 中解析 token：/static/{previewKey}/{token}/... 或 /static/{previewKey}/...
            String resourcePath = (String) request.getAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE);
            String requestPrefix = "/static/" + previewKey;
            if (resourcePath == null || !resourcePath.startsWith(requestPrefix)) {
                return ResponseEntity.notFound().build();
            }
            resourcePath = resourcePath.substring(requestPrefix.length()); // 形如 "/token/assets/a.js" 或 "/" 或 ""
            String pathToken = null;
            if (!resourcePath.isEmpty() && !resourcePath.equals("/")) {
                // 统一去掉前导 /，便于定位 token 段（token 一定紧跟 previewKey 之后）
                String rest = resourcePath.startsWith("/") ? resourcePath.substring(1) : resourcePath;
                String firstSegment = rest.contains("/")
                        ? rest.substring(0, rest.indexOf('/'))
                        : rest;
                if (verifyPreviewToken(previewKey, firstSegment)) {
                    pathToken = firstSegment;
                    // rest.substring 可能是 ""（token 结尾）、"/"（token 后跟目录斜杠）或 "/assets/a.js"
                    String afterToken = rest.substring(firstSegment.length());
                    resourcePath = afterToken.isEmpty()
                            ? "/"
                            : afterToken.startsWith("/") ? afterToken : "/" + afterToken;
                }
            }

            // 鉴权：path token → query token → session cookie，任一通过即可
            boolean authorized = pathToken != null || verifyPreviewToken(previewKey, previewToken);
            if (!authorized) {
                // 应用不存在与无权限统一返回 404，避免向攻击者泄露应用是否存在。
                User loginUser = userService.getLoginUserOrNull(request);
                try {
                    appService.getPublicAppById(appId, loginUser);
                } catch (BusinessException e) {
                    return ResponseEntity.notFound().build();
                }
            }

            // 目录访问（无尾斜杠）：重定向到带斜杠的 URL，保证相对子资源基准正确
            if (resourcePath.isEmpty()) {
                HttpHeaders headers = new HttpHeaders();
                headers.add("Location", request.getRequestURI() + "/");
                return new ResponseEntity<>(headers, HttpStatus.MOVED_PERMANENTLY);
            }
            // 目录根（/ 或 /{token}/）：返回 index.html
            if (resourcePath.equals("/")) {
                resourcePath = "/index.html";
            }
            // 预览根目录仅由合法的 previewKey 决定，用户路径只能作为相对路径拼接。
            Path previewRoot = Paths.get(AppConstant.CODE_OUTPUT_ROOT_DIR, previewKey)
                    .toAbsolutePath()
                    .normalize();
            if (previewKey.startsWith(CodeGenTypeEnum.VUE_PROJECT.getValue() + "_")) {
                previewRoot = previewRoot.resolve("dist").normalize();
            }

            String relativeResourcePath = resourcePath.replaceFirst("^/+", "");
            Path targetPath = previewRoot.resolve(relativeResourcePath).normalize();
            if (!targetPath.startsWith(previewRoot) || !Files.isRegularFile(targetPath)) {
                return ResponseEntity.notFound().build();
            }

            // 防止预览目录中的符号链接指向目录外部。
            Path realPreviewRoot = previewRoot.toRealPath();
            Path realTargetPath = targetPath.toRealPath();
            if (!realTargetPath.startsWith(realPreviewRoot)) {
                return ResponseEntity.notFound().build();
            }

            // 返回文件资源
            Resource resource = new FileSystemResource(realTargetPath);
            return ResponseEntity.ok()
                    .header("Content-Type", getContentTypeWithCharset(realTargetPath.toString()))
                    .header("Content-Security-Policy",
                            "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https:; "
                                    + "img-src 'self' https: data: blob:; font-src 'self' data: https:; connect-src 'none'; "
                                    + "media-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'none'; "
                                    + "form-action 'none'; frame-ancestors 'self'")
                    .body(resource);
        } catch (java.nio.file.NoSuchFileException e) {
            // 预览目录或文件不存在（应用未生成/已删除/未构建）：语义是 404，不是服务错误
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * 根据文件扩展名返回带字符编码的 Content-Type
     */
    private String getContentTypeWithCharset(String filePath) {
        if (filePath.endsWith(".html")) return "text/html; charset=UTF-8";
        if (filePath.endsWith(".css")) return "text/css; charset=UTF-8";
        if (filePath.endsWith(".js")) return "application/javascript; charset=UTF-8";
        if (filePath.endsWith(".png")) return "image/png";
        if (filePath.endsWith(".jpg")) return "image/jpeg";
        return "application/octet-stream";
    }
}
