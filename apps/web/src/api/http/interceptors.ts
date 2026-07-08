import { AxiosInstance } from "axios";

const getStoredToken = () => {
  if (typeof localStorage === "undefined") return "";
  try {
    const authStorage = JSON.parse(localStorage.getItem("auth-storage") || "{}");
    return authStorage?.state?.token || "";
  } catch {
    return "";
  }
};

const getRequestToken = () => getStoredToken() || (import.meta.env.DEV ? "mock-token" : "");

export const setupInterceptors = (instance: AxiosInstance) => {
  // 请求拦截
  instance.interceptors.request.use((config) => {
    const token = getRequestToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // // 响应拦截
  // instance.interceptors.response.use(
  //   (response) => response.data,
  //   (error) => {
  //     if (error.response?.status === 401) {
  //       useAuthStore.getState().logout();
  //       // window.location.href = "/login";
  //     }
  //     return Promise.reject(error);
  //   }
  // );
};
