package hk.ljx.fishaicode.constant;

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
     * 部署产物 URL 路径前缀（nginx location /deploy/ 服务部署目录）
     */
    private String path = "/deploy";

    /**
     * 部署访问凭据长度（字母+数字）
     */
    private int keyLength = 16;
}
