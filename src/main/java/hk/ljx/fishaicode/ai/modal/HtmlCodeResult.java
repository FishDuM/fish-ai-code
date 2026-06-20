package hk.ljx.fishaicode.ai.modal;

import dev.langchain4j.model.output.structured.Description;
import lombok.Data;

@Data
public class HtmlCodeResult {

    @Description("html code")
    private String htmlCode;

    @Description("code description")
    private String description;
}
