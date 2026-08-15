package hk.ljx.fishaicode.core.builder;

import hk.ljx.fishaicode.constant.AppConstant;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class VueProjectBuilderTest {

    private final VueProjectBuilder builder = new VueProjectBuilder(new VueBuildProperties());

    @Test
    void dockerCommandKeepsGeneratedCodeOutsideHostExecutionBoundary() {
        List<String> command = builder.createDockerCommand(
                Path.of("/tmp/code_output/vue_project_1"),
                Path.of("/tmp/code_output/vue-build-1/workspace"),
                Path.of("/tmp/code_output/vue-build-1/dist"));

        assertTrue(command.contains("--read-only"));
        assertTrue(command.contains("--name"));
        assertTrue(command.contains("none"));
        assertTrue(command.contains("--user"));
        assertTrue(command.contains("node"));
        assertTrue(command.contains("--cap-drop"));
        assertTrue(command.contains("ALL"));
        assertTrue(command.contains("--security-opt"));
        assertTrue(command.contains("no-new-privileges"));
        assertTrue(command.contains("--pids-limit"));
        assertTrue(command.contains("--memory"));
        assertTrue(command.contains("--cpus"));
        assertTrue(command.stream().anyMatch(arg -> arg.contains("dst=/workspace") && !arg.contains("readonly")));
        assertTrue(command.stream().anyMatch(arg -> arg.contains("dst=/input,readonly")));
        assertTrue(command.stream().anyMatch(arg -> arg.contains("dst=/output") && !arg.contains("readonly")));
        assertTrue(command.getLast().contains("ln -s /opt/offline-seed/node_modules /workspace/node_modules"));
        assertTrue(command.getLast().contains("npm run build"));
        assertFalse(command.getLast().contains("npm install"));
        assertFalse(command.getLast().contains("npm ci"));
        assertTrue(command.getLast().contains("npm run build"));
    }

    @Test
    void refusesPathsOutsideGeneratedVueProjectDirectory() {
        assertFalse(builder.buildProject("/tmp/not-a-generated-project"));
    }

    @Test
    void toHostMountSourceMapsContainerRootToHostRoot() {
        String src = VueProjectBuilder.toHostMountSource(
                "/app/tmp/code_output", "/data/code_output",
                Path.of("/app/tmp/code_output/vue_project_1"));

        assertEquals(Path.of("/data/code_output", "vue_project_1").normalize().toString(), src);
    }

    @Test
    void toHostMountSourceKeepsOriginalPathWhenHostRootBlank() {
        // 未配置宿主根（本地直接运行）：不映射，原样返回容器路径
        String src = VueProjectBuilder.toHostMountSource(
                "/app/tmp/code_output", "",
                Path.of("/app/tmp/code_output/vue_project_1"));

        assertEquals(Path.of("/app/tmp/code_output/vue_project_1").normalize().toString(), src);
    }

    @Test
    void toHostMountSourceKeepsOriginalPathOutsideContainerRoot() {
        // 路径不在生成根目录下：回退原路径，避免把无关路径错误映射到宿主根
        String src = VueProjectBuilder.toHostMountSource(
                "/app/tmp/code_output", "/data/code_output",
                Path.of("/elsewhere/vue_project_1"));

        assertEquals(Path.of("/elsewhere/vue_project_1").normalize().toString(), src);
    }

    @Test
    void dockerCommandMapsMountSourcesToHostRootWhenConfigured() {
        VueBuildProperties props = new VueBuildProperties();
        Path containerRoot = Path.of(AppConstant.CODE_OUTPUT_ROOT_DIR);
        Path hostRoot = containerRoot.getParent().resolve("host_code_output");
        props.setHostCodeOutputDir(hostRoot.toString());
        VueProjectBuilder configuredBuilder = new VueProjectBuilder(props);

        List<String> command = configuredBuilder.createDockerCommand(
                containerRoot.resolve("vue_project_1"),
                containerRoot.resolve("vue-build-1/workspace"),
                containerRoot.resolve("vue-build-1/dist"));

        String inputMount = command.stream()
                .filter(arg -> arg.startsWith("type=bind,src=") && arg.contains("dst=/input,readonly"))
                .findFirst().orElseThrow();
        assertTrue(inputMount.startsWith("type=bind,src=" + hostRoot.resolve("vue_project_1") + ","));

        String workspaceMount = command.stream()
                .filter(arg -> arg.startsWith("type=bind,src=") && arg.contains("dst=/workspace,"))
                .findFirst().orElseThrow();
        assertTrue(workspaceMount.startsWith("type=bind,src=" + hostRoot.resolve("vue-build-1").resolve("workspace") + ","));

        String outputMount = command.stream()
                .filter(arg -> arg.startsWith("type=bind,src=") && arg.contains("dst=/output,"))
                .findFirst().orElseThrow();
        assertTrue(outputMount.startsWith("type=bind,src=" + hostRoot.resolve("vue-build-1").resolve("dist") + ","));
    }

    @Test
    void validateBuildOutputRejectsOutputWithoutIndexHtml() throws Exception {
        Path outputDir = Files.createTempDirectory("vue-build-output-");
        try {
            Files.writeString(outputDir.resolve("assets.js"), "console.log('asset');");
            Method validateBuildOutput = VueProjectBuilder.class
                    .getDeclaredMethod("validateBuildOutput", Path.class);
            validateBuildOutput.setAccessible(true);

            InvocationTargetException exception = assertThrows(InvocationTargetException.class,
                    () -> validateBuildOutput.invoke(builder, outputDir));

            assertInstanceOf(IOException.class, exception.getCause());
        } finally {
            Files.deleteIfExists(outputDir.resolve("assets.js"));
            Files.deleteIfExists(outputDir);
        }
    }
}
