package hk.ljx.fishaicode.service;

import com.mybatisflex.core.paginate.Page;
import com.mybatisflex.core.query.QueryWrapper;
import com.mybatisflex.core.service.IService;
import hk.ljx.fishaicode.modal.dto.app.AdminAppQueryRequest;
import hk.ljx.fishaicode.modal.dto.app.AppAddRequest;
import hk.ljx.fishaicode.modal.dto.app.AppQueryRequest;
import hk.ljx.fishaicode.modal.entity.App;
import hk.ljx.fishaicode.modal.entity.User;
import hk.ljx.fishaicode.modal.vo.AppVO;
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
    Page<AppVO> listFeaturedAppsByPage(AppQueryRequest appQueryRequest);

    /**
     * 管理员分页查询应用列表
     *
     * @param adminAppQueryRequest 查询请求
     * @return 分页结果
     */
    Page<App> adminListAppsByPage(AdminAppQueryRequest adminAppQueryRequest);

    /**
     * 获取用户应用的查询条件
     *
     * @param appQueryRequest 查询请求
     * @param userId          用户 id
     * @return 查询条件
     */
    QueryWrapper getMyAppQueryWrapper(AppQueryRequest appQueryRequest, long userId);

    /**
     * 获取精选应用的查询条件
     *
     * @param appQueryRequest 查询请求
     * @return 查询条件
     */
    QueryWrapper getFeaturedAppQueryWrapper(AppQueryRequest appQueryRequest);

    /**
     * 获取管理员查询条件
     *
     * @param adminAppQueryRequest 查询请求
     * @return 查询条件
     */
    QueryWrapper getAdminQueryWrapper(AdminAppQueryRequest adminAppQueryRequest);

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
