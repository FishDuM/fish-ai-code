package hk.ljx.fishaicode.ai.model.message;

import dev.langchain4j.model.chat.response.PartialToolCall;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * 工具调用消息
 */
@Data
@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
public class ToolRequestMessage extends StreamMessage {

    private String id;

    private String name;

    private String arguments;

    /**
     * 基于官方 1.18.1 的流式工具调用回调（{@link PartialToolCall}）构建。
     * 该回调在模型流式吐出工具参数时按片触发，每次携带工具名与当前参数片段。
     */
    public ToolRequestMessage(PartialToolCall partialToolCall) {
        super(StreamMessageTypeEnum.TOOL_REQUEST.getValue());
        this.id = partialToolCall.id();
        this.name = partialToolCall.name();
        this.arguments = partialToolCall.partialArguments();
    }
}
