import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LoginUserVO } from '@/api/types';
import * as userApi from '@/api/user';

let fetchPromise: Promise<void> | null = null;

interface AuthState {
  loginUser: LoginUserVO | null;
  isFetched: boolean;
  isLoading: boolean;
  /** True only when the session probe could not reach a usable backend response. */
  authUnavailable: boolean;

  fetchLoginUser: () => Promise<void>;
  login: (account: string, password: string) => Promise<void>;
  register: (account: string, password: string, checkPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  setLoginUser: (user: LoginUserVO | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      loginUser: null,
      isFetched: false,
      isLoading: false,
      authUnavailable: false,

      fetchLoginUser: () => {
        // Deduplicate concurrent calls
        if (!fetchPromise) {
          fetchPromise = (async () => {
            set({ isLoading: true });
            try {
              const result = await userApi.getLoginUser();
              if (result.status === 'authenticated') {
                set({ loginUser: result.user, isFetched: true, isLoading: false, authUnavailable: false });
              } else if (result.status === 'unauthenticated') {
                set({ loginUser: null, isFetched: true, isLoading: false, authUnavailable: false });
              } else {
                // Keep the current in-memory user, if any, and let route guards
                // present a retry UI instead of converting a network outage into
                // a false logout.
                set({ isFetched: true, isLoading: false, authUnavailable: true });
              }
            } catch {
              set({ isFetched: true, isLoading: false, authUnavailable: true });
            } finally {
              fetchPromise = null;
            }
          })();
        }
        return fetchPromise;
      },

      login: async (account, password) => {
        set({ isLoading: true });
        try {
          const user = await userApi.login({ userAccount: account, userPassword: password });
          set({ loginUser: user, isLoading: false, authUnavailable: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (account, password, checkPassword) => {
        set({ isLoading: true });
        try {
          await userApi.register({ userAccount: account, userPassword: password, checkPassword });
          set({ isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try {
          await userApi.logout();
          set({ loginUser: null, authUnavailable: false });
        } catch (error) {
          // 即使后端登出失败也清空本地登录状态，并把错误抛回调用方以便显示反馈
          set({ loginUser: null, authUnavailable: false });
          throw error;
        }
      },

      setLoginUser: (user) => set({ loginUser: user, authUnavailable: false }),
    }),
    {
      name: 'fish-ai-code-auth',
      // Don't persist loginUser. The server-side session is the only source
      // of truth for who's logged in; persisting stale user info here made
      // the header briefly show the previous user's avatar/admin menu after
      // a logout, password change, or a server-side role downgrade.
      // isFetched is also intentionally excluded — it must start false on
      // every page load so RequireAuth re-validates the session.
      partialize: () => ({}),
    }
  )
);

// Listen for external logout events (e.g. from axios interceptor on 401).
// HMR 下此模块会反复执行，模块级 addEventListener 若不加幂等守卫会重复注册，
// 导致一次 auth:logout 触发多次 setLoginUser(null)。用 window 上的 flag 防重入。
if (typeof window !== 'undefined' && !window.__fishAuthListenerInstalled) {
  window.addEventListener('auth:logout', () => {
    useAuthStore.getState().setLoginUser(null);
  });
  window.__fishAuthListenerInstalled = true;
}

declare global {
  interface Window {
    __fishAuthListenerInstalled?: boolean;
  }
}
