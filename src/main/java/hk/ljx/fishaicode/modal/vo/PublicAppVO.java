package hk.ljx.fishaicode.modal.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 公开展示的应用视图对象。
 * 不包含初始化提示词、创建者和部署等内部信息。
 */
@Data
public class PublicAppVO implements Serializable {

    private Long id;

    private String appName;

    private String cover;

    private String codeGenType;

    private Integer priority;

    private LocalDateTime createTime;

    private static final long serialVersionUID = 1L;
}
