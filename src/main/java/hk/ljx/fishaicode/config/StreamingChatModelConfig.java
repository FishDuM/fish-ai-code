package hk.ljx.fishaicode.config;

import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.model.openai.OpenAiStreamingChatModel;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Scope;

import java.time.Duration;

/**
 * 流式对话模型配置
 */
@Configuration
@ConfigurationProperties(prefix = "langchain4j.open-ai.streaming-chat-model")
@Data
public class StreamingChatModelConfig {

    private String baseUrl;

    private String apiKey;

    private String modelName;

    /**
     * 默认 16384：HTML/MULTI_FILE 代码生成走该模型，输出顺序 HTML→CSS→JS。
     * 不配置时请求体不带 max_tokens，服务商默认输出上限会把长输出截断，CSS/JS 直接丢失。
     */
    private Integer maxTokens = 16384;

    private Double temperature;

    private boolean logRequests;

    private boolean logResponses;

    /** 单次流式请求在没有收到响应时的最长等待时间。 */
    private Duration requestTimeout = Duration.ofSeconds(120);

    @Bean
    @Scope("prototype")
    public StreamingChatModel streamingChatModelPrototype() {
        return OpenAiStreamingChatModel.builder()
                .apiKey(apiKey)
                .baseUrl(baseUrl)
                .modelName(modelName)
                .maxTokens(maxTokens)
                .temperature(temperature)
                .timeout(requestTimeout)
                .logRequests(logRequests)
                .logResponses(logResponses)
                .build();
    }
}
