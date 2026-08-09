package hk.ljx.fishaicode.constant;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

/**
 * 应用部署相关配置。
 * 通过 application.yaml 的 app.deploy 前缀注入，避免部署域名硬编码。
 */
@Getter
@Setter
@Validated
@Component
@ConfigurationProperties(prefix = "app.deploy")
public class AppDeployProperties {

    /**
     * 部署访问域名，如 https://deploy.example.com
     */
    private String host = "http://localhost";

    /**
     * 部署产物 URL 路径前缀（nginx location 服务部署目录），如 /deploy 或 /apps/generated
     */
    private String path = "/deploy";

    /**
     * 部署访问凭据长度（字母+数字）
     */
    private int keyLength = 16;

    @PostConstruct
    public void normalize() {
        if (path == null || path.isBlank()) {
            throw new IllegalStateException("app.deploy.path 不能为空，例如 /deploy");
        }
        if (!path.trim().startsWith("/")) {
            throw new IllegalStateException(
                    "app.deploy.path 不合法：" + path + "。必须以 / 开头，例如 /deploy 或 /apps/generated");
        }
        String normalized = "/" + path.trim().replaceAll("^/+", "").replaceAll("/+$", "");
        if (!isValidPath(normalized)) {
            throw new IllegalStateException(
                    "app.deploy.path 不合法：" + path + "。必须以 / 开头，每个路径段仅含字母数字 _ -，"
                            + "不允许空段、.、..、?、# 或连续 //");
        }
        path = normalized;
    }

    /**
     * 部署路径契约（Java 与 entrypoint.sh 使用同一套规则）：
     * 必须以 / 开头，一个或多个路径段，每段仅允许 A-Z a-z 0-9 _ -；
     * 禁止空段（//）、禁止 . / ..、禁止 query（?）与 fragment（#）。
     * 统一规范化为无尾斜杠形式（如 /deploy），生成 URL 时再补尾斜杠。
     */
    public static boolean isValidPath(String candidate) {
        return candidate != null && candidate.matches("/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*");
    }
}
