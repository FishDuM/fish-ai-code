package hk.ljx.fishaicode.config;

import hk.ljx.fishaicode.common.OriginUtils;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class OriginUtilsTest {

    @Test
    void normalize_trimsWhitespaceAndTrailingSlashes() {
        assertEquals("https://preview.example.com", OriginUtils.normalize("  https://preview.example.com///  "));
    }

    @Test
    void normalize_nullReturnsEmptyString() {
        assertEquals("", OriginUtils.normalize(null));
    }
}
