import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Minimal error boundary. Renders the raw error (including its `name`,
 * `message`, and the FIRST CAUSE-level stack frame from `componentStack`)
 * — bypassing React DevTools' `console.error` override that, under React
 * 19, fails to stringify certain error objects and replaces the real
 * message with a misleading "Cannot convert object to primitive value".
 *
 * React Router's default ErrorBoundary would also recover the page; we
 * prefer a one-of-our-own to keep the visible error verbatim so we can
 * see what's actually broken. After we identify the cause, this can be
 * replaced with the router default.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info });
    // 合并为单次 console.error，避免开发控制台出现两条一模一样的噪音
    const firstFrame =
      typeof info?.componentStack === 'string'
        ? info.componentStack.split('\n')[1]?.trim()
        : undefined;
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, '\n[ErrorBoundary] componentStack first frame:', firstFrame);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    // String(...) 不会抛，因此原先那层 try/catch 是死代码；这里直接 inline 简化，
    // 既保持 "能显示真实 error 信息" 的能力，又去掉冗余分支。
    return (
      <div style={{ padding: 24, color: '#111925', fontFamily: 'Menlo, monospace', fontSize: 13 }}>
        <h2 style={{ marginBottom: 8 }}>页面渲染出错</h2>
        <div style={{ marginBottom: 8 }}>
          <strong>name:</strong> {String(error.name || '(no name)')}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>message:</strong> {String(error?.message ?? '(no message)')}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>stack (first 5 frames):</strong>
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>
            {String(error?.stack ?? '').split('\n').slice(0, 5).join('\n')}
          </pre>
        </div>
        {info?.componentStack && (
          <div>
            <strong>componentStack (first 5 frames):</strong>
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>
              {info.componentStack.split('\n').slice(0, 5).join('\n')}
            </pre>
          </div>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
