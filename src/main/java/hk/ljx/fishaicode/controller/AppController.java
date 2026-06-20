package hk.ljx.fishaicode.controller;

import com.mybatisflex.core.paginate.Page;
import hk.ljx.fishaicode.annotation.AuthCheck;
import hk.ljx.fishaicode.common.BaseResponse;
import hk.ljx.fishaicode.common.DeleteRequest;
import hk.ljx.fishaicode.common.ResultUtils;
import hk.ljx.fishaicode.constant.UserConstant;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.exception.ThrowUtils;
import hk.ljx.fishaicode.modal.dto.app.*;
import hk.ljx.fishaicode.modal.entity.App;
import hk.ljx.fishaicode.modal.entity.User;
import hk.ljx.fishaicode.modal.vo.AppVO;
import hk.ljx.fishaicode.service.AppService;
import hk.ljx.fishaicode.service.UserService;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

/**
 * 应用 控制层。
 *
 * @author fish
 */
@RestController
@RequestMapping("/app")
public class AppController {

    @Resource
    private AppService appService;

    @Resource
    private UserService userService;

    /**
     * 创建应用
     *
     * @param appAddRequest 创建应用请求
     * @param request       HTTP 请求
     * @return 新应用 id
     */
    @PostMapping("/add")
    public BaseResponse<Long> addApp(@RequestBody AppAddRequest appAddRequest, HttpServletRequest request) {
        ThrowUtils.throwIf(appAddRequest == null, ErrorCode.PARAMS_ERROR);
        User loginUser = userService.getLoginUser(request);
        long appId = appService.addApp(appAddRequest, loginUser);
        return ResultUtils.success(appId);
    }

    /**
     * 用户修改自己的应用（仅支持修改应用名称）
     *
     * @param appUpdateRequest 更新应用请求
     * @param request          HTTP 请求
     * @return 是否更新成功
     */
    @PostMapping("/update")
    public BaseResponse<Boolean> updateMyApp(@RequestBody AppUpdateRequest appUpdateRequest, HttpServletRequest request) {
        ThrowUtils.throwIf(appUpdateRequest == null, ErrorCode.PARAMS_ERROR);
        User loginUser = userService.getLoginUser(request);
        boolean result = appService.updateMyApp(appUpdateRequest.getId(), appUpdateRequest.getAppName(), loginUser);
        return ResultUtils.success(result);
    }

    /**
     * 用户删除自己的应用
     *
     * @param deleteRequest 删除请求
     * @param request       HTTP 请求
     * @return 是否删除成功
     */
    @PostMapping("/delete")
    public BaseResponse<Boolean> deleteMyApp(@RequestBody DeleteRequest deleteRequest, HttpServletRequest request) {
        if (deleteRequest == null || deleteRequest.getId() <= 0) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR);
        }
        User loginUser = userService.getLoginUser(request);
        boolean result = appService.deleteMyApp(deleteRequest.getId(), loginUser);
        return ResultUtils.success(result);
    }

    /**
     * 根据 id 查看应用详情
     *
     * @param id 应用 id
     * @return 应用视图对象
     */
    @GetMapping("/get/vo")
    public BaseResponse<AppVO> getAppVOById(long id) {
        ThrowUtils.throwIf(id <= 0, ErrorCode.PARAMS_ERROR);
        App app = appService.getById(id);
        ThrowUtils.throwIf(app == null, ErrorCode.NOT_FOUND_ERROR);
        return ResultUtils.success(appService.getAppVO(app));
    }

    /**
     * 分页查询用户自己的应用列表
     *
     * @param appQueryRequest 查询请求
     * @param request         HTTP 请求
     * @return 分页结果
     */
    @PostMapping("/list/page/vo")
    public BaseResponse<Page<AppVO>> listMyAppsByPage(@RequestBody AppQueryRequest appQueryRequest,
                                                      HttpServletRequest request) {
        ThrowUtils.throwIf(appQueryRequest == null, ErrorCode.PARAMS_ERROR);
        User loginUser = userService.getLoginUser(request);
        Page<AppVO> result = appService.listMyAppsByPage(appQueryRequest, loginUser.getId());
        return ResultUtils.success(result);
    }

    /**
     * 分页查询精选应用列表
     *
     * @param appQueryRequest 查询请求
     * @return 分页结果
     */
    @PostMapping("/list/featured/vo")
    public BaseResponse<Page<AppVO>> listFeaturedAppsByPage(@RequestBody AppQueryRequest appQueryRequest) {
        ThrowUtils.throwIf(appQueryRequest == null, ErrorCode.PARAMS_ERROR);
        Page<AppVO> result = appService.listFeaturedAppsByPage(appQueryRequest);
        return ResultUtils.success(result);
    }

    // ===== 管理员接口 =====

    /**
     * 管理员删除任意应用
     *
     * @param deleteRequest 删除请求
     * @return 是否删除成功
     */
    @PostMapping("/admin/delete")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public BaseResponse<Boolean> adminDeleteApp(@RequestBody DeleteRequest deleteRequest) {
        if (deleteRequest == null || deleteRequest.getId() <= 0) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR);
        }
        boolean result = appService.removeById(deleteRequest.getId());
        ThrowUtils.throwIf(!result, ErrorCode.OPERATION_ERROR);
        return ResultUtils.success(true);
    }

    /**
     * 管理员更新任意应用（支持更新名称、封面、优先级）
     *
     * @param adminAppUpdateRequest 管理员更新应用请求
     * @return 是否更新成功
     */
    @PostMapping("/admin/update")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public BaseResponse<Boolean> adminUpdateApp(@RequestBody AdminAppUpdateRequest adminAppUpdateRequest) {
        ThrowUtils.throwIf(adminAppUpdateRequest == null, ErrorCode.PARAMS_ERROR);
        boolean result = appService.adminUpdateApp(
                adminAppUpdateRequest.getId(),
                adminAppUpdateRequest.getAppName(),
                adminAppUpdateRequest.getCover(),
                adminAppUpdateRequest.getPriority());
        return ResultUtils.success(result);
    }

    /**
     * 管理员分页查询应用列表
     *
     * @param adminAppQueryRequest 查询请求
     * @return 分页结果
     */
    @PostMapping("/admin/list/page")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public BaseResponse<Page<App>> adminListAppsByPage(@RequestBody AdminAppQueryRequest adminAppQueryRequest) {
        ThrowUtils.throwIf(adminAppQueryRequest == null, ErrorCode.PARAMS_ERROR);
        Page<App> result = appService.adminListAppsByPage(adminAppQueryRequest);
        return ResultUtils.success(result);
    }

    /**
     * 管理员根据 id 查看应用详情
     *
     * @param id 应用 id
     * @return 应用实体（完整信息）
     */
    @GetMapping("/admin/get")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public BaseResponse<App> adminGetAppById(long id) {
        ThrowUtils.throwIf(id <= 0, ErrorCode.PARAMS_ERROR);
        App app = appService.getById(id);
        ThrowUtils.throwIf(app == null, ErrorCode.NOT_FOUND_ERROR);
        return ResultUtils.success(app);
    }

}
