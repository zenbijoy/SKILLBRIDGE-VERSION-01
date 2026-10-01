# SkillBridge Next-Gen: LiveKit Recording Automation & Egress Runbook

**Phase 4 Operational Architecture**  
**Document Classification:** Production Safe, Guarded by Feature Flags

---

## 1. Safety Architecture: Zero Billable Non-Free Egress by Default

LiveKit Cloud charges significant egress and transcoding fees for server-side composite recording ($0.05 - $0.15 per minute). If enabled unintentionally on a hobby or free tier, an active classroom room could rapidly accumulate unexpected monthly cloud charges.

To safeguard SkillBridge from unexpected financial liability:
- **Default State**: Server-side recording automation is disabled (`LIVEKIT_RECORDING_AUTOMATION: booleanFromEnv.default(false)`).
- **Default Provider**: Study rooms use `ManualYouTubeProvider` or `YouTubeOAuthProvider` (which has $0 hosting costs via YouTube unlisted/public links).
- **Egress Guard**: The `LiveKitEgressProvider` class throws an informative operational exception if invoked when `LIVEKIT_RECORDING_AUTOMATION=false`.

---

## 2. When to Enable LiveKit Egress

Enable server-side LiveKit recording automation only when:
1. An institutional sponsor or enterprise plan provides budget for egress compute.
2. A dedicated cloud storage bucket (Cloudflare R2 or Google Cloud Storage) is configured to store raw `.mp4` and HLS files.
3. Your LiveKit Cloud dashboard has budget alerts configured.

---

## 3. Activation Runbook

When you are ready to provision paid LiveKit Egress:

### Step 3.1: Configure Storage Egress Destination
In your LiveKit Cloud console or self-hosted LiveKit config, set up S3-compatible egress credentials pointing to Cloudflare R2:
- **Bucket**: `skillbridge-recordings`
- **Endpoint**: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
- **Region**: `auto`
- **Access Key ID**: `R2_ACCESS_KEY_ID`
- **Secret Access Key**: `R2_SECRET_ACCESS_KEY`

### Step 3.2: Enable Render Environment Variable
In your Render backend service dashboard, add:
```bash
LIVEKIT_RECORDING_AUTOMATION=true
```

### Step 3.3: Webhook Verification
Ensure `POST /webhooks/live` is receiving LiveKit webhook events:
- `egress_started`: Updates `public.room_recordings` status to `processing`.
- `egress_ended`: Fetches egress output URL from R2, computes duration, and sets status to `ready`.

---

## 4. Cost Forecasting & Safety Controls

| Recording Approach | Storage Cost | Compute / Egress Cost | SkillBridge Default |
| :--- | :--- | :--- | :--- |
| **YouTube Unlisted / OAuth** | $0 / Free | $0 / Free | **ACTIVE (RECOMMENDED)** |
| **Direct Presigned R2 Upload** | $0.015 / GB-mo | $0 / Free egress | **ACTIVE FOR IMAGES/DOCS** |
| **LiveKit Composite Egress** | Cloud storage rate | $0.06 - $0.10 / min | **DISABLED BY FLAG** |
