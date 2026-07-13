package hk.ljx.fishaicode.ai;

import dev.langchain4j.service.SystemMessage;

/**
 * AI内容安全审查服务
 * 判断用户输入是否包含违反法律或政治敏感的内容
 */
public interface SensitiveCheck {

    /**
     * 审查用户输入
     *
     * @param userInput 用户输入内容
     * @return "PASS" 表示合规，否则返回违规原因
     */
    @SystemMessage(fromResource = "prompt/sensitive-check-system-prompt.txt")
    String verify(String userInput);
}
