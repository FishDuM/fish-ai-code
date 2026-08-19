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
        if (codeContent == null) {
            return result;
        }
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
                // 跨平台统一使用 LF：代码内容来自 AI/数据库/前端展示，不应随运行环境换行
                contentBuilder.append("\n\n");
            }
            contentBuilder.append(normalizeLineBreaks(block).trim());
        }
        return contentBuilder.isEmpty() ? null : contentBuilder.toString();
    }

    /**
     * 统一换行符为 LF：\r\n 与 \r 都归一为 \n，
     * 保证 Windows/Linux/macOS 解析结果一致。
     */
    private String normalizeLineBreaks(String content) {
        return content.replace("\r\n", "\n").replace('\r', '\n');
    }

    private String trimToEmpty(String content) {
        return content == null ? "" : content.trim();
    }
}
