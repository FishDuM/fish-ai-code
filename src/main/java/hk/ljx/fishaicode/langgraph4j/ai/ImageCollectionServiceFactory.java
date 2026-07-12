package hk.ljx.fishaicode.langgraph4j.ai;

import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.service.AiServices;
import hk.ljx.fishaicode.langgraph4j.tools.ImageSearchTool;
import hk.ljx.fishaicode.langgraph4j.tools.UndrawIllustrationTool;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Slf4j
@Configuration
public class ImageCollectionServiceFactory {

    @Resource
    @Qualifier("routingChatModelPrototype")
    private ChatModel chatModel;

    @Resource
    private ImageSearchTool imageSearchTool;

    @Resource
    private UndrawIllustrationTool undrawIllustrationTool;

//    @Resource
//    private MermaidDiagramTool mermaidDiagramTool;
//
//    @Resource
//    private LogoGeneratorTool logoGeneratorTool;

    /**
     * 创建图片收集 AI 服务
     */
    @Bean
    public ImageCollectionService createImageCollectionService() {
        return AiServices.builder(ImageCollectionService.class)
                .chatModel(chatModel)
                .tools(
                        imageSearchTool,
                        undrawIllustrationTool
                )
//        mermaidDiagramTool, logoGeneratorTool
                .build();
    }
}
