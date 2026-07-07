import { useEffect, useRef } from "react";
import type { NavigateFunction } from "react-router-dom";
import type {
  Candidate,
  ExtractionDetail,
} from "../types";

type UseQuoteAgentRouteSyncParams = {
  navigate: NavigateFunction;
  routeDocumentId: string;
  selectedDocumentId: string | number;
  setActiveFieldKey: (value: string) => void;
  setCandidates: (value: Candidate[]) => void;
  setDetail: (value: ExtractionDetail | null) => void;
  setExpandedFieldKey: (value: string) => void;
  setSelectedDocumentId: (value: string | number) => void;
};

export function useQuoteAgentRouteSync({
  navigate,
  routeDocumentId,
  selectedDocumentId,
  setActiveFieldKey,
  setCandidates,
  setDetail,
  setExpandedFieldKey,
  setSelectedDocumentId,
}: UseQuoteAgentRouteSyncParams) {
  const previousRouteDocumentIdRef = useRef(routeDocumentId);

  useEffect(() => {
    if (routeDocumentId === previousRouteDocumentIdRef.current) return;
    previousRouteDocumentIdRef.current = routeDocumentId;
    setSelectedDocumentId(routeDocumentId);
    setDetail(null);
    setCandidates([]);
    setActiveFieldKey("");
    setExpandedFieldKey("");
  }, [routeDocumentId, setActiveFieldKey, setCandidates, setDetail, setExpandedFieldKey, setSelectedDocumentId]);

  useEffect(() => {
    if (!selectedDocumentId || String(selectedDocumentId) === String(routeDocumentId)) return;
    navigate(`/agent/review/${selectedDocumentId}`);
  }, [navigate, routeDocumentId, selectedDocumentId]);
}
