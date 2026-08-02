package hk.ljx.fishaicode.controller;

import cn.hutool.crypto.digest.HMac;
import cn.hutool.crypto.digest.HmacAlgorithm;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.model.entity.User;
import hk.ljx.fishaicode.model.vo.PreviewSessionVO;
import hk.ljx.fishaicode.service.AppService;
import hk.ljx.fishaicode.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 预览访问 token 签发：预览 iframe 无法带 cookie（sandbox 无 allow-same-origin），
 * 静态资源改用 URL 携带的短时签名 token 鉴权。token 无状态（HMAC 签名 + 过期时间）。
 */
@RestController
@RequestMapping("/static")
public class PreviewTokenController {

    /** 预览 token 有效期：15 分钟 */
    private static final long TOKEN_TTL_MS = 15 * 60 * 1000L;

    static final Pattern PREVIEW_KEY_PATTERN = Pattern.compile("^(html|multi_file|vue_project)_([1-9]\\d*)$");

    private final AppService appService;
    private final UserService userService;

    /**
     * 预览 token 签名密钥，生产必须通过环境变量 app.preview-token-secret 注入强随机值。
     * 为空时拒绝签发，防止回落弱密钥。
     */
    @Value("${app.preview-token-secret:}")
    private String previewTokenSecret;

    @Value("${app.preview-origin:http://preview.localhost:3000}")
    private String previewOrigin;

    public PreviewTokenController(AppService appService, UserService userService) {
        this.appService = appService;
        this.userService = userService;
    }

    @GetMapping("/preview-token/{previewKey}")
    public Map<String, Object> issuePreviewToken(
            @PathVariable String previewKey,
            HttpServletRequest request) {
        Matcher matcher = previewKey == null ? null : PREVIEW_KEY_PATTERN.matcher(previewKey);
        if (matcher == null || !matcher.matches()) {
            throw new BusinessException(ErrorCode.NOT_FOUND_ERROR, "预览资源不存在");
        }
        // 签名密钥未配置（本地 dev 未注入环境变量）：拒绝签发，避免回落空/弱密钥
        if (previewTokenSecret == null || previewTokenSecret.isBlank()) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "预览服务未配置签名密钥，请设置 app.preview-token-secret");
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

    public PreviewSessionVO createPreviewSession(String previewKey) {
        if (previewTokenSecret == null || previewTokenSecret.isBlank()) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "预览服务未配置签名密钥");
        }
        String origin = previewOrigin == null ? "" : previewOrigin.replaceAll("/+$", "");
        if (origin.isBlank()) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "预览服务未配置访问域名");
        }
        long expiresAt = System.currentTimeMillis() + TOKEN_TTL_MS;
        String token = signPreviewToken(previewKey, expiresAt);
        return new PreviewSessionVO(origin + "/api/static/" + previewKey + "/" + token + "/", TOKEN_TTL_MS / 1000);
    }

    String signPreviewTokenForTest(String previewKey, long expiresAt) {
        return signPreviewToken(previewKey, expiresAt);
    }

    private String signPreviewToken(String previewKey, long expiresAt) {
        if (previewTokenSecret == null || previewTokenSecret.isBlank()) {
            throw new IllegalStateException("预览 token 签名密钥未配置");
        }
        String payload = previewKey + "." + expiresAt;
        HMac hmac = new HMac(HmacAlgorithm.HmacSHA256, previewTokenSecret.getBytes(StandardCharsets.UTF_8));
        String sig = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(hmac.digest(payload));
        return payload + "." + sig;
    }

    boolean verifyPreviewToken(String previewKey, String token) {
        // 签名密钥未配置：任何 token 都无法验签，统一视为无效（false → 调用方走 404）
        if (previewTokenSecret == null || previewTokenSecret.isBlank()) {
            return false;
        }
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
        // 恒定时间比较，避免签名比对的时间侧信道
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                token.getBytes(StandardCharsets.UTF_8));
    }
}
