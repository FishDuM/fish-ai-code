package hk.ljx.fishaicode.modal.dto.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;

@Data
public class UserAddRequest implements Serializable {

    /**
     * 用户昵称
     */
    @Size(max = 50, message = "用户昵称最长 50 个字符")
    private String userName;

    /**
     * 账号
     */
    @NotBlank(message = "账号不能为空")
    @Size(min = 4, max = 15, message = "账号长度需在 4-15 个字符之间")
    private String userAccount;

    /**
     * 用户头像
     */
    @Size(max = 500, message = "头像 URL 最长 500 个字符")
    private String userAvatar;

    /**
     * 用户简介
     */
    @Size(max = 200, message = "用户简介最长 200 个字符")
    private String userProfile;

    /**
     * 用户角色: user, admin
     */
    private String userRole;

    private static final long serialVersionUID = 1L;
}
