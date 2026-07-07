// store/useQuoteStore.ts
import { create } from "zustand";
import { OpportunityService } from "../api/services/opportunity.service";
import { throttle } from "lodash-es";

import { ProductCategory, Quote, QuoteItem, FilterProduct } from "../types/types";

import { immer } from "zustand/middleware/immer";

interface Pump {
  model: string;
  pumpage: string;
  heatingPower: string;
  rotateSpeed: string;
  shearSensitivity: string;
  production: string;
  remark: string;
}

interface ProductStore {
  loading: boolean;
  categories: ProductCategory[];
  pump: Pump[];
  filter: FilterProduct[];
  configModalVisible: boolean;
  initialize: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchPump: () => Promise<void>;
  fetchFilter: () => Promise<void>;
}

export const useProductStore = create<ProductStore>()(
  immer((set, get) => ({
    pump: [],
    filter: [],
    categories: [],
    loading: false,
    configModalVisible: false,

    initialize: async () => {
      const categories = await OpportunityService.getProductCategory();
      set({ categories });
    },

    fetchCategories: throttle(async () => {
      set({ loading: true });
      const categories = await OpportunityService.getProductCategory();
      set({ categories, loading: false });
    }, 1000),

    fetchPump: throttle(async () => {
      set({ loading: true });
      const pump = await OpportunityService.getProductPump();
      set({ pump, loading: false });
    }, 1000),

    fetchFilter: throttle(async () => {
      set({ loading: true });
      const filter = await OpportunityService.getProductFilter();
      set({ filter, loading: false });
    }, 1000),
  }))
);
