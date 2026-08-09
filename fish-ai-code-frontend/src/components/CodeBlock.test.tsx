import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import CodeBlock from './CodeBlock';

// CodeBlock 依赖 antd App.useApp()（message 上下文）与 useHighlighter（模块级懒加载）。
// 这里只验证复制按钮的取数逻辑，通过 mock navigator.clipboard 观察写入了哪个字符串。

const writeTextMock = vi.fn();

beforeEach(() => {
  // @ts-expect-error jsdom 无 clipboard
  navigator.clipboard = { writeText: writeTextMock };
  writeTextMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CodeBlock 复制', () => {
  it('存在 rawCode 时复制原始代码，而非格式化后的展示字符串', async () => {
    const display = '<html lang="zh-CN">'; // 展示层字符串（可能被格式化）
    const raw = '<html lang="zh-CN">';
    render(<CodeBlock language="html" rawCode={raw}>{display}</CodeBlock>);
    fireEvent.click(screen.getByText('复制'));
    await vi.waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(raw);
    });
  });

  it('未传 rawCode 时回退到 children', async () => {
    render(<CodeBlock language="html">fallback-content</CodeBlock>);
    fireEvent.click(screen.getByText('复制'));
    await vi.waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('fallback-content');
    });
  });

  it('展示与复制使用不同字符串时，复制内容与展示内容一致于原始代码', async () => {
    // 模拟"展示被格式化、原始代码不同"的极端情况
    const display = 'formatted:  a  b';
    const raw = 'raw: a b';
    render(<CodeBlock language="js" rawCode={raw}>{display}</CodeBlock>);
    fireEvent.click(screen.getByText('复制'));
    await vi.waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(raw);
      expect(writeTextMock).not.toHaveBeenCalledWith(display);
    });
  });
});
