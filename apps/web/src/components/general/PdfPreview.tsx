import React, { useEffect, useState } from "react";

import { Modal } from "@/components/ui/core";


interface PdfPreviewProps {
  open: boolean;
  blob: Blob | null;
  onClose: () => void;
  fileName?: string;
}

const PdfPreview: React.FC<PdfPreviewProps> = ({
  open,
  blob,
  onClose,
  fileName = "file.pdf",
}) => {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (blob) {
      const objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    }
  }, [blob]);

  return (
    <Modal
      open={open}
      footer={null}
      onCancel={onClose}
      width="100%"
      style={{ top: 0, padding: 0 }}
      styles={{ body: { height: "100vh" } }}
      destroyOnHidden
    >
      <div style={{ position: "relative", height: "100%" }}>
        {url && (
          <iframe
            src={url}
            title="PDF Preview"
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        )}
      </div>
    </Modal>
  );
};

export default PdfPreview;
