package hk.ljx.fishaicode.workflow.ai;

import dev.langchain4j.service.AiServices;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 图片搜集规划工厂
 */
@Configuration
@RequiredArgsConstructor
public class ImageCollectionPlanServiceFactory {

    private final ImagePlanChatModelWrapper imagePlanChatModelWrapper;

    @Bean
    public ImageCollectionPlanService createImageCollectionPlanService() {
        return AiServices.builder(ImageCollectionPlanService.class)
                .chatModel(imagePlanChatModelWrapper.chatModel())
                .build();
    }
}
