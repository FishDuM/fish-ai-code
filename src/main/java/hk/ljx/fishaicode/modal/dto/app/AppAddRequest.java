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

//    /**
//     * 应用名称
//     */
//    @NotBlank(message = "应用名称不能为空")
//    @Size(max = 20, message = "应用名称最长 20 个字符")
//    private String appName;

//    /**
//     * 应用封面
//     */
//    @Size(max = 500, message = "封面 URL 最长 500 个字符")
//    private String cover;

    /**
     * 应用初始化的 prompt
     */
    @NotBlank(message = "初始化 prompt 不能为空")
    @Size(max = 2000, message = "初始化 prompt 最长 2000 个字符")
    private String initPrompt;

//    /**
//     * 代码生成类型（枚举）
//     */
//    @NotBlank(message = "代码生成类型不能为空")
//    private String codeGenType;
//
//    private static final long serialVersionUID = 1L;
}
