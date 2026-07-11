package hk.ljx.fishaicode.controller;

import com.mybatisflex.core.paginate.Page;
import hk.ljx.fishaicode.annotation.AuthCheck;
import hk.ljx.fishaicode.common.BaseResponse;
import hk.ljx.fishaicode.common.ResultUtils;
import hk.ljx.fishaicode.constant.UserConstant;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.exception.ThrowUtils;
import hk.ljx.fishaicode.modal.dto.chathistory.AdminChatHistoryQueryRequest;
import hk.ljx.fishaicode.modal.entity.App;
import hk.ljx.fishaicode.modal.entity.ChatHistory;
import hk.ljx.fishaicode.modal.entity.User;
import hk.ljx.fishaicode.service.AppService;
import hk.ljx.fishaicode.service.ChatHistoryService;
import hk.ljx.fishaicode.service.UserService;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
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
public class ChatHistoryController {

    @Resource
    private ChatHistoryService chatHistoryService;

    @Resource
    private AppService appService;

    @Resource
    private UserService userService;

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
            @RequestParam(value = "limit", defaultValue = "10") int limit,
            HttpServletRequest request) {
        User loginUser = userService.getLoginUser(request);
        App app = appService.getById(appId);
        ThrowUtils.throwIf(app == null, ErrorCode.NOT_FOUND_ERROR, "应用不存在");
        boolean isOwner = app.getUserId().equals(loginUser.getId());
        boolean isAdmin = UserConstant.ADMIN_ROLE.equals(loginUser.getUserRole());
        ThrowUtils.throwIf(!isOwner && !isAdmin, ErrorCode.NO_AUTH_ERROR);
        List<ChatHistory> list = chatHistoryService.listLatestChatHistory(appId, limit);
        return ResultUtils.success(list);
    }

    /**
     * 游标分页：获取某个应用在指定时间之前的消息（向前加载更多历史）
     *
     * @param appId   应用 id
     * @param before  游标时间（当前已加载最早消息的 createTime）
     * @param limit   获取条数（默认 10）
     * @param request HTTP 请求
     * @return 消息列表（时间正序）
     */
    @GetMapping("/list/before")
    public BaseResponse<List<ChatHistory>> listChatHistoryBefore(
            @NotNull(message = "应用 ID 不能为空") @Min(value = 1, message = "应用 ID 不合法") @RequestParam("appId") Long appId,
            @NotNull(message = "游标时间不能为空") @RequestParam("before") LocalDateTime before,
            @RequestParam(value = "limit", defaultValue = "10") int limit,
            HttpServletRequest request) {
        User loginUser = userService.getLoginUser(request);
        App app = appService.getById(appId);
        ThrowUtils.throwIf(app == null, ErrorCode.NOT_FOUND_ERROR, "应用不存在");
        boolean isOwner = app.getUserId().equals(loginUser.getId());
        boolean isAdmin = UserConstant.ADMIN_ROLE.equals(loginUser.getUserRole());
        ThrowUtils.throwIf(!isOwner && !isAdmin, ErrorCode.NO_AUTH_ERROR);
        List<ChatHistory> list = chatHistoryService.listChatHistoryBefore(appId, before, limit);
        return ResultUtils.success(list);
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
