import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LoginUserVO } from '@/api/types';
import * as userApi from '@/api/user';

let fetchPromise: Promise<void> | null = null;

interface AuthState {
  loginUser: LoginUserVO | null;
  isFetched: boolean;
  isLoading: boolean;

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

      fetchLoginUser: () => {
        // Deduplicate concurrent calls
        if (!fetchPromise) {
          fetchPromise = (async () => {
            set({ isLoading: true });
            try {
              const user = await userApi.getLoginUser();
              set({ loginUser: user, isFetched: true, isLoading: false });
            } catch {
              set({ loginUser: null, isFetched: true, isLoading: false });
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
          set({ loginUser: user, isLoading: false });
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
        } finally {
          set({ loginUser: null });
        }
      },

      setLoginUser: (user) => set({ loginUser: user }),
    }),
    {
      name: 'fish-ai-code-auth',
      partialize: (state) => ({ loginUser: state.loginUser }),
    }
  )
);

// Listen for external logout events (e.g. from axios interceptor on 401)
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    useAuthStore.getState().setLoginUser(null);
  });
}
