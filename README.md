# LNER 24‑Day Daily Quiz (Static Front‑End + Pluggable Backend)

This is a lightweight daily quiz that unlocks at **10:00** and closes at **16:00** in **Europe/London**. It runs for 24 days from a configurable start date. Answers are multiple choice. If the player answers correctly they can submit their name for the day’s prize draw. After 16:00, a winner is selected and displayed.

## What’s included

- **index.html** – single‑page app
- **style.css** – LNER‑ish modern UI
- **app.js** – time gating, answer flow, IP‑based single attempt
- **data/questions.json** – put your 24 questions here
- **backend/mock-local.js** – default “backend” using `localStorage` (good for prototyping)
- **backend/gsheet-adapter.js** – optional Google Sheets adapter
- **scripts/apps_script_code.gs** – Apps Script backend for Google Sheets
- **assets/lner-logo.svg** – placeholder logo

## Quick start (local or GitHub Pages)

1. Edit `index.html` config near the bottom:
   ```js
   const CONFIG = {
     startDateISO: '2025-12-01',  // first day
     totalDays: 24,
     tz: 'Europe/London',
     openHour: 10,
     closeHour: 16
   };
   ```
2. Put your 24 questions in `data/questions.json` (keep the structure).
3. Open `index.html` in a browser or host the folder (e.g. GitHub Pages).

> The default backend is **localStorage only**. Each browser stores its own entries and winners. This is perfect for UI testing. For real multi‑user draws, plug in a backend below.

## Production backend options

### Option A: Google Sheets (no server)

1. Create a new Google Sheet. Add tabs `entries`, `winners`.
2. Open **Extensions → Apps Script**, paste `scripts/apps_script_code.gs`.
3. Deploy: **Deploy → New deployment → Web app** → Who has access: **Anyone**.
4. Copy the deployed URL.
5. In `backend/gsheet-adapter.js`, set:
   ```js
   this.ENDPOINT = 'YOUR_DEPLOYED_URL';
   ```
6. In `index.html`, change:
   ```html
   <!-- import { Backend } from './backend/mock-local.js'; -->
   <script type="module">
     import { Backend } from './backend/gsheet-adapter.js';
     // ...
   </script>
   ```

The sheet will collect daily entries and store winners. The front end will automatically pick the winner at or after 16:00 if not already set.

### Option B: Your own API

Implement endpoints that mirror the `gsheet-adapter` actions:
- `addEntry({ dayIndex, name, ip })`
- `getEntries({ dayIndex })`
- `setWinner({ dayIndex, winner })`
- `getWinner({ dayIndex })`
- `getWinnersArchive({ totalDays })`

Return JSON. See adapter code for shapes.

## IP‑based single attempt

The app fetches the public IP using `https://api64.ipify.org?format=json` and stores a flag like `lnerq:attempt:<dayIndex>:<ip>` in `localStorage`. If the IP fetch fails, it still blocks repeat on the same device using a device‑scoped flag. This is deliberately light‑touch.

## Time zone and schedule

- All enforcement is based on **Europe/London**.
- Open window: **10:00–16:00** inclusive of start, exclusive of end.
- Winner display kicks in automatically after 16:00 (if a backend exists and entries are present).

## Styling

Colors loosely based on LNER reds. Tweak in `style.css` or by updating `brand` in the `CONFIG` object.

## Accessibility

- Buttons are keyboard operable.
- Live regions are used for status and winner reveal.
- Contrast meets WCAG AA for key elements.

## Notes & limits

- The mock backend does not sync across users.
- Google Sheets has quota limits; it’s fine for small campaigns.
- This repo is framework‑free and build‑free for easy GitHub Pages hosting.
