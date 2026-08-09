package hk.ljx.fishaicode.config;

import dev.langchain4j.community.store.memory.chat.redis.RedisChatMemoryStore;
import dev.langchain4j.community.store.memory.chat.redis.StoreType;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

/**
 * redis 持久化对话记忆
 */
@Configuration
@ConfigurationProperties(prefix = "spring.data.redis")
@Data
public class RedisChatMemoryStoreConfig {
    private String host;
    private int port;
    private long ttl;
    private String password;
    private String username;

    @Bean
    public RedisChatMemoryStore redisChatMemoryStore() {
        RedisChatMemoryStore.Builder builder = RedisChatMemoryStore.builder()
                .host(host)
                .port(port)
                .ttl(ttl)
                // 默认 JSON 模式需要 RedisJSON 模块，普通 Redis 没有，会报 unknown command
                .storeType(StoreType.STRING);
        // 此版本 LangChain4j 仅在 user 和 password 同时存在时才向 Redis 发送 AUTH。
        if (StringUtils.hasText(password)) {
            builder.user(StringUtils.hasText(username) ? username : "default")
                    .password(password);
        }
        return builder.build();
    }
}
