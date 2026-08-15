package hk.ljx.fishaicode.config;

import dev.langchain4j.community.store.memory.chat.redis.RedisChatMemoryStore;
import dev.langchain4j.data.message.UserMessage;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import lombok.RequiredArgsConstructor;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
@ActiveProfiles("test")
@RequiredArgsConstructor
class RedisChatMemoryStoreConfigTest {

    private final RedisChatMemoryStore redisChatMemoryStore;

    @Test
    void authenticatesWithRedisAndPersistsChatMemory() {
        String memoryId = "redis-auth-test-" + UUID.randomUUID();
        try {
            redisChatMemoryStore.updateMessages(memoryId, List.of(UserMessage.from("authentication test")));
            assertEquals(1, redisChatMemoryStore.getMessages(memoryId).size());
        } finally {
            redisChatMemoryStore.deleteMessages(memoryId);
        }
    }
}
