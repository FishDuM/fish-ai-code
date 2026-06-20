package hk.ljx.fishaicode.modal.dto.app;

import hk.ljx.fishaicode.common.PageRequest;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.io.Serializable;

/**
 * 用户分页查询应用请求（自己的或精选的）
 */
@EqualsAndHashCode(callSuper = true)
@Data
public class AppQueryRequest extends PageRequest implements Serializable {

    /**
     * 应用名称
     */
    private String appName;

    private static final long serialVersionUID = 1L;
}
