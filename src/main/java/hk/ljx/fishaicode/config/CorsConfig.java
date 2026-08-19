package hk.ljx.fishaicode.config;

import jakarta.annotation.PostConstruct;
import hk.ljx.fishaicode.common.OriginUtils;
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
 * 全局跨域配置
 */
@Slf4j
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Value("${app.cors-allowed-origins:}")
    private String allowedOriginsConfig;

    @Value("${app.origin:}")
    private String appOrigin;

    @Value("${app.preview-origin:}")
    private String previewOrigin;

    private String[] allowedOrigins;

    @PostConstruct
    public void init() {
        List<String> explicit = splitOrigins(allowedOriginsConfig);
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

        String normalizedPreview = OriginUtils.normalize(previewOrigin);
        if (normalizedPreview.isEmpty()) {
            return;
        }
        boolean covered = Arrays.stream(allowedOrigins)
                .map(OriginUtils::normalize)
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
                .map(OriginUtils::normalize)
                .filter(StringUtils::hasText)
                .toList();
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowCredentials(true)
                .allowedOrigins(allowedOrigins)
                .allowedOriginPatterns("null")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .exposedHeaders("*");
    }
}
