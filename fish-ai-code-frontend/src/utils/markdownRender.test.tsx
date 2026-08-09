import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import type { ReactNode } from 'react';
import { normalizeMarkdownForStreaming } from './markdownNormalize';

// 渲染链路验证：normalize 后的内容经 ReactMarkdown 解析，
// CSS 必须进入代码块（pre/code 元素），不能落入普通段落
describe('多代码块渲染链路', () => {
  afterEach(cleanup);

  function renderMarkdown(content: string) {
    return render(
      <ReactMarkdown
        components={{
          code({ className, children }: { className?: string; children?: ReactNode }) {
            const isBlock =
              String(children).includes('\n') || /language-/.test(className || '');
            return (
              <code data-testid={isBlock ? 'block-code' : 'inline-code'} className={className}>
                {children}
              </code>
            );
          },
        }}
      >
        {normalizeMarkdownForStreaming(content)}
      </ReactMarkdown>,
    );
  }

  it('</html>```css 拼接修复后，CSS 进入代码块而非普通段落', () => {
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
    renderMarkdown(input);
    // 至少有一个代码块；CSS 内容必须在代码块内
    const blocks = screen.getAllByTestId('block-code');
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    const cssBlock = blocks.find((el) => el.textContent?.includes('/* style.css */'));
    expect(cssBlock).toBeTruthy();
  });

  it('多文件标准输出：html/css/js 三块各自成块', () => {
    const input = [
      '```html',
      '<div>a</div>',
      '```',
      '```css',
      'body{}',
      '```',
      '```js',
      'console.log(1)',
      '```',
    ].join('\n');
    renderMarkdown(input);
    const blocks = screen.getAllByTestId('block-code');
    expect(blocks.length).toBe(3);
    const cssBlock = blocks.find((el) => el.textContent?.includes('body{}'));
    expect(cssBlock?.className).toContain('language-css');
  });
});
