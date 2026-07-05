package hk.ljx.fishaicode.ai.model;

import dev.langchain4j.model.output.structured.Description;
import lombok.Data;

@Data
public class MultiFileCodeResult {

    @Description("HTML code")
    private String htmlCode;

    @Description("CSS code")
    private String cssCode;

    @Description("JavaScript code")
    private String jsCode;

    @Description("Code description")
    private String description;
}
