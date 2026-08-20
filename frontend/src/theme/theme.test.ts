import { getPalette, getRadius } from "./index";

describe("Theme Engine", () => {
  it("provides distinct palettes for all 5 accent themes in light and dark mode", () => {
    const accents = ["ocean", "emerald", "violet", "sunset", "cyberpunk"] as const;

    for (const accent of accents) {
      const light = getPalette(false, false, accent);
      const dark = getPalette(true, false, accent);
      const oled = getPalette(true, true, accent);

      expect(light.primary).toBeDefined();
      expect(dark.primary).toBeDefined();
      expect(oled.primary).toBeDefined();

      // OLED mode must have pitch black background
      expect(oled.bg).toBe("#000000");
      expect(dark.bg).not.toBe("#000000");
    }
  });

  it("handles true OLED black mode correctly", () => {
    const oled = getPalette(true, true, "ocean");
    expect(oled.bg).toBe("#000000");
    expect(oled.surface).toBe("#09090B");
    expect(oled.text).toBe("#FFFFFF");
  });

  it("calculates radius geometries properly", () => {
    const rounded = getRadius("rounded");
    const smooth = getRadius("smooth");
    const pill = getRadius("pill");

    expect(rounded.md).toBe(12);
    expect(smooth.md).toBe(14);
    expect(pill.md).toBe(18);
  });
});
