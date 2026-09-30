# Lucky — Daily Tasks PWA

Voice-first daily task and reminder app. Speak in Telugu, Hindi or English — Lucky translates, saves, and reminds you. Tasks are stored in Firebase Firestore (per-device, anonymous auth).

---

## Project Structure

```
lucky/
├── index.html              ← App shell (markup only)
├── css/style.css           ← All styles
├── js/
│   ├── app.js              ← Main logic, render, filters, Firebase integration
│   ├── speech.js           ← Mic, speech recognition, TTS, voice commands
│   ├── translate.js        ← Keyless translation (Google web endpoint, MyMemory fallback)
│   ├── firebase.js         ← Firestore CRUD + anonymous auth
│   └── sw-register.js      ← Service worker registration
├── sw.js                   ← Service worker (cache: lucky-v1)
└── manifest.json           ← PWA manifest
```

---

## Firebase Setup (one-time)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Project: **Lucky-Daily-task** (already created, ID: `lucky-daily-task`)
3. **Firestore** → Create database → Start in **test mode** → Region: `asia-south1`
4. **Authentication** → Get started → Sign-in method → **Anonymous** → Enable → Save
5. Firebase config is already embedded in `index.html` — no changes needed

---

## Environment Variables

None. No API keys are needed.

---

## Deploy on Render

1. **Push this project to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Lucky PWA — initial release"
   git remote add origin https://github.com/Revanthvu4661/lucky-app.git
   git push -u origin main
   ```

2. **On Render:** [dashboard.render.com](https://dashboard.render.com)
   - New → **Static Site**
   - Connect your GitHub repo
   - Name: `lucky-daily-task`
   - Branch: `main`
   - Publish directory: `.` (root)
   - Build command: *(leave empty)*

3. Click **Deploy** — done ✅

4. In Firebase → Authentication → Settings → Authorized domains, add your `onrender.com` domain.

---

## Local Development

Just open `index.html` in Chrome (via a local server for mic access):

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

Then open `http://localhost:8080`


---

## Releasing Updates

1. Make your changes
2. Bump the cache version in `sw.js`: `lucky-v1` → `lucky-v2`
3. Push to GitHub — Render auto-deploys

---

## Tech Stack

- Vanilla JS (ES modules), no framework
- Firebase v10 (Firestore + Anonymous Auth)
- Keyless translation (Google web endpoint + MyMemory fallback)
- Web Speech API for mic + TTS
- PWA (service worker, manifest, installable)
- Hosted on Render (Static Site)
