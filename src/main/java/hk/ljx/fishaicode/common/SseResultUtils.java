package hk.ljx.fishaicode.common;

import cn.hutool.json.JSONUtil;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import org.springframework.http.codec.ServerSentEvent;
import reactor.core.publisher.Flux;

import java.util.Map;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;

/**
 * SSE 响应结果工具类
 */
public final class SseResultUtils {

    public static final String EVENT_BUSINESS_ERROR = "business-error";

    private SseResultUtils() {
    }

    /**
     * 构造单个 SSE 错误事件
     */
    public static ServerSentEvent<String> buildErrorEvent(int code, String message) {
        String data = JSONUtil.toJsonStr(Map.of(
                "error", true,
                "code", code,
                "message", message
        ));
        return ServerSentEvent.<String>builder(data)
                .event(EVENT_BUSINESS_ERROR)
                .build();
    }

    /**
     * 根据异常构造单个 SSE 错误事件
     */
    public static ServerSentEvent<String> buildErrorEvent(Throwable error) {
        Throwable actual = error;
        while (actual instanceof CompletionException || actual instanceof ExecutionException) {
            if (actual.getCause() != null) {
                actual = actual.getCause();
            } else {
                break;
            }
        }
        int code = ErrorCode.SYSTEM_ERROR.getCode();
        String errorMessage = "生成失败，请稍后重试";
        if (actual instanceof BusinessException businessException) {
            code = businessException.getCode();
            errorMessage = businessException.getMessage();
        }
        return buildErrorEvent(code, errorMessage);
    }

    /**
     * 构造包含单个错误事件的 Flux 流
     */
    public static Flux<ServerSentEvent<String>> buildErrorFlux(int code, String message) {
        return Flux.just(buildErrorEvent(code, message));
    }

    /**
     * 根据 BusinessException 构造包含单个错误事件的 Flux 流
     */
    public static Flux<ServerSentEvent<String>> buildErrorFlux(BusinessException e) {
        return Flux.just(buildErrorEvent(e.getCode(), e.getMessage()));
    }
}
