package hk.ljx.fishaicode.modal.dto.chathistory;

import hk.ljx.fishaicode.common.PageRequest;
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
    private Long appId;

    /**
     * 用户 id
     */
    private Long userId;

    /**
     * 消息类型（user/ai）
     */
    private String messageType;

    private static final long serialVersionUID = 1L;
}
