package hk.ljx.fishaicode.modal.dto.app;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;

/**
 * 用户创建应用请求
 */
@Data
public class AppAddRequest implements Serializable {

    /**
     * 应用初始化的 prompt
     */
    @NotBlank(message = "初始化 prompt 不能为空")
    @Size(max = 2000, message = "初始化 prompt 最长 2000 个字符")
    private String initPrompt;
}
