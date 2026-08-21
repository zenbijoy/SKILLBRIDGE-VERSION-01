import { t, translationKeys } from "./index";

describe("i18n system", () => {
  it("translates english keys accurately", () => {
    expect(t("common.more", "en")).toBe("More");
    expect(t("home.learn", "en")).toBe("Learn");
    expect(t("rooms.title", "en")).toBe("Learning Rooms");
  });

  it("translates bengali keys accurately", () => {
    expect(t("rooms.title", "bn")).toBe("লার্নিং রুমসমূহ");
    expect(t("profile.skillPassport", "bn")).toBe("স্কিল পাসপোর্ট");
  });

  it("falls back to english or key when key is unknown", () => {
    expect(t("unknown.key", "bn", "Custom Fallback")).toBe("Custom Fallback");
  });

  it("keeps English and Bengali dictionaries in exact key parity", () => {
    expect(translationKeys("bn")).toEqual(translationKeys("en"));
    expect(t("dashboard.saveCustom", "bn")).not.toBe("dashboard.saveCustom");
    expect(t("onboarding.profilePicture", "bn")).not.toBe("onboarding.profilePicture");
  });
});
