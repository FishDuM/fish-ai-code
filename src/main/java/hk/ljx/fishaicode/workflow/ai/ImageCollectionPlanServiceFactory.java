package hk.ljx.fishaicode.workflow.ai;

import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.service.AiServices;
import jakarta.annotation.Resource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 图片搜集规划工厂
 */
@Configuration
public class ImageCollectionPlanServiceFactory {

    @Resource
    @Qualifier("imagePlanChatModelPrototype")
    private ChatModel chatModel;

    @Bean
    public ImageCollectionPlanService createImageCollectionPlanService() {
        return AiServices.builder(ImageCollectionPlanService.class)
                .chatModel(chatModel)
                .build();
    }
}
