package hk.ljx.fishaicode.exception;

import hk.ljx.fishaicode.common.BaseResponse;
import org.junit.jupiter.api.Test;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GlobalExceptionHandlerTest {

    @Test
    void methodArgumentTypeMismatchReturnsParamsError() {
        MethodArgumentTypeMismatchException exception = new MethodArgumentTypeMismatchException(
                "9223372036854775808", Long.class, "appId", null,
                new NumberFormatException("For input string: 9223372036854775808"));

        BaseResponse<?> response = new GlobalExceptionHandler()
                .methodArgumentTypeMismatchExceptionHandler(exception);

        assertEquals(ErrorCode.PARAMS_ERROR.getCode(), response.getCode());
        assertEquals("请求参数格式错误", response.getMessage());
    }
}
