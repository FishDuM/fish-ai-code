package hk.ljx.fishaicode.ai;

import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.service.AiServices;
import hk.ljx.fishaicode.utils.SpringContextUtil;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * AI 应用命名服务工厂
 * 动态获取多例的路由 ChatModel 创建命名服务，支持并发
 */
@Configuration
public class AiAppNameServiceFactory {

    /**
     * 创建 AI 应用命名服务实例
     */
    public AiAppNameService createAiAppNameService() {
        // 动态获取多例的路由 ChatModel，支持并发
        ChatModel chatModel = SpringContextUtil.getBean("routingChatModelPrototype", ChatModel.class);
        return AiServices.builder(AiAppNameService.class)
                .chatModel(chatModel)
                .build();
    }

    /**
     * 默认提供一个 Bean
     */
    @Bean
    public AiAppNameService aiAppNameService() {
        return createAiAppNameService();
    }
}
