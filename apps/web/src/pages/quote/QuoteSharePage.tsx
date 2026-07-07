import React, { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Spin, Button, Watermark } from "@/components/ui/core";
import ProductConfigurationForm from "@/components/quote/productConfigForm/ProductConfigurationForm";
import { QuoteItem } from "@/types/types";
import { QuoteService } from "@/api/services/quote.service";

const QuoteSharePage: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const [search] = useSearchParams();
  const pwd = search.get("pwd") ?? "";
  const [data, setData] = useState<{
    quoteItem?: QuoteItem;
    quoteId?: number;
    editable?: boolean;
    shareUserId?: string;
    shareUserName?: string;
  }>();
  const formRef = useRef<{ modelForm?: any }>(null);

  useEffect(() => {
    const load = async () => {
      if (!uuid) return;
      try {
        const res = await QuoteService.getShare(uuid, pwd);
        setData(res);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [uuid, pwd]);
  useEffect(() => {
    if (!data?.quoteItem) return;
    let timer: number;
    const setFields = () => {
      if (!formRef.current?.modelForm) {
        timer = window.setTimeout(setFields, 100);
        return;
      }
      formRef.current?.modelForm?.setFieldsValue({
        ...(data.quoteItem?.config || {}),
      });
    };
    setFields();
    return () => window.clearTimeout(timer);
  }, [data?.quoteItem]);
  if (!data) return <Spin />;

  const handleSave = async (config: any) => {
    if (!uuid || !data.shareUserId || !config) return;
    try {
      await QuoteService.saveShare(uuid, data.shareUserId, { config });
    } catch (e) {
      console.error(e);
    }
  };

  const content = (
    <ProductConfigurationForm
      ref={formRef}
      quoteId={data.quoteId ?? 0}
      quoteItem={data.quoteItem}
      readOnly={!data.editable}
      showPrice={false}
    />
  );

  return (
    <Watermark content={`${data.shareUserName}`}>
      <div style={{ position: "relative", padding: "0 50px" }}>
        {content}
        {data.editable && (
          <Button
            type="primary"
            onClick={() =>
              handleSave(formRef.current?.modelForm?.getFieldsValue())
            }
          >
            保存
          </Button>
        )}
      </div>
    </Watermark>
  );
};

export default QuoteSharePage;
