import { AdmissionDecisionForm } from "./components/AdmissionDecisionForm";
import { ChineseEvidenceCard } from "./components/ChineseEvidenceCard";
import { ConfigFieldsForm } from "./components/ConfigFieldsForm";
import { ErpIdentityForm } from "./components/ErpIdentityForm";
import { MobileActionBar } from "./components/MobileActionBar";
import { PackageItemsForm } from "./components/PackageItemsForm";
import { ReviewHeader } from "./components/ReviewHeader";
import { useFullReviewState } from "./hooks/useFullReviewState";
import "./styles.css";

export default function FullReviewWorkbenchPage() {
  const state = useFullReviewState();
  if (state.loading) return <main className="full-review-status">正在加载复核任务…</main>;
  if (!state.task) return <main className="full-review-status"><h1>无法加载任务</h1>{state.errors.map((error) => <p key={error}>{error}</p>)}<button type="button" onClick={state.skip}>重新加载</button></main>;
  return <main className="full-review-workbench"><ReviewHeader task={state.task} /><div className="full-review-layout"><ChineseEvidenceCard evidence={state.task.evidence} /><section className="full-review-form" aria-label="人工标注表单"><PackageItemsForm value={state.annotation.package} evidence={state.task.evidence} onChange={state.updatePackage} /><ConfigFieldsForm value={state.annotation.configuration_fields} items={state.annotation.package.items} evidence={state.task.evidence} onChange={state.updateConfigurationFields} /><ErpIdentityForm value={state.annotation.erp} items={state.annotation.package.items} evidence={state.task.evidence} onChange={state.updateErp} /><AdmissionDecisionForm value={state.annotation.admission} onChange={state.updateAdmission} />{state.errors.length > 0 && <section className="full-review-errors" aria-live="assertive"><h2>请检查以下内容</h2><ul>{state.errors.map((error) => <li key={error}>{error}</li>)}</ul></section>}</section></div><MobileActionBar saveState={state.saveState} onSkip={state.skip} onSubmit={() => { void state.submit(); }} /></main>;
}
