import DieForm from "@/components/quoteForm/dieForm/DieForm";
import FeedblockForm from "@/components/quoteForm/feedblockForm/FeedblockForm";
import FilterForm from "@/components/quoteForm/filterForm/FilterForm";
import HydraulicStationForm from "@/components/quoteForm/hydraulicStationForm/HydraulicStationForm";
import MeteringPumpForm from "@/components/quoteForm/meteringPumpForm/MeteringPumpForm";
import ManifoldForm from "@/components/quoteForm/manifoldForm/ManifoldForm";
import { OtherForm } from "@/components/quoteForm/OtherForm";
import PartsForm from "@/components/quoteForm/PartsForm";
import SmartRegulator from "@/components/quoteForm/SmartRegulator";
import ThicknessGaugeForm from "@/components/quoteForm/thicknessGaugeForm/ThicknessGaugeForm";
import CoatingDieForm from "@/components/quoteForm/coatingDieForm/CoatingDieForm";
import React, { RefObject } from "react";
import { getFormType } from "./formType";

export type ModelFormRef = RefObject<{ form: any } | null>;
export { getFormType };

export function getFormByCategory(
  category: string[] | undefined | null,
  quoteId: number,
  quoteItemId: number,
  modelFormRef: ModelFormRef,
  formTypeOverride?: string,
  readOnly?: boolean
): { form: React.ReactNode; formType: string } {
  const formType = formTypeOverride || getFormType(category);
  if (formType === "DieForm")
    return {
      form: (
        <DieForm
          quoteItemId={quoteItemId}
          quoteId={quoteId}
          ref={modelFormRef}
          readOnly={readOnly}
        />
      ),
      formType,
    };
  if (formType === "SmartRegulator")
    return {
      form: (
        <SmartRegulator
          ref={modelFormRef}
          quoteId={quoteId}
          quoteItemId={quoteItemId}
          readOnly={readOnly}
        />
      ),
      formType,
    };
  if (formType === "MeteringPumpForm")
    return {
      form: (
        <MeteringPumpForm
          ref={modelFormRef}
          quoteId={quoteId}
          quoteItemId={quoteItemId}
          readOnly={readOnly}
        />
      ),
      formType,
    };
  if (formType === "FeedblockForm")
    return {
      form: (
        <FeedblockForm
          ref={modelFormRef}
          quoteId={quoteId}
          quoteItemId={quoteItemId}
          readOnly={readOnly}
        />
      ),
      formType,
    };
  if (formType === "ManifoldForm")
    return {
      form: (
        <ManifoldForm
          ref={modelFormRef}
          quoteId={quoteId}
          quoteItemId={quoteItemId}
          readOnly={readOnly}
        />
      ),
      formType,
    };
  if (formType === "FilterForm")
    return {
      form: (
        <FilterForm
          ref={modelFormRef}
          quoteId={quoteId}
          quoteItemId={quoteItemId}
          readOnly={readOnly}
        />
      ),
      formType,
    };
  if (formType === "ThicknessGaugeForm")
    return {
      form: (
        <ThicknessGaugeForm
          ref={modelFormRef}
          quoteId={quoteId}
          quoteItemId={quoteItemId}
          readOnly={readOnly}
        />
      ),
      formType,
    };
  if (formType === "HydraulicStationForm")
    return {
      form: (
        <HydraulicStationForm
          ref={modelFormRef}
          quoteId={quoteId}
          quoteItemId={quoteItemId}
          readOnly={readOnly}
        />
      ),
      formType,
    };
  if (formType === "CoatingDieForm")
    return {
      form: (
        <CoatingDieForm
          ref={modelFormRef}
          quoteId={quoteId}
          quoteItemId={quoteItemId}
          readOnly={readOnly}
        />
      ),
      formType,
    };
  if (formType === "PartsForm")
    return {
      form: <PartsForm ref={modelFormRef} readOnly={readOnly} />,
      formType,
    };
  return {
    form: <OtherForm ref={modelFormRef} readOnly={readOnly} />,
    formType,
  };
}
