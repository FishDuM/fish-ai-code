package hk.ljx.fishaicode.modal.dto.app;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.io.Serializable;

@Data
public class AppDeployRequest implements Serializable {

    /**
     * 应用 id
     */
    @NotNull(message = "应用 ID 不能为空")
    @Min(value = 1, message = "应用 ID 不合法")
    private Long appId;

    private static final long serialVersionUID = 1L;
}
