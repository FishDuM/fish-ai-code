package hk.ljx.fishaicode.service;

import cn.hutool.crypto.digest.HMac;
import cn.hutool.crypto.digest.HmacAlgorithm;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 预览 token 服务：负责 preview key 校验、token 签名、验签和有效期。
 */
@Service
public class PreviewTokenService {

    private static final long TOKEN_TTL_MS = 15 * 60 * 1000L;
    private static final Pattern PREVIEW_KEY_PATTERN = Pattern.compile("^(html|multi_file|vue_project)_([1-9]\\d*)$");

    private String previewTokenSecret;

    public PreviewTokenService(@Value("${app.preview-token-secret:}") String previewTokenSecret) {
        this.previewTokenSecret = previewTokenSecret;
    }

    public boolean isConfigured() {
        return previewTokenSecret != null && !previewTokenSecret.isBlank();
    }

    public boolean isValidPreviewKey(String previewKey) {
        Matcher matcher = previewKey == null ? null : PREVIEW_KEY_PATTERN.matcher(previewKey);
        if (matcher == null || !matcher.matches()) {
            return false;
        }
        try {
            Long.parseLong(matcher.group(2));
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    public long appIdFromPreviewKey(String previewKey) {
        Matcher matcher = previewKey == null ? null : PREVIEW_KEY_PATTERN.matcher(previewKey);
        if (matcher == null || !matcher.matches()) {
            throw new IllegalArgumentException("预览资源标识无效");
        }
        return Long.parseLong(matcher.group(2));
    }

    public String codeGenTypeFromPreviewKey(String previewKey) {
        Matcher matcher = previewKey == null ? null : PREVIEW_KEY_PATTERN.matcher(previewKey);
        if (matcher == null || !matcher.matches()) {
            throw new IllegalArgumentException("预览资源标识无效");
        }
        return matcher.group(1);
    }

    public long tokenTtlSeconds() {
        return TOKEN_TTL_MS / 1000;
    }

    public String createToken(String previewKey) {
        if (!isValidPreviewKey(previewKey)) {
            throw new IllegalArgumentException("预览资源标识无效");
        }
        requireConfigured();
        return sign(previewKey, System.currentTimeMillis() + TOKEN_TTL_MS);
    }

    public boolean verify(String previewKey, String token) {
        if (!isConfigured() || token == null || token.isBlank()) {
            return false;
        }
        String[] parts = token.split("\\.");
        if (parts.length != 3 || !parts[0].equals(previewKey)) {
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
        String expected = sign(parts[0], expiresAt);
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                token.getBytes(StandardCharsets.UTF_8));
    }

    /** 仅供 token 行为测试构造指定过期时间的 token。 */
    String createTokenForTest(String previewKey, long expiresAt) {
        requireConfigured();
        return sign(previewKey, expiresAt);
    }

    private String sign(String previewKey, long expiresAt) {
        String payload = previewKey + "." + expiresAt;
        HMac hmac = new HMac(HmacAlgorithm.HmacSHA256, previewTokenSecret.getBytes(StandardCharsets.UTF_8));
        String signature = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(hmac.digest(payload));
        return payload + "." + signature;
    }

    private void requireConfigured() {
        if (!isConfigured()) {
            throw new IllegalStateException("预览 token 签名密钥未配置");
        }
    }
}
