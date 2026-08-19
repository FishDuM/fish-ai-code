package hk.ljx.fishaicode.core.handler;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import hk.ljx.fishaicode.ai.model.message.*;
import hk.ljx.fishaicode.ai.tools.BaseTool;
import hk.ljx.fishaicode.ai.tools.ToolManager;
import hk.ljx.fishaicode.constant.AppConstant;
import hk.ljx.fishaicode.core.builder.VueProjectBuilder;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.model.entity.User;
import hk.ljx.fishaicode.model.enums.MessageTypeEnum;
import hk.ljx.fishaicode.service.ChatHistoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.util.HashSet;
import java.util.Set;

/**
 * JSON 消息流处理器
 * 处理 VUE_PROJECT 类型的复杂流式响应，包含工具调用信息
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JsonMessageStreamHandler {

    private final VueProjectBuilder vueProjectBuilder;

    private final ToolManager toolManager;

    /**
     * 处理 TokenStream（VUE_PROJECT）
     * 解析 JSON 消息并重组为完整的响应格式
     *
     * @param originFlux         原始流
     * @param chatHistoryService 聊天历史服务
     * @param appId              应用ID
     * @param loginUser          登录用户
     * @return 处理后的流
     */
    public Flux<String> handle(Flux<String> originFlux,
                               ChatHistoryService chatHistoryService,
                               long appId, User loginUser) {
        return Flux.create(sink -> {
            StringBuilder chatHistoryStringBuilder = new StringBuilder();
            Set<String> seenToolIds = new HashSet<>();
            originFlux.subscribe(
                    chunk -> {
                        try {
                            String output = handleJsonMessageChunk(chunk, chatHistoryStringBuilder, seenToolIds);
                            if (StrUtil.isNotEmpty(output)) {
                                sink.next(output);
                            }
                        } catch (Exception e) {
                            log.warn("跳过无法解析的 Vue 流消息，appId: {}", appId, e);
                        }
                    },
                    error -> {
                        try {
                            log.error("AI 回复失败，appId: {}", appId, error);
                            chatHistoryService.addChatHistory(appId, loginUser.getId(),
                                    "AI回复失败，请重试", MessageTypeEnum.AI.getValue());
                        } catch (Exception e) {
                            log.error("保存 AI 失败消息到对话历史出错，appId: {}", appId, e);
                        }
                        sink.error(error);
                    },
                    () -> {
                        // 构建成功后再结束生成流。
                        Thread.ofVirtual().name("vue-build-result-" + appId).start(() -> {
                            String projectPath = AppConstant.CODE_OUTPUT_ROOT_DIR + "/vue_project_" + appId;
                            try {
                                if (vueProjectBuilder.buildProjectWhenReady(projectPath)) {
                                    saveCompletionSummary(chatHistoryService, appId, loginUser,
                                            "已完成 Vue 项目生成，项目文件已更新。");
                                    sink.complete();
                                } else {
                                    saveCompletionSummary(chatHistoryService, appId, loginUser,
                                            "Vue 项目构建失败，请检查生成代码后重试。");
                                    sink.error(new BusinessException(ErrorCode.OPERATION_ERROR,
                                            "Vue 项目构建失败，请检查生成代码后重试"));
                                }
                            } catch (Exception e) {
                                log.error("Vue 项目构建检查异常，appId: {}", appId, e);
                                saveCompletionSummary(chatHistoryService, appId, loginUser,
                                        "Vue 项目构建失败，请重试。");
                                sink.error(e);
                            }
                        });
                    }
            );
        });
    }

    private void saveCompletionSummary(ChatHistoryService chatHistoryService, long appId, User loginUser,
                                       String summary) {
        try {
            // Vue 模式的真实代码和工具参数都已经落在项目目录；聊天历史只保留结果摘要。
            // 这样下一轮可通过 readDir/readFile 获取当前代码，而不会回放整站源码。
            chatHistoryService.addChatHistory(appId, loginUser.getId(), summary, MessageTypeEnum.AI.getValue());
        } catch (Exception e) {
            log.error("保存 Vue 生成结果到对话历史出错，appId: {}", appId, e);
        }
    }

    /**
     * 解析并收集 TokenStream 数据
     */
    private String handleJsonMessageChunk(String chunk, StringBuilder chatHistoryStringBuilder, Set<String> seenToolIds) {
        if (chunk == null || !chunk.trim().startsWith("{")) {
            return "";
        }
        StreamMessage streamMessage;
        try {
            streamMessage = JSONUtil.toBean(chunk, StreamMessage.class);
        } catch (Exception e) {
            return "";
        }
        if (streamMessage == null || streamMessage.getType() == null) {
            return "";
        }
        StreamMessageTypeEnum typeEnum = StreamMessageTypeEnum.getEnumByValue(streamMessage.getType());
        if (typeEnum == null) {
            log.warn("收到未知消息类型: {}", streamMessage.getType());
            return "";
        }
        switch (typeEnum) {
            case AI_RESPONSE -> {
                AiResponseMessage aiMessage = JSONUtil.toBean(chunk, AiResponseMessage.class);
                String data = aiMessage.getData();
                if (data != null) {
                    chatHistoryStringBuilder.append(data);
                    return data;
                }
                return "";
            }
            case TOOL_REQUEST -> {
                ToolRequestMessage toolRequestMessage = JSONUtil.toBean(chunk, ToolRequestMessage.class);
                String toolId = toolRequestMessage.getId();
                // 检查是否是第一次看到这个工具 ID
                if (toolId != null && !seenToolIds.contains(toolId)) {
                    // 第一次调用这个工具，记录 ID 并完整返回工具信息
                    seenToolIds.add(toolId);
                    BaseTool tool = toolManager.getTool(toolRequestMessage.getName());
                    if (tool == null) {
                        log.warn("未知工具名: {}", toolRequestMessage.getName());
                        return "";
                    }
                    return tool.generateToolRequestResponse();
                } else {
                    // 不是第一次调用这个工具，直接返回空
                    return "";
                }
            }
            case TOOL_EXECUTED -> {
                ToolExecutedMessage toolExecutedMessage = JSONUtil.toBean(chunk, ToolExecutedMessage.class);
                String toolName = toolExecutedMessage.getName();
                BaseTool tool = toolManager.getTool(toolName);
                if (tool == null) {
                    log.warn("未知工具名: {}", toolName);
                    return "";
                }
                String result;
                try {
                    JSONObject jsonObject = JSONUtil.parseObj(toolExecutedMessage.getArguments());
                    result = tool.generateToolExecutedResult(jsonObject);
                } catch (Exception e) {
                    log.warn("解析工具执行结果失败，工具: {}", toolName, e);
                    return "";
                }
                // 输出前端和要持久化的内容
                String output = String.format("\n\n%s\n\n", result);
                chatHistoryStringBuilder.append(output);
                return output;
            }
            default -> {
                log.error("不支持的消息类型: {}", typeEnum);
                return "";
            }
        }
    }
}
