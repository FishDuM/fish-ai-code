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
import jakarta.annotation.Resource;
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
public class JsonMessageStreamHandler {

    @Resource
    private VueProjectBuilder vueProjectBuilder;

    @Resource
    private ToolManager  toolManager;

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
                        String output = handleJsonMessageChunk(chunk, chatHistoryStringBuilder, seenToolIds);
                        if (StrUtil.isNotEmpty(output)) {
                            sink.next(output);
                        }
                    },
                    error -> {
                        try {
                            String errorMessage = "AI回复失败: " + error.getMessage();
                            chatHistoryService.addChatHistory(appId, loginUser.getId(), errorMessage, MessageTypeEnum.AI.getValue());
                        } catch (Exception e) {
                            // 历史记录失败不能吞掉原始错误：记日志并继续上报原始异常，
                            // 否则外层 GenerationCoordinator 收不到 complete/error，锁会永久泄漏。
                            log.error("保存 AI 失败消息到对话历史出错，appId: {}", appId, e);
                        }
                        sink.error(error);
                    },
                    () -> {
                        String aiResponse = chatHistoryStringBuilder.toString();
                        try {
                            chatHistoryService.addChatHistory(appId, loginUser.getId(), aiResponse, MessageTypeEnum.AI.getValue());
                        } catch (Exception e) {
                            // 与 error 回调同理：保存历史失败不能阻止 onComplete，
                            // 否则外层锁永远不释放、该应用永久锁死。
                            log.error("保存 AI 消息到对话历史出错，appId: {}", appId, e);
                        }
                        // 必须等构建成功，才允许向客户端结束生成流。
                        Thread.ofVirtual().name("vue-build-result-" + appId).start(() -> {
                            String projectPath = AppConstant.CODE_OUTPUT_ROOT_DIR + "/vue_project_" + appId;
                            try {
                                if (vueProjectBuilder.buildProjectWhenReady(projectPath)) {
                                    sink.complete();
                                } else {
                                    sink.error(new BusinessException(ErrorCode.OPERATION_ERROR,
                                            "Vue 项目构建失败，请检查生成代码后重试"));
                                }
                            } catch (Exception e) {
                                // 构建检查本身抛异常（目录损坏等）也必须终结流，
                                // 否则锁永远不释放、该应用永久锁死。
                                log.error("Vue 项目构建检查异常，appId: {}", appId, e);
                                sink.error(e);
                            }
                        });
                    }
            );
        });
    }

    /**
     * 解析并收集 TokenStream 数据
     */
    private String handleJsonMessageChunk(String chunk, StringBuilder chatHistoryStringBuilder, Set<String> seenToolIds) {
        // 解析 JSON
        StreamMessage streamMessage = JSONUtil.toBean(chunk, StreamMessage.class);
        StreamMessageTypeEnum typeEnum = StreamMessageTypeEnum.getEnumByValue(streamMessage.getType());
        switch (typeEnum) {
            case AI_RESPONSE -> {
                AiResponseMessage aiMessage = JSONUtil.toBean(chunk, AiResponseMessage.class);
                String data = aiMessage.getData();
                // 直接拼接响应
                chatHistoryStringBuilder.append(data);
                return data;
            }
            case TOOL_REQUEST -> {
                ToolRequestMessage toolRequestMessage = JSONUtil.toBean(chunk, ToolRequestMessage.class);
                String toolId = toolRequestMessage.getId();
                // 检查是否是第一次看到这个工具 ID
                if (toolId != null && !seenToolIds.contains(toolId)) {
                    // 第一次调用这个工具，记录 ID 并完整返回工具信息
                    seenToolIds.add(toolId);
                    BaseTool tool = toolManager.getTool(toolRequestMessage.getName());
                    return tool.generateToolRequestResponse();
                } else {
                    // 不是第一次调用这个工具，直接返回空
                    return "";
                }
            }
            case TOOL_EXECUTED -> {
                ToolExecutedMessage toolExecutedMessage = JSONUtil.toBean(chunk, ToolExecutedMessage.class);
                String toolName = toolExecutedMessage.getName();
                JSONObject jsonObject = JSONUtil.parseObj(toolExecutedMessage.getArguments());
                // 根据工具名称获取工具实例并生成相应的结果格式
                BaseTool tool = toolManager.getTool(toolName);
                String result = tool.generateToolExecutedResult(jsonObject);
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
