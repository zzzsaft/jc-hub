import React, { useRef, useState } from "react";
import { Modal, Button } from "@/components/ui/core";
import TemplateCreate, { TemplateCreateRef } from "./TemplateCreate";
import { TemplateService } from "@/api/services/template.service";
import { useTemplateStore } from "@/store/useTemplateStore";

interface TemplateCreateModalProps {
  open: boolean;
  onClose: () => void;
  formType?: string;
}

const TemplateCreateModal: React.FC<TemplateCreateModalProps> = ({
  open,
  onClose,
  formType,
}) => {
  const ref = useRef<TemplateCreateRef>(null);
  const refresh = useTemplateStore((s) => s.refreshTemplates);
  const [saving, setSaving] = useState(false);

  const handleOk = async () => {
    if (!ref.current) return;
    const data = await ref.current.getData();
    setSaving(true);
    try {
      await TemplateService.createTemplate(data);
      await refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      zIndex={1600}
      title="创建模版"
      onCancel={onClose}
      width={700}
      afterClose={() => ref.current?.reset()}
      destroyOnHidden
      forceRender
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="ok" type="primary" onClick={handleOk} loading={saving}>
          保存
        </Button>,
      ]}
    >
      <TemplateCreate
        ref={ref}
        formType={formType}
        initialValues={{ templateType: formType }}
      />
    </Modal>
  );
};

export default TemplateCreateModal;
