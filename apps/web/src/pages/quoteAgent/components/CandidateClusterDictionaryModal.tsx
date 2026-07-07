import { Modal } from "@/components/ui/core";
import { DatabaseOutlined } from "@/components/ui/icons";
import { QuoteAgentDictionaryManager } from "../../quoteAgentDictionary";

type CandidateClusterDictionaryModalProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
};

export function CandidateClusterDictionaryModal({ open, onOpen, onClose }: CandidateClusterDictionaryModalProps) {
  return (
    <>
      <button
        aria-label="打开字典管理"
        className="qa-floating-dictionary-button"
        type="button"
        onClick={onOpen}
      >
        <DatabaseOutlined className="qa-floating-dictionary-icon" />
        <span className="qa-floating-dictionary-label">字典管理</span>
      </button>
      <Modal
        open={open}
        title="字典管理"
        width={1180}
        footer={null}
        bodyClassName="p-0"
        maskClosable
        onCancel={onClose}
      >
        <QuoteAgentDictionaryManager embedded />
      </Modal>
    </>
  );
}

