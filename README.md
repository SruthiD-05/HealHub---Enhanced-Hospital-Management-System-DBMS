# HealHub OTP Backend – Setup Guide

## What's included
```
healhub-backend/
├── server.js               ← Node.js Express backend
├── package.json
├── .env.example            ← copy to .env when adding real SMS
└── HealHub_v5_backend.html ← updated frontend (calls the real backend)
```

---

## Step 1 — Install Node.js
Download from https://nodejs.org (choose LTS version)
Verify: `node -v` and `npm -v`

---

## Step 2 — Install dependencies
Open a terminal in this folder and run:
```bash
npm install
```

---

## Step 3 — Run the backend
```bash
npm start
# or for auto-reload during development:
npm run dev
```
You should see:
```
🏥 HealHub OTP Server running at http://localhost:3001
```

---

## Step 4 — Open the frontend
Open `HealHub_v5_backend.html` in your browser.
Log in as any role and click "View Report" on a patient — the OTP flow will now call the real backend.

> **Dev mode:** While no SMS provider is connected, the OTP is shown in the "SMS bubble" on screen (the backend logs it to terminal too). This is safe for testing.

---

## Step 5 — Add a real SMS provider (when ready)

### Option A — Twilio
1. Sign up at https://twilio.com
2. Get your Account SID, Auth Token, and a phone number
3. Run: `npm install twilio`
4. Copy `.env.example` to `.env` and fill in your Twilio credentials
5. In `server.js`, uncomment the Twilio block inside `sendSmsOtp()`
6. Remove `...(smsResult.mock ? { otp, mock: true } : {})` from the `/send-otp` response

### Option B — MSG91 (popular in India)
1. Sign up at https://msg91.com
2. Create an OTP template and get your auth key
3. Run: `npm install axios`
4. Uncomment the MSG91 block in `sendSmsOtp()`
5. Fill in `.env` with your MSG91 credentials

### Option C — Fast2SMS (cheapest in India)
1. Sign up at https://www.fast2sms.com
2. Get your API key
3. Use their REST API (similar to MSG91 block)

---

## Deploying the backend (optional)

### Render (free tier)
1. Push this folder to a GitHub repo
2. Go to https://render.com → New Web Service
3. Connect your repo, set build command: `npm install`, start command: `node server.js`
4. Copy the deployed URL (e.g. `https://healhub-otp.onrender.com`)
5. In `HealHub_v5_backend.html`, change:
   ```js
   const OTP_API = 'https://healhub-otp.onrender.com';
   ```

### Railway
1. Install Railway CLI: `npm install -g @railway/cli`
2. Run: `railway login` → `railway init` → `railway up`

---

## API Reference

### POST /send-otp
```json
Request:  { "patientId": "P001", "phone": "9876543210" }
Response: { "success": true, "sessionId": "uuid", "otp": "123456" }
// Note: 'otp' only returned in mock/dev mode
```

### POST /verify-otp
```json
Request:  { "sessionId": "uuid", "otp": "123456" }
Response: { "success": true, "patientId": "P001" }
// Error: { "error": "Incorrect OTP. Please try again.", "attemptsLeft": 4 }
```

### GET /health
```json
{ "status": "ok", "uptime": 123.45 }
```
