import React, { useState } from "react";
import { Modal, Button } from "@/components/ui/core";
import ProductConfigurationForm from "../quote/productConfigForm/ProductConfigurationForm";
import { QuoteTemplate } from "@/types/types";
import { useTemplateStore } from "@/store/useTemplateStore";
import { TemplateService } from "@/api/services/template.service";

interface TemplateFormModalProps {
  open: boolean;
  onClose: () => void;
  readOnly?: boolean;
}

const TemplateFormModal: React.FC<TemplateFormModalProps> = ({
  open,
  onClose,
  readOnly = false,
}) => {
  const [template, setTemplate] = useState<QuoteTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const refresh = useTemplateStore((s) => s.refreshTemplates);

  const handleOk = async () => {
    setSaving(true);
    try {
      await TemplateService.createTemplate(template as any);
      await refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="创建模版"
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="ok" type="primary" onClick={handleOk} loading={saving}>
          保存
        </Button>,
      ]}
      width={800}
      destroyOnHidden
      forceRender
    >
      <ProductConfigurationForm
        quoteId={0}
        quoteItem={template as any}
        showPrice={false}
        readOnly={readOnly}
      />
    </Modal>
  );
};

export default TemplateFormModal;
