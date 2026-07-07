import React, { useEffect, useState } from "react";
import { Button, App } from "@/components/ui/core";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import ProductConfigurationForm from "@/components/quote/productConfigForm/ProductConfigurationForm";
import { QuoteTemplate } from "@/types/types";
import { useTemplateStore } from "@/store/useTemplateStore";
import { TemplateService } from "@/api/services/template.service";

const TemplateFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<QuoteTemplate | null>(null);
  const { refreshTemplates } = useTemplateStore();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const formTypeParam = searchParams.get("formType") || undefined;

  useEffect(() => {
    if (!id) {
      setTemplate(null);
      return;
    }
    (async () => {
      const data = await TemplateService.getTemplate(id);
      setTemplate(data);
    })();
  }, [id]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (id) {
        await TemplateService.updateTemplate(id, template as any);
      } else {
        await TemplateService.createTemplate(template as any);
      }
      await refreshTemplates();
      message.success("保存成功");
      navigate("/admin/template");
    } catch (err) {
      console.error(err);
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <ProductConfigurationForm
        quoteId={0}
        quoteItem={template as any}
        showPrice={false}
        formType={formTypeParam || template?.templateType}
      />
      <div style={{ marginTop: 16 }}>
        <Button type="primary" onClick={handleSubmit} loading={saving}>
          保存
        </Button>
      </div>
    </div>
  );
};

export default TemplateFormPage;
