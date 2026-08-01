package hk.ljx.fishaicode.model.vo;

import lombok.Data;

import java.io.Serializable;

/**
 * 验证码视图对象。
 *
 * @author fish
 */
@Data
public class CaptchaVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 验证码 id（提交登录/注册时携带，用于在 Redis 中定位验证码）
     */
    private String captchaId;

    /**
     * 验证码图片（data URI，可直接用于 img src）
     */
    private String imgBase64;
}
