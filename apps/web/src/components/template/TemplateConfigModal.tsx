import React, { useRef, useState } from "react";
import { Modal, Button } from "@/components/ui/core";
import { FormInstance } from "@/components/ui/core";
import ProductConfigurationForm from "../quote/productConfigForm/ProductConfigurationForm";
import { QuoteTemplate, QuoteItem } from "../../types/types";
import { TemplateService } from "../../api/services/template.service";
import { useTemplateStore } from "../../store/useTemplateStore";

interface TemplateConfigModalProps {
  open: boolean;
  template: QuoteTemplate | QuoteItem | null;
  readOnly?: boolean;
  onClose: () => void;
}

const isQuoteTemplate = (
  tpl: QuoteTemplate | QuoteItem
): tpl is QuoteTemplate => {
  return (tpl as QuoteTemplate)?.creatorId !== undefined;
};

const TemplateConfigModal: React.FC<TemplateConfigModalProps> = ({
  open,
  template,
  readOnly = false,
  onClose,
}) => {
  const formRef = useRef<{ modelForm: FormInstance }>(null);
  const [saving, setSaving] = useState(false);
  const refreshTemplates = useTemplateStore((s) => s.refreshTemplates);

  const handleSave = async () => {
    if (!template || readOnly || !isQuoteTemplate(template)) return;
    const values = await formRef.current?.modelForm?.validateFields();
    setSaving(true);
    try {
      await TemplateService.updateTemplate(template.id, { config: values });
      await refreshTemplates();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      width={800}
      zIndex={2000}
      onCancel={onClose}
      destroyOnHidden
      forceRender
      footer={
        readOnly
          ? null
          : [
              <Button key="cancel" onClick={onClose}>
                取消
              </Button>,
              <Button
                key="save"
                type="primary"
                onClick={handleSave}
                loading={saving}
              >
                保存
              </Button>,
            ]
      }
    >
      <ProductConfigurationForm
        quoteId={0}
        quoteItem={template as any}
        formType={
          (template as any)?.templateType || (template as any)?.formType
        }
        showPrice={false}
        readOnly={readOnly}
        ref={readOnly ? undefined : (formRef as any)}
        quoteTemplate={template as any}
      />
    </Modal>
  );
};

export default TemplateConfigModal;
