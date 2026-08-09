package hk.ljx.fishaicode.core;

import hk.ljx.fishaicode.model.enums.CodeGenTypeEnum;
import jakarta.annotation.Resource;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import reactor.core.publisher.Flux;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

// 依赖真实 DeepSeek API 与 key 的集成测试：未设置 DEEPSEEK_API_KEY 时跳过
@EnabledIfEnvironmentVariable(named = "DEEPSEEK_API_KEY", matches = ".+")
@SpringBootTest
@ActiveProfiles("test")
class AiCodeGeneratorFacadeTest {

    @Resource
    private AiCodeGeneratorFacade aiCodeGeneratorFacade;

    @Test
    void generateAndSaveCodeStream() {
        Flux<String> stringFlux = aiCodeGeneratorFacade.generateAndSaveCodeStream("做个小鱼的博客，不超过20行", CodeGenTypeEnum.HTML, 1L);
        List<String> result = stringFlux.collectList().block();
        Assertions.assertNotNull(result);
        String completeContent = String.join("", result);
        Assertions.assertNotNull(completeContent);
    }
}