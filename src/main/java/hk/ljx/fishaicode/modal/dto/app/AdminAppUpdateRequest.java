package hk.ljx.fishaicode.modal.dto.app;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;

/**
 * 管理员更新应用请求（支持更新名称、封面、优先级）
 */
@Data
public class AdminAppUpdateRequest implements Serializable {

    /**
     * id
     */
    @NotNull(message = "id 不能为空")
    @Min(value = 1, message = "id 不合法")
    private Long id;

    /**
     * 应用名称
     */
    @Size(max = 20, message = "应用名称最长 20 个字符")
    private String appName;

    /**
     * 应用封面
     */
    @Size(max = 500, message = "封面 URL 最长 500 个字符")
    private String cover;

    /**
     * 优先级
     */
    private Integer priority;

    private static final long serialVersionUID = 1L;
}
