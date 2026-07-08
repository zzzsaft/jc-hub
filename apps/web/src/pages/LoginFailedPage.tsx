import { Button, Form, Input, Space, Typography } from "@/components/ui/core";
import axios from "axios";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";

const { Text } = Typography;

const DEFAULT_LOGIN_ERROR = "";

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      const message = (data as Record<string, unknown>).message ?? (data as Record<string, unknown>).error;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "账号或密码错误，请重新输入";
}

function readLoginError(search: string) {
  const params = new URLSearchParams(search);
  const reason = params.get("reason")?.trim();
  if (!reason) return DEFAULT_LOGIN_ERROR;

  try {
    return decodeURIComponent(reason);
  } catch {
    return reason;
  }
}

export default function LoginFailedPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const reason = useMemo(() => readLoginError(location.search), [location.search]);
  const loginWithPassword = useAuthStore((state) => state.loginWithPassword);
  const isLoading = useAuthStore((state) => state.isLoading);
  const [error, setError] = useState("");
  const redirect = useMemo(() => {
    const value = new URLSearchParams(location.search).get("redirect");
    return value || "/";
  }, [location.search]);

  const submit = async (values: { username?: string; password?: string }) => {
    const username = values.username?.trim() || "";
    const password = values.password || "";
    if (!username || !password) {
      setError("请输入账号和密码");
      return;
    }
    try {
      setError("");
      await loginWithPassword(username, password);
      navigate(redirect, { replace: true });
    } catch (loginError) {
      setError(getErrorMessage(loginError));
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Space direction="vertical" className="w-full">
          <Typography.Title level={2} className="mb-1 text-center">
            账号密码登录
          </Typography.Title>
          {reason && <Text>{reason}</Text>}
          <Form initialValues={{ username: "", password: "" }} onFinish={(values) => void submit(values)} className="w-full text-left">
            <Form.Item name="username" label="账号">
              <Input autoComplete="username" autoFocus placeholder="请输入账号" />
            </Form.Item>
            <Form.Item name="password" label="密码">
              <Input autoComplete="current-password" placeholder="请输入密码" type="password" />
            </Form.Item>
            {error && <Text className="text-red-600">{error}</Text>}
            <Button block htmlType="submit" loading={isLoading} type="primary">
              登录
            </Button>
          </Form>
          <Button type="link" onClick={() => navigate("/", { replace: true })}>
            使用企业微信登录
          </Button>
        </Space>
      </section>
    </main>
  );
}
