package hk.ljx.fishaicode.ai;

import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.service.AiServices;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Configuration;

/**
 * AI 应用命名服务工厂
 * 动态获取多例的路由 ChatModel 创建命名服务，支持并发
 */
@Configuration
public class AiAppNameServiceFactory {

    private final ObjectProvider<ChatModel> routingChatModelPrototype;

    public AiAppNameServiceFactory(
            @Qualifier("routingChatModelPrototype") ObjectProvider<ChatModel> routingChatModelPrototype) {
        this.routingChatModelPrototype = routingChatModelPrototype;
    }

    /**
     * 创建 AI 应用命名服务实例
     */
    public AiAppNameService createAiAppNameService() {
        // 动态获取多例的路由 ChatModel，支持并发
        ChatModel chatModel = routingChatModelPrototype.getObject();
        return AiServices.builder(AiAppNameService.class)
                .chatModel(chatModel)
                .build();
    }

}
