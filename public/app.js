
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  page: "batches",
  batches: [],
  pageNo: 1,
  hasMore: true,
  query: "",
  batch: null,
  batchId: "",
  subjects: [],
  subject: null,
  topics: [],
  topic: null,
  contentType: "videos",
  lessons: [],
  lesson: null,
  detailTab: "description",
  tests: [],
  loadingAll: false,
  visibleLimit: 120,
  showFavourites: false
};

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function pick(obj, keys, fallback = "") {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return fallback;
}

function listFrom(payload, kind = "generic", depth = 0) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object" || depth > 7) return [];

  const preferred = {
    batches: ["batches", "items", "results", "docs", "list"],
    subjects: ["subjects", "Subjects", "subjectList", "subject_list", "batchSubjects", "items", "results", "data"],
    topics: ["topics", "chapters", "chapterList", "topicList", "contents", "items", "results", "data", "docs", "list"],
    lessons: ["videos", "notes", "dppVideos", "dppNotes", "contents", "contentList", "items", "results", "data", "docs", "list"],
    tests: ["tests", "testList", "testSeries", "items", "results", "data", "docs", "list"],
    announcements: ["announcements", "items", "results", "data", "docs", "list"]
  }[kind] || ["items", "results", "data", "list"];

  for (const key of preferred) {
    const value = payload[key];

    if (Array.isArray(value)) return value;

    if (value && typeof value === "object") {
      const nested = listFrom(value, kind, depth + 1);
      if (nested.length) return nested;
    }
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value) && value.some(item => item && typeof item === "object")) {
      return value;
    }

    if (value && typeof value === "object") {
      const nested = listFrom(value, kind, depth + 1);
      if (nested.length) return nested;
    }
  }

  return [];
}

function pageMeta(payload) {
  const candidates = [
    payload,
    payload?.data,
    payload?.pagination,
    payload?.meta,
    payload?.data?.pagination,
    payload?.data?.meta
  ].filter(Boolean);

  const get = keys => {
    for (const obj of candidates) {
      for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
          return Number(obj[key]) || 0;
        }
      }
    }
    return 0;
  };

  return {
    currentPage: get(["currentPage", "current_page", "page"]),
    totalPages: get(["totalPages", "total_pages", "totalPage", "lastPage", "last_page"]),
    pageSize: get(["pageSize", "page_size", "limit", "perPage", "per_page"]),
    total: get(["total", "totalCount", "total_count", "count"])
  };
}

function nestedImage(value) {
  if (typeof value === "string") return value;

  if (value && typeof value === "object") {
    const direct = pick(value, ["url", "src", "uri", "imageUrl", "image_url"]);
    if (direct) return direct;

    const base = pick(value, ["baseUrl", "base_url"]);
    const key = pick(value, ["key", "path", "filePath"]);

    if (base && key) {
      return base.replace(/\/$/, "") + "/" + key.replace(/^\//, "");
    }
  }

  return "";
}

async function api(path, params = {}) {
  const qs = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      qs.set(key, String(value));
    }
  });

  const url = `/proxy${path}${qs.size ? `?${qs}` : ""}`;
  const response = await fetch(url);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${text.slice(0, 200)}`);
  }

  if (contentType.includes("json") || /^[\s]*[\[{]/.test(text)) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("API ne invalid JSON return kiya.");
    }
  }

  return text;
}

function toast(message) {
  const el = $("#toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function setPage(name) {
  state.page = name;

  $("#batchListPage")?.classList.toggle(
    "hidden",
    !["batches", "mybatches", "study"].includes(name)
  );

  $("#batchDetailPage")?.classList.toggle("hidden", name !== "detail");

  $("#comingSoonPage")?.classList.toggle(
    "hidden",
    !["tests", "pi", "books"].includes(name)
  );

  if (["tests", "pi", "books"].includes(name) && $("#comingTitle")) {
    $("#comingTitle").textContent =
      name === "books" ? "PW Books" : name === "pi" ? "Pi" : "Test Series";
  }

  if ($("#homeHeading")) {
    $("#homeHeading").textContent =
      ["mybatches", "study"].includes(name) ? "My Batches" : "Popular courses";
  }

  renderBatches();

  $("#backBtn")?.classList.toggle("hidden", name !== "detail");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function batchId(batch) {
  return pick(batch, ["_id", "BatchId", "batchId", "batch_id", "id"]);
}

function batchName(batch) {
  return pick(batch, ["name", "batchName", "BatchName", "title", "batch_name", "courseName"], "Untitled Batch");
}

function imageUrl(batch) {
  return nestedImage(pick(batch, [
    "previewImage",
    "previewImageUrl",
    "iosPreviewImageUrl",
    "image",
    "batchImage",
    "batch_image",
    "batchBanner",
    "bannerUrl",
    "banner",
    "thumbnail",
    "thumbnailUrl",
    "thumbnail_url",
    "coverImage",
    "cover_image",
    "imageUrl",
    "image_url",
    "img"
  ]));
}

function batchDates(batch) {
  const start = pick(batch, ["startDate", "start_date", "batchStartDate", "startsOn"]);
  const end = pick(batch, ["endDate", "end_date", "batchEndDate", "endsOn"]);

  return [
    start ? `Starts on ${formatDate(start)}` : "",
    end ? `Ends on ${formatDate(end)}` : ""
  ].filter(Boolean).join(" | ");
}

function formatDate(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
}

function getStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function renderBatches() {
  const enrolled = getStoredArray("pm-enrolled-batches");
  const favourites = getStoredArray("pm-favourite-batches");
  const onlyMine = ["mybatches", "study"].includes(state.page);

  const filtered = state.batches.filter(batch =>
    batchName(batch).toLowerCase().includes(state.query.toLowerCase()) &&
    (!onlyMine || enrolled.includes(String(batchId(batch)))) &&
    (!state.showFavourites || favourites.includes(String(batchId(batch))))
  );

  const visible = filtered.slice(0, state.visibleLimit || 120);

  if ($("#batchCount")) {
    $("#batchCount").textContent =
      `${filtered.length} batches${state.query ? " found" : ""}`;
  }

  if ($("#batchGrid")) {
    $("#batchGrid").innerHTML = visible.map(batch => {
      const id = batchId(batch);
      const name = batchName(batch);
      const img = imageUrl(batch);
      const dates = batchDates(batch);
      const language = pick(batch, ["language", "medium", "batchLanguage"]);

      return `
        <article class="batch-card">
          ${
            img
              ? `<img class="batch-cover" src="${esc(img)}" alt="${esc(name)}" loading="lazy">`
              : `<div class="batch-cover fallback">${esc(name)}</div>`
          }
          <div class="batch-card-body">
            <div class="batch-title-row">
              <h2>${esc(name)}</h2>
              <button class="favourite-btn" data-fav="${esc(id)}" aria-label="Favourite batch">
                ${favourites.includes(String(id)) ? "❤️" : "♡"}
              </button>
            </div>
            <div class="batch-kicker">Batch</div>
            <div class="batch-meta">
              <div class="meta-line">▤ &nbsp;Boards / Foundation</div>
              ${language ? `<div class="meta-line">♙ &nbsp;${esc(language)}</div>` : ""}
              ${dates ? `<div class="meta-line">🔴 &nbsp;Ongoing | ${esc(dates)}</div>` : ""}
            </div>
            <div class="price-row">
              <span class="price">FREE</span>
              <span class="free-tag">100% OFF</span>
            </div>
            <div class="card-actions">
              <button class="enroll-btn" data-enroll="${esc(id)}">
                ${enrolled.includes(String(id)) ? "Enrolled ✓" : "Enroll"}
              </button>
              <button class="arrow-btn" aria-label="Open batch" data-open="${esc(id)}">›</button>
            </div>
          </div>
        </article>
      `;
    }).join("");

    $("#batchGrid").querySelectorAll(".batch-cover img").forEach(img => {
      img.addEventListener("error", () => {
        const fallback = document.createElement("div");
        fallback.className = "batch-cover fallback";
        fallback.textContent = img.alt || "Batch";
        img.replaceWith(fallback);
      }, { once: true });
    });
  }

  if ($("#listMessage")) {
    $("#listMessage").textContent = filtered.length
      ? ""
      : onlyMine
        ? "You haven't enrolled in any batches yet. Open Batches and tap Enroll."
        : state.query
          ? "No matching batches found."
          : "No batches returned by the API.";
  }

  if ($("#loadMoreBtn")) {
    $("#loadMoreBtn").textContent =
      visible.length < filtered.length
        ? `Show more batches (${filtered.length - visible.length} remaining)`
        : "All visible batches shown";

    $("#loadMoreBtn").classList.toggle("hidden", visible.length >= filtered.length);
    $("#loadMoreBtn").disabled = visible.length >= filtered.length;
  }
}

async function loadBatches(reset = false) {
  if (state.loadingAll) return;

  if (reset) {
    state.pageNo = 1;
    state.batches = [];
    state.hasMore = true;
    state.allLoaded = false;
  }

  state.loadingAll = true;

  if ($("#batchCount")) $("#batchCount").textContent = "Loading batches…";
  if ($("#listMessage")) $("#listMessage").textContent = "Fetching batches…";

  try {
    const response = await fetch("/api/batches?page=1");
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Batch API ${response.status}: ${text.slice(0, 200)}`);
    }

    let payload;

    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("Batch API ne valid JSON return nahi kiya.");
    }

    const items = listFrom(payload, "batches");

    if (!items.length) {
      throw new Error("Batch JSON mein batches ki array nahi mili.");
    }

    state.batches = items;
    state.allLoaded = true;
    state.hasMore = false;

    renderBatches();

    if ($("#batchCount")) {
      $("#batchCount").textContent = `${items.length.toLocaleString()} batches loaded`;
    }

    if ($("#listMessage")) {
      $("#listMessage").textContent = "Batches loaded. Search to find a batch.";
    }
  } catch (error) {
    if ($("#batchCount")) {
      $("#batchCount").textContent = state.batches.length
        ? `${state.batches.length} batches loaded`
        : "Batches unavailable";
    }

    if ($("#listMessage")) {
      $("#listMessage").textContent = error.message;
    }

    renderBatches();
  } finally {
    state.loadingAll = false;
  }
}

function showDetailPanels(tab) {
  state.detailTab = tab;

  $("#descriptionPanel")?.classList.add("hidden");
  $("#todayCard")?.classList.remove("hidden");
  $("#subjectsPanel")?.classList.toggle("hidden", tab !== "classes");
  $("#testsPanel")?.classList.toggle("hidden", tab !== "tests");
  $("#announcementsPanel")?.classList.toggle("hidden", tab !== "announcements");
  $("#chaptersPanel")?.classList.add("hidden");
  $("#contentPanel")?.classList.add("hidden");
  $("#playerPanel")?.classList.add("hidden");

  $$(".detail-tab").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  if (tab === "classes" || tab === "khazana") loadSubjects();
  if (tab === "tests") loadTests();
  if (tab === "announcements") loadAnnouncements();

  if (tab === "live") {
    api("/api/todays-schedule", { BatchId: state.batchId })
      .catch(() => api("/api/Schedule", { BatchId: state.batchId, page: 1 }))
      .then(payload => {
        const items = listFrom(payload);
        const matched = items.filter(item =>
          String(pick(item, ["batchId", "BatchId", "batch_id"], state.batchId)) === String(state.batchId)
        );

        if ($("#todayContent")) {
          $("#todayContent").textContent = matched.length
            ? matched.map(item => pick(item, ["title", "name", "topic", "subjectName"], "Live class")).join(" • ")
            : "No live class is scheduled right now.";
        }
      })
      .catch(() => {
        if ($("#todayContent")) {
          $("#todayContent").textContent = "Live class schedule is unavailable.";
        }
      });
  }
}

async function openBatch(id) {
  if (!id) return toast("Batch ID is missing in API response.");

  state.batchId = id;
  state.batch = state.batches.find(batch => String(batchId(batch)) === String(id)) || null;
  state.subjects = [];
  state.topics = [];
  state.lessons = [];

  if ($("#detailTitle")) $("#detailTitle").textContent = batchName(state.batch || {});
  if ($("#batchDescription")) $("#batchDescription").textContent = "Loading details…";
  if ($("#todayContent")) $("#todayContent").textContent = "Loading schedule…";

  setPage("detail");
  showDetailPanels("classes");

  try {
    const details = await api("/api/BatchInfo", {
      BatchId: id,
      Type: "details"
    });

    const data = details?.data || details?.batch || details;

    if (data && typeof data === "object") {
      state.batch = { ...(state.batch || {}), ...data };
    }

    if ($("#detailTitle")) {
      $("#detailTitle").textContent = batchName(state.batch || {});
    }

    const description = pick(
      state.batch,
      ["description", "batchDescription", "about", "details", "overview"],
      "No description was returned by the API."
    );

    if ($("#batchDescription")) {
      $("#batchDescription").textContent = String(description).replace(/<[^>]*>/g, " ").trim();
    }
  } catch (error) {
    if ($("#batchDescription")) {
      $("#batchDescription").textContent = `Batch details could not load: ${error.message}`;
    }
  }

  try {
    let schedule;

    try {
      schedule = await api("/api/todays-schedule", { BatchId: id });
    } catch {
      schedule = await api("/api/Schedule", { BatchId: id, page: 1 });
    }

    const items = listFrom(schedule);
    const matched = items.filter(item =>
      String(pick(item, ["batchId", "BatchId", "batch_id"], id)) === String(id)
    );

    if ($("#todayContent")) {
      $("#todayContent").textContent = matched.length
        ? matched.map(item => pick(item, ["title", "name", "topic", "subjectName"], "Scheduled class")).join(" • ")
        : "Classes not Scheduled yet";
    }
  } catch {
    if ($("#todayContent")) $("#todayContent").textContent = "Classes not Scheduled yet";
  }
}

function subjectId(subject) {
  if (typeof subject === "string" || typeof subject === "number") {
    return String(subject);
  }

  return pick(subject, [
    "subjectId",
    "SubjectId",
    "subject_id",
    "id",
    "_id",
    "slug",
    "subjectSlug",
    "subject_slug"
  ]);
}

function subjectName(subject) {
  if (typeof subject === "string" || typeof subject === "number") {
    return String(subject);
  }

  return pick(subject, [
    "subjectName",
    "SubjectName",
    "subject",
    "name",
    "title"
  ], "Subject");
}

function collectSubjects(batch) {
  const candidates = [
    batch?.subjects,
    batch?.Subjects,
    batch?.subjectList,
    batch?.subject_list,
    batch?.batchSubjects,
    batch?.batchSubject,
    batch?.data?.subjects,
    batch?.data?.Subjects,
    batch?.data?.subjectList,
    batch?.details?.subjects,
    batch?.result?.subjects
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) {
      return candidate;
    }
  }

  return listFrom(batch, "subjects").filter(item =>
    typeof item === "string" ||
    subjectId(item) ||
    pick(item, ["subjectName", "SubjectName", "subject", "name", "title"])
  );
}

function renderSubjects() {
  const container = $("#subjectList");
  if (!container) return;

  if (!state.subjects.length) {
    container.innerHTML = `
      <p class="message">
        Batch details mein subject list nahi mili. SubjectInfo API ko
        valid SubjectId chahiye; actual API response check karna hoga.
      </p>`;
    return;
  }

  container.innerHTML = state.subjects.map((subject, index) => `
    <button class="subject-item" data-subject="${index}">
      <span class="subject-icon">${["▧", "⚗", "♧", "∑", "📖"][index % 5]}</span>
      <span>
        <strong>${esc(subjectName(subject))}</strong>
        <small>${esc(pick(subject, ["chapterCount", "chaptersCount", "totalChapters"], "Open subject"))}</small>
      </span>
    </button>
  `).join("");
}

async function loadSubjects() {
  const container = $("#subjectList");
  if (!container) return;

  container.innerHTML = "<p class='message'>Loading subjects…</p>";

  try {
    const details = await api("/api/BatchInfo", {
      BatchId: state.batchId,
      Type: "details"
    });

    const batch = details?.data || details?.batch || details?.result || details;

    if (batch && typeof batch === "object") {
      state.batch = { ...(state.batch || {}), ...batch };
    }

    let subjects = collectSubjects(batch);

    if (!subjects.length) {
      subjects = collectSubjects(state.batch);
    }

    state.subjects = subjects
      .filter(subject => subjectId(subject))
      .map(subject => {
        if (typeof subject === "string" || typeof subject === "number") {
          return {
            id: String(subject),
            subjectId: String(subject),
            subjectName: String(subject),
            name: String(subject)
          };
        }

        return subject;
      });

    renderSubjects();

    if (!state.subjects.length) {
      container.innerHTML = `
        <p class="message">
          BatchInfo request successful hai, lekin response mein
          subject IDs nahi mile. SubjectInfo ko call karne ke liye
          actual subject ID required hai.
        </p>`;
    }
  } catch (error) {
    container.innerHTML = `
      <p class="message">
        Subjects load nahi hue: ${esc(error.message)}
      </p>`;
  }
}

function topicId(topic) {
  return pick(topic, [
    "topicId",
    "TopicId",
    "topic_id",
    "chapterId",
    "chapter_id",
    "id",
    "_id",
    "slug"
  ]);
}

async function openSubject(index) {
  const subject = state.subjects[index];
  if (!subject) return;

  state.subject = subject;
  state.topics = [];

  const id = subjectId(subject);

  if (!id) {
    toast("Subject ID not found in API response.");
    return;
  }

  if ($("#chapterHeading")) $("#chapterHeading").textContent = subjectName(subject);

  $("#subjectsPanel")?.classList.add("hidden");
  $("#todayCard")?.classList.add("hidden");
  $("#chaptersPanel")?.classList.remove("hidden");

  if ($("#chapterList")) {
    $("#chapterList").innerHTML = "<p class='message'>Loading chapters/topics…</p>";
  }

  try {
    const payload = await api("/api/SubjectInfo", {
      BatchId: state.batchId,
      SubjectId: id,
      page: 1
    });

    state.topics = listFrom(payload, "topics");

    const renderTopics = () => {
      if (!$("#chapterList")) return;

      $("#chapterList").innerHTML = state.topics.length
        ? state.topics.map((topic, index) => `
            <button class="subject-item" data-topic="${index}">
              <span class="subject-icon">▤</span>
              <span>
                <strong>${esc(pick(topic, ["topicName", "chapterName", "name", "title", "topic", "tag"], "Topic"))}</strong>
                <small>${esc(pick(topic, ["contentCount", "totalVideos", "count", "lectureCount"], "Open topic"))}</small>
              </span>
            </button>
          `).join("")
        : "<p class='message'>SubjectInfo ne topics ki list return nahi ki.</p>";
    };

    renderTopics();

    const meta = pageMeta(payload);
    const pages = Math.min(meta.totalPages || 1, 100);

    for (let page = 2; page <= pages; page++) {
      const next = await api("/api/SubjectInfo", {
        BatchId: state.batchId,
        SubjectId: id,
        page
      });

      state.topics.push(...listFrom(next, "topics"));
    }

    renderTopics();
  } catch (error) {
    if ($("#chapterList")) {
      $("#chapterList").innerHTML =
        `<p class="message">Topics could not load: ${esc(error.message)}</p>`;
    }
  }
}

async function openTopic(index) {
  const topic = state.topics[index];
  if (!topic) return;

  state.topic = topic;

  if ($("#contentHeading")) {
    $("#contentHeading").textContent =
      pick(topic, ["topicName", "chapterName", "name", "title"], "Lessons");
  }

  $("#chaptersPanel")?.classList.add("hidden");
  $("#contentPanel")?.classList.remove("hidden");

  await loadLessons("videos");
}

async function loadLessons(type) {
  if (type === "dpps") type = "DppVideos";
  if (type === "dpp-pdfs") type = "DppNotes";

  state.contentType = type;

  $$(".filter").forEach(button => {
    button.classList.toggle("active", button.dataset.content === type);
  });

  if ($("#lessonList")) {
    $("#lessonList").innerHTML = "<p class='message'>Loading content…</p>";
  }

  const sid = subjectId(state.subject);
  const tid = topicId(state.topic);

  if (!sid || !tid) {
    if ($("#lessonList")) {
      $("#lessonList").innerHTML =
        "<p class='message'>Subject ID ya Topic ID missing hai.</p>";
    }
    return;
  }

  try {
    const payload = await api("/api/TopicInfo", {
      BatchId: state.batchId,
      SubjectId: sid,
      TopicId: tid,
      ContentType: type,
      page: 1
    });

    state.lessons = listFrom(payload, "lessons");

    const meta = pageMeta(payload);
    const pages = Math.min(meta.totalPages || 1, 100);

    for (let page = 2; page <= pages; page++) {
      const next = await api("/api/TopicInfo", {
        BatchId: state.batchId,
        SubjectId: sid,
        TopicId: tid,
        ContentType: type,
        page
      });

      state.lessons.push(...listFrom(next, "lessons"));
    }

    if ($("#lessonList")) {
      $("#lessonList").innerHTML = state.lessons.length
        ? state.lessons.map((lesson, index) => `
            <button class="subject-item" data-lesson="${index}">
              <span class="subject-icon">${type.toLowerCase().includes("note") ? "▤" : "▶"}</span>
              <span>
                <strong>${esc(pick(lesson, ["name", "title", "topicName", "contentName", "videoName", "lessonName", "fileName", "attachmentName"], `${type} ${index + 1}`))}</strong>
                <small>${esc(pick(lesson, ["duration", "date", "type"], type))}</small>
              </span>
            </button>
          `).join("")
        : `<p class="message">No ${esc(type)} found for this topic.</p>`;
    }
  } catch (error) {
    if ($("#lessonList")) {
      $("#lessonList").innerHTML =
        `<p class="message">Content unavailable: ${esc(error.message)}</p>`;
    }
  }
}

function watchPageUrl(lesson) {
  const id = pick(lesson, [
    "contentId", "ContentId", "videoId", "video_id", "id", "_id", "scheduleId"
  ]);

  const topic = topicId(state.topic) || "";
  const subject = subjectId(state.subject) || "";
  const type = pick(lesson, ["type", "videoType", "contentType"], "penpencilvdo");

  const params = new URLSearchParams({
    batchId: state.batchId,
    SubjectId: subject,
    ChildId: id,
    videoId: id,
    topicId: topic,
    scheduleId: pick(lesson, ["scheduleId", "batchScheduleId"], id),
    Type: type,
    isLocked: "false"
  });

  return `https://m.pwmarco.site/live?${params.toString()}`;
}

function pdfUrlFrom(payload) {
  const data = payload?.data || payload?.result || payload;

  if (typeof data === "string" && /^https?:\/\//i.test(data)) {
    return data;
  }

  const direct = pick(data, [
    "url", "pdfUrl", "fileUrl", "link", "downloadUrl", "attachmentUrl", "src"
  ]);

  if (typeof direct === "string" && /^https?:\/\//i.test(direct)) {
    return direct;
  }

  const base = pick(data, ["baseUrl", "base_url"]);
  const key = pick(data, ["key", "fileKey", "path"]);

  if (base && key) {
    return base.replace(/\/$/, "") + "/" + key.replace(/^\//, "");
  }

  const attachment = data?.attachment || data?.attachments?.[0] || data?.file;

  return attachment ? pdfUrlFrom(attachment) : "";
}

async function openLesson(index) {
  const lesson = state.lessons[index];
  if (!lesson) return;

  state.lesson = lesson;

  const kind = state.contentType.toLowerCase();
  const title = pick(
    lesson,
    ["name", "title", "videoName", "contentName", "lessonName", "fileName", "attachmentName"],
    "Lesson"
  );

  if (kind.includes("note") || kind.includes("pdf")) {
    const url = pdfUrlFrom(lesson);

    if (url) {
      window.open(url, "_blank", "noopener");
      toast("Notes PDF opened");
    } else {
      toast("PDF URL response mein nahi mila.");
    }

    return;
  }

  const url = watchPageUrl(lesson);
  window.open(url, "_blank", "noopener");

  toast("Lecture watch page opened");

  $("#contentPanel")?.classList.add("hidden");
  $("#playerPanel")?.classList.remove("hidden");

  if ($("#playerTitle")) $("#playerTitle").textContent = title;

  if ($("#playerWrap")) {
    $("#playerWrap").innerHTML = `
      <div class="watch-fallback">
        <p>Lecture watch page opened in a new tab.</p>
        <a href="${esc(url)}" target="_blank" rel="noopener">Open lecture</a>
      </div>`;
  }

  if ($("#playerMeta")) {
    $("#playerMeta").textContent = "If a new tab did not open, tap Open lecture.";
  }
}

async function loadTests() {
  if ($("#testList")) {
    $("#testList").innerHTML = "<p class='message'>Loading tests…</p>";
  }

  try {
    const payload = await api("/api/batch-tests", {
      batchId: state.batchId
    });

    state.tests = listFrom(payload, "tests");

    if ($("#testList")) {
      $("#testList").innerHTML = state.tests.length
        ? state.tests.map((test, index) => `
            <button class="subject-item" data-test="${index}">
              <span class="subject-icon">📝</span>
              <span>
                <strong>${esc(pick(test, ["testName", "name", "title"], `Test ${index + 1}`))}</strong>
                <small>${esc(pick(test, ["duration", "totalQuestions", "questionsCount"], "Test details"))}</small>
              </span>
            </button>
          `).join("")
        : "<p class='message'>No tests returned for this batch.</p>";
    }
  } catch (error) {
    if ($("#testList")) {
      $("#testList").innerHTML = `<p class='message'>${esc(error.message)}</p>`;
    }
  }
}

async function loadAnnouncements() {
  $("#announcementsPanel")?.classList.remove("hidden");
  $("#descriptionPanel")?.classList.add("hidden");
  $("#todayCard")?.classList.add("hidden");
  $("#subjectsPanel")?.classList.add("hidden");
  $("#announcementsPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });

  if ($("#announcementList")) {
    $("#announcementList").innerHTML = "<p class='message'>Loading announcements…</p>";
  }

  try {
    const payload = await api("/api/BatchInfo", {
      BatchId: state.batchId,
      Type: "announcement",
      page: 1
    });

    const items = listFrom(payload, "announcements");

    if ($("#announcementList")) {
      $("#announcementList").innerHTML = items.length
        ? items.map(item => `
            <article class="subject-item">
              <span class="subject-icon">♧</span>
              <span>
                <strong>${esc(pick(item, ["title", "name", "heading"], "Announcement"))}</strong>
                <small>${esc(pick(item, ["message", "description", "content", "date"], ""))}</small>
              </span>
            </article>
          `).join("")
        : "<p class='message'>No announcements yet.</p>";
    }
  } catch (error) {
    if ($("#announcementList")) {
      $("#announcementList").innerHTML = `<p class='message'>${esc(error.message)}</p>`;
    }
  }
}

// Theme
const themeBtn = $("#themeBtn");

if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark");

    localStorage.setItem(
      "pm-theme",
      document.body.classList.contains("dark") ? "dark" : "light"
    );
  });
}

if (localStorage.getItem("pm-theme") === "dark") {
  document.body.classList.add("dark");
}

// Search and navigation
$("#searchForm")?.addEventListener("submit", event => {
  event.preventDefault();
  state.query = $("#searchInput")?.value.trim() || "";
  renderBatches();
});

$("#searchInput")?.addEventListener("input", event => {
  state.query = event.target.value.trim();
  renderBatches();
});

$("#topSearchInput")?.addEventListener("input", event => {
  state.query = event.target.value.trim();

  if ($("#searchInput")) {
    $("#searchInput").value = event.target.value;
  }

  renderBatches();
});

$("#refreshBtn")?.addEventListener("click", () => loadBatches(true));

$("#loadMoreBtn")?.addEventListener("click", () => {
  state.visibleLimit = (state.visibleLimit || 120) + 120;
  renderBatches();
});

$("#backBtn")?.addEventListener("click", () => setPage("batches"));

// Batch cards
$("#batchGrid")?.addEventListener("click", event => {
  const favouriteButton = event.target.closest("[data-fav]");

  if (favouriteButton) {
    const id = String(favouriteButton.dataset.fav);
    let favourites = getStoredArray("pm-favourite-batches");

    favourites = favourites.includes(id)
      ? favourites.filter(value => value !== id)
      : [...favourites, id];

    localStorage.setItem("pm-favourite-batches", JSON.stringify(favourites));
    renderBatches();
    return;
  }

  const enrollButton = event.target.closest("[data-enroll]");
  const openButton = event.target.closest("[data-open]");

  if (enrollButton) {
    const id = String(enrollButton.dataset.enroll);
    const batch = state.batches.find(item => String(batchId(item)) === id);
    const enrolled = getStoredArray("pm-enrolled-batches");

    if (!enrolled.includes(id)) {
      enrolled.push(id);
      localStorage.setItem("pm-enrolled-batches", JSON.stringify(enrolled));
    }

    if ($("#enrollMessage")) {
      $("#enrollMessage").textContent =
        `You have successfully enrolled in ${batchName(batch || {})}. You can find it in My Batches.`;
    }

    $("#enrollModal")?.classList.remove("hidden");
    renderBatches();
    return;
  }

  if (openButton) {
    openBatch(openButton.dataset.open);
    return;
  }

  const card = event.target.closest(".batch-card");
  const button = card?.querySelector("[data-open]");

  if (button) openBatch(button.dataset.open);
});

$("#closeEnrollModal")?.addEventListener("click", () => {
  $("#enrollModal")?.classList.add("hidden");
});

$("#enrollModal")?.addEventListener("click", event => {
  if (event.target.id === "enrollModal") {
    $("#enrollModal")?.classList.add("hidden");
  }
});

document.querySelector(".bottom-nav")?.addEventListener("click", event => {
  const button = event.target.closest("[data-page]");
  if (!button) return;

  const page = button.dataset.page;

  if (["pi", "books", "tests"].includes(page)) {
    setPage(page);
  } else if (["study", "mybatches"].includes(page)) {
    setPage("mybatches");
  } else {
    setPage("batches");
  }
});

// Detail tabs and content
$("#detailTabs")?.addEventListener("click", event => {
  const button = event.target.closest("[data-tab]");
  if (button) showDetailPanels(button.dataset.tab);
});

$("#subjectList")?.addEventListener("click", event => {
  const button = event.target.closest("[data-subject]");
  if (button) openSubject(Number(button.dataset.subject));
});

$("#chapterList")?.addEventListener("click", event => {
  const button = event.target.closest("[data-topic]");
  if (button) openTopic(Number(button.dataset.topic));
});

$("#contentFilters")?.addEventListener("click", event => {
  const button = event.target.closest("[data-content]");
  if (button) loadLessons(button.dataset.content);
});

$("#lessonList")?.addEventListener("click", event => {
  const button = event.target.closest("[data-lesson]");
  if (button) openLesson(Number(button.dataset.lesson));
});

$("#backSubjectsBtn")?.addEventListener("click", () => {
  $("#chaptersPanel")?.classList.add("hidden");
  $("#subjectsPanel")?.classList.remove("hidden");
  $("#todayCard")?.classList.remove("hidden");
});

$("#backChaptersBtn")?.addEventListener("click", () => {
  $("#contentPanel")?.classList.add("hidden");
  $("#chaptersPanel")?.classList.remove("hidden");
});

$("#backLessonsBtn")?.addEventListener("click", () => {
  $("#playerPanel")?.classList.add("hidden");
  $("#contentPanel")?.classList.remove("hidden");
});

const announcementBtn = $("#announcementBtn");

if (announcementBtn) {
  announcementBtn.addEventListener("click", loadAnnouncements);
}

// Test instructions
$("#testList")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-test]");
  if (!button) return;

  const test = state.tests?.[Number(button.dataset.test)];
  if (!test) return;

  const testId = pick(test, ["testId", "TestId", "id", "_id"]);

  try {
    const data = await api("/api/test-instructions", {
      testId,
      batchId: state.batchId
    });

    const detail = data?.data || data;
    const message = pick(
      detail,
      ["instructions", "instruction", "description", "message", "title"],
      "Test instructions received."
    );

    const start = window.confirm(
      `${pick(test, ["testName", "name", "title"], "Test")}\n\n` +
      `${typeof message === "string" ? message : JSON.stringify(message)}\n\nStart test?`
    );

    if (!start) return;

    if ($("#testList")) {
      $("#testList").innerHTML = `
        <article class="subject-item">
          <span class="subject-icon">📝</span>
          <span>
            <strong>${esc(pick(test, ["testName", "name", "title"], "Test instructions"))}</strong>
            <small>${esc(typeof message === "string" ? message : JSON.stringify(message))}</small>
            <p class="message">
              Instructions loaded. A working test-start/questions endpoint
              is required to display actual test questions.
            </p>
          </span>
        </article>`;
    }
  } catch (error) {
    toast("Test instructions unavailable: " + error.message);
  }
});

// Total batches / favourites switch
const totalBtn = $("#totalBatchesBtn");
const favBtn = $("#favouritesBtn");

if (totalBtn && favBtn) {
  totalBtn.addEventListener("click", () => {
    totalBtn.classList.add("home-switch-active");
    favBtn.classList.remove("home-switch-active");
    state.showFavourites = false;
    renderBatches();
  });

  favBtn.addEventListener("click", () => {
    favBtn.classList.add("home-switch-active");
    totalBtn.classList.remove("home-switch-active");
    state.showFavourites = true;
    renderBatches();
  });
}

// Initial load
loadBatches(true);
