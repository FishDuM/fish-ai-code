package hk.ljx.fishaicode.langgraph4j.ai;

import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CodeQualityPromptTemplateTest {

    @Test
    void vueInterpolationIsPassedAsCodeInsteadOfBeingParsedAsPromptVariable() {
        ChatModel chatModel = mock(ChatModel.class);
        when(chatModel.chat(any(ChatRequest.class))).thenReturn(ChatResponse.builder()
                .aiMessage(AiMessage.from("{\"isValid\":true,\"errors\":[],\"suggestions\":[]}"))
                .build());
        CodeQualityCheckServiceFactory factory = new CodeQualityCheckServiceFactory();
        ReflectionTestUtils.setField(factory, "chatModel", chatModel);
        CodeQualityCheckService service = factory.createCodeQualityCheckService();
        String vueCode = "<span>{{ '⭐'.repeat(review.stars) }}</span>";

        service.checkCodeQuality(vueCode);

        ArgumentCaptor<ChatRequest> requestCaptor = ArgumentCaptor.forClass(ChatRequest.class);
        verify(chatModel).chat(requestCaptor.capture());
        String userMessage = requestCaptor.getValue().messages().stream()
                .filter(UserMessage.class::isInstance)
                .map(UserMessage.class::cast)
                .map(UserMessage::singleText)
                .findFirst()
                .orElseThrow();
        assertTrue(userMessage.contains(vueCode));
    }
}
