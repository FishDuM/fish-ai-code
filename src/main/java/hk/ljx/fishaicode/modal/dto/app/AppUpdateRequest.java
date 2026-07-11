package hk.ljx.fishaicode.modal.dto.app;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;

/**
 * 用户更新应用请求（仅支持修改应用名称）
 */
@Data
public class AppUpdateRequest implements Serializable {

    /**
     * id
     */
    @NotNull(message = "id 不能为空")
    @Min(value = 1, message = "id 不合法")
    private Long id;

    /**
     * 应用名称
     */
    @NotBlank(message = "应用名称不能为空")
    @Size(max = 20, message = "应用名称最长 20 个字符")
    private String appName;

    private static final long serialVersionUID = 1L;
}
