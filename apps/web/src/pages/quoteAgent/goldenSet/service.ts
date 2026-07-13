import { apiClient } from "@/api/http/client";
import type { GoldenLayer, GoldenTask } from "./types";
export const goldenSetService = {
  tasks: (layer: GoldenLayer) => apiClient.get("/productConfigAgent/golden-set/tasks", { params: { layer } }).then(r => r.data),
  next: (layer: GoldenLayer, id?: string) => apiClient.get(`/productConfigAgent/golden-set/tasks/${id || "next"}`, { params: { layer } }).then(r => r.data as GoldenTask),
  draft: (task: GoldenTask, annotation: unknown) => apiClient.put(`/productConfigAgent/golden-set/tasks/${task.sample_id}/draft`, { layer: task.layer, revision: task.revision, annotation }).then(r => r.data as GoldenTask),
  submit: (task: GoldenTask, annotation: unknown) => apiClient.post(`/productConfigAgent/golden-set/tasks/${task.sample_id}/submit`, { layer: task.layer, revision: task.revision, annotation }).then(r => r.data as GoldenTask),
  searchErp: (q: string) => apiClient.get("/productConfigAgent/golden-set/erp-search", { params: { q, page: 1, pageSize: 20 } }).then(r => r.data),
  adjudications: () => apiClient.get("/productConfigAgent/golden-set/adjudications").then(r => r.data),
};
