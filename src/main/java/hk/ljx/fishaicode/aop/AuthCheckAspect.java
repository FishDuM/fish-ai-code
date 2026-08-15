package hk.ljx.fishaicode.aop;

import cn.hutool.json.JSONUtil;
import hk.ljx.fishaicode.annotation.AuthCheck;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.model.entity.User;
import hk.ljx.fishaicode.model.enums.UserRoleEnum;
import hk.ljx.fishaicode.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.core.annotation.Order;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import reactor.core.publisher.Flux;

import java.util.Map;

@Aspect
@Component
@Order(1)
@RequiredArgsConstructor
public class AuthCheckAspect {

    private final UserService userService;

    /**
     * 执行拦截
     *
     * @param joinPoint 切入点
     * @param authCheck 权限校验注解
     */
    @Around("@annotation(authCheck)")
    public Object doInterceptor(ProceedingJoinPoint joinPoint, AuthCheck authCheck) throws Throwable {
        String mustRole = authCheck.mustRole();
        RequestAttributes requestAttributes = RequestContextHolder.currentRequestAttributes();
        HttpServletRequest request = ((ServletRequestAttributes) requestAttributes).getRequest();
        // 当前登录用户
        User loginUser;
        try {
            loginUser = userService.getLoginUser(request);
        } catch (BusinessException e) {
            // SSE 接口认证失败时返回错误事件流，避免退化成 JSON 响应
            if (isSseFluxMethod(joinPoint)) {
                return buildErrorSseFlux(e);
            }
            throw e;
        }
        UserRoleEnum mustRoleEnum = UserRoleEnum.getEnumByValue(mustRole);
        // 不需要权限，放行
        if (mustRoleEnum == null) {
            return joinPoint.proceed();
        }
        // 以下为：必须有该权限才通过
        // 获取当前用户具有的权限
        UserRoleEnum userRoleEnum = UserRoleEnum.getEnumByValue(loginUser.getUserRole());
        // 没有权限，拒绝
        if (userRoleEnum == null) {
            throw new BusinessException(ErrorCode.NO_AUTH_ERROR);
        }
        // 要求必须有管理员权限，但用户没有管理员权限，拒绝
        if (UserRoleEnum.ADMIN.equals(mustRoleEnum) && !UserRoleEnum.ADMIN.equals(userRoleEnum)) {
            throw new BusinessException(ErrorCode.NO_AUTH_ERROR);
        }
        // 通过权限校验，放行
        return joinPoint.proceed();
    }

    /**
     * 目标方法是否为响应式流（SSE 接口统一返回 Flux<ServerSentEvent>）
     */
    private boolean isSseFluxMethod(ProceedingJoinPoint joinPoint) {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        return Flux.class.isAssignableFrom(signature.getReturnType());
    }

    /**
     * 构造 SSE 错误事件流，与 AppController 的 business-error 事件格式保持一致
     */
    private Object buildErrorSseFlux(BusinessException e) {
        String data = JSONUtil.toJsonStr(Map.of(
                "error", true,
                "code", e.getCode(),
                "message", e.getMessage()
        ));
        ServerSentEvent<String> event = ServerSentEvent.<String>builder(data)
                .event("business-error")
                .build();
        return Flux.just(event);
    }
}
