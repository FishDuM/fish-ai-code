package hk.ljx.fishaicode.ai;

import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.service.AiServices;
import hk.ljx.fishaicode.utils.SpringContextUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * AI内容安全审查服务工厂
 * 复用路由模型（routingChatModelPrototype）进行敏感判断
 */
@Slf4j
@Component
public class SensitiveCheckFactory {

    /**
     * 创建内容安全审查服务实例
     */
    public SensitiveCheck create() {
        ChatModel chatModel = SpringContextUtil.getBean("routingChatModelPrototype", ChatModel.class);
        return AiServices.builder(SensitiveCheck.class)
                .chatModel(chatModel)
                .build();
    }
}
