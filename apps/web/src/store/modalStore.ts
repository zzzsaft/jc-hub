// store/modalStore.ts
import { create } from "zustand";

type ModalState = {
  isOpen: boolean;
  title: string;
  isLoading: boolean;
  content: React.ReactNode;
  onOk?: () => Promise<void>;
  onCancel?: () => void;
};

type ModalActions = {
  openModal: (config: Omit<Omit<ModalState, "isOpen">, "isLoading">) => void;
  closeModal: () => void;
  setIsLoading: (loading: boolean) => void;
};

export const modalStore = create<ModalState & ModalActions>((set) => ({
  isOpen: false,
  title: "",
  content: null,
  onOk: undefined,
  onCancel: undefined,
  isLoading: false,
  openModal: (config) => set({ isOpen: true, ...config }),
  closeModal: () => set({ isOpen: false }),
  setIsLoading: (loading) => set({ isLoading: loading }),
}));
