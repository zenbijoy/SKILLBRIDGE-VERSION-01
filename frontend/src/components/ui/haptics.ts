import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { usePreferencesStore } from "@/state/usePreferencesStore";

export function triggerHaptic(style?: string) {
  const hapticsEnabled = usePreferencesStore.getState().haptics;
  if (hapticsEnabled && Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}
