# SkillBridge Account Deletion & Right to Erasure

SkillBridge supports complete, self-service account deletion and data erasure in compliance with GDPR (Article 17) and Google Play / Apple App Store account deletion requirements.

---

## 1. How to Delete Your Account

### In-App Self-Service (Mobile & Web)
1. Open the SkillBridge app and log in to your account.
2. Navigate to **Settings** (gear icon) -> **Security & Account**.
3. Scroll to the bottom and select **Delete Account**.
4. Type `"DELETE"` to confirm permanent deletion.
5. Click **Permanently Delete My Account**.

### Direct API Deletion
Authenticated users can execute an immediate deletion request:
```http
DELETE /api/v1/account HTTP/1.1
Host: api.skillbridge.example.com
Authorization: Bearer <user_jwt_token>
Content-Type: application/json

{
  "confirm": "DELETE"
}
```

---

## 2. What Happens Upon Account Deletion
1. **Authentication Invalidation**: User credentials and active sessions are permanently deleted from Supabase Auth.
2. **Object Storage Purge**: All user files across `avatars`, `resources`, and `attachments` buckets are recursively deleted.
3. **Profile & Memberships**: Profile records, room memberships, and device tokens are removed.
4. **Immediate Logout**: The client app terminates all local tokens and state and redirects to the Welcome screen.
