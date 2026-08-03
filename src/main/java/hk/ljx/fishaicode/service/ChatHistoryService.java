package hk.ljx.fishaicode.service;

import com.mybatisflex.core.paginate.Page;
import com.mybatisflex.core.service.IService;
import dev.langchain4j.memory.chat.MessageWindowChatMemory;
import hk.ljx.fishaicode.model.dto.chathistory.AdminChatHistoryQueryRequest;
import hk.ljx.fishaicode.model.entity.ChatHistory;
import hk.ljx.fishaicode.model.enums.CodeGenTypeEnum;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 对话历史 服务层。
 *
 * @author fish
 */
public interface ChatHistoryService extends IService<ChatHistory> {

    /**
     * 保存对话历史
     *
     * @param appId       应用 id
     * @param userId      用户 id
     * @param message     消息内容
     * @param messageType 消息类型（user/ai）
     * @return 是否保存成功
     */
    boolean addChatHistory(Long appId, Long userId, String message, String messageType);

    /**
     * 将有限的滑动窗口历史装入本次模型调用的临时记忆。
     * Vue 项目只回放用户意图，代码由模型通过文件工具按需读取，避免工具写入的源码再次进入上下文。
     */
    int loadChatHistoryToMemory(Long appId, MessageWindowChatMemory chatMemory,
                                CodeGenTypeEnum codeGenType, int maxCount);

    /**
     * 游标分页：获取某个应用在指定时间之前的消息（按时间正序返回）
     *
     * @param appId  应用 id
     * @param before 游标时间
     * @param beforeId 同一时间下的游标消息 ID，可为空以兼容旧客户端
     * @param limit  条数
     * @return 消息列表（时间正序）
     */
    List<ChatHistory> listChatHistoryBefore(Long appId, LocalDateTime before, Long beforeId, int limit);

    /**
     * 查询某个应用最新的 N 条消息（按时间正序返回）
     *
     * @param appId 应用 id
     * @param limit 条数
     * @return 消息列表
     */
    List<ChatHistory> listLatestChatHistory(Long appId, int limit);

    /**
     * 删除某个应用的所有对话历史
     *
     * @param appId 应用 id
     * @return 是否删除成功
     */
    boolean removeByAppId(Long appId);

    /**
     * 管理员分页查询所有对话历史
     *
     * @param adminChatHistoryQueryRequest 查询请求
     * @return 分页结果
     */
    Page<ChatHistory> adminListChatHistoryByPage(AdminChatHistoryQueryRequest adminChatHistoryQueryRequest);
}
