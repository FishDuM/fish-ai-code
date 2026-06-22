package hk.ljx.fishaicode.service.impl;

import cn.hutool.core.util.StrUtil;
import com.mybatisflex.core.paginate.Page;
import com.mybatisflex.core.query.QueryWrapper;
import com.mybatisflex.spring.service.impl.ServiceImpl;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.exception.ThrowUtils;
import hk.ljx.fishaicode.modal.dto.chathistory.AdminChatHistoryQueryRequest;
import hk.ljx.fishaicode.modal.entity.ChatHistory;
import hk.ljx.fishaicode.mapper.ChatHistoryMapper;
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
    public List<ChatHistory> listChatHistoryBefore(Long appId, LocalDateTime before, int limit) {
        ThrowUtils.throwIf(appId == null || appId <= 0, ErrorCode.PARAMS_ERROR, "应用 ID 不能为空");
        ThrowUtils.throwIf(before == null, ErrorCode.PARAMS_ERROR, "游标时间不能为空");
        limit = Math.min(Math.max(limit, 1), 50);
        // 降序取 limit 条，再反转为正序返回（比子查询更高效）
        QueryWrapper queryWrapper = QueryWrapper.create()
                .eq("appId", appId)
                .lt("createTime", before)
                .orderBy("createTime", false)
                .limit(limit);
        List<ChatHistory> list = this.list(queryWrapper);
        java.util.Collections.reverse(list);
        return list;
    }

    @Override
    public List<ChatHistory> listLatestChatHistory(Long appId, int limit) {
        ThrowUtils.throwIf(appId == null || appId <= 0, ErrorCode.PARAMS_ERROR, "应用 ID 不能为空");
        // 查询最新的 limit 条（降序），然后在内存中反转为正序
        QueryWrapper queryWrapper = QueryWrapper.create()
                .eq("appId", appId)
                .orderBy("createTime", false)
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

    @Override
    public QueryWrapper getAdminQueryWrapper(AdminChatHistoryQueryRequest adminChatHistoryQueryRequest) {
        if (adminChatHistoryQueryRequest == null) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "请求参数为空");
        }
        Long appId = adminChatHistoryQueryRequest.getAppId();
        Long userId = adminChatHistoryQueryRequest.getUserId();
        String messageType = adminChatHistoryQueryRequest.getMessageType();
        String sortField = adminChatHistoryQueryRequest.getSortField();
        String sortOrder = adminChatHistoryQueryRequest.getSortOrder();
        QueryWrapper queryWrapper = QueryWrapper.create()
                .eq("appId", appId)
                .eq("userId", userId)
                .eq("messageType", messageType);
        if (StrUtil.isNotBlank(sortField)) {
            queryWrapper.orderBy(sortField, "ascend".equals(sortOrder));
        } else {
            // 默认按时间降序
            queryWrapper.orderBy("createTime", false);
        }
        return queryWrapper;
    }
}
