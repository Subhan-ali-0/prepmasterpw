const STREAM_BASE = "https://proxy.streamvideo.co.in/fetch";
const KHAZANA = { programId:"62cc7a39ea773600110bec2f", subjectId:"62cc853e8f90fa001898321e", chapterId:"69c2695884245c85d1b3ddcb", topicId:"69c26b18f269271e6eadfe7b", subTopicId:"69c26b18974b391b3b603c8e" };
const get = (q,...keys) => { for (const k of keys) { const v=q[k]; if(typeof v==="string" && v.trim()) return v.trim(); } return ""; };
function upstream(path, query={}) { const u=new URL(STREAM_BASE+path); for(const [k,v] of Object.entries(query)) if(v!==undefined && v!==null && String(v)!=="") u.searchParams.set(k,String(v)); return u; }
function routeFor(name,q) {
  const batch=get(q,"BatchId","batchId"), subject=get(q,"SubjectId","subjectId"), topic=get(q,"TopicId","topicId");
  switch(name.toLowerCase()) {
    case "batchinfo": if(!batch) throw Object.assign(new Error("BatchId is required"),{status:400}); if(get(q,"Type")==="announcement") throw Object.assign(new Error("No announcements endpoint was supplied"),{status:501}); return upstream(`/api.penpencil.co/v3/batches/${encodeURIComponent(batch)}/details`);
    case "todays-schedule": case "schedule": if(!batch) throw Object.assign(new Error("BatchId is required"),{status:400}); return upstream(`/api.penpencil.co/v2/batches/${encodeURIComponent(batch)}/todays-schedule`,{page:get(q,"page")||"1"});
    case "subjectinfo": if(!batch||!subject) throw Object.assign(new Error("BatchId and SubjectId are required"),{status:400}); return upstream(`/api.penpencil.co/v2/batches/${encodeURIComponent(batch)}/subject/${encodeURIComponent(subject)}/topics`,{page:get(q,"page")||"1"});
    case "topicinfo": if(!batch||!subject||!topic) throw Object.assign(new Error("BatchId, SubjectId and TopicId are required"),{status:400}); { let type=get(q,"ContentType","contentType")||"videos"; if(type.toLowerCase()==="dpps")type="DppVideos"; if(type.toLowerCase()==="dpp-pdfs")type="DppNotes"; return upstream(`/api.penpencil.co/v2/batches/${encodeURIComponent(batch)}/subject/${encodeURIComponent(subject)}/contents`,{page:get(q,"page")||"1",contentType:type,tag:topic}); }
    case "batch-tests": if(!batch) throw Object.assign(new Error("batchId is required"),{status:400}); return upstream("/api.penpencil.co/v3/test-service/tests",{batchId,isSubjective:get(q,"isSubjective")||"false",categorySectionId:get(q,"categorySectionId")});
    case "test-instructions": { const id=get(q,"testId","TestId"); if(!id)throw Object.assign(new Error("testId is required"),{status:400}); return upstream(`/api.penpencil.co/v3/test-service/tests/${encodeURIComponent(id)}/instructions`); }
    case "dpp-tests": if(!batch||!get(q,"batchSubjectId","SubjectId","subjectId")||!get(q,"chapterId","TopicId","topicId"))throw Object.assign(new Error("batchId, batchSubjectId and chapterId are required"),{status:400}); return upstream("/api.penpencil.co/v3/test-service/tests/dpp",{batchId,batchSubjectId:get(q,"batchSubjectId","SubjectId","subjectId"),chapterId:get(q,"chapterId","TopicId","topicId"),isSubjective:get(q,"isSubjective")||"false",page:get(q,"page")||"1"});
    case "test-filters": if(!batch)throw Object.assign(new Error("batchId is required"),{status:400}); return upstream("/api.penpencil.co/v3/test-service/tests/filters",{batchId,isSubjective:get(q,"isSubjective")||"false"});
    case "khazana/filters": return upstream(`/api.penpencil.co/v2/programs/${KHAZANA.programId}/filters`,{page:get(q,"page")||"1",limit:get(q,"limit")||"20"});
    case "khazana/chapters": return upstream(`/api.penpencil.co/v2/programs/${KHAZANA.programId}/subjects/${KHAZANA.subjectId}/chapters/list`,{page:get(q,"page")||"1",limit:get(q,"limit")||"20"});
    case "khazana/topics": return upstream(`/api.penpencil.co/v2/programs/${KHAZANA.programId}/subjects/${KHAZANA.subjectId}/chapters/${encodeURIComponent(get(q,"chapterId")||KHAZANA.chapterId)}/topics/list`,{page:get(q,"page")||"1",limit:get(q,"limit")||"20"});
    case "khazana/sub-topics": return upstream(`/api.penpencil.co/v2/programs/${KHAZANA.programId}/subjects/${KHAZANA.subjectId}/chapters/${encodeURIComponent(get(q,"chapterId")||KHAZANA.chapterId)}/topics/${encodeURIComponent(get(q,"topicId")||KHAZANA.topicId)}/contents/sub-topic`,{page:get(q,"page")||"1",limit:get(q,"limit")||"20"});
    case "khazana/contents": return upstream(`/api.penpencil.co/v2/programs/${KHAZANA.programId}/subjects/${KHAZANA.subjectId}/chapters/${encodeURIComponent(get(q,"chapterId")||KHAZANA.chapterId)}/topics/${encodeURIComponent(get(q,"topicId")||KHAZANA.topicId)}/sub-topic/${encodeURIComponent(get(q,"subTopicId")||KHAZANA.subTopicId)}/contents`,{page:get(q,"page")||"1",limit:get(q,"limit")||"20"});
    default: throw Object.assign(new Error("Unknown StreamVideo proxy route"),{status:404});
  }
}
export default async function handler(req,res) {
  if(req.method!=="GET" && req.method!=="HEAD") return res.status(405).json({error:"Method not allowed"});
  try {
    const raw=req.query.path; const parts=Array.isArray(raw)?raw:String(raw||"").split("/");
    const all=parts.join("/"); const route=all.startsWith("api/")?all.slice(4):all;
    const url=routeFor(route,req.query);
    const response=await fetch(url,{headers:{Accept:"application/json, text/plain, */*","User-Agent":"PrepMaster/1.0"},signal:AbortSignal.timeout(20000)});
    const body=await response.arrayBuffer();
    res.status(response.status); res.setHeader("Content-Type",response.headers.get("content-type")||"application/json; charset=utf-8"); res.setHeader("Cache-Control","no-store");
    return res.end(Buffer.from(body));
  } catch(e) { return res.status(e.status||502).json({error:e.message||"Upstream request failed"}); }
}
