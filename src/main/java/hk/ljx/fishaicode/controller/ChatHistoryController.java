package hk.ljx.fishaicode.controller;

import com.mybatisflex.core.paginate.Page;
import hk.ljx.fishaicode.annotation.AuthCheck;
import hk.ljx.fishaicode.common.BaseResponse;
import hk.ljx.fishaicode.common.ResultUtils;
import hk.ljx.fishaicode.constant.UserConstant;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.model.dto.chathistory.AdminChatHistoryQueryRequest;
import hk.ljx.fishaicode.model.entity.ChatHistory;
import hk.ljx.fishaicode.model.entity.User;
import hk.ljx.fishaicode.service.AppService;
import hk.ljx.fishaicode.service.ChatHistoryService;
import hk.ljx.fishaicode.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 对话历史 控制层。
 *
 * @author fish
 */
@RestController
@RequestMapping("/chatHistory")
@Validated
@RequiredArgsConstructor
public class ChatHistoryController {

    private final ChatHistoryService chatHistoryService;

    private final AppService appService;

    private final UserService userService;

    /**
     * 查询某个应用最新对话历史（进入聊天页面时调用）
     *
     * @param appId 应用 id
     * @param limit 条数（默认 10）
     * @param request HTTP 请求
     * @return 最新消息列表（时间正序）
     */
    @GetMapping("/latest")
    public BaseResponse<List<ChatHistory>> listLatestChatHistory(
            @NotNull(message = "应用 ID 不能为空") @Min(value = 1, message = "应用 ID 不合法") @RequestParam("appId") Long appId,
            @RequestParam(value = "limit", defaultValue = "10") @Min(value = 1, message = "limit 至少为 1") @Max(value = 20, message = "limit 最多为 20") int limit,
            HttpServletRequest request) {
        User loginUser = userService.getLoginUserOrNull(request);
        if (!canReadChatHistory(appId, loginUser)) {
            return ResultUtils.success(List.of());
        }
        List<ChatHistory> list = chatHistoryService.listLatestChatHistory(appId, limit);
        return ResultUtils.success(list);
    }

    /**
     * 游标分页：获取某个应用在指定时间之前的消息（向前加载更多历史）
     *
     * @param appId   应用 id
     * @param before  游标时间（当前已加载最早消息的 createTime）
     * @param beforeId 游标消息 id，用于区分同一时间的多条消息
     * @param limit   获取条数（默认 10）
     * @param request HTTP 请求
     * @return 消息列表（时间正序）
     */
    @GetMapping("/list/before")
    public BaseResponse<List<ChatHistory>> listChatHistoryBefore(
            @NotNull(message = "应用 ID 不能为空") @Min(value = 1, message = "应用 ID 不合法") @RequestParam("appId") Long appId,
            @NotNull(message = "游标时间不能为空") @RequestParam("before") LocalDateTime before,
            @RequestParam(value = "beforeId", required = false) @Min(value = 1, message = "游标消息 ID 不合法") Long beforeId,
            @RequestParam(value = "limit", defaultValue = "10") @Min(value = 1, message = "limit 至少为 1") @Max(value = 20, message = "limit 最多为 20") int limit,
            HttpServletRequest request) {
        User loginUser = userService.getLoginUserOrNull(request);
        if (!canReadChatHistory(appId, loginUser)) {
            return ResultUtils.success(List.of());
        }
        List<ChatHistory> list = chatHistoryService.listChatHistoryBefore(appId, before, beforeId, limit);
        return ResultUtils.success(list);
    }

    private boolean canReadChatHistory(Long appId, User loginUser) {
        if (loginUser == null) {
            return false;
        }
        try {
            appService.getAppWithPermission(appId, loginUser);
            return true;
        } catch (BusinessException e) {
            return false;
        }
    }

    // ===== 管理员接口 =====

    /**
     * 管理员分页查询所有对话历史（按时间降序）
     *
     * @param adminChatHistoryQueryRequest 查询请求
     * @return 分页结果
     */
    @PostMapping("/admin/list/page")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public BaseResponse<Page<ChatHistory>> adminListChatHistoryByPage(
            @Valid @RequestBody AdminChatHistoryQueryRequest adminChatHistoryQueryRequest) {
        Page<ChatHistory> result = chatHistoryService.adminListChatHistoryByPage(adminChatHistoryQueryRequest);
        return ResultUtils.success(result);
    }
}
