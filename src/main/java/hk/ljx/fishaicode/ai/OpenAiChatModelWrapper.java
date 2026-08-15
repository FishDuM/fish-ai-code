package hk.ljx.fishaicode.ai;

import dev.langchain4j.model.chat.ChatModel;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class OpenAiChatModelWrapper {

    private final ChatModel chatModel;

    public ChatModel chatModel() {
        return chatModel;
    }
}
