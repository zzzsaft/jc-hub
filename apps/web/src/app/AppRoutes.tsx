import { lazy } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { GlobalModal } from "@/components/GlobalModal";
import PermissionRoute from "@/components/general/PermissionRoute";
import { LegacyRedirect } from "./routeRedirects";

const AdminLayout = lazy(() => import("@/components/layout/AdminLayout"));
const AgentLayout = lazy(() => import("@/components/layout/AgentLayout"));
const MobileLayout = lazy(() => import("@/components/layout/MobileLayout"));
const AgentChatPlaceholderPage = lazy(() => import("@/pages/agent/AgentChatPlaceholderPage"));
const CandidateClusterReviewPage = lazy(() => import("@/pages/quoteAgent/CandidateClusterReviewPage"));
const ConceptResolverReviewPage = lazy(() => import("@/pages/quoteAgent/conceptResolver"));
const ErpSqlAccessPoliciesPage = lazy(() => import("@/pages/erpSqlAccessPolicies"));
const ExternalContactBindingPage = lazy(() => import("@/pages/externalContact"));
const HistoryQuoteTablePage = lazy(() => import("@/pages/quote/HistoryQuoteTablePage"));
const HomePage = lazy(() => import("@/pages/home"));
const JdyRedirect = lazy(() => import("@/pages/JdyRedirect"));
const PermissionManagementPage = lazy(() => import("@/pages/permissions/PermissionManagementPage"));
const NoPermissionPage = lazy(() => import("@/pages/NoPermissionPage").then((module) => ({ default: module.NoPermissionPage })));
const OAQuoteTablePage = lazy(() => import("@/pages/quote/OAQuoteTablePage"));
const QuoteAgentArchivePage = lazy(() => import("@/pages/quoteAgent/archive"));
const QuoteAgentReviewPage = lazy(() => import("@/pages/quoteAgent"));
const QuoteAgentDictionaryPage = lazy(() => import("@/pages/quoteAgentDictionary"));
const QuoteFormPage = lazy(() => import("@/pages/quote/QuoteFormPage"));
const PurchaseApplyPage = lazy(() => import("@/pages/purchaseApply"));
const TemplateListPage = lazy(() => import("@/pages/template/TemplateListPage"));
const TodoQuoteTablePage = lazy(() => import("@/pages/quote/TodoQuoteTablePage"));
const WorkPlaceholderPage = lazy(() => import("@/pages/work/WorkPlaceholderPage"));

export default function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />

        <Route path="/agent" element={<AgentLayout />}>
          <Route index element={<Navigate to="/agent/chat" replace />} />
          <Route path="chat" element={<AgentChatPlaceholderPage />} />
          <Route path="archive/*" element={<QuoteAgentArchivePage />} />
          <Route path="review" element={<QuoteAgentReviewPage />} />
          <Route path="review/:documentId" element={<QuoteAgentReviewPage />} />
          <Route path="clusters" element={<CandidateClusterReviewPage />} />
          <Route path="concept-resolver" element={<ConceptResolverReviewPage />} />
          <Route path="dictionary" element={<QuoteAgentDictionaryPage />} />
        </Route>

        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/quote/history" replace />} />
          <Route element={<PermissionRoute permission="admin.external-contact:view" />}>
            <Route path="external-contact" element={<ExternalContactBindingPage />} />
          </Route>
          <Route element={<PermissionRoute permission="admin.employees:view" />}>
            <Route path="employees" element={<PermissionManagementPage />} />
          </Route>
          <Route path="permissions" element={<Navigate to="/admin/employees" replace />} />
          <Route path="quote" element={<Outlet />}>
            <Route index element={<Navigate to="/admin/quote/history" replace />} />
            <Route element={<PermissionRoute permission="admin.quote:view" />}>
              <Route path="history" element={<HistoryQuoteTablePage />} />
              <Route path="oa" element={<OAQuoteTablePage />} />
              <Route path="todo" element={<TodoQuoteTablePage />} />
              <Route path=":id" element={<QuoteFormPage />} />
            </Route>
          </Route>
          <Route element={<PermissionRoute permission="admin.purchase.apply:view" />}>
            <Route path="purchase/apply" element={<PurchaseApplyPage />} />
          </Route>
          <Route element={<PermissionRoute permission="agent.erp-sql.access-policy:view" />}>
            <Route path="erp-sql/access-policies" element={<ErpSqlAccessPoliciesPage />} />
          </Route>
          <Route element={<PermissionRoute permission="admin.template:view" />}>
            <Route path="template" element={<TemplateListPage />} />
          </Route>
        </Route>

        <Route path="/work" element={<MobileLayout />}>
          <Route index element={<Navigate to="/work/claim" replace />} />
          <Route element={<PermissionRoute permission="work.claim:view" />}>
            <Route path="claim" element={<WorkPlaceholderPage />} />
          </Route>
          <Route element={<PermissionRoute permission="work.operations:view" />}>
            <Route path="operations" element={<WorkPlaceholderPage />} />
          </Route>
          <Route element={<PermissionRoute permission="work.stats:view" />}>
            <Route path="stats" element={<WorkPlaceholderPage />} />
          </Route>
          <Route element={<PermissionRoute permission="work.me:view" />}>
            <Route path="me" element={<WorkPlaceholderPage />} />
          </Route>
        </Route>

        <Route path="/jdy_redirect" element={<JdyRedirect />} />
        <Route path="/error/no-permission" element={<NoPermissionPage />} />

        <Route path="/external_contact" element={<LegacyRedirect to="/admin/external-contact" />} />
        <Route path="/quote-agent/review/*" element={<LegacyRedirect from="/quote-agent/review" to="/agent/review" />} />
        <Route path="/quote-agent/clusters" element={<LegacyRedirect from="/quote-agent/clusters" to="/agent/clusters" />} />
        <Route path="/quote-agent/concept-resolver/*" element={<LegacyRedirect from="/quote-agent/concept-resolver" to="/agent/concept-resolver" />} />
        <Route path="/quote-agent/dictionary/*" element={<LegacyRedirect from="/quote-agent/dictionary" to="/agent/dictionary" />} />
        <Route path="/quote-agent/*" element={<LegacyRedirect from="/quote-agent" to="/agent/archive" />} />
        <Route path="/quote" element={<LegacyRedirect to="/admin/quote/history" />} />
        <Route path="/quote/history/*" element={<LegacyRedirect from="/quote/history" to="/admin/quote/history" />} />
        <Route path="/quote/oa/*" element={<LegacyRedirect from="/quote/oa" to="/admin/quote/oa" />} />
        <Route path="/quote/todo/*" element={<LegacyRedirect from="/quote/todo" to="/admin/quote/todo" />} />
        <Route path="/quote/:id" element={<LegacyRedirect from="/quote" to="/admin/quote" />} />
        <Route path="/template/*" element={<LegacyRedirect to="/admin/template" />} />
      </Routes>
      <GlobalModal />
    </>
  );
}
