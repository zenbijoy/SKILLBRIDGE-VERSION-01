import type { AccessibilityRole, AccessibilityState } from "react-native";

export const A11Y_ROLES = {
  BUTTON: "button" as AccessibilityRole,
  SWITCH: "switch" as AccessibilityRole,
  HEADER: "header" as AccessibilityRole,
  SEARCH: "search" as AccessibilityRole,
  IMAGE: "image" as AccessibilityRole,
  TAB: "tab" as AccessibilityRole,
  LINK: "link" as AccessibilityRole,
  TEXT: "text" as AccessibilityRole,
  ALERT: "alert" as AccessibilityRole,
  CHECKBOX: "checkbox" as AccessibilityRole,
  RADIO: "radio" as AccessibilityRole,
} as const;

export interface AccessibilityProps {
  accessible?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  accessibilityValue?: {
    min?: number;
    max?: number;
    now?: number;
    text?: string;
  };
  testID?: string;
}

export function makeButtonA11y(
  label: string,
  options: {
    hint?: string;
    disabled?: boolean;
    loading?: boolean;
    selected?: boolean;
    testID?: string;
  } = {},
): AccessibilityProps {
  return {
    accessible: true,
    accessibilityRole: "button",
    accessibilityLabel: label,
    accessibilityHint: options.hint,
    accessibilityState: {
      disabled: options.disabled || false,
      busy: options.loading || false,
      selected: options.selected || false,
    },
    testID: options.testID,
  };
}

export function makeInputA11y(
  label: string,
  options: {
    hint?: string;
    disabled?: boolean;
    hasError?: boolean;
    required?: boolean;
    testID?: string;
  } = {},
): AccessibilityProps {
  return {
    accessible: true,
    accessibilityLabel: options.required ? `${label}, required` : label,
    accessibilityHint: options.hint,
    accessibilityState: {
      disabled: options.disabled || false,
    },
    testID: options.testID,
  };
}

export function makeSwitchA11y(
  label: string,
  checked: boolean,
  options: { hint?: string; disabled?: boolean; testID?: string } = {},
): AccessibilityProps {
  return {
    accessible: true,
    accessibilityRole: "switch",
    accessibilityLabel: label,
    accessibilityHint: options.hint,
    accessibilityState: {
      checked,
      disabled: options.disabled || false,
    },
    testID: options.testID,
  };
}
