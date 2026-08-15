package hk.ljx.fishaicode.controller;

import hk.ljx.fishaicode.common.GeneratedPathResolver;
import hk.ljx.fishaicode.common.OriginUtils;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.model.entity.App;
import hk.ljx.fishaicode.model.enums.CodeGenTypeEnum;
import hk.ljx.fishaicode.model.entity.User;
import hk.ljx.fishaicode.service.AppService;
import hk.ljx.fishaicode.service.PreviewTokenService;
import hk.ljx.fishaicode.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.HandlerMapping;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.nio.charset.StandardCharsets;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * 提供生成代码的预览资源访问（含 Vue 项目源码文件清单）。
 * 鉴权支持 previewToken（无 cookie 的 iframe 场景）或 session cookie 两种方式。
 */
@Slf4j
@RestController
@RequestMapping("/static")
@RequiredArgsConstructor
public class StaticResourceController {

    /** 源码清单忽略的目录与文件扩展名（与前端 vite 插件保持一致） */
    private static final Set<String> IGNORED_DIRS = Set.of(
            "node_modules", "dist", ".git", ".vscode");
    private static final Set<String> SOURCE_FILE_EXTS = Set.of(
            ".vue", ".js", ".ts", ".jsx", ".tsx", ".json", ".html", ".css",
            ".scss", ".less", ".md", ".txt", ".env", ".gitignore");
    private static final int MAX_SOURCE_FILE_COUNT = 200;
    private static final long MAX_SOURCE_TOTAL_BYTES = 5L * 1024 * 1024;
    private static final Pattern PREVIEW_CONNECT_SOURCE_PATTERN = Pattern.compile(
            "https://[a-zA-Z0-9.-]+(?::\\d{1,5})?|http://(?:localhost|127\\.0\\.0\\.1)(?::\\d{1,5})?");

    private final AppService appService;
    private final UserService userService;
    private final PreviewTokenService previewTokenService;
    private final GeneratedPathResolver generatedPathResolver;

    @Value("${app.preview-frame-ancestor:}")
    private String previewFrameAncestor;

    @Value("${app.preview-connect-src:'self'}")
    private String previewConnectSrc;

    /**
     * 返回 Vue 项目源码文件清单（供前端"代码"tab 文件树使用）。
     * 原 dev-only Vite 插件在生产无路由，这里在静态资源接口下提供等价能力。
     *
     * @return [{ path, content }, ...]，按目录优先、字母序排列
     */
    @GetMapping("/{previewKey}/__list__")
    public ResponseEntity<Object> listProjectFiles(
            @PathVariable String previewKey,
            HttpServletRequest request) {
        if (!isValidPreviewKey(previewKey) || !canReadProjectSource(previewKey, request)) {
            return ResponseEntity.notFound().build();
        }
        Path previewRoot;
        try {
            previewRoot = generatedPathResolver.resolveExistingDirectory(
                    previewTokenService.codeGenTypeFromPreviewKey(previewKey),
                    previewTokenService.appIdFromPreviewKey(previewKey));
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
        Path sourceRoot;
        try {
            sourceRoot = generatedPathResolver.resolveExistingDirectory(previewRoot, "src");
        } catch (Exception e) {
            return ResponseEntity.ok(List.of());
        }
        if (!Files.isDirectory(sourceRoot)) {
            return ResponseEntity.ok(List.of());
        }
        try {
            List<Map<String, String>> files = new ArrayList<>();
            walkSourceTree(sourceRoot, sourceRoot, files, new SourceListStats());
            files.sort(Comparator
                    .comparingInt((Map<String, String> f) -> f.get("path").split("/").length)
                    .thenComparing(f -> f.get("path")));
            return ResponseEntity.ok()
                    .header("Cache-Control", "no-store")
                    .body(files);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    private void walkSourceTree(Path sourceRoot, Path dir, List<Map<String, String>> out, SourceListStats stats) throws Exception {
        try (Stream<Path> stream = Files.list(dir)) {
            for (Path entry : (Iterable<Path>) stream::iterator) {
                String name = entry.getFileName().toString();
                if (IGNORED_DIRS.contains(name)) {
                    continue;
                }
                if (Files.isDirectory(entry, LinkOption.NOFOLLOW_LINKS)) {
                    walkSourceTree(sourceRoot, entry, out, stats);
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
                    long size = Files.size(entry);
                    if (++stats.fileCount > MAX_SOURCE_FILE_COUNT || (stats.totalBytes += size) > MAX_SOURCE_TOTAL_BYTES) {
                        throw new IllegalStateException("源码文件过多或过大");
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
            @RequestParam(value = "edit", defaultValue = "false") boolean edit,
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
                if (previewTokenService.verify(previewKey, firstSegment)) {
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
            String codeGenType = previewTokenService.codeGenTypeFromPreviewKey(previewKey);
            Path previewRoot = generatedPathResolver.resolveExistingDirectory(
                    codeGenType, previewTokenService.appIdFromPreviewKey(previewKey));
            if (CodeGenTypeEnum.VUE_PROJECT.getValue().equals(codeGenType)) {
                previewRoot = generatedPathResolver.resolveExistingDirectory(previewRoot, "dist");
            }

            if (previewKey.startsWith(CodeGenTypeEnum.VUE_PROJECT.getValue() + "_")
                    && resourcePath.equals("/__fish_edit__.js")) {
                return buildResponse(new ByteArrayResource(PreviewEditScript.content().getBytes(StandardCharsets.UTF_8)),
                        "application/javascript; charset=UTF-8", previewKey);
            }

            String relativeResourcePath = resourcePath.replaceFirst("^/+", "");
            Path realTargetPath = generatedPathResolver.resolveExistingFile(previewRoot, relativeResourcePath);

            Resource resource = new FileSystemResource(realTargetPath);
            if (edit && previewKey.startsWith(CodeGenTypeEnum.VUE_PROJECT.getValue() + "_")
                    && resourcePath.equals("/index.html")) {
                String html = Files.readString(realTargetPath, StandardCharsets.UTF_8);
                String script = "<script src=\"./__fish_edit__.js\"></script>";
                String editedHtml = html.replaceFirst("(?i)</body\\s*>", script + "</body>");
                if (editedHtml.equals(html)) {
                    editedHtml = html + script;
                }
                return buildResponse(new ByteArrayResource(editedHtml.getBytes(StandardCharsets.UTF_8)),
                        "text/html; charset=UTF-8", previewKey);
            }
            return buildResponse(resource, getContentTypeWithCharset(realTargetPath.toString()), previewKey);
        } catch (NoSuchFileException e) {
            // 预览目录或文件不存在（应用未生成/已删除/未构建）：语义是 404，不是服务错误
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("预览静态资源服务异常 previewKey={}", previewKey, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    private boolean isValidPreviewKey(String previewKey) {
        return previewTokenService.isValidPreviewKey(previewKey);
    }

    private boolean isAuthorized(String previewKey, String previewToken, HttpServletRequest request) {
        if (previewTokenService.verify(previewKey, previewToken)) {
            return true;
        }
        if (!previewTokenService.isValidPreviewKey(previewKey)) {
            return false;
        }
        long appId = previewTokenService.appIdFromPreviewKey(previewKey);
        User loginUser = userService.getLoginUserOrNull(request);
        try {
            App app = appService.getPublicAppById(appId, loginUser);
            return matchesAppCodeGenType(previewKey, app);
        } catch (BusinessException e) {
            return false;
        }
    }

    private boolean canReadProjectSource(String previewKey, HttpServletRequest request) {
        if (!previewTokenService.isValidPreviewKey(previewKey)) {
            return false;
        }
        User loginUser = userService.getLoginUserOrNull(request);
        if (loginUser == null) {
            return false;
        }
        try {
            App app = appService.getAppWithPermission(previewTokenService.appIdFromPreviewKey(previewKey), loginUser);
            return matchesAppCodeGenType(previewKey, app);
        } catch (BusinessException e) {
            return false;
        }
    }

    private boolean matchesAppCodeGenType(String previewKey, App app) {
        return app != null
                && app.getCodeGenType() != null
                && app.getCodeGenType().equals(previewTokenService.codeGenTypeFromPreviewKey(previewKey));
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
        if (filePath.endsWith(".svg")) return "image/svg+xml";
        if (filePath.endsWith(".webp")) return "image/webp";
        if (filePath.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    private ResponseEntity<Resource> buildResponse(Resource resource, String contentType, String previewKey) {
        boolean vueProject = previewKey.startsWith(CodeGenTypeEnum.VUE_PROJECT.getValue() + "_");
        String frameAncestors = "'self'";
        String normalizedFrameAncestor = OriginUtils.normalize(previewFrameAncestor);
        if (!normalizedFrameAncestor.isBlank()) {
            frameAncestors += " " + normalizedFrameAncestor;
        }
        return ResponseEntity.ok()
                .header("Content-Type", contentType)
                .header("Referrer-Policy", "no-referrer")
                .header("Content-Security-Policy",
                        "default-src 'none'; script-src 'self'" + (vueProject ? "" : " 'unsafe-inline'")
                                + "; style-src 'self' 'unsafe-inline' https:; img-src 'self' https: data: blob:; "
                                + "font-src 'self' data: https:; connect-src " + getPreviewConnectSrc()
                                + "; media-src 'self'; object-src 'none'; worker-src 'none'; base-uri 'none'; "
                                + "form-action 'none'; frame-ancestors " + frameAncestors)
                .body(resource);
    }

    private String getPreviewConnectSrc() {
        if (previewConnectSrc == null || previewConnectSrc.isBlank()) {
            return "'self'";
        }
        String[] sources = previewConnectSrc.trim().split("\\s+");
        for (String source : sources) {
            if (!"'self'".equals(source) && !PREVIEW_CONNECT_SOURCE_PATTERN.matcher(source).matches()) {
                log.warn("预览联网白名单配置无效，已使用仅同源策略");
                return "'self'";
            }
        }
        return String.join(" ", sources);
    }

    private static class SourceListStats {
        private int fileCount;
        private long totalBytes;
    }
}
