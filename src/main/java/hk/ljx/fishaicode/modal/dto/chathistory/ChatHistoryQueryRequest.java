package hk.ljx.fishaicode.modal.dto.chathistory;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 游标分页查询某个应用的对话历史请求
 */
@Data
public class ChatHistoryQueryRequest implements Serializable {

    /**
     * 应用 id
     */
    private Long appId;

    /**
     * 游标：获取此时间之前的消息（当前已加载最早消息的 createTime）
     */
    private LocalDateTime before;

    /**
     * 获取条数（默认 10）
     */
    private int limit = 10;

    private static final long serialVersionUID = 1L;
}
