package hk.ljx.fishaicode.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.RandomUtil;
import cn.hutool.core.util.StrUtil;
import com.mybatisflex.core.paginate.Page;
import com.mybatisflex.core.query.QueryWrapper;
import com.mybatisflex.spring.service.impl.ServiceImpl;
import dev.langchain4j.community.store.memory.chat.redis.RedisChatMemoryStore;
import hk.ljx.fishaicode.ai.AiCodeGenTypeRoutingService;
import hk.ljx.fishaicode.ai.AiCodeGenTypeRoutingServiceFactory;
import hk.ljx.fishaicode.ai.AiAppNameServiceFactory;
import hk.ljx.fishaicode.common.PageSortUtils;
import hk.ljx.fishaicode.constant.AppConstant;
import hk.ljx.fishaicode.constant.AppDeployProperties;
import hk.ljx.fishaicode.constant.UserConstant;
import hk.ljx.fishaicode.core.AiCodeGeneratorFacade;
import hk.ljx.fishaicode.core.GenerationCoordinator;
import hk.ljx.fishaicode.core.builder.VueProjectBuilder;
import hk.ljx.fishaicode.core.handler.StreamHandlerExecutor;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.exception.ThrowUtils;
import hk.ljx.fishaicode.model.dto.app.AdminAppQueryRequest;
import hk.ljx.fishaicode.model.dto.app.AppAddRequest;
import hk.ljx.fishaicode.model.dto.app.AppQueryRequest;
import hk.ljx.fishaicode.model.entity.App;
import hk.ljx.fishaicode.model.entity.User;
import hk.ljx.fishaicode.mapper.AppMapper;
import hk.ljx.fishaicode.model.enums.CodeGenTypeEnum;
import hk.ljx.fishaicode.model.enums.MessageTypeEnum;
import hk.ljx.fishaicode.model.vo.AppVO;
import hk.ljx.fishaicode.model.vo.PublicAppVO;
import hk.ljx.fishaicode.ai.SensitiveCheckFactory;
import hk.ljx.fishaicode.workflow.service.WorkflowService;
import hk.ljx.fishaicode.service.AppService;
import hk.ljx.fishaicode.service.ChatHistoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import reactor.core.publisher.Flux;

import java.io.File;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.stream.Collectors;

/**
 * 应用 服务层实现。
 *
 * @author fish
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AppServiceImpl extends ServiceImpl<AppMapper, App> implements AppService {

    private final AppDeployProperties appDeployProperties;

    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of(
            "id", "appName", "priority", "userId", "createTime", "updateTime", "editTime"
    );

    private final AiCodeGeneratorFacade aiCodeGeneratorFacade;

    private final ChatHistoryService chatHistoryService;

    private final StreamHandlerExecutor streamHandlerExecutor;

    private final VueProjectBuilder vueProjectBuilder;

    private final AiCodeGenTypeRoutingServiceFactory aiCodeGenTypeRoutingServiceFactory;

    private final AiAppNameServiceFactory aiAppNameServiceFactory;

    private final SensitiveCheckFactory sensitiveCheckFactory;

    private final WorkflowService workflowService;

    private final GenerationCoordinator generationCoordinator;

    private final ExecutorService virtualThreadExecutor;

    private final RedisChatMemoryStore redisChatMemoryStore;

    private final TransactionTemplate transactionTemplate;


    @Override
    public long addApp(AppAddRequest appAddRequest, User loginUser) {
        // 1. 校验
        if (appAddRequest == null) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "请求参数为空");
        }
        String initPrompt = appAddRequest.getInitPrompt();
        // 前置 AI 调用并行化：敏感审查、应用名生成、类型路由互不依赖，
        // 用虚拟线程并发执行（都是短输出任务，max-tokens:100 限长后单次 ~2s）。
        // 敏感审查是硬门槛——失败必须提前中断，不等待其余两个。
        CompletableFuture<String> checkFuture = CompletableFuture.supplyAsync(
                () -> sensitiveCheckFactory.create().verify(initPrompt), virtualThreadExecutor);
        CompletableFuture<String> nameFuture = CompletableFuture.supplyAsync(
                () -> generateAppNameSafely(initPrompt), virtualThreadExecutor);
        CompletableFuture<CodeGenTypeEnum> typeFuture = CompletableFuture.supplyAsync(() -> {
            AiCodeGenTypeRoutingService routingService = aiCodeGenTypeRoutingServiceFactory.createAiCodeGenTypeRoutingService();
            return routingService.routeCodeGenType(initPrompt);
        }, virtualThreadExecutor);

        // 先等敏感审查：失败立即抛（此时其余两个仍在后台跑，但不会再被使用）
        String checkResult = checkFuture.join();
        validateSensitiveCheckResult(checkResult);

        // 审查通过，取应用名与类型（生成应用名失败已降级为截断，不会抛）
        String appName = nameFuture.join();
        CodeGenTypeEnum codeGenTypeEnum = typeFuture.join();
        App app = App.builder()
                        .appName(appName).build();
        BeanUtil.copyProperties(appAddRequest, app);
        app.setUserId(loginUser.getId());
        app.setCodeGenType(codeGenTypeEnum.getValue());
        // 优先级默认 0
        if (app.getPriority() == null) {
            app.setPriority(0);
        }
        app.setCover(UserConstant.DEFAULT_USER_AVATAR);
        // 3. 保存
        boolean result = this.save(app);
        if (!result) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "创建应用失败");
        }
        return app.getId();
    }

    /**
     * 由 AI 智能提炼应用名，任何异常都降级为提示词前 6 个字符截断，保证创建应用永远成功。
     */
    private String generateAppNameSafely(String initPrompt) {
        try {
            String name = aiAppNameServiceFactory.createAiAppNameService().generateAppName(initPrompt);
            String cleaned = cleanAppName(name);
            if (StrUtil.isNotBlank(cleaned)) {
                return cleaned;
            }
        } catch (Exception e) {
            log.warn("AI 生成应用名失败，降级为截断，appName 前缀: {}", StrUtil.sub(initPrompt, 0, 6), e);
        }
        // 降级：提示词前 6 个字符
        return initPrompt.length() > 6 ? initPrompt.substring(0, 6) : initPrompt;
    }

    /**
     * 清洗 AI 返回的应用名：去空白、引号、首尾标点，超 15 字截断。
     */
    static String cleanAppName(String name) {
        if (name == null) {
            return "";
        }
        String cleaned = StrUtil.trim(name)
                .replaceAll("[\"'“”‘’《》【】「」『』]", "")
                .replaceAll("^[\\s:：,，。.!！?？\\-—]+|[\\s:：,，。.!！?？\\-—]+$", "")
                .trim();
        if (StrUtil.isBlank(cleaned)) {
            return "";
        }
        // 截断保护：模型偶发超长时截到 15 字
        return cleaned.length() > 15 ? cleaned.substring(0, 15) : cleaned;
    }

    @Override
    public boolean updateMyApp(Long id, String appName, User loginUser) {
        App oldApp = this.getById(id);
        if (oldApp == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND_ERROR);
        }
        // 3. 只能修改自己的应用
        if (!oldApp.getUserId().equals(loginUser.getId())) {
            throw new BusinessException(ErrorCode.NO_AUTH_ERROR);
        }
        // 4. 更新
        App app = new App();
        app.setId(id);
        app.setAppName(appName);
        boolean result = this.updateById(app);
        if (!result) {
            throw new BusinessException(ErrorCode.OPERATION_ERROR, "更新应用失败");
        }
        return true;
    }

    @Override
    public boolean adminUpdateApp(Long id, String appName, String cover, Integer priority) {
        App oldApp = this.getById(id);
        if (oldApp == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND_ERROR);
        }
        // 3. 更新
        App app = new App();
        app.setId(id);
        if (appName != null) {
            app.setAppName(appName);
        }
        if (cover != null) {
            app.setCover(cover);
        }
        if (priority != null) {
            app.setPriority(priority);
        }
        boolean result = this.updateById(app);
        if (!result) {
            throw new BusinessException(ErrorCode.OPERATION_ERROR, "更新应用失败");
        }
        return true;
    }

    /**
     * 获取应用并校验访问权限（仅本人或管理员可访问）
     */
    @Override
    public App getAppWithPermission(Long appId, User loginUser) {
        ThrowUtils.throwIf(loginUser == null, ErrorCode.NOT_LOGIN_ERROR, "用户未登录");
        App app = this.getById(appId);
        ThrowUtils.throwIf(app == null, ErrorCode.NOT_FOUND_ERROR, "应用不存在");
        boolean isOwner = app.getUserId().equals(loginUser.getId());
        boolean isAdmin = UserConstant.ADMIN_ROLE.equals(loginUser.getUserRole());
        ThrowUtils.throwIf(!isOwner && !isAdmin, ErrorCode.NO_AUTH_ERROR, "没有权限访问该应用");
        return app;
    }

    /**
     * 公开查看应用详情：精选应用任何人可看（含未登录）；非精选应用仅本人或管理员可看。
     */
    @Override
    public App getPublicAppById(Long appId, User loginUser) {
        App app = this.getById(appId);
        ThrowUtils.throwIf(app == null, ErrorCode.NOT_FOUND_ERROR, "应用不存在");
        boolean isOwner = loginUser != null && app.getUserId().equals(loginUser.getId());
        boolean isAdmin = loginUser != null && UserConstant.ADMIN_ROLE.equals(loginUser.getUserRole());
        // 精选应用公开可见；非精选应用保持仅本人/管理员可见
        boolean isFeatured = AppConstant.FEATURED_PRIORITY == app.getPriority();
        if (!isFeatured && !isOwner && !isAdmin) {
            throw new BusinessException(ErrorCode.NO_AUTH_ERROR, "没有权限访问该应用");
        }
        return app;
    }

    /**
     * 获取应用并校验所有权（仅本人可访问，管理员不可代替）
     */
    @Override
    public App getOwnedApp(Long appId, User loginUser) {
        ThrowUtils.throwIf(loginUser == null, ErrorCode.NOT_LOGIN_ERROR, "用户未登录");
        App app = this.getById(appId);
        ThrowUtils.throwIf(app == null, ErrorCode.NOT_FOUND_ERROR, "应用不存在");
        ThrowUtils.throwIf(!app.getUserId().equals(loginUser.getId()), ErrorCode.NO_AUTH_ERROR, "无权限访问该应用");
        return app;
    }

    /**
     * 用户删除自己的应用（连同对话历史）。
     *
     * <p>删除在应用级锁内执行：锁覆盖"DB 删除 + 磁盘清理"全程，保证清理时
     * 没有生成/部署任务在写同一目录。DB 删除用独立事务（TransactionTemplate），
     * 事务提交后再同步清理文件——文件操作不参与 DB 事务，也不会被回滚。</p>
     */
    @Override
    public boolean deleteMyApp(long id, User loginUser) {
        App oldApp = this.getById(id);
        if (oldApp == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND_ERROR);
        }
        // 3. 只能删除自己的应用
        if (!oldApp.getUserId().equals(loginUser.getId())) {
            throw new BusinessException(ErrorCode.NO_AUTH_ERROR);
        }
        // 4. 锁内删除：正在生成/部署时立即失败，避免磁盘清理与写文件竞争
        return generationCoordinator.executeExclusively(id, () -> {
            // 5. 独立事务删除 DB（事务提交后才清文件，见 cleanAppFilesSync）
            boolean result = deleteAppInTransaction(id);
            // 6. 锁内同步清理磁盘产物与 Redis 记忆
            cleanAppFilesSync(oldApp);
            return result;
        });
    }

    /**
     * 管理员删除任意应用（连同对话历史）。
     */
    @Override
    public boolean adminDeleteApp(long id) {
        App app = this.getById(id);
        ThrowUtils.throwIf(app == null, ErrorCode.NOT_FOUND_ERROR, "应用不存在");
        // 2. 锁内删除：正在生成/部署时立即失败，避免磁盘清理与写文件竞争
        return generationCoordinator.executeExclusively(id, () -> {
            // 3. 独立事务删除 DB
            deleteAppInTransaction(id);
            // 4. 锁内同步清理磁盘产物与 Redis 记忆
            cleanAppFilesSync(app);
            return true;
        });
    }

    /**
     * 独立事务删除应用与对话历史：事务提交后调用方才清理磁盘，
     * 避免事务边界与锁边界错位（锁内提交、锁内清理）。
     */
    private boolean deleteAppInTransaction(long id) {
        return Boolean.TRUE.equals(transactionTemplate.execute(status -> {
            // 先清理对话历史，避免数据孤儿
            chatHistoryService.removeByAppId(id);
            // 删除应用
            boolean result = this.removeById(id);
            if (!result) {
                throw new BusinessException(ErrorCode.OPERATION_ERROR);
            }
            return result;
        }));
    }

    @Override
    public App adminGetAppById(long id) {
        App app = this.getById(id);
        ThrowUtils.throwIf(app == null, ErrorCode.NOT_FOUND_ERROR, "应用不存在");
        return app;
    }

    /**
     * 锁内同步清理该应用的磁盘产物与 Redis 对话记忆。
     *
     * <p>删除方法在 GenerationCoordinator 应用锁内调用：锁保证清理期间没有
     * 生成/部署任务在写同一目录。文件删除不可回滚，但删除操作本身极少回滚，
     * 若事务回滚最多留下孤儿文件（DB 里应用还在，可重新生成覆盖）。</p>
     */
    private void cleanAppFilesSync(App app) {
        if (app == null) {
            return;
        }
        // 生成目录：{codeGenType}_{appId}
        String codeDirName = app.getCodeGenType() + "_" + app.getId();
        Path codeDir = Paths.get(AppConstant.CODE_OUTPUT_ROOT_DIR, codeDirName);
        // 部署目录：{deployKey}
        String deployKey = app.getDeployKey();
        Path deployDir = StrUtil.isBlank(deployKey) ? null
                : Paths.get(AppConstant.CODE_DEPLOY_ROOT_DIR, deployKey);

        deleteDirectoryQuietly(codeDir, deployDir, app.getId());
        deleteChatMemoryQuietly(app.getId());
    }

    /**
     * 清理 Redis 中该应用的对话记忆（LangChain4j RedisChatMemoryStore 以 appId 为 key）。
     * 失败只记日志，不影响主流程。
     */
    private void deleteChatMemoryQuietly(long appId) {
        try {
            redisChatMemoryStore.deleteMessages(appId);
            log.info("已清理应用 Redis 对话记忆，appId: {}", appId);
        } catch (Exception e) {
            log.error("清理应用 Redis 对话记忆失败，appId: {}", appId, e);
        }
    }

    /**
     * 静默删除目录：不存在或删除失败都只记日志，不影响主流程。
     */
    private void deleteDirectoryQuietly(Path codeDir, Path deployDir, long appId) {
        for (Path dir : new Path[]{codeDir, deployDir}) {
            if (dir == null) {
                continue;
            }
            try {
                FileUtil.del(dir.toFile());
                log.info("已清理应用磁盘产物，appId: {}，目录: {}", appId, dir);
            } catch (Exception e) {
                // 文件删除失败不应影响删除结果，仅记录日志，避免孤儿目录持续增长。
                log.error("清理应用磁盘产物失败，appId: {}，目录: {}", appId, dir, e);
            }
        }
    }

    @Override
    public Page<AppVO> listMyAppsByPage(AppQueryRequest appQueryRequest, long userId) {
        long pageNum = appQueryRequest.getPageNum();
        long pageSize = appQueryRequest.getPageSize();
        Page<App> appPage = this.page(Page.of(pageNum, pageSize),
                getMyAppQueryWrapper(appQueryRequest, userId));
        Page<AppVO> appVOPage = new Page<>(pageNum, pageSize, appPage.getTotalRow());
        List<AppVO> appVOList = getAppVOList(appPage.getRecords());
        appVOPage.setRecords(appVOList);
        return appVOPage;
    }

    @Override
    public Page<PublicAppVO> listFeaturedAppsByPage(AppQueryRequest appQueryRequest) {
        long pageNum = appQueryRequest.getPageNum();
        long pageSize = appQueryRequest.getPageSize();
        Page<App> appPage = this.page(Page.of(pageNum, pageSize),
                getFeaturedAppQueryWrapper(appQueryRequest));
        Page<PublicAppVO> publicAppVOPage = new Page<>(pageNum, pageSize, appPage.getTotalRow());
        List<PublicAppVO> publicAppVOList = getPublicAppVOList(appPage.getRecords());
        publicAppVOPage.setRecords(publicAppVOList);
        return publicAppVOPage;
    }

    @Override
    public Page<App> adminListAppsByPage(AdminAppQueryRequest adminAppQueryRequest) {
        long pageNum = Math.max(adminAppQueryRequest.getPageNum(), 1);
        long pageSize = adminAppQueryRequest.getPageSize();
        return this.page(Page.of(pageNum, pageSize),
                getAdminQueryWrapper(adminAppQueryRequest));
    }

    private QueryWrapper getMyAppQueryWrapper(AppQueryRequest appQueryRequest, long userId) {
        if (appQueryRequest == null) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "请求参数为空");
        }
        String appName = appQueryRequest.getAppName();
        String sortField = appQueryRequest.getSortField();
        String sortOrder = appQueryRequest.getSortOrder();
        QueryWrapper queryWrapper = QueryWrapper.create()
                .eq("userId", userId);
        if (StrUtil.isNotBlank(appName)) {
            queryWrapper.like("appName", appName);
        }
        PageSortUtils.applySort(queryWrapper, sortField, sortOrder, ALLOWED_SORT_FIELDS);
        return queryWrapper;
    }

    private QueryWrapper getFeaturedAppQueryWrapper(AppQueryRequest appQueryRequest) {
        if (appQueryRequest == null) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "请求参数为空");
        }
        String appName = appQueryRequest.getAppName();
        String sortField = appQueryRequest.getSortField();
        String sortOrder = appQueryRequest.getSortOrder();
        // 精选应用：优先级等于 FEATURED_PRIORITY 的应用
        QueryWrapper queryWrapper = QueryWrapper.create()
                .eq("priority", AppConstant.FEATURED_PRIORITY);
        if (StrUtil.isNotBlank(appName)) {
            queryWrapper.like("appName", appName);
        }
        PageSortUtils.applySort(queryWrapper, sortField, sortOrder, ALLOWED_SORT_FIELDS);
        return queryWrapper;
    }

    private QueryWrapper getAdminQueryWrapper(AdminAppQueryRequest adminAppQueryRequest) {
        if (adminAppQueryRequest == null) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "请求参数为空");
        }
        Long id = adminAppQueryRequest.getId();
        String appName = adminAppQueryRequest.getAppName();
        String cover = adminAppQueryRequest.getCover();
        String initPrompt = adminAppQueryRequest.getInitPrompt();
        String codeGenType = adminAppQueryRequest.getCodeGenType();
        String deployKey = adminAppQueryRequest.getDeployKey();
        Integer priority = adminAppQueryRequest.getPriority();
        Long userId = adminAppQueryRequest.getUserId();
        String sortField = adminAppQueryRequest.getSortField();
        String sortOrder = adminAppQueryRequest.getSortOrder();
        QueryWrapper queryWrapper = QueryWrapper.create()
                .eq("id", id, id != null)
                .eq("priority", priority, priority != null)
                .eq("userId", userId, userId != null)
                .eq("codeGenType", codeGenType, StrUtil.isNotBlank(codeGenType))
                .like("appName", appName, StrUtil.isNotBlank(appName))
                .like("cover", cover, StrUtil.isNotBlank(cover))
                .like("initPrompt", initPrompt, StrUtil.isNotBlank(initPrompt))
                .like("deployKey", deployKey, StrUtil.isNotBlank(deployKey));
        PageSortUtils.applySort(queryWrapper, sortField, sortOrder, ALLOWED_SORT_FIELDS);
        return queryWrapper;
    }

    @Override
    public AppVO getAppVO(App app) {
        if (app == null) {
            return null;
        }
        AppVO appVO = new AppVO();
        BeanUtil.copyProperties(app, appVO);
        return appVO;
    }

    @Override
    public List<AppVO> getAppVOList(List<App> appList) {
        if (CollUtil.isEmpty(appList)) {
            return new ArrayList<>();
        }
        return appList.stream().map(this::getAppVO).collect(Collectors.toList());
    }

    @Override
    public PublicAppVO getPublicAppVO(App app) {
        if (app == null) {
            return null;
        }
        PublicAppVO publicAppVO = new PublicAppVO();
        BeanUtil.copyProperties(app, publicAppVO);
        return publicAppVO;
    }

    @Override
    public List<PublicAppVO> getPublicAppVOList(List<App> appList) {
        if (CollUtil.isEmpty(appList)) {
            return new ArrayList<>();
        }
        return appList.stream().map(this::getPublicAppVO).collect(Collectors.toList());
    }

    @Override
    public Flux<String>  chatToGenCode(Long appId, String message, User loginUser) {
        App app = this.getById(appId);
        ThrowUtils.throwIf(app == null, ErrorCode.NOT_FOUND_ERROR, "应用不存在");
        // 3、权限校验：仅应用主人或管理员可以对话（编辑权限）
        boolean isOwner = app.getUserId().equals(loginUser.getId());
        boolean isAdmin = UserConstant.ADMIN_ROLE.equals(loginUser.getUserRole());
        ThrowUtils.throwIf(!isOwner && !isAdmin, ErrorCode.NO_AUTH_ERROR, "没有权限");

        // 4、应用代码生成类型
        String codeGenType = app.getCodeGenType();
        CodeGenTypeEnum enumByValue = CodeGenTypeEnum.getEnumByValue(codeGenType);
        if (enumByValue == null) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR ,"应用代码生成类型错误");
        }

        // 前置校验并行化：敏感审查与提示词增强（含图片收集）互不依赖，用虚拟线程并发执行。
        // 敏感审查是硬门槛——失败必须提前中断，不等待图片收集；通过后再等增强完成。
        final CodeGenTypeEnum genType = enumByValue;
        CompletableFuture<String> checkFuture = CompletableFuture.supplyAsync(
                () -> sensitiveCheckFactory.create().verify(message), virtualThreadExecutor);
        CompletableFuture<String> enhanceFuture = CompletableFuture.supplyAsync(
                () -> workflowService.enhancePrompt(message), virtualThreadExecutor);

        // 先等敏感审查：失败立即抛（此时图片收集仍在后台跑，但不会再被使用）
        String checkResult = checkFuture.join();
        validateSensitiveCheckResult(checkResult);
        // 审查通过，等提示词增强（图片收集）完成
        String enhancedMessage = enhanceFuture.join();
        log.info("提示词增强完成（增强前长度:{} → 增强后长度:{}）", message.length(), enhancedMessage.length());

        return generationCoordinator.execute(appId, () -> {
            Flux<String> stringFlux = aiCodeGeneratorFacade.generateAndSaveCodeStream(
                    enhancedMessage, genType, appId, app.getInitPrompt());
            // 锁获取成功且流创建就绪后才持久化用户消息，避免流初始化异常导致写入了用户消息但没有 AI 回复。
            chatHistoryService.addChatHistory(appId, loginUser.getId(), message, MessageTypeEnum.USER.getValue());
            return streamHandlerExecutor.doExecute(stringFlux, chatHistoryService, appId, loginUser, genType)
                    .doOnComplete(() -> {
                        String codeDir = AppConstant.CODE_OUTPUT_ROOT_DIR + File.separator + codeGenType + "_" + appId;
                        try {
                            var qualityResult = workflowService.runQualityCheck(codeDir, codeGenType);
                            if (qualityResult != null) {
                                log.info("产物完整性校验完成 - 通过: {}, 缺失文件: {}",
                                        qualityResult.getIsValid(),
                                        qualityResult.getErrors() != null ? qualityResult.getErrors().size() : 0);
                            }
                        } catch (Exception e) {
                            log.warn("产物完整性校验异常（不影响已生成的代码）: {}", e.getMessage(), e);
                        }
                    });
        });
    }

    private void validateSensitiveCheckResult(String checkResult) {
        String result = StrUtil.trim(checkResult);
        if (StrUtil.isBlank(result)) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "内容审查服务暂时不可用，请稍后重试");
        }
        if (!"PASS".equals(result)) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "输入内容包含不符合本网站提供的范围或违规信息");
        }
    }

    /**
     * 部署一致性设计说明（有意不加 @Transactional）：
     * 1. deployKey 在复制文件前落库，依靠 DB 唯一索引 uk_deployKey 抢占标识，防止并发生成重复 key；
     * 2. 文件复制/构建为文件系统操作，无法参与数据库事务，回滚无意义；
     * 3. DB 以 deployedTime 为部署成功标志：文件操作失败时不更新 deployedTime，下次部署复用同一 deployKey 重试，幂等安全；
     * 4. 部署在分布式锁内执行，若在此开长事务，Docker 构建（最长 180s）期间会一直占用数据库连接。
     */
    @Override
    public String deployApp(Long appId, User loginUser) {
        ThrowUtils.throwIf(loginUser == null, ErrorCode.NOT_LOGIN_ERROR, "用户未登录");
        return generationCoordinator.executeExclusively(appId, () -> deployAppWithProjectLock(appId, loginUser));
    }

    /**
     * 在应用生成锁已持有时执行部署，避免复制到正在被 AI 修改的半成品目录。
     */
    private String deployAppWithProjectLock(Long appId, User loginUser) {
        // 2、查询应用信息
        App app = this.getById(appId);
        ThrowUtils.throwIf(app == null, ErrorCode.NOT_FOUND_ERROR, "应用不存在");
        // 3、检查是否为本人应用
        ThrowUtils.throwIf(!app.getUserId().equals(loginUser.getId()), ErrorCode.NO_AUTH_ERROR, "非本人应用");
        // 4、检查是否 deployKey 没有则生成（字母+数字，长度由 app.deploy.key-length 配置，默认 16 位）
        String deployKey = app.getDeployKey();
        if (StrUtil.isBlank(deployKey)) {
            deployKey = RandomUtil.randomString(appDeployProperties.getKeyLength());
            app.setDeployKey(deployKey);
            this.updateById(app);
        }
        // 5、获取代码生成路径
        String codeGenType = app.getCodeGenType();
        String sourceDirName = codeGenType + "_" + appId;
        String sourceDirPath = AppConstant.CODE_OUTPUT_ROOT_DIR + File.separator + sourceDirName;
        // 6、检查路径是否存在
        File sourceDir = new File(sourceDirPath);
        ThrowUtils.throwIf(!sourceDir.exists() || !sourceDir.isDirectory(), ErrorCode.NOT_FOUND_ERROR, "代码生成路径不存在，请先生成路径");
        // 7. Vue 项目特殊处理：执行构建
        CodeGenTypeEnum codeGenTypeEnum = CodeGenTypeEnum.getEnumByValue(codeGenType);
        if (codeGenTypeEnum == CodeGenTypeEnum.VUE_PROJECT) {
            // Vue 项目需要构建
            boolean buildSuccess = vueProjectBuilder.buildProject(sourceDirPath);
            ThrowUtils.throwIf(!buildSuccess, ErrorCode.SYSTEM_ERROR, "Vue 项目构建失败，请检查代码和依赖");
            // 检查 dist 目录是否存在
            File distDir = new File(sourceDirPath, "dist");
            ThrowUtils.throwIf(!distDir.exists(), ErrorCode.SYSTEM_ERROR, "Vue 项目构建完成但未生成 dist 目录");
            // 将 dist 目录作为部署源
            sourceDir = distDir;
            log.info("Vue 项目构建成功，将部署 dist 目录: {}", distDir.getAbsolutePath());
        }
        // 8. 复制文件到部署目录
        try {
            publishDeployFiles(sourceDir, deployKey);
        } catch (Exception e) {
            log.error("部署失败，{}", e.getMessage());
            throw new BusinessException(ErrorCode.OPERATION_ERROR, "部署失败，请稍后重试");
        }
        // 9、更新数据库
        App updateApp = new App();
        updateApp.setId(appId);
        updateApp.setDeployKey(deployKey);
        updateApp.setDeployedTime(LocalDateTime.now());
        boolean updateResult = this.updateById(updateApp);
        ThrowUtils.throwIf(!updateResult, ErrorCode.OPERATION_ERROR, "更新应用部署信息失败");
        // 10、返回访问的 URL（部署域名由 app.deploy.host 配置，产物路径前缀由 app.deploy.path 配置）
        //     nginx 通过 location /deploy/ 服务部署目录
        String deployBase = appDeployProperties.getHost().replaceAll("/+$", "")
                + "/" + appDeployProperties.getPath().replaceAll("^/+", "").replaceAll("/+$", "");
        // 必须以尾斜杠结尾：部署产物是相对路径引用（./assets/...），
        // 无尾斜杠时浏览器会把 ./assets 解析到上一级（/deploy/assets），导致资源 404、页面空白。
        return String.format("%s/%s/", deployBase, deployKey);
    }

    private void publishDeployFiles(File sourceDir, String deployKey) throws IOException {
        Path deployRoot = Paths.get(AppConstant.CODE_DEPLOY_ROOT_DIR).toAbsolutePath().normalize();
        Files.createDirectories(deployRoot);
        Path targetDir = deployRoot.resolve(deployKey).normalize();
        Path tempDir = Files.createTempDirectory(deployRoot, "." + deployKey + "-");
        // 修复：createTempDirectory 固定 0700，nginx 低权限用户读不到部署产物，
        try {
            Files.setPosixFilePermissions(tempDir, PosixFilePermissions.fromString("rwxr-xr-x"));
        } catch (UnsupportedOperationException e) {
            log.debug("当前文件系统不支持 POSIX 权限设置: {}", tempDir);
        }
        Path backupDir = null;
        try {
            FileUtil.copyContent(sourceDir, tempDir.toFile(), true);
            if (Files.exists(targetDir)) {
                backupDir = deployRoot.resolve("." + deployKey + "-backup-" + System.nanoTime());
                moveDirectory(targetDir, backupDir);
            }
            moveDirectory(tempDir, targetDir);
            tempDir = null;
            if (backupDir != null) {
                FileUtil.del(backupDir.toFile());
            }
        } catch (Exception e) {
            if (backupDir != null && !Files.exists(targetDir) && Files.exists(backupDir)) {
                try {
                    moveDirectory(backupDir, targetDir);
                } catch (Exception restoreError) {
                    e.addSuppressed(restoreError);
                }
            }
            if (e instanceof IOException ioException) {
                throw ioException;
            }
            throw new IOException("发布部署文件失败", e);
        } finally {
            if (tempDir != null) {
                FileUtil.del(tempDir.toFile());
            }
        }
    }

    private void moveDirectory(Path source, Path target) throws IOException {
        try {
            Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(source, target);
        }
    }
}
