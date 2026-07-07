// components/GlobalModal.tsx
import { Modal } from "@/components/ui/core";
import { modalStore } from "../store/modalStore";

export const GlobalModal = () => {
  const { isOpen, title, content, onOk, onCancel, closeModal, isLoading } =
    modalStore();

  const handleOk = async () => {
    await onOk?.();
    closeModal();
  };

  const handleCancel = () => {
    onCancel?.();
    closeModal();
  };

  return (
    <Modal
      // style={{ zIndex: 99999 }}
      zIndex={1300}
      open={isOpen}
      title={title}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isLoading}
      // loading={isLoading}
    >
      {content}
    </Modal>
  );
};
