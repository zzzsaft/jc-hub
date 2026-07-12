import { apiClient } from "@/api/http/client";
import type { FullReviewAnnotation, FullReviewTask, FullReviewTasksResponse, RevisionResponse } from "./types";

export const fullReviewService = {
  next: () => apiClient.get("/productConfigAgent/golden-set-v2/tasks").then((response) => {
    const data = response.data as FullReviewTasksResponse;
    const next = data.items.find((item) => item.submission === null);
    if (!next) throw new Error("没有待审核任务");
    const { draft, submission: _submission, ...packet } = next;
    return { ...packet, annotation: draft, revision: data.revision };
  }),
  draft: (task: FullReviewTask, annotation: FullReviewAnnotation) =>
    apiClient.put(`/productConfigAgent/golden-set-v2/tasks/${task.document_id}/draft`, { revision: task.revision, annotation }).then((response) => response.data as RevisionResponse),
  submit: (task: FullReviewTask, annotation: FullReviewAnnotation) =>
    apiClient.post(`/productConfigAgent/golden-set-v2/tasks/${task.document_id}/submit`, { revision: task.revision, annotation }).then((response) => response.data as RevisionResponse),
};
