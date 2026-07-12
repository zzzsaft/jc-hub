import React, { Suspense, lazy } from "react";
import { Routes, Route, BrowserRouter } from "react-router-dom";
import { AuthGuard } from "./components/general/AuthGuard";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import AppRoutes from "./app/AppRoutes";

const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const LoginFailedPage = lazy(() => import("@/pages/LoginFailedPage"));
const NoPermissionPage = lazy(() =>
  import("@/pages/NoPermissionPage").then((module) => ({
    default: module.NoPermissionPage,
  }))
);
const QuoteSharePage = lazy(() => import("@/pages/quote/QuoteSharePage"));

dayjs.locale("zh-cn");

const pageFallback = (
  <div className="flex min-h-[240px] items-center justify-center text-sm text-slate-500">
    页面加载中...
  </div>
);

const App: React.FC = () => {
  return (
    <Suspense fallback={pageFallback}>
      <BrowserRouter>
        <Routes>
          <Route path="/auth-callback" element={<AuthCallback />} />
          <Route path="/quote/share/:uuid" element={<QuoteSharePage />} />
          <Route path="/login" element={<LoginFailedPage />} />
          <Route path="/error/no-permission" element={<NoPermissionPage />} />
          <Route
            path="*"
            element={
              <AuthGuard>
                <AppRoutes />
              </AuthGuard>
            }
          />
        </Routes>
      </BrowserRouter>
    </Suspense>
  );
};

export default App;
