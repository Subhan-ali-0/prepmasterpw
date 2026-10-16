# Prep Master API connections

All API data requests from the website use same-origin `/proxy/...` routes. The browser does not fetch StreamVideo/PenPencil API URLs directly. The server fetches the user-supplied batch catalogue at `https://prepmasterpw.vercel.app/api/batches` and the supplied StreamVideo proxy endpoints.

## Batch catalogue
- `GET /proxy/api/AllBatches` -> `https://prepmasterpw.vercel.app/api/batches`

## StreamVideo/PenPencil routes
- `GET /proxy/api/BatchInfo?BatchId={BatchId}&Type=details` -> batch details
- `GET /proxy/api/todays-schedule?BatchId={BatchId}` -> today's schedule
- `GET /proxy/api/Schedule?BatchId={BatchId}&page=1` -> schedule route
- `GET /proxy/api/SubjectInfo?BatchId={BatchId}&SubjectId={SubjectId}&page=1` -> subject topics
- `GET /proxy/api/TopicInfo?BatchId={BatchId}&SubjectId={SubjectId}&TopicId={TopicId}&ContentType=videos&page=1` -> lectures
- `GET /proxy/api/TopicInfo?...&ContentType=notes&page=1` -> notes
- `GET /proxy/api/TopicInfo?...&ContentType=DppNotes&page=1` -> DPP PDFs
- `GET /proxy/api/TopicInfo?...&ContentType=DppVideos&page=1` -> DPP videos
- `GET /proxy/api/batch-tests?batchId={BatchId}&isSubjective=false` -> objective tests
- `GET /proxy/api/test-filters?batchId={BatchId}&isSubjective=false` -> test filters
- `GET /proxy/api/test-instructions?testId={TestId}` -> test instructions
- `GET /proxy/api/dpp-tests?batchId={BatchId}&batchSubjectId={SubjectId}&chapterId={TopicId}&isSubjective=false&page=1` -> DPP tests
- `GET /proxy/api/khazana/filters?page=1&limit=20` -> Khazana filters
- `GET /proxy/api/khazana/chapters?page=1&limit=20` -> Khazana chapters
- `GET /proxy/api/khazana/topics?chapterId={ChapterId}&page=1&limit=20` -> Khazana topics
- `GET /proxy/api/khazana/sub-topics?chapterId={ChapterId}&topicId={TopicId}&page=1&limit=20` -> Khazana sub-topics
- `GET /proxy/api/khazana/contents?chapterId={ChapterId}&topicId={TopicId}&subTopicId={SubTopicId}&page=1&limit=20` -> Khazana contents

## Notes
- The batch catalogue is fetched server-side from the exact URL supplied by the user.
- StreamVideo/PenPencil requests are fetched server-side through this site's proxy to avoid browser CORS failures. CORS proxying does not bypass upstream 401/403 access controls or DRM.
- Announcements and test-start/questions were not included as usable endpoints in the supplied list; the UI reports that rather than inventing a URL.
- Lecture playback opens the supplied watch page URL; third-party pages may control their own branding and embedding policy.
