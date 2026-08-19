import { create } from 'zustand';
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
  login: (account: string, password: string, captchaId: string, captchaCode: string) => Promise<void>;
  register: (account: string, password: string, checkPassword: string, captchaId: string, captchaCode: string) => Promise<void>;
  logout: () => Promise<void>;
  setLoginUser: (user: LoginUserVO | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
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

  login: async (account, password, captchaId, captchaCode) => {
    set({ isLoading: true });
    try {
      const user = await userApi.login({ userAccount: account, userPassword: password, captchaId, captchaCode });
      set({ loginUser: user, isFetched: true, isLoading: false, authUnavailable: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (account, password, checkPassword, captchaId, captchaCode) => {
    set({ isLoading: true });
    try {
      await userApi.register({ userAccount: account, userPassword: password, checkPassword, captchaId, captchaCode });
      set({ isFetched: true, isLoading: false, authUnavailable: false });
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
}));

// 监听 401 全局登出事件
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    useAuthStore.getState().setLoginUser(null);
  });
}
