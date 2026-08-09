import { describe, it, expect } from 'vitest';
import { normalizeMarkdownForStreaming, normalizeCodeFenceBoundaries } from './markdownNormalize';

describe('normalizeCodeFenceBoundaries', () => {
  it('HTML 结束围栏与 CSS 开始围栏拼接（</html>```css）拆成独立围栏', () => {
    const input = '```html\n<div>ok</div>\n</html>```css\n/* style.css */\nbody { color: red; }';
    const output = normalizeCodeFenceBoundaries(input);
    expect(output).toContain('</html>\n```');
    expect(output).toContain('```css\n');
    // 不再出现拼接形态
    expect(output).not.toContain('</html>```css');
  });

  it('4 反引号拼接（</html>````css）同样拆开', () => {
    const input = '```html\n<div>ok</div>\n</html>````css\n/* style.css */';
    const output = normalizeCodeFenceBoundaries(input);
    expect(output).not.toContain('</html>````css');
    expect(output).toContain('</html>\n````');
    expect(output).toContain('````css');
  });

  it('开始围栏与内容同行（```css /* style.css */）拆出语言名', () => {
    const input = '```css /* style.css */\nbody { color: red; }';
    const output = normalizeCodeFenceBoundaries(input);
    expect(output).toContain('```css\n');
    expect(output).toContain('/* style.css */');
  });

  it('代码内容中的反引号不被误拆（模板字符串）', () => {
    const input = '```js\nconst s = `hello`;\nconsole.log(s);\n```';
    const output = normalizeCodeFenceBoundaries(input);
    expect(output).toContain('const s = `hello`;');
  });

  it('普通文本后的开围栏拆行（好的，我来```html）', () => {
    const input = '好的，我来```html\n<div>hi</div>\n```';
    const output = normalizeCodeFenceBoundaries(input);
    expect(output).toContain('好的，我来\n```html');
  });

  it('闭合围栏后跟内容（```###说明）拆行', () => {
    const input = '```html\n<div>hi</div>\n```###说明';
    const output = normalizeCodeFenceBoundaries(input);
    expect(output).toContain('```\n###说明');
  });
});

describe('normalizeMarkdownForStreaming', () => {
  it('标准多代码块（html+css+js）围栏配对正确，不补多余围栏', () => {
    const input = '```html\n<div>a</div>\n```\n\n```css\nbody{}\n```\n\n```js\nconsole.log(1)\n```';
    const output = normalizeMarkdownForStreaming(input);
    // 围栏数量保持 6（成对）
    expect((output.match(/```/g) ?? []).length).toBe(6);
  });

  it('流式未闭合代码块补结束围栏', () => {
    const input = '```html\n<div>a</div>';
    const output = normalizeMarkdownForStreaming(input);
    expect(output.endsWith('```')).toBe(true);
  });

  it('完整闭合的代码块不补围栏', () => {
    const input = '```html\n<div>a</div>\n```';
    const output = normalizeMarkdownForStreaming(input);
    expect(output.endsWith('```')).toBe(true);
    expect((output.match(/```/g) ?? []).length).toBe(2);
  });

  it('HTML 结束围栏与 CSS 开始围栏拼接时，最终围栏成对', () => {
    const input = '```html\n<div>ok</div>\n</html>```css\n/* style.css */\nbody{}\n```';
    const output = normalizeMarkdownForStreaming(input);
    expect((output.match(/```/g) ?? []).length % 2).toBe(0);
    expect(output).toContain('```css\n');
  });

  it('孤立残缺围栏（单个 ``` 在普通文本中）不导致误补', () => {
    const input = '```html\n<div>ok</div>\n```\n\n说明：使用反引号 `包裹';
    const output = normalizeMarkdownForStreaming(input);
    expect(output).toContain('使用反引号 `包裹');
  });
});
