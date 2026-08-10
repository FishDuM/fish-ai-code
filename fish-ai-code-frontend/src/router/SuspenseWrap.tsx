import { Suspense } from 'react';
import { Spin } from 'antd';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/**
 * Thin pass-through wrapper around lazy-loaded route elements.
 *
 * We render <Suspense> so React.lazy() has a valid Suspense boundary to
 * attach to while the chunk is loading. The fallback shows a centered
 * loading indicator instead of null: the first SPA navigation to a heavy
 * chunk (e.g. the chat page) can take a few seconds, and a blank screen
 * reads as a crash — refreshing would also drop the navigation state
 * (autoSendInit).
 *
 * We additionally wrap each route in our own ErrorBoundary so that
 * render errors show their real `error.message` instead of being
 * swallowed by React DevTools' console.error override (React 19 +
 * DevTools interplay causes certain error objects to be re-reported
 * as "Cannot convert object to primitive value").
 */
function PageLoading() {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        color: 'rgba(17,25,37,0.45)',
      }}
    >
      <Spin size="large" />
      <div>页面加载中...</div>
    </div>
  );
}

export function SuspenseWrap({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageLoading />}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </Suspense>
  );
}
