package hk.ljx.fishaicode.constant;

public interface UserConstant {

    /**
     * 用户登录态键
     */
    String USER_LOGIN_STATE = "user_login";

    //  region 权限

    /**
     * 默认角色
     */
    String DEFAULT_ROLE = "user";

    /**
     * 管理员角色
     */
    String ADMIN_ROLE = "admin";

    /**
     * 默认用户头像
     */
    String DEFAULT_USER_AVATAR = "https://api.elaina.cat/random/";

    /**
     * 默认密码（管理员新增用户时的初始密码）
     */
    String DEFAULT_PASSWORD = "12345678";

    /**
     * 默认用户昵称
     */
    String DEFAULT_USER_NAME = "无名";

    // endregion
}
