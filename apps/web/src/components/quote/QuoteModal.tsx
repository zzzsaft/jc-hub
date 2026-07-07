// components/quote/QuoteModal.tsx
import React, { useEffect, useState } from "react";
import { Modal, Button, Form, App } from "@/components/ui/core";
import { FullscreenOutlined, FullscreenExitOutlined } from "@/components/ui/icons";
import QuoteForm from "./QuoteForm";
import type { Quote } from "@/types/types";
import { useQuoteStore } from "@/store/useQuoteStore";
import dayjs from "dayjs";
import { Skeleton } from "@/components/ui/core";
interface QuoteModalProps {
  visible: boolean;
  initialValues?: Quote;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

const QuoteModal: React.FC<QuoteModalProps> = ({
  visible,
  initialValues,
  loading,
  onCancel,
  onSubmit,
}) => {
  const { message, modal } = App.useApp();
  const { isQuoteDirty, saveQuote, discardQuoteChanges, dirtyQuotes } =
    useQuoteStore();
  const [form] = Form.useForm();
  const [isFullscreen, setIsFullscreen] = useState(false);

  // const handleOk = async () => {
  //   try {
  //     // const values = await form.validateFields();
  //     await onOk(values);
  //   } catch (error) {
  //     message.error("表单验证失败，请检查输入");
  //   }
  // };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleCancel = () => {
    const id = initialValues?.id;
    if (id && isQuoteDirty(id)) {
      modal.confirm({
        title: "存在未保存的更改，是否暂存？",
        okText: "暂存",
        cancelText: "不保存",
        onOk: async () => {
          await saveQuote(id);
          onCancel();
        },
        onCancel: () => {
          discardQuoteChanges(id);
          onCancel();
        },
      });
    } else {
      onCancel();
    }
  };

  useEffect(() => {
    if (visible && initialValues) {
      form.setFieldsValue({
        ...initialValues,
        quoteTime: initialValues.quoteTime
          ? dayjs(initialValues.quoteTime)
          : null,
        customerName: {
          name: initialValues.customerName,
          value: initialValues.customerName,
          id: initialValues.customerId,
        },
      });
    }
  }, [initialValues]);

  return (
    <Modal
      title={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            marginRight: 40, // 为关闭按钮预留空间
          }}
        >
          <span>
            {initialValues?.opportunityName ||
              (initialValues ? "编辑报价单" : "新建报价单")}
          </span>
          <Button
            type="text"
            icon={
              isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />
            }
            onClick={toggleFullscreen}
            style={{
              position: "absolute",
              right: 50, // 放置在关闭按钮左侧
              top: 12,
              zIndex: 1,
            }}
          />
        </div>
      }
      width={isFullscreen ? "100%" : "90%"}
      style={{
        ...(isFullscreen
          ? { top: 0, padding: 0 }
          : { top: 20, maxWidth: "min(700px, 90vw)" }),
      }}
      styles={
        isFullscreen
          ? { body: { height: "calc(100vh - 55px)", overflowY: "auto" } }
          : {}
      }
      open={visible}
      //   onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      footer={null}
      //   footer={[
      //     <Button key="back" onClick={onCancel}>
      //       取消
      //     </Button>,
      //     <Button
      //       key="submit"
      //       type="primary"
      //       loading={loading}
      //       onClick={onSubmit}
      //     >
      //       提交
      //     </Button>,
      //   ]}
      destroyOnHidden
      maskClosable={false} // 禁止点击遮罩层关闭
      keyboard={false} // 禁止ESC键关闭
    >
      {loading ? (
        <div style={{ padding: 24 }}>
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      ) : (
        <QuoteForm
          form={form}
          quoteId={initialValues?.id}
          onSubmit={onSubmit}
          isModal
        />
      )}
    </Modal>
  );
};

export default QuoteModal;
