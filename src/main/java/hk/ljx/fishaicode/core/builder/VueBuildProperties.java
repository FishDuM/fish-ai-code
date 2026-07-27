package hk.ljx.fishaicode.core.builder;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

/** Docker Vue 构建容器的资源与镜像配置。 */
@Getter
@Setter
@Validated
@Component
@ConfigurationProperties(prefix = "vue-build")
public class VueBuildProperties {

    @NotBlank
    private String dockerImage = "fish-ai-code-vue-builder:20";

    @Min(30)
    @Max(600)
    private int timeoutSeconds = 180;

    @Min(128)
    @Max(4096)
    private int memoryMb = 1024;

    @Min(0)
    @Max(8)
    private double cpuLimit = 1;

    @Min(64)
    @Max(2048)
    private int maxWorkspaceMb = 768;

    @Min(16)
    @Max(1024)
    private int pidsLimit = 128;

    @Min(1)
    @Max(500)
    private int maxOutputMb = 100;

    @Min(1)
    @Max(100_000)
    private int maxOutputFiles = 10_000;
}
