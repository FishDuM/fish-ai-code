package hk.ljx.fishaicode.service;

import com.mybatisflex.core.paginate.Page;
import com.mybatisflex.core.service.IService;
import hk.ljx.fishaicode.model.dto.app.AdminAppQueryRequest;
import hk.ljx.fishaicode.model.dto.app.AppAddRequest;
import hk.ljx.fishaicode.model.dto.app.AppQueryRequest;
import hk.ljx.fishaicode.model.entity.App;
import hk.ljx.fishaicode.model.entity.User;
import hk.ljx.fishaicode.model.vo.AppVO;
import hk.ljx.fishaicode.model.vo.PublicAppVO;
import org.springframework.http.codec.ServerSentEvent;
import reactor.core.publisher.Flux;

import java.util.List;

/**
 * 应用 服务层。
 *
 * @author fish
 */
public interface AppService extends IService<App> {

    /**
     * 创建应用
     *
     * @param appAddRequest 创建应用请求
     * @param loginUser     当前登录用户
     * @return 新应用 id
     */
    long addApp(AppAddRequest appAddRequest, User loginUser);

    /**
     * 用户更新自己的应用（仅支持修改应用名称）
     *
     * @param id            应用 id
     * @param appName       应用名称
     * @param loginUser     当前登录用户
     * @return 是否更新成功
     */
    boolean updateMyApp(Long id, String appName, User loginUser);

    /**
     * 管理员更新应用（支持更新名称、封面、优先级）
     *
     * @param id            应用 id
     * @param appName       应用名称
     * @param cover         应用封面
     * @param priority      优先级
     * @return 是否更新成功
     */
    boolean adminUpdateApp(Long id, String appName, String cover, Integer priority);

    /**
     * 获取应用并校验访问权限（仅本人或管理员可访问）。
     * 应用不存在抛 NOT_FOUND_ERROR，无权限抛 NO_AUTH_ERROR。
     *
     * @param appId     应用 id
     * @param loginUser 当前登录用户
     * @return 应用实体
     */
    App getAppWithPermission(Long appId, User loginUser);

    /**
     * 获取应用（仅精选应用允许公开访问；非精选应用对非本人/非管理员返回无权限）。
     * 用于详情页公开查看：任何人（含未登录）都能看到精选应用。
     *
     * @param appId     应用 id
     * @param loginUser 当前登录用户（可能为 null）
     * @return 应用实体
     */
    App getPublicAppById(Long appId, User loginUser);

    /**
     * 获取应用并校验所有权（仅本人可访问，管理员不可代替）。
     * 应用不存在抛 NOT_FOUND_ERROR，非本人抛 NO_AUTH_ERROR。
     *
     * @param appId     应用 id
     * @param loginUser 当前登录用户
     * @return 应用实体
     */
    App getOwnedApp(Long appId, User loginUser);

    /**
     * 管理员删除任意应用（连同对话历史，整体在一个事务中）
     *
     * @param id 应用 id
     * @return 是否删除成功
     */
    boolean adminDeleteApp(long id);

    /**
     * 管理员根据 id 查看应用详情（含不存在校验）
     *
     * @param id 应用 id
     * @return 应用实体
     */
    App adminGetAppById(long id);

    /**
     * 用户删除自己的应用
     *
     * @param id        应用 id
     * @param loginUser 当前登录用户
     * @return 是否删除成功
     */
    boolean deleteMyApp(long id, User loginUser);

    /**
     * 分页查询用户自己的应用列表
     *
     * @param appQueryRequest 查询请求
     * @param userId          用户 id
     * @return 分页结果
     */
    Page<AppVO> listMyAppsByPage(AppQueryRequest appQueryRequest, long userId);

    /**
     * 分页查询精选应用列表
     *
     * @param appQueryRequest 查询请求
     * @return 分页结果
     */
    Page<PublicAppVO> listFeaturedAppsByPage(AppQueryRequest appQueryRequest);

    /**
     * 管理员分页查询应用列表
     *
     * @param adminAppQueryRequest 查询请求
     * @return 分页结果
     */
    Page<App> adminListAppsByPage(AdminAppQueryRequest adminAppQueryRequest);

    /**
     * 获取应用视图对象
     *
     * @param app 应用
     * @return 应用视图对象
     */
    AppVO getAppVO(App app);

    /**
     * 获取应用视图对象列表
     *
     * @param appList 应用列表
     * @return 应用视图对象列表
     */
    List<AppVO> getAppVOList(List<App> appList);

    /**
     * 获取公开展示的应用视图对象。
     *
     * @param app 应用
     * @return 不包含内部字段的公开视图对象
     */
    PublicAppVO getPublicAppVO(App app);

    /**
     * 获取公开展示的应用视图对象列表。
     *
     * @param appList 应用列表
     * @return 公开视图对象列表
     */
    List<PublicAppVO> getPublicAppVOList(List<App> appList);

    /**
     * 对话生成应用
     * @param appId 应用id
     * @param message 提示词
     * @param loginUser 登录用户
     * @return 流
     */
    Flux<String> chatToGenCode(Long appId, String message, User loginUser);

    /**
     * 应用部署
     * @param appId 应用id
     * @param loginUser 登录用户
     * @return 可访问的地址
     */
    String deployApp(Long appId, User loginUser);
}
