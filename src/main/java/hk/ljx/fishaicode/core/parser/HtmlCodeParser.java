package hk.ljx.fishaicode.core.parser;

import hk.ljx.fishaicode.ai.model.HtmlCodeResult;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * HTML 单文件代码解析器
 *
 */
public class HtmlCodeParser implements CodeParser<HtmlCodeResult> {

    private static final Pattern HTML_CODE_PATTERN = Pattern.compile("```html\\s*([\\s\\S]*?)```", Pattern.CASE_INSENSITIVE);

    @Override
    public HtmlCodeResult parseCode(String codeContent) {
        String normalized = normalizeLineBreaks(codeContent);
        HtmlCodeResult result = new HtmlCodeResult();
        // 提取 HTML 代码
        String htmlCode = extractHtmlCode(normalized);
        if (htmlCode != null && !htmlCode.trim().isEmpty()) {
            result.setHtmlCode(htmlCode.trim());
        } else {
            result.setHtmlCode(extractRawHtml(normalized));
        }
        return result;
    }

    /** 统一换行符为 LF：\r\n 与 \r 都归一为 \n，保证跨平台解析结果一致 */
    private String normalizeLineBreaks(String content) {
        if (content == null) {
            return "";
        }
        return content.replace("\r\n", "\n").replace('\r', '\n');
    }

    /**
     * 提取HTML代码内容
     *
     * @param content 原始内容
     * @return HTML代码
     */
    private String extractHtmlCode(String content) {
        Matcher matcher = HTML_CODE_PATTERN.matcher(content);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return null;
    }

    private String extractRawHtml(String content) {
        String trimmed = content == null ? "" : content.trim();
        int start = indexOfHtmlStart(trimmed);
        if (start < 0) {
            return trimmed;
        }
        String html = trimmed.substring(start);
        Matcher endMatcher = Pattern.compile("</html\\s*>", Pattern.CASE_INSENSITIVE).matcher(html);
        return endMatcher.find() ? html.substring(0, endMatcher.end()).trim() : html.trim();
    }

    private int indexOfHtmlStart(String content) {
        Matcher matcher = Pattern.compile("<!doctype\\s+html\\b|<html\\b", Pattern.CASE_INSENSITIVE).matcher(content);
        return matcher.find() ? matcher.start() : -1;
    }
}
