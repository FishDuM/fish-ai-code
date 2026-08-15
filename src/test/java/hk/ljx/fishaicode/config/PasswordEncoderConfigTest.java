package hk.ljx.fishaicode.config;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.assertTrue;

class PasswordEncoderConfigTest {

    @Test
    void providesBcryptPasswordEncoder() {
        PasswordEncoder encoder = new PasswordEncoderConfig().passwordEncoder();
        String encoded = encoder.encode("password");

        assertTrue(encoder.matches("password", encoded));
    }
}
