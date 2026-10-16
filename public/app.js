const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const state = {
  page: "batches", batches: [], pageNo: 1, hasMore: true, query: "",
  batch: null, batchId: "", subjects: [], subject: null, topics: [], topic: null,
  contentType: "videos", lessons: [], lesson: null, detailTab: "description"
};

function esc(value="") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function pick(obj, keys, fallback="") {
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  return fallback;
}
function listFrom(payload, kind="generic") {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const preferred = {
    batches:["batches","items","results","docs","list"],
    subjects:["subjects","subjectList","batchSubjects","items","results","data"],
    topics:["topics","chapters","chapterList","topicList","contents","items","results","data","docs","list"],
    lessons:["videos","notes","dppVideos","dppNotes","contents","contentList","items","results","data","docs","list"],
    tests:["tests","testList","testSeries","items","results","data","docs","list"],
    announcements:["announcements","items","results","data","docs","list"]
  }[kind] || ["batches","subjects","topics","chapters","videos","notes","contents","tests","announcements","items","results","docs","list","data"];
  for (const key of preferred) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const nested = listFrom(value, kind);
      if (nested.length) return nested;
    }
  }
  // API wrappers sometimes put the useful list several levels down under an unanticipated key.
  for (const [key, value] of Object.entries(payload)) {
    if (preferred.includes(key)) continue;
    if (Array.isArray(value) && value.length && value.some(item => item && typeof item === "object")) return value;
    if (value && typeof value === "object") {
      const nested = listFrom(value, kind);
      if (nested.length) return nested;
    }
  }
  return [];
}
function pageMeta(payload) {
  const candidates = [payload, payload?.data, payload?.pagination, payload?.meta, payload?.data?.pagination, payload?.data?.meta].filter(Boolean);
  const get = keys => {
    for (const obj of candidates) for (const key of keys) if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return Number(obj[key]);
    return 0;
  };
  return { currentPage:get(["currentPage","current_page","page"]), totalPages:get(["totalPages","total_pages","totalPage","lastPage","last_page"]), pageSize:get(["pageSize","page_size","limit","perPage","per_page"]), total:get(["total","totalCount","total_count","count"]) };
}
function nestedImage(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const direct = pick(value,["url","src","uri","imageUrl","image_url"],"");
    if (direct) return direct;
    const base = pick(value,["baseUrl","base_url"],"");
    const key = pick(value,["key","path","filePath"],"");
    if (base && key) return base.replace(/\/$/,"") + "/" + key.replace(/^\//,"");
  }
  return "";
}

async function api(path, params={}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== "") qs.set(k, String(v)); });
  const url = `/proxy${path}${qs.size ? `?${qs}` : ""}`;
  const response = await fetch(url);
  const type = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!response.ok) throw new Error(`API ${response.status}: ${text.slice(0,160)}`);
  if (type.includes("json") || /^[\s]*[\[{]/.test(text)) {
    try { return JSON.parse(text); } catch {}
  }
  return text;
}
function toast(msg) {
  const el = $("#toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}
function setPage(name) {
  state.page = name;
  $("#batchListPage").classList.toggle("hidden", !["batches","mybatches","study"].includes(name));
  $("#batchDetailPage").classList.toggle("hidden", name !== "detail");
  $("#comingSoonPage").classList.toggle("hidden", !["tests","pi","books"].includes(name));
  if (["tests","pi","books"].includes(name)) $("#comingTitle").textContent = name === "books" ? "PW Books" : name === "pi" ? "Pi" : "Test Series";
  $("#homeHeading").textContent = name === "mybatches" || name === "study" ? "My Batches" : "Popular courses";
  renderBatches();
  $("#backBtn").classList.toggle("hidden", name !== "detail");
  $("#menuBtn").classList.toggle("hidden", name === "detail");
  closeDrawer();
  window.scrollTo({top:0,behavior:"smooth"});
}
function openDrawer(){ $("#drawer").classList.add("open"); $("#scrim").classList.remove("hidden"); $("#drawer").setAttribute("aria-hidden","false"); }
function closeDrawer(){ $("#drawer").classList.remove("open"); $("#scrim").classList.add("hidden"); $("#drawer").setAttribute("aria-hidden","true"); }
function batchId(b) { return pick(b,["_id","BatchId","batchId","batch_id","id"]); }
function batchName(b) { return pick(b,["name","batchName","BatchName","title","batch_name","courseName"],"Untitled Batch"); }
function imageUrl(b) { return nestedImage(pick(b,["previewImage","previewImageUrl","iosPreviewImageUrl","image","batchImage","batch_image","batchBanner","bannerUrl","banner","thumbnail","thumbnailUrl","thumbnail_url","coverImage","cover_image","imageUrl","image_url","img"])); }
function batchDates(b) {
  const start = pick(b,["startDate","start_date","batchStartDate","startsOn"]);
  const end = pick(b,["endDate","end_date","batchEndDate","endsOn"]);
  return [start ? `Starts on ${formatDate(start)}` : "", end ? `Ends on ${formatDate(end)}` : ""].filter(Boolean).join("  |  ");
}
function formatDate(d) {
  const date = new Date(d); return Number.isNaN(date.getTime()) ? String(d) : date.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
}
function renderBatches() {
  const enrolled = JSON.parse(localStorage.getItem("pm-enrolled-batches") || "[]").map(String);
  const onlyMine = ["mybatches","study"].includes(state.page);
  const favourites = JSON.parse(localStorage.getItem("pm-favourite-batches") || "[]").map(String);
  const filtered = state.batches.filter(b => batchName(b).toLowerCase().includes(state.query.toLowerCase()) && (!onlyMine || enrolled.includes(String(batchId(b)))) && (!state.showFavourites || favourites.includes(String(batchId(b)))));
  const visible = filtered.slice(0, state.visibleLimit || 120);
  $("#batchCount").textContent = `${filtered.length} batches${state.query ? " found" : ""}`;
  $("#batchGrid").innerHTML = visible.map((b,i) => {
    const id = batchId(b), name = batchName(b), img = imageUrl(b), dates = batchDates(b);
    const language = pick(b,["language","medium","batchLanguage"],"");
    return `<article class="batch-card">
      ${img ? `<img class="batch-cover" src="${esc(img)}" alt="${esc(name)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;batch-cover fallback&quot;>${esc(name)}</div>'">` : `<div class="batch-cover fallback">${esc(name)}</div>`}
      <div class="batch-card-body"><div class="batch-title-row"><h2>${esc(name)}</h2><button class="favourite-btn" data-fav="${esc(id)}" aria-label="Favourite batch">${favourites.includes(String(id)) ? "❤️" : "♡"}</button></div><div class="batch-kicker">Batch</div>
      <div class="batch-meta"><div class="meta-line">▤ &nbsp;Boards / Foundation</div>${language ? `<div class="meta-line">♙ &nbsp;${esc(language)}</div>` : ""}${dates ? `<div class="meta-line">🔴 &nbsp;Ongoing | ${esc(dates)}</div>` : ""}</div>
      <div class="price-row"><span class="price">FREE</span><span class="free-tag">100% OFF</span></div>
      <div class="card-actions"><button class="enroll-btn" data-enroll="${esc(id)}">${enrolled.includes(String(id)) ? "Enrolled ✓" : "Enroll"}</button><button class="arrow-btn" aria-label="Open batch" data-open="${esc(id)}">›</button></div></div>
    </article>`;
  }).join("");
  $("#listMessage").textContent = filtered.length ? "" : (onlyMine ? "You haven't enrolled in any batches yet. Open Batches and tap Enroll." : state.query ? "No matching batches found." : "No batches returned by the API.");
  $("#loadMoreBtn").textContent = visible.length < filtered.length ? `Show more batches (${filtered.length-visible.length} remaining)` : "All visible batches shown";
  $("#loadMoreBtn").classList.toggle("hidden", visible.length >= filtered.length);
  $("#loadMoreBtn").disabled = visible.length >= filtered.length;
}
async function loadBatches(reset=false) {
  if (state.loadingAll) return;
  if (reset) { state.pageNo=1; state.batches=[]; state.hasMore=true; state.allLoaded=false; }
  state.loadingAll = true;
  $("#batchCount").textContent = "Loading batches…";
  $("#listMessage").textContent = "Fetching batch pages from the API…";
  try {
    const first = await api("/api/AllBatches",{page:1});
    const firstItems = listFrom(first,"batches");
    if (!firstItems.length) throw new Error("API response mein batches array nahi mili. Response format check karo.");
    state.batches = firstItems;
    const meta = pageMeta(first);
    const totalPages = meta.totalPages || (firstItems.length < (meta.pageSize || 20) ? 1 : 0);
    renderBatches();
    if (totalPages > 1) {
      let nextPage = 2;
      const maxPages = totalPages || 1000;
      // Fetch in small parallel groups to avoid hundreds of simultaneous requests.
      while (nextPage <= maxPages && !state.stopLoading) {
        const pages = [];
        for (let p=nextPage; p<nextPage+5 && p<=maxPages; p++) pages.push(p);
        const responses = await Promise.all(pages.map(async page => ({page, payload:await api("/api/AllBatches",{page})})));
        let added = 0;
        for (const item of responses) {
          const rows = listFrom(item.payload,"batches");
          const known = new Set(state.batches.map(batchId).filter(Boolean).map(String));
          const fresh = rows.filter(b => batchId(b) && !known.has(String(batchId(b))));
          state.batches.push(...fresh); added += fresh.length;
        }
        nextPage += pages.length;
        state.pageNo = nextPage;
        state.hasMore = nextPage <= maxPages;
        $("#batchCount").textContent = `Loaded ${state.batches.length.toLocaleString()} batches${totalPages ? ` · page ${Math.min(nextPage-1,totalPages)} of ${totalPages}` : ""}`;
        $("#listMessage").textContent = state.hasMore ? "Loading remaining batches… you can search loaded batches now." : "All available batch pages loaded.";
        renderBatches();
        if (!added || responses.every(r => listFrom(r.payload,"batches").length===0)) break;
      }
    }
    state.hasMore = false;
    state.allLoaded = true;
    $("#batchCount").textContent = `${state.batches.length.toLocaleString()} batches loaded`;
    $("#listMessage").textContent = "All batches returned by the API are loaded. Use search to find a batch.";
    renderBatches();
  } catch (e) {
    $("#batchCount").textContent = state.batches.length ? `${state.batches.length} batches loaded` : "Batches unavailable";
    $("#listMessage").textContent = `${e.message}. Check the /proxy/api/AllBatches?page=1 response.`;
    renderBatches();
  } finally { state.loadingAll = false; }
}

function showDetailPanels(tab) {
  state.detailTab = tab;
  $("#descriptionPanel").classList.add("hidden");
  $("#todayCard").classList.remove("hidden");
  $("#subjectsPanel").classList.toggle("hidden", tab !== "classes");
  $("#testsPanel").classList.toggle("hidden", tab !== "tests");
  $("#announcementsPanel").classList.toggle("hidden", tab !== "announcements");
  $("#chaptersPanel").classList.add("hidden");
  $("#contentPanel").classList.add("hidden");
  $("#playerPanel").classList.add("hidden");
  $$(".detail-tab").forEach(b => b.classList.toggle("active", b.dataset.tab===tab));
  if(tab==="classes" || tab==="khazana") loadSubjects();
  if(tab==="tests") loadTests();
  if(tab==="announcements") loadAnnouncements();
  if(tab==="live") { api("/api/todays-schedule",{BatchId:state.batchId}).catch(()=>api("/api/Schedule",{BatchId:state.batchId,page:1})).then(payload=>{const items=listFrom(payload);const matched=items.filter(x=>String(pick(x,["batchId","BatchId","batch_id"],state.batchId))===String(state.batchId)); $("#todayContent").textContent=matched.length?matched.map(x=>pick(x,["title","name","topic","subjectName"],"Live class")).join(" • "):"No live class is scheduled right now.";}).catch(()=>{$("#todayContent").textContent="Live class schedule is unavailable.";}); }
}
async function openBatch(id) {
  if (!id) return toast("Batch ID is missing in API response.");
  state.batchId=id; state.batch=state.batches.find(b=>String(batchId(b))===String(id))||null;
  $("#detailTitle").textContent=state.batch ? batchName(state.batch) : "Batch Details";
  $("#batchDescription").textContent="Loading details…";
  $("#todayContent").textContent="Loading schedule…";
  setPage("detail"); showDetailPanels("classes");
  try {
    const details = await api("/api/BatchInfo",{BatchId:id,Type:"details"});
    const d = details?.data || details?.batch || details;
    state.batch = {...(state.batch||{}),...(d && typeof d==="object" ? d : {})};
    $("#detailTitle").textContent=batchName(state.batch);
    const desc=pick(state.batch,["description","batchDescription","about","details","overview"],"No description was returned by the API.");
    $("#batchDescription").innerHTML=typeof desc==="string" && /<\/?[a-z][\s\S]*>/i.test(desc)
      ? desc.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()
      : esc(desc);
  } catch(e) { $("#batchDescription").textContent=`Batch details could not load: ${e.message}`; }
  try {
    let schedule;
    try { schedule = await api("/api/todays-schedule",{BatchId:id}); }
    catch { schedule = await api("/api/Schedule",{BatchId:id,page:1}); }
    const items=listFrom(schedule);
    const matched=items.filter(x=>String(pick(x,["batchId","BatchId","batch_id"],id))===String(id));
    $("#todayContent").textContent=matched.length ? matched.map(x=>pick(x,["title","name","topic","subjectName"],"Scheduled class")).join(" • ") : "Classes not Scheduled yet";
  } catch { $("#todayContent").textContent="Classes not Scheduled yet"; }
}
async function loadSubjects() {
  $("#subjectList").innerHTML="<p class='message'>Loading subjects…</p>";
  try {
    const detail = await api("/api/BatchInfo",{BatchId:state.batchId,Type:"details"});
    const batch = detail?.data || detail?.batch || detail;
    // BatchInfo returns { success:true, data:{ ..., subjects:[...] } }.
    let subjects = Array.isArray(batch?.subjects) ? batch.subjects
      : Array.isArray(batch?.Subjects) ? batch.Subjects
      : Array.isArray(state.batch?.subjects) ? state.batch.subjects
      : listFrom(batch,"subjects").filter(x=>pick(x,["slug","subjectId","SubjectId","subject_id","subject","subjectName","name"]));
    state.subjects=subjects;
    renderSubjects();
  } catch(e) { $("#subjectList").innerHTML=`<p class="message">${esc(e.message)}. Subject IDs must be present in batch details.</p>`; }
}
function subjectId(s){return pick(s,["slug","SubjectId","subjectSlug","subject_slug","subjectId","subject_id","id","_id"]);}
function subjectName(s){return pick(s,["subject","subjectName","name","title","SubjectName"],"Subject");}
function renderSubjects(){
  $("#subjectList").innerHTML=state.subjects.length ? state.subjects.map((s,i)=>`<button class="subject-item" data-subject="${i}"><span class="subject-icon">${["▧","⚗","♧","∑","📖"][i%5]}</span><span><strong>${esc(subjectName(s))}</strong><small>${esc(pick(s,["chapterCount","chaptersCount","totalChapters"],"Open subject"))}</small></span></button>`).join("") : `<p class="message">Subject list wasn't included in BatchInfo. Check SubjectInfo response/API access.</p>`;
}
async function openSubject(index){
  const s=state.subjects[index]; if(!s)return;
  state.subject=s; state.topics=[];
  const sid=subjectId(s);
  if(!sid){toast("Subject ID not found.");return;}
  $("#chapterHeading").textContent=subjectName(s);
  $("#subjectsPanel").classList.add("hidden"); $("#todayCard").classList.add("hidden"); $("#chaptersPanel").classList.remove("hidden");
  $("#chapterList").innerHTML="<p class='message'>Loading chapters/topics…</p>";
  try{
    const payload=await api("/api/SubjectInfo",{BatchId:state.batchId,SubjectId:sid,page:1});
    const items=listFrom(payload,"topics"); state.topics=items;
    const renderTopics = () => {
      $("#chapterList").innerHTML=state.topics.length ? state.topics.map((t,i)=>`<button class="subject-item" data-topic="${i}"><span class="subject-icon">▤</span><span><strong>${esc(pick(t,["topicName","chapterName","name","title","topic","tag"],"Topic"))}</strong><small>${esc(pick(t,["contentCount","totalVideos","count","lectureCount"],"Open topic"))}</small></span></button>`).join("") : `<p class="message">The SubjectInfo API returned no topic list for “${esc(subjectName(s))}”. Check its response schema/access; this is not a pagination setting.</p>`;
    };
    renderTopics();
    const meta=payload?.data&&!Array.isArray(payload.data)?payload.data:payload;
    const pages=Number(pick(meta,["totalPages","total_pages","totalPage","lastPage","last_page"],1));
    for(let p=2;p<=Math.min(pages,100);p++){
      const next=await api("/api/SubjectInfo",{BatchId:state.batchId,SubjectId:sid,page:p});
      state.topics.push(...listFrom(next));
    }
    renderTopics();
  }catch(e){$("#chapterList").innerHTML=`<p class="message">Topics could not load: ${esc(e.message)}</p>`;}
}
function topicId(t){return pick(t,["slug","TopicId","topicId","topic_id","chapterId","chapter_id","id","_id"]);}
async function openTopic(index){
  const t=state.topics[index]; if(!t)return; state.topic=t;
  $("#contentHeading").textContent=pick(t,["topicName","chapterName","name","title"],"Lessons");
  $("#chaptersPanel").classList.add("hidden");$("#contentPanel").classList.remove("hidden");
  await loadLessons("videos");
}
async function loadLessons(type){
  // Match the content-type names expected by the LearnXPW TopicInfo API.
  if(type==="dpps") type="DppVideos";
  if(type==="dpp-pdfs") type="DppNotes";
  if(type==="videos") type="videos";
  if(type==="notes") type="notes";
  state.contentType=type;
  $$(".filter").forEach(b=>b.classList.toggle("active",b.dataset.content===type));
  $("#lessonList").innerHTML="<p class='message'>Loading content…</p>";
  const sid=subjectId(state.subject), tid=topicId(state.topic);
  try{
    const payload=await api("/api/TopicInfo",{BatchId:state.batchId,SubjectId:sid,TopicId:tid,ContentType:type,page:1});
    state.lessons=listFrom(payload,"lessons");
    // Follow pagination when the API provides it, so later notes/videos are not omitted.
    const meta=pageMeta(payload);
    const totalPages=Math.min(meta.totalPages || 1, 100);
    for(let page=2;page<=totalPages;page++){
      const next=await api("/api/TopicInfo",{BatchId:state.batchId,SubjectId:sid,TopicId:tid,ContentType:type,page});
      state.lessons.push(...listFrom(next,"lessons"));
    }
    $("#lessonList").innerHTML=state.lessons.length?state.lessons.map((x,i)=>`<button class="subject-item" data-lesson="${i}"><span class="subject-icon">${type.toLowerCase().includes("note")?"▤":"▶"}</span><span><strong>${esc(pick(x,["name","title","topicName","contentName","videoName","lessonName","fileName","attachmentName"],`${type} ${i+1}`))}</strong><small>${esc(pick(x,["duration","date","type"],type))}</small></span></button>`).join(""):`<p class="message">No ${esc(type)} found for this topic.</p>`;
  }catch(e){$("#lessonList").innerHTML=`<p class="message">Content unavailable: ${esc(e.message)}</p>`;}
}
function watchPageUrl(lesson) {
  const id = pick(lesson,["contentId","ContentId","videoId","video_id","id","_id","scheduleId"]);
  const topic = topicId(state.topic) || "";
  const subject = subjectId(state.subject) || "";
  const type = pick(lesson,["type","videoType","contentType"],"penpencilvdo");
  const params = new URLSearchParams({batchId:state.batchId,SubjectId:subject,ChildId:id,videoId:id,topicId:topic,scheduleId:pick(lesson,["scheduleId","batchScheduleId"],id),Type:type,isLocked:"false"});
  return `https://m.pwmarco.site/live?${params.toString()}`;
}
function pdfUrlFrom(payload) {
  const d = payload?.data || payload?.result || payload;
  if (typeof d === "string" && /^https?:\/\//i.test(d)) return d;
  const direct = pick(d,["url","pdfUrl","fileUrl","link","downloadUrl","attachmentUrl","src"]);
  if (typeof direct === "string" && /^https?:\/\//i.test(direct)) return direct;
  const base = pick(d,["baseUrl","base_url"]), key = pick(d,["key","fileKey","path"]);
  if (base && key) return base.replace(/\/$/,"") + "/" + key.replace(/^\//,"");
  const att = d?.attachment || d?.attachments?.[0] || d?.file;
  if (att) return pdfUrlFrom(att);
  return "";
}
async function fetchPdfFromPwthor(lesson) {
  const params = new URLSearchParams({
    BatchId: state.batchId || "6a2f85a26fe4e9c73994095e",
    SubjectId: subjectId(state.subject) || "science-by-raj-sir-971873",
    PdfId: pick(lesson,["pdfId","PdfId","contentId","ContentId","id","_id"],"6aad46a836544c8dd3b840fb"),
    HomeworkId: pick(lesson,["homeworkId","HomeworkId","homework_id"],"6ac901918e745b09bf344f9a")
  });
  const response = await fetch(`/pdf-proxy?${params.toString()}`);
  if (!response.ok) throw new Error(`PDF API ${response.status}`);
  const type = response.headers.get("content-type") || "";
  const body = await response.text();
  if (type.includes("json") || /^[\\s]*[\\[{]/.test(body)) {
    try { return JSON.parse(body); } catch {}
  }
  return body;
}
async function openLesson(index){
  const lesson=state.lessons[index]; if(!lesson)return; state.lesson=lesson;
  const kind=state.contentType.toLowerCase();
  const title=pick(lesson,["name","title","videoName","contentName","lessonName","fileName","attachmentName"],"Lesson");
  if (kind.includes("dpp")) {
    const id=pick(lesson,["exerciseId","dppId","testId","contentId","ContentId","id","_id"]);
    const params=new URLSearchParams({type:"Start",source:"BATCH_QUIZ",testSource:"BATCH_QUIZ",scheduleId:pick(lesson,["scheduleId","batchScheduleId"],id),batchScheduleId:pick(lesson,["batchScheduleId","scheduleId"],id),batchId:state.batchId,chapterId:pick(lesson,["chapterId","chapter_id"],topicId(state.topic)),subjectId:pick(lesson,["subjectId","subject_id"],subjectId(state.subject)),exerciseId:id,mode:"Online",startTime:pick(lesson,["startTime"],String(Date.now()))});
    window.location.href=`https://www.learnxpw.site/practice-v2/dpp/${encodeURIComponent(id)}?${params.toString()}`; return;
  }
  if (kind.includes("note") || kind.includes("pdf")) {
    let url="";
    try {
      const pdf=await fetchPdfFromPwthor(lesson);
      url=pdfUrlFrom(pdf);
    } catch {}
    if (!url) url=pick(lesson,["url","pdfUrl","fileUrl","link","attachmentUrl"]);
    if (!url && (lesson.key || lesson.baseUrl)) url=pdfUrlFrom(lesson);
    if (url) { window.open(url,"_blank","noopener"); toast("Notes PDF opened"); }
    else toast("PDF URL response mein nahi mila.");
    return;
  }
  const url=watchPageUrl(lesson);
  window.open(url,"_blank","noopener");
  toast("Lecture watch page opened");
  // Keep a visible fallback for browsers that block popups.
  $("#contentPanel").classList.add("hidden"); $("#playerPanel").classList.remove("hidden");
  $("#playerTitle").textContent=title;
  $("#playerWrap").innerHTML=`<div class="watch-fallback"><p>Lecture is opened on the authorized LearnXPW watch page.</p><a href="${esc(url)}" target="_blank" rel="noopener">Open lecture</a></div>`;
  $("#playerMeta").textContent="If a new tab did not open, tap Open lecture.";
}
async function loadTests(){
  $("#testList").innerHTML="<p class='message'>Loading tests…</p>";
  try{
    const payload=await api("/api/batch-tests",{batchId:state.batchId});
    const tests=listFrom(payload,"tests");
    $("#testList").innerHTML=tests.length?tests.map((t,i)=>`<button class="subject-item" data-test="${i}"><span class="subject-icon">📝</span><span><strong>${esc(pick(t,["testName","name","title"],"Test "+(i+1)))}</strong><small>${esc(pick(t,["duration","totalQuestions","questionsCount"],"Test details"))}</small></span></button>`).join(""):`<p class="message">No tests returned for this batch.</p>`;
    state.tests=tests;
  }catch(e){$("#testList").innerHTML=`<p class="message">${esc(e.message)}</p>`;}
}
async function loadAnnouncements(){
  $("#announcementsPanel").classList.remove("hidden");
  $("#descriptionPanel").classList.add("hidden");$("#todayCard").classList.add("hidden");$("#subjectsPanel").classList.add("hidden");
  $("#announcementsPanel").scrollIntoView({behavior:"smooth",block:"start"});
  $("#announcementList").innerHTML="<p class='message'>Loading announcements…</p>";
  try{
    const payload=await api("/api/BatchInfo",{BatchId:state.batchId,Type:"announcement",page:1});
    const items=listFrom(payload,"announcements");
    $("#announcementList").innerHTML=items.length?items.map(a=>`<article class="subject-item"><span class="subject-icon">♧</span><span><strong>${esc(pick(a,["title","name","heading"],"Announcement"))}</strong><small>${esc(pick(a,["message","description","content","date"],""))}</small></span></article>`).join(""):"<p class='message'>No announcements yet.</p>";
  }catch(e){$("#announcementList").innerHTML=`<p class='message'>${esc(e.message)}</p>`;}
}
$("#menuBtn").addEventListener("click",openDrawer);
$("#scrim").addEventListener("click",closeDrawer);
const themeBtn = $("#themeBtn");
if (themeBtn) themeBtn.addEventListener("click",()=>{document.body.classList.toggle("dark");localStorage.setItem("pm-theme",document.body.classList.contains("dark")?"dark":"light");});
if(localStorage.getItem("pm-theme")==="dark")document.body.classList.add("dark");
$("#searchForm").addEventListener("submit",e=>{e.preventDefault();state.query=$("#searchInput").value.trim();renderBatches();});
$("#searchInput").addEventListener("input",e=>{state.query=e.target.value.trim();renderBatches();});
$("#refreshBtn").addEventListener("click",()=>loadBatches(true));
$("#loadMoreBtn").addEventListener("click",()=>{state.visibleLimit=(state.visibleLimit||120)+120;renderBatches();});
$("#backBtn").addEventListener("click",()=>setPage("batches"));
$("#batchGrid").addEventListener("click",e=>{
  const fav=e.target.closest("[data-fav]");
  if(fav){const id=String(fav.dataset.fav);let list=JSON.parse(localStorage.getItem("pm-favourite-batches")||"[]").map(String);list=list.includes(id)?list.filter(x=>x!==id):[...list,id];localStorage.setItem("pm-favourite-batches",JSON.stringify(list));renderBatches();return;}
  const enroll=e.target.closest("[data-enroll]"), open=e.target.closest("[data-open]");
  if (enroll) {
    const id=String(enroll.dataset.enroll), b=state.batches.find(x=>String(batchId(x))===id);
    const enrolled=JSON.parse(localStorage.getItem("pm-enrolled-batches")||"[]").map(String);
    if(!enrolled.includes(id)){enrolled.push(id);localStorage.setItem("pm-enrolled-batches",JSON.stringify(enrolled));}
    $("#enrollMessage").textContent=`You have successfully enrolled in ${batchName(b||{})}. You can find it in My Batches.`;
    $("#enrollModal").classList.remove("hidden"); renderBatches(); return;
  }
  if(open){openBatch(open.dataset.open);return;}
  const card=e.target.closest(".batch-card");
  if(card){const btn=card.querySelector("[data-open]");if(btn)openBatch(btn.dataset.open);}
});
$("#closeEnrollModal").addEventListener("click",()=>$("#enrollModal").classList.add("hidden"));
$("#enrollModal").addEventListener("click",e=>{if(e.target.id==="enrollModal")$("#enrollModal").classList.add("hidden");});
$("#drawer").addEventListener("click",e=>{
  const btn=e.target.closest("[data-page]");if(!btn)return;
  const page=btn.dataset.page;
  if(page==="mybatches"||page==="study"){setPage("mybatches");return;}
  setPage("batches");
});
document.querySelector(".bottom-nav")?.addEventListener("click",e=>{
  const btn=e.target.closest("[data-page]");if(!btn)return;
  const page=btn.dataset.page;
  if(page==="pi"||page==="books"||page==="tests"){setPage(page);return;}
  if(page==="study"||page==="mybatches"){setPage("mybatches");return;}
  setPage("batches");
});
$("#topSearchInput").addEventListener("input",e=>{state.query=e.target.value.trim();$("#searchInput").value=e.target.value;renderBatches();});
$("#detailTabs").addEventListener("click",e=>{const btn=e.target.closest("[data-tab]");if(btn)showDetailPanels(btn.dataset.tab);});
$("#subjectList").addEventListener("click",e=>{const btn=e.target.closest("[data-subject]");if(btn)openSubject(Number(btn.dataset.subject));});
$("#chapterList").addEventListener("click",e=>{const btn=e.target.closest("[data-topic]");if(btn)openTopic(Number(btn.dataset.topic));});
$("#contentFilters").addEventListener("click",e=>{const btn=e.target.closest("[data-content]");if(btn)loadLessons(btn.dataset.content);});
$("#lessonList").addEventListener("click",e=>{const btn=e.target.closest("[data-lesson]");if(btn)openLesson(Number(btn.dataset.lesson));});
$("#backSubjectsBtn").addEventListener("click",()=>{$("#chaptersPanel").classList.add("hidden");$("#subjectsPanel").classList.remove("hidden");$("#todayCard").classList.remove("hidden");});
$("#backChaptersBtn").addEventListener("click",()=>{$("#contentPanel").classList.add("hidden");$("#chaptersPanel").classList.remove("hidden");});
$("#backLessonsBtn").addEventListener("click",()=>{$("#playerPanel").classList.add("hidden");$("#contentPanel").classList.remove("hidden");});
const announcementBtn=$("#announcementBtn"); if(announcementBtn) announcementBtn.addEventListener("click",loadAnnouncements);

$("#testList").addEventListener("click",async e=>{
  const btn=e.target.closest("[data-test]");if(!btn)return;
  const test=state.tests?.[Number(btn.dataset.test)];if(!test)return;
  const testId=pick(test,["testId","TestId","id","_id"]);
  try{
    const data=await api("/api/test-instructions",{testId,batchId:state.batchId});
    const detail = data?.data || data;
    const msg = pick(detail,["instructions","instruction","description","message","title"],"Test instructions received.");
    const ok=window.confirm(`${pick(test,["testName","name","title"],"Test")}\n\n${typeof msg==="string"?msg:JSON.stringify(msg)}\n\nStart test?`);
    if(!ok)return;
    const testParams=new URLSearchParams({type:"Start",source:"BATCH_TEST_SERIES",mode:"Online",startTime:pick(test,["startTime"],"1777782654000"),lang:pick(test,["lang"],"en"),batchId:state.batchId,testSource:"BATCH_TEST_SERIES"});
    window.open(`https://www.learnxpw.site/practice-v2/test/${encodeURIComponent(testId)}?${testParams.toString()}`,"_blank","noopener");
    const started=await api("/api/batch-tests",{testId,batchId:state.batchId,type:"Start",testSource:"BATCH_TEST_SERIES"});
    const questions=listFrom(started,"lessons");
    if(questions.length){
      $("#testList").innerHTML=`<h3>${esc(pick(test,["testName","name","title"],"Test"))}</h3>`+questions.map((q,i)=>`<article class="subject-item"><span class="subject-icon">${i+1}</span><span><strong>${esc(pick(q,["question","questionText","title","text","name"],"Question"))}</strong><small>${esc(Array.isArray(q.options)?q.options.map((o,j)=>`${String.fromCharCode(65+j)}. ${typeof o==="string"?o:pick(o,["text","value","label"],JSON.stringify(o))}`).join(" · "):pick(q,["optionsText","marks","type"],""))}</small></span></article>`).join("");
    } else {
      const printable=typeof started==="string"?started:JSON.stringify(started,null,2);
      $("#testList").innerHTML=`<div class="subject-item"><span class="subject-icon">ℹ</span><span><strong>Test start response received</strong><small>Questions format is not recognized yet. This is the actual API response for mapping, not a failed instruction load.</small></span></div><pre class="api-debug">${esc((printable||"No response body").slice(0,5000))}</pre>`;
    }
  } catch(err){toast("Test start/instructions unavailable: "+err.message);}
});
const totalBtn=document.querySelector("#totalBatchesBtn"), favBtn=document.querySelector("#favouritesBtn");
if(totalBtn&&favBtn){totalBtn.addEventListener("click",()=>{totalBtn.classList.add("home-switch-active");favBtn.classList.remove("home-switch-active");state.showFavourites=false;renderBatches();});favBtn.addEventListener("click",()=>{favBtn.classList.add("home-switch-active");totalBtn.classList.remove("home-switch-active");state.showFavourites=true;renderBatches();});}
loadBatches(true);
