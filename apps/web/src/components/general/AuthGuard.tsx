import { JSX, ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { message, Spin } from "@/components/ui/core";
import { useAuthStore } from "@/store/useAuthStore";
import {
  generateQywxLoginUrl,
  getLocation,
  isInWeChatEnvironment,
  register,
  wwLoginUrl,
} from "@/utils/wecom";
import { useGeolocation } from "@/hooks/useGeolocation";
import { AuthService } from "@/api/services/auth.service";
import * as ww from "@wecom/jssdk";

export const AuthGuard: React.FC<{ children: ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const { isAuthenticated, isLoading, checkAuth, token, setLocation } =
    useAuthStore();
  const {
    position,
    error,
    isLoading: isLoading_geo,
  } = useGeolocation({
    enableHighAccuracy: true,
    timeout: 5000,
  });

  // useEffect(() => {
  //   if (!isLoading_geo) {
  //     if (position) {
  //       // message.info(JSON.stringify(position));
  //       setLocation(position);
  //     }
  //   }
  // }, [isLoading_geo]);

  useEffect(() => {
    const handleAuth = async () => {
      const inQywx = isInWeChatEnvironment().isInQYWX;
      // if (inQywx) {
      //   ww.register({
      //     corpId: import.meta.env.VITE_CORP_ID,
      //     agentId: import.meta.env.VITE_AGENT_ID,
      //     jsApiList: [
      //       "getContext",
      //       "getCurExternalContact",
      //       "checkJsApi",
      //       "getLocation",
      //     ],
      //     getConfigSignature: AuthService.getConfigSignature,
      //     getAgentConfigSignature: AuthService.getAgentSignature,
      //     onConfigSuccess: (res) => {
      //       message.info(JSON.stringify(res));
      //     },
      //     onConfigFail: (res) => {
      //       message.info(JSON.stringify(res));
      //     },
      //   });
      //   const a = ww.getLocation({
      //     success: ({ latitude, longitude }) => {
      //       message.info(`${latitude}${longitude}`);
      //     },
      //   });
      //   message.info(JSON.stringify(a));
      //   // const loc = await getLocation();
      //   // console.log(loc);
      //   // setLocation(loc as any);
      // }
      const searchParams = new URLSearchParams(location.search);
      const redirectUri = JSON.stringify({
        redirect: encodeURIComponent(
          window.location.pathname + window.location.search
        ),
      });

      // 情况1：已有认证
      if (isAuthenticated) {
        setAuthChecked(true);
        return;
      }

      // 情况2：尝试检查现有token
      if (token) {
        const isValid = await checkAuth();
        if (isValid) {
          setAuthChecked(true);
          return;
        }
      }
      if (import.meta.env.DEV) {
        setAuthChecked(true);
        return;
      }
      if (inQywx) {
        window.location.href = generateQywxLoginUrl(redirectUri);
      } else {
        // window.location.href = `/auth-callback?code=${"LiangZhi"}&state=${encodeURIComponent(
        //   redirectUri
        // )}`;
        navigate(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`, {
          replace: true,
        });
        // 非企微环境处理
      }
    };

    handleAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  if (isLoading || !authChecked) {
    return (
      <div className="full-page-spin">
        <Spin tip="验证登录状态..." size="large" />
      </div>
    );
  }

  return <>{children}</>;
};
