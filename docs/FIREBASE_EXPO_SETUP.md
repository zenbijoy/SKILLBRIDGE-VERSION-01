# Firebase + Expo setup

SkillBridge uses Supabase as the application database. Do not mirror profiles/messages into Firestore unless there is a measured reason.

## Android push
1. Create a Firebase project and Android app with the final package ID `com.skillbridge.app` (or your final ID before release).
2. Configure FCM credentials in your Expo/EAS project.
3. Build with EAS development/production builds and test push on a physical Android device.
4. The app registers an Expo push token; the Express API sends notifications through Expo's push endpoint, which routes to FCM/APNs.

## Analytics / Crash reporting
Add Firebase Analytics/Crashlytics only after choosing and verifying Expo-compatible native packages for the locked Expo SDK version. Their use changes the Play Data Safety / App Store privacy disclosures, so do not silently add telemetry.

## Why no Firestore duplicate
Supabase/Postgres already owns transactions, search, rooms, sessions, profiles and messages. Keeping a second database copy creates sync/conflict/permission costs and consumes two free quotas for the same records.
