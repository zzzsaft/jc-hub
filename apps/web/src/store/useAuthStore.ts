import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AuthService } from "../api/services/auth.service";
import { log } from "console";
import { message } from "@/components/ui/core";
import { Position } from "../types/types";

interface User {
  id: string;
  name: string;
}

interface AuthState {
  location: null | Position;
  token: string | null;
  name: string | null;
  avatar: string | null;
  userid: string | null;
  roles: string[];
  capabilities: Record<string, boolean>;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  hasPermission: (code: string) => boolean;
  canAny: (codes: string[]) => boolean;
  checkAuth: () => Promise<boolean>;
  loginWithCode: (code: string) => Promise<void>;
  loginWithPassword: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setLocation: (loc: Position) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    // 持久化中间件（可选）
    (set, get) => ({
      location: null,
      token: null,
      name: null,
      avatar: null,
      userid: null,
      roles: [],
      capabilities: {},
      permissions: [],
      isAuthenticated: false,
      isLoading: false,
      hasPermission: (code: string) => {
        if (import.meta.env.DEV && !get().token) return true;
        return get().permissions.includes(code);
      },
      canAny: (codes: string[]) => {
        if (import.meta.env.DEV && !get().token) return true;
        return codes.some((code) => get().permissions.includes(code));
      },

      // 新增：检查当前认证状态
      checkAuth: async () => {
        const { token, isAuthenticated } = get();
        if (!token) return false;
        if (get().isLoading) return false; // 防止重复执行
        try {
          set({ isLoading: true });
          // 验证token有效性
          const user = await AuthService.getUserInfo();
          set({
            userid: user.userId,
            isAuthenticated: true,
            name: user.name,
            avatar: user.avatar,
            roles: user.roles || [],
            capabilities: user.capabilities || {},
            permissions: user.permissions || [],
          });
          if (user.token) {
            set({ token: user.token });
          }
          return true;
        } catch (error) {
          set({ token: null, userid: null, roles: [], capabilities: {}, permissions: [], isAuthenticated: false });
          return false;
        } finally {
          set({ isLoading: false });
        }
      },

      loginWithCode: async (code: string) => {
        if (get().isLoading) return; // 防止重复执行
        set({ isLoading: true });
        try {
          const { token } = await AuthService.loginWithCode(code);
          set({ token });
          const user = await AuthService.getUserInfo();
          set({
            userid: user.userId,
            isAuthenticated: true,
            name: user.name,
            avatar: user.avatar,
            roles: user.roles || [],
            capabilities: user.capabilities || {},
            permissions: user.permissions || [],
          });
        } catch (error) {
          set({ userid: null, roles: [], capabilities: {}, permissions: [], isAuthenticated: false });
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },
      loginWithPassword: async (username: string, password: string) => {
        if (get().isLoading) return;
        set({ isLoading: true });
        try {
          const { token } = await AuthService.loginWithPassword(username, password);
          set({ token });
          const user = await AuthService.getUserInfo();
          set({
            userid: user.userId,
            isAuthenticated: true,
            name: user.name,
            avatar: user.avatar,
          });
        } catch (error) {
          set({ token: null, userid: null, isAuthenticated: false });
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },
      // 新增：退出登录
      logout: () => {
        set({
          token: null,
          name: null,
          avatar: null,
          userid: null,
          roles: [],
          capabilities: {},
          permissions: [],
          isAuthenticated: false,
        });
      },
      setLocation: async (location: Position) => {
        set({ location: location });
        await AuthService.setLocation(location);
      },
    }),
    {
      name: "auth-storage", // localStorage 的 key
      partialize: (state) => ({ token: state.token, name: state.name }), // 只持久化 token
    }
  )
);
