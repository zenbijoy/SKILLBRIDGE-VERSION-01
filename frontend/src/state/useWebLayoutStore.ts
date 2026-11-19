import { create } from "zustand";

interface WebLayoutState {
  isNavbarVisible: boolean;
  isLeftSidebarVisible: boolean;
  isRightSidebarVisible: boolean;
  isFocusMode: boolean;
  toggleNavbar: () => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  toggleFocusMode: () => void;
  setNavbarVisible: (visible: boolean) => void;
  setLeftSidebarVisible: (visible: boolean) => void;
  setRightSidebarVisible: (visible: boolean) => void;
  resetLayout: () => void;
}

export const useWebLayoutStore = create<WebLayoutState>((set) => ({
  isNavbarVisible: true,
  isLeftSidebarVisible: true,
  isRightSidebarVisible: true,
  isFocusMode: false,

  toggleNavbar: () =>
    set((state) => ({ isNavbarVisible: !state.isNavbarVisible })),

  toggleLeftSidebar: () =>
    set((state) => ({ isLeftSidebarVisible: !state.isLeftSidebarVisible })),

  toggleRightSidebar: () =>
    set((state) => ({ isRightSidebarVisible: !state.isRightSidebarVisible })),

  toggleFocusMode: () =>
    set((state) => {
      const nextFocus = !state.isFocusMode;
      return {
        isFocusMode: nextFocus,
        isLeftSidebarVisible: !nextFocus,
        isRightSidebarVisible: !nextFocus,
      };
    }),

  setNavbarVisible: (visible: boolean) => set({ isNavbarVisible: visible }),
  setLeftSidebarVisible: (visible: boolean) => set({ isLeftSidebarVisible: visible }),
  setRightSidebarVisible: (visible: boolean) => set({ isRightSidebarVisible: visible }),

  resetLayout: () =>
    set({
      isNavbarVisible: true,
      isLeftSidebarVisible: true,
      isRightSidebarVisible: true,
      isFocusMode: false,
    }),
}));
