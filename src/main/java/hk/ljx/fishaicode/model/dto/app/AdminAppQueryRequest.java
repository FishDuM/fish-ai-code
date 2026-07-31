package hk.ljx.fishaicode.model.dto.app;

import hk.ljx.fishaicode.common.PageRequest;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.io.Serializable;

/**
 * 管理员分页查询应用请求（支持根据除时间外的任何字段查询）
 */
@EqualsAndHashCode(callSuper = true)
@Data
public class AdminAppQueryRequest extends PageRequest implements Serializable {

    /**
     * id
     */
    @Min(value = 1, message = "id 不合法")
    private Long id;

    /**
     * 应用名称
     */
    @Size(max = 50, message = "应用名称最长 50 个字符")
    private String appName;

    /**
     * 应用封面
     */
    @Size(max = 500, message = "封面 URL 最长 500 个字符")
    private String cover;

    /**
     * 应用初始化的 prompt
     */
    @Size(max = 10000, message = "初始化 prompt 最长 10000 个字符")
    private String initPrompt;

    /**
     * 代码生成类型
     */
    @Size(max = 20, message = "代码生成类型最长 20 个字符")
    private String codeGenType;

    /**
     * 部署标识
     */
    @Size(max = 50, message = "部署标识最长 50 个字符")
    private String deployKey;

    /**
     * 优先级
     */
    @Min(value = 0, message = "优先级不能为负数")
    private Integer priority;

    /**
     * 创建用户id
     */
    @Min(value = 1, message = "用户 id 不合法")
    private Long userId;

    private static final long serialVersionUID = 1L;
}
