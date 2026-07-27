package hk.ljx.fishaicode.langgraph4j.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;
import hk.ljx.fishaicode.langgraph4j.model.QualityResult;

/**
 * 代码质量检查服务
 */
public interface CodeQualityCheckService {

    /**
     * 检查代码质量
     * AI 会分析代码并返回质量检查结果
     */
    @SystemMessage(fromResource = "prompt/code-quality-check-system-prompt.txt")
    @UserMessage("待检查代码如下：\n{{codeContent}}")
    QualityResult checkCodeQuality(@V("codeContent") String codeContent);
}
