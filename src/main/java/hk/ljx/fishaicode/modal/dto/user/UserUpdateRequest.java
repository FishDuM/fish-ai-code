package hk.ljx.fishaicode.modal.dto.user;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;

@Data
public class UserUpdateRequest implements Serializable {

    /**
     * id
     */
    @NotNull(message = "id 不能为空")
    @Min(value = 1, message = "id 不合法")
    private Long id;

    /**
     * 用户昵称
     */
    @Size(max = 50, message = "用户昵称最长 50 个字符")
    private String userName;

    /**
     * 用户头像
     */
    @Size(max = 500, message = "头像 URL 最长 500 个字符")
    private String userAvatar;

    /**
     * 简介
     */
    @Size(max = 200, message = "用户简介最长 200 个字符")
    private String userProfile;

    /**
     * 用户角色：user/admin
     */
    private String userRole;

    private static final long serialVersionUID = 1L;
}
