// src/pages/AuthCallback.tsx
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Spin } from "@/components/ui/core";
import { useAuthStore } from "../store/useAuthStore";
import useApp from "@/components/ui/useApp";
import { AuthService } from "../api/services/auth.service";

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { message } = useApp(); // 只能在组件内调用
  useEffect(() => {
    const handleRedirect = async () => {
      const searchParams = new URLSearchParams(location.search);
      const redirect = searchParams.get("redirect_uri");
      if (!redirect) {
        message.error("缺少redirect参数");
        return;
      }
      try {
        const url = await AuthService.redirectJdy(redirect);
        window.location.href = url;
      } catch (error) {
        message.error("登录失败");
        navigate("/login");
      }
    };

    handleRedirect();
  }, [location, message, navigate]);

  return (
    <div className="full-page-spin">
      <Spin tip="正在跳转精诚移动OA" size="large" />
    </div>
  );
}
