# SkillBridge WebRTC & RTC Device Testing Protocol

## 1. Physical Device & Network Scenarios

Every item in this matrix requires physical verification on target devices (Android & iOS) before declaring 100% production readiness:

| Test Case ID | Test Scenario | Description & Conditions | Expected Transport & Outcome |
| :--- | :--- | :--- | :--- |
| **RTC-NET-01** | **Wi-Fi ↔ Wi-Fi (Same Subnet)** | Two physical phones connected to the same local Wi-Fi router. | Direct host candidate; low RTT (<30ms). |
| **RTC-NET-02** | **Wi-Fi ↔ 4G/LTE (Cross-Network)** | One device on home Wi-Fi, second on 4G cellular data (e.g. Grameenphone). | STUN `srflx` direct candidate hole-punching. |
| **RTC-NET-03** | **4G ↔ 4G (Same Carrier)** | Two phones on 4G data under the same telecom operator. | Direct `srflx` or Carrier NAT traversal. |
| **RTC-NET-04** | **Carrier-to-Carrier (Inter-Op)** | Phone A on Grameenphone 4G, Phone B on Banglalink / Robi 4G. | STUN traversal or automatic Cloudflare TURN relay. |
| **RTC-NET-05** | **Campus / Enterprise Firewall** | Phone connected to strict symmetric NAT / university Wi-Fi blocking UDP. | Automatic fallback to Cloudflare TURN over TCP/TLS 443. |
| **RTC-NET-06** | **Forced TURN Relay Mode** | Development debug flag `iceTransportPolicy: "relay"`. | Call connects 100% over TURN; `ConnectionQuality` displays `TURN RELAY`. |
| **RTC-PERM-01**| **Camera Permission Denial** | Caller or Callee denies camera permissions at OS prompt. | Graceful fallback to audio-only calling without crashing. |
| **RTC-PERM-02**| **Microphone Permission Denial** | User denies microphone permissions at OS prompt. | Clean error prompt informing user to enable mic in settings. |
| **RTC-LIFE-01**| **App Backgrounding** | Active call moved to background on Android/iOS. | Audio continues uninterrupted; video track pauses cleanly. |
| **RTC-LIFE-02**| **Locked Screen Ringing** | Phone receives incoming call while screen is locked. | High-priority Push Notification appears with Accept/Decline action. |
| **RTC-LIFE-03**| **App Killed State** | Receiving call when SkillBridge is not in RAM. | Push notification wakes device; tapping notification opens incoming call modal. |
| **RTC-HAND-01**| **Wi-Fi → 4G Network Handoff** | Disconnect Wi-Fi during active 1:1 call; switch to 4G. | ICE Restart triggers automatically; media recovers in <1.5s. |
| **RTC-HAND-02**| **4G → Wi-Fi Network Handoff** | Connect to Wi-Fi while streaming over cellular data. | Seamless ICE Restart without session termination. |
| **RTC-STAB-01**| **30-Minute Sustained Call** | Continuous 30-minute peer video call. | Zero memory leak; frame rate stays consistent; battery drain normal. |
| **RTC-DATA-01**| **Low-Data / Data Saver Mode** | Toggle "Data Saver for Calls" in settings. | Video resolution scales to 320x240 @ 15fps; bitrate capped. |
| **RTC-FALL-01**| **Audio-Only Fallback** | Critical packet loss (>15%) or low bandwidth. | Automatic video track suppression to preserve voice clarity. |
