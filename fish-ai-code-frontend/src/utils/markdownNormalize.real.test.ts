import { describe, it, expect } from 'vitest';
import { normalizeMarkdownForStreaming } from './markdownNormalize';

// 用户报告的真实场景：多文件输出时 HTML/CSS/JS 连续代码块 + 围栏拼接
describe('多代码块真实场景', () => {
  it('标准多文件输出（html + css + js 三块）围栏全部成对', () => {
    const input = [
      '```html',
      '<!DOCTYPE html>',
      '<html lang="zh-CN">',
      '<body>hi</body>',
      '</html>',
      '```',
      '```css',
      '/* style.css */',
      'body { color: red; }',
      '```',
      '```js',
      '// script.js',
      'console.log("hi");',
      '```',
    ].join('\n');
    const output = normalizeMarkdownForStreaming(input);
    expect(output).toBe(input);
  });

  it('HTML 结束围栏与 CSS 开始围栏直接拼接（</html>```css）', () => {
    const input = [
      '```html',
      '<!DOCTYPE html>',
      '<html lang="zh-CN">',
      '<body>hi</body>',
      '</html>```css',
      '/* style.css */',
      'body { color: red; }',
      '```',
    ].join('\n');
    const output = normalizeMarkdownForStreaming(input);
    // 围栏必须成对（html 开/闭 + css 开/闭 = 4 个独立围栏行）
    const fenceLines = output.split('\n').filter((l) => /^\s*`{3,}\s*$/.test(l)).length;
    const openingLines = output.split('\n').filter((l) => /^\s*`{3,}\s*[A-Za-z]/.test(l)).length;
    expect(fenceLines + openingLines).toBe(4);
    // CSS 语言围栏必须完整存在
    expect(output).toContain('```css');
    expect(output).toContain('```html');
  });

  it('CSS 开始围栏后紧跟代码首行（```css /* style.css */）', () => {
    const input = [
      '```html',
      '<div>hi</div>',
      '```',
      '```css /* style.css */',
      'body { color: red; }',
      '```',
    ].join('\n');
    const output = normalizeMarkdownForStreaming(input);
    expect(output).toContain('```css\n/* style.css */');
  });

  it('末尾孤立的空代码块围栏（AI 多输出了一个 ```）被归一化', () => {
    const input = [
      '```html',
      '<div>hi</div>',
      '```',
      '```',
    ].join('\n');
    const output = normalizeMarkdownForStreaming(input);
    // 3 个围栏 → 归一化后要么成对、要么补成 4 个，不能出现解析为空的第三块
    const fenceLines = output.split('\n').filter((l) => /^\s*`{3,}\s*$/.test(l)).length;
    const openingLines = output.split('\n').filter((l) => /^\s*`{3,}\s*[A-Za-z]/.test(l)).length;
    expect((fenceLines + openingLines) % 2).toBe(0);
  });

  it('流式半截：CSS 代码块刚开围栏还没闭合', () => {
    const input = [
      '```html',
      '<div>hi</div>',
      '```',
      '```css',
      'body { color: red; }',
    ].join('\n');
    const output = normalizeMarkdownForStreaming(input);
    expect(output.endsWith('```')).toBe(true);
  });

  it('代码内容包含反引号（模板字符串）不破坏围栏配对', () => {
    const input = [
      '```js',
      'const tpl = `hello ${name}`;',
      'console.log(tpl);',
      '```',
    ].join('\n');
    const output = normalizeMarkdownForStreaming(input);
    expect(output).toBe(input);
  });
});
