package hk.ljx.fishaicode.core.handler;

import hk.ljx.fishaicode.model.entity.User;
import hk.ljx.fishaicode.model.enums.MessageTypeEnum;
import hk.ljx.fishaicode.service.ChatHistoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

/**
 * 简单文本流处理器
 * 处理 HTML 和 MULTI_FILE 类型的流式响应
 */
@Slf4j
@Component
public class SimpleTextStreamHandler {

    /**
     * 处理传统流（HTML, MULTI_FILE）
     * 直接收集完整的文本响应
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
        StringBuilder aiResponseBuilder = new StringBuilder();
        return originFlux
                .map(chunk -> {
                    // 收集AI响应内容
                    aiResponseBuilder.append(chunk);
                    return chunk;
                })
                .doOnComplete(() -> {
                    // 保存历史失败不能把成功流变成失败流（doOnComplete 抛异常会转为 onError）
                    try {
                        chatHistoryService.addChatHistory(appId, loginUser.getId(), aiResponseBuilder.toString(), MessageTypeEnum.AI.getValue());
                    } catch (Exception e) {
                        log.error("保存 AI 消息到对话历史出错，appId: {}", appId, e);
                    }
                })
                .doOnError(error -> {
                    // 历史只写固定文案，原始异常只记日志，避免泄露内部错误
                    log.error("AI 回复失败，appId: {}", appId, error);
                    try {
                        chatHistoryService.addChatHistory(appId, loginUser.getId(), "AI回复失败，请重试", MessageTypeEnum.AI.getValue());
                    } catch (Exception e) {
                        log.error("保存 AI 失败消息到对话历史出错，appId: {}", appId, e);
                    }
                });
    }
}
