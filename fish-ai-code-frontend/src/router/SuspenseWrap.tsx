import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/**
 * Thin pass-through wrapper around lazy-loaded route elements.
 *
 * We render <Suspense fallback={null}> so React.lazy() has a valid
 * Suspense boundary to attach to while the chunk is loading. The
 * fallback is intentionally null — we do NOT show a skeleton here,
 * because chunks are small and almost always cached after the first
 * page visit, so a skeleton would only:
 *   - flash for ~30ms on first navigation and look like a glitch, or
 *   - sit on screen long enough to feel sluggish.
 *
 * Using `null` keeps the screen blank during the (very brief) load
 * window so the previous/next page crossfades cleanly with no visible
 * loading state.
 *
 * We additionally wrap each route in our own ErrorBoundary so that
 * render errors show their real `error.message` instead of being
 * swallowed by React DevTools' console.error override (React 19 +
 * DevTools interplay causes certain error objects to be re-reported
 * as "Cannot convert object to primitive value").
 */
export function SuspenseWrap({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </Suspense>
  );
}
