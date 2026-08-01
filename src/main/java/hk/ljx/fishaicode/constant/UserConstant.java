package hk.ljx.fishaicode.constant;

public interface UserConstant {

    /**
     * 用户登录态键
     */
    String USER_LOGIN_STATE = "user_login";

    /**
     * 登录/注册验证码的 Redis key 前缀
     */
    String CAPTCHA_KEY_PREFIX = "captcha:";

    /**
     * 验证码有效期（秒），5 分钟
     */
    long CAPTCHA_EXPIRE_SECONDS = 5 * 60L;

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
