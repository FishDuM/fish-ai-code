package hk.ljx.fishaicode.core;

import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.modal.enums.CodeGenTypeEnum;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AiCodeGeneratorFacadePersistenceTest {

    @Test
    void doesNotCompleteWhenGeneratedCodeCannotBePersisted() {
        AiCodeGeneratorFacade facade = new AiCodeGeneratorFacade();

        BusinessException exception = assertThrows(BusinessException.class,
                () -> facade.processCodeStream(Flux.empty(), CodeGenTypeEnum.HTML, 1L)
                        .collectList()
                        .block());

        assertEquals("代码保存失败，请重试", exception.getMessage());
    }
}
