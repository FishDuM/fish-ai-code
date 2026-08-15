package hk.ljx.fishaicode.controller;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.mybatisflex.core.paginate.Page;
import hk.ljx.fishaicode.ai.AiCodeGenTypeRoutingService;
import hk.ljx.fishaicode.annotation.AuthCheck;
import hk.ljx.fishaicode.common.BaseResponse;
import hk.ljx.fishaicode.common.DeleteRequest;
import hk.ljx.fishaicode.common.ResultUtils;
import hk.ljx.fishaicode.constant.AppConstant;
import hk.ljx.fishaicode.constant.UserConstant;
import hk.ljx.fishaicode.core.GenerationCoordinator;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.exception.ThrowUtils;
import hk.ljx.fishaicode.model.dto.app.*;
import hk.ljx.fishaicode.model.entity.App;
import hk.ljx.fishaicode.model.entity.User;
import hk.ljx.fishaicode.model.vo.AppVO;
import hk.ljx.fishaicode.model.vo.PublicAppVO;
import hk.ljx.fishaicode.model.vo.PreviewSessionVO;
import hk.ljx.fishaicode.model.vo.PreviewSourceVO;
import hk.ljx.fishaicode.ratelimit.annotation.RateLimit;
import hk.ljx.fishaicode.ratelimit.enums.RateLimitType;
import hk.ljx.fishaicode.service.AppService;
import hk.ljx.fishaicode.service.ProjectDownloadService;
import hk.ljx.fishaicode.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Map;

/**
 * 应用 控制层。
 *
 * @author fish
 */
@RestController
@RequestMapping("/app")
@Validated
@RequiredArgsConstructor
public class AppController {

    private final AppService appService;

    private final UserService userService;

    private final ProjectDownloadService projectDownloadService;

    private final GenerationCoordinator generationCoordinator;

    private final PreviewTokenController previewTokenController;

    /**
     * 创建应用
     *
     * @param appAddRequest 创建应用请求
     * @param request       HTTP 请求
     * @return 新应用 id
     */
    @PostMapping("/add")
    @AuthCheck
    @RateLimit(key = "ai", rate = 10, rateInterval = 60, limitType = RateLimitType.USER, message = "AI 服务一分钟内请求次数过多，请稍后重试")
    @CacheEvict(value = "public_good_app_page", allEntries = true)
    public BaseResponse<Long> addApp(@Valid @RequestBody AppAddRequest appAddRequest, HttpServletRequest request) {
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
    @AuthCheck
    @CacheEvict(value = "public_good_app_page", allEntries = true)
    public BaseResponse<Boolean> updateMyApp(@Valid @RequestBody AppUpdateRequest appUpdateRequest, HttpServletRequest request) {
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
    @AuthCheck
    @CacheEvict(value = "public_good_app_page", allEntries = true)
    public BaseResponse<Boolean> deleteMyApp(@Valid @RequestBody DeleteRequest deleteRequest, HttpServletRequest request) {
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
    public BaseResponse<?> getAppVOById(@Min(value = 1, message = "id 不合法") long id, HttpServletRequest request) {
        // 公开查看：精选应用任何人可看（含未登录），非精选应用仅本人/管理员可看
        User loginUser = userService.getLoginUserOrNull(request);
        App app = appService.getPublicAppById(id, loginUser);
        // 仅本人/管理员返回完整视图（含 initPrompt），其他人返回脱敏公开视图
        boolean isOwnerOrAdmin = loginUser != null
                && (app.getUserId().equals(loginUser.getId())
                    || UserConstant.ADMIN_ROLE.equals(loginUser.getUserRole()));
        if (isOwnerOrAdmin) {
            return ResultUtils.success(appService.getAppVO(app));
        }
        return ResultUtils.success(appService.getPublicAppVO(app));
    }

    /**
     * 分页查询用户自己的应用列表
     *
     * @param appQueryRequest 查询请求
     * @param request         HTTP 请求
     * @return 分页结果
     */
    @PostMapping("/list/page/vo")
    @AuthCheck
    public BaseResponse<Page<AppVO>> listMyAppsByPage(@Valid @RequestBody AppQueryRequest appQueryRequest,
                                                      HttpServletRequest request) {
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
    @Cacheable(
            value = "public_good_app_page",
            key = "T(hk.ljx.fishaicode.utils.CacheKeyUtils).generateKey(#appQueryRequest)",
            condition = "#appQueryRequest.pageNum <= 10"
    )
    public BaseResponse<Page<PublicAppVO>> listFeaturedAppsByPage(@Valid @RequestBody AppQueryRequest appQueryRequest) {
        Page<PublicAppVO> result = appService.listFeaturedAppsByPage(appQueryRequest);
        return ResultUtils.success(result);
    }

    /**
     * 聊天生成应用
     * @param request http请求
     * @return sse流
     */
    @PostMapping(value = "/chat/gen/code", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @AuthCheck
    @RateLimit(key = "ai", rate = 10, rateInterval = 60, limitType = RateLimitType.USER, message = "AI 服务一分钟内请求次数过多，请稍后重试")
    public Flux<ServerSentEvent<String>> chatToGenCode(
            @Valid @RequestBody AppChatRequest appChatRequest,
            HttpServletRequest request) {
        try {
            User loginUser = userService.getLoginUser(request);
            return appService.chatToGenCode(appChatRequest.getAppId(), appChatRequest.getMessage(), loginUser)
                    .map(content -> ServerSentEvent.builder(content).build())
                    .onErrorResume(error -> Flux.just(toSseError(error)));
        } catch (Exception e) {
            return Flux.just(toSseError(e));
        }
    }

    /**
     * 将异常转为前端可识别的 SSE business-error 事件。
     * 适用于流内（onErrorResume）和流前（try-catch）两种异常场景。
     */
    private static ServerSentEvent<String> toSseError(Throwable error) {
        int code = ErrorCode.SYSTEM_ERROR.getCode();
        String errorMessage = "生成失败，请稍后重试";
        if (error instanceof BusinessException businessException) {
            code = businessException.getCode();
            errorMessage = businessException.getMessage();
        }
        String data = JSONUtil.toJsonStr(Map.of(
                "error", true,
                "code", code,
                "message", errorMessage
        ));
        return ServerSentEvent.<String>builder(data)
                .event("business-error")
                .build();
    }

    /**
     * 查询当前用户应用的生成状态。客户端主动停止接收 SSE 后，模型仍会在后台完成，
     * 因此需要该接口来防止用户过早发起下一次生成、下载或部署。
     */
    @GetMapping("/generation/status")
    public BaseResponse<Boolean> getGenerationStatus(
            @NotNull(message = "应用 ID 不能为空") @Min(value = 1, message = "应用 ID 不合法") @RequestParam("appId") Long appId,
            HttpServletRequest request) {
        // 精选应用公开可查状态（未登录/非主人也可）；非精选仅本人/管理员
        User loginUser = userService.getLoginUserOrNull(request);
        appService.getPublicAppById(appId, loginUser);
        return ResultUtils.success(generationCoordinator.isBusy(appId));
    }

    @GetMapping("/preview-session/{appId}")
    public BaseResponse<PreviewSessionVO> getPreviewSession(
            @PathVariable @Min(value = 1, message = "应用 ID 不合法") Long appId,
            HttpServletRequest request) {
        User loginUser = userService.getLoginUserOrNull(request);
        App app = appService.getPublicAppById(appId, loginUser);
        return ResultUtils.success(previewTokenController.createPreviewSession(app.getCodeGenType() + "_" + appId));
    }

    @GetMapping("/preview-source/{appId}")
    public BaseResponse<PreviewSourceVO> getPreviewSource(
            @PathVariable @Min(value = 1, message = "应用 ID 不合法") Long appId,
            HttpServletRequest request) {
        User loginUser = userService.getLoginUser(request);
        App app = appService.getAppWithPermission(appId, loginUser);
        ThrowUtils.throwIf("vue_project".equals(app.getCodeGenType()), ErrorCode.PARAMS_ERROR, "Vue 项目不支持源码预览");
        String sourceDirName = app.getCodeGenType() + "_" + appId;
        PreviewSourceVO source = generationCoordinator.executeExclusively(appId, () -> {
            try {
                File sourceDir = new File(AppConstant.CODE_OUTPUT_ROOT_DIR, sourceDirName);
                File htmlFile = new File(sourceDir, "index.html");
                ThrowUtils.throwIf(!htmlFile.isFile(), ErrorCode.NOT_FOUND_ERROR, "应用代码不存在，请先生成代码");
                String html = Files.readString(htmlFile.toPath(), StandardCharsets.UTF_8);
                String css = readOptionalFile(new File(sourceDir, "style.css"));
                String javascript = readOptionalFile(new File(sourceDir, "script.js"));
                return new PreviewSourceVO(html, css, javascript);
            } catch (BusinessException e) {
                throw e;
            } catch (Exception e) {
                throw new BusinessException(ErrorCode.SYSTEM_ERROR, "读取预览源码失败");
            }
        });
        return ResultUtils.success(source);
    }

    private String readOptionalFile(File file) throws Exception {
        return file.isFile() ? Files.readString(file.toPath(), StandardCharsets.UTF_8) : "";
    }

    /**
     * 应用部署
     *
     * @param appDeployRequest 部署请求
     * @param request          请求
     * @return 部署 URL
     */
    @PostMapping("/deploy")
    @AuthCheck
    public BaseResponse<String> deployApp(@Valid @RequestBody AppDeployRequest appDeployRequest, HttpServletRequest request) {
        Long appId = appDeployRequest.getAppId();
        User loginUser = userService.getLoginUser(request);
        String deployUrl = appService.deployApp(appId, loginUser);
        return ResultUtils.success(deployUrl);
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
    @CacheEvict(value = "public_good_app_page", allEntries = true)
    public BaseResponse<Boolean> adminDeleteApp(@Valid @RequestBody DeleteRequest deleteRequest) {
        boolean result = appService.adminDeleteApp(deleteRequest.getId());
        return ResultUtils.success(result);
    }

    /**
     * 管理员更新任意应用（支持更新名称、封面、优先级）
     *
     * @param adminAppUpdateRequest 管理员更新应用请求
     * @return 是否更新成功
     */
    @PostMapping("/admin/update")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    @CacheEvict(value = "public_good_app_page", allEntries = true)
    public BaseResponse<Boolean> adminUpdateApp(@Valid @RequestBody AdminAppUpdateRequest adminAppUpdateRequest) {
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
    public BaseResponse<Page<App>> adminListAppsByPage(@Valid @RequestBody AdminAppQueryRequest adminAppQueryRequest) {
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
    public BaseResponse<App> adminGetAppById(@Min(value = 1, message = "id 不合法") long id) {
        return ResultUtils.success(appService.adminGetAppById(id));
    }


    /**
     * 下载应用代码
     *
     * @param appId    应用ID
     * @param request  请求
     * @param response 响应
     */
    @GetMapping("/download/{appId}")
    @AuthCheck
    public void downloadAppCode(
            @Min(value = 1, message = "应用 ID 不合法") @PathVariable Long appId,
            HttpServletRequest request,
            HttpServletResponse response) {
        User loginUser = userService.getLoginUser(request);
        App app = appService.getOwnedApp(appId, loginUser);
        generationCoordinator.executeExclusively(appId, () -> {
            String codeGenType = app.getCodeGenType();
            String sourceDirName = codeGenType + "_" + appId;
            String sourceDirPath = AppConstant.CODE_OUTPUT_ROOT_DIR + File.separator + sourceDirName;
            File sourceDir = new File(sourceDirPath);
            ThrowUtils.throwIf(!sourceDir.exists() || !sourceDir.isDirectory(),
                    ErrorCode.NOT_FOUND_ERROR, "应用代码不存在，请先生成代码");
            projectDownloadService.downloadProjectAsZip(sourceDirPath, String.valueOf(appId), response);
            return null;
        });
    }

}
