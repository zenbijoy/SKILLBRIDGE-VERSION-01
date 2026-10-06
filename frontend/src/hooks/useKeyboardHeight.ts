import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Returns the on-screen keyboard height (0 when hidden).
 *
 * Why this exists: React Native's `KeyboardAvoidingView` only works reliably on
 * iOS. On Android the app window is resized (`adjustResize`) but a full-screen
 * `Modal` sheet with `maxHeight: 92%` keeps its old height, so the focused
 * `TextInput` ends up hidden behind the keyboard. Tracking the height lets the
 * composer shrink its sheet and keep the caret in view.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // iOS exposes frame coords; on Android `endCoordinates.height` is 0 for
    // hide events, so guard against resetting to 0 on show.
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        const h = e.endCoordinates?.height ?? 0;
        if (h > 0) setHeight(h);
      },
    );

    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setHeight(0),
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}

export default useKeyboardHeight;