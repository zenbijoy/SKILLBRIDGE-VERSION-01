# SkillBridge Next‑Gen Visual Asset Pack v1

Original visual pack built specifically around the **existing SkillBridge brand tokens** found in the current repository (`#53A9FE → #703AF0 → #F765B6`, canonical dark `#08101E`). It is intentionally **zero-redesign friendly**: the assets decorate the current UI system instead of forcing a new component library.

## What is included

- 3 brand SVG variants (optional refreshed mark/wordmark; keep your current logo if preferred)
- 12 feature illustrations in SVG + PNG
- 4 portrait onboarding illustrations in SVG + PNG
- 10 empty/offline/error states in SVG + PNG
- 8 light/dark background textures in SVG + PNG
- 26 compact feature icons in SVG
- 10 role/status badges in SVG + PNG
- 5 animated GIF microinteractions
- 4 minimal Lottie JSON pulse animations
- 4 skeleton loading templates
- 4 notification artwork cards in SVG + PNG
- design tokens, asset map, and integration example

## Recommended placement

Use large illustrations sparingly: onboarding, empty states, first-visit feature explainers, and premium hero sections. Do **not** place a large illustration on every card. The current app already uses `PremiumHero`, gradients and Reanimated; the pack should support that language, not compete with it.

## Performance rules

1. Prefer PNG for Expo native screens unless you already have an SVG pipeline.
2. GIFs are intentionally short; use only for small moments (loader/live/success/typing). For high-frequency animation prefer Reanimated or Lottie.
3. Respect the existing `reduceMotion` preference. Use a static PNG when it is enabled.
4. Lazy-load below-the-fold artwork with `expo-image`.
5. Never upload these UI assets to R2 at runtime. Ship them with the app bundle or static web assets.
6. Keep user-generated media completely separate from product UI artwork.

## Suggested app folders

```
frontend/assets/nextgen/
  illustrations/
  empty-states/
  onboarding/
  backgrounds/
  badges/
  animations/
```

## Accessibility

Decorative backgrounds should use no accessibility label. Meaningful illustrations need a short label. Animation should not be the only signal for LIVE, success, error or loading states.

## License

All generated artwork in this pack is original for the SkillBridge project. No third-party stock art or copyrighted character imagery is included.
