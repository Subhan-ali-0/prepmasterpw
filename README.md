# Prep Master

A responsive Prep Master learning portal inspired by the screenshots provided:
- Home batch catalogue with search, batch cards, Study and Enroll actions
- Side drawer with Study, Batches, My Batches, Join Telegram, Test Series
- Batch page with Description, All Classes, Tests, Infinity Learning, today's class, subjects, topics and lesson types
- Light/dark theme
- Express server-side proxy with a fixed upstream host and endpoint allowlist

## Run locally
Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Deploy
Deploy this folder to a Node.js host that supports Express (Render, Railway, or a compatible Node service). Set the start command to `npm start`. The app serves both the frontend and `/proxy/...` API routes from the same origin.

Optional environment variable:
- `UPSTREAM_API_ORIGIN` (default `https://www.learnxpw.site`)

## Important API notes
- Batch listing starts at `/api/AllBatches?page=1`; pagination is loaded using response metadata when available. If the API omits total-page metadata, the Load more button remains available while the API returns items.
- The IDs in example endpoints are not hardcoded; IDs are taken from API responses.
- The actual API response schemas can vary. If an endpoint uses different field names, adjust the `pick()` key lists in `public/app.js`.
- Some providers may require authorization, cookies, valid signed URLs, or approved access. The proxy does not bypass authentication or access controls. Do not put private API keys or credentials in frontend code.
- The browser-internal `chrome-extension://.../pdf_viewer_wrapper.js` files are not API endpoints and are intentionally not used.
- Signed video URLs expire; resolve a fresh URL when a lesson is opened.
- The `get-otp` and user-details endpoints are allowlisted only for the app's authorized integration; this starter does not expose OTP secrets or list other users' private data.
- Test instructions can be requested, but starting a test and fetching/submitting questions must be connected to the provider's documented endpoints and response format. This app does not invent missing test APIs.
- For all batches to load, the API must permit paginated requests. The UI includes Load more rather than assuming page 1 contains everything.
- Footer text is exactly: **DEVELOPED BY SUBHAN ALI**.
- Telegram link: https://t.me/prepmaster0
