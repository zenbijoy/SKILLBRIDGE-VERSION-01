export const SCROLL_CONSTANTS = {
  NOISE_THRESHOLD: 2,
  HIDE_ACCUMULATION_THRESHOLD: 12,
  SHOW_ACCUMULATION_THRESHOLD: -6,
  FLING_HIDE_VELOCITY: 700,
  FLING_SHOW_VELOCITY: -400,
  TOP_LOCK_OFFSET: 10,
  INITIAL_DEADZONE: 30,
} as const;

export interface ScrollVisibilityParams {
  currentY: number;
  lastY: number;
  velocity: number;
  accumulatedDelta: number;
  currentlyVisible: boolean;
  isLocked: boolean;
}

export interface ScrollVisibilityResult {
  shouldBeVisible: boolean;
  isAtTop: boolean;
  newAccumulatedDelta: number;
}

/**
 * Pure calculation logic for LinkedIn-style auto-hide navigation.
 * Can be run on JS thread or in Reanimated worklet ("worklet" directive).
 */
export function calculateAutoHideVisibility(params: ScrollVisibilityParams): ScrollVisibilityResult {
  "worklet";
  const { currentY, lastY, velocity, accumulatedDelta, currentlyVisible, isLocked } = params;

  // 1. Navigation is locked (e.g. Chat, Call, Modal, Live Room)
  if (isLocked) {
    return {
      shouldBeVisible: true,
      isAtTop: currentY <= SCROLL_CONSTANTS.TOP_LOCK_OFFSET,
      newAccumulatedDelta: 0,
    };
  }

  // 2. Absolute top guarantee
  if (currentY <= SCROLL_CONSTANTS.TOP_LOCK_OFFSET) {
    return {
      shouldBeVisible: true,
      isAtTop: true,
      newAccumulatedDelta: 0,
    };
  }

  const diff = currentY - lastY;

  // 3. Ignore minor jitter / noise
  if (Math.abs(diff) < SCROLL_CONSTANTS.NOISE_THRESHOLD) {
    return {
      shouldBeVisible: currentlyVisible,
      isAtTop: false,
      newAccumulatedDelta: accumulatedDelta,
    };
  }

  // Reset or accumulate delta
  let newDelta = accumulatedDelta;
  if ((diff > 0 && accumulatedDelta < 0) || (diff < 0 && accumulatedDelta > 0)) {
    newDelta = diff;
  } else {
    newDelta += diff;
  }

  // 4. Downward scroll (swiping up -> moving further down the feed)
  if (diff > 0) {
    const isPastDeadzone = currentY > SCROLL_CONSTANTS.INITIAL_DEADZONE;
    const isFastFling = velocity > SCROLL_CONSTANTS.FLING_HIDE_VELOCITY;
    const isAccumulated = newDelta >= SCROLL_CONSTANTS.HIDE_ACCUMULATION_THRESHOLD;

    if (isPastDeadzone && (isAccumulated || isFastFling)) {
      return {
        shouldBeVisible: false,
        isAtTop: false,
        newAccumulatedDelta: newDelta,
      };
    }
  }

  // 5. Upward scroll (swiping down -> moving back up to previous content)
  if (diff < 0) {
    const isFastFling = velocity < SCROLL_CONSTANTS.FLING_SHOW_VELOCITY;
    const isAccumulated = newDelta <= SCROLL_CONSTANTS.SHOW_ACCUMULATION_THRESHOLD;

    if (isAccumulated || isFastFling) {
      return {
        shouldBeVisible: true,
        isAtTop: false,
        newAccumulatedDelta: newDelta,
      };
    }
  }

  return {
    shouldBeVisible: currentlyVisible,
    isAtTop: false,
    newAccumulatedDelta: newDelta,
  };
}
