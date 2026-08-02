package hk.ljx.fishaicode.model.vo;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class PreviewSessionVO {

    private String previewUrl;

    private long expiresIn;
}
