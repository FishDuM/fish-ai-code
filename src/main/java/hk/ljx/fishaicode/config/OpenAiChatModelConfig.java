package hk.ljx.fishaicode.config;

import dev.langchain4j.model.chat.ChatModel;
import hk.ljx.fishaicode.ai.OpenAiChatModelWrapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenAiChatModelConfig {

    @Bean
    public OpenAiChatModelWrapper openAiChatModelWrapper(@Qualifier("openAiChatModel") ChatModel chatModel) {
        return new OpenAiChatModelWrapper(chatModel);
    }
}
