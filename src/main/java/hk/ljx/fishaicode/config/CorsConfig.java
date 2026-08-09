package hk.ljx.fishaicode.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * CORS 白名单计算规则：
 * 1. 显式配置了 app.cors-allowed-origins 时直接使用（逗号分隔）；
 * 2. 未配置时自动合并 app-origin（主站）与 preview-origin（预览域），过滤空值/重复；
 * 3. 配置了 preview-origin 但最终白名单中缺失它时启动直接报错，
 *    避免部署后才发现 Vue 预览 iframe 的 JS/CSS 跨域请求被 403。
 *
 * 该逻辑保证 compose 空环境变量（CORS_ALLOWED_ORIGINS=）不会覆盖 Spring 的 fallback。
 */
@Slf4j
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    private final String[] allowedOrigins;
    private final String previewOrigin;

    public CorsConfig(
            @Value("${app.cors-allowed-origins:}") String allowedOrigins,
            @Value("${app.origin:}") String appOrigin,
            @Value("${app.preview-origin:}") String previewOrigin) {
        this.previewOrigin = previewOrigin;
        List<String> explicit = splitOrigins(allowedOrigins);
        if (!explicit.isEmpty()) {
            this.allowedOrigins = explicit.toArray(String[]::new);
        } else {
            Set<String> merged = new LinkedHashSet<>();
            merged.addAll(splitOrigins(appOrigin));
            merged.addAll(splitOrigins(previewOrigin));
            if (merged.isEmpty()) {
                // 与本地开发默认一致：同源部署（浏览器与后端同域）无需跨域白名单
                merged.add("http://localhost:3000");
            }
            this.allowedOrigins = merged.toArray(String[]::new);
        }
        log.info("CORS 允许的 Origin 白名单: {}", Arrays.toString(this.allowedOrigins));
    }

    @PostConstruct
    public void validatePreviewOriginCovered() {
        String normalizedPreview = normalized(previewOrigin);
        if (normalizedPreview.isEmpty()) {
            return;
        }
        boolean covered = Arrays.stream(allowedOrigins)
                .map(CorsConfig::normalized)
                .anyMatch(normalizedPreview::equals);
        if (!covered) {
            throw new IllegalStateException(
                    "CORS 配置错误：预览域 " + normalizedPreview + " 不在白名单 "
                            + Arrays.toString(allowedOrigins)
                            + " 中。请显式配置 app.cors-allowed-origins 同时包含主站与预览域，"
                            + "或确认 app.preview-origin 与 app.origin 正确。");
        }
    }

    private static List<String> splitOrigins(String raw) {
        if (!StringUtils.hasText(raw)) {
            return new ArrayList<>();
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .toList();
    }

    private static String normalized(String origin) {
        if (origin == null) {
            return "";
        }
        return origin.replaceAll("/+$", "");
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowCredentials(true)
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .exposedHeaders("*");
    }
}
