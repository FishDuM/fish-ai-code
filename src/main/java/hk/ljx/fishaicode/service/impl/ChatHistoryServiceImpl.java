package hk.ljx.fishaicode.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import com.mybatisflex.core.paginate.Page;
import com.mybatisflex.core.query.QueryWrapper;
import com.mybatisflex.spring.service.impl.ServiceImpl;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.memory.chat.MessageWindowChatMemory;
import hk.ljx.fishaicode.common.PageSortUtils;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.exception.ThrowUtils;
import hk.ljx.fishaicode.model.dto.chathistory.AdminChatHistoryQueryRequest;
import hk.ljx.fishaicode.model.entity.ChatHistory;
import hk.ljx.fishaicode.mapper.ChatHistoryMapper;
import hk.ljx.fishaicode.model.enums.MessageTypeEnum;
import hk.ljx.fishaicode.service.ChatHistoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 对话历史 服务层实现。
 *
 * @author fish
 */
@Slf4j
@Service
public class ChatHistoryServiceImpl extends ServiceImpl<ChatHistoryMapper, ChatHistory> implements ChatHistoryService {

    private static final java.util.Set<String> ALLOWED_SORT_FIELDS = java.util.Set.of(
            "id", "appId", "userId", "messageType", "createTime", "updateTime"
    );

    @Override
    public boolean addChatHistory(Long appId, Long userId, String message, String messageType) {
        // 1. 校验
        ThrowUtils.throwIf(appId == null || appId <= 0, ErrorCode.PARAMS_ERROR, "应用 ID 不能为空");
        ThrowUtils.throwIf(userId == null || userId <= 0, ErrorCode.PARAMS_ERROR, "用户 ID 不能为空");
        ThrowUtils.throwIf(StrUtil.isBlank(message), ErrorCode.PARAMS_ERROR, "消息内容不能为空");
        ThrowUtils.throwIf(StrUtil.isBlank(messageType), ErrorCode.PARAMS_ERROR, "消息类型不能为空");
        // 2. 构建对象
        ChatHistory chatHistory = ChatHistory.builder()
                .appId(appId)
                .userId(userId)
                .message(message)
                .messageType(messageType)
                .build();
        // 3. 保存
        return this.save(chatHistory);
    }

    @Override
    public int loadChatHistoryToMemory(Long appId, MessageWindowChatMemory chatMemory, int maxCount) {
        try {
            // 取最新 maxCount 条（不跳过）：当前用户消息尚未落库，跳过会丢掉上一条 AI 回复
            QueryWrapper queryWrapper = QueryWrapper.create()
                    .eq(ChatHistory::getAppId, appId)
                    .orderBy(ChatHistory::getCreateTime, false)
                    .orderBy(ChatHistory::getId, false)
                    .limit(0, maxCount);
            List<ChatHistory> historyList = this.list(queryWrapper);
            if (CollUtil.isEmpty(historyList)) {
                return 0;
            }
            // 反转列表，确保按时间正序（老的在前，新的在后）
            historyList = historyList.reversed();
            // 按时间顺序添加到记忆中
            int loadedCount = 0;
            // 先清理历史缓存，防止重复加载
            chatMemory.clear();
            for (ChatHistory history : historyList) {
                if (MessageTypeEnum.USER.getValue().equals(history.getMessageType())) {
                    chatMemory.add(UserMessage.from(history.getMessage()));
                    loadedCount++;
                } else if (MessageTypeEnum.AI.getValue().equals(history.getMessageType())) {
                    chatMemory.add(AiMessage.from(history.getMessage()));
                    loadedCount++;
                }
            }
            log.info("成功为 appId: {} 加载了 {} 条历史对话", appId, loadedCount);
            return loadedCount;
        } catch (Exception e) {
            log.error("加载历史对话失败，appId: {}, error: {}", appId, e.getMessage(), e);
            // 加载失败不影响系统运行，只是没有历史上下文
            return 0;
        }
    }


    @Override
    public List<ChatHistory> listChatHistoryBefore(Long appId, LocalDateTime before, Long beforeId, int limit) {
        ThrowUtils.throwIf(appId == null || appId <= 0, ErrorCode.PARAMS_ERROR, "应用 ID 不能为空");
        ThrowUtils.throwIf(before == null, ErrorCode.PARAMS_ERROR, "游标时间不能为空");
        limit = Math.min(Math.max(limit, 1), 20);
        List<ChatHistory> descending = new java.util.ArrayList<>(limit);
        if (beforeId != null) {
            // 先取同一秒内、ID 更小的记录，再取更早时间的记录，避免分页边界漏消息。
            descending.addAll(this.list(QueryWrapper.create()
                    .eq("appId", appId)
                    .eq("createTime", before)
                    .lt("id", beforeId)
                    .orderBy("id", false)
                    .limit(limit)));
        }
        int remaining = limit - descending.size();
        if (remaining > 0) {
            descending.addAll(this.list(QueryWrapper.create()
                    .eq("appId", appId)
                    .lt("createTime", before)
                    .orderBy("createTime", false)
                    .orderBy("id", false)
                    .limit(remaining)));
        }
        java.util.Collections.reverse(descending);
        return descending;
    }

    @Override
    public List<ChatHistory> listLatestChatHistory(Long appId, int limit) {
        ThrowUtils.throwIf(appId == null || appId <= 0, ErrorCode.PARAMS_ERROR, "应用 ID 不能为空");
        limit = Math.min(Math.max(limit, 1), 20);
        // 查询最新的 limit 条（降序），然后在内存中反转为正序
        QueryWrapper queryWrapper = QueryWrapper.create()
                .eq("appId", appId)
                .orderBy("createTime", false)
                .orderBy("id", false)
                .limit(limit);
        List<ChatHistory> list = this.list(queryWrapper);
        // 反转为时间正序（旧消息在前，新消息在后）
        java.util.Collections.reverse(list);
        return list;
    }

    @Override
    public boolean removeByAppId(Long appId) {
        ThrowUtils.throwIf(appId == null || appId <= 0, ErrorCode.PARAMS_ERROR, "应用 ID 不能为空");
        QueryWrapper queryWrapper = QueryWrapper.create()
                .eq("appId", appId);
        return this.remove(queryWrapper);
    }

    @Override
    public Page<ChatHistory> adminListChatHistoryByPage(AdminChatHistoryQueryRequest adminChatHistoryQueryRequest) {
        ThrowUtils.throwIf(adminChatHistoryQueryRequest == null, ErrorCode.PARAMS_ERROR);
        long pageNum = Math.max(adminChatHistoryQueryRequest.getPageNum(), 1);
        long pageSize = adminChatHistoryQueryRequest.getPageSize();
        return this.page(Page.of(pageNum, pageSize),
                getAdminQueryWrapper(adminChatHistoryQueryRequest));
    }

    private QueryWrapper getAdminQueryWrapper(AdminChatHistoryQueryRequest adminChatHistoryQueryRequest) {
        if (adminChatHistoryQueryRequest == null) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "请求参数为空");
        }
        Long appId = adminChatHistoryQueryRequest.getAppId();
        Long userId = adminChatHistoryQueryRequest.getUserId();
        String messageType = adminChatHistoryQueryRequest.getMessageType();
        String sortField = adminChatHistoryQueryRequest.getSortField();
        String sortOrder = adminChatHistoryQueryRequest.getSortOrder();
        QueryWrapper queryWrapper = QueryWrapper.create()
                .eq("appId", appId, appId != null)
                .eq("userId", userId, userId != null)
                .eq("messageType", messageType, StrUtil.isNotBlank(messageType));
        PageSortUtils.applySort(queryWrapper, sortField, sortOrder, ALLOWED_SORT_FIELDS);
        if (StrUtil.isBlank(sortField) || !ALLOWED_SORT_FIELDS.contains(sortField)) {
            // 默认按时间降序
            queryWrapper.orderBy("createTime", false);
        }
        return queryWrapper;
    }
}
