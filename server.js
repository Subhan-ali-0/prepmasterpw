
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const RARE_BATCHES =
  "https://rarestudy.github.io/rarestudy/batches.json?v=1792148560961";

const STREAM_BASE = "https://proxy.streamvideo.co.in/fetch";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(ROOT, "public")));

async function fetchUpstream(url, res) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "PrepMaster/1.0"
      },
      signal: AbortSignal.timeout(20000)
    });

    const body = Buffer.from(await response.arrayBuffer());

    res
      .status(response.status)
      .set(
        "Content-Type",
        response.headers.get("content-type") ||
          "application/json"
      )
      .set("Cache-Control", "no-store")
      .send(body);
  } catch (error) {
    res.status(502).json({
      error: "Upstream request failed",
      message: error.message
    });
  }
}

function param(req, ...keys) {
  for (const key of keys) {
    const value = req.query[key];
    if (value !== undefined && value !== "") {
      return String(value);
    }
  }
  return "";
}

function streamUrl(pathname, query = {}) {
  const url = new URL(pathname, STREAM_BASE);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "Prep Master",
    batchSource: "RareStudy",
    contentSource: "StreamVideo/PenPencil"
  });
});

// RareStudy: batch catalogue
app.get("/api/batches", async (_req, res) => {
  await fetchUpstream(RARE_BATCHES, res);
});

// StreamVideo: batch details
app.get("/api/batch-info", async (req, res) => {
  const batchId = param(req, "batchId", "BatchId");

  if (!batchId) {
    return res.status(400).json({
      error: "batchId is required"
    });
  }

  await fetchUpstream(
    streamUrl(
      `/api.penpencil.co/v3/batches/${encodeURIComponent(batchId)}/details`
    ),
    res
  );
});

// StreamVideo: today's classes
app.get("/api/todays-schedule", async (req, res) => {
  const batchId = param(req, "batchId", "BatchId");

  if (!batchId) {
    return res.status(400).json({
      error: "batchId is required"
    });
  }

  await fetchUpstream(
    streamUrl(
      `/api.penpencil.co/v2/batches/${encodeURIComponent(batchId)}/todays-schedule`
    ),
    res
  );
});

// StreamVideo: subjects/topics
app.get("/api/subjects", async (req, res) => {
  const batchId = param(req, "batchId", "BatchId");
  const subjectId = param(req, "subjectId", "SubjectId");

  if (!batchId || !subjectId) {
    return res.status(400).json({
      error: "batchId and subjectId are required"
    });
  }

  await fetchUpstream(
    streamUrl(
      `/api.penpencil.co/v2/batches/${encodeURIComponent(batchId)}/subject/${encodeURIComponent(subjectId)}/topics`,
      { page: param(req, "page") || "1" }
    ),
    res
  );
});

// StreamVideo: lectures, notes and DPP content
app.get("/api/lectures", async (req, res) => {
  const batchId = param(req, "batchId", "BatchId");
  const subjectId = param(req, "subjectId", "SubjectId");
  const topicId = param(req, "topicId", "TopicId");
  let contentType = param(req, "contentType", "ContentType") || "videos";

  const allowedTypes = [
    "videos",
    "notes",
    "DppNotes",
    "DppVideos"
  ];

  const matchedType = allowedTypes.find(
    type => type.toLowerCase() === contentType.toLowerCase()
  );

  if (!matchedType) {
    return res.status(400).json({
      error: "Unsupported contentType"
    });
  }

  if (!batchId || !subjectId || !topicId) {
    return res.status(400).json({
      error: "batchId, subjectId and topicId are required"
    });
  }

  await fetchUpstream(
    streamUrl(
      `/api.penpencil.co/v2/batches/${encodeURIComponent(batchId)}/subject/${encodeURIComponent(subjectId)}/contents`,
      {
        page: param(req, "page") || "1",
        contentType: matchedType,
        tag: topicId
      }
    ),
    res
  );
});

// StreamVideo: objective/subjective tests and DPP tests
app.get("/api/tests", async (req, res) => {
  const batchId = param(req, "batchId", "BatchId");

  if (!batchId) {
    return res.status(400).json({
      error: "batchId is required"
    });
  }

  const query = {
    batchId,
    isSubjective: param(req, "isSubjective") || "false"
  };

  const categorySectionId = param(req, "categorySectionId");
  if (categorySectionId) {
    query.categorySectionId = categorySectionId;
  }

  await fetchUpstream(
    streamUrl("/api.penpencil.co/v3/test-service/tests", query),
    res
  );
});

app.get("/api/dpp-tests", async (req, res) => {
  const batchId = param(req, "batchId", "BatchId");
  const subjectId = param(req, "subjectId", "SubjectId");
  const chapterId = param(req, "chapterId", "ChapterId");

  if (!batchId || !subjectId || !chapterId) {
    return res.status(400).json({
      error: "batchId, subjectId and chapterId are required"
    });
  }

  await fetchUpstream(
    streamUrl("/api.penpencil.co/v3/test-service/tests/dpp", {
      batchId,
      batchSubjectId: subjectId,
      chapterId,
      isSubjective: param(req, "isSubjective") || "false",
      page: param(req, "page") || "1"
    }),
    res
  );
});

// StreamVideo: test instructions
app.get("/api/test-instructions", async (req, res) => {
  const testId = param(req, "testId", "TestId");

  if (!testId) {
    return res.status(400).json({
      error: "testId is required"
    });
  }

  await fetchUpstream(
    streamUrl(
      `/api.penpencil.co/v3/test-service/tests/${encodeURIComponent(testId)}/instructions`
    ),
    res
  );
});

// StreamVideo: Khazana API paths
// Only fixed, supported PenPencil paths are accepted.
app.get("/api/khazana/*path", async (req, res) => {
  const pathParts = req.params.path || [];
  const pathname = "/" + pathParts.join("/");

  const allowed =
    /^\/api\.penpencil\.co\/v2\/programs\/[a-zA-Z0-9_-]+\/filters$/.test(pathname) ||
    /^\/api\.penpencil\.co\/v2\/programs\/[a-zA-Z0-9_-]+\/subjects\/[a-zA-Z0-9_-]+\/chapters\/list$/.test(pathname) ||
    /^\/api\.penpencil\.co\/v2\/programs\/[a-zA-Z0-9_-]+\/subjects\/[a-zA-Z0-9_-]+\/chapters\/[a-zA-Z0-9_-]+\/topics\/list$/.test(pathname) ||
    /^\/api\.penpencil\.co\/v2\/programs\/[a-zA-Z0-9_-]+\/subjects\/[a-zA-Z0-9_-]+\/chapters\/[a-zA-Z0-9_-]+\/topics\/[a-zA-Z0-9_-]+\/contents\/sub-topic$/.test(pathname) ||
    /^\/api\.penpencil\.co\/v2\/programs\/[a-zA-Z0-9_-]+\/subjects\/[a-zA-Z0-9_-]+\/chapters\/[a-zA-Z0-9_-]+\/topics\/[a-zA-Z0-9_-]+\/sub-topic\/[a-zA-Z0-9_-]+\/contents$/.test(pathname);

  if (!allowed) {
    return res.status(404).json({
      error: "Khazana route not allowed"
    });
  }

  await fetchUpstream(streamUrl(pathname, req.query), res);
});

// Announcements API was not included in the supplied
// StreamVideo endpoint list. Do not silently call another provider.
app.get("/api/announcements", (_req, res) => {
  res.status(501).json({
    error: "No StreamVideo announcements endpoint has been supplied yet."
  });
});

// Friendly fallback for the website
app.get("*path", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(ROOT, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Prep Master running on port ${PORT}`);
});
