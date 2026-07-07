import React, { useEffect, useRef, useState } from "react";
import { Button, App } from "@/components/ui/core";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import TemplateCreate, { TemplateCreateRef } from "@/components/template/TemplateCreate";
import { TemplateService } from "@/api/services/template.service";
import { useTemplateStore } from "@/store/useTemplateStore";
import { QuoteTemplate } from "@/types/types";

const TemplateCreatePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const fixedType = searchParams.get("formType") || undefined;
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { refreshTemplates } = useTemplateStore();
  const ref = useRef<TemplateCreateRef>(null);
  const [initial, setInitial] = useState<QuoteTemplate | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) {
      TemplateService.getTemplate(id).then(setInitial);
    } else {
      setInitial(undefined);
    }
  }, [id]);

  const handleSave = async () => {
    if (!ref.current) return;
    const data = await ref.current.getData();
    setSaving(true);
    try {
      if (id) {
        await TemplateService.updateTemplate(id, data);
      } else {
        await TemplateService.createTemplate(data);
      }
      await refreshTemplates();
      message.success("保存成功");
      navigate("/admin/template");
    } catch (e) {
      console.error(e);
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <TemplateCreate ref={ref} initialValues={initial} formType={fixedType} />
      <div style={{ marginTop: 16 }}>
        <Button type="primary" onClick={handleSave} loading={saving}>
          保存
        </Button>
      </div>
    </div>
  );
};

export default TemplateCreatePage;
