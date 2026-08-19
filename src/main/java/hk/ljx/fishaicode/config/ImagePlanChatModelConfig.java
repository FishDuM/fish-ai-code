package hk.ljx.fishaicode.config;

import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import hk.ljx.fishaicode.workflow.ai.ImagePlanChatModelWrapper;
import lombok.Data;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Scope;

/**
 * 图片规划模型配置
 */
@Configuration
@ConfigurationProperties(prefix = "langchain4j.open-ai.image-plan-chat-model")
@Data
public class ImagePlanChatModelConfig {

    private String baseUrl;

    private String apiKey;

    private String modelName;

    private Integer maxTokens;

    private Double temperature;

    private Boolean logRequests = false;

    private Boolean logResponses = false;

    @Bean
    @Scope("prototype")
    public ChatModel imagePlanChatModelPrototype() {
        return OpenAiChatModel.builder()
                .apiKey(apiKey)
                .modelName(modelName)
                .baseUrl(baseUrl)
                .maxTokens(maxTokens)
                .temperature(temperature)
                .logRequests(logRequests)
                .logResponses(logResponses)
                .build();
    }

    @Bean
    public ImagePlanChatModelWrapper imagePlanChatModelWrapper(@Qualifier("imagePlanChatModelPrototype") ChatModel chatModel) {
        return new ImagePlanChatModelWrapper(chatModel);
    }
}
