package hk.ljx.fishaicode.core.builder;

import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
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
        assertTrue(command.getLast().contains("cp -a /opt/offline-seed/node_modules /workspace/node_modules"));
        assertTrue(command.getLast().contains("npm run build"));
        assertFalse(command.getLast().contains("npm install"));
        assertFalse(command.getLast().contains("npm ci"));
        assertTrue(command.getLast().contains("npm run build"));
    }

    @Test
    void refusesPathsOutsideGeneratedVueProjectDirectory() {
        assertFalse(builder.buildProject("/tmp/not-a-generated-project"));
    }
}
