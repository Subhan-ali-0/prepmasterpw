import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Batch catalogue supplied by the user. Fetched server-side so the browser only calls this site's proxy.
const BATCHES_SOURCE = "https://prepmasterpw.vercel.app/api/batches";
const STREAM_BASE = "https://proxy.streamvideo.co.in/fetch";
const KHazana = {
  programId: "62cc7a39ea773600110bec2f",
  subjectId: "62cc853e8f90fa001898321e",
  chapterId: "69c2695884245c85d1b3ddcb",
  topicId: "69c26b18f269271e6eadfe7b",
  subTopicId: "69c26b18974b391b3b603c8e"
};
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

async function sendUpstream(url, res) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json, text/plain, */*", "User-Agent": "PrepMaster/1.0" },
      signal: AbortSignal.timeout(20000)
    });
    const body = Buffer.from(await response.arrayBuffer());
    res.status(response.status)
      .set("Content-Type", response.headers.get("content-type") || "application/json; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(body);
  } catch (error) {
    res.status(502).json({ error: "Upstream request failed", message: error.message });
  }
}
function q(req, ...names) {
  for (const name of names) {
    const value = req.query[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
function streamUrl(pathname, params = {}) {
  // Concatenation is intentional: URL(base, '/path') would discard the required /fetch prefix.
  const url = new URL(`${STREAM_BASE}${pathname.startsWith("/") ? pathname : `/${pathname}`}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

// The frontend uses only same-origin /proxy requests; upstream URLs never run in browser JavaScript.
app.get("/proxy/api/AllBatches", async (_req, res) => sendUpstream(BATCHES_SOURCE, res));
app.get("/proxy/api/BatchInfo", async (req, res) => {
  const id = q(req, "BatchId", "batchId");
  if (!id) return res.status(400).json({ error: "BatchId is required" });
  if (q(req, "Type") === "announcement") return res.status(501).json({ error: "No announcements endpoint was supplied for this provider." });
  return sendUpstream(streamUrl(`/api.penpencil.co/v3/batches/${encodeURIComponent(id)}/details`), res);
});
app.get("/proxy/api/todays-schedule", async (req, res) => {
  const id = q(req, "BatchId", "batchId");
  if (!id) return res.status(400).json({ error: "BatchId is required" });
  return sendUpstream(streamUrl(`/api.penpencil.co/v2/batches/${encodeURIComponent(id)}/todays-schedule`), res);
});
app.get("/proxy/api/Schedule", async (req, res) => {
  const id = q(req, "BatchId", "batchId");
  if (!id) return res.status(400).json({ error: "BatchId is required" });
  return sendUpstream(streamUrl(`/api.penpencil.co/v2/batches/${encodeURIComponent(id)}/todays-schedule`, { page: q(req, "page") || "1" }), res);
});
app.get("/proxy/api/SubjectInfo", async (req, res) => {
  const batchId = q(req, "BatchId", "batchId"), subjectId = q(req, "SubjectId", "subjectId");
  if (!batchId || !subjectId) return res.status(400).json({ error: "BatchId and SubjectId are required" });
  return sendUpstream(streamUrl(`/api.penpencil.co/v2/batches/${encodeURIComponent(batchId)}/subject/${encodeURIComponent(subjectId)}/topics`, { page: q(req, "page") || "1" }), res);
});
app.get("/proxy/api/TopicInfo", async (req, res) => {
  const batchId = q(req, "BatchId", "batchId"), subjectId = q(req, "SubjectId", "subjectId"), topicId = q(req, "TopicId", "topicId");
  if (!batchId || !subjectId || !topicId) return res.status(400).json({ error: "BatchId, SubjectId and TopicId are required" });
  let contentType = q(req, "ContentType", "contentType") || "videos";
  if (contentType.toLowerCase() === "dpps") contentType = "DppVideos";
  if (contentType.toLowerCase() === "dpp-pdfs") contentType = "DppNotes";
  return sendUpstream(streamUrl(`/api.penpencil.co/v2/batches/${encodeURIComponent(batchId)}/subject/${encodeURIComponent(subjectId)}/contents`, { page: q(req, "page") || "1", contentType, tag: topicId }), res);
});
app.get("/proxy/api/batch-tests", async (req, res) => {
  const batchId = q(req, "batchId", "BatchId");
  if (!batchId) return res.status(400).json({ error: "batchId is required" });
  const params = { batchId, isSubjective: q(req, "isSubjective") || "false" };
  if (q(req, "categorySectionId")) params.categorySectionId = q(req, "categorySectionId");
  return sendUpstream(streamUrl("/api.penpencil.co/v3/test-service/tests", params), res);
});
app.get("/proxy/api/user-details", async (req, res) => {
  const userIds = q(req, "userIds");
  if (!userIds) return res.status(400).json({ error: "userIds is required" });
  return sendUpstream(streamUrl("/api.penpencil.co/v1/users/get-user-details-list", { userIds }), res);
});
app.get("/proxy/api/test-instructions", async (req, res) => {
  const testId = q(req, "testId", "TestId");
  if (!testId) return res.status(400).json({ error: "testId is required" });
  return sendUpstream(streamUrl(`/api.penpencil.co/v3/test-service/tests/${encodeURIComponent(testId)}/instructions`), res);
});
app.get("/proxy/api/dpp-tests", async (req, res) => {
  const batchId = q(req, "batchId", "BatchId"), subjectId = q(req, "batchSubjectId", "SubjectId", "subjectId"), chapterId = q(req, "chapterId", "TopicId", "topicId");
  if (!batchId || !subjectId || !chapterId) return res.status(400).json({ error: "batchId, batchSubjectId and chapterId are required" });
  return sendUpstream(streamUrl("/api.penpencil.co/v3/test-service/tests/dpp", { batchId, batchSubjectId: subjectId, chapterId, isSubjective: q(req, "isSubjective") || "false", page: q(req, "page") || "1" }), res);
});
app.get("/proxy/api/test-filters", async (req, res) => {
  const batchId = q(req, "batchId", "BatchId");
  if (!batchId) return res.status(400).json({ error: "batchId is required" });
  return sendUpstream(streamUrl("/api.penpencil.co/v3/test-service/tests/filters", { batchId, isSubjective: q(req, "isSubjective") || "false" }), res);
});

// Khazana endpoints supplied by the user, proxied through this server.
app.get("/proxy/api/khazana/filters", async (req, res) => sendUpstream(streamUrl(`/api.penpencil.co/v2/programs/${KHazana.programId}/filters`, { page: q(req, "page") || "1", limit: q(req, "limit") || "20" }), res));
app.get("/proxy/api/khazana/chapters", async (req, res) => sendUpstream(streamUrl(`/api.penpencil.co/v2/programs/${KHazana.programId}/subjects/${KHazana.subjectId}/chapters/list`, { page: q(req, "page") || "1", limit: q(req, "limit") || "20" }), res));
app.get("/proxy/api/khazana/topics", async (req, res) => sendUpstream(streamUrl(`/api.penpencil.co/v2/programs/${KHazana.programId}/subjects/${KHazana.subjectId}/chapters/${encodeURIComponent(q(req, "chapterId") || KHazana.chapterId)}/topics/list`, { page: q(req, "page") || "1", limit: q(req, "limit") || "20" }), res));
app.get("/proxy/api/khazana/sub-topics", async (req, res) => sendUpstream(streamUrl(`/api.penpencil.co/v2/programs/${KHazana.programId}/subjects/${KHazana.subjectId}/chapters/${encodeURIComponent(q(req, "chapterId") || KHazana.chapterId)}/topics/${encodeURIComponent(q(req, "topicId") || KHazana.topicId)}/contents/sub-topic`, { page: q(req, "page") || "1", limit: q(req, "limit") || "20" }), res));
app.get("/proxy/api/khazana/contents", async (req, res) => sendUpstream(streamUrl(`/api.penpencil.co/v2/programs/${KHazana.programId}/subjects/${KHazana.subjectId}/chapters/${encodeURIComponent(q(req, "chapterId") || KHazana.chapterId)}/topics/${encodeURIComponent(q(req, "topicId") || KHazana.topicId)}/sub-topic/${encodeURIComponent(q(req, "subTopicId") || KHazana.subTopicId)}/contents`, { page: q(req, "page") || "1", limit: q(req, "limit") || "20" }), res));

// Fixed-host proxy only: no arbitrary URL forwarding, credential injection, or access-control bypass.
app.get("/api/stream/*splat", async (req, res) => {
  const route = "/" + (req.params.splat || []).join("/");
  const allowed = ["/api.penpencil.co/v1/users/", "/api.penpencil.co/v2/batches/", "/api.penpencil.co/v2/programs/", "/api.penpencil.co/v3/batches/", "/api.penpencil.co/v3/test-service/"];
  if (!allowed.some(prefix => route.startsWith(prefix))) return res.status(404).json({ error: "StreamVideo route not allowed" });
  return sendUpstream(streamUrl(route, req.query), res);
});
app.get("/api/health", (_req, res) => res.json({ ok: true, app: "Prep Master", batchSource: BATCHES_SOURCE, contentSource: "StreamVideo/PenPencil through server proxy" }));
app.get("*path", (req, res, next) => {
  if (req.path.startsWith("/proxy/") || req.path.startsWith("/api/")) return next();
  return res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.listen(PORT, "0.0.0.0", () => console.log(`Prep Master running on port ${PORT}`));
