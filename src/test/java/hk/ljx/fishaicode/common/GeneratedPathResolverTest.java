package hk.ljx.fishaicode.common;

import hk.ljx.fishaicode.constant.AppConstant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.concurrent.ThreadLocalRandom;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class GeneratedPathResolverTest {

    private final GeneratedPathResolver resolver = new GeneratedPathResolver();
    private final String suffix = Long.toString(ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE));
    private final Path appRoot = Path.of(AppConstant.CODE_OUTPUT_ROOT_DIR).resolve("html_" + suffix);

    @AfterEach
    void tearDown() throws IOException {
        if (Files.exists(appRoot)) {
            try (var paths = Files.walk(appRoot)) {
                paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                    try {
                        Files.deleteIfExists(path);
                    } catch (IOException e) {
                        throw new RuntimeException(e);
                    }
                });
            }
        }
    }

    @Test
    void resolveExistingDirectoryReturnsRealAppRoot() throws IOException {
        Files.createDirectories(appRoot);
        Files.writeString(appRoot.resolve("index.html"), "<h1>preview</h1>");

        assertEquals(appRoot.toRealPath(), resolver.resolveExistingDirectory("html", Long.parseLong(suffix)));
    }

    @Test
    void resolveOptionalFileReturnsNullWhenMissing() throws IOException {
        Files.createDirectories(appRoot);

        assertNull(resolver.resolveOptionalFile(appRoot.toRealPath(), "style.css"));
    }
}
