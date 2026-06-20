package hk.ljx.fishaicode.core;

import hk.ljx.fishaicode.modal.enums.CodeGenTypeEnum;
import jakarta.annotation.Resource;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import reactor.core.publisher.Flux;

import java.io.File;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class AiCodeGeneratorFacadeTest {

    @Resource
    private AiCodeGeneratorFacade aiCodeGeneratorFacade;

    @Test
    void generateAndSaveHtmlCode() {
        File file = aiCodeGeneratorFacade.generateAndSaveCode("做个小鱼的博客，不超过20行", CodeGenTypeEnum.HTML);
        Assertions.assertNotNull(file);
    }

    @Test
    void generateAndSaveMultiFileCode() {
        File file = aiCodeGeneratorFacade.generateAndSaveCode("做个小鱼的博客，不超过50行", CodeGenTypeEnum.MULTI_FILE);
        Assertions.assertNotNull(file);
    }

    @Test
    void generateAndSaveCodeStream() {
        Flux<String> stringFlux = aiCodeGeneratorFacade.generateAndSaveCodeStream("做个小鱼的博客，不超过20行", CodeGenTypeEnum.HTML);
        List<String> result = stringFlux.collectList().block();
        Assertions.assertNotNull(result);
        String completeContent = String.join("", result);
        Assertions.assertNotNull(completeContent);
    }
}