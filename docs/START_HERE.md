# Start here

1. Install Node.js 22, Git, Android Studio and EAS CLI. On macOS also install Xcode for local iOS builds.
2. Extract the complete bundle. Run `SETUP_WINDOWS.ps1` on Windows or `SETUP_LINUX.sh` on Linux/macOS.
3. Create a Supabase project. Copy URL/anon/service-role values into the two `.env` files; never put the service-role key in frontend.
4. Run `infra/supabase/migrations/001_schema.sql` through `004_hardening.sql`, then `003_seed.sql` in numeric order (001,002,003,004 is acceptable; 004 is hardening and independent of seed data).
5. Create/configure an Expo/EAS project and replace `REPLACE_EAS_PROJECT_ID` in `frontend/app.json`.
6. Set the final Android package/iOS bundle ID before store release. The sample uses `com.skillbridge.app`.
7. Configure Firebase/FCM credentials for Android push and APNs for iOS push in EAS.
8. Deploy backend + Redis + LiveKit on your VPS; replace Caddy example domains and all LiveKit development secrets.
9. Set `EXPO_PUBLIC_API_URL`, then run `npx expo prebuild` and make an Expo development build. LiveKit requires native code, so test on a development build/physical device.
10. Complete staging QA, privacy/community-guidelines URLs, Data Safety/app privacy declarations, screenshots/store metadata, internal/closed testing, then build the production AAB/IPA using EAS.

Read `VALIDATION.md` and `RELEASE_CHECKLIST.md` before treating the project as release-ready.
