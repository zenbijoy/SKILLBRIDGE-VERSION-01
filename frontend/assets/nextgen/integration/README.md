# Integration notes

The current frontend already has `react-native-reanimated`, `expo-linear-gradient`, `@expo/vector-icons`, and static PNG assets. The safest **zero-new-dependency** integration is to ship the PNG/GIF files under `frontend/assets/nextgen/` and render them with React Native `Image`.

The `animations/lottie/*.json` files are optional. Do not add a Lottie dependency merely because the pack contains them; use them only if the project later standardizes on Lottie. For current SkillBridge, Reanimated should remain the default for repeated UI motion, with GIF limited to small decorative one-shot/short-loop moments.

Do not replace existing `spotIllustrations`, `onboardingIllustrations`, or `growthIllustrations` wholesale. Add new Next-Gen assets only for features that currently lack artwork, then consolidate duplicates after visual QA.
