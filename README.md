# Prep Master

Prep Master is a lightweight Node.js + Express study website. The default UI is white/light, with a batch search, Enroll popup, My Batches, batch details, subjects/topics, lectures, notes, DPP PDFs/videos, tests and Khazana routes.

## Run locally

1. Install Node.js 18 or newer.
2. In this folder run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

## Data connections

- Batch catalogue source: `https://prepmasterpw.vercel.app/api/batches`
- StreamVideo/PenPencil proxy base: `https://proxy.streamvideo.co.in/fetch`
- Frontend calls same-origin `/proxy/...` endpoints; StreamVideo API data is fetched by `server.js`, not directly by browser JavaScript.
- `GET /api/health` reports the server configuration.

## Important limitations

- The batch catalogue is a separate source from StreamVideo content. A batch's IDs must be compatible with the StreamVideo endpoints for its details/subjects to load.
- Proxying helps avoid browser CORS errors, but does not bypass provider authentication, 401/403 responses, or DRM.
- No working announcements endpoint or test-start/questions endpoint was supplied. The UI reports this instead of inventing endpoints.
- Lecture playback opens the supplied watch page. Whether that external page embeds or plays is controlled by that provider.

## Deployment

Deploy this folder to a Node.js host that runs `npm install` and `npm start`. Set the service's port through the `PORT` environment variable if your host requires it. Keep any provider credentials server-side; do not place secrets in `public/app.js`.
