package hk.ljx.fishaicode.model.dto.app;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;

/** 代码生成请求。 */
@Data
public class AppChatRequest implements Serializable {

    @NotNull(message = "应用 ID 不能为空")
    @Min(value = 1, message = "应用 ID 不合法")
    private Long appId;

    @NotBlank(message = "消息内容不能为空")
    @Size(max = 20_000, message = "消息内容过长（最多 20000 字）")
    private String message;

    private static final long serialVersionUID = 1L;
}
