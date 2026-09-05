# SkillBridge Brand Identity, App Icon, Splash & Loader Integration

## 1. Brand Identity Overview

The official SkillBridge visual identity is anchored exclusively on the upper graphical symbol:
- **Visual Motif**: Two abstract collaborative human figures joining arms to form an arching bridge.
- **Color Grading**: Deep blue/cyan (`#53A9FE`), vibrant violet (`#703AF0`), electric purple (`#844FF5`), translucent lilac blend (`#B8ADF9`), and radiant magenta/pink (`#F765B6` / `#FC6FB3`).
- **Brand Surfaces**: Pure White (`#FFFFFF`) for light identity and Canonical Midnight (`#08101E`) for dark/OLED mode.
- **Core Principle**: In all launcher icons, adaptive icons, native splash screens, and in-app loading figures, **ONLY** the graphical mark is used. All text ("SkillBridge", "LEARN CONNECT GROW") is strictly excluded.

---

## 2. Brand Asset Architecture

All branding assets are organized canonically and natively:

```
frontend/
├── assets/
│   ├── branding/
│   │   ├── skillbridge-mark-master.png     (1024x1024 master transparent symbol)
│   │   ├── skillbridge-mark.png            (512x512 runtime optimized in-app mark)
│   │   └── adaptive-icon.png               (1024x1024 copy for reference)
│   ├── splash/
│   │   └── skillbridge-splash-mark.png     (512x512 transparent native splash mark)
│   ├── icon.png                            (1024x1024 opaque white iOS & master icon)
│   ├── adaptive-icon.png                   (1024x1024 Android adaptive foreground)
│   ├── adaptive-icon-monochrome.png        (1024x1024 Android 13+ themed icon silhouette)
│   ├── splash.png                          (1024x1024 canonical splash fallback)
│   └── favicon.png                         (192x192 web / PWA browser favicon)
└── android/app/src/main/res/
    ├── mipmap-{m,h,xh,xxh,xxxh}dpi/
    │   ├── ic_launcher.png                 (Android launcher square/standard icons)
    │   └── ic_launcher_round.png           (Android launcher circular icons)
    └── drawable-{m,h,xh,xxh,xxxh}dpi/
        └── splashscreen_logo.png           (Native Android splashscreen drawables)
```

---

## 3. Brand Design Tokens (`src/theme/brand.ts`)

Directly derived and sampled from the master brand mark:

```typescript
export const brandColors = Object.freeze({
  brandBlue: "#53A9FE",         // Left base & connection curve
  brandCyan: "#57B3FE",         // Left cyan-blue highlight
  brandViolet: "#703AF0",       // Left figure body
  brandPurple: "#844FF5",       // Left figure head
  brandBridgeBlend: "#B8ADF9",   // Center bridge translucent overlap
  brandMagenta: "#C23DBD",      // Right figure arm & base
  brandPink: "#F765B6",         // Right figure head
  brandPinkLight: "#FC6FB3",    // Right figure body highlight
  brandBackgroundLight: "#FFFFFF",
  brandBackgroundDark: "#08101E", // SkillBridge midnight surface
  brandSurfaceLight: "#F8FAFC",
  brandSurfaceDark: "#0F1A2E",
  brandTextDark: "#0F172A",
  brandTextLight: "#F8FAFC",
});
```

---

## 4. App Icon & Adaptive Icon Setup

### iOS Configuration
- File: `frontend/assets/icon.png` (1024x1024, opaque white background `#FFFFFF`).
- The symbol is centered with generous safe margins (approx. 70% canvas width).
- No pre-baked corner rounding (iOS applies the squircle mask automatically).

### Android Adaptive Icon Configuration
- Foreground: `frontend/assets/adaptive-icon.png` (1024x1024, transparent background).
- Background: `#FFFFFF` (configured in `app.json`).
- Safe Zone: The mark is scaled to width 590px (within the 66% safe circle radius of 338px), ensuring zero clipping under Circle, Squircle, Rounded Square, or Teardrop launcher masks.
- Monochrome Themed Icon: `frontend/assets/adaptive-icon-monochrome.png` (solid white silhouette on transparent background) supporting Android 13+ material dynamic theming.

---

## 5. Native Splash Screen Setup

Configured in `frontend/app.json` via official `expo-splash-screen` plugin:

```json
[
  "expo-splash-screen",
  {
    "backgroundColor": "#FFFFFF",
    "image": "./assets/splash/skillbridge-splash-mark.png",
    "imageWidth": 180
  }
]
```

Native Android layout:
- `android/app/src/main/res/values/styles.xml` points to `Theme.App.SplashScreen`.
- Background color is `#FFFFFF`.
- Central mark displays `splashscreen_logo.png`.

---

## 6. In-App Loading Figure (`SkillBridgeLoader`)

Located at `frontend/src/components/ui/SkillBridgeLoader.tsx` and re-exported from `@/components/ui`.

### Visual Behavior
- Displays **ONLY** the official graphical symbol.
- Features a calm, modern 1400ms breathing animation:
  - Subtle scaling: `0.975` to `1.025`
  - Soft opacity: `0.88` to `1.00`
  - Floating displacement: `-1.5px` to `+1.5px`
  - Easing: `Easing.inOut(Easing.quad)`
- Powered by React Native core `Animated` with `useNativeDriver: true` for 60fps/120fps hardware-accelerated rendering without bridge overhead.
- Accessibility: Automatically detects `AccessibilityInfo.isReduceMotionEnabled` and disables continuous motion for users who prefer reduced motion.

### API Reference

```tsx
<SkillBridgeLoader
  size="hero"          // "small" (48) | "medium" (80) | "large" (120) | "hero" (140) | number
  fullScreen={true}   // Fills container with theme-aware background
  background="#08101E"// Optional custom background override
  message="..."       // Optional text (default is undefined: NO text shown)
/>
```

---

## 7. Integrated Loading States

| State | Location | Implementation |
|---|---|---|
| **App Cold Boot** | `frontend/app/_layout.tsx` | Native splash held via `SplashScreen.preventAutoHideAsync()`. Once session resolves, hides native splash via `SplashScreen.hideAsync()`. If still loading, displays full-screen `SkillBridgeLoader`. |
| **Root Index Route** | `frontend/app/index.tsx` | Renders `<SkillBridgeLoader fullScreen size="hero" />` while session resolves, then redirects. |
| **Auth Callback** | `frontend/app/auth/callback.tsx` | Uses updated `<Loading />` component showing branded mark with authentication status. |
| **Profile Hydration** | `frontend/app/_layout.tsx` | Shows full-screen loader while initial user profile & onboarding status hydrate from `/profiles/me`. |
| **Generic Loading** | `frontend/src/components/ui.tsx` | `Loading` component updated to render `SkillBridgeLoader`. |

---

## 8. Maintenance & Regeneration

To regenerate all brand assets from a new source image:

1. Place the master source logo at `frontend/assets/branding/source-logo.png` (or update `$srcPath` in the script).
2. Run the automated generation script:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/generate-brand-assets.ps1
   powershell -ExecutionPolicy Bypass -File scripts/generate-native-android-assets.ps1
   ```
3. Run verification:
   ```bash
   npm run typecheck --prefix frontend
   npm run lint --prefix frontend
   npm test --prefix frontend
   ```
