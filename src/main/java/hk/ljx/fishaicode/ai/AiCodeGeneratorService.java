package hk.ljx.fishaicode.ai;

import dev.langchain4j.service.SystemMessage;
import hk.ljx.fishaicode.ai.modal.HtmlCodeResult;
import hk.ljx.fishaicode.ai.modal.MultiFileCodeResult;
import reactor.core.publisher.Flux;

public interface AiCodeGeneratorService {

    /**
     * 生成 HTML 代码
     * @param userMessage 用户输入
     * @return ai 输出
     */
    @SystemMessage(fromResource = "prompt/codegen-html-system-prompt.txt")
    HtmlCodeResult generateHtmlCode(String userMessage);

    /**
     * 生成多文件代码
     * @param userMessage 用户输入
     * @return ai 输出
     */
    @SystemMessage(fromResource = "prompt/codegen-multi-file-system-prompt.txt")
    MultiFileCodeResult generateMultiFileCode(String userMessage);

    /**
     * 生成 HTML 代码
     * @param userMessage 用户输入
     * @return ai 输出
     */
    @SystemMessage(fromResource = "prompt/codegen-html-system-prompt.txt")
    Flux<String> generateHtmlCodeStream(String userMessage);

    /**
     * 生成多文件代码
     * @param userMessage 用户输入
     * @return ai 输出
     */
    @SystemMessage(fromResource = "prompt/codegen-multi-file-system-prompt.txt")
    Flux<String> generateMultiFileCodeStream(String userMessage);

}
