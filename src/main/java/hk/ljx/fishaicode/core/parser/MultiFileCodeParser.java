package hk.ljx.fishaicode.core.parser;

import hk.ljx.fishaicode.ai.model.MultiFileCodeResult;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 多文件代码解析器（HTML + CSS + JS）
 *
 */
public class MultiFileCodeParser implements CodeParser<MultiFileCodeResult> {

    private static final Pattern HTML_CODE_PATTERN = Pattern.compile("```html\\s*([\\s\\S]*?)```", Pattern.CASE_INSENSITIVE);
    private static final Pattern CSS_CODE_PATTERN = Pattern.compile("```css\\s*([\\s\\S]*?)```", Pattern.CASE_INSENSITIVE);
    private static final Pattern JS_CODE_PATTERN = Pattern.compile("```(?:js|javascript)\\s*([\\s\\S]*?)```", Pattern.CASE_INSENSITIVE);

    @Override
    public MultiFileCodeResult parseCode(String codeContent) {
        MultiFileCodeResult result = new MultiFileCodeResult();
        // 提取各类代码
        String htmlCode = extractCodeByPattern(codeContent, HTML_CODE_PATTERN);
        String cssCode = extractCodeByPattern(codeContent, CSS_CODE_PATTERN);
        String jsCode = extractCodeByPattern(codeContent, JS_CODE_PATTERN);
        // 设置HTML代码
        result.setHtmlCode(trimToEmpty(htmlCode));
        // 设置CSS代码
        result.setCssCode(trimToEmpty(cssCode));
        // 设置JS代码
        result.setJsCode(trimToEmpty(jsCode));
        return result;
    }

    /**
     * 根据正则模式提取代码
     *
     * @param content 原始内容
     * @param pattern 正则模式
     * @return 提取的代码
     */
    private String extractCodeByPattern(String content, Pattern pattern) {
        Matcher matcher = pattern.matcher(content);
        StringBuilder contentBuilder = new StringBuilder();
        while (matcher.find()) {
            String block = matcher.group(1);
            if (block == null || block.trim().isEmpty()) {
                continue;
            }
            if (!contentBuilder.isEmpty()) {
                contentBuilder.append(System.lineSeparator()).append(System.lineSeparator());
            }
            contentBuilder.append(block.trim());
        }
        return contentBuilder.isEmpty() ? null : contentBuilder.toString();
    }

    private String trimToEmpty(String content) {
        return content == null ? "" : content.trim();
    }
}
