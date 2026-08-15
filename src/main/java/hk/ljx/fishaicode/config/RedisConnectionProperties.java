package hk.ljx.fishaicode.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Redis 连接与共享存储配置。
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "spring.data.redis")
public class RedisConnectionProperties {

    private String host = "localhost";
    private int port = 6379;
    private int database = 0;
    private long ttl = 3600L;
    private String username;
    private String password = "";
}
