package hk.ljx.fishaicode.common;

/**
 * Origin 字符串归一化工具。
 */
public final class OriginUtils {

    private OriginUtils() {
    }

    public static String normalize(String origin) {
        if (origin == null) {
            return "";
        }
        return origin.trim().replaceAll("/+$", "");
    }
}
