package hk.ljx.fishaicode.controller;

import hk.ljx.fishaicode.common.BaseResponse;
import hk.ljx.fishaicode.common.ResultUtils;
import hk.ljx.fishaicode.model.vo.CaptchaVO;
import hk.ljx.fishaicode.service.CaptchaService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 验证码 控制层。
 *
 * @author fish
 */
@RestController
@RequestMapping("/captcha")
@RequiredArgsConstructor
public class CaptchaController {

    private final CaptchaService captchaService;

    /**
     * 生成验证码（答案存入 Redis，登录/注册时携带 captchaId + captchaCode 校验；
     * 点击刷新即重新生成）
     *
     * @return 验证码视图（captchaId + base64 图片）
     */
    @GetMapping
    public BaseResponse<CaptchaVO> getCaptcha() {
        return ResultUtils.success(captchaService.generateCaptcha());
    }
}
