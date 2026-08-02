package hk.ljx.fishaicode.controller;

import hk.ljx.fishaicode.constant.AppConstant;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.model.enums.CodeGenTypeEnum;
import hk.ljx.fishaicode.model.entity.User;
import hk.ljx.fishaicode.service.AppService;
import hk.ljx.fishaicode.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
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
import lombok.extern.slf4j.Slf4j;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.stream.Stream;

/**
 * 提供生成代码的预览资源访问（含 Vue 项目源码文件清单）。
 * 鉴权支持 previewToken（无 cookie 的 iframe 场景）或 session cookie 两种方式。
 */
@Slf4j
@RestController
@RequestMapping("/static")
public class StaticResourceController {

    /** 源码清单忽略的目录与文件扩展名（与前端 vite 插件保持一致） */
    private static final Set<String> IGNORED_DIRS = Set.of(
            "node_modules", "dist", ".git", ".vscode");
    private static final Set<String> SOURCE_FILE_EXTS = Set.of(
            ".vue", ".js", ".ts", ".jsx", ".tsx", ".json", ".html", ".css",
            ".scss", ".less", ".md", ".txt", ".env", ".gitignore");

    private final AppService appService;
    private final UserService userService;
    private final PreviewTokenController previewTokenController;

    public StaticResourceController(AppService appService, UserService userService,
                                    PreviewTokenController previewTokenController) {
        this.appService = appService;
        this.userService = userService;
        this.previewTokenController = previewTokenController;
    }

    /**
     * 返回 Vue 项目源码文件清单（供前端"代码"tab 文件树使用）。
     * 原 dev-only Vite 插件在生产无路由，这里在静态资源接口下提供等价能力。
     *
     * @return [{ path, content }, ...]，按目录优先、字母序排列
     */
    @GetMapping("/{previewKey}/__list__")
    public ResponseEntity<Object> listProjectFiles(
            @PathVariable String previewKey,
            @RequestParam(value = "previewToken", required = false) String previewToken,
            HttpServletRequest request) {
        if (!isValidPreviewKey(previewKey) || !isAuthorized(previewKey, previewToken, request)) {
            return ResponseEntity.notFound().build();
        }
        Path sourceRoot = Paths.get(AppConstant.CODE_OUTPUT_ROOT_DIR, previewKey)
                .toAbsolutePath()
                .normalize()
                .resolve("src")
                .normalize();
        if (!Files.isDirectory(sourceRoot)) {
            return ResponseEntity.ok(List.of());
        }
        try {
            List<Map<String, String>> files = new ArrayList<>();
            walkSourceTree(sourceRoot, sourceRoot, files);
            files.sort(Comparator
                    .comparingInt((Map<String, String> f) -> f.get("path").split("/").length)
                    .thenComparing(f -> f.get("path")));
            return ResponseEntity.ok()
                    .header("Cache-Control", "no-store")
                    .body(files);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    private void walkSourceTree(Path sourceRoot, Path dir, List<Map<String, String>> out) throws Exception {
        try (Stream<Path> stream = Files.list(dir)) {
            for (Path entry : (Iterable<Path>) stream::iterator) {
                String name = entry.getFileName().toString();
                if (IGNORED_DIRS.contains(name)) {
                    continue;
                }
                if (Files.isDirectory(entry, LinkOption.NOFOLLOW_LINKS)) {
                    walkSourceTree(sourceRoot, entry, out);
                } else if (Files.isRegularFile(entry, LinkOption.NOFOLLOW_LINKS)) {
                    String fileName = entry.getFileName().toString();
                    // 排除 .env* 等敏感配置文件：源码清单会向有预览权限的人返回完整内容
                    if (fileName.startsWith(".env")) {
                        continue;
                    }
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
            if (!isValidPreviewKey(previewKey)) {
                return ResponseEntity.notFound().build();
            }

            // 从 path 中解析 token：/static/{previewKey}/{token}/... 或 /static/{previewKey}/...
            String resourcePath = (String) request.getAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE);
            String requestPrefix = "/static/" + previewKey;
            if (resourcePath == null || !resourcePath.startsWith(requestPrefix)) {
                return ResponseEntity.notFound().build();
            }
            resourcePath = resourcePath.substring(requestPrefix.length());
            String pathToken = null;
            if (!resourcePath.isEmpty() && !resourcePath.equals("/")) {
                String rest = resourcePath.startsWith("/") ? resourcePath.substring(1) : resourcePath;
                String firstSegment = rest.contains("/")
                        ? rest.substring(0, rest.indexOf('/'))
                        : rest;
                if (previewTokenController.verifyPreviewToken(previewKey, firstSegment)) {
                    pathToken = firstSegment;
                    String afterToken = rest.substring(firstSegment.length());
                    resourcePath = afterToken.isEmpty()
                            ? "/"
                            : afterToken.startsWith("/") ? afterToken : "/" + afterToken;
                }
            }

            // 鉴权：path token 或 query token 或 session cookie，任一通过即可
            boolean authorized = pathToken != null || isAuthorized(previewKey, previewToken, request);
            if (!authorized) {
                return ResponseEntity.notFound().build();
            }

            // 目录访问（无尾斜杠）：重定向到带斜杠的 URL，保证相对子资源基准正确。
            // 保留 query string：query 里可能带 previewToken，getRequestURI() 不含 query 会把它丢掉。
            if (resourcePath.isEmpty()) {
                HttpHeaders headers = new HttpHeaders();
                String query = request.getQueryString();
                headers.add("Location", request.getRequestURI() + "/" + (query == null ? "" : "?" + query));
                return new ResponseEntity<>(headers, HttpStatus.MOVED_PERMANENTLY);
            }
            // 目录根（/ 或 /{token}/）：返回 index.html
            if (resourcePath.equals("/")) {
                resourcePath = "/index.html";
            }
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
            log.error("预览静态资源服务异常 previewKey={}", previewKey, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    private boolean isValidPreviewKey(String previewKey) {
        Matcher matcher = previewKey == null ? null : PreviewTokenController.PREVIEW_KEY_PATTERN.matcher(previewKey);
        return matcher != null && matcher.matches();
    }

    private boolean isAuthorized(String previewKey, String previewToken, HttpServletRequest request) {
        if (previewTokenController.verifyPreviewToken(previewKey, previewToken)) {
            return true;
        }
        Matcher matcher = PreviewTokenController.PREVIEW_KEY_PATTERN.matcher(previewKey);
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
