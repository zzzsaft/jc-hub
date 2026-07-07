import React from "react";
import { Pagination, Table } from "@/components/ui/core";
import type { TablePaginationConfig } from "@/components/ui/types";
import MemberAvatar from "../general/MemberAvatar";
import { QuoteTemplate } from "@/types/types";

interface TemplateTableProps {
  templates: QuoteTemplate[];
  loading?: boolean;
  selectedId?: string;
  onSelect?: (tpl: QuoteTemplate) => void;
  onDoubleClick?: (tpl: QuoteTemplate) => void;
  showType?: boolean;
  actionRender?: (tpl: QuoteTemplate) => React.ReactNode;
  pagination?: false | TablePaginationConfig;
  onPageChange?: (page: number, pageSize: number) => void;
}

const TEMPLATE_TYPE_MAP: Record<string, string> = {
  DieForm: "平模",
  SmartRegulator: "智能调节器",
  MeteringPumpForm: "熔体计量泵",
  FeedblockForm: "共挤复合分配器",
  FilterForm: "过滤器",
  ThicknessGaugeForm: "测厚仪",
  HydraulicStationForm: "液压站",
  ManifoldForm: "合流器",
  CoatingDieForm: "涂布模头",
  PartsForm: "小配件",
  OtherForm: "其他",
};

const TemplateTable: React.FC<TemplateTableProps> = ({
  templates,
  loading = false,
  selectedId,
  onSelect,
  onDoubleClick,
  showType = true,
  actionRender,
  pagination = false,
  onPageChange,
}) => {
  const columns = [
    { title: "ID", dataIndex: "id", width: 80 },
    { title: "名称", dataIndex: "name" },
    { title: "描述", dataIndex: "description" },
    showType
      ? {
          title: "类型",
          dataIndex: "templateType",
          render: (v: string) => TEMPLATE_TYPE_MAP[v] || v,
        }
      : null,
    {
      title: "创建人",
      dataIndex: "creatorId",
      render: (id: string) => id && <MemberAvatar id={id} />,
      width: 120,
    },
    {
      title: "适用材料",
      dataIndex: "materials",
      render: (v: string[]) => v?.join("/") || "",
    },
    {
      title: "行业",
      dataIndex: "industries",
      render: (v: string[]) => v?.join("/") || "",
    },
    actionRender
      ? {
          title: "操作",
          width: 120,
          render: (_: any, record: QuoteTemplate) => actionRender(record),
        }
      : null,
  ].filter(Boolean);

  return (
    <div>
      <Table
        rowKey="id"
        dataSource={templates}
        columns={columns as any}
        loading={loading}
        pagination={pagination}
        onChange={(p: TablePaginationConfig) => {
          if (onPageChange && p.current && p.pageSize) {
            onPageChange(p.current, p.pageSize);
          }
        }}
        onRow={(record) => ({
          onClick: () => onSelect?.(record),
          onDoubleClick: () => onDoubleClick?.(record),
          style: {
            cursor: onSelect ? "pointer" : undefined,
            backgroundColor: selectedId === record.id ? "#e6f4ff" : undefined,
          },
        })}
      />
      {pagination && (
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <Pagination
            {...pagination}
            showSizeChanger={false}
            onChange={(page, pageSize) => {
              onPageChange?.(page, pageSize);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default TemplateTable;
