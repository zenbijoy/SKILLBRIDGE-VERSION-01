# SkillBridge Expo Frontend

Cross-platform React Native + Expo frontend for Android, iOS and Web.

## Setup
1. `cp .env.example .env`
2. Set Supabase URL/anon key and API URL.
3. `npm install`
4. `npx expo install --fix`
5. `npx expo prebuild` (required for LiveKit native modules)
6. `npm run android`, `npm run ios`, or `npm run web`.

Expo Go is not sufficient for the LiveKit native module. Use a development build.
