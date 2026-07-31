package hk.ljx.fishaicode.service;

import com.mybatisflex.core.paginate.Page;
import com.mybatisflex.core.service.IService;
import hk.ljx.fishaicode.model.dto.user.UserAddRequest;
import hk.ljx.fishaicode.model.dto.user.UserQueryRequest;
import hk.ljx.fishaicode.model.dto.user.UserUpdateRequest;
import hk.ljx.fishaicode.model.entity.User;
import hk.ljx.fishaicode.model.vo.LoginUserVO;
import hk.ljx.fishaicode.model.vo.UserVO;
import jakarta.servlet.http.HttpServletRequest;

import java.util.List;

/**
 * 用户 服务层。
 *
 * @author fish
 */
public interface UserService extends IService<User> {

    /**
     * 用户注册
     *
     * @param userAccount   用户账户
     * @param userPassword  用户密码
     * @param checkPassword 校验密码
     * @return 新用户 id
     */
    long userRegister(String userAccount, String userPassword, String checkPassword);

    /**
     * 管理员创建用户（含账号查重、角色校验、默认密码设置）
     *
     * @param userAddRequest 创建用户请求
     * @return 新用户 id
     */
    long addUser(UserAddRequest userAddRequest);

    /**
     * 用户登录
     *
     * @param userAccount  用户账户
     * @param userPassword 用户密码
     * @param request
     * @return 脱敏后的用户信息
     */
    LoginUserVO userLogin(String userAccount, String userPassword, HttpServletRequest request);

    /**
     * 获取当前登录用户
     *
     * @param request http 请求
     * @return 当前登录用户
     */
    User getLoginUser(HttpServletRequest request);

    /**
     * 获取当前登录用户（未登录时返回 null，不抛异常）
     * 用于公开接口：登录状态可空获取，由调用方决定是否需要登录
     *
     * @param request http 请求
     * @return 当前登录用户，未登录为 null
     */
    User getLoginUserOrNull(HttpServletRequest request);

    /**
     * 用户注销
     *
     * @param request http 请求
     * @return true 表示注销成功
     */
    boolean userLogout(HttpServletRequest request);

    /**
     * 获取加密后的密码
     * @param userPassword 用户密码
     * @return 加密后的密码
     */
    String getEncryptPassword(String userPassword);

    /**
     * 获取脱敏的已登录用户信息
     *
     * @return 脱敏的已登录用户信息
     */
    LoginUserVO getLoginUserVO(User user);

    /**
     * 管理员分页查询用户列表（脱敏视图）
     *
     * @param userQueryRequest 用户查询请求
     * @return 脱敏用户分页结果
     */
    Page<UserVO> listUserVOByPage(UserQueryRequest userQueryRequest);

    /**
     * 根据 id 获取用户（含不存在校验）
     *
     * @param id 用户 id
     * @return 用户实体
     */
    User getUserById(long id);

    /**
     * 根据 id 获取脱敏用户信息（含不存在校验）
     *
     * @param id 用户 id
     * @return 脱敏用户信息
     */
    UserVO getUserVOById(long id);

    /**
     * 删除用户
     *
     * @param id 用户 id
     * @return true 表示删除成功
     */
    boolean deleteUser(long id);

    /**
     * 更新用户
     *
     * @param userUpdateRequest 更新用户请求
     * @return true 表示更新成功
     */
    boolean updateUser(UserUpdateRequest userUpdateRequest);

    /**
     * 获取脱敏的用户信息
     * @param user 用户
     * @return 脱敏的用户信息
     */
    UserVO getUserVO(User user);

    /**
     * 获取脱敏的用户列表
     * @param userList 用户列表
     * @return 脱敏的用户列表
     */
    List<UserVO> getUserVOList(List<User> userList);
}
