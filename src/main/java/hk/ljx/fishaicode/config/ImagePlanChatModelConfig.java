package hk.ljx.fishaicode.config;

import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Scope;

/**
 * 图片收集规划模型配置。
 *
 * <p>图片规划只需产出搜索关键词，属于短输出任务，用轻量模型（qwen-flash）即可，
 * 避免推理模型（qwen3.7-max）耗时数十秒且产生大量无用的 reasoning token。</p>
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
}
