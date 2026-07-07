import { Button, Result, Space, Typography } from "@/components/ui/core";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const { Text } = Typography;

const DEFAULT_LOGIN_ERROR = "登录验证未通过，请重新登录或联系管理员。";

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

  return (
    <Result
      status="error"
      title="登录失败"
      subTitle={
        <Space direction="vertical">
          <Text>{reason}</Text>
          <Text type="secondary">如果多次重试仍失败，请将此原因反馈给管理员。</Text>
        </Space>
      }
      extra={[
        <Button key="retry" type="primary" onClick={() => navigate("/", { replace: true })}>
          重新登录
        </Button>,
      ]}
    />
  );
}
