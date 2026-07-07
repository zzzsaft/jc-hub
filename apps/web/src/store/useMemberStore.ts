import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { UserService } from "../api/services/user.service";
import { throttle } from "lodash-es";

interface Member {
  id: string;
  name: string;
  is_employed: boolean;
  avatar: string;
  department: string;
}

interface MemberState {
  members: Member[];
  isLoading: boolean;
  error: string | null;
  fetchMembers: () => Promise<void>;
  getMember: (id: string) => Promise<Member | undefined>;
}

export const useMemberStore = create<MemberState>()(
  immer((set, get) => ({
    members: [],
    isLoading: false,
    error: null,

    fetchMembers: throttle(async () => {
      if (get().members.length !== 0) return;
      set({ isLoading: true, error: null });
      try {
        const members = await UserService.getUsers();
        set({ members, isLoading: false });
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : "Failed to fetch members",
          isLoading: false,
        });
      }
    }, 1000), // 1000ms 节流时间

    getMember: async (id) => {
      // 先从现有成员中查找
      const existingMember = get().members.find((m) => m.id === id);
      if (existingMember) return existingMember;

      // 如果没有找到，尝试获取最新数据
      try {
        await get().fetchMembers();
        return get().members.find((m) => m.id === id);
      } catch {
        return undefined;
      }
    },
  }))
);
