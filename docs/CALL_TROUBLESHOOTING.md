# Realtime Calls Troubleshooting & Diagnostic Guide

## 1. Common Issues & Resolutions

### "User is Busy" (409 Conflict)
- **Cause**: The callee is currently in another active call in `ringing`, `connected`, or `connecting` status.
- **Fix**: Wait for the peer to finish or cancel the active call record in the database.

### "Connection failed due to network instability"
- **Cause**: Both STUN direct hole-punching and Cloudflare TURN relay failed after 3 reconnect retries.
- **Diagnostic**: Check if `CLOUDFLARE_TURN_ENABLED=true` in `backend/.env` and verify key ID validity.

### "Microphone or Camera Permission Denied"
- **Cause**: Device OS permissions not granted.
- **Fix**: Check `app.json` permission declarations (`RECORD_AUDIO`, `CAMERA`) and ensure user has enabled microphone/camera in Android/iOS app settings.
