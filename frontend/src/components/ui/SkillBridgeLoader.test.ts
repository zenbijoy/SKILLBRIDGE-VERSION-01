import { SkillBridgeLoader } from "./SkillBridgeLoader";
import { brandColors } from "@/theme/brand";

describe("SkillBridge Brand and Loader", () => {
  it("exports the SkillBridgeLoader component", () => {
    expect(SkillBridgeLoader).toBeDefined();
    expect(typeof SkillBridgeLoader).toBe("function");
  });

  it("exports official brand colors matching sampled logo identity", () => {
    expect(brandColors.brandBlue).toBe("#53A9FE");
    expect(brandColors.brandViolet).toBe("#703AF0");
    expect(brandColors.brandPurple).toBe("#844FF5");
    expect(brandColors.brandMagenta).toBe("#C23DBD");
    expect(brandColors.brandPink).toBe("#F765B6");
    expect(brandColors.brandBackgroundLight).toBe("#FFFFFF");
    expect(brandColors.brandBackgroundDark).toBe("#08101E");
  });
});
