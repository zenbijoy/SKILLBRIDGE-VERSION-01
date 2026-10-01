import { Alert, Share } from "react-native";

/**
 * Safely copy text to clipboard using expo-clipboard if the native module is compiled into the APK,
 * or gracefully fall back to React Native's native Share dialog / Alert if missing.
 */
export async function copyToClipboard(text: string, title?: string): Promise<boolean> {
  try {
    const Clipboard = await import("expo-clipboard");
    if (Clipboard && typeof Clipboard.setStringAsync === "function") {
      await Clipboard.setStringAsync(text);
      return true;
    }
  } catch {
    // ExpoClipboard native module is not present in the current dev client build
  }

  try {
    await Share.share({
      message: text,
      title: title || "SkillBridge",
    });
    return true;
  } catch {
    Alert.alert(title || "Copied", text);
    return false;
  }
}
