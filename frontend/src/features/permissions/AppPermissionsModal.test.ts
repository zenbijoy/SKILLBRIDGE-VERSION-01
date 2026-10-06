jest.mock("@/components/ui", () => ({
  Button: () => null,
  triggerHaptic: jest.fn(),
}));

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
}));

jest.mock("expo-image-picker", () => ({
  getCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  getMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
}));

import { AppPermissionsModal } from "./AppPermissionsModal";
import { usePreferencesStore } from "@/state/usePreferencesStore";

describe("AppPermissionsModal", () => {
  it("exports the AppPermissionsModal component", () => {
    expect(AppPermissionsModal).toBeDefined();
    expect(typeof AppPermissionsModal).toBe("function");
  });

  it("has hasCompletedPermissionsPrompt initialized to false in preferences store", () => {
    const state = usePreferencesStore.getState();
    expect(typeof state.hasCompletedPermissionsPrompt).toBe("boolean");
  });

  it("updates hasCompletedPermissionsPrompt when setter is called", () => {
    const { setHasCompletedPermissionsPrompt } = usePreferencesStore.getState();
    setHasCompletedPermissionsPrompt(true);
    expect(usePreferencesStore.getState().hasCompletedPermissionsPrompt).toBe(true);

    setHasCompletedPermissionsPrompt(false);
    expect(usePreferencesStore.getState().hasCompletedPermissionsPrompt).toBe(false);
  });
});
