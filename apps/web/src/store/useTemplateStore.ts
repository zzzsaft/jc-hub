import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { TemplateService } from "../api/services/template.service";
import { QuoteTemplate } from "../types/types";

interface TemplateState {
  templates: QuoteTemplate[];
  loading: boolean;
  fetchTemplates: (formType?: string) => Promise<void>;
  refreshTemplates: (formType?: string) => Promise<void>;
}

export const useTemplateStore = create<TemplateState>()(
  immer((set, get) => ({
    templates: [],
    loading: false,
    fetchTemplates: async (formType?: string) => {
      if (get().templates.length !== 0) return;
      await get().refreshTemplates(formType);
    },
    refreshTemplates: async (formType?: string) => {
      set({ loading: true });
      const { list } = await TemplateService.getTemplates({ formType });
      set({ templates: list, loading: false });
    },
  }))
);
