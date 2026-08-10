# SkillBridge V2.0.1 Windows hotfix

This hotfix addresses the installation failures reported on Windows:

1. Expo SDK 57 conflicted with `@config-plugins/react-native-webrtc@15.0.1`, whose peer range currently expects Expo SDK 56. The frontend now bootstraps on Expo SDK 56 and lets `npx expo install --fix` align Expo-managed packages.
2. `AI_PROVIDER_URL=` no longer crashes the backend. Blank optional URLs are normalized to `undefined`.
3. `SETUP_WINDOWS.ps1` now stops on real errors instead of printing a misleading success message.
4. `SETUP_WINDOWS.cmd` bypasses local PowerShell script-signing policy for this setup script.
5. Added one-click Windows launchers for backend and web development.

## Clean install

Double-click `SETUP_WINDOWS.cmd`, or from PowerShell:

```powershell
.\SETUP_WINDOWS.cmd
```

Then configure `.env` files and run:

```powershell
.\START_DEV_WINDOWS.cmd
```

For native LiveKit video, use an Expo development build, not Expo Go.
