import { Button, Result, Space, Typography } from "@/components/ui/core";
import { useNavigate } from "react-router-dom";
const { Title, Text } = Typography;
interface ErrorPageProps {
  errorType?: "no-permission" | "not-found" | "deleted";
}

export const NoPermissionPage: React.FC<ErrorPageProps> = ({
  errorType = "no-permission",
}) => {
  const navigate = useNavigate();

  const errorConfig = {
    "no-permission": {
      title: "访问受限",
      description: "您没有权限访问此页面",
      solutions: "请联系管理员获取权限",
    },
    "not-found": {
      title: "页面不存在",
      description: "您访问的报价单不存在",
      solutions: "请检查链接是否正确",
    },
    deleted: {
      title: "内容已删除",
      description: "您访问的报价单已被删除",
      solutions: "如需恢复请联系管理员",
    },
  };

  const currentError = errorConfig[errorType] || errorConfig["no-permission"];

  return (
    <Result
      status={errorType === "no-permission" ? "403" : "404"}
      title={currentError.title}
      subTitle={
        <Space direction="vertical">
          <Text>{currentError.description}</Text>
          <Text type="secondary">{currentError.solutions}</Text>
        </Space>
      }
      extra={[
        <Button key="home" type="primary" onClick={() => navigate("/")}>
          返回首页
        </Button>,
        <Button key="back" onClick={() => navigate(-1)}>
          返回上一页
        </Button>,
      ]}
    />
  );
};

// 使用示例：
// 1. 路由跳转：navigate('/error/no-permission?type=deleted')
// 2. 直接渲染：<NoPermissionPage errorType="not-found" />
