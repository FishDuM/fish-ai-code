package hk.ljx.fishaicode.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.mybatisflex.core.paginate.Page;
import com.mybatisflex.core.query.QueryWrapper;
import com.mybatisflex.spring.service.impl.ServiceImpl;
import hk.ljx.fishaicode.constant.AppConstant;
import hk.ljx.fishaicode.core.AiCodeGeneratorFacade;
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
import hk.ljx.fishaicode.modal.vo.AppVO;
import hk.ljx.fishaicode.service.AppService;
import jakarta.annotation.Resource;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 应用 服务层实现。
 *
 * @author fish
 */
@Service
public class AppServiceImpl extends ServiceImpl<AppMapper, App> implements AppService {

    @Resource
    private AiCodeGeneratorFacade aiCodeGeneratorFacade;

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
        // 2. 构建应用对象
        App app = new App();
        BeanUtil.copyProperties(appAddRequest, app);
        app.setUserId(loginUser.getId());
        // 代码生成类型默认 html
        if (StrUtil.isBlank(app.getCodeGenType())) {
            app.setCodeGenType(CodeGenTypeEnum.HTML.getValue());
        }
        // 优先级默认 0
        if (app.getPriority() == null) {
            app.setPriority(0);
        }
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
        // 2. 检查应用是否存在
        App oldApp = this.getById(id);
        if (oldApp == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND_ERROR);
        }
        // 3. 更新
        App app = new App();
        app.setId(id);
        app.setAppName(appName);
        app.setCover(cover);
        app.setPriority(priority);
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
        // 4. 删除
        return this.removeById(id);
    }

    @Override
    public Page<AppVO> listMyAppsByPage(AppQueryRequest appQueryRequest, long userId) {
        long pageNum = appQueryRequest.getPageNum();
        long pageSize = appQueryRequest.getPageSize();
        Page<App> appPage = this.page(Page.of(pageNum, Math.min(pageSize, 20)),
                getMyAppQueryWrapper(appQueryRequest, userId));
        Page<AppVO> appVOPage = new Page<>(pageNum, pageSize, appPage.getTotalRow());
        List<AppVO> appVOList = getAppVOList(appPage.getRecords());
        appVOPage.setRecords(appVOList);
        return appVOPage;
    }

    @Override
    public Page<AppVO> listFeaturedAppsByPage(AppQueryRequest appQueryRequest) {
        long pageNum = appQueryRequest.getPageNum();
        long pageSize = appQueryRequest.getPageSize();
        Page<App> appPage = this.page(Page.of(pageNum, Math.min(pageSize, 20)),
                getFeaturedAppQueryWrapper(appQueryRequest));
        Page<AppVO> appVOPage = new Page<>(pageNum, pageSize, appPage.getTotalRow());
        List<AppVO> appVOList = getAppVOList(appPage.getRecords());
        appVOPage.setRecords(appVOList);
        return appVOPage;
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
                .eq("userId", userId)
                .like("appName", appName);
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
                .eq("priority", AppConstant.FEATURED_PRIORITY)
                .like("appName", appName);
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
                .eq("id", id)
                .eq("priority", priority)
                .eq("userId", userId)
                .eq("codeGenType", codeGenType)
                .like("appName", appName)
                .like("cover", cover)
                .like("initPrompt", initPrompt)
                .like("deployKey", deployKey);
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
    public Flux<ServerSentEvent<String>> chatToGenCode(Long appId, String message, User loginUser) {
        // 1、校验参数
        ThrowUtils.throwIf(appId == null || appId <= 0, ErrorCode.PARAMS_ERROR, "应用 ID 不能为空");
        ThrowUtils.throwIf(StrUtil.isBlank(message), ErrorCode.PARAMS_ERROR, "用户消息不能为空");
        // 2、获取应用信息
        App app = this.getById(appId);
        ThrowUtils.throwIf(app == null, ErrorCode.NOT_FOUND_ERROR, "应用不存在");
        // 3、权限校验，仅本人可以和自己的应用对话
        ThrowUtils.throwIf(!app.getUserId().equals(loginUser.getId()), ErrorCode.NO_AUTH_ERROR, "没有权限");
        // 4、应用代码生成类型
        String codeGenType = app.getCodeGenType();
        CodeGenTypeEnum enumByValue = CodeGenTypeEnum.getEnumByValue(codeGenType);
        if (enumByValue == null) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR ,"应用代码生成类型错误");
        }
        // 5、调用代码生成接口
        Flux<String> stringFlux = aiCodeGeneratorFacade.generateAndSaveCodeStream(message, enumByValue, appId);
        return stringFlux.map(code -> {
            Map<String, String> wrapper = Map.of("d", code);
            String jsonStr = JSONUtil.toJsonStr(wrapper);
            return ServerSentEvent.<String>builder()
                    .data(jsonStr)
                    .build();
        }).concatWith(Mono.just(
                ServerSentEvent.<String>builder()
                        .event("done")
                        .data("")
                        .build()
        ));
    }
}
