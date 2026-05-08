import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@/api/auth";

interface AuthState {
  user: AuthUser | null;
  hydrated: boolean;
  setHydrated: (hydrated: boolean) => void;
  setUser: (user: AuthUser | null) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hydrated: false,
      setHydrated: (hydrated) => set({ hydrated }),
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),
    }),
    {
      name: "auth-store",
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
