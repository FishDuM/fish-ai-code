package hk.ljx.fishaicode.core;

import hk.ljx.fishaicode.ai.model.HtmlCodeResult;
import hk.ljx.fishaicode.ai.model.MultiFileCodeResult;
import hk.ljx.fishaicode.core.parser.HtmlCodeParser;
import hk.ljx.fishaicode.core.parser.MultiFileCodeParser;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CodeParserTest {

    private final HtmlCodeParser htmlCodeParser = new HtmlCodeParser();
    private final MultiFileCodeParser multiFileCodeParser = new MultiFileCodeParser();

    @Test
    void parseHtmlCode() {
        String codeContent = """
                随便写一段描述：
                html 格式
                <!DOCTYPE html>
                <html>
                <head>
                    <title>测试页面</title>
                </head>
                <body>
                    <h1>Hello World!</h1>
                </body>
                </html>

                随便写一段描述
                """;
        HtmlCodeResult result = htmlCodeParser.parseCode(codeContent);
        assertNotNull(result);
        assertNotNull(result.getHtmlCode());
    }

    @Test
    void parseMultiFileCode() {
        String codeContent = """
                创建一个完整的网页：
                html 格式
                ```html
                <!DOCTYPE html>
                <html>
                <head>
                    <title>多文件示例</title>
                    <link rel="stylesheet" href="style.css">
                </head>
                <body>
                    <h1>欢迎使用</h1>
                    <script src="script.js"></script>
                </body>
                </html>
                ```
                css 格式
                ```css
                h1 {
                    color: blue;
                    text-align: center;
                }
                ```
                ```js
                console.log('页面加载完成');
                ```
                文件创建完成！
                """;
        MultiFileCodeResult result = multiFileCodeParser.parseCode(codeContent);
        assertNotNull(result);
        assertNotNull(result.getHtmlCode());
        assertNotNull(result.getCssCode());
        assertNotNull(result.getJsCode());
    }

    @Test
    void parseCodeFenceWithoutLineBreakAndMergeRepeatedBlocks() {
        String codeContent = """
                ```html<!doctype html><html><body>页面</body></html>```
                ```cssbody { color: red; }```
                ```cssh1 { font-size: 20px; }```
                ```jsconsole.log('第一段');```
                ```javascriptconsole.log('第二段');```
                """;

        MultiFileCodeResult result = multiFileCodeParser.parseCode(codeContent);

        assertEquals("<!doctype html><html><body>页面</body></html>", result.getHtmlCode());
        assertEquals("body { color: red; }\n\nh1 { font-size: 20px; }", result.getCssCode());
        assertEquals("console.log('第一段');\n\nconsole.log('第二段');", result.getJsCode());
    }

    @Test
    void parseMultiFileCodeWithWindowsLineBreaks() {
        // Windows（\r\n）输入：解析结果必须统一为 LF，与 Linux/macOS 一致
        String codeContent = "```html\r\n<!doctype html><html><body>页面</body></html>\r\n```\r\n"
                + "```css\r\nbody { color: red; }\r\n```\r\n"
                + "```css\r\nh1 { font-size: 20px; }\r\n```\r\n"
                + "```js\r\nconsole.log('第一段');\r\n```\r\n"
                + "```javascript\r\nconsole.log('第二段');\r\n```";

        MultiFileCodeResult result = multiFileCodeParser.parseCode(codeContent);

        assertEquals("<!doctype html><html><body>页面</body></html>", result.getHtmlCode());
        assertEquals("body { color: red; }\n\nh1 { font-size: 20px; }", result.getCssCode());
        assertEquals("console.log('第一段');\n\nconsole.log('第二段');", result.getJsCode());
    }

    @Test
    void parseMultiFileCodeWithMixedLineBreaks() {
        // 混合换行（\r\n 与 \n 混用）：统一归一为 LF
        String codeContent = "```html\n<!doctype html><html><body>页面</body></html>\n```\n"
                + "```css\r\nbody { color: red; }\r\n```\n"
                + "```css\nh1 { font-size: 20px; }\n```\n"
                + "```js\r\nconsole.log('第一段');\r\n```\r\n"
                + "```javascript\nconsole.log('第二段');\n```";

        MultiFileCodeResult result = multiFileCodeParser.parseCode(codeContent);

        assertEquals("body { color: red; }\n\nh1 { font-size: 20px; }", result.getCssCode());
        assertEquals("console.log('第一段');\n\nconsole.log('第二段');", result.getJsCode());
    }

    @Test
    void discardProseAroundRawHtmlDocument() {
        HtmlCodeResult result = htmlCodeParser.parseCode("说明\n<!doctype html><html><body>页面</body></html>\n结束说明");

        assertEquals("<!doctype html><html><body>页面</body></html>", result.getHtmlCode());
    }
}
