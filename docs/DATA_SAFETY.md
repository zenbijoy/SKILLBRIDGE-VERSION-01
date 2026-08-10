# Data Safety & Privacy Compliance Guide

Use this document as a cheat sheet when filling out the Apple App Store Privacy Details and Google Play Console Data Safety questionnaires.

## 1. Data Collection Types

**A. Personal Information**
- **Name**: Collected for user identification and public profiles. (User provided)
- **Email Address**: Collected for authentication and account recovery. (User provided, not shared publicly)

**B. User-Generated Content**
- **In-App Messages**: Collected for the campus chat functionality. (Encrypted in transit and at rest)
- **Photos or Videos**: Profile pictures and optional learning resources. (User provided)

**C. App Activity**
- **Interactions**: Page views, session attendance, and search history to power the "Smart Matching" recommendation engine.

**D. Device or Other Identifiers**
- **Device ID**: Collected for Firebase Push Notifications.

## 2. Privacy Permissions Justifications
If requested by app store reviewers, here is exactly why we request these hardware permissions:
- **Camera (`NSCameraUsageDescription`)**: "SkillBridge requires camera access so you can participate in live peer learning rooms and video classes."
- **Microphone (`NSMicrophoneUsageDescription`)**: "SkillBridge requires microphone access to let you speak in live audio and video learning sessions."

## 3. Data Practices
- **Data Encryption**: All data is encrypted in transit over HTTPS/WSS (WebRTC & Socket.io) and encrypted at rest within the Supabase PostgreSQL database.
- **Account Deletion**: Users can request full account and data deletion from the "Settings > Privacy" page within the app.
- **Data Sharing**: We do NOT sell user data to third parties. Data is only shared with subprocessors (LiveKit, Supabase, Expo) necessary to provide the core app functionality.

## 4. Age Restrictions
Since this is a university campus network application, the target demographic is 13+ (or 18+ depending on specific campus configurations). We do not knowingly collect data from children under 13.
