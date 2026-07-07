// src/pages/AuthCallback.tsx
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Spin } from "@/components/ui/core";
import { useAuthStore } from "../store/useAuthStore";
import useApp from "@/components/ui/useApp";
import axios from "axios";

function getLoginErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      const message = record.message ?? record.detail ?? record.error ?? record.msg;
      if (typeof message === "string" && message.trim()) return message;
    }
    if (error.response?.status) return `服务端返回 ${error.response.status}`;
    if (error.message) return error.message;
  }

  if (error instanceof Error && error.message) return error.message;
  return "登录失败，请稍后重试。";
}

function toLoginFailedPath(reason: string) {
  return `/login?reason=${encodeURIComponent(reason)}`;
}

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { loginWithCode } = useAuthStore();
  const { message } = useApp(); // 只能在组件内调用
  useEffect(() => {
    const handleCallback = async () => {
      const searchParams = new URLSearchParams(location.search);
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      if (!code) {
        navigate(toLoginFailedPath("缺少认证参数 code"), { replace: true });
        return;
      }
      // console.log("code", code);
      try {
        await loginWithCode(code);

        // 默认跳转首页
        let redirect = "/";
        if (state) {
          try {
            const parsedState = JSON.parse(decodeURIComponent(state));
            // console.log(parsedState);
            if (parsedState.redirect) {
              redirect = parsedState.redirect;
            }
          } catch (e) {
            console.error("解析 state 失败", e);
          }
        }
        navigate(redirect, { replace: true });
      } catch (error) {
        const reason = getLoginErrorMessage(error);
        message.error(reason);
        navigate(toLoginFailedPath(reason), { replace: true });
      }
    };

    handleCallback();
  }, [location, loginWithCode, message, navigate]);

  return (
    <div className="full-page-spin">
      <Spin tip="正在验证登录状态..." size="large" />
    </div>
  );
}
