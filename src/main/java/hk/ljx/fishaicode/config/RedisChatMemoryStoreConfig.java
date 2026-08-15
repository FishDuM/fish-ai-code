package hk.ljx.fishaicode.config;

import dev.langchain4j.community.store.memory.chat.redis.RedisChatMemoryStore;
import dev.langchain4j.community.store.memory.chat.redis.StoreType;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

/**
 * redis 持久化对话记忆
 */
@Configuration
@RequiredArgsConstructor
public class RedisChatMemoryStoreConfig {

    private final RedisConnectionProperties redisProperties;

    @Bean
    public RedisChatMemoryStore redisChatMemoryStore() {
        RedisChatMemoryStore.Builder builder = RedisChatMemoryStore.builder()
                .host(redisProperties.getHost())
                .port(redisProperties.getPort())
                .ttl(redisProperties.getTtl())
                // 默认 JSON 模式需要 RedisJSON 模块，普通 Redis 没有，会报 unknown command
                .storeType(StoreType.STRING);
        // 此版本 LangChain4j 仅在 user 和 password 同时存在时才向 Redis 发送 AUTH。
        if (StringUtils.hasText(redisProperties.getPassword())) {
            builder.user(StringUtils.hasText(redisProperties.getUsername())
                            ? redisProperties.getUsername() : "default")
                    .password(redisProperties.getPassword());
        }
        return builder.build();
    }
}
