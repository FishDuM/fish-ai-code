package hk.ljx.fishaicode.service;

import hk.ljx.fishaicode.model.vo.CaptchaVO;

/**
 * 验证码 服务层。
 *
 * @author fish
 */
public interface CaptchaService {

    /**
     * 生成验证码并存入 Redis
     *
     * @return 验证码视图（captchaId + base64 图片）
     */
    CaptchaVO generateCaptcha();

    /**
     * 校验验证码（5 分钟过期，过期前同一验证码可重复使用，不因一次校验而失效）
     *
     * @param captchaId   验证码 id
     * @param captchaCode 用户输入的验证码
     */
    void verifyCaptcha(String captchaId, String captchaCode);
}
