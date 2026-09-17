import {
  calculateAutoHideVisibility,
  SCROLL_CONSTANTS,
} from "./autoHideLogic";

describe("LinkedIn-Style AutoHide Navigation Logic", () => {
  describe("Thresholds and Constants", () => {
    it("has expected hysteresis thresholds", () => {
      expect(SCROLL_CONSTANTS.NOISE_THRESHOLD).toBe(2);
      expect(SCROLL_CONSTANTS.HIDE_ACCUMULATION_THRESHOLD).toBe(12);
      expect(SCROLL_CONSTANTS.SHOW_ACCUMULATION_THRESHOLD).toBe(-6);
      expect(SCROLL_CONSTANTS.FLING_HIDE_VELOCITY).toBe(700);
      expect(SCROLL_CONSTANTS.FLING_SHOW_VELOCITY).toBe(-400);
      expect(SCROLL_CONSTANTS.TOP_LOCK_OFFSET).toBe(10);
      expect(SCROLL_CONSTANTS.INITIAL_DEADZONE).toBe(30);
    });
  });

  describe("calculateAutoHideVisibility", () => {
    it("locks visible when at the top (scrollY <= 10px)", () => {
      const result = calculateAutoHideVisibility({
        currentY: 5,
        lastY: 15,
        velocity: 800, // fast down fling, but at top!
        accumulatedDelta: 50,
        currentlyVisible: false,
        isLocked: false,
      });

      expect(result.shouldBeVisible).toBe(true);
      expect(result.isAtTop).toBe(true);
      expect(result.newAccumulatedDelta).toBe(0);
    });

    it("ignores noise below 2px", () => {
      const result = calculateAutoHideVisibility({
        currentY: 100,
        lastY: 99, // 1px diff
        velocity: 50,
        accumulatedDelta: 0,
        currentlyVisible: true,
        isLocked: false,
      });

      expect(result.shouldBeVisible).toBe(true);
      expect(result.newAccumulatedDelta).toBe(0);
    });

    it("does not hide within initial deadzone (scrollY <= 30px) without fast fling", () => {
      const result = calculateAutoHideVisibility({
        currentY: 25,
        lastY: 15,
        velocity: 100,
        accumulatedDelta: 0,
        currentlyVisible: true,
        isLocked: false,
      });

      expect(result.shouldBeVisible).toBe(true);
    });

    it("hides when downward scroll accumulation exceeds 12px", () => {
      const result = calculateAutoHideVisibility({
        currentY: 120,
        lastY: 100, // 20px downward
        velocity: 200,
        accumulatedDelta: 0,
        currentlyVisible: true,
        isLocked: false,
      });

      expect(result.shouldBeVisible).toBe(false);
      expect(result.newAccumulatedDelta).toBeGreaterThanOrEqual(12);
    });

    it("hides immediately on fast downward fling (> 700 velocity)", () => {
      const result = calculateAutoHideVisibility({
        currentY: 80,
        lastY: 75, // only 5px diff
        velocity: 850, // fast fling
        accumulatedDelta: 0,
        currentlyVisible: true,
        isLocked: false,
      });

      expect(result.shouldBeVisible).toBe(false);
    });

    it("shows immediately on upward scroll exceeding 6px", () => {
      const result = calculateAutoHideVisibility({
        currentY: 150,
        lastY: 160, // -10px upward
        velocity: -100,
        accumulatedDelta: 0,
        currentlyVisible: false,
        isLocked: false,
      });

      expect(result.shouldBeVisible).toBe(true);
      expect(result.newAccumulatedDelta).toBeLessThanOrEqual(-6);
    });

    it("shows immediately on fast upward fling (< -400 velocity)", () => {
      const result = calculateAutoHideVisibility({
        currentY: 200,
        lastY: 203, // only -3px
        velocity: -600, // fast upward fling
        accumulatedDelta: 0,
        currentlyVisible: false,
        isLocked: false,
      });

      expect(result.shouldBeVisible).toBe(true);
    });

    it("maintains visible state when locked", () => {
      const result = calculateAutoHideVisibility({
        currentY: 300,
        lastY: 250, // 50px downward
        velocity: 900,
        accumulatedDelta: 50,
        currentlyVisible: true,
        isLocked: true, // locked
      });

      expect(result.shouldBeVisible).toBe(true);
    });
  });
});
