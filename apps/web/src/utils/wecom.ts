import * as ww from "@wecom/jssdk";
import { AuthService } from "../api/services/auth.service";
export const register = () => {
  ww.register({
    corpId: import.meta.env.VITE_CORP_ID,
    agentId: import.meta.env.VITE_AGENT_ID,
    jsApiList: [
      "getContext",
      "getCurExternalContact",
      "checkJsApi",
      "getLocation",
    ],
    getConfigSignature: AuthService.getConfigSignature,
    getAgentConfigSignature: AuthService.getAgentSignature,
  });
};

export const getContext = async () => {
  return await ww.getContext();
};

export const getLocation = async () => {
  return await ww.getLocation();
};

export const isInWeChatEnvironment = () => {
  // 先通过UA初步判断
  const ua = navigator.userAgent.toLowerCase();
  const isInWeChat = /micromessenger/i.test(ua);
  const isInQYWX = /wxwork/i.test(ua) && isInWeChat;

  return { isInWeChat, isInQYWX };
};

export const generateQywxLoginUrl = (redirectUri: string) => {
  const authUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=wwd56c5091f4258911&redirect_uri=${encodeURIComponent(
    `${window.location.origin}/auth-callback`
  )}&response_type=code&scope=snsapi_base&state=${encodeURIComponent(
    redirectUri
  )}&agentid=${import.meta.env.VITE_AGENT_ID_LOGIN}#wechat_redirect`;
  return authUrl;
};

export const wwLogin = (
  el: string | Element | undefined,
  state: string,
  onCheckWeComLogin: ({ isWeComLogin }: { isWeComLogin: boolean }) => void,
  onLoginSuccess: ({ code }: { code: string }) => void,
  onLoginFail: (err: any) => void
) => {
  ww.createWWLoginPanel({
    el,
    params: {
      login_type: "CorpApp" as any,
      appid: import.meta.env.VITE_CORP_ID, // 替换为你的企业ID
      agentid: import.meta.env.VITE_AGENT_ID, // 替换为你的应用ID
      redirect_uri: "http://hz.jc-times.com:2005",
      state,
      redirect_type: "callback" as any,
    },
    onCheckWeComLogin,
    onLoginSuccess,
    onLoginFail,
  });
};

export const wwLoginUrl = (state: string) => {
  const url = `https://login.work.weixin.qq.com/wwlogin/sso/login?login_type=CorpApp&appid=${
    import.meta.env.VITE_CORP_ID
  }&agentid=${
    import.meta.env.VITE_AGENT_ID_LOGIN
  }&redirect_uri=${encodeURIComponent(
    "http://hz.jc-times.com:2006/auth-callback"
  )}&state=${state}`;
  return url;
};
