# SKILLBRIDGE End-to-End (E2E) Test Journeys & Automation Specification

This document details the deterministic end-to-end user journeys for SKILLBRIDGE across Web/Admin and Mobile platforms.

---

## Journey 1: Authentication & Session Lifecycle
**Target**: Mobile & Web App
**Objective**: Verify secure authentication, token storage, role assignment, and clean session termination.

### Execution Steps
1. **Launch**: App renders initial Welcome / Auth Screen (`TEST_IDS.AUTH.EMAIL_INPUT`).
2. **Input Credentials**:
   - Email: `student.test@skillbridge.example.com`
   - Password: `Password123!`
3. **Submit**: Click Login button (`TEST_IDS.AUTH.LOGIN_SUBMIT`).
4. **Validation**:
   - Request dispatched to `POST /api/v1/auth/login` or Supabase session initialized.
   - Header `X-Request-ID` attached to API calls.
5. **Dashboard Landing**: User lands on personalized Learn dashboard (`TEST_IDS.DASHBOARD.LEARN_TAB`).
6. **Sign Out**:
   - Navigate to Settings -> Security / Account.
   - Click Logout (`TEST_IDS.AUTH.LOGOUT_BUTTON`).
   - Verify access token cleared from SecureStore/localStorage and user redirected to Welcome screen.

---

## Journey 2: User Profile & Learning Preferences
**Target**: Mobile & Web App
**Objective**: Verify safe profile updating, onboarding sync, and preference persistence.

### Execution Steps
1. **Login** as authenticated student.
2. **Open Profile**: Click Profile Avatar on Dashboard (`TEST_IDS.DASHBOARD.PROFILE_BUTTON`).
3. **Edit Profile**:
   - Click Edit Profile (`TEST_IDS.PROFILE.EDIT_BUTTON`).
   - Update Headline to `"Full Stack Developer & AI Enthusiast"` (`TEST_IDS.PROFILE.HEADLINE_INPUT`).
   - Update Bio (`TEST_IDS.PROFILE.BIO_INPUT`).
4. **Save Changes**: Click Save (`TEST_IDS.PROFILE.SAVE_BUTTON`).
5. **Verification**:
   - Verify `PATCH /api/v1/profiles/me` returns `200 OK`.
   - Verify updated headline renders on profile card immediately without full reload.

---

## Journey 3: Search & Discovery
**Target**: Mobile & Web App
**Objective**: Query the search index for skills, tutors, and learning rooms without rate limit violations.

### Execution Steps
1. **Navigate to Search**: Click search bar on top bar (`TEST_IDS.DASHBOARD.SEARCH_BAR`).
2. **Input Query**: Type `"TypeScript Architecture"` into (`TEST_IDS.SEARCH.INPUT`).
3. **Filter**: Apply Category filter `"Engineering"` (`TEST_IDS.SEARCH.FILTER_BUTTON`).
4. **Verify Results**:
   - Verify results render within `< 300ms` without layout shift.
   - Click on search result item (`TEST_IDS.SEARCH.RESULT_ITEM`).
   - Verify navigation to detail screen with correct parameters.

---

## Journey 4: Community & Real-Time Messaging / Calling
**Target**: Mobile & Web App
**Objective**: Test room membership, real-time Socket.IO chat delivery, and WebRTC call signaling.

### Execution Steps
1. **Join Room**: Select public room `"Mobile & WebRTC Devs"` and click Join (`TEST_IDS.ROOM.JOIN_BUTTON`).
2. **Send Message**:
   - Focus message composer (`TEST_IDS.CHAT.MESSAGE_INPUT`).
   - Type `"Hello team, testing real-time synchronization!"`.
   - Click Send (`TEST_IDS.CHAT.MESSAGE_SEND`).
3. **Receipt & Echo**:
   - Message appears in conversation list with status `sent` -> `delivered`.
   - Add emoji reaction `:thumbsup:` to message.
4. **Initiate Call**:
   - Trigger P2P call offer to peer user.
   - Verify STUN/TURN ICE servers fetched from `GET /api/v1/calls/ice-servers`.
   - Click End Call (`TEST_IDS.CALL.END_BUTTON`).

---

## Journey 5: Admin Panel Quality & Moderation Operations
**Target**: Admin Web Console (`http://localhost:5173`)
**Objective**: Verify administrator authentication, telemetry inspection, audit logging, and content moderation.

### Execution Steps
1. **Admin Login**:
   - Navigate to `/login`.
   - Enter Owner / Administrator credentials.
   - Submit login (`ADMIN_TEST_IDS.AUTH.LOGIN_SUBMIT`).
2. **System Health Inspection**:
   - Open System Health view (`ADMIN_TEST_IDS.DASHBOARD.SYSTEM_HEALTH_NAV`).
   - Verify DB status, Redis status, and auth failure telemetry are `UP` and `200 OK`.
3. **Audit Log Inspection**:
   - Navigate to Audit Log viewer (`ADMIN_TEST_IDS.DASHBOARD.AUDIT_LOG_NAV`).
   - Verify actor ID, action, timestamp, and target types are searchable and paginated.
4. **Moderation Queue**:
   - Open Moderation Queue (`ADMIN_TEST_IDS.DASHBOARD.MODERATION_NAV`).
   - Approve or reject flagged content report with mandatory audit trail confirmation.
