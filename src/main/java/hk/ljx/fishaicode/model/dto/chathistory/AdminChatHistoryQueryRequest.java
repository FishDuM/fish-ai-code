package hk.ljx.fishaicode.model.dto.chathistory;

import hk.ljx.fishaicode.common.PageRequest;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.io.Serializable;

/**
 * 管理员分页查询对话历史请求
 */
@EqualsAndHashCode(callSuper = true)
@Data
public class AdminChatHistoryQueryRequest extends PageRequest implements Serializable {

    /**
     * 应用 id
     */
    @Min(value = 1, message = "应用 id 不合法")
    private Long appId;

    /**
     * 用户 id
     */
    @Min(value = 1, message = "用户 id 不合法")
    private Long userId;

    /**
     * 消息类型（user/ai）
     */
    @Size(max = 10, message = "消息类型最长 10 个字符")
    private String messageType;

    private static final long serialVersionUID = 1L;
}
