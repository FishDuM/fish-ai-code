package hk.ljx.fishaicode.common;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.io.Serializable;

@Data
public class DeleteRequest implements Serializable {

    /**
     * id
     */
    @NotNull(message = "id 不能为空")
    @Min(value = 1, message = "id 不合法")
    private Long id;

    private static final long serialVersionUID = 1L;
}
