import React, { useEffect, useState } from "react";

import { Button, App } from "@/components/ui/core";
import { QuoteTemplate } from "../../types/types";
import { useTemplateStore } from "../../store/useTemplateStore";
import TemplateTable from "../../components/template/TemplateTable";
import TemplateCreateModal from "../../components/template/TemplateCreateModal";
import TemplateConfigModal from "../../components/template/TemplateConfigModal";
import { useAuthStore } from "../../store/useAuthStore";
import { TemplateService } from "../../api/services/template.service";

const TemplateListPage: React.FC = () => {
  const { templates, loading, refreshTemplates, fetchTemplates } =
    useTemplateStore();
  const { userid } = useAuthStore();
  const { message, modal } = App.useApp();

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const [open, setOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [currentTpl, setCurrentTpl] = useState<QuoteTemplate | null>(null);

  const handleEdit = (tpl: QuoteTemplate) => {
    setCurrentTpl(tpl);
    setConfigOpen(true);
  };

  const handleDelete = async (tpl: QuoteTemplate) => {
    modal.confirm({
      title: "确认删除该模版？",
      okText: "删除",
      cancelText: "取消",
      onOk: async () => {
        await TemplateService.deleteTemplate(tpl.id);
        await refreshTemplates();
        message.success("删除成功");
      },
    });
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => setOpen(true)}>
          创建模版
        </Button>
        <Button style={{ marginLeft: 8 }} onClick={() => refreshTemplates()}>
          刷新
        </Button>
      </div>
      <TemplateTable
        templates={templates}
        loading={loading}
        onDoubleClick={(tpl) => handleEdit(tpl)}
        actionRender={(tpl) =>
          tpl.creatorId === userid ? (
            <>
              <Button type="link" onClick={() => handleEdit(tpl)}>
                编辑
              </Button>
              <Button type="link" danger onClick={() => handleDelete(tpl)}>
                删除
              </Button>
            </>
          ) : null
        }
      />
      <TemplateCreateModal open={open} onClose={() => setOpen(false)} />
      <TemplateConfigModal
        open={configOpen}
        template={currentTpl}
        onClose={() => setConfigOpen(false)}
        readOnly={currentTpl?.creatorId !== userid}
      />
    </div>
  );
};

export default TemplateListPage;
