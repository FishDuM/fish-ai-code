package hk.ljx.fishaicode.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PreviewTokenServiceTest {

    private final PreviewTokenService service = new PreviewTokenService("test-secret");

    @Test
    void verify_acceptsValidTokenBoundToPreviewKey() {
        String token = service.createTokenForTest("html_1", System.currentTimeMillis() + 60_000);

        assertTrue(service.verify("html_1", token));
    }

    @Test
    void verify_rejectsExpiredToken() {
        String token = service.createTokenForTest("html_1", System.currentTimeMillis() - 1_000);

        assertFalse(service.verify("html_1", token));
    }

    @Test
    void verify_rejectsTokenBoundToAnotherPreviewKey() {
        String token = service.createTokenForTest("html_1", System.currentTimeMillis() + 60_000);

        assertFalse(service.verify("vue_project_1", token));
    }

    @Test
    void isValidPreviewKey_rejectsMalformedKey() {
        assertFalse(service.isValidPreviewKey("html_1_extra"));
    }

    @Test
    void isValidPreviewKey_rejectsAppIdOutsideLongRange() {
        assertFalse(service.isValidPreviewKey("html_9223372036854775808"));
    }

    @Test
    void codeGenTypeFromPreviewKey_preservesMultiFileType() {
        assertTrue("multi_file".equals(service.codeGenTypeFromPreviewKey("multi_file_1")));
    }
}
