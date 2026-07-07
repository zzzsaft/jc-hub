import { QuestionCircleOutlined } from "@/components/ui/icons";
import { Space, Tooltip } from "@/components/ui/core";

export const TooltipLabel = ({
  label,
  tooltip,
}: {
  label: string;
  tooltip: string;
}) => {
  return (
    <Space>
      {label}
      <Tooltip title={tooltip}>
        <QuestionCircleOutlined />
      </Tooltip>
    </Space>
  );
};
