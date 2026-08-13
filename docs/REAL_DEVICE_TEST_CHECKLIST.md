# SkillBridge Real Device Test Checklist

Please perform the following tests manually on a real Android device using the RC1 build:

## 1. Network & Startup
- [ ] App launches without crashing.
- [ ] Loading screens resolve properly.
- [ ] Connects successfully to `https://swapno.duckdns.org` over cellular data.

## 2. Authentication
- [ ] Sign up new user.
- [ ] Log out.
- [ ] Log in with created user.
- [ ] Kill app and reopen -> User should remain logged in.

## 3. Core Features
- [ ] View and edit Profile (upload avatar).
- [ ] Search for skills/users.
- [ ] Send connection request.
- [ ] Open Chat, send text message.
- [ ] Create a Learning Room.

## 4. Hardware Integrations (When configured)
- [ ] Receive a push notification (background and foreground).
- [ ] Grant camera/microphone permissions.
- [ ] Connect to a LiveKit A/V session.

## 5. UI/UX
- [ ] Keyboard does not obscure inputs.
- [ ] UI looks correct on large and small screen sizes.
- [ ] Navigation back button works natively.
