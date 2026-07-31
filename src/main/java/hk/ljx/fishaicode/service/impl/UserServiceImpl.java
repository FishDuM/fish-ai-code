package hk.ljx.fishaicode.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import com.mybatisflex.core.paginate.Page;
import com.mybatisflex.core.query.QueryWrapper;
import com.mybatisflex.spring.service.impl.ServiceImpl;
import hk.ljx.fishaicode.common.PageSortUtils;
import hk.ljx.fishaicode.constant.UserConstant;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.exception.ThrowUtils;
import hk.ljx.fishaicode.model.dto.user.UserAddRequest;
import hk.ljx.fishaicode.model.dto.user.UserQueryRequest;
import hk.ljx.fishaicode.model.dto.user.UserUpdateRequest;
import hk.ljx.fishaicode.model.entity.User;
import hk.ljx.fishaicode.mapper.UserMapper;
import hk.ljx.fishaicode.model.enums.UserRoleEnum;
import hk.ljx.fishaicode.model.vo.LoginUserVO;
import hk.ljx.fishaicode.model.vo.UserVO;
import hk.ljx.fishaicode.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import static hk.ljx.fishaicode.constant.UserConstant.USER_LOGIN_STATE;

/**
 * 用户 服务层实现。
 *
 * @author fish
 */
@Service
public class UserServiceImpl extends ServiceImpl<UserMapper, User>  implements UserService{

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    private static final java.util.Set<String> ALLOWED_SORT_FIELDS = java.util.Set.of(
            "id", "userAccount", "userName", "userRole", "createTime", "updateTime", "editTime"
    );

    @Override
    public long userRegister(String userAccount, String userPassword, String checkPassword) {
        // 1. 校验
        if (StrUtil.hasBlank(userAccount, userPassword, checkPassword)) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "参数为空");
        }
        if (userAccount.length() < 4) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "用户账号过短");
        }
        if (userPassword.length() < 8 || checkPassword.length() < 8) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "用户密码过短");
        }
        if (!userPassword.equals(checkPassword)) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "两次输入的密码不一致");
        }
        // 2. 检查是否重复
        QueryWrapper queryWrapper = new QueryWrapper();
        queryWrapper.eq("userAccount", userAccount);
        long count = this.mapper.selectCountByQuery(queryWrapper);
        if (count > 0) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "注册失败，请检查输入");
        }
        // 3. 加密
        String encryptPassword = getEncryptPassword(userPassword);
        // 4. 插入数据
        User user = new User();
        user.setUserAccount(userAccount);
        user.setUserPassword(encryptPassword);
        user.setUserAvatar(UserConstant.DEFAULT_USER_AVATAR);
        user.setUserName(UserConstant.DEFAULT_USER_NAME);
        user.setUserRole(UserRoleEnum.USER.getValue());
        boolean saveResult = this.save(user);
        if (!saveResult) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "注册失败，数据库错误");
        }
        return user.getId();
    }

    @Override
    public long addUser(UserAddRequest userAddRequest) {
        // 1. 校验
        ThrowUtils.throwIf(userAddRequest == null, ErrorCode.PARAMS_ERROR, "请求参数为空");
        String userAccount = userAddRequest.getUserAccount();
        ThrowUtils.throwIf(StrUtil.isBlank(userAccount) || userAccount.length() < 4,
                ErrorCode.PARAMS_ERROR, "用户账号过短");
        String userRole = userAddRequest.getUserRole();
        if (StrUtil.isNotBlank(userRole)) {
            ThrowUtils.throwIf(UserRoleEnum.getEnumByValue(userRole) == null,
                    ErrorCode.PARAMS_ERROR, "用户角色不合法");
        }
        // 2. 检查账号是否已存在
        QueryWrapper queryWrapper = QueryWrapper.create().eq("userAccount", userAccount);
        long count = this.count(queryWrapper);
        ThrowUtils.throwIf(count > 0, ErrorCode.PARAMS_ERROR, "账号已存在");
        // 3. 构建用户实体
        User user = new User();
        BeanUtil.copyProperties(userAddRequest, user);
        if (StrUtil.isBlank(user.getUserRole())) {
            user.setUserRole(UserRoleEnum.USER.getValue());
        }
        if (StrUtil.isBlank(user.getUserAvatar())) {
            user.setUserAvatar(UserConstant.DEFAULT_USER_AVATAR);
        }
        // 4. 默认密码
        String encryptPassword = getEncryptPassword(UserConstant.DEFAULT_PASSWORD);
        user.setUserPassword(encryptPassword);
        // 5. 保存
        boolean result = this.save(user);
        ThrowUtils.throwIf(!result, ErrorCode.OPERATION_ERROR);
        return user.getId();
    }

    @Override
    public String getEncryptPassword(String userPassword) {
        return passwordEncoder.encode(userPassword);
    }

    @Override
    public LoginUserVO getLoginUserVO(User user) {
        if (user == null) {
            return null;
        }
        LoginUserVO loginUserVO = new LoginUserVO();
        BeanUtil.copyProperties(user, loginUserVO);
        return loginUserVO;
    }

    @Override
    public LoginUserVO userLogin(String userAccount, String userPassword, HttpServletRequest request) {
        // 1. 校验
        if (StrUtil.hasBlank(userAccount, userPassword)) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "参数为空");
        }
        if (userAccount.length() < 4) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "账号错误");
        }
        if (userPassword.length() < 8) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "密码错误");
        }
        // 2. 查询用户
        QueryWrapper queryWrapper = new QueryWrapper();
        queryWrapper.eq("userAccount", userAccount);
        User user = this.mapper.selectOneByQuery(queryWrapper);
        // 用户不存在或密码错误
        if (user == null || !passwordEncoder.matches(userPassword, user.getUserPassword())) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "用户不存在或密码错误");
        }
        // 3. 记录登录态（仅存 userId）
        request.getSession().setAttribute(USER_LOGIN_STATE, user.getId());
        // 4. 获得脱敏后的用户信息
        return this.getLoginUserVO(user);
    }

    @Override
    public User getLoginUser(HttpServletRequest request) {
        // 先判断是否已登录
        Object userIdObj = request.getSession().getAttribute(USER_LOGIN_STATE);
        if (userIdObj == null) {
            throw new BusinessException(ErrorCode.NOT_LOGIN_ERROR);
        }
        // 从数据库查询最新用户信息
        Long userId = ((Number) userIdObj).longValue();
        User currentUser = this.getById(userId);
        if (currentUser == null) {
            throw new BusinessException(ErrorCode.NOT_LOGIN_ERROR);
        }
        return currentUser;
    }

    @Override
    public User getLoginUserOrNull(HttpServletRequest request) {
        // 先判断是否已登录（未登录返回 null，不抛异常，供公开接口使用）
        Object userIdObj = request.getSession().getAttribute(USER_LOGIN_STATE);
        if (userIdObj == null) {
            return null;
        }
        // 从数据库查询最新用户信息
        Long userId = ((Number) userIdObj).longValue();
        return this.getById(userId);
    }

    @Override
    public boolean userLogout(HttpServletRequest request) {
        // 先判断是否已登录
        Object userIdObj = request.getSession().getAttribute(USER_LOGIN_STATE);
        if (userIdObj == null) {
            throw new BusinessException(ErrorCode.OPERATION_ERROR, "未登录");
        }
        // 移除登录态
        request.getSession().removeAttribute(USER_LOGIN_STATE);
        return true;
    }

    @Override
    public Page<UserVO> listUserVOByPage(UserQueryRequest userQueryRequest) {
        ThrowUtils.throwIf(userQueryRequest == null, ErrorCode.PARAMS_ERROR, "请求参数为空");
        long pageNum = userQueryRequest.getPageNum();
        long pageSize = userQueryRequest.getPageSize();
        Page<User> userPage = this.page(Page.of(pageNum, pageSize), getQueryWrapper(userQueryRequest));
        Page<UserVO> userVOPage = new Page<>(pageNum, pageSize, userPage.getTotalRow());
        userVOPage.setRecords(getUserVOList(userPage.getRecords()));
        return userVOPage;
    }

    private QueryWrapper getQueryWrapper(UserQueryRequest userQueryRequest) {
        if (userQueryRequest == null) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "请求参数为空");
        }
        Long id = userQueryRequest.getId();
        String userAccount = userQueryRequest.getUserAccount();
        String userName = userQueryRequest.getUserName();
        String userProfile = userQueryRequest.getUserProfile();
        String userRole = userQueryRequest.getUserRole();
        String sortField = userQueryRequest.getSortField();
        String sortOrder = userQueryRequest.getSortOrder();
        QueryWrapper queryWrapper = QueryWrapper.create()
                .eq("id", id, id != null)
                .eq("userRole", userRole, StrUtil.isNotBlank(userRole))
                .like("userAccount", userAccount, StrUtil.isNotBlank(userAccount))
                .like("userName", userName, StrUtil.isNotBlank(userName))
                .like("userProfile", userProfile, StrUtil.isNotBlank(userProfile));
        PageSortUtils.applySort(queryWrapper, sortField, sortOrder, ALLOWED_SORT_FIELDS);
        return queryWrapper;
    }


    @Override
    public UserVO getUserVO(User user) {
        if (user == null) {
            return null;
        }
        UserVO userVO = new UserVO();
        BeanUtil.copyProperties(user, userVO);
        return userVO;
    }

    @Override
    public List<UserVO> getUserVOList(List<User> userList) {
        if (CollUtil.isEmpty(userList)) {
            return new ArrayList<>();
        }
        return userList.stream().map(this::getUserVO).collect(Collectors.toList());
    }

    @Override
    public User getUserById(long id) {
        User user = this.getById(id);
        ThrowUtils.throwIf(user == null, ErrorCode.NOT_FOUND_ERROR);
        return user;
    }

    @Override
    public UserVO getUserVOById(long id) {
        return getUserVO(getUserById(id));
    }

    @Override
    public boolean deleteUser(long id) {
        return this.removeById(id);
    }

    @Override
    public boolean updateUser(UserUpdateRequest userUpdateRequest) {
        User user = new User();
        BeanUtil.copyProperties(userUpdateRequest, user);
        boolean result = this.updateById(user);
        ThrowUtils.throwIf(!result, ErrorCode.OPERATION_ERROR);
        return true;
    }

}
