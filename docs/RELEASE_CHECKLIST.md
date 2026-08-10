# Production / Play Store / App Store checklist

## Identity and branding
- Finalize Android package and iOS bundle ID before store release.
- Replace placeholder app icon, adaptive icon, splash, screenshots and feature graphic.
- Configure production app name/version/build numbers.

## Backend
- Create production Supabase project and run migrations in order.
- Use long random secrets and production LiveKit keys.
- Deploy API behind HTTPS and configure CORS exactly.
- Configure Redis persistence/capacity only as needed.
- Configure backups and restoration testing for production database.

## Push and native services
- Create Firebase project for Android push/analytics if used.
- Configure FCM credentials in EAS/Expo project.
- Configure APNs credentials for iOS.
- Build an Expo development client for LiveKit; test camera/mic permissions on physical devices.

## Safety / UGC
- Test block, unblock, report and moderation resolution.
- Publish Community Guidelines / Terms.
- Provide privacy policy URL.
- Verify account deletion works from inside the app and required external deletion URL/process if store policy requires it.
- Define retention/deletion behavior for messages, reports and backups.

## Quality
- Run `npx expo-doctor`, TypeScript, lint and tests.
- Test low-end Android devices, current Android target, iPhone and responsive web.
- Test offline/poor-network flows and reconnect behavior.
- Test screen sizes, font scaling and accessibility labels.
- Load test room join, chat, search and live-token endpoints.
- Test database migrations on a staging clone.
- Test a full restore from backup.

## Android release
- Verify generated Android project targets API 36 or higher before the August 31, 2026 Google Play deadline.
- `eas build --platform android --profile production`
- Produce AAB, configure Play App Signing and upload to internal testing first.
- Complete Data Safety, content rating, ads declaration and app access instructions.
- Complete required testing track and pre-launch report fixes.

## iOS release
- Apple Developer account, identifiers, APNs and App Store Connect app.
- `eas build --platform ios --profile production`
- TestFlight before review.
- Complete privacy nutrition details and review metadata.

## Web
- `npx expo export --platform web`
- Deploy static output to HTTPS hosting/CDN.
- Configure deep-link and auth redirect URLs.
