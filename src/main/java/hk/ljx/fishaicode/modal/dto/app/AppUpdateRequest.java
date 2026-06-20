package hk.ljx.fishaicode.modal.dto.app;

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
    private Long id;

    /**
     * 应用名称
     */
    private String appName;

    private static final long serialVersionUID = 1L;
}
