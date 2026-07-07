import { Navigate, Route, Routes } from "react-router-dom";
import { ArchiveDetailPage } from "./components/ArchiveDetailPage";
import { ContractDashboardPage } from "./components/ContractDashboardPage";
import { ContractDetailPage } from "./components/ContractDetailPage";
import { ProductConfigSearchPage } from "./components/ProductConfigSearchPage";
import "../styles.css";

export default function QuoteAgentArchivePage() {
  return (
    <Routes>
      <Route index element={<ContractDashboardPage />} />
      <Route path="contracts/:documentId" element={<ContractDetailPage />} />
      <Route path="archives/:archiveId" element={<ArchiveDetailPage />} />
      <Route path="product-configs" element={<ProductConfigSearchPage />} />
      <Route path="*" element={<Navigate to="/agent/archive" replace />} />
    </Routes>
  );
}
