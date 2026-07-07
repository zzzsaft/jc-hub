import React, { useEffect, useState } from "react";
import { Modal, Tabs, Table, Button, Pagination } from "@/components/ui/core";
import { ProductService } from "@/api/services/product.service";
import ProductSearchBar from "../../general/ProductSearchBar";
import {
  QuoteItem,
  ProductSearchResult,
  QuoteTemplate,
} from "../../../types/types";
import TemplateTable from "../../template/TemplateTable";
import TemplateCreateModal from "../../template/TemplateCreateModal";
import TemplateConfigModal from "../../template/TemplateConfigModal";
import { TemplateService } from "@/api/services/template.service";

interface ImportProductModalProps {
  open: boolean;
  onCancel: () => void;
  onImport: (item: QuoteItem) => void;
  formType?: string;
  orderOnly?: boolean;
}

const ImportProductModal: React.FC<ImportProductModalProps> = ({
  open,
  onCancel,
  onImport,
  formType,
  orderOnly = false,
}) => {
  const isOtherForm = formType === "OtherForm";
  const [mode, setMode] = useState<"template" | "other">(
    orderOnly || isOtherForm ? "other" : "template"
  );
  const [list, setList] = useState<ProductSearchResult[]>([]);
  const [selected, setSelected] = useState<ProductSearchResult>();
  const [selectedTemplate, setSelectedTemplate] = useState<QuoteTemplate>();
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [currentTpl, setCurrentTpl] = useState<
    QuoteTemplate | QuoteItem | null
  >(null);
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplPage, setTplPage] = useState(1);
  const [tplTotal, setTplTotal] = useState(0);
  const [otherPage, setOtherPage] = useState(1);
  const [otherTotal, setOtherTotal] = useState(0);
  const [searchField, setSearchField] = useState<"code" | "name">("code");
  const [searchKeyword, setSearchKeyword] = useState("");

  const fetchTemplates = async (page: number) => {
    setTplLoading(true);
    try {
      const { list, total } = await TemplateService.getTemplates({
        formType,
        page,
        pageSize: 10,
      });
      setTemplates(list);
      setTplTotal(total);
      setTplPage(page);
    } finally {
      setTplLoading(false);
    }
  };

  useEffect(() => {
    if (isOtherForm || orderOnly) {
      setMode("other");
    }
  }, [isOtherForm, orderOnly]);

  useEffect(() => {
    if (!orderOnly && open && mode === "template") {
      fetchTemplates(1);
    }
  }, [open, mode, formType, orderOnly]);

  const fetchOthers = async (
    page: number,
    field: "code" | "name",
    keyword: string
  ) => {
    setLoading(true);
    try {
      const { list, total } = await ProductService.searchProducts(
        keyword,
        field,
        formType,
        page,
        10
      );
      setList(list);
      setOtherTotal(total);
      setOtherPage(page);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (field: "code" | "name", keyword: string) => {
    setSearchField(field);
    setSearchKeyword(keyword);
    fetchOthers(1, field, keyword);
  };

  const cleanConfig = (config: any) => {
    const {
      isBuySameProduct,
      lastProductCode,
      isIntercompatible,
      intercompatibleProductCode,
      ...rest
    } = config || {};
    return rest;
  };

  const handleImport = () => {
    if (mode === "template" && selectedTemplate) {
      onImport({
        ...selectedTemplate,
        productCode: (selectedTemplate as any).productCode,
        config: cleanConfig(selectedTemplate.config),
        importInfo: {
          type: "template",
          name: selectedTemplate.name,
          id: selectedTemplate.id,
        },
      } as any);
    } else if (mode === "other" && selected) {
      onImport({
        ...selected.item,
        config: cleanConfig(selected.item.config),
        productCode: (selected.item as any).productCode,
        importInfo: {
          type: "order",
          name: selected.item.productName ?? "",
          id: String(selected.item.id),
        },
      } as any);
      // onImport(selected.item);
    }
  };

  return (
    <>
      <Modal
        width={800}
        open={open}
        title="从模版导入"
        onCancel={onCancel}
        footer={[
          <Button key="cancel" onClick={onCancel}>
            取消
          </Button>,
          <Button
            key="import"
            type="primary"
            onClick={handleImport}
            disabled={mode === "template" ? !selectedTemplate : !selected}
          >
            导入
          </Button>,
        ]}
        destroyOnHidden
        forceRender
      >
        <Tabs
          activeKey={mode}
          onChange={(key) => setMode(key as any)}
          items={[
            ...(!orderOnly
              ? [
                  {
                    key: "template",
                    label: "从模版导入",
                    disabled: isOtherForm,
                    children: (
                      <div>
                        <div style={{ marginBottom: 16 }}>
                          <Button
                            type="primary"
                            onClick={() => setCreateOpen(true)}
                            disabled={isOtherForm}
                          >
                            创建模版
                          </Button>
                          <Button
                            style={{ marginLeft: 8 }}
                            onClick={() => fetchTemplates(1)}
                            loading={tplLoading}
                          >
                            刷新
                          </Button>
                        </div>
                        <TemplateTable
                          templates={templates}
                          loading={tplLoading}
                          selectedId={selectedTemplate?.id}
                          onSelect={setSelectedTemplate}
                          onDoubleClick={(tpl) => {
                            setCurrentTpl(tpl);
                            setConfigOpen(true);
                          }}
                          showType={false}
                          pagination={{
                            current: tplPage,
                            pageSize: 10,
                            total: tplTotal,
                          }}
                          onPageChange={(p) => fetchTemplates(p)}
                        />
                      </div>
                    ),
                  },
                ]
              : []),
            {
              key: "other",
              label: "从其他产品导入",
              children: (
                <div>
                  <ProductSearchBar onSearch={handleSearch} loading={loading} />
                  <Table
                    style={{ marginTop: 16 }}
                    dataSource={list}
                    rowKey={(row) => row.item.id}
                    pagination={{
                      current: otherPage,
                      pageSize: 10,
                      total: otherTotal,
                    }}
                    loading={loading}
                    onChange={(p) => {
                      if (p.current) {
                        fetchOthers(p.current, searchField, searchKeyword);
                      }
                    }}
                    onRow={(record) => ({
                      onClick: () => setSelected(record),
                      onDoubleClick: () => {
                        setCurrentTpl(record.item);
                        setConfigOpen(true);
                      },
                      style: {
                        cursor: "pointer",
                        backgroundColor:
                          selected?.item.id === record.item.id
                            ? "#e6f4ff"
                            : undefined,
                      },
                    })}
                    columns={[
                      { title: "产品编号", dataIndex: ["item", "productCode"] },
                      { title: "产品名称", dataIndex: ["item", "productName"] },
                      { title: "客户", dataIndex: "customer" },
                      {
                        title: "适用原料",
                        dataIndex: "material",
                        render: (v: string[]) => v.join("/"),
                      },
                      { title: "行业", dataIndex: "industry" },
                      { title: "最终产品", dataIndex: "finalProduct" },
                      {
                        title: "下单日期",
                        dataIndex: "orderDate",
                        render: (d: string) =>
                          d ? new Date(d as any).toLocaleDateString() : "",
                      },
                    ]}
                  />
                </div>
              ),
            },
          ]}
        />
      </Modal>
      {!orderOnly && (
        <TemplateCreateModal
          open={createOpen}
          onClose={() => {
            setCreateOpen(false);
            fetchTemplates(1);
          }}
          formType={formType}
        />
      )}
      <TemplateConfigModal
        open={configOpen}
        template={currentTpl}
        onClose={() => {
          setConfigOpen(false);
          fetchTemplates(tplPage);
        }}
        readOnly
      />
    </>
  );
};

export default ImportProductModal;
