package hk.ljx.fishaicode.config;

import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.service.AiServices;
import hk.ljx.fishaicode.ai.AiAppNameService;
import hk.ljx.fishaicode.ai.AiCodeGenTypeRoutingService;
import hk.ljx.fishaicode.ai.SensitiveCheck;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Scope;

@Configuration
@ConfigurationProperties(prefix = "langchain4j.open-ai.routing-chat-model")
@Data
public class RoutingAiModelConfig {

    private String baseUrl;

    private String apiKey;

    private String modelName;

    private Integer maxTokens;

    private Double temperature;

    private Boolean logRequests = false;

    private Boolean logResponses = false;

    /**
     * 创建用于路由判断的ChatModel
     */
    @Bean
    public ChatModel routingChatModel() {
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
    public AiAppNameService aiAppNameService(ChatModel routingChatModel) {
        return AiServices.builder(AiAppNameService.class)
                .chatModel(routingChatModel)
                .build();
    }

    @Bean
    public AiCodeGenTypeRoutingService aiCodeGenTypeRoutingService(ChatModel routingChatModel) {
        return AiServices.builder(AiCodeGenTypeRoutingService.class)
                .chatModel(routingChatModel)
                .build();
    }

    @Bean
    public SensitiveCheck sensitiveCheck(ChatModel routingChatModel) {
        return AiServices.builder(SensitiveCheck.class)
                .chatModel(routingChatModel)
                .build();
    }
}
