package hk.ljx.fishaicode.model.dto.user;

import hk.ljx.fishaicode.common.PageRequest;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.io.Serializable;

@EqualsAndHashCode(callSuper = true)
@Data
public class UserQueryRequest extends PageRequest implements Serializable {

    /**
     * id
     */
    @Min(value = 1, message = "id 不合法")
    private Long id;

    /**
     * 用户昵称
     */
    @Size(max = 50, message = "用户昵称最长 50 个字符")
    private String userName;

    /**
     * 账号
     */
    @Size(min = 4, max = 15, message = "账号长度需在 4-15 个字符之间")
    private String userAccount;

    /**
     * 简介
     */
    @Size(max = 200, message = "用户简介最长 200 个字符")
    private String userProfile;

    /**
     * 用户角色：user/admin/ban
     */
    @Size(max = 10, message = "用户角色最长 10 个字符")
    private String userRole;

    private static final long serialVersionUID = 1L;
}
