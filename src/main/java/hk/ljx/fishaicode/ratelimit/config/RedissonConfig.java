package hk.ljx.fishaicode.ratelimit.config;

import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.redisson.config.SingleServerConfig;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import hk.ljx.fishaicode.config.RedisConnectionProperties;

@Configuration
public class RedissonConfig {

    private final RedisConnectionProperties redisProperties;

    public RedissonConfig(RedisConnectionProperties redisProperties) {
        this.redisProperties = redisProperties;
    }

    @Bean
    public RedissonClient redissonClient() {
        Config config = new Config();
        String address = "redis://" + redisProperties.getHost() + ":" + redisProperties.getPort();
        SingleServerConfig singleServerConfig = config.useSingleServer()
                .setAddress(address)
                .setDatabase(redisProperties.getDatabase())
                .setConnectionMinimumIdleSize(1)
                .setConnectionPoolSize(10)
                .setIdleConnectionTimeout(30000)
                .setConnectTimeout(5000)
                .setTimeout(3000)
                .setRetryAttempts(3)
                .setRetryInterval(1500);

        if (StringUtils.hasText(redisProperties.getPassword())) {
            if (StringUtils.hasText(redisProperties.getUsername())) {
                singleServerConfig.setUsername(redisProperties.getUsername());
            }
            singleServerConfig.setPassword(redisProperties.getPassword());
        }
        return Redisson.create(config);
    }
}
