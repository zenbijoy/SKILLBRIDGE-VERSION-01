import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import {
  Easing,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ----------------------------------------------------------------------------
// Threshold Constants (Tuned for LinkedIn-style responsiveness)
// ----------------------------------------------------------------------------
const TOP_LOCK_THRESHOLD = 10;
const MIN_SCROLL_Y_FOR_HIDE = 30;
const HIDE_DISTANCE_THRESHOLD = 12;
const SHOW_DISTANCE_THRESHOLD = 6;
const NOISE_THRESHOLD = 2;
const VELOCITY_HIDE_THRESHOLD = 700;
const VELOCITY_SHOW_THRESHOLD = -400;

const TIMING_CONFIG_HEADER = {
  duration: 200,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
};

const TIMING_CONFIG_BOTTOM = {
  duration: 210,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
};

export type NavigationMode = "feed" | "fixed" | "room" | "immersive" | "reader" | "profile";

export interface AutoHideNavigationContextType {
  headerTranslateY: SharedValue<number>;
  bottomNavTranslateY: SharedValue<number>;
  headerOpacity: SharedValue<number>;
  headerAnimatedStyle: any;
  bottomNavAnimatedStyle: any;
  isNavVisible: boolean;
  isNavVisibleShared: SharedValue<boolean>;
  isLocked: boolean;
  mode: NavigationMode;
  headerHeight: number;
  bottomNavHeight: number;
  setHeaderHeight: (h: number) => void;
  setBottomNavHeight: (h: number) => void;
  setNavigationLocked: (locked: boolean) => void;
  setMode: (mode: NavigationMode) => void;
  showNavigation: (immediate?: boolean) => void;
  hideNavigation: () => void;
  resetNavigation: () => void;
  scrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
}

const AutoHideNavigationContext = createContext<AutoHideNavigationContextType | null>(null);

export function AutoHideNavigationProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [isNavVisible, setIsNavVisible] = useState(true);
  const [isLocked, setIsLockedState] = useState(false);
  const [mode, setModeState] = useState<NavigationMode>("feed");
  const [headerHeight, setHeaderHeightState] = useState(56);
  const [bottomNavHeight, setBottomNavHeightState] = useState(
    58 + Math.max(insets.bottom, Platform.OS === "android" ? 14 : 10)
  );

  // Reanimated Shared Values for UI-thread execution
  const headerTranslateY = useSharedValue(0);
  const bottomNavTranslateY = useSharedValue(0);
  const headerOpacity = useSharedValue(1);
  const isNavVisibleShared = useSharedValue(true);
  const isLockedShared = useSharedValue(false);
  const isAtTopShared = useSharedValue(true);

  // Track dynamic dimensions inside worklets
  const headerHeightShared = useSharedValue(56);
  const bottomNavHeightShared = useSharedValue(72);
  const insetsTopShared = useSharedValue(insets.top);
  const insetsBottomShared = useSharedValue(insets.bottom);

  // Accumulator shared values
  const lastScrollY = useSharedValue(0);
  const downwardAccumulator = useSharedValue(0);
  const upwardAccumulator = useSharedValue(0);

  // Sync insets to worklets
  useEffect(() => {
    insetsTopShared.value = insets.top;
    insetsBottomShared.value = insets.bottom;
  }, [insets.top, insets.bottom, insetsTopShared, insetsBottomShared]);

  const setHeaderHeight = useCallback(
    (h: number) => {
      if (h > 0 && h !== headerHeight) {
        setHeaderHeightState(h);
        headerHeightShared.value = h;
      }
    },
    [headerHeight, headerHeightShared]
  );

  const setBottomNavHeight = useCallback(
    (h: number) => {
      if (h > 0 && h !== bottomNavHeight) {
        setBottomNavHeightState(h);
        bottomNavHeightShared.value = h;
      }
    },
    [bottomNavHeight, bottomNavHeightShared]
  );

  const syncVisibilityState = useCallback((visible: boolean) => {
    setIsNavVisible(visible);
  }, []);

  const showNavigation = useCallback(
    (immediate = false) => {
      isNavVisibleShared.value = true;
      downwardAccumulator.value = 0;
      upwardAccumulator.value = 0;
      setIsNavVisible(true);

      if (immediate) {
        headerTranslateY.value = 0;
        bottomNavTranslateY.value = 0;
        headerOpacity.value = 1;
      } else {
        headerTranslateY.value = withTiming(0, TIMING_CONFIG_HEADER);
        bottomNavTranslateY.value = withTiming(0, TIMING_CONFIG_BOTTOM);
        headerOpacity.value = withTiming(1, TIMING_CONFIG_HEADER);
      }
    },
    [headerTranslateY, bottomNavTranslateY, headerOpacity, isNavVisibleShared, downwardAccumulator, upwardAccumulator]
  );

  const hideNavigation = useCallback(() => {
    if (isLockedShared.value || isAtTopShared.value) return;
    isNavVisibleShared.value = false;
    downwardAccumulator.value = 0;
    upwardAccumulator.value = 0;
    setIsNavVisible(false);

    const targetHeaderY = -(headerHeightShared.value + insetsTopShared.value + 4);
    const targetBottomY = bottomNavHeightShared.value + insetsBottomShared.value + 24;

    headerTranslateY.value = withTiming(targetHeaderY, TIMING_CONFIG_HEADER);
    bottomNavTranslateY.value = withTiming(targetBottomY, TIMING_CONFIG_BOTTOM);
    headerOpacity.value = withTiming(0.96, TIMING_CONFIG_HEADER);
  }, [
    isLockedShared,
    isAtTopShared,
    isNavVisibleShared,
    downwardAccumulator,
    upwardAccumulator,
    headerHeightShared,
    insetsTopShared,
    bottomNavHeightShared,
    insetsBottomShared,
    headerTranslateY,
    bottomNavTranslateY,
    headerOpacity,
  ]);

  const resetNavigation = useCallback(() => {
    showNavigation(true);
  }, [showNavigation]);

  const setNavigationLocked = useCallback(
    (locked: boolean) => {
      setIsLockedState(locked);
      isLockedShared.value = locked;
      if (locked) {
        showNavigation(false);
      }
    },
    [isLockedShared, showNavigation]
  );

  const setMode = useCallback(
    (newMode: NavigationMode) => {
      setModeState(newMode);
      if (newMode === "fixed" || newMode === "reader") {
        setNavigationLocked(true);
      } else if (newMode === "immersive") {
        setNavigationLocked(false);
        hideNavigation();
      } else {
        setNavigationLocked(false);
      }
    },
    [setNavigationLocked, hideNavigation]
  );

  // --------------------------------------------------------------------------
  // Core UI-Thread Worklet Scroll Handler
  // --------------------------------------------------------------------------
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      "worklet";
      const currentY = event.contentOffset.y;
      const velocityY = event.velocity?.y ?? 0;

      // 1. Overscroll / Absolute Top Protection: always show navigation
      if (currentY <= TOP_LOCK_THRESHOLD) {
        if (!isAtTopShared.value) {
          isAtTopShared.value = true;
        }
        downwardAccumulator.value = 0;
        upwardAccumulator.value = 0;
        lastScrollY.value = currentY;

        if (!isNavVisibleShared.value) {
          isNavVisibleShared.value = true;
          runOnJS(syncVisibilityState)(true);
          headerTranslateY.value = withTiming(0, TIMING_CONFIG_HEADER);
          bottomNavTranslateY.value = withTiming(0, TIMING_CONFIG_BOTTOM);
          headerOpacity.value = withTiming(1, TIMING_CONFIG_HEADER);
        }
        return;
      }

      if (isAtTopShared.value) {
        isAtTopShared.value = false;
      }

      // If navigation is explicitly locked (e.g., active composer or modal), skip hiding
      if (isLockedShared.value) {
        lastScrollY.value = currentY;
        return;
      }

      const deltaY = currentY - lastScrollY.value;
      lastScrollY.value = currentY;

      // 2. Ignore micro-jitter (< NOISE_THRESHOLD px)
      if (Math.abs(deltaY) < NOISE_THRESHOLD) {
        return;
      }

      // 3. Fast Fling Velocity Logic
      if (velocityY > VELOCITY_HIDE_THRESHOLD && currentY > MIN_SCROLL_Y_FOR_HIDE) {
        if (isNavVisibleShared.value) {
          isNavVisibleShared.value = false;
          runOnJS(syncVisibilityState)(false);
          const targetHeaderY = -(headerHeightShared.value + insetsTopShared.value + 4);
          const targetBottomY = bottomNavHeightShared.value + insetsBottomShared.value + 24;
          headerTranslateY.value = withTiming(targetHeaderY, TIMING_CONFIG_HEADER);
          bottomNavTranslateY.value = withTiming(targetBottomY, TIMING_CONFIG_BOTTOM);
          headerOpacity.value = withTiming(0.96, TIMING_CONFIG_HEADER);
        }
        downwardAccumulator.value = 0;
        upwardAccumulator.value = 0;
        return;
      }

      if (velocityY < VELOCITY_SHOW_THRESHOLD) {
        if (!isNavVisibleShared.value) {
          isNavVisibleShared.value = true;
          runOnJS(syncVisibilityState)(true);
          headerTranslateY.value = withTiming(0, TIMING_CONFIG_HEADER);
          bottomNavTranslateY.value = withTiming(0, TIMING_CONFIG_BOTTOM);
          headerOpacity.value = withTiming(1, TIMING_CONFIG_HEADER);
        }
        downwardAccumulator.value = 0;
        upwardAccumulator.value = 0;
        return;
      }

      // 4. Downward Scroll Accumulation (Browsing down the feed -> HIDE)
      if (deltaY > 0) {
        upwardAccumulator.value = 0;
        if (currentY > MIN_SCROLL_Y_FOR_HIDE) {
          downwardAccumulator.value += deltaY;
          if (downwardAccumulator.value >= HIDE_DISTANCE_THRESHOLD && isNavVisibleShared.value) {
            isNavVisibleShared.value = false;
            runOnJS(syncVisibilityState)(false);
            const targetHeaderY = -(headerHeightShared.value + insetsTopShared.value + 4);
            const targetBottomY = bottomNavHeightShared.value + insetsBottomShared.value + 24;
            headerTranslateY.value = withTiming(targetHeaderY, TIMING_CONFIG_HEADER);
            bottomNavTranslateY.value = withTiming(targetBottomY, TIMING_CONFIG_BOTTOM);
            headerOpacity.value = withTiming(0.96, TIMING_CONFIG_HEADER);
          }
        }
      } else {
        // 5. Upward Scroll Accumulation (Browsing back up -> SHOW QUICKLY)
        downwardAccumulator.value = 0;
        upwardAccumulator.value += Math.abs(deltaY);
        if (upwardAccumulator.value >= SHOW_DISTANCE_THRESHOLD && !isNavVisibleShared.value) {
          isNavVisibleShared.value = true;
          runOnJS(syncVisibilityState)(true);
          headerTranslateY.value = withTiming(0, TIMING_CONFIG_HEADER);
          bottomNavTranslateY.value = withTiming(0, TIMING_CONFIG_BOTTOM);
          headerOpacity.value = withTiming(1, TIMING_CONFIG_HEADER);
        }
      }
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslateY.value }],
    opacity: headerOpacity.value,
  }));

  const bottomNavAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bottomNavTranslateY.value }],
  }));

  const value = useMemo<AutoHideNavigationContextType>(
    () => ({
      headerTranslateY,
      bottomNavTranslateY,
      headerOpacity,
      headerAnimatedStyle,
      bottomNavAnimatedStyle,
      isNavVisible,
      isNavVisibleShared,
      isLocked,
      mode,
      headerHeight,
      bottomNavHeight,
      setHeaderHeight,
      setBottomNavHeight,
      setNavigationLocked,
      setMode,
      showNavigation,
      hideNavigation,
      resetNavigation,
      scrollHandler,
    }),
    [
      headerTranslateY,
      bottomNavTranslateY,
      headerOpacity,
      headerAnimatedStyle,
      bottomNavAnimatedStyle,
      isNavVisible,
      isNavVisibleShared,
      isLocked,
      mode,
      headerHeight,
      bottomNavHeight,
      setHeaderHeight,
      setBottomNavHeight,
      setNavigationLocked,
      setMode,
      showNavigation,
      hideNavigation,
      resetNavigation,
      scrollHandler,
    ]
  );

  return (
    <AutoHideNavigationContext.Provider value={value}>
      {children}
    </AutoHideNavigationContext.Provider>
  );
}

export function useAutoHideNavigation(): AutoHideNavigationContextType {
  const context = useContext(AutoHideNavigationContext);
  if (!context) {
    throw new Error("useAutoHideNavigation must be used within an AutoHideNavigationProvider");
  }
  return context;
}

export function useOptionalAutoHideNavigation(): AutoHideNavigationContextType | null {
  return useContext(AutoHideNavigationContext);
}

