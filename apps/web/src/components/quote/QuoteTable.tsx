import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dayjs from "dayjs";
import { Table, Tag, Form, Input } from "@/components/ui/core";
import type { ColumnsType, TablePaginationConfig } from "@/components/ui/types";
import { usePersistentFilterState } from "@/hooks/usePersistentFilterState";
import MemberAvatar from "../general/MemberAvatar";
import QuoteModal from "./QuoteModal";
import { useQuoteStore } from "@/store/useQuoteStore";
import { isTextSelecting } from "@/utils/dom";
import { SorterResult } from "@/components/ui/types";
import "./quoteTable.less";

interface QuoteTableProps {
  type: string; // 'history' | 'oa'
  status?: string;
  approvalNode?: string;
  currentApprover?: string;
}

interface QuoteTableItem {
  key: number;
  quoteId: string;
  orderId: string;
  customerName: string;
  quoteTime: Date;
  status: string;
  flowState: string;
  currentApprovalNode: string;
  currentApprover: string;
  chargerId: string;
  salesSupportId: string;
  quoteName: string;
  projectManagerId: string;
  creatorId: string;
  createdAt: string;
}

interface QuoteTableFilters {
  quoteName: string;
  customerName: string;
  pagination: TablePaginationConfig;
  sorters: Array<{ field?: string; order?: string }>;
}

const defaultQuoteTableFilters: QuoteTableFilters = {
  quoteName: "",
  customerName: "",
  pagination: {
    current: 1,
    pageSize: 20,
  },
  sorters: [],
};

const QuoteTable: React.FC<QuoteTableProps> = ({
  type,
  status,
  approvalNode,
  currentApprover,
}) => {
  const { quotes, total, loading, fetchQuotes, fetchQuote } = useQuoteStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<any>();
  const [searchForm] = Form.useForm();
  const filterKey = `quote.table.${type}.${status || "all"}.${approvalNode || "all"}.${currentApprover || "all"}`;
  const { filters, setFilters } = usePersistentFilterState<QuoteTableFilters>(
    filterKey,
    defaultQuoteTableFilters,
  );
  const pagination = filters.pagination ?? defaultQuoteTableFilters.pagination;
  const sorters = filters.sorters ?? [];
  const lastClickTime = useRef(0);

  useEffect(() => {
    if (pagination.total === total) return;
    setFilters({ pagination: { ...pagination, total } });
  }, [pagination, setFilters, total]);

  useEffect(() => {
    searchForm.setFieldsValue({
      quoteName: filters.quoteName,
      customerName: filters.customerName,
    });
  }, [filters.customerName, filters.quoteName, searchForm]);

  useEffect(() => {
    fetchQuotes({
      page: pagination.current,
      pageSize: pagination.pageSize,
      type,
      quoteName: filters.quoteName,
      customerName: filters.customerName,
      status,
      approvalNode,
      currentApprover,
      sorters: sorters
        .filter((s) => s.order)
        .map((s) => ({ field: s.field as string, order: s.order as string })),
    });
  }, [
    fetchQuotes,
    filters.customerName,
    filters.quoteName,
    pagination.current,
    pagination.pageSize,
    sorters,
    type,
    status,
    approvalNode,
    currentApprover,
  ]);

  const handleSearch = () => {
    setFilters({ pagination: { ...pagination, current: 1 } });
    fetchQuotes({
      page: 1,
      pageSize: pagination.pageSize,
      type,
      quoteName: filters.quoteName,
      customerName: filters.customerName,
      status,
      approvalNode,
      currentApprover,
      sorters: sorters
        .filter((s) => s.order)
        .map((s) => ({ field: s.field as string, order: s.order as string })),
    });
  };

  const handleTableChange = (
    p: TablePaginationConfig,
    _filters: any,
    sorter: SorterResult<QuoteTableItem> | SorterResult<QuoteTableItem>[]
  ) => {
    const sorterArr = Array.isArray(sorter) ? sorter : [sorter];
    const nextSorters = sorterArr
      .filter((s) => s.order)
      .map((s) => ({ field: s.field as string, order: s.order as string }));
    setFilters({ pagination: p, sorters: nextSorters });
    fetchQuotes({
      page: p.current,
      pageSize: p.pageSize,
      type,
      quoteName: filters.quoteName,
      customerName: filters.customerName,
      status,
      approvalNode,
      currentApprover,
      sorters: nextSorters,
    });
  };

  const handleRowClick = useCallback(
    async (record: QuoteTableItem) => {
      if (isTextSelecting()) return;
      const now = Date.now();
      if (now - lastClickTime.current < 1000) return;
      lastClickTime.current = now;

      setSelectedQuote(undefined);
      setModalVisible(true);
      const quoteData = await fetchQuote(record.key);
      setSelectedQuote(quoteData);
      console.log(quoteData);
    },
    [fetchQuote]
  );

  const columns: ColumnsType<QuoteTableItem> = [
    {
      title: "报价编号",
      dataIndex: "quoteId",
      key: "quoteId",
      width: 80,
      sorter: { multiple: 1 },
    },
    {
      title: "订单编号",
      dataIndex: "orderId",
      key: "orderId",
      width: 80,
      sorter: { multiple: 2 },
    },
    {
      title: "报价名称",
      dataIndex: "quoteName",
      key: "quoteName",
      width: 200,
    },
    {
      title: "客户名称",
      dataIndex: "customerName",
      key: "customerName",
      width: 150,
      sorter: { multiple: 3 },
    },
    {
      title: "报价日期",
      dataIndex: "quoteTime",
      key: "quoteTime",
      width: 120,
      sorter: { multiple: 4 },
      render: (date: Date) => new Date(date).toLocaleDateString(),
    },
    {
      title: "创建日期",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      sorter: { multiple: 5 },
      render: (date: string) => dayjs(date).format("YYYY-MM-DD HH:mm:ss"),
    },
    {
      title: "当前状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: string) => {
        let color = "";
        switch (status) {
          case "draft":
            color = "orange";
            break;
          case "checking":
            color = "blue";
            break;
          case "completed":
            color = "green";
            break;
          case "locked":
            color = "red";
            break;
          default:
            color = "gray";
        }
        return (
          <Tag color={color}>
            {status === "draft"
              ? "草稿"
              : status === "checking"
              ? "检查中"
              : status === "completed"
              ? "已完成"
              : "已锁定"}
          </Tag>
        );
      },
    },
    ...(type === "history"
      ? []
      : [
          {
            title: "审批状态",
            dataIndex: "flowState",
            key: "flowState",
            width: 120,
            render: (flowState: string) => (
              <Tag color={flowState ? "cyan" : "default"}>
                {flowState || "未审批"}
              </Tag>
            ),
          },
          {
            title: "当前节点",
            dataIndex: "currentApprovalNode",
            key: "currentApprovalNode",
            width: 120,
          },
          {
            title: "当前审批人",
            dataIndex: "currentApprover",
            key: "currentApprover",
            width: 120,
            render: (id: string) =>
              (id && id != "" && <MemberAvatar id={id} />) || "-",
          },
        ]),
    {
      title: "销售负责人",
      dataIndex: "chargerId",
      key: "chargerId",
      width: 120,
      render: (chargerId: string) =>
        (chargerId && <MemberAvatar id={chargerId} />) || "-",
    },
    {
      title: "项目负责人",
      dataIndex: "projectManagerId",
      key: "projectManagerId",
      width: 120,
      render: (projectManagerId: string) =>
        (projectManagerId && <MemberAvatar id={projectManagerId} />) || "-",
    },
    {
      title: "销售支持",
      dataIndex: "salesSupportId",
      key: "salesSupportId",
      width: 120,
      render: (salesSupportId: string) =>
        (salesSupportId && <MemberAvatar id={salesSupportId} />) || "-",
    },
    {
      title: "创建人",
      dataIndex: "creatorId",
      key: "creatorId",
      width: 120,
      sorter: { multiple: 6 },
      render: (creatorId: string) =>
        (creatorId && <MemberAvatar id={creatorId} />) || "-",
    },
  ];

  const tableData = useMemo(
    () =>
      quotes.map((quote) => ({
        key: quote.id,
        quoteId: quote.quoteId ?? "",
        orderId: quote.orderId ?? "",
        customerName: quote.customerName,
        quoteTime: quote.quoteTime as any,
        createdAt: (quote as any).createdAt ?? "",
        status: quote.status,
        flowState: quote.flowState,
        currentApprovalNode: quote.currentApprovalNode,
        currentApprover: quote.currentApprover,
        chargerId: quote.chargerId,
        salesSupportId: quote.salesSupportId,
        quoteName: quote.quoteName,
        projectManagerId: quote.projectManagerId,
        creatorId: quote.creatorId,
      })),
    [quotes]
  );

  return (
    <>
      <Form
        form={searchForm}
        initialValues={{
          quoteName: filters.quoteName,
          customerName: filters.customerName,
        }}
        layout="inline"
        style={{ marginBottom: 16 }}
        onChange={() => {
          const values = searchForm.getFieldsValue();
          setFilters({
            quoteName: values.quoteName ?? "",
            customerName: values.customerName ?? "",
          });
        }}
        onFinish={handleSearch}
      >
        <Form.Item name="quoteName" label="报价名称">
          <Input placeholder="请输入报价名称" allowClear />
        </Form.Item>
        <Form.Item name="customerName" label="客户名称">
          <Input placeholder="请输入客户名称" allowClear />
        </Form.Item>
        <Form.Item>
          <Input type="submit" value="查询" style={{ width: 80 }} />
        </Form.Item>
      </Form>
      <Table<QuoteTableItem>
        className="quoteTableWrap"
        columns={columns}
        dataSource={tableData}
        bordered
        size="middle"
        scroll={{ x: "max-content", y: "calc(100vh - 250px)" }}
        pagination={{
          ...pagination,
          pageSizeOptions: ["20", "50", "100"],
          showSizeChanger: true,
          showQuickJumper: true,
        }}
        loading={loading.getQuotes}
        onChange={handleTableChange}
        sticky
        onRow={(record) => ({
          onClick: () => handleRowClick(record),
        })}
      />
      <QuoteModal
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        initialValues={selectedQuote}
        loading={loading.getQuote}
        onSubmit={() => setModalVisible(false)}
      />
    </>
  );
};

export default QuoteTable;
