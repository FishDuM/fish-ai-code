package hk.ljx.fishaicode.ai;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import dev.langchain4j.community.store.memory.chat.redis.RedisChatMemoryStore;
import dev.langchain4j.data.message.ToolExecutionResultMessage;
import dev.langchain4j.memory.ChatMemory;
import dev.langchain4j.memory.chat.MessageWindowChatMemory;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.service.AiServices;
import hk.ljx.fishaicode.ai.guardrail.PromptSafetyInputGuardrail;
import hk.ljx.fishaicode.ai.tools.*;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.generator.RetryOutputGuardrail;
import hk.ljx.fishaicode.modal.enums.CodeGenTypeEnum;
import hk.ljx.fishaicode.service.ChatHistoryService;
import hk.ljx.fishaicode.utils.SpringContextUtil;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
@Slf4j
public class AiCodeGeneratorServiceFactory {

    @Resource(name = "openAiChatModel")
    private ChatModel chatModel;

    @Resource
    private RedisChatMemoryStore redisChatMemoryStore;

    @Resource
    private ChatHistoryService chatHistoryService;

    @Resource
    private ToolManager toolManager;

    @Bean
    public AiCodeGeneratorService aiCodeGeneratorService() {
        return createAiCodeGeneratorService(0);
    }

    /**
     * ai 记忆服务
     * @param appId
     * @param type
     * @return
     */
    public AiCodeGeneratorService createAiCodeGeneratorService(long appId, CodeGenTypeEnum type) {
        log.info("为 appId: {} 创建新的 AI 服务实例", appId);
        MessageWindowChatMemory chatMemory = MessageWindowChatMemory.builder()
                .id(appId)
                .chatMemoryStore(redisChatMemoryStore)
                .maxMessages(50)
                .build();
        // 从数据库加载对话历史到记忆中
        chatHistoryService.loadChatHistoryToMemory(appId, chatMemory, 20);
        return switch (type) {
            case VUE_PROJECT -> {
                StreamingChatModel reasoningStreamingChatModel = SpringContextUtil.getBean("reasoningStreamingChatModelPrototype", StreamingChatModel.class);
                yield AiServices.builder(AiCodeGeneratorService.class)
                        .chatModel(chatModel)
                        .chatMemoryProvider(memoryId -> chatMemory)
                        .streamingChatModel(reasoningStreamingChatModel)
                        .tools(toolManager.getAllTools())
                        // 处理工具调用幻觉问题
                        .hallucinatedToolNameStrategy(toolExecutionRequest -> ToolExecutionResultMessage.from(toolExecutionRequest, "Error: there is no tool called " + toolExecutionRequest.name()))
                        .maxSequentialToolsInvocations(30) // 最多调用 30 次工具
                        .inputGuardrails(new PromptSafetyInputGuardrail()) // 添加输入护轨
//                        .outputGuardrails(new RetryOutputGuardrail()) // 添加輸出互軌
                        .build();
            }
            case HTML,MULTI_FILE ->{
                StreamingChatModel openAiStreamingChatModel = SpringContextUtil.getBean("streamingChatModelPrototype", StreamingChatModel.class);
                yield AiServices.builder(AiCodeGeneratorService.class)
                        .chatMemory(chatMemory)
                        .chatModel(chatModel)
                        .streamingChatModel(openAiStreamingChatModel)
                        .maxSequentialToolsInvocations(30) // 最多调用 30 次工具
                        .inputGuardrails(new PromptSafetyInputGuardrail()) // 添加输入护轨
//                        .outputGuardrails(new RetryOutputGuardrail()) // 添加輸出互軌
                        .build();
            }
            default -> throw new BusinessException(ErrorCode.SYSTEM_ERROR, "不支持的代码生成类型" + type.getValue());
        };
    }

    private final Cache<String, AiCodeGeneratorService> serviceCache = Caffeine.newBuilder()
            .maximumSize(1000)
            .expireAfterWrite(Duration.ofMinutes(30))
            .expireAfterAccess(Duration.ofMinutes(30))
            .removalListener((key, value, cause) -> {
                log.info("AI 服务实例移除,缓存键:{},原因:{}", key, cause);
            }).build();

    /**
     * 根据 appId 获取服务（带缓存）
     */
    public AiCodeGeneratorService createAiCodeGeneratorService(long appId) {
        return getAiCodeGeneratorService(appId, CodeGenTypeEnum.HTML);
    }

    /**
     * 根据 appId 获取服务（带缓存） 支持代码类型参数
     */
    public AiCodeGeneratorService getAiCodeGeneratorService(long appId, CodeGenTypeEnum codeGenTypeEnum) {
        String cacheKey = buildCacheKey(appId, codeGenTypeEnum);
        return serviceCache.get(cacheKey, key -> createAiCodeGeneratorService(appId, codeGenTypeEnum));
    }

    /**
     * 构建缓存键
     */
    private String buildCacheKey(long appId, CodeGenTypeEnum codeGenType) {
        return appId + "_" + codeGenType.getValue();
    }
}
