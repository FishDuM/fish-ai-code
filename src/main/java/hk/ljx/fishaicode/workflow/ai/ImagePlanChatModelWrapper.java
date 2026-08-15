package hk.ljx.fishaicode.workflow.ai;

import dev.langchain4j.model.chat.ChatModel;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class ImagePlanChatModelWrapper {

    private final ChatModel chatModel;

    public ChatModel chatModel() {
        return chatModel;
    }
}
