import { makeButtonA11y, makeInputA11y, makeSwitchA11y } from "./accessibility";

describe("Accessibility System Helpers", () => {
  it("generates VoiceOver and TalkBack button attributes", () => {
    const a11y = makeButtonA11y("Submit Payment", {
      hint: "Completes transaction",
      disabled: false,
      loading: true,
      testID: "checkout.submit",
    });

    expect(a11y.accessible).toBe(true);
    expect(a11y.accessibilityRole).toBe("button");
    expect(a11y.accessibilityLabel).toBe("Submit Payment");
    expect(a11y.accessibilityHint).toBe("Completes transaction");
    expect(a11y.accessibilityState?.busy).toBe(true);
    expect(a11y.testID).toBe("checkout.submit");
  });

  it("generates input accessibility metadata", () => {
    const a11y = makeInputA11y("Email Address", {
      hint: "Enter your university email",
      required: true,
      testID: "auth.email.input",
    });

    expect(a11y.accessible).toBe(true);
    expect(a11y.accessibilityLabel).toBe("Email Address, required");
    expect(a11y.accessibilityHint).toBe("Enter your university email");
    expect(a11y.testID).toBe("auth.email.input");
  });

  it("generates switch accessibility metadata", () => {
    const a11y = makeSwitchA11y("Dark Mode", true, {
      hint: "Toggles OLED high-contrast dark theme",
      testID: "settings.dark_mode",
    });

    expect(a11y.accessible).toBe(true);
    expect(a11y.accessibilityRole).toBe("switch");
    expect(a11y.accessibilityLabel).toBe("Dark Mode");
    expect(a11y.accessibilityState?.checked).toBe(true);
  });
});
