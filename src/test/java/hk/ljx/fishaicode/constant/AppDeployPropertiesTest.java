package hk.ljx.fishaicode.constant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AppDeployPropertiesTest {

    private AppDeployProperties newProperties(String path) {
        AppDeployProperties props = new AppDeployProperties();
        props.setPath(path);
        return props;
    }

    @Test
    void normalize_单段合法路径() {
        AppDeployProperties props = newProperties("/deploy");
        props.normalize();
        assertEquals("/deploy", props.getPath());
    }

    @Test
    void normalize_多段合法路径() {
        AppDeployProperties props = newProperties("/apps/generated");
        props.normalize();
        assertEquals("/apps/generated", props.getPath());
    }

    @Test
    void normalize_未以斜杠开头拒绝() {
        assertThrows(IllegalStateException.class, () -> newProperties("deploy").normalize());
    }

    @Test
    void normalize_尾斜杠与首斜杠多余时去除() {
        AppDeployProperties props = newProperties("/deploy/");
        props.normalize();
        assertEquals("/deploy", props.getPath());
    }

    @Test
    void normalize_多段尾斜杠去除() {
        AppDeployProperties props = newProperties("/apps/generated/");
        props.normalize();
        assertEquals("/apps/generated", props.getPath());
    }

    @Test
    void normalize_空值拒绝() {
        assertThrows(IllegalStateException.class, () -> newProperties(null).normalize());
        assertThrows(IllegalStateException.class, () -> newProperties("").normalize());
        assertThrows(IllegalStateException.class, () -> newProperties("   ").normalize());
    }

    @Test
    void normalize_连续斜杠拒绝() {
        assertThrows(IllegalStateException.class, () -> newProperties("/a//b").normalize());
    }

    @Test
    void normalize_点与点点拒绝() {
        assertThrows(IllegalStateException.class, () -> newProperties("/a/../b").normalize());
        assertThrows(IllegalStateException.class, () -> newProperties("/a/./b").normalize());
        assertThrows(IllegalStateException.class, () -> newProperties("/a.b").normalize());
    }

    @Test
    void normalize_query与fragment拒绝() {
        assertThrows(IllegalStateException.class, () -> newProperties("/deploy?x=1").normalize());
        assertThrows(IllegalStateException.class, () -> newProperties("/deploy#frag").normalize());
    }

    @Test
    void normalize_特殊字符拒绝() {
        assertThrows(IllegalStateException.class, () -> newProperties("/a b").normalize());
        assertThrows(IllegalStateException.class, () -> newProperties("/a~b").normalize());
        assertThrows(IllegalStateException.class, () -> newProperties("/a@b").normalize());
        assertThrows(IllegalStateException.class, () -> newProperties("/a中").normalize());
    }

    @Test
    void isValidPath_合法路径() {
        assertTrue(AppDeployProperties.isValidPath("/deploy"));
        assertTrue(AppDeployProperties.isValidPath("/published"));
        assertTrue(AppDeployProperties.isValidPath("/apps/generated"));
        assertTrue(AppDeployProperties.isValidPath("/a_b/v2"));
        assertTrue(AppDeployProperties.isValidPath("/a-b/c-d"));
    }

    @Test
    void isValidPath_非法路径() {
        assertFalse(AppDeployProperties.isValidPath(null));
        assertFalse(AppDeployProperties.isValidPath(""));
        assertFalse(AppDeployProperties.isValidPath("deploy"));
        assertFalse(AppDeployProperties.isValidPath("/deploy/"));
        assertFalse(AppDeployProperties.isValidPath("/a//b"));
        assertFalse(AppDeployProperties.isValidPath("/a/../b"));
        assertFalse(AppDeployProperties.isValidPath("/a.b"));
        assertFalse(AppDeployProperties.isValidPath("/a?x=1"));
        assertFalse(AppDeployProperties.isValidPath("/a#f"));
        assertFalse(AppDeployProperties.isValidPath("/a b"));
        assertFalse(AppDeployProperties.isValidPath("//a"));
    }
}
