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
  $("#batchListPage").classList.toggle("hidden", name !== "batches" && name !== "mybatches" && name !== "study");
  $("#batchDetailPage").classList.toggle("hidden", name !== "detail");
  $("#comingSoonPage").classList.toggle("hidden", name !== "tests");
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
  const filtered = state.batches.filter(b => batchName(b).toLowerCase().includes(state.query.toLowerCase()));
  const visible = filtered.slice(0, state.visibleLimit || 120);
  $("#batchCount").textContent = `${filtered.length} batches${state.query ? " found" : ""}`;
  $("#batchGrid").innerHTML = visible.map((b,i) => {
    const id = batchId(b), name = batchName(b), img = imageUrl(b), dates = batchDates(b);
    const price = pick(b,["feeTotal","price","finalPrice","amount","batchPrice"],0);
    const language = pick(b,["language","medium","batchLanguage"],"");
    return `<article class="batch-card">
      <div class="batch-card-head"><h2>${esc(name)}</h2><span class="new-tag">New</span></div>
      ${img ? `<img class="batch-cover" src="${esc(img)}" alt="${esc(name)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;batch-cover fallback&quot;>${esc(name)}</div>'">` : `<div class="batch-cover fallback">${esc(name)}</div>`}
      <div class="batch-meta">
        ${pick(b,["byName","subtitle","target"],"") ? `<div class="meta-line">${esc(pick(b,["byName","subtitle","target"],""))}</div>` : ""}${language ? `<div class="meta-line"><span class="meta-icon">♙</span>${esc(language)}</div>` : ""}
        ${dates ? `<div class="meta-line"><span class="meta-icon">▦</span>${esc(dates)}</div>` : ""}
      </div>
      <div class="price-row"><span class="price">${Number(price)===0 ? "₹ FREE" : `₹ ${esc(price)}`}</span><span class="free-tag">${Number(price)===0 ? "100% Free For Students" : "Batch access"}</span></div>
      <div class="card-actions"><button class="study-btn" data-study="${esc(id)}">♧ &nbsp; Study</button><button class="enroll-btn" data-enroll="${esc(id)}">Enroll Now &nbsp; ♧</button></div>
    </article>`;
  }).join("");
  $("#listMessage").textContent = filtered.length ? "" : (state.query ? "No matching batches found." : "No batches returned by the API.");
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
  $("#descriptionPanel").classList.toggle("hidden", tab !== "description");
  $("#todayCard").classList.toggle("hidden", tab !== "classes");
  $("#subjectsPanel").classList.toggle("hidden", tab !== "classes");
  $("#testsPanel").classList.toggle("hidden", tab !== "tests");
  $("#announcementsPanel").classList.add("hidden");
  $("#chaptersPanel").classList.add("hidden");
  $("#contentPanel").classList.add("hidden");
  $("#playerPanel").classList.add("hidden");
  $$(".detail-tab").forEach(b => b.classList.toggle("active", b.dataset.tab===tab));
  if(tab==="classes") loadSubjects();
  if(tab==="tests") loadTests();
  if(tab==="infinity") { $("#descriptionPanel").classList.remove("hidden"); const b=state.batch||{}; const info=pick(b,["shortDescription","description","about"],"This batch API does not provide a separate Infinity Learning content endpoint. Check the batch description for included features."); $("#batchDescription").textContent=typeof info==="string"?info:"Infinity Learning information is not separately available in this API response."; }
}
async function openBatch(id) {
  if (!id) return toast("Batch ID is missing in API response.");
  state.batchId=id; state.batch=state.batches.find(b=>String(batchId(b))===String(id))||null;
  $("#detailTitle").textContent=state.batch ? batchName(state.batch) : "Batch Details";
  $("#batchDescription").textContent="Loading details…";
  $("#todayContent").textContent="Loading schedule…";
  setPage("detail"); showDetailPanels("description");
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
    const schedule = await api("/api/todays-schedule");
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
  state.contentType=type;
  $$(".filter").forEach(b=>b.classList.toggle("active",b.dataset.content===type));
  $("#lessonList").innerHTML="<p class='message'>Loading content…</p>";
  const sid=subjectId(state.subject), tid=topicId(state.topic);
  try{
    const payload=await api("/api/TopicInfo",{BatchId:state.batchId,SubjectId:sid,TopicId:tid,ContentType:type,page:1});
    state.lessons=listFrom(payload,"lessons");
    $("#lessonList").innerHTML=state.lessons.length?state.lessons.map((x,i)=>`<button class="subject-item" data-lesson="${i}"><span class="subject-icon">${type.toLowerCase().includes("note")?"▤":"▶"}</span><span><strong>${esc(pick(x,["name","title","topicName","contentName","videoName","lessonName","fileName","attachmentName"],`${type} ${i+1}`))}</strong><small>${esc(pick(x,["duration","date","type"],type))}</small></span></button>`).join(""):`<p class="message">No ${esc(type)} found for this topic.</p>`;
  }catch(e){$("#lessonList").innerHTML=`<p class="message">Content unavailable: ${esc(e.message)}</p>`;}
}
async function openLesson(index){
  const lesson=state.lessons[index]; if(!lesson)return; state.lesson=lesson;
  $("#contentPanel").classList.add("hidden");$("#playerPanel").classList.remove("hidden");
  $("#playerTitle").textContent=pick(lesson,["name","title","videoName","contentName","lessonName","fileName","attachmentName"],"Lesson");
  $("#playerWrap").innerHTML="<p>Loading lesson…</p>";
  const id=pick(lesson,["contentId","ContentId","videoId","video_id","id","_id"]);
  const kind=state.contentType.toLowerCase();
  if(kind.includes("note")){
    try{
      const pdf=await api("/api/GetPdf",{BatchId:state.batchId,SubjectId:subjectId(state.subject),PdfId:id,AttachmentId:pick(lesson,["attachmentId","AttachmentId","attachment_id"])});
      const url=pick(pdf,["url","pdfUrl","fileUrl","link","data"],"");
      $("#playerWrap").innerHTML=typeof url==="string"&&url.startsWith("http")?`<iframe title="PDF notes" src="${esc(url)}"></iframe>`:`<p>PDF URL was not returned. Open the lesson through its authorized attachment link.</p>`;
    }catch(e){$("#playerWrap").innerHTML=`<p>${esc(e.message)}</p>`;}
    return;
  }
  try{
    const payload=await api("/api/video-url",{batch_id:state.batchId,subject_id:subjectId(state.subject),video_id:id});
    let url=pick(payload,["url","videoUrl","video_url","playUrl","src"],"");
    if(payload?.data) url=pick(payload.data,["url","videoUrl","video_url","playUrl","src"],url);
    if(typeof payload==="string"&&payload.startsWith("http"))url=payload;
    if(url && /\.(m3u8|mpd)(\?|$)/i.test(url)) url=`/proxy/api/play?url=${encodeURIComponent(url)}`;
    if(url && /\.(mp4)(\?|$)/i.test(url)) $("#playerWrap").innerHTML=`<video controls playsinline src="${esc(url)}"></video>`;
    else if(url) $("#playerWrap").innerHTML=`<video controls playsinline src="${esc(url)}"></video>`;
    else $("#playerWrap").innerHTML="<p>Video URL not returned. Check video-url response and required authorization.</p>";
  }catch(e){$("#playerWrap").innerHTML=`<p>Video could not load: ${esc(e.message)}</p>`;}
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
$("#themeBtn").addEventListener("click",()=>{document.body.classList.toggle("dark");localStorage.setItem("pm-theme",document.body.classList.contains("dark")?"dark":"light");});
if(localStorage.getItem("pm-theme")==="dark")document.body.classList.add("dark");
$("#searchForm").addEventListener("submit",e=>{e.preventDefault();state.query=$("#searchInput").value.trim();renderBatches();});
$("#searchInput").addEventListener("input",e=>{state.query=e.target.value.trim();renderBatches();});
$("#refreshBtn").addEventListener("click",()=>loadBatches(true));
$("#loadMoreBtn").addEventListener("click",()=>{state.visibleLimit=(state.visibleLimit||120)+120;renderBatches();});
$("#backBtn").addEventListener("click",()=>setPage("batches"));
$("#batchGrid").addEventListener("click",e=>{
  const study=e.target.closest("[data-study]"), enroll=e.target.closest("[data-enroll]");
  if(study) openBatch(study.dataset.study);
  if(enroll){const b=state.batches.find(x=>String(batchId(x))===String(enroll.dataset.enroll));toast(`Congratulations 🎉 ${batchName(b||{})} selected!`);openBatch(enroll.dataset.enroll);}
});
$("#drawer").addEventListener("click",e=>{
  const btn=e.target.closest("[data-page]");if(!btn)return;
  const page=btn.dataset.page;
  if(page==="tests"){setPage("tests");return;}
  if(page==="mybatches"){toast("My Batches: saved/enrolled batches feature can be connected to an account.");setPage("batches");return;}
  if(page==="study"){setPage("batches");return;}
  setPage("batches");
});
$("#detailTabs").addEventListener("click",e=>{const btn=e.target.closest("[data-tab]");if(btn)showDetailPanels(btn.dataset.tab);});
$("#subjectList").addEventListener("click",e=>{const btn=e.target.closest("[data-subject]");if(btn)openSubject(Number(btn.dataset.subject));});
$("#chapterList").addEventListener("click",e=>{const btn=e.target.closest("[data-topic]");if(btn)openTopic(Number(btn.dataset.topic));});
$("#contentFilters").addEventListener("click",e=>{const btn=e.target.closest("[data-content]");if(btn)loadLessons(btn.dataset.content);});
$("#lessonList").addEventListener("click",e=>{const btn=e.target.closest("[data-lesson]");if(btn)openLesson(Number(btn.dataset.lesson));});
$("#backSubjectsBtn").addEventListener("click",()=>{$("#chaptersPanel").classList.add("hidden");$("#subjectsPanel").classList.remove("hidden");$("#todayCard").classList.remove("hidden");});
$("#backChaptersBtn").addEventListener("click",()=>{$("#contentPanel").classList.add("hidden");$("#chaptersPanel").classList.remove("hidden");});
$("#backLessonsBtn").addEventListener("click",()=>{$("#playerPanel").classList.add("hidden");$("#contentPanel").classList.remove("hidden");});
$("#announcementBtn").addEventListener("click",loadAnnouncements);
$("#shareBatchBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(location.href);toast("Batch page link copied");}catch{toast("Share is not available in this browser.");}});
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
loadBatches(true);
