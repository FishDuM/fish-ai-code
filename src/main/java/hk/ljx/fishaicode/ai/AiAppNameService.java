package hk.ljx.fishaicode.ai;

import dev.langchain4j.service.SystemMessage;

/**
 * AI 应用命名服务
 * 根据用户需求描述智能提炼应用名称（不超过 10 个字符）
 */
public interface AiAppNameService {

    /**
     * 根据用户需求生成应用名
     *
     * @param userPrompt 用户的需求描述
     * @return 应用名称（不超过 10 个字符）
     */
    @SystemMessage(fromResource = "prompt/app-name-system-prompt.txt")
    String generateAppName(String userPrompt);
}
