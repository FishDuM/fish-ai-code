package hk.ljx.fishaicode.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RedisConnectionPropertiesTest {

    @Test
    void defaultsMatchLocalRedisContract() {
        RedisConnectionProperties properties = new RedisConnectionProperties();

        assertEquals("localhost", properties.getHost());
        assertEquals(6379, properties.getPort());
        assertEquals(0, properties.getDatabase());
        assertEquals(3600L, properties.getTtl());
    }
}
