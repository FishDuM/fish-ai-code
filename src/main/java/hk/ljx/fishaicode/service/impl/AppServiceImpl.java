package hk.ljx.fishaicode.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.RandomUtil;
import cn.hutool.core.util.StrUtil;
import com.mybatisflex.core.paginate.Page;
import com.mybatisflex.core.query.QueryWrapper;
import com.mybatisflex.spring.service.impl.ServiceImpl;
import hk.ljx.fishaicode.ai.AiCodeGenTypeRoutingService;
import hk.ljx.fishaicode.ai.AiCodeGenTypeRoutingServiceFactory;
import hk.ljx.fishaicode.constant.AppConstant;
import hk.ljx.fishaicode.core.AiCodeGeneratorFacade;
import hk.ljx.fishaicode.core.GenerationCoordinator;
import hk.ljx.fishaicode.core.builder.VueProjectBuilder;
import hk.ljx.fishaicode.core.handler.StreamHandlerExecutor;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.exception.ThrowUtils;
import hk.ljx.fishaicode.modal.dto.app.AdminAppQueryRequest;
import hk.ljx.fishaicode.modal.dto.app.AppAddRequest;
import hk.ljx.fishaicode.modal.dto.app.AppQueryRequest;
import hk.ljx.fishaicode.modal.entity.App;
import hk.ljx.fishaicode.modal.entity.User;
import hk.ljx.fishaicode.mapper.AppMapper;
import hk.ljx.fishaicode.modal.enums.CodeGenTypeEnum;
import hk.ljx.fishaicode.modal.enums.MessageTypeEnum;
import hk.ljx.fishaicode.modal.vo.AppVO;
import hk.ljx.fishaicode.modal.vo.PublicAppVO;
import hk.ljx.fishaicode.ai.SensitiveCheckFactory;
import hk.ljx.fishaicode.langgraph4j.service.WorkflowService;
import hk.ljx.fishaicode.service.AppService;
import hk.ljx.fishaicode.service.ChatHistoryService;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.io.File;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 应用 服务层实现。
 *
 * @author fish
 */
@Slf4j
@Service
public class AppServiceImpl extends ServiceImpl<AppMapper, App> implements AppService {

    @Resource
    private AiCodeGeneratorFacade aiCodeGeneratorFacade;

    @Resource
    private ChatHistoryService chatHistoryService;

    @Resource
    private StreamHandlerExecutor streamHandlerExecutor;

    @Resource
    private VueProjectBuilder vueProjectBuilder;

    @Resource
    private AiCodeGenTypeRoutingServiceFactory aiCodeGenTypeRoutingServiceFactory;

    @Resource
    private SensitiveCheckFactory sensitiveCheckFactory;

    @Resource
    private WorkflowService workflowService;

    @Resource
    private GenerationCoordinator generationCoordinator;


    @Override
    public long addApp(AppAddRequest appAddRequest, User loginUser) {
        // 1. 校验
        if (appAddRequest == null) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "请求参数为空");
        }
        String initPrompt = appAddRequest.getInitPrompt();
        if (StrUtil.isBlank(initPrompt)) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "应用初始化 prompt 不能为空");
        }
        if (initPrompt.length() > 10000) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "初始化 prompt 过长");
        }
        // AI 内容安全审查：检查用户输入是否涉及法律违规或政治敏感
        String checkResult = sensitiveCheckFactory.create().verify(initPrompt);
        if (!"PASS".equals(checkResult.trim())) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "输入内容包含不符合本网站提供的范围或违规信息");
        }
        // 2. 构建应用对象：应用名使用提示词前 6 个字符，路由仍使用完整提示词
        String appName = initPrompt.length() > 6 ? initPrompt.substring(0, 6) : initPrompt;
        App app = App.builder()
                        .appName(appName).build();
        BeanUtil.copyProperties(appAddRequest, app);
        app.setUserId(loginUser.getId());
        // 使用 AI 智能选择代码生成类型（多例模式）
        AiCodeGenTypeRoutingService routingService = aiCodeGenTypeRoutingServiceFactory.createAiCodeGenTypeRoutingService();
        CodeGenTypeEnum codeGenTypeEnum = routingService.routeCodeGenType(initPrompt);
        app.setCodeGenType(codeGenTypeEnum.getValue());
        // 优先级默认 0
        if (app.getPriority() == null) {
            app.setPriority(0);
        }
        app.setCover("https://api.elaina.cat/random/");
        // 3. 保存
        boolean result = this.save(app);
        if (!result) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "创建应用失败");
        }
        return app.getId();
    }

    @Override
    public boolean updateMyApp(Long id, String appName, User loginUser) {
        // 1. 校验
        if (id == null || id <= 0) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR);
        }
        if (StrUtil.isBlank(appName)) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "应用名称不能为空");
        }
        // 2. 检查应用是否存在
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
        // 1. 校验
        if (id == null || id <= 0) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR);
        }
        if (appName != null && StrUtil.isBlank(appName)) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "应用名称不能为空");
        }
        // 2. 检查应用是否存在
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

    @Override
    public boolean deleteMyApp(long id, User loginUser) {
        // 1. 校验
        if (id <= 0) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR);
        }
        // 2. 检查应用是否存在
        App oldApp = this.getById(id);
        if (oldApp == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND_ERROR);
        }
        // 3. 只能删除自己的应用
        if (!oldApp.getUserId().equals(loginUser.getId())) {
            throw new BusinessException(ErrorCode.NO_AUTH_ERROR);
        }
        // 4. 删除应用的所有对话历史
        chatHistoryService.removeByAppId(id);
        // 5. 删除应用
        return this.removeById(id);
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

    @Override
    public QueryWrapper getMyAppQueryWrapper(AppQueryRequest appQueryRequest, long userId) {
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
        if (StrUtil.isNotBlank(sortField)) {
            queryWrapper.orderBy(sortField, "ascend".equals(sortOrder));
        }
        return queryWrapper;
    }

    @Override
    public QueryWrapper getFeaturedAppQueryWrapper(AppQueryRequest appQueryRequest) {
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
        if (StrUtil.isNotBlank(sortField)) {
            queryWrapper.orderBy(sortField, "ascend".equals(sortOrder));
        }
        return queryWrapper;
    }

    @Override
    public QueryWrapper getAdminQueryWrapper(AdminAppQueryRequest adminAppQueryRequest) {
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
        if (StrUtil.isNotBlank(sortField)) {
            queryWrapper.orderBy(sortField, "ascend".equals(sortOrder));
        }
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
        // 1、校验参数
        ThrowUtils.throwIf(appId == null || appId <= 0, ErrorCode.PARAMS_ERROR, "应用 ID 不能为空");
        ThrowUtils.throwIf(StrUtil.isBlank(message), ErrorCode.PARAMS_ERROR, "用户消息不能为空");
        // 2、获取应用信息
        App app = this.getById(appId);
        ThrowUtils.throwIf(app == null, ErrorCode.NOT_FOUND_ERROR, "应用不存在");
        // 3、权限校验，仅本人可以和自己的应用对话
        ThrowUtils.throwIf(!app.getUserId().equals(loginUser.getId()), ErrorCode.NO_AUTH_ERROR, "没有权限");
        // AI 内容安全审查：检查用户输入是否涉及法律违规或政治敏感
        String checkResult = sensitiveCheckFactory.create().verify(message);
        if (!"PASS".equals(checkResult.trim())) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "输入内容包含不符合本网站提供的范围或违规信息");
        }
        // 4、应用代码生成类型
        String codeGenType = app.getCodeGenType();
        CodeGenTypeEnum enumByValue = CodeGenTypeEnum.getEnumByValue(codeGenType);
        if (enumByValue == null) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR ,"应用代码生成类型错误");
        }
        return generationCoordinator.execute(appId, () -> {
            // 锁获取成功后才持久化用户消息和调用模型，避免重复请求写入两份历史记录。
            chatHistoryService.addChatHistory(appId, loginUser.getId(), message, MessageTypeEnum.USER.getValue());
            String enhancedMessage = workflowService.enhancePrompt(message);
            log.info("提示词增强完成（增强前长度:{} → 增强后长度:{}）", message.length(), enhancedMessage.length());
            Flux<String> stringFlux = aiCodeGeneratorFacade.generateAndSaveCodeStream(enhancedMessage, enumByValue, appId);
            return streamHandlerExecutor.doExecute(stringFlux, chatHistoryService, appId, loginUser, enumByValue)
                    .doOnComplete(() -> {
                        String codeDir = AppConstant.CODE_OUTPUT_ROOT_DIR + File.separator + codeGenType + "_" + appId;
                        try {
                            var qualityResult = workflowService.runQualityCheck(codeDir);
                            if (qualityResult != null) {
                                log.info("代码质量检查完成 - 通过: {}, 错误数: {}",
                                        qualityResult.getIsValid(),
                                        qualityResult.getErrors() != null ? qualityResult.getErrors().size() : 0);
                            }
                        } catch (Exception e) {
                            log.warn("代码质量检查异常（不影响已生成的代码）: {}", e.getMessage(), e);
                        }
                    });
        });
    }

    @Override
    public String deployApp(Long appId, User loginUser) {
        // 1、参数校验
        ThrowUtils.throwIf(appId == null || appId < 0, ErrorCode.PARAMS_ERROR, "应用ID不能为空");
        ThrowUtils.throwIf(loginUser == null, ErrorCode.NOT_LOGIN_ERROR, "用户未登录");
        return generationCoordinator.executeExclusively(appId, () -> deployAppWithProjectLock(appId, loginUser));
    }

    /**
     * 在应用生成锁已持有时执行部署，避免复制到正在被 AI 修改的半成品目录。
     */
    private String deployAppWithProjectLock(Long appId, User loginUser) {
        // 2、查询应用信息
        App app = this.getById(appId);
        ThrowUtils.throwIf(app == null, ErrorCode.PARAMS_ERROR, "应用不存在");
        // 3、检查是否为本人应用
        ThrowUtils.throwIf(!app.getUserId().equals(loginUser.getId()), ErrorCode.NO_AUTH_ERROR, "非本人应用");
        // 4、检查是否 deployKey 没有则生成 6位（字母+数字）
        String deployKey = app.getDeployKey();
        if (StrUtil.isBlank(deployKey)) {
            deployKey = RandomUtil.randomString(6);
            app.setDeployKey(deployKey);
            this.updateById(app);
        }
        // 5、获取代码生成路径
        String codeGenType = app.getCodeGenType();
        String sourceDirName = codeGenType + "_" + appId;
        String sourceDirPath = AppConstant.CODE_OUTPUT_ROOT_DIR + File.separator + sourceDirName;
        // 6、检查路径是否存在
        File sourceDir = new File(sourceDirPath);
        ThrowUtils.throwIf(!sourceDir.exists() || !sourceDir.isDirectory(), ErrorCode.PARAMS_ERROR, "代码生成路径不存在，请先生成路径");
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
        String deployDirPath = AppConstant.CODE_DEPLOY_ROOT_DIR + File.separator + deployKey;
        try {
            FileUtil.copyContent(sourceDir, new File(deployDirPath), true);
        } catch (Exception e) {
            log.error("部署失败，{}", e.getMessage());
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "部署失败，请稍后重试" + e.getMessage());
        }
        // 9、更新数据库
        App updateApp = new App();
        updateApp.setId(appId);
        updateApp.setDeployKey(deployKey);
        updateApp.setDeployedTime(LocalDateTime.now());
        boolean updateResult = this.updateById(updateApp);
        ThrowUtils.throwIf(!updateResult, ErrorCode.PARAMS_ERROR, "更新应用部署信息失败");
        // 10、返回访问的 URL
        return String.format("%s/%s", AppConstant.CODE_DEPLOY_HOST, deployKey);
    }
}
