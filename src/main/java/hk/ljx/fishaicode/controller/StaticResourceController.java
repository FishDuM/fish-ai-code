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
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.HandlerMapping;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/static")
public class StaticResourceController {

    private static final Pattern PREVIEW_KEY_PATTERN = Pattern.compile("^(html|multi_file|vue_project)_([1-9]\\d*)$");

    private final AppService appService;
    private final UserService userService;

    public StaticResourceController(AppService appService, UserService userService) {
        this.appService = appService;
        this.userService = userService;
    }

    /**
     * 提供生成代码的预览资源访问，支持目录重定向。
     * 部署后的资源由 Nginx 从部署目录提供。
     * 访问格式：http://localhost:8911/api/static/{previewKey}[/{fileName}]
     */
    @GetMapping("/{previewKey}/**")
    public ResponseEntity<Resource> serveStaticResource(
            @PathVariable String previewKey,
            HttpServletRequest request) {
        try {
            Matcher matcher = previewKey == null ? null : PREVIEW_KEY_PATTERN.matcher(previewKey);
            if (matcher == null || !matcher.matches()) {
                return ResponseEntity.notFound().build();
            }

            // 权限校验：复用与详情页一致的 getPublicAppById 规则——
            // 精选应用任何人（含未登录）可访问，非精选应用仅本人/管理员可访问。
            // 这样即使 appId（雪花 id）可枚举，也无法拉取私有应用的生成源码。
            // 应用不存在与无权限统一返回 404，避免向攻击者泄露应用是否存在。
            Long appId = Long.parseLong(matcher.group(2));
            User loginUser = userService.getLoginUserOrNull(request);
            try {
                appService.getPublicAppById(appId, loginUser);
            } catch (BusinessException e) {
                return ResponseEntity.notFound().build();
            }

            // 获取资源路径
            String resourcePath = (String) request.getAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE);
            String requestPrefix = "/static/" + previewKey;
            if (resourcePath == null || !resourcePath.startsWith(requestPrefix)) {
                return ResponseEntity.notFound().build();
            }
            resourcePath = resourcePath.substring(requestPrefix.length());
            // 如果是目录访问（不带斜杠），重定向到带斜杠的URL
            if (resourcePath.isEmpty()) {
                HttpHeaders headers = new HttpHeaders();
                headers.add("Location", request.getRequestURI() + "/");
                return new ResponseEntity<>(headers, HttpStatus.MOVED_PERMANENTLY);
            }
            // 默认返回 index.html
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
                            "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
                                    + "img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'none'; "
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
