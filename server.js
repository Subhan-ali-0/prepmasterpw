import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ORIGIN = process.env.UPSTREAM_API_ORIGIN || "https://www.learnxpw.site";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const allowedPaths = new Set([
  "/api/AllBatches", "/api/BatchInfo", "/api/SubjectInfo", "/api/TopicInfo",
  "/api/Schedule", "/api/video-url", "/api/play", "/api/get-otp",
  "/api/dpp-list", "/api/GetPdf", "/api/todays-schedule",
  "/api/batch-tests", "/api/test-instructions", "/api/auth/serverInfo",
  "/api/get-user-details-list"
]);

// Fixed-origin, allowlisted proxy. It does not accept an arbitrary target URL.
app.get("/proxy/*splat", async (req, res) => {
  try {
    const rawPath = "/" + (req.params.splat || []).join("/");
    if (!allowedPaths.has(rawPath)) return res.status(404).json({ error: "Endpoint not allowed" });

    const target = new URL(rawPath, API_ORIGIN);
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === "string") target.searchParams.set(key, value);
    }

    const upstream = await fetch(target, {
      headers: {
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "PrepMaster/1.0"
      },
      signal: AbortSignal.timeout(20000)
    });
    const contentType = upstream.headers.get("content-type") || "application/json";
    const body = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "no-store");
    res.send(body);
  } catch (err) {
    res.status(502).json({ error: "Upstream request failed", message: err.message });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "Prep Master" }));

app.get("*path", (req, res, next) => {
  if (req.path.startsWith("/proxy/") || req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Prep Master running on http://localhost:${PORT}`));
