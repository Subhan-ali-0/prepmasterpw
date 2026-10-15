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
- Batch listing starts at `/api/AllBatches?page=1`. The observed response reports `totalPages: 682`, `pageSize: 20`, and `total: 13631`; the app now requests all pages in small groups and makes the loaded list searchable. It renders up to 120 cards at once for performance, with “Show more batches” to reveal more cards. Batch thumbnails can use the nested `previewImage.baseUrl + previewImage.key` shape returned by the API.
- The IDs in example endpoints are not hardcoded; IDs are taken from API responses.
- The actual API response schemas can vary. If an endpoint uses different field names, adjust the `pick()` key lists in `public/app.js`. For the observed BatchInfo response, subjects are in `data.subjects`, display names use `subject`, and the SubjectInfo URL uses the subject `slug` (for example `physics-688645`), not the internal `subjectId` field.
- Some providers may require authorization, cookies, valid signed URLs, or approved access. The proxy does not bypass authentication or access controls. Do not put private API keys or credentials in frontend code.
- The browser-internal `chrome-extension://.../pdf_viewer_wrapper.js` files are not API endpoints and are intentionally not used.
- Signed video URLs expire; resolve a fresh URL when a lesson is opened.
- The `get-otp` and user-details endpoints are allowlisted only for the app's authorized integration; this starter does not expose OTP secrets or list other users' private data.
- Test instructions can be requested, but starting a test and fetching/submitting questions must be connected to the provider's documented endpoints and response format. This app does not invent missing test APIs.
- For all batches to load, the API must permit paginated requests. The UI includes Load more rather than assuming page 1 contains everything.
- Footer text is exactly: **DEVELOPED BY SUBHAN ALI**.
- Telegram link: https://t.me/prepmaster0

## Final UI/content updates
- Batch cards use the title, banner image, audience/language, dates, price and Study/Enroll actions; tapping a card opens its details.
- Batch detail tabs: Tests, All Classes and Live Classes.
- Content filters: Lectures, DPPs, Notes, DPP PDFs and DPP Videos.
- Lectures open the supplied LearnXPW `/watch` page using the selected batch, subject, topic and lesson IDs. This depends on the upstream page allowing the user's access/session.
- Tests and DPPs open the supplied LearnXPW practice pages with IDs from the selected item where available.
- Notes use the GetPdf response `data.baseUrl + data.key`, direct attachment URLs, or the provided static notes PDF fallback.
- Footer text: `DEVELOPED BY SUBHAN ALI`.

The upstream APIs may require a valid authorized session and can return 403. The site does not bypass upstream authorization. Test/DPP and content IDs are mapped from fields present in the API response; if a particular batch uses different field names, those fields may need a mapping adjustment.
