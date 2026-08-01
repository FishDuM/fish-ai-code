package hk.ljx.fishaicode.service.impl;

import cn.hutool.captcha.CaptchaUtil;
import cn.hutool.captcha.LineCaptcha;
import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.StrUtil;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.model.vo.CaptchaVO;
import hk.ljx.fishaicode.service.CaptchaService;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

import static hk.ljx.fishaicode.constant.UserConstant.CAPTCHA_EXPIRE_SECONDS;
import static hk.ljx.fishaicode.constant.UserConstant.CAPTCHA_KEY_PREFIX;

/**
 * 验证码 服务层实现：基于 Redis 存储，5 分钟过期；过期前可重复使用。
 *
 * @author fish
 */
@Service
public class CaptchaServiceImpl implements CaptchaService {

    private final StringRedisTemplate stringRedisTemplate;

    public CaptchaServiceImpl(StringRedisTemplate stringRedisTemplate) {
        this.stringRedisTemplate = stringRedisTemplate;
    }

    @Override
    public CaptchaVO generateCaptcha() {
        // hutool 线条干扰验证码：宽 120、高 40、4 位验证码、60 条干扰线
        LineCaptcha captcha = CaptchaUtil.createLineCaptcha(120, 40, 4, 60);
        String captchaId = IdUtil.fastSimpleUUID();
        // 验证码答案存入 Redis，5 分钟过期
        stringRedisTemplate.opsForValue()
                .set(CAPTCHA_KEY_PREFIX + captchaId, captcha.getCode(), CAPTCHA_EXPIRE_SECONDS, TimeUnit.SECONDS);
        CaptchaVO captchaVO = new CaptchaVO();
        captchaVO.setCaptchaId(captchaId);
        captchaVO.setImgBase64(captcha.getImageBase64Data());
        return captchaVO;
    }

    @Override
    public void verifyCaptcha(String captchaId, String captchaCode) {
        if (StrUtil.isBlank(captchaId) || StrUtil.isBlank(captchaCode)) {
            throw new BusinessException(ErrorCode.CAPTCHA_ERROR, "验证码错误或已过期");
        }
        // 只读取不删除：验证码 5 分钟内（TTL 到期前）可重复使用，不因一次校验成败而失效
        String realCode = stringRedisTemplate.opsForValue().get(CAPTCHA_KEY_PREFIX + captchaId);
        if (realCode == null) {
            throw new BusinessException(ErrorCode.CAPTCHA_ERROR, "验证码错误或已过期");
        }
        // 忽略大小写比对
        if (!StrUtil.equalsIgnoreCase(realCode, StrUtil.trim(captchaCode))) {
            throw new BusinessException(ErrorCode.CAPTCHA_ERROR);
        }
    }
}
