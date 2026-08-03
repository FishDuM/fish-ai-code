package hk.ljx.fishaicode.service.impl;

import com.mybatisflex.core.query.QueryWrapper;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.memory.chat.MessageWindowChatMemory;
import hk.ljx.fishaicode.model.entity.ChatHistory;
import hk.ljx.fishaicode.model.enums.CodeGenTypeEnum;
import hk.ljx.fishaicode.model.enums.MessageTypeEnum;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

class ChatHistoryServiceImplTest {

    @Test
    void htmlContextKeepsOnlyTheLatestCompletedTurn() {
        ChatHistoryServiceImpl service = historyServiceReturning(latestCompletedTurnInDescendingOrder());
        MessageWindowChatMemory memory = MessageWindowChatMemory.withMaxMessages(10);

        int loaded = service.loadChatHistoryToMemory(1L, memory, CodeGenTypeEnum.HTML, 2);

        assertEquals(2, loaded);
        assertEquals(2, memory.messages().size());
        assertInstanceOf(UserMessage.class, memory.messages().getFirst());
    }

    @Test
    void vueContextKeepsUserIntentButDoesNotReplayAiToolHistory() {
        ChatHistoryServiceImpl service = historyServiceReturning(latestCompletedTurnInDescendingOrder());
        MessageWindowChatMemory memory = MessageWindowChatMemory.withMaxMessages(10);

        int loaded = service.loadChatHistoryToMemory(1L, memory, CodeGenTypeEnum.VUE_PROJECT, 2);

        assertEquals(1, loaded);
        assertEquals(1, memory.messages().size());
        memory.messages().forEach(message -> assertInstanceOf(UserMessage.class, message));
    }

    private static ChatHistoryServiceImpl historyServiceReturning(List<ChatHistory> history) {
        return new InMemoryChatHistoryService(history);
    }

    /** 模拟数据库 LIMIT 2 后按时间倒序返回，服务会反转为模型需要的时间正序。 */
    private static List<ChatHistory> latestCompletedTurnInDescendingOrder() {
        return List.of(
                history("ai-2", MessageTypeEnum.AI),
                history("user-2", MessageTypeEnum.USER)
        );
    }

    private static ChatHistory history(String message, MessageTypeEnum type) {
        return ChatHistory.builder().message(message).messageType(type.getValue()).build();
    }

    /** 避免测试依赖 Mockito 的运行时 agent。 */
    private static class InMemoryChatHistoryService extends ChatHistoryServiceImpl {

        private final List<ChatHistory> history;

        private InMemoryChatHistoryService(List<ChatHistory> history) {
            this.history = history;
        }

        @Override
        public List<ChatHistory> list(QueryWrapper queryWrapper) {
            return history;
        }
    }
}
