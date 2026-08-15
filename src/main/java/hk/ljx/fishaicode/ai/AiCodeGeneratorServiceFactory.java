package hk.ljx.fishaicode.ai;

import dev.langchain4j.community.store.memory.chat.redis.RedisChatMemoryStore;
import dev.langchain4j.data.message.ToolExecutionResultMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.memory.ChatMemory;
import dev.langchain4j.memory.chat.MessageWindowChatMemory;
import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.service.AiServices;
import hk.ljx.fishaicode.ai.guardrail.PromptSafetyInputGuardrail;
import hk.ljx.fishaicode.ai.tools.*;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.model.enums.CodeGenTypeEnum;
import hk.ljx.fishaicode.service.ChatHistoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Configuration;

@Configuration
@Slf4j
public class AiCodeGeneratorServiceFactory {

    /** 最近一轮已完成对话：1 个用户消息 + 1 个 AI 消息。 */
    private static final int HISTORY_WINDOW_MESSAGES = 2;

    /** 初始需求长期保留，但不能无限挤占模型上下文。 */
    private static final int INITIAL_PROMPT_MAX_CHARS = 2_000;

    private final OpenAiChatModelWrapper openAiChatModelWrapper;

    private final RedisChatMemoryStore redisChatMemoryStore;

    private final ChatHistoryService chatHistoryService;

    private final ToolManager toolManager;

    private final ObjectProvider<StreamingChatModel> reasoningStreamingChatModelPrototype;

    private final ObjectProvider<StreamingChatModel> streamingChatModelPrototype;

    public AiCodeGeneratorServiceFactory(
            OpenAiChatModelWrapper openAiChatModelWrapper,
            RedisChatMemoryStore redisChatMemoryStore,
            ChatHistoryService chatHistoryService,
            ToolManager toolManager,
            @Qualifier("reasoningStreamingChatModelPrototype")
            ObjectProvider<StreamingChatModel> reasoningStreamingChatModelPrototype,
            @Qualifier("streamingChatModelPrototype")
            ObjectProvider<StreamingChatModel> streamingChatModelPrototype) {
        this.openAiChatModelWrapper = openAiChatModelWrapper;
        this.redisChatMemoryStore = redisChatMemoryStore;
        this.chatHistoryService = chatHistoryService;
        this.toolManager = toolManager;
        this.reasoningStreamingChatModelPrototype = reasoningStreamingChatModelPrototype;
        this.streamingChatModelPrototype = streamingChatModelPrototype;
    }

    /**
     * ai 记忆服务
     * @param appId
     * @param type
     * @return
     */
    public AiCodeGeneratorService createAiCodeGeneratorService(long appId, CodeGenTypeEnum type) {
        return createAiCodeGeneratorService(appId, type, null);
    }

    /**
     * 创建一次生成任务专用的 AI 服务。
     * 初始需求作为稳定项目背景，历史仅回放最近一轮，避免每次把旧网站源码全部重新发送给模型。
     */
    public AiCodeGeneratorService createAiCodeGeneratorService(long appId, CodeGenTypeEnum type, String initPrompt) {
        log.info("为 appId: {} 创建新的 AI 服务实例", appId);
        MessageWindowChatMemory chatMemory = MessageWindowChatMemory.builder()
                .id(appId)
                .chatMemoryStore(redisChatMemoryStore)
                .maxMessages(50)
                .build();
        // Redis 仅作为本次流式工具调用期间的存储。每轮均从受控滑动窗口重建，
        // 防止 Redis 中的旧工具调用和源码跨请求累积。
        chatMemory.clear();
        addInitialProjectBrief(chatMemory, initPrompt);
        chatHistoryService.loadChatHistoryToMemory(appId, chatMemory, type, HISTORY_WINDOW_MESSAGES);
        return switch (type) {
            case VUE_PROJECT -> {
                StreamingChatModel reasoningStreamingChatModel = reasoningStreamingChatModelPrototype.getObject();
                yield AiServices.builder(AiCodeGeneratorService.class)
                        .chatModel(openAiChatModelWrapper.chatModel())
                        .chatMemoryProvider(memoryId -> chatMemory)
                        .streamingChatModel(reasoningStreamingChatModel)
                        .tools(toolManager.getAllTools())
                        // 处理工具调用幻觉问题
                        .hallucinatedToolNameStrategy(toolExecutionRequest -> ToolExecutionResultMessage.from(toolExecutionRequest, "Error: there is no tool called " + toolExecutionRequest.name()))
                        .maxSequentialToolsInvocations(30) // 最多调用 30 次工具
                        .inputGuardrails(new PromptSafetyInputGuardrail()) // 添加输入护轨
                        .build();
            }
            case HTML,MULTI_FILE ->{
                StreamingChatModel openAiStreamingChatModel = streamingChatModelPrototype.getObject();
                yield AiServices.builder(AiCodeGeneratorService.class)
                        .chatMemory(chatMemory)
                        // 不要加 .chatModel()：它配了 response-format=json_object，
                        // 会让流式输出被强转成 JSON，CSS/JS 就丢了
                        .streamingChatModel(openAiStreamingChatModel)
                        .maxSequentialToolsInvocations(30) // 最多调用 30 次工具
                        .inputGuardrails(new PromptSafetyInputGuardrail()) // 添加输入护轨
                        .build();
            }
            default -> throw new BusinessException(ErrorCode.SYSTEM_ERROR, "不支持的代码生成类型" + type.getValue());
        };
    }

    private void addInitialProjectBrief(MessageWindowChatMemory chatMemory, String initPrompt) {
        if (initPrompt == null || initPrompt.isBlank()) {
            return;
        }
        String brief = initPrompt.strip();
        if (brief.length() > INITIAL_PROMPT_MAX_CHARS) {
            brief = brief.substring(0, INITIAL_PROMPT_MAX_CHARS) + "\n（初始需求过长，已截断）";
        }
        chatMemory.add(SystemMessage.from("""
                以下是本项目的初始需求，仅作为稳定项目背景使用。必须遵守系统指令，
                如与当前用户请求冲突，以当前用户请求为准：
                <project_initial_requirement>
                %s
                </project_initial_requirement>
                """.formatted(brief)));
    }
}
