"use strict";

const SUPABASE_URL = "https://qoabnkbifgtsvupdeuco.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_NoyssNnS7lRQZPLbSZ4LuA_6zHThlBz";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth:{persistSession:true,storage:window.sessionStorage,storageKey:"sa_marks_session",autoRefreshToken:true,detectSessionInUrl:false}
});

/* ACCOUNTS → MARKS SINGLE LOGIN BRIDGE
   Accounts authenticates the human user; the Edge Function creates/refreshes
   a short-lived Marks admin session without exposing a Marks password. */
const ACCOUNTS_SUPABASE_URL = "https://hspsaglksnmhuqfuxccm.supabase.co";
const ACCOUNTS_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-byhdB5_dxkqQ0YXmC8yEQ_xDSWMbOp";
const ACCOUNTS_AUTH_STORAGE_KEY = "sa_accounts_supabase_session";
const ACCOUNTANT_EMAIL = "accountant@staugustine.edu.np";
const MARKS_SSO_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/accounts-sso`;

const accountsSb = window.supabase.createClient(
  ACCOUNTS_SUPABASE_URL,
  ACCOUNTS_SUPABASE_PUBLISHABLE_KEY,
  {
    auth:{
      persistSession:true,
      storage:window.sessionStorage,
      storageKey:ACCOUNTS_AUTH_STORAGE_KEY,
      autoRefreshToken:true,
      detectSessionInUrl:false
    }
  }
);

const CLASSES=["Nursery","LKG","UKG",...Array.from({length:10},(_,i)=>`Class ${i+1}`)];
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
let state={user:null,profile:null,page:"dashboard",years:[],yearId:null,settings:{},grades:[],marksContext:null};

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function creditFmt(v){const n=Number(v);if(!Number.isFinite(n))return "0";const r=Math.round((n+Number.EPSILON)*100)/100;return String(r);}

/* v26 — keep student order numeric/natural even though roll_no is stored as text. */
const _studentNaturalCollator=new Intl.Collator(undefined,{numeric:true,sensitivity:"base"});
function _studentRowsSorted(rows){
  return [...(rows||[])].sort((a,b)=>{
    const ac=String(a?.class_name??"").trim(),bc=String(b?.class_name??"").trim();
    const ai=CLASSES.indexOf(ac),bi=CLASSES.indexOf(bc);
    if(ai>=0&&bi>=0&&ai!==bi)return ai-bi;
    if(ai>=0&&bi<0)return -1;if(ai<0&&bi>=0)return 1;
    const cc=_studentNaturalCollator.compare(ac,bc);if(cc)return cc;
    const ar=String(a?.roll_no??"").trim(),br=String(b?.roll_no??"").trim();
    if(!ar&&br)return 1;if(ar&&!br)return -1;
    const an=Number(ar),bn=Number(br);
    if(Number.isFinite(an)&&Number.isFinite(bn)&&an!==bn)return an-bn;
    const rc=_studentNaturalCollator.compare(ar,br);if(rc)return rc;
    return _studentNaturalCollator.compare(String(a?.name??""),String(b?.name??""));
  });
}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove("show"),2800);}
function errMsg(e){return e?.message||String(e||"Unknown error");}
function classOptions(sel=""){return CLASSES.map(c=>`<option ${c===sel?"selected":""}>${esc(c)}</option>`).join("");}
function currentYear(){return state.years.find(y=>String(y.id)===String(state.yearId));}
function isAdmin(){return String(state.profile?.role||"").toLowerCase()==="admin";}
function setPageActions(html=""){ $("#pageActions").innerHTML=html; }
function openModal(title,html,kicker="DETAIL"){ $("#modalTitle").textContent=title;$("#modalKicker").textContent=kicker;$("#modalContent").innerHTML=html;$("#modalBackdrop").classList.remove("hidden"); }
function closeModal(){ $("#modalBackdrop").classList.add("hidden"); }

async function q(table,columns="*"){return sb.from(table).select(columns);}
async function loadProfile(){
  const {data,error}=await sb.from("app_users").select("auth_user_id,username,display_name,role,active").eq("auth_user_id",state.user.id).single();
  if(error) throw error; if(!data?.active) throw new Error("This Marks account is inactive."); if(String(data?.role||"").toLowerCase()!=="admin") throw new Error("Administrator login required."); state.profile=data;
}
async function loadFoundation(){
  const [{data:years,error:ye},{data:settings,error:se},{data:grades,error:ge}]=await Promise.all([
    sb.from("academic_years").select("*").order("name",{ascending:false}),
    sb.from("settings").select("key,value"),
    sb.from("grading_scale").select("*").order("sort_order"),
  ]);
  if(ye)throw ye;if(se)throw se;if(ge)throw ge;
  state.years=years||[];state.settings=Object.fromEntries((settings||[]).map(r=>[r.key,r.value]));state.grades=grades||[];
  const active=state.years.find(x=>x.is_active)||state.years[0]; if(!state.yearId&&active)state.yearId=active.id;
  renderYearSelect();
}
function renderYearSelect(){
  const s=$("#yearSelect");s.innerHTML=state.years.map(y=>`<option value="${y.id}" ${String(y.id)===String(state.yearId)?"selected":""}>${esc(y.name)}${y.is_active?" (Active)":""}</option>`).join("");
  if(currentYear()) $("#activeYearText").textContent=`Academic Year ${currentYear().name}`;
}

const NAV=[
  ["dashboard","▦","Dashboard"],["students","♟","Students"],["marks","✎","Marks Entry"],["subjects","≡","Subject Setup"],["results","▤","Results / Grade Sheets"],["settings","⚙","Settings"]
];
function renderNav(){
  $("#nav").innerHTML=NAV.map(([p,i,l])=>`<button class="nav-btn ${state.page===p?"active":""}" data-page="${p}"><span class="nav-icon">${i}</span>${l}</button>`).join("");
  $$(".nav-btn").forEach(b=>b.onclick=()=>navigate(b.dataset.page));
}
async function navigate(page){state.page=page;renderNav();const titles={dashboard:"Dashboard",students:"Students",marks:"Marks Entry",subjects:"Subject Setup",results:"Results / Grade Sheets",settings:"Settings"};$("#pageTitle").textContent=titles[page]||page;$("#breadcrumb").textContent=`Marks > ${titles[page]||page}`;setPageActions("");$("#content").innerHTML=`<div class="section"><div class="empty">Loading…</div></div>`;try{await ({dashboard:renderDashboard,students:renderStudents,marks:renderMarks,subjects:renderSubjects,results:renderResults,settings:renderSettings}[page]||renderDashboard)();}catch(e){console.error(e);$("#content").innerHTML=`<div class="danger">${esc(errMsg(e))}</div>`;}}

async function renderDashboard(){
  const yearId=state.yearId;
  const [{count:students,error:e1},{count:subjects,error:e2},{count:exams,error:e3},{count:marks,error:e4}]=await Promise.all([
    sb.from("students").select("id",{count:"exact",head:true}).eq("academic_year_id",yearId).eq("active",true),
    sb.from("subjects").select("id",{count:"exact",head:true}).eq("academic_year_id",yearId).eq("active",true),
    sb.from("exams").select("id",{count:"exact",head:true}).eq("academic_year_id",yearId),
    sb.from("marks").select("id,students!inner(academic_year_id)",{count:"exact",head:true}).eq("students.academic_year_id",yearId)
  ]);if(e1)throw e1;if(e2)throw e2;if(e3)throw e3;if(e4)throw e4;
  const {data:examRows,error}=await sb.from("exams").select("id,name,exam_type,status,publish_date_bs,sort_order").eq("academic_year_id",yearId).order("sort_order");if(error)throw error;
  $("#content").innerHTML=`
  <div class="grid cards">
   <div class="card stat-card"><small>Students</small><strong>${students||0}</strong><span>Active records</span></div>
   <div class="card stat-card"><small>Subjects</small><strong>${subjects||0}</strong><span>Class-wise subjects</span></div>
   <div class="card stat-card"><small>Examinations</small><strong>${exams||0}</strong><span>Current academic year</span></div>
   <div class="card stat-card"><small>Saved Mark Cells</small><strong>${marks||0}</strong><span>Online entries</span></div>
  </div>
  <div class="section" style="margin-top:14px"><div class="section-title"><div><h3>Examinations — ${esc(currentYear()?.name||"")}</h3><p>Marks and results stay inside the selected academic year.</p></div></div>
  ${examRows?.length?`<div class="table-wrap"><table><thead><tr><th>Exam</th><th>Type</th><th>Status</th><th>Issue Date</th><th></th></tr></thead><tbody>${examRows.map(e=>`<tr><td><strong>${esc(e.name)}</strong></td><td>${esc(e.exam_type)}</td><td><span class="chip blue">${esc(e.status)}</span></td><td>${esc(e.publish_date_bs||"-")}</td><td><button class="btn small" onclick="state.page='results';renderNav();navigate('results')">Open Results</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No exam configured for this year.</div>`}</div>`;
}

async function renderStudents(){
  setPageActions(`<button class="btn primary" id="addStudentBtn">+ Add Student</button>`);
  $("#content").innerHTML=`<div class="section"><div class="toolbar"><div class="field"><label>Class</label><select id="studentClass"><option value="">All Classes</option>${CLASSES.map(c=>`<option>${c}</option>`).join("")}</select></div><div class="field grow"><label>Search</label><input id="studentSearch" placeholder="Name / roll / symbol / IEMIS ID" /></div><button class="btn" id="studentRefresh">Refresh</button></div></div><div class="section"><div id="studentTable"></div></div>`;
  $("#addStudentBtn").onclick=()=>studentDialog();$("#studentRefresh").onclick=loadStudents;$("#studentClass").onchange=loadStudents;$("#studentSearch").oninput=()=>{clearTimeout(renderStudents._t);renderStudents._t=setTimeout(loadStudents,250)};await loadStudents();
}
async function loadStudents(){
  let req=sb.from("students").select("*").eq("academic_year_id",state.yearId).order("class_name").order("roll_no").order("name");const cls=$("#studentClass")?.value||"";if(cls)req=req.eq("class_name",cls);const {data,error}=await req;if(error)throw error;let rows=_studentRowsSorted(data);const s=($("#studentSearch")?.value||"").trim().toLowerCase();if(s)rows=rows.filter(r=>[r.name,r.roll_no,r.symbol_no,r.registration_no].some(v=>String(v||"").toLowerCase().includes(s)));
  $("#studentTable").innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Class</th><th>Roll</th><th>Student</th><th>Symbol No.</th><th>IEMIS ID</th><th>Gender</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.class_name)}</td><td>${esc(r.roll_no||"")}</td><td><strong>${esc(r.name)}</strong></td><td>${esc(r.symbol_no||"")}</td><td>${esc(r.registration_no||"")}</td><td>${esc(r.gender||"")}</td><td>${r.active?'<span class="chip good">Active</span>':'<span class="chip bad">Inactive</span>'}</td><td class="nowrap"><button class="btn small" onclick="studentDialog(${r.id})">Edit</button> <button class="btn small red" onclick="deleteStudent(${r.id})">Delete</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No students found.</div>`;
}
async function studentDialog(id=null){let r={class_name:"Nursery",roll_no:"",symbol_no:"",registration_no:"",name:"",dob:"",gender:"",active:true};if(id){const {data,error}=await sb.from("students").select("*").eq("id",id).single();if(error)return toast(errMsg(error));r=data;}
  openModal(id?"Edit Student":"Add Student",`<form id="studentForm" class="form-grid three"><div class="field"><label>Class</label><select name="class_name">${classOptions(r.class_name)}</select></div><div class="field"><label>Roll No.</label><input name="roll_no" value="${esc(r.roll_no||"")}"></div><div class="field"><label>Symbol No.</label><input name="symbol_no" value="${esc(r.symbol_no||"")}"></div><div class="field"><label>IEMIS ID</label><input name="registration_no" value="${esc(r.registration_no||"")}"></div><div class="field full"><label>Student Name</label><input name="name" value="${esc(r.name||"")}" required></div><div class="field"><label>DOB</label><input name="dob" value="${esc(r.dob||"")}"></div><div class="field"><label>Gender</label><input name="gender" value="${esc(r.gender||"")}"></div><div class="field"><label>Active</label><select name="active"><option value="true" ${r.active?"selected":""}>Yes</option><option value="false" ${!r.active?"selected":""}>No</option></select></div><div class="form-actions full"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" type="submit">Save Student</button></div></form>`);
  $("#studentForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));const payload={academic_year_id:state.yearId,class_name:f.class_name,roll_no:f.roll_no||null,symbol_no:f.symbol_no||null,registration_no:f.registration_no||null,name:f.name.trim(),dob:f.dob||null,gender:f.gender||null,active:f.active==="true"};if(!payload.name)return toast("Student name is required.");const res=id?await sb.from("students").update(payload).eq("id",id):await sb.from("students").insert(payload);if(res.error)return toast(errMsg(res.error));closeModal();toast("Student saved.");await loadStudents();};
}
async function deleteStudent(id){if(!confirm("Delete this student? Existing marks will also be deleted."))return;const {error}=await sb.from("students").delete().eq("id",id);if(error)return toast(errMsg(error));toast("Student deleted.");await loadStudents();}

async function renderSubjects(){
  $("#content").innerHTML=`<div class="section"><div class="toolbar"><div class="field"><label>Class</label><select id="subjectClass">${classOptions("Class 1")}</select></div><button class="btn primary" id="addSubjectBtn">+ Subject</button><button class="btn" id="classSettingsBtn">Class Grade-Sheet Settings</button></div></div><div class="section"><div id="subjectArea"></div></div>`;
  $("#subjectClass").onchange=loadSubjects;$("#addSubjectBtn").onclick=()=>subjectDialog();$("#classSettingsBtn").onclick=classSettingsDialog;await loadSubjects();
}
async function loadSubjects(){const cls=$("#subjectClass").value;const {data,error}=await sb.from("subjects").select("*,components(*)").eq("academic_year_id",state.yearId).eq("class_name",cls).order("sort_order").order("id");if(error)throw error;const rows=data||[];$("#subjectArea").innerHTML=rows.length?rows.map(s=>`<div class="section" style="box-shadow:none"><div class="section-title"><div><h3>${esc(s.name)}</h3><p>Total Credit Hour: ${creditFmt(s.credit_hour)} ${s.active?"":" • Inactive"}</p></div><div><button class="btn small" onclick="subjectDialog(${s.id})">Edit Subject</button> <button class="btn small primary" onclick="componentDialog(${s.id})">+ Component</button> <button class="btn small red" onclick="deleteSubject(${s.id})">Delete</button></div></div>${s.components?.length?`<div class="table-wrap"><table><thead><tr><th>Code</th><th>Label</th><th>Full Marks</th><th>Weight %</th><th>Credit Hour</th><th>Pass %</th><th></th></tr></thead><tbody>${s.components.sort((a,b)=>a.sort_order-b.sort_order).map(c=>`<tr><td><strong>${esc(c.code)}</strong></td><td>${esc(c.label)}</td><td>${num(c.full_marks)}</td><td>${c.weight_percent??""}</td><td>${c.credit_hour==null?"":creditFmt(c.credit_hour)}</td><td>${c.pass_percent??""}</td><td><button class="btn small" onclick="componentDialog(${s.id},${c.id})">Edit</button> <button class="btn small red" onclick="deleteComponent(${c.id})">Delete</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No components. Add Internal / Theory / Practical etc.</div>`}</div>`).join(""):`<div class="empty">No subjects for ${esc(cls)}. You can add your own subjects.</div>`;}
async function subjectDialog(id=null){const cls=$("#subjectClass").value;let r={name:"",sort_order:1,active:true};if(id){const {data,error}=await sb.from("subjects").select("*").eq("id",id).single();if(error)return toast(errMsg(error));r=data;}openModal(id?"Edit Subject":"Add Subject",`<form id="subjectForm" class="form-grid"><div class="field"><label>Class</label><input value="${esc(cls)}" disabled></div><div class="field"><label>Subject Name</label><input name="name" value="${esc(r.name)}" required></div><div class="field"><label>Sort Order</label><input name="sort_order" type="number" value="${num(r.sort_order)||1}"></div><div class="field"><label>Active</label><select name="active"><option value="true" ${r.active?"selected":""}>Yes</option><option value="false" ${!r.active?"selected":""}>No</option></select></div><div class="info full">Subject Credit Hour is automatically calculated from component credit hours.</div><div class="form-actions full"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">Save Subject</button></div></form>`);$("#subjectForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));const p={academic_year_id:state.yearId,class_name:cls,name:f.name.trim().toUpperCase(),sort_order:num(f.sort_order),active:f.active==="true"};const res=id?await sb.from("subjects").update(p).eq("id",id):await sb.from("subjects").insert({...p,credit_hour:0});if(res.error)return toast(errMsg(res.error));closeModal();toast("Subject saved.");await loadSubjects();};}
async function deleteSubject(id){if(!confirm("Delete this subject, all components and their marks?"))return;const {error}=await sb.from("subjects").delete().eq("id",id);if(error)return toast(errMsg(error));toast("Subject deleted.");await loadSubjects();}
async function componentDialog(subjectId,id=null){let r={code:"",label:"",full_marks:100,weight_percent:"",credit_hour:1,pass_percent:0,sort_order:1};if(id){const {data,error}=await sb.from("components").select("*").eq("id",id).single();if(error)return toast(errMsg(error));r=data;}openModal(id?"Edit Component":"Add Component",`<form id="componentForm" class="form-grid three"><div class="field"><label>Code</label><input name="code" value="${esc(r.code)}" placeholder="IN / TH / PR" required></div><div class="field"><label>Label</label><input name="label" value="${esc(r.label)}" placeholder="INTERNAL / THEORY" required></div><div class="field"><label>Full Marks</label><input name="full_marks" type="number" step="0.01" min="0.01" value="${num(r.full_marks)}" required></div><div class="field"><label>Weight %</label><input name="weight_percent" type="number" step="0.01" value="${r.weight_percent??""}"></div><div class="field"><label>Credit Hour</label><input name="credit_hour" type="number" step="0.01" min="0" value="${r.credit_hour??""}"></div><div class="field"><label>Pass %</label><input name="pass_percent" type="number" step="0.01" min="0" max="100" value="${r.pass_percent??""}"></div><div class="field"><label>Sort Order</label><input name="sort_order" type="number" value="${num(r.sort_order)||1}"></div><div class="form-actions full"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">Save Component</button></div></form>`);$("#componentForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));const p={subject_id:subjectId,code:f.code.trim().toUpperCase(),label:f.label.trim().toUpperCase(),full_marks:num(f.full_marks),weight_percent:f.weight_percent===""?null:num(f.weight_percent),credit_hour:f.credit_hour===""?null:num(f.credit_hour),pass_percent:f.pass_percent===""?null:num(f.pass_percent),sort_order:num(f.sort_order)};const res=id?await sb.from("components").update(p).eq("id",id):await sb.from("components").insert(p);if(res.error)return toast(errMsg(res.error));closeModal();toast("Component saved.");await loadSubjects();};}
async function deleteComponent(id){if(!confirm("Delete this component and its marks?"))return;const {error}=await sb.from("components").delete().eq("id",id);if(error)return toast(errMsg(error));toast("Component deleted.");await loadSubjects();}
async function classSettingsDialog(){const cls=$("#subjectClass").value;const {data,error}=await sb.from("class_settings").select("*").eq("academic_year_id",state.yearId).eq("class_name",cls).maybeSingle();if(error)return toast(errMsg(error));const r=data||{class_teacher:"",assessment_label:"",bs_year_text:currentYear()?.name||"",ad_year_text:""};openModal("Class Grade-Sheet Settings",`<form id="classSetForm" class="form-grid"><div class="field full"><label>Class</label><input value="${esc(cls)}" disabled></div><div class="field"><label>Class Teacher</label><input name="class_teacher" value="${esc(r.class_teacher||"")}"></div><div class="field"><label>Assessment / Exam Wording</label><input name="assessment_label" value="${esc(r.assessment_label||"")}"></div><div class="field"><label>B.S. Year Text</label><input name="bs_year_text" value="${esc(r.bs_year_text||"")}"></div><div class="field"><label>A.D. Year Text</label><input name="ad_year_text" value="${esc(r.ad_year_text||"")}"></div><div class="form-actions full"><button class="btn" type="button" onclick="closeModal()">Cancel</button><button class="btn primary">Save</button></div></form>`);$("#classSetForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));const {error}=await sb.from("class_settings").upsert({academic_year_id:state.yearId,class_name:cls,...f},{onConflict:"academic_year_id,class_name"});if(error)return toast(errMsg(error));closeModal();toast("Class settings saved.");};}

async function examOptions(){const {data,error}=await sb.from("exams").select("*").eq("academic_year_id",state.yearId).order("sort_order").order("id");if(error)throw error;return data||[];}
async function renderMarks(){const exams=await examOptions();$("#content").innerHTML=`<div class="section"><div class="toolbar"><div class="field"><label>Exam</label><select id="markExam">${exams.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></div><div class="field"><label>Class</label><select id="markClass">${classOptions("Class 1")}</select></div><div class="field"><label>Subject</label><select id="markSubject"></select></div><button class="btn primary" id="loadMarksBtn">Load Marks Sheet</button></div></div><div class="section"><div id="marksArea"><div class="empty">Select Exam, Class and Subject.</div></div></div>`;$("#markClass").onchange=loadMarkSubjects;$("#loadMarksBtn").onclick=loadMarksSheet;await loadMarkSubjects();}
async function loadMarkSubjects(){const cls=$("#markClass").value;const {data,error}=await sb.from("subjects").select("id,name").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("sort_order");if(error)return toast(errMsg(error));$("#markSubject").innerHTML=(data||[]).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");}
async function loadMarksSheet(){const examId=num($("#markExam").value),cls=$("#markClass").value,subjectId=num($("#markSubject").value);if(!examId||!subjectId)return toast("Select exam and subject.");const [{data:students,error:e1},{data:components,error:e2},{data:marks,error:e3}]=await Promise.all([sb.from("students").select("id,roll_no,name,symbol_no").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("roll_no").order("name"),sb.from("components").select("*").eq("subject_id",subjectId).order("sort_order"),sb.from("marks").select("*").eq("exam_id",examId)]);if(e1)throw e1;if(e2)throw e2;if(e3)throw e3;const comps=components||[],rows=students||[],mMap=new Map((marks||[]).map(m=>[`${m.student_id}_${m.component_id}`,m]));state.marksContext={examId,cls,subjectId,components:comps,students:rows};if(!rows.length||!comps.length){$("#marksArea").innerHTML=`<div class="empty">Students or components are missing for this selection.</div>`;return;}$("#marksArea").innerHTML=`<div class="info">Enter a mark between 0 and Full Marks, or type <strong>ABS</strong>. Saving a mark automatically returns the class result status to DRAFT.</div><div class="table-wrap"><table><thead><tr><th>Roll</th><th>Student</th>${comps.map(c=>`<th class="center">${esc(c.code)}<br><small>FM ${num(c.full_marks)} • Pass ${num(c.pass_percent)}%</small></th>`).join("")}</tr></thead><tbody>${rows.map(s=>`<tr><td>${esc(s.roll_no||"")}</td><td><strong>${esc(s.name)}</strong></td>${comps.map(c=>{const m=mMap.get(`${s.id}_${c.id}`);const v=m?(m.status==="ABS"?"ABS":m.obtained_mark):"";return `<td class="center"><input class="mark-input ${v==="ABS"?"abs":""}" data-student="${s.id}" data-component="${c.id}" data-full="${num(c.full_marks)}" value="${esc(v)}"></td>`}).join("")}</tr>`).join("")}</tbody></table></div><div class="form-actions" style="margin-top:12px"><button id="saveMarksBtn" class="btn green">Save All Marks</button></div>`;$("#saveMarksBtn").onclick=saveMarks;$$('.mark-input').forEach(i=>i.oninput=()=>i.classList.toggle("abs",i.value.trim().toUpperCase()==="ABS"));}
async function saveMarks(){const c=state.marksContext;if(!c)return;const upserts=[],deletes=[];for(const el of $$(".mark-input")){const raw=el.value.trim();const student_id=num(el.dataset.student),component_id=num(el.dataset.component),full=num(el.dataset.full);if(!raw){deletes.push([student_id,component_id]);continue;}if(raw.toUpperCase()==="ABS"){upserts.push({exam_id:c.examId,student_id,component_id,obtained_mark:null,status:"ABS"});continue;}const mark=Number(raw);if(!Number.isFinite(mark)||mark<0||mark>full)return toast(`Invalid mark '${raw}'. Allowed 0-${full} or ABS.`);upserts.push({exam_id:c.examId,student_id,component_id,obtained_mark:mark,status:"MARK"});}
  $("#saveMarksBtn").disabled=true;try{if(upserts.length){const {error}=await sb.from("marks").upsert(upserts,{onConflict:"exam_id,student_id,component_id"});if(error)throw error;}for(const [sid,cid] of deletes){const {error}=await sb.from("marks").delete().eq("exam_id",c.examId).eq("student_id",sid).eq("component_id",cid);if(error)throw error;}toast("Marks saved successfully.");}catch(e){toast(errMsg(e));}finally{$("#saveMarksBtn").disabled=false;}}

function gradeForPercent(percent,pass){if(percent==null)return {grade:"-",grade_point:null,is_ng:false};if(percent+1e-12<num(pass))return {grade:"NG",grade_point:null,is_ng:true};const g=state.grades.find(x=>percent>=num(x.min_percent)&&percent<=num(x.max_percent));if(!g)return {grade:"-",grade_point:null,is_ng:false};if(g.is_ng)return {grade:"NG",grade_point:null,is_ng:true};return {grade:g.grade,grade_point:num(g.grade_point),is_ng:false};}
function gradeForGP(gp){const sorted=[...state.grades].filter(x=>!x.is_ng).sort((a,b)=>num(b.grade_point)-num(a.grade_point));return sorted.find(x=>gp+1e-9>=num(x.grade_point))||sorted.at(-1)||null;}
function finalGradeForSubjectGP(gp){const raw=Number(gp);if(!Number.isFinite(raw))return "-";const x=Math.round((raw+Number.EPSILON)*100)/100;if(x>4.00)return "Error";if(x>=3.61)return "A+";if(x>=3.21)return "A";if(x>=2.81)return "B+";if(x>=2.41)return "B";if(x>=2.01)return "C+";if(x>=1.61)return "C";if(x>=1.60)return "D";return "NG";}
async function calculateClassResults(examId,cls){const [{data:students,error:e1},{data:subjects,error:e2},{data:marks,error:e3}]=await Promise.all([sb.from("students").select("*").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("roll_no").order("name"),sb.from("subjects").select("*,components(*)").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("sort_order"),sb.from("marks").select("*").eq("exam_id",examId)]);if(e1)throw e1;if(e2)throw e2;if(e3)throw e3;const m=new Map((marks||[]).map(x=>[`${x.student_id}_${x.component_id}`,x]));const results=[];for(const st of _studentRowsSorted(students)){let incomplete=false,anyNg=false,totalCredit=0,totalWgp=0;const subs=[];for(const sub of subjects||[]){const comps=(sub.components||[]).sort((a,b)=>a.sort_order-b.sort_order);const out=[];for(const c of comps){const mr=m.get(`${st.id}_${c.id}`);let status=mr?.status||"MISSING",obt=mr?.obtained_mark,percent=null,g={grade:"-",grade_point:null,is_ng:false};if(status==="MISSING")incomplete=true;else{percent=status==="ABS"?0:(num(obt)/num(c.full_marks)*100);g=gradeForPercent(percent,c.pass_percent);if(g.is_ng)anyNg=true;}out.push({...c,status,obtained_mark:obt,percent,...g,wgp:g.grade_point==null?null:num(c.credit_hour)*g.grade_point});}
      const credit=out.reduce((a,c)=>a+num(c.credit_hour),0),missing=out.some(c=>c.status==="MISSING"),ng=out.some(c=>c.is_ng);let finalGrade="-",gp=null,wgp=null;if(missing||credit<=0){incomplete=true;}else{totalCredit+=credit;if(ng){finalGrade="NG";}else{wgp=out.reduce((a,c)=>a+num(c.wgp),0);gp=wgp/credit;finalGrade=finalGradeForSubjectGP(gp);totalWgp+=wgp;}}subs.push({...sub,components:out,credit_hour:credit,final_grade:finalGrade,final_grade_point:gp,wgp,is_ng:ng});}
    let gpa=null,status="INCOMPLETE";if(!incomplete&&totalCredit>0){if(anyNg){gpa=0;status="NG";}else{gpa=Math.round((totalWgp/totalCredit+1e-12)*100)/100;status="PASS";}}results.push({student:st,subjects:subs,total_credit:totalCredit,total_wgp:totalWgp,gpa,gpa_display:gpa==null?"-":gpa.toFixed(2),status,incomplete,has_ng:anyNg});}
  return results;
}
async function renderResults(){const exams=await examOptions();$("#content").innerHTML=`<div class="section"><div class="toolbar"><div class="field"><label>Exam</label><select id="resExam">${exams.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></div><div class="field"><label>Class</label><select id="resClass">${classOptions("Class 1")}</select></div><button class="btn primary" id="loadResultsBtn">Calculate / Preview</button></div></div><div class="section"><div id="resultsArea"><div class="empty">Select exam and class to preview results.</div></div></div>`;$("#loadResultsBtn").onclick=refreshResults;}
async function refreshResults(){const examId=num($("#resExam").value),cls=$("#resClass").value;if(!examId)return;$("#resultsArea").innerHTML=`<div class="empty">Calculating…</div>`;const [results,pubRes,examRes]=await Promise.all([calculateClassResults(examId,cls),sb.from("result_publications").select("*").eq("exam_id",examId).eq("class_name",cls).maybeSingle(),sb.from("exams").select("*").eq("id",examId).single()]);if(pubRes.error)throw pubRes.error;if(examRes.error)throw examRes.error;const pub=pubRes.data||{status:"DRAFT",publish_date_bs:""},exam=examRes.data;const pass=results.filter(r=>r.status==="PASS").length,ng=results.filter(r=>r.status==="NG").length,inc=results.filter(r=>r.status==="INCOMPLETE").length,complete=results.length?Math.round((results.length-inc)/results.length*100):0;state.resultContext={examId,cls,results,pub,exam};$("#resultsArea").innerHTML=`<div class="result-summary"><div class="summary-box"><small>RESULT STATUS</small><strong>${esc(pub.status)}</strong></div><div class="summary-box"><small>COMPLETION</small><strong>${complete}%</strong></div><div class="summary-box"><small>PASS</small><strong>${pass}</strong></div><div class="summary-box"><small>NG</small><strong>${ng}</strong></div><div class="summary-box"><small>INCOMPLETE</small><strong>${inc}</strong></div></div><div class="toolbar" style="margin-bottom:12px"><div class="field"><label>Date of Issue (B.S.)</label><input id="issueDate" value="${esc(pub.publish_date_bs||exam.publish_date_bs||"")}" placeholder="2083-05-30"></div><button class="btn amber" onclick="setResultStatus('FINALIZED')">Finalize</button><button class="btn green" onclick="setResultStatus('PUBLISHED')">Publish</button><button class="btn green" onclick="downloadBulkResultsPdf()">Download Bulk PDF</button><button class="btn" onclick="printBulkResults()">Bulk Print</button></div>${inc?`<div class="notice">${inc} student(s) still have missing mark components. Finalize/Publish only after checking the result.</div>`:""}<div class="table-wrap"><table><thead><tr><th>Roll</th><th>Student</th><th>Status</th><th>GPA</th><th>Total Credit</th><th></th></tr></thead><tbody>${results.map(r=>`<tr><td>${esc(r.student.roll_no||"")}</td><td><strong>${esc(r.student.name)}</strong></td><td><span class="chip ${r.status==="PASS"?"good":r.status==="NG"?"bad":"warn"}">${r.status}</span></td><td><strong>${r.gpa_display}</strong></td><td>${creditFmt(r.total_credit)}</td><td><button class="btn small" onclick="printSingleResult(${r.student.id})">Preview / Print</button></td></tr>`).join("")}</tbody></table></div>`;}
async function setResultStatus(status){const c=state.resultContext;if(!c)return;const date=($("#issueDate")?.value||"").trim();if(status==="PUBLISHED"&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return toast("Enter Date of Issue in YYYY-MM-DD format before publishing.");if(status==="FINALIZED"&&c.results.some(r=>r.incomplete))return toast("Complete all marks before finalizing.");const {error}=await sb.from("result_publications").upsert({exam_id:c.examId,class_name:c.cls,status,publish_date_bs:date},{onConflict:"exam_id,class_name"});if(error)return toast(errMsg(error));if(status==="PUBLISHED")await sb.from("exams").update({status:"PUBLISHED",publish_date_bs:date}).eq("id",c.examId);toast(`Result ${status.toLowerCase()}.`);await refreshResults();}
async function gradeSheetSettings(cls){const {data,error}=await sb.from("class_settings").select("*").eq("academic_year_id",state.yearId).eq("class_name",cls).maybeSingle();if(error)throw error;return data||{};}
function gradeSheetHtml(result,exam,cfg,issueDate){const school=state.settings.school_name||"St Augustine Academic Foundation",addr=state.settings.school_address||"Suryodaya Municipality - 11, Tinghare";return `<div class="print-sheet"><div class="print-school"><h1>${esc(school)}</h1><p>${esc(addr)}</p><p>ESTD. ${esc(state.settings.established||"2053")}</p></div><div class="print-title">${esc(cfg.assessment_label||exam.name)}</div><div class="print-meta"><div><b>Student:</b> ${esc(result.student.name)}</div><div><b>Class:</b> ${esc(result.student.class_name)}</div><div><b>Roll No.:</b> ${esc(result.student.roll_no||"")}</div><div><b>Symbol No.:</b> ${esc(result.student.symbol_no||"")}</div><div><b>B.S. Year:</b> ${esc(cfg.bs_year_text||currentYear()?.name||"")}</div><div><b>Date of Issue:</b> ${esc(issueDate||"-")}</div></div><table class="grade-table"><thead><tr><th>Subject</th><th>Component</th><th>FM</th><th>OM</th><th>Credit</th><th>Grade</th><th>GP</th><th>WGP</th></tr></thead><tbody>${result.subjects.map(s=>s.components.map((c,i)=>`<tr>${i===0?`<td rowspan="${s.components.length}"><strong>${esc(s.name)}</strong><br>Final: ${esc(s.final_grade)}</td>`:""}<td>${esc(c.code)}</td><td class="center">${num(c.full_marks)}</td><td class="center">${c.status==="ABS"?"ABS":c.status==="MISSING"?"-":num(c.obtained_mark)}</td><td class="center">${creditFmt(c.credit_hour)}</td><td class="center">${esc(c.grade)}</td><td class="center">${c.grade_point==null?"-":num(c.grade_point).toFixed(2)}</td><td class="center">${c.wgp==null?"-":num(c.wgp).toFixed(2)}</td></tr>`).join("")).join("")}<tr><td colspan="4"><strong>Overall Result: ${esc(result.status)}</strong></td><td><strong>${creditFmt(result.total_credit)}</strong></td><td colspan="2" class="right"><strong>GPA</strong></td><td class="center"><strong>${result.gpa_display}</strong></td></tr></tbody></table><div class="print-foot"><span>Prepared By: ${esc(state.settings.prepared_by||"")}</span><span>Class Teacher: ${esc(cfg.class_teacher||"")}</span><span>Principal: ${esc(state.settings.principal_name||"")}</span></div></div>`;}
async function printSingleResult(studentId){const c=state.resultContext;if(!c)return;const r=c.results.find(x=>x.student.id===studentId);const cfg=await gradeSheetSettings(c.cls);const issue=($("#issueDate")?.value||c.pub.publish_date_bs||"");const old=$("#content").innerHTML;$("#content").innerHTML=gradeSheetHtml(r,c.exam,cfg,issue);window.print();$("#content").innerHTML=old;}
async function printBulkResults(){const c=state.resultContext;if(!c)return;const issue=($("#issueDate")?.value||c.pub.publish_date_bs||"");if(!issue)return toast("Enter Date of Issue before Bulk PDF/Print.");const cfg=await gradeSheetSettings(c.cls);const old=$("#content").innerHTML;$("#content").innerHTML=c.results.map((r,i)=>gradeSheetHtml(r,c.exam,cfg,issue)+(i<c.results.length-1?'<div class="page-break"></div>':'')).join("");window.print();$("#content").innerHTML=old;}

async function renderSettings(){const exams=await examOptions();$("#content").innerHTML=`<div class="grid" style="grid-template-columns:1fr 1fr"><div class="section"><div class="section-title"><div><h3>Academic Years</h3><p>Create future years and optionally copy setup.</p></div></div><div class="toolbar"><button class="btn primary" onclick="yearDialog()">+ Create Academic Year</button></div><div style="margin-top:12px" class="table-wrap"><table><thead><tr><th>Year</th><th>Status</th><th></th></tr></thead><tbody>${state.years.map(y=>`<tr><td><strong>${esc(y.name)}</strong></td><td>${y.is_active?'<span class="chip good">Active</span>':''}</td><td><button class="btn small" onclick="activateYear(${y.id})">Set Active</button></td></tr>`).join("")}</tbody></table></div></div><div class="section"><div class="section-title"><div><h3>Examinations</h3><p>Add, edit or delete exams for ${esc(currentYear()?.name||"")}.</p></div><button class="btn primary" onclick="examDialog()">+ Examination</button></div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>${exams.map(e=>`<tr><td>${esc(e.name)}</td><td>${esc(e.exam_type)}</td><td>${esc(e.status)}</td><td><button class="btn small" onclick="examDialog(${e.id})">Edit</button> <button class="btn small red" onclick="deleteExam(${e.id})">Delete</button></td></tr>`).join("")}</tbody></table></div></div></div><div class="grid" style="grid-template-columns:1fr 1fr"><div class="section"><div class="section-title"><div><h3>School / Grade-Sheet Identity</h3><p>Used on print previews.</p></div></div><form id="schoolForm" class="form-grid"><div class="field full"><label>School Name</label><input name="school_name" value="${esc(state.settings.school_name||"")}"></div><div class="field full"><label>Address</label><input name="school_address" value="${esc(state.settings.school_address||"")}"></div><div class="field"><label>Established</label><input name="established" value="${esc(state.settings.established||"")}"></div><div class="field"><label>Principal</label><input name="principal_name" value="${esc(state.settings.principal_name||"")}"></div><div class="field full"><label>Prepared By</label><input name="prepared_by" value="${esc(state.settings.prepared_by||"")}"></div><div class="form-actions full"><button class="btn primary">Save School Settings</button></div></form></div><div class="section"><div class="section-title"><div><h3>Grading Scale</h3><p>Edit grade ranges and grade points.</p></div></div><div class="table-wrap"><table><thead><tr><th>% Range</th><th>Grade</th><th>GP</th><th>NG</th><th></th></tr></thead><tbody>${state.grades.map(g=>`<tr><td>${num(g.min_percent)}–${num(g.max_percent)}</td><td><strong>${esc(g.grade)}</strong></td><td>${num(g.grade_point).toFixed(2)}</td><td>${g.is_ng?"Yes":"No"}</td><td><button class="btn small" onclick="gradeDialog(${g.id})">Edit</button></td></tr>`).join("")}</tbody></table></div></div></div>`;$("#schoolForm").onsubmit=saveSchoolSettings;}
async function yearDialog(){openModal("Create Academic Year",`<form id="yearForm" class="form-grid"><div class="field"><label>New Academic Year</label><input name="name" placeholder="2084" required></div><div class="field"><label>Copy Setup From</label><select name="source"><option value="">Blank Year</option>${state.years.map(y=>`<option value="${y.id}">${esc(y.name)}</option>`).join("")}</select></div><div class="field full"><label><input name="active" type="checkbox" checked> Make this the active academic year</label></div><div class="info full">Copying setup copies subjects/components, class settings and examinations only. Students, marks and results are not copied.</div><div class="form-actions full"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">Create Year</button></div></form>`);$("#yearForm").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const {data,error}=await sb.rpc("create_academic_year_from",{p_name:String(fd.get("name")||"").trim(),p_source_year_id:fd.get("source")?num(fd.get("source")):null,p_make_active:fd.get("active")==="on"});if(error)return toast(errMsg(error));closeModal();await loadFoundation();if(data)state.yearId=data;renderYearSelect();toast("Academic year created.");await navigate("settings");};}
async function activateYear(id){const {error}=await sb.rpc("set_active_academic_year",{p_year_id:id});if(error)return toast(errMsg(error));state.yearId=id;await loadFoundation();renderYearSelect();toast("Active year changed.");await navigate("settings");}
async function examDialog(id=null){let r={name:"",exam_type:"TERM",exam_date:"",publish_date_bs:"",status:"DRAFT",sort_order:1};if(id){const {data,error}=await sb.from("exams").select("*").eq("id",id).single();if(error)return toast(errMsg(error));r=data;}openModal(id?"Edit Examination":"Add Examination",`<form id="examForm" class="form-grid"><div class="field full"><label>Examination Name</label><input name="name" value="${esc(r.name)}" required></div><div class="field"><label>Exam Type</label><input name="exam_type" value="${esc(r.exam_type)}"></div><div class="field"><label>Sort Order</label><input name="sort_order" type="number" value="${num(r.sort_order)||1}"></div><div class="field"><label>Exam Date</label><input name="exam_date" value="${esc(r.exam_date||"")}"></div><div class="field"><label>Status</label><select name="status">${["DRAFT","CALCULATED","FINALIZED","PUBLISHED"].map(s=>`<option ${s===r.status?"selected":""}>${s}</option>`).join("")}</select></div><div class="form-actions full"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">Save Examination</button></div></form>`);$("#examForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));const p={academic_year_id:state.yearId,name:f.name.trim(),exam_type:f.exam_type.trim()||"TERM",sort_order:num(f.sort_order),exam_date:f.exam_date||null,status:f.status};const res=id?await sb.from("exams").update(p).eq("id",id):await sb.from("exams").insert(p);if(res.error)return toast(errMsg(res.error));closeModal();toast("Examination saved.");await navigate("settings");};}
async function deleteExam(id){if(!confirm("Delete this examination and all marks/results under it?"))return;const {error}=await sb.from("exams").delete().eq("id",id);if(error)return toast(errMsg(error));toast("Examination deleted.");await navigate("settings");}
async function saveSchoolSettings(e){e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));const rows=Object.entries(f).map(([key,value])=>({key,value:String(value||"")}));const {error}=await sb.from("settings").upsert(rows,{onConflict:"key"});if(error)return toast(errMsg(error));await loadFoundation();toast("School settings saved.");}
async function gradeDialog(id){const g=state.grades.find(x=>x.id===id);if(!g)return;openModal("Edit Grade",`<form id="gradeForm" class="form-grid three"><div class="field"><label>Minimum %</label><input name="min_percent" type="number" step="0.0001" value="${num(g.min_percent)}"></div><div class="field"><label>Maximum %</label><input name="max_percent" type="number" step="0.0001" value="${num(g.max_percent)}"></div><div class="field"><label>Grade</label><input name="grade" value="${esc(g.grade)}"></div><div class="field"><label>Grade Point</label><input name="grade_point" type="number" step="0.01" value="${num(g.grade_point)}"></div><div class="field full"><label>Description</label><input name="description" value="${esc(g.description||"")}"></div><div class="field full"><label><input name="is_ng" type="checkbox" ${g.is_ng?"checked":""}> Not Graded (NG)</label></div><div class="form-actions full"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">Save Grade</button></div></form>`);$("#gradeForm").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const p={min_percent:num(fd.get("min_percent")),max_percent:num(fd.get("max_percent")),grade:String(fd.get("grade")||"").trim().toUpperCase(),grade_point:num(fd.get("grade_point")),description:String(fd.get("description")||"").trim(),is_ng:fd.get("is_ng")==="on"};const {error}=await sb.from("grading_scale").update(p).eq("id",id);if(error)return toast(errMsg(error));closeModal();await loadFoundation();toast("Grading scale updated.");await navigate("settings");};}

async function enterApp(user){state.user=user;await loadProfile();await loadFoundation();$("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden");$("#userBadge").textContent=String(state.profile.role||"USER").toUpperCase();$("#userText").textContent=state.profile.display_name||state.profile.username||user.email;renderNav();await navigate("dashboard");}
async function init(){
  $("#closeModal").onclick=closeModal;$("#modalBackdrop").onclick=e=>{if(e.target.id==="modalBackdrop")closeModal()};$("#togglePassword").onclick=()=>{const i=$("#loginPassword");i.type=i.type==="password"?"text":"password";$("#togglePassword").textContent=i.type==="password"?"Show":"Hide"};$("#mobileNavBtn").onclick=()=>$("#sidebar").classList.toggle("open");$("#yearSelect").onchange=async()=>{state.yearId=num($("#yearSelect").value);$("#activeYearText").textContent=`Academic Year ${currentYear()?.name||""}`;await navigate(state.page)};$("#logoutBtn").onclick=async()=>{await sb.auth.signOut();location.reload()};
  $("#loginForm").onsubmit=async e=>{e.preventDefault();const email=$("#loginEmail").value.trim(),password=$("#loginPassword").value;const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)return toast(errMsg(error));try{await enterApp(data.user);}catch(err){await sb.auth.signOut();toast(errMsg(err));}};
  const {data:{session}}=await sb.auth.getSession();if(session?.user){try{await enterApp(session.user);}catch(e){console.error(e);await sb.auth.signOut();toast(errMsg(e));}}
}
window.studentDialog=studentDialog;window.deleteStudent=deleteStudent;window.subjectDialog=subjectDialog;window.deleteSubject=deleteSubject;window.componentDialog=componentDialog;window.deleteComponent=deleteComponent;window.closeModal=closeModal;window.setResultStatus=setResultStatus;window.printSingleResult=printSingleResult;window.printBulkResults=printBulkResults;window.yearDialog=yearDialog;window.activateYear=activateYear;window.examDialog=examDialog;window.deleteExam=deleteExam;window.gradeDialog=gradeDialog;window.state=state;
init();

/* ============================================================
   ONLINE V2 — Excel import/export + Excel-style paste + robust Marks Entry
   Mirrors the important workflows from desktop v1.4.3.
   ============================================================ */

function _normHeader(v){return String(v??"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"");}
function _cleanCell(v){return v==null?"":String(v).trim();}
function _xlsxReady(){if(!window.XLSX){toast("Excel library could not load. Check internet connection and reopen the page.");return false;}return true;}
function _saveWorkbook(wb,filename){if(!_xlsxReady())return;XLSX.writeFile(wb,filename,{compression:true});}
function _newWorkbookFromAOA(sheetName,rows,widths=[]){const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet(rows);if(widths.length)ws['!cols']=widths.map(w=>({wch:w}));ws['!freeze']={xSplit:0,ySplit:3};XLSX.utils.book_append_sheet(wb,ws,sheetName);return wb;}
function _pickExcelFile(handler){if(!_xlsxReady())return;const input=document.createElement("input");input.type="file";input.accept=".xlsx,.xlsm,.xls";input.style.display="none";document.body.appendChild(input);input.onchange=async()=>{const f=input.files?.[0];try{if(f)await handler(f);}catch(e){console.error(e);toast(errMsg(e));}finally{input.remove();}};input.click();}
async function _readExcelFile(file){const ab=await file.arrayBuffer();const wb=XLSX.read(ab,{type:"array",cellDates:false});const first=wb.SheetNames[0];if(!first)throw new Error("Excel workbook has no sheet.");const rows=XLSX.utils.sheet_to_json(wb.Sheets[first],{header:1,defval:"",raw:true});return {wb,sheetName:first,rows};}
function _findHeaderRow(rows,requiredNorms){for(let i=0;i<Math.min(rows.length,20);i++){const norms=(rows[i]||[]).map(_normHeader);if(requiredNorms.every(r=>norms.includes(r)))return i;}return -1;}
function _rowObject(headers,row){const o={};headers.forEach((h,i)=>o[String(h??"").trim()]=row?.[i]??"");return o;}
function _headerLookup(headers){const m=new Map();headers.forEach((h,i)=>m.set(_normHeader(h),i));return m;}
function _safeFilename(s){return String(s||"").replace(/[^a-z0-9_-]+/gi,"_").replace(/^_+|_+$/g,"")||"Export";}
async function _logImport(type,file,examId,cls,imported,updated,errors){try{await sb.from("import_logs").insert({import_type:type,filename:file?.name||null,academic_year_id:state.yearId,exam_id:examId||null,class_name:cls||null,imported_count:imported||0,updated_count:updated||0,error_count:errors||0});}catch(_){}}

function exportStudentTemplate(){const rows=[
  ["ST. AUGUSTINE - STUDENT IMPORT TEMPLATE"],[],
  ["Roll No","Student Name","Class","Symbol No","IEMIS ID","DOB","Gender"],
  [1,"Sample Student","Class 5","S-001","R-001","2074-01-15","Boy"]
];_saveWorkbook(_newWorkbookFromAOA("Students",rows,[12,28,14,15,20,15,12]),"Student_Import_Template.xlsx");}

async function exportCurrentStudents(){let cls=$("#studentClass")?.value||"";let req=sb.from("students").select("*").eq("academic_year_id",state.yearId).order("class_name").order("roll_no").order("name");if(cls)req=req.eq("class_name",cls);const {data,error}=await req;if(error)return toast(errMsg(error));const rows=[[`STUDENTS - ${cls||currentYear()?.name||"ALL"}`],[],["Roll No","Student Name","Class","Symbol No","IEMIS ID","DOB","Gender"]];for(const st of _studentRowsSorted(data))rows.push([st.roll_no||"",st.name||"",st.class_name||"",st.symbol_no||"",st.registration_no||"",st.dob||"",st.gender||""]);_saveWorkbook(_newWorkbookFromAOA("Students",rows,[12,28,14,15,20,15,12]),`Students_${_safeFilename(cls||currentYear()?.name||"All")}.xlsx`);}

async function importStudentsExcel(){_pickExcelFile(async file=>{const {rows}=await _readExcelFile(file);const hi=_findHeaderRow(rows,["studentname"]);if(hi<0)throw new Error("Student Name header was not found. Please use the exported Student Excel Template.");const headers=rows[hi].map(v=>String(v??"").trim()),hm=_headerLookup(headers);const idx=(...names)=>{for(const n of names){if(hm.has(_normHeader(n)))return hm.get(_normHeader(n));}return -1;};const iName=idx("Student Name","Name"),iClass=idx("Class"),iRoll=idx("Roll No","Roll"),iSymbol=idx("Symbol No","Symbol"),iReg=idx("IEMIS ID","Registration No","Reg No"),iDob=idx("DOB","Date of Birth"),iGender=idx("Gender");if(iName<0)throw new Error("Student Name column is required.");const selectedClass=$("#studentClass")?.value||"";const {data:existing,error:e0}=await sb.from("students").select("*").eq("academic_year_id",state.yearId);if(e0)throw e0;let imported=0,updated=0;const errs=[];const current=existing||[];for(let r=hi+1;r<rows.length;r++){const row=rows[r]||[];const name=_cleanCell(row[iName]);if(!name)continue;const cls=_cleanCell(iClass>=0?row[iClass]:"")||selectedClass;if(!cls){errs.push(`Row ${r+1}: Class is blank.`);continue;}const roll=_cleanCell(iRoll>=0?row[iRoll]:""),symbol=_cleanCell(iSymbol>=0?row[iSymbol]:""),reg=_cleanCell(iReg>=0?row[iReg]:"");let match=null;if(symbol)match=current.find(x=>_cleanCell(x.symbol_no).toLowerCase()===symbol.toLowerCase());if(!match&&reg)match=current.find(x=>_cleanCell(x.registration_no).toLowerCase()===reg.toLowerCase());if(!match&&roll)match=current.find(x=>x.class_name===cls&&_cleanCell(x.roll_no).toLowerCase()===roll.toLowerCase());if(!match)match=current.find(x=>x.class_name===cls&&_cleanCell(x.name).toLowerCase()===name.toLowerCase());const p={academic_year_id:state.yearId,class_name:cls,roll_no:roll||null,symbol_no:symbol||null,registration_no:reg||null,name,dob:_cleanCell(iDob>=0?row[iDob]:"")||null,gender:_cleanCell(iGender>=0?row[iGender]:"")||null,active:true};let res;if(match){res=await sb.from("students").update(p).eq("id",match.id).select().single();if(!res.error){Object.assign(match,res.data);updated++;}}else{res=await sb.from("students").insert(p).select().single();if(!res.error){current.push(res.data);imported++;}}if(res.error)errs.push(`Row ${r+1}: ${res.error.message}`);}await _logImport("STUDENTS",file,null,selectedClass,imported,updated,errs.length);toast(`Student Excel: ${imported} new, ${updated} updated${errs.length?`, ${errs.length} error(s)`:""}.`);if(errs.length)openModal("Student Import Report",`<div class="notice">Imported new: ${imported}<br>Updated: ${updated}<br>Errors: ${errs.length}</div><div class="table-wrap"><table><tbody>${errs.slice(0,50).map(x=>`<tr><td>${esc(x)}</td></tr>`).join("")}</tbody></table></div>`);await loadStudents();});}

async function _classesWithStudents(){const {data,error}=await sb.from("students").select("class_name").eq("academic_year_id",state.yearId).eq("active",true);if(error)throw error;const set=new Set((data||[]).map(x=>x.class_name).filter(Boolean));return CLASSES.filter(c=>set.has(c));}

async function renderStudents(){
  setPageActions(`<button class="btn" onclick="exportStudentTemplate()">Student Excel Template</button> <button class="btn" onclick="importStudentsExcel()">Import Excel</button> <button class="btn" onclick="exportCurrentStudents()">Export Current List</button> <button class="btn primary" id="addStudentBtn">+ Add Student</button>`);
  $("#content").innerHTML=`<div class="section"><div class="toolbar"><div class="field"><label>Class</label><select id="studentClass"><option value="">All Classes</option>${CLASSES.map(c=>`<option>${c}</option>`).join("")}</select></div><div class="field grow"><label>Search</label><input id="studentSearch" placeholder="Name / roll / symbol / IEMIS ID" /></div><button class="btn" id="studentRefresh">Refresh</button></div></div><div class="section"><div class="info">Excel workflow: export the Student Excel Template, fill it, then use <b>Import Excel</b>. Existing students are matched and updated by Symbol No., IEMIS ID, Roll No. or Name.</div><div id="studentTable"></div></div>`;
  $("#addStudentBtn").onclick=()=>studentDialog();$("#studentRefresh").onclick=loadStudents;$("#studentClass").onchange=loadStudents;$("#studentSearch").oninput=()=>{clearTimeout(renderStudents._t);renderStudents._t=setTimeout(loadStudents,250)};await loadStudents();
}

async function _allClassComponents(cls){const {data,error}=await sb.from("subjects").select("id,name,sort_order,components(*)").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("sort_order").order("id");if(error)throw error;const out=[];for(const s of data||[]){for(const c of (s.components||[]).sort((a,b)=>num(a.sort_order)-num(b.sort_order)))out.push({...c,subject_id:s.id,subject_name:s.name});}return out;}

async function exportMarksLedger(includeExisting=true){const examId=num($("#markExam")?.value),cls=$("#markClass")?.value||"";if(!examId||!cls)return toast("Select examination and class first.");const [{data:exam,error:ee},{data:students,error:se},comps]=await Promise.all([sb.from("exams").select("id,name").eq("id",examId).single(),sb.from("students").select("id,roll_no,name,symbol_no,registration_no").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("roll_no").order("name"),_allClassComponents(cls)]);if(ee)throw ee;if(se)throw se;if(!students?.length)return toast("No students in this class.");if(!comps.length)return toast("No subjects/components in this class.");let marks=[];if(includeExisting){const {data,error}=await sb.from("marks").select("student_id,component_id,obtained_mark,status").eq("exam_id",examId);if(error)throw error;marks=data||[];}const mm=new Map(marks.map(m=>[`${m.student_id}_${m.component_id}`,m]));const headers=["Roll No","Student Name","Symbol No","IEMIS ID",...comps.map(c=>`${c.subject_name} ${c.code}`)];const rows=[[`${cls} | ${exam.name} | MARKS LEDGER`],[],headers];for(const st of _studentRowsSorted(students)){const row=[st.roll_no||"",st.name||"",st.symbol_no||"",st.registration_no||""];for(const c of comps){const m=mm.get(`${st.id}_${c.id}`);row.push(m?(m.status==="ABS"?"ABS":m.obtained_mark??""):"");}rows.push(row);}const wb=_newWorkbookFromAOA("Marks Ledger",rows,headers.map(h=>Math.max(12,Math.min(26,String(h).length+3))));_saveWorkbook(wb,`${includeExisting?"Marks_Ledger":"Marks_Template"}_${_safeFilename(cls)}_${_safeFilename(exam.name)}.xlsx`);}

function _markHeaderCandidates(c){return [`${c.subject_name} ${c.code}`,`${c.subject_name}(${c.code})`,`${c.subject_name} ${c.label}`,`${c.subject_name}_${c.code}`].map(_normHeader);}
async function importMarksLedger(){const examId=num($("#markExam")?.value),cls=$("#markClass")?.value||"";if(!examId||!cls)return toast("Select examination and class first.");_pickExcelFile(async file=>{const {rows}=await _readExcelFile(file);const hi=_findHeaderRow(rows,["studentname"]);if(hi<0)throw new Error("Student Name header was not found. Please use Export Ledger / Blank Template first.");const headers=rows[hi].map(v=>String(v??"").trim()),hm=_headerLookup(headers),comps=await _allClassComponents(cls);if(!comps.length)throw new Error("No subject components configured for this class.");const colMap=[];headers.forEach((h,i)=>{const n=_normHeader(h);const c=comps.find(x=>_markHeaderCandidates(x).includes(n));if(c)colMap.push({col:i,component:c});});if(!colMap.length)throw new Error("No marks columns matched the current Subject/Component setup.");const findIdx=(...names)=>{for(const n of names){const k=_normHeader(n);if(hm.has(k))return hm.get(k);}return -1;};const iRoll=findIdx("Roll No","Roll"),iName=findIdx("Student Name","Name"),iSymbol=findIdx("Symbol No","Symbol"),iReg=findIdx("IEMIS ID","Registration No","Reg No");const {data:students,error:se}=await sb.from("students").select("*").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true);if(se)throw se;const list=students||[];const upserts=[],errs=[];let importedRows=0;for(let r=hi+1;r<rows.length;r++){const row=rows[r]||[];const roll=_cleanCell(iRoll>=0?row[iRoll]:""),name=_cleanCell(iName>=0?row[iName]:""),symbol=_cleanCell(iSymbol>=0?row[iSymbol]:""),reg=_cleanCell(iReg>=0?row[iReg]:"");if(!roll&&!name&&!symbol&&!reg)continue;let st=null;if(symbol)st=list.find(x=>_cleanCell(x.symbol_no).toLowerCase()===symbol.toLowerCase());if(!st&&reg)st=list.find(x=>_cleanCell(x.registration_no).toLowerCase()===reg.toLowerCase());if(!st&&roll)st=list.find(x=>_cleanCell(x.roll_no).toLowerCase()===roll.toLowerCase());if(!st&&name)st=list.find(x=>_cleanCell(x.name).toLowerCase()===name.toLowerCase());if(!st){errs.push(`Row ${r+1}: student not found (${name||roll||symbol||reg}).`);continue;}let has=false,rowBad=false;for(const {col,component:c} of colMap){const raw=_cleanCell(row[col]);if(!raw)continue;has=true;const u=raw.toUpperCase();if(["ABS","AB","A","ABSENT"].includes(u)){upserts.push({exam_id:examId,student_id:st.id,component_id:c.id,obtained_mark:null,status:"ABS"});continue;}const mark=Number(raw);if(!Number.isFinite(mark)||mark<0||mark>num(c.full_marks)){errs.push(`Row ${r+1} ${c.subject_name} ${c.code}: '${raw}' must be 0-${num(c.full_marks)} or ABS.`);rowBad=true;continue;}upserts.push({exam_id:examId,student_id:st.id,component_id:c.id,obtained_mark:mark,status:"MARK"});}if(has&&!rowBad)importedRows++;}
    if(upserts.length){for(let i=0;i<upserts.length;i+=500){const {error}=await sb.from("marks").upsert(upserts.slice(i,i+500),{onConflict:"exam_id,student_id,component_id"});if(error)throw error;}}
    await _logImport("MARKS",file,examId,cls,importedRows,0,errs.length);toast(`Marks Excel: ${upserts.length} cell(s) imported${errs.length?`, ${errs.length} error(s)`:""}.`);if(errs.length)openModal("Marks Import Report",`<div class="notice">Imported mark cells: ${upserts.length}<br>Rows accepted: ${importedRows}<br>Errors: ${errs.length}</div><div class="table-wrap"><table><tbody>${errs.slice(0,80).map(x=>`<tr><td>${esc(x)}</td></tr>`).join("")}</tbody></table></div>`);await loadMarksSheet();});}

function _markCellValidate(el){const raw=el.value.trim(),full=num(el.dataset.full);let ok=true;if(raw&&!["ABS","AB","A","ABSENT"].includes(raw.toUpperCase())){const v=Number(raw);ok=Number.isFinite(v)&&v>=0&&v<=full;}el.classList.toggle("invalid",!ok);el.classList.toggle("abs",["ABS","AB","A","ABSENT"].includes(raw.toUpperCase()));return ok;}
function _subjectSummaryForRow(rowIndex){const c=state.marksContext;if(!c)return null;let complete=true,anyNg=false,totalCredit=0,totalWgp=0;for(let ci=0;ci<c.components.length;ci++){const el=document.querySelector(`.mark-input[data-row="${rowIndex}"][data-col="${ci}"]`);if(!el)return null;const raw=el.value.trim().toUpperCase(),comp=c.components[ci];if(!raw){complete=false;continue;}let pct=0;if(["ABS","AB","A","ABSENT"].includes(raw))pct=0;else{const v=Number(raw);if(!Number.isFinite(v)||v<0||v>num(comp.full_marks))return {invalid:true};pct=num(comp.full_marks)?v/num(comp.full_marks)*100:0;}const ch=num(comp.credit_hour);totalCredit+=ch;const g=gradeForPercent(pct,comp.pass_percent);if(g.is_ng||g.grade_point==null){anyNg=true;continue;}totalWgp+=ch*num(g.grade_point);}if(!complete||totalCredit<=0)return {gp:null,credit:null,wgp:null,grade:"-"};if(anyNg)return {gp:null,credit:totalCredit,wgp:null,grade:"NG"};const gp=totalWgp/totalCredit;return {gp,credit:totalCredit,wgp:totalWgp,grade:finalGradeForSubjectGP(gp)};}
function _refreshSubjectSummary(rowIndex){const s=_subjectSummaryForRow(rowIndex);const row=document.querySelector(`tr[data-mark-row="${rowIndex}"]`);if(!row||!s)return;const vals=s.invalid?["!","!","!","!"]:[s.gp==null?"-":s.gp.toFixed(2),s.credit==null?"-":creditFmt(s.credit),s.wgp==null?"-":s.wgp.toFixed(2),s.grade];row.querySelectorAll(".mark-summary").forEach((x,i)=>x.textContent=vals[i]);}
function _handleMarksPaste(ev){ev.preventDefault();const start=ev.currentTarget;const text=ev.clipboardData?.getData("text/plain")||"";const parsed=text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter((line,i,a)=>!(i===a.length-1&&line==="")).map(line=>line.split("\t"));if(!parsed.length)return;const r0=num(start.dataset.row),c0=num(start.dataset.col);let filled=0,invalid=0;const touched=new Set();for(let ro=0;ro<parsed.length;ro++){for(let co=0;co<parsed[ro].length;co++){const el=document.querySelector(`.mark-input[data-row="${r0+ro}"][data-col="${c0+co}"]`);if(!el)continue;el.value=String(parsed[ro][co]??"").trim();if(!_markCellValidate(el))invalid++;filled++;touched.add(r0+ro);}}touched.forEach(_refreshSubjectSummary);toast(`Pasted ${filled} mark cell(s)${invalid?`; ${invalid} invalid highlighted in red`:""}.`);}

async function renderMarks(){
  const exams=await examOptions();const studentClasses=await _classesWithStudents();const defaultClass=studentClasses[0]||"Class 1";
  $("#content").innerHTML=`<div class="section"><div class="toolbar"><div class="field"><label>Exam</label><select id="markExam">${exams.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></div><div class="field"><label>Class</label><select id="markClass">${classOptions(defaultClass)}</select></div><div class="field"><label>Subject</label><select id="markSubject"></select></div><button class="btn primary" id="loadMarksBtn">Load Marks Sheet</button><button class="btn" onclick="exportMarksLedger(true)">Export Ledger</button><button class="btn" onclick="exportMarksLedger(false)">Blank Template</button><button class="btn" onclick="importMarksLedger()">Import Excel</button></div></div><div class="section"><div class="info"><b>Excel Copy/Paste:</b> copy one or more marks columns from Excel, click the first target marks cell here, then press <b>Ctrl+V</b>. You can also export/import a complete class marks ledger.</div><div id="marksArea"><div class="empty">Select Exam, Class and Subject, then Load Marks Sheet.</div></div></div>`;
  if(!exams.length){$("#marksArea").innerHTML=`<div class="empty">No examination is configured. Add an examination from Settings first.</div>`;return;}
  $("#markClass").onchange=async()=>{await loadMarkSubjects();};$("#markSubject").onchange=()=>{$("#marksArea").innerHTML=`<div class="empty">Click Load Marks Sheet.</div>`};$("#loadMarksBtn").onclick=loadMarksSheet;await loadMarkSubjects();
}
async function loadMarkSubjects(){const cls=$("#markClass")?.value||"";const {data,error}=await sb.from("subjects").select("id,name").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("sort_order").order("id");if(error){toast(errMsg(error));return;}const s=$("#markSubject");if(!s)return;s.innerHTML=(data||[]).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("");if(!(data||[]).length&&$("#marksArea"))$("#marksArea").innerHTML=`<div class="empty">No active subjects for ${esc(cls)}. Add subjects/components in Subject Setup first.</div>`;}
async function loadMarksSheet(){const examId=num($("#markExam")?.value),cls=$("#markClass")?.value||"",subjectId=num($("#markSubject")?.value);if(!examId)return toast("Select examination.");if(!subjectId)return toast("This class has no subject. Add Subject/Component first.");$("#marksArea").innerHTML=`<div class="empty">Loading marks sheet…</div>`;const [{data:students,error:e1},{data:components,error:e2},{data:subject,error:e4}]=await Promise.all([sb.from("students").select("id,roll_no,name,symbol_no").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("roll_no").order("name"),sb.from("components").select("*").eq("subject_id",subjectId).order("sort_order").order("id"),sb.from("subjects").select("id,name,credit_hour").eq("id",subjectId).single()]);if(e1)throw e1;if(e2)throw e2;if(e4)throw e4;const rows=_studentRowsSorted(students),comps=components||[];if(!rows.length){$("#marksArea").innerHTML=`<div class="empty">No active students in ${esc(cls)}. Add/import students first.</div>`;return;}if(!comps.length){$("#marksArea").innerHTML=`<div class="empty">${esc(subject.name)} has no components. Add Internal/Theory/Practical components first.</div>`;return;}const studentIds=rows.map(x=>x.id),compIds=comps.map(x=>x.id);let req=sb.from("marks").select("*").eq("exam_id",examId).in("student_id",studentIds).in("component_id",compIds);const {data:marks,error:e3}=await req;if(e3)throw e3;const mMap=new Map((marks||[]).map(m=>[`${m.student_id}_${m.component_id}`,m]));state.marksContext={examId,cls,subjectId,subject,components:comps,students:rows};const totalCh=comps.reduce((a,c)=>a+num(c.credit_hour),0);$("#marksArea").innerHTML=`<div class="section-title"><div><h3>${esc(subject.name)}</h3><p>Total Credit Hour: ${creditFmt(totalCh)} • ${rows.length} student(s)</p></div><button id="saveMarksBtn" class="btn green">SAVE ALL MARKS</button></div><div class="table-wrap marks-grid-wrap"><table class="marks-grid"><thead><tr><th>Roll</th><th>Student Name</th>${comps.map(c=>`<th class="center">${esc(c.code)} / ${num(c.full_marks)}<br><small>CH ${num(c.credit_hour)}</small></th>`).join("")}<th class="center">Final GP</th><th class="center">Total Credit</th><th class="center">Total WGP</th><th class="center">Final Grade</th></tr></thead><tbody>${rows.map((s,ri)=>`<tr data-mark-row="${ri}"><td>${esc(s.roll_no||"")}</td><td><strong>${esc(s.name)}</strong></td>${comps.map((c,ci)=>{const m=mMap.get(`${s.id}_${c.id}`),v=m?(m.status==="ABS"?"ABS":m.obtained_mark??""):"";return `<td class="center"><input class="mark-input ${v==="ABS"?"abs":""}" data-row="${ri}" data-col="${ci}" data-student="${s.id}" data-component="${c.id}" data-full="${num(c.full_marks)}" value="${esc(v)}" autocomplete="off"></td>`}).join("")}<td class="center mark-summary">-</td><td class="center mark-summary">-</td><td class="center mark-summary">-</td><td class="center mark-summary">-</td></tr>`).join("")}</tbody></table></div>`;$("#saveMarksBtn").onclick=saveMarks;$$('.mark-input').forEach(el=>{el.oninput=()=>{_markCellValidate(el);_refreshSubjectSummary(num(el.dataset.row));};el.onpaste=_handleMarksPaste;});rows.forEach((_,i)=>_refreshSubjectSummary(i));}
async function saveMarks(){const c=state.marksContext;if(!c)return;const upserts=[],deletes=[];let invalid=0;for(const el of $$(".mark-input")){if(!_markCellValidate(el)){invalid++;continue;}const raw=el.value.trim(),student_id=num(el.dataset.student),component_id=num(el.dataset.component),full=num(el.dataset.full);if(!raw){deletes.push([student_id,component_id]);continue;}if(["ABS","AB","A","ABSENT"].includes(raw.toUpperCase())){upserts.push({exam_id:c.examId,student_id,component_id,obtained_mark:null,status:"ABS"});continue;}const mark=Number(raw);if(!Number.isFinite(mark)||mark<0||mark>full){invalid++;continue;}upserts.push({exam_id:c.examId,student_id,component_id,obtained_mark:mark,status:"MARK"});}if(invalid)return toast(`${invalid} invalid mark cell(s). Correct the red cells before saving.`);const b=$("#saveMarksBtn");if(b)b.disabled=true;try{for(let i=0;i<upserts.length;i+=500){const {error}=await sb.from("marks").upsert(upserts.slice(i,i+500),{onConflict:"exam_id,student_id,component_id"});if(error)throw error;}for(const [sid,cid] of deletes){const {error}=await sb.from("marks").delete().eq("exam_id",c.examId).eq("student_id",sid).eq("component_id",cid);if(error)throw error;}toast(`Marks saved successfully (${upserts.length} filled cell(s)).`);}catch(e){console.error(e);toast(errMsg(e));}finally{if(b)b.disabled=false;}}

window.exportStudentTemplate=exportStudentTemplate;
window.exportCurrentStudents=exportCurrentStudents;
window.importStudentsExcel=importStudentsExcel;
window.exportMarksLedger=exportMarksLedger;
window.importMarksLedger=importMarksLedger;

/* ============================================================
   ONLINE V3 — Multi-subject Marks Entry
   Select one or many subjects; each selected subject opens its
   own marks-entry sheet. Excel-style paste remains subject-scoped.
   ============================================================ */

function _selectedMarkSubjectIds(){
  return $$(".mark-subject-check:checked").map(x=>num(x.value)).filter(Boolean);
}

function _selectedMarkSubjectNames(){
  return $$(".mark-subject-check:checked").map(x=>x.dataset.name||"").filter(Boolean);
}

function _syncSubjectSelectionSummary(){
  const names=_selectedMarkSubjectNames();
  const el=$("#selectedSubjectSummary");
  if(!el)return;
  el.innerHTML=names.length
    ? `<b>${names.length} subject(s) selected:</b> ${names.map(esc).join(", ")}`
    : `<span class="muted">No subject selected. Tick one or more subjects below.</span>`;
}

function selectAllMarkSubjects(){
  $$(".mark-subject-check").forEach(x=>x.checked=true);
  _syncSubjectSelectionSummary();
  loadSelectedMarksSheets();
}

function clearAllMarkSubjects(){
  $$(".mark-subject-check").forEach(x=>x.checked=false);
  _syncSubjectSelectionSummary();
  state.marksContexts={};
  const a=$("#marksArea");
  if(a)a.innerHTML=`<div class="empty">Select one or more subjects. Each selected subject will open its own marks-entry table here.</div>`;
}

async function renderMarks(){
  const exams=await examOptions();
  const studentClasses=await _classesWithStudents();
  const defaultClass=studentClasses[0]||"Class 1";
  state.marksContexts={};
  $("#content").innerHTML=`
    <div class="section">
      <div class="toolbar marks-top-toolbar">
        <div class="field"><label>Exam</label><select id="markExam">${exams.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Class</label><select id="markClass">${classOptions(defaultClass)}</select></div>
        <button class="btn" onclick="exportMarksLedger(true)">Export Ledger</button>
        <button class="btn" onclick="exportMarksLedger(false)">Blank Template</button>
        <button class="btn" onclick="importMarksLedger()">Import Excel</button>
      </div>
    </div>
    <div class="section mark-subject-picker-section">
      <div class="section-title">
        <div><h3>Select Subject(s)</h3><p>Tick any subject. Its marks-entry table opens automatically below. Tick more subjects to work on several subjects together.</p></div>
        <div class="subject-select-actions"><button class="btn small" onclick="selectAllMarkSubjects()">Select All</button> <button class="btn small" onclick="clearAllMarkSubjects()">Clear All</button></div>
      </div>
      <div id="selectedSubjectSummary" class="selected-subject-summary"></div>
      <div id="markSubjectChecks" class="mark-subject-checks"></div>
    </div>
    <div class="section">
      <div class="info"><b>Excel Copy/Paste:</b> copy one or more marks columns from Excel, click the first target cell inside the required subject, then press <b>Ctrl+V</b>. Paste stays inside that subject table. You can also export/import the complete class ledger.</div>
      <div id="marksArea"><div class="empty">Select one or more subjects. Each selected subject will open its own marks-entry table here.</div></div>
    </div>`;
  if(!exams.length){
    $("#marksArea").innerHTML=`<div class="empty">No examination is configured. Add an examination from Settings first.</div>`;
    return;
  }
  $("#markClass").onchange=async()=>{state.marksContexts={};await loadMarkSubjects();};
  $("#markExam").onchange=async()=>{if(_selectedMarkSubjectIds().length)await loadSelectedMarksSheets();};
  await loadMarkSubjects();
}

async function loadMarkSubjects(){
  const cls=$("#markClass")?.value||"";
  const {data,error}=await sb.from("subjects").select("id,name,sort_order").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("sort_order").order("id");
  if(error){toast(errMsg(error));return;}
  const box=$("#markSubjectChecks");
  if(!box)return;
  const subjects=data||[];
  if(!subjects.length){
    box.innerHTML=`<div class="empty">No active subjects for ${esc(cls)}. Add subjects/components in Subject Setup first.</div>`;
    $("#selectedSubjectSummary").innerHTML="";
    $("#marksArea").innerHTML=`<div class="empty">No subjects are available for this class.</div>`;
    return;
  }
  box.innerHTML=subjects.map(s=>`<label class="mark-subject-option"><input class="mark-subject-check" type="checkbox" value="${s.id}" data-name="${esc(s.name)}"><span>${esc(s.name)}</span></label>`).join("");
  $$(".mark-subject-check").forEach(cb=>cb.onchange=()=>{_syncSubjectSelectionSummary();clearTimeout(loadSelectedMarksSheets._t);loadSelectedMarksSheets._t=setTimeout(loadSelectedMarksSheets,100);});
  _syncSubjectSelectionSummary();
  state.marksContexts={};
  $("#marksArea").innerHTML=`<div class="empty">Select one or more subjects. Each selected subject will open its own marks-entry table here.</div>`;
}

function _subjectSummaryForRow(subjectId,rowIndex){
  const c=state.marksContexts?.[subjectId];
  if(!c)return null;
  let complete=true,anyNg=false,totalCredit=0,totalWgp=0;
  for(let ci=0;ci<c.components.length;ci++){
    const el=document.querySelector(`.mark-input[data-subject="${subjectId}"][data-row="${rowIndex}"][data-col="${ci}"]`);
    if(!el)return null;
    const raw=el.value.trim().toUpperCase(),comp=c.components[ci];
    if(!raw){complete=false;continue;}
    let pct=0;
    if(["ABS","AB","A","ABSENT"].includes(raw))pct=0;
    else{
      const v=Number(raw);
      if(!Number.isFinite(v)||v<0||v>num(comp.full_marks))return {invalid:true};
      pct=num(comp.full_marks)?v/num(comp.full_marks)*100:0;
    }
    const ch=num(comp.credit_hour);totalCredit+=ch;
    const g=gradeForPercent(pct,comp.pass_percent);
    if(g.is_ng||g.grade_point==null){anyNg=true;continue;}
    totalWgp+=ch*num(g.grade_point);
  }
  if(!complete||totalCredit<=0)return {gp:null,credit:null,wgp:null,grade:"-"};
  if(anyNg)return {gp:null,credit:totalCredit,wgp:null,grade:"NG"};
  const gp=totalWgp/totalCredit;
  return {gp,credit:totalCredit,wgp:totalWgp,grade:finalGradeForSubjectGP(gp)};
}

function _refreshSubjectSummary(subjectId,rowIndex){
  const s=_subjectSummaryForRow(subjectId,rowIndex);
  const row=document.querySelector(`tr[data-subject-row="${subjectId}-${rowIndex}"]`);
  if(!row||!s)return;
  const vals=s.invalid?["!","!","!","!"]:[s.gp==null?"-":s.gp.toFixed(2),s.credit==null?"-":creditFmt(s.credit),s.wgp==null?"-":s.wgp.toFixed(2),s.grade];
  row.querySelectorAll(".mark-summary").forEach((x,i)=>x.textContent=vals[i]);
}

function _handleMarksPaste(ev){
  ev.preventDefault();
  const start=ev.currentTarget;
  const subjectId=num(start.dataset.subject);
  const text=ev.clipboardData?.getData("text/plain")||"";
  const parsed=text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter((line,i,a)=>!(i===a.length-1&&line==="")).map(line=>line.split("\t"));
  if(!parsed.length)return;
  const r0=num(start.dataset.row),c0=num(start.dataset.col);
  let filled=0,invalid=0;const touched=new Set();
  for(let ro=0;ro<parsed.length;ro++){
    for(let co=0;co<parsed[ro].length;co++){
      const el=document.querySelector(`.mark-input[data-subject="${subjectId}"][data-row="${r0+ro}"][data-col="${c0+co}"]`);
      if(!el)continue;
      el.value=String(parsed[ro][co]??"").trim();
      if(!_markCellValidate(el))invalid++;
      filled++;touched.add(r0+ro);
    }
  }
  touched.forEach(r=>_refreshSubjectSummary(subjectId,r));
  toast(`Pasted ${filled} mark cell(s) in this subject${invalid?`; ${invalid} invalid highlighted in red`:""}.`);
}

function _renderOneSubjectMarksPanel(subject,rows,mMap){
  const subjectId=num(subject.id);
  const comps=(subject.components||[]).slice().sort((a,b)=>num(a.sort_order)-num(b.sort_order)||num(a.id)-num(b.id));
  const totalCh=comps.reduce((a,c)=>a+num(c.credit_hour),0);
  if(!comps.length){
    return `<div class="marks-subject-panel" id="marksSubjectPanel_${subjectId}"><div class="section-title"><div><h3>${esc(subject.name)}</h3><p>No components configured.</p></div></div><div class="empty">${esc(subject.name)} has no components. Add Internal/Theory/Practical components in Subject Setup first.</div></div>`;
  }
  return `<div class="marks-subject-panel" id="marksSubjectPanel_${subjectId}">
    <div class="section-title marks-subject-head">
      <div><h3>${esc(subject.name)}</h3><p>Total Credit Hour: ${creditFmt(totalCh)} • ${rows.length} student(s)</p></div>
      <button class="btn green" onclick="saveSubjectMarks(${subjectId})">SAVE ${esc(subject.name)} MARKS</button>
    </div>
    <div class="table-wrap marks-grid-wrap"><table class="marks-grid"><thead><tr><th>Roll</th><th>Student Name</th>${comps.map(c=>`<th class="center">${esc(c.code)} / ${num(c.full_marks)}<br><small>CH ${num(c.credit_hour)}</small></th>`).join("")}<th class="center">Final GP</th><th class="center">Total Credit</th><th class="center">Total WGP</th><th class="center">Final Grade</th></tr></thead><tbody>${rows.map((s,ri)=>`<tr data-subject-row="${subjectId}-${ri}"><td>${esc(s.roll_no||"")}</td><td><strong>${esc(s.name)}</strong></td>${comps.map((c,ci)=>{const m=mMap.get(`${s.id}_${c.id}`),v=m?(m.status==="ABS"?"ABS":m.obtained_mark??""):"";return `<td class="center"><input class="mark-input ${v==="ABS"?"abs":""}" data-subject="${subjectId}" data-row="${ri}" data-col="${ci}" data-student="${s.id}" data-component="${c.id}" data-full="${num(c.full_marks)}" value="${esc(v)}" autocomplete="off"></td>`}).join("")}<td class="center mark-summary">-</td><td class="center mark-summary">-</td><td class="center mark-summary">-</td><td class="center mark-summary">-</td></tr>`).join("")}</tbody></table></div>
  </div>`;
}

async function loadSelectedMarksSheets(){
  const examId=num($("#markExam")?.value),cls=$("#markClass")?.value||"";
  const subjectIds=_selectedMarkSubjectIds();
  _syncSubjectSelectionSummary();
  if(!examId)return toast("Select examination.");
  if(!subjectIds.length){clearAllMarkSubjects();return;}
  const area=$("#marksArea");
  area.innerHTML=`<div class="empty">Loading ${subjectIds.length} subject marks sheet(s)…</div>`;
  try{
    const [{data:students,error:e1},{data:subjects,error:e2}]=await Promise.all([
      sb.from("students").select("id,roll_no,name,symbol_no").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("roll_no").order("name"),
      sb.from("subjects").select("id,name,credit_hour,sort_order,components(*)").in("id",subjectIds)
    ]);
    if(e1)throw e1;if(e2)throw e2;
    const rows=_studentRowsSorted(students);
    if(!rows.length){area.innerHTML=`<div class="empty">No active students in ${esc(cls)}. Add/import students first.</div>`;return;}
    const order=new Map(subjectIds.map((id,i)=>[id,i]));
    const subs=(subjects||[]).sort((a,b)=>(order.get(num(a.id))??999)-(order.get(num(b.id))??999));
    const compIds=subs.flatMap(s=>(s.components||[]).map(c=>c.id));
    let marks=[];
    if(compIds.length){
      const {data,error:e3}=await sb.from("marks").select("student_id,component_id,obtained_mark,status").eq("exam_id",examId).in("student_id",rows.map(x=>x.id)).in("component_id",compIds);
      if(e3)throw e3;marks=data||[];
    }
    const mMap=new Map(marks.map(m=>[`${m.student_id}_${m.component_id}`,m]));
    state.marksContexts={};
    for(const s of subs){
      const comps=(s.components||[]).slice().sort((a,b)=>num(a.sort_order)-num(b.sort_order)||num(a.id)-num(b.id));
      state.marksContexts[num(s.id)]={examId,cls,subjectId:num(s.id),subject:s,components:comps,students:rows};
    }
    area.innerHTML=`<div class="marks-selected-actions"><div><strong>${subs.length} subject(s) open</strong><small>You can enter marks in any open subject and save one subject or all selected subjects.</small></div><button class="btn green big" onclick="saveAllSelectedMarks()">SAVE ALL SELECTED SUBJECTS</button></div>${subs.map(s=>_renderOneSubjectMarksPanel(s,rows,mMap)).join("")}`;
    $$(".mark-input").forEach(el=>{el.oninput=()=>{_markCellValidate(el);_refreshSubjectSummary(num(el.dataset.subject),num(el.dataset.row));};el.onpaste=_handleMarksPaste;});
    for(const s of subs){for(let i=0;i<rows.length;i++)_refreshSubjectSummary(num(s.id),i);}
  }catch(e){console.error(e);area.innerHTML=`<div class="danger">${esc(errMsg(e))}</div>`;}
}

/* Backward-compatible refresh target used after Excel import. */
async function loadMarksSheet(){return loadSelectedMarksSheets();}

async function _collectAndSaveSubjectMarks(subjectId,{silent=false}={}){
  const c=state.marksContexts?.[subjectId];
  if(!c)throw new Error("This subject marks sheet is not open.");
  const inputs=$$( `.mark-input[data-subject="${subjectId}"]` );
  const upserts=[],deletes=[];let invalid=0;
  for(const el of inputs){
    if(!_markCellValidate(el)){invalid++;continue;}
    const raw=el.value.trim(),student_id=num(el.dataset.student),component_id=num(el.dataset.component),full=num(el.dataset.full);
    if(!raw){deletes.push([student_id,component_id]);continue;}
    if(["ABS","AB","A","ABSENT"].includes(raw.toUpperCase())){upserts.push({exam_id:c.examId,student_id,component_id,obtained_mark:null,status:"ABS"});continue;}
    const mark=Number(raw);
    if(!Number.isFinite(mark)||mark<0||mark>full){invalid++;continue;}
    upserts.push({exam_id:c.examId,student_id,component_id,obtained_mark:mark,status:"MARK"});
  }
  if(invalid)throw new Error(`${invalid} invalid mark cell(s) in ${c.subject.name}. Correct the red cells before saving.`);
  for(let i=0;i<upserts.length;i+=500){const {error}=await sb.from("marks").upsert(upserts.slice(i,i+500),{onConflict:"exam_id,student_id,component_id"});if(error)throw error;}
  for(const [sid,cid] of deletes){const {error}=await sb.from("marks").delete().eq("exam_id",c.examId).eq("student_id",sid).eq("component_id",cid);if(error)throw error;}
  if(!silent)toast(`${c.subject.name}: marks saved (${upserts.length} filled cell(s)).`);
  return {subject:c.subject.name,filled:upserts.length};
}

async function saveSubjectMarks(subjectId){
  try{await _collectAndSaveSubjectMarks(num(subjectId));}
  catch(e){console.error(e);toast(errMsg(e));}
}

async function saveAllSelectedMarks(){
  const ids=Object.keys(state.marksContexts||{}).map(Number);
  if(!ids.length)return toast("No subject marks sheet is open.");
  const btn=document.querySelector(".marks-selected-actions .btn.green");if(btn)btn.disabled=true;
  try{
    let cells=0;
    for(const id of ids){const r=await _collectAndSaveSubjectMarks(id,{silent:true});cells+=r.filled;}
    toast(`All selected subjects saved successfully (${cells} filled mark cell(s)).`);
  }catch(e){console.error(e);toast(errMsg(e));}
  finally{if(btn)btn.disabled=false;}
}

/* Keep old saveMarks callers safe: save every currently open subject. */
async function saveMarks(){return saveAllSelectedMarks();}

window.selectAllMarkSubjects=selectAllMarkSubjects;
window.clearAllMarkSubjects=clearAllMarkSubjects;
window.loadSelectedMarksSheets=loadSelectedMarksSheets;
window.saveSubjectMarks=saveSubjectMarks;
window.saveAllSelectedMarks=saveAllSelectedMarks;

/* ============================================================
   ONLINE V4 — Desktop Matrix Marks Entry
   One fixed student list at left; every selected subject opens
   horizontally in the same table. Existing configured components
   are used exactly as configured (no hard-coded assessment names).
   ============================================================ */

function _v4SelectedSubjectIds(){
  return $$(".mark-subject-check:checked").map(x=>num(x.value)).filter(Boolean);
}

function _v4StudentRowSelected(rowIndex){
  const cb=document.querySelector(`.mark-student-select[data-row="${rowIndex}"]`);
  return !cb || cb.checked;
}

function _v4SetAllStudents(checked){
  $$(".mark-student-select").forEach(x=>x.checked=!!checked);
}

function _v4UpdateAllStudentsCheckbox(){
  const all=$("#markAllStudents");
  if(!all)return;
  const rows=$$(".mark-student-select");
  all.checked=rows.length>0 && rows.every(x=>x.checked);
  all.indeterminate=rows.some(x=>x.checked) && !all.checked;
}

function _v4SubjectAbsentToggle(subjectId,rowIndex,checked){
  const inputs=$$(`.mark-input[data-subject="${subjectId}"][data-row="${rowIndex}"]`);
  inputs.forEach(el=>{
    if(checked){el.value="ABS";el.disabled=true;}
    else{if(["ABS","AB","A","ABSENT"].includes(el.value.trim().toUpperCase()))el.value="";el.disabled=false;}
    _markCellValidate(el);
  });
}

function _v4SyncAbsentBox(subjectId,rowIndex){
  const inputs=$$(`.mark-input[data-subject="${subjectId}"][data-row="${rowIndex}"]`);
  const cb=document.querySelector(`.subject-absent[data-subject="${subjectId}"][data-row="${rowIndex}"]`);
  if(!cb||!inputs.length)return;
  const allAbs=inputs.every(el=>["ABS","AB","A","ABSENT"].includes(el.value.trim().toUpperCase()));
  cb.checked=allAbs;
  inputs.forEach(el=>{el.disabled=allAbs;});
}

function _v4HandleMarksPaste(ev){
  ev.preventDefault();
  const start=ev.currentTarget;
  const subjectId=num(start.dataset.subject);
  const text=ev.clipboardData?.getData("text/plain")||"";
  const parsed=text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n")
    .filter((line,i,a)=>!(i===a.length-1&&line===""))
    .map(line=>line.split("\t"));
  if(!parsed.length)return;
  const r0=num(start.dataset.row),c0=num(start.dataset.col);
  let filled=0,invalid=0;
  const touched=new Set();
  for(let ro=0;ro<parsed.length;ro++){
    for(let co=0;co<parsed[ro].length;co++){
      const row=r0+ro,col=c0+co;
      const el=document.querySelector(`.mark-input[data-subject="${subjectId}"][data-row="${row}"][data-col="${col}"]`);
      if(!el)continue;
      const abs=document.querySelector(`.subject-absent[data-subject="${subjectId}"][data-row="${row}"]`);
      if(abs?.checked){abs.checked=false;$$(`.mark-input[data-subject="${subjectId}"][data-row="${row}"]`).forEach(x=>x.disabled=false);}
      el.value=String(parsed[ro][co]??"").trim();
      if(!_markCellValidate(el))invalid++;
      filled++;touched.add(row);
    }
  }
  touched.forEach(r=>_v4SyncAbsentBox(subjectId,r));
  toast(`Pasted ${filled} mark cell(s) in ${state.marksContexts?.[subjectId]?.subject?.name||"subject"}${invalid?`; ${invalid} invalid highlighted in red`:""}.`);
}

async function renderMarks(){
  const exams=await examOptions();
  const studentClasses=await _classesWithStudents();
  const defaultClass=studentClasses[0]||"Class 1";
  state.marksContexts={};
  $("#content").innerHTML=`
    <div class="section marks-v4-controls">
      <div class="toolbar marks-top-toolbar">
        <div class="field"><label>Exam</label><select id="markExam">${exams.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Class</label><select id="markClass">${classOptions(defaultClass)}</select></div>
        <div class="marks-v4-excel-actions">
          <button class="btn" onclick="exportMarksLedger(true)">Export Marks</button>
          <button class="btn" onclick="exportMarksLedger(false)">Blank Excel Template</button>
          <button class="btn" onclick="importMarksLedger()">Import Excel</button>
        </div>
      </div>
      <div class="marks-v4-subject-row">
        <label class="marks-v4-all"><input id="markAllSubjects" type="checkbox"> <b>All</b></label>
        <div id="markSubjectChecks" class="marks-v4-subject-checks"></div>
      </div>
    </div>
    <div class="section marks-v4-entry-section">
      <div class="marks-v4-note"><b>Excel paste:</b> copy a marks column from Excel → click the first required mark cell → <b>Ctrl+V</b>. The values paste downward in that subject/component.</div>
      <div id="marksArea"><div class="empty">Select one or more subjects above. The same student name list will stay on the left and the selected subjects will open side-by-side.</div></div>
    </div>`;
  if(!exams.length){
    $("#marksArea").innerHTML=`<div class="empty">No examination is configured. Add an examination from Settings first.</div>`;
    return;
  }
  $("#markClass").onchange=async()=>{state.marksContexts={};await loadMarkSubjects();};
  $("#markExam").onchange=async()=>{if(_v4SelectedSubjectIds().length)await loadSelectedMarksSheets();};
  $("#markAllSubjects").onchange=e=>{
    $$(".mark-subject-check").forEach(x=>x.checked=e.currentTarget.checked);
    clearTimeout(loadSelectedMarksSheets._t);
    loadSelectedMarksSheets._t=setTimeout(loadSelectedMarksSheets,80);
  };
  await loadMarkSubjects();
}

async function loadMarkSubjects(){
  const cls=$("#markClass")?.value||"";
  const {data,error}=await sb.from("subjects").select("id,name,sort_order").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("sort_order").order("id");
  if(error){toast(errMsg(error));return;}
  const box=$("#markSubjectChecks");
  if(!box)return;
  const subjects=data||[];
  const all=$("#markAllSubjects");if(all){all.checked=false;all.indeterminate=false;}
  state.marksContexts={};
  if(!subjects.length){
    box.innerHTML=`<span class="muted">No active subjects for ${esc(cls)}.</span>`;
    $("#marksArea").innerHTML=`<div class="empty">No subjects are available for this class. Add them in Subject Setup.</div>`;
    return;
  }
  box.innerHTML=subjects.map(s=>`<label class="marks-v4-subject-option"><input class="mark-subject-check" type="checkbox" value="${s.id}" data-name="${esc(s.name)}"><span>${esc(s.name)}</span></label>`).join("");
  $$(".mark-subject-check").forEach(cb=>cb.onchange=()=>{
    const checks=$$(".mark-subject-check"),all=$("#markAllSubjects");
    if(all){all.checked=checks.length>0&&checks.every(x=>x.checked);all.indeterminate=checks.some(x=>x.checked)&&!all.checked;}
    clearTimeout(loadSelectedMarksSheets._t);
    loadSelectedMarksSheets._t=setTimeout(loadSelectedMarksSheets,80);
  });
  $("#marksArea").innerHTML=`<div class="empty">Select one or more subjects above. The student list will remain fixed on the left.</div>`;
}

function _v4SubjectHeaderCells(subject){
  const comps=(subject.components||[]).slice().sort((a,b)=>num(a.sort_order)-num(b.sort_order)||num(a.id)-num(b.id));
  if(!comps.length)return `<th class="subject-subhead no-component">No Components</th>`;
  return `<th class="subject-subhead absent-head">Is Absent</th>`+comps.map(c=>{
    const label=esc(c.label||c.code||"Component");
    return `<th class="subject-subhead fm-head">${label}<br><small>Full Marks</small></th><th class="subject-subhead obtained-head">${label}<br><small>Obtained Marks</small></th>`;
  }).join("");
}

function _v4SubjectBodyCells(subject,student,rowIndex,mMap){
  const subjectId=num(subject.id);
  const comps=(subject.components||[]).slice().sort((a,b)=>num(a.sort_order)-num(b.sort_order)||num(a.id)-num(b.id));
  if(!comps.length)return `<td class="no-component-cell muted">Not configured</td>`;
  const allAbs=comps.every(c=>{
    const m=mMap.get(`${student.id}_${c.id}`);
    return m?.status==="ABS";
  });
  return `<td class="subject-abs-cell"><input class="subject-absent" type="checkbox" data-subject="${subjectId}" data-row="${rowIndex}" ${allAbs?"checked":""}></td>`+
    comps.map((c,ci)=>{
      const m=mMap.get(`${student.id}_${c.id}`);
      const v=m?(m.status==="ABS"?"ABS":m.obtained_mark??""):"",conflict=v27SavedMarkOverFull(m,c.full_marks);
      const tip=conflict?` title="Saved mark ${esc(v)} is above Full Marks ${esc(num(c.full_marks))}"`:"";
      return `<td class="subject-full-cell ${conflict?"v27-full-conflict":""}">${num(c.full_marks)}</td><td class="subject-mark-cell ${conflict?"v27-full-conflict":""}"><input class="mark-input ${v==="ABS"?"abs":""} ${conflict?"invalid saved-over-full":""}" data-subject="${subjectId}" data-row="${rowIndex}" data-col="${ci}" data-student="${student.id}" data-component="${c.id}" data-full="${num(c.full_marks)}" value="${esc(v)}" autocomplete="off" ${allAbs?"disabled":""}${tip}></td>`;
    }).join("");
}

async function loadSelectedMarksSheets(){
  const examId=num($("#markExam")?.value),cls=$("#markClass")?.value||"";
  const subjectIds=_v4SelectedSubjectIds();
  if(!examId)return toast("Select examination.");
  const area=$("#marksArea");
  if(!subjectIds.length){state.marksContexts={};area.innerHTML=`<div class="empty">Select one or more subjects above. The student list will remain fixed on the left.</div>`;return;}
  area.innerHTML=`<div class="empty">Loading marks-entry table…</div>`;
  try{
    const [{data:students,error:e1},{data:subjects,error:e2}]=await Promise.all([
      sb.from("students").select("id,roll_no,name,symbol_no,registration_no").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("roll_no").order("name"),
      sb.from("subjects").select("id,name,credit_hour,sort_order,components(*)").in("id",subjectIds)
    ]);
    if(e1)throw e1;if(e2)throw e2;
    const rows=_studentRowsSorted(students);
    if(!rows.length){area.innerHTML=`<div class="empty">No active students in ${esc(cls)}. Add/import students first.</div>`;return;}
    const order=new Map(subjectIds.map((id,i)=>[id,i]));
    const subs=(subjects||[]).sort((a,b)=>(order.get(num(a.id))??999)-(order.get(num(b.id))??999));
    const compIds=subs.flatMap(s=>(s.components||[]).map(c=>c.id));
    let marks=[];
    if(compIds.length){
      const {data,error:e3}=await sb.from("marks").select("student_id,component_id,obtained_mark,status").eq("exam_id",examId).in("student_id",rows.map(x=>x.id)).in("component_id",compIds);
      if(e3)throw e3;marks=data||[];
    }
    const mMap=new Map(marks.map(m=>[`${m.student_id}_${m.component_id}`,m]));
    state.marksContexts={};
    subs.forEach(s=>{
      const comps=(s.components||[]).slice().sort((a,b)=>num(a.sort_order)-num(b.sort_order)||num(a.id)-num(b.id));
      state.marksContexts[num(s.id)]={examId,cls,subjectId:num(s.id),subject:s,components:comps,students:rows};
    });
    const groupHeaders=subs.map(s=>{
      const comps=(s.components||[]);
      const span=comps.length?1+(comps.length*2):1;
      return `<th class="subject-group-head" colspan="${span}">${esc(s.name)}</th>`;
    }).join("");
    const subHeaders=subs.map(_v4SubjectHeaderCells).join("");
    area.innerHTML=`
      <div class="marks-v4-statusbar"><div><b>${esc(cls)}</b> • ${rows.length} student(s) • ${subs.length} subject(s) selected</div><button class="btn green big" id="saveAllMatrixMarks">SAVE MARKS</button></div>
      <div class="marks-v4-matrix-wrap">
        <table class="marks-v4-matrix">
          <thead>
            <tr class="group-row">
              <th class="fixed-col select-col" rowspan="2"><input id="markAllStudents" type="checkbox" checked></th>
              <th class="fixed-col sn-col" rowspan="2">S.N</th>
              <th class="fixed-col name-col" rowspan="2">Student Name</th>
              <th class="fixed-col reg-col" rowspan="2">IEMIS ID</th>
              <th class="fixed-col symbol-col" rowspan="2">Symbol No.</th>
              ${groupHeaders}
            </tr>
            <tr class="sub-row">${subHeaders}</tr>
          </thead>
          <tbody>
            ${rows.map((st,ri)=>`<tr data-matrix-row="${ri}">
              <td class="fixed-col select-col"><input class="mark-student-select" data-row="${ri}" type="checkbox" checked></td>
              <td class="fixed-col sn-col">${ri+1}</td>
              <td class="fixed-col name-col"><strong>${esc(st.name||"")}</strong></td>
              <td class="fixed-col reg-col">${esc(st.registration_no||"")}</td>
              <td class="fixed-col symbol-col"><strong>${esc(st.symbol_no||"")}</strong></td>
              ${subs.map(s=>_v4SubjectBodyCells(s,st,ri,mMap)).join("")}
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="marks-v4-bottom-actions"><button class="btn green big" onclick="saveAllSelectedMarks()">SAVE MARKS</button></div>`;
    $("#markAllStudents").onchange=e=>_v4SetAllStudents(e.currentTarget.checked);
    $$(".mark-student-select").forEach(cb=>cb.onchange=_v4UpdateAllStudentsCheckbox);
    $$(".subject-absent").forEach(cb=>cb.onchange=()=>_v4SubjectAbsentToggle(num(cb.dataset.subject),num(cb.dataset.row),cb.checked));
    $$(".mark-input").forEach(el=>{
      el.oninput=()=>{
        const abs=document.querySelector(`.subject-absent[data-subject="${el.dataset.subject}"][data-row="${el.dataset.row}"]`);
        if(abs?.checked && !["ABS","AB","A","ABSENT"].includes(el.value.trim().toUpperCase())){abs.checked=false;$$(`.mark-input[data-subject="${el.dataset.subject}"][data-row="${el.dataset.row}"]`).forEach(x=>x.disabled=false);}
        _markCellValidate(el);
      };
      el.onpaste=_v4HandleMarksPaste;
    });
    $("#saveAllMatrixMarks").onclick=saveAllSelectedMarks;
  }catch(e){console.error(e);area.innerHTML=`<div class="danger">${esc(errMsg(e))}</div>`;}
}

async function _collectAndSaveSubjectMarks(subjectId,{silent=false}={}){
  const c=state.marksContexts?.[subjectId];
  if(!c)throw new Error("This subject marks sheet is not open.");
  const inputs=$$(`.mark-input[data-subject="${subjectId}"]`);
  const upserts=[],deletes=[];let invalid=0,skipped=0;
  for(const el of inputs){
    const rowIndex=num(el.dataset.row);
    if(!_v4StudentRowSelected(rowIndex)){skipped++;continue;}
    if(!_markCellValidate(el)){invalid++;continue;}
    const raw=el.value.trim(),student_id=num(el.dataset.student),component_id=num(el.dataset.component),full=num(el.dataset.full);
    if(!raw){deletes.push([student_id,component_id]);continue;}
    if(["ABS","AB","A","ABSENT"].includes(raw.toUpperCase())){upserts.push({exam_id:c.examId,student_id,component_id,obtained_mark:null,status:"ABS"});continue;}
    const mark=Number(raw);
    if(!Number.isFinite(mark)||mark<0||mark>full){invalid++;continue;}
    upserts.push({exam_id:c.examId,student_id,component_id,obtained_mark:mark,status:"MARK"});
  }
  if(invalid)throw new Error(`${invalid} invalid mark cell(s) in ${c.subject.name}. Correct the red cells before saving.`);
  for(let i=0;i<upserts.length;i+=500){const {error}=await sb.from("marks").upsert(upserts.slice(i,i+500),{onConflict:"exam_id,student_id,component_id"});if(error)throw error;}
  for(const [sid,cid] of deletes){const {error}=await sb.from("marks").delete().eq("exam_id",c.examId).eq("student_id",sid).eq("component_id",cid);if(error)throw error;}
  if(!silent)toast(`${c.subject.name}: marks saved.`);
  return {subject:c.subject.name,filled:upserts.length,skipped};
}

async function saveAllSelectedMarks(){
  const ids=Object.keys(state.marksContexts||{}).map(Number);
  if(!ids.length)return toast("No subject is open.");
  const selectedRows=$$(".mark-student-select:checked").length;
  if(!selectedRows)return toast("Select at least one student row.");
  const buttons=$$("#saveAllMatrixMarks,.marks-v4-bottom-actions .btn");buttons.forEach(b=>b.disabled=true);
  try{
    let cells=0;
    for(const id of ids){const r=await _collectAndSaveSubjectMarks(id,{silent:true});cells+=r.filled;}
    toast(`Marks saved successfully for ${selectedRows} selected student(s) (${cells} filled mark cell(s)).`);
  }catch(e){console.error(e);toast(errMsg(e));}
  finally{buttons.forEach(b=>b.disabled=false);}
}

async function loadMarksSheet(){return loadSelectedMarksSheets();}
async function saveMarks(){return saveAllSelectedMarks();}

window.loadSelectedMarksSheets=loadSelectedMarksSheets;
window.saveAllSelectedMarks=saveAllSelectedMarks;

/* ============================================================
   ONLINE V5 — ORIGINAL DESKTOP DESIGN PARITY
   Master visual/source: StAugustine_Marks_Result_Final_v1_4_3
   Only online data/auth and requested multi-subject marks entry differ.
   ============================================================ */

const V5_TITLES={
  dashboard:["Dashboard",()=>`Academic Year ${currentYear()?.name||""} • Live overview of students, marks and examinations`],
  students:["Student Master",()=>"Add one student anytime, edit existing records, or bulk import from Excel without re-importing everyone."],
  marks:["Manual Marks Entry",()=>"Excel-like marks entry by subject. Type marks or ABS; component Grade Point and WGP are calculated automatically."],
  importMarks:["Import Marks Ledger",()=>"Import a marks ledger exported from this software, or use the same class/exam setup to map marks from Excel."],
  subjects:["Subject & Credit Hour Setup",()=>"Set the class teacher once, then configure each subject with separate Internal/Theory/Practical credit hours."],
  results:["Result Processing",()=>"Calculate, preview, finalize, publish and export class results with a clear status trail."],
  settings:["Settings",()=>"School identity, academic year, examinations and grading scale."],
  backup:["Backup / Restore",()=>"Download a complete online data backup. The Marks database is separate from Accounts."]
};

function setV5Title(page){const p=V5_TITLES[page]||[page,()=>""];$("#pageTitle").textContent=p[0];$("#pageSubtitle").textContent=p[1]();}

function renderNav(){
  const items=[
    ["dashboard","Dashboard"],["students","Students"],["marks","Marks Entry"],["importMarks","Import Marks Ledger"],
    ["subjects","Subject & Credit Setup"],["results","Result Processing"],["settings","Settings"],["backup","Backup / Restore"]
  ];
  $("#nav").innerHTML=items.map(([p,l])=>`<button class="nav-btn ${state.page===p?"active":""}" data-page="${p}">${l}</button>`).join("");
  $$(".nav-btn").forEach(b=>b.onclick=()=>navigate(b.dataset.page));
}

async function navigate(page){
  state.page=page;renderNav();setV5Title(page);setPageActions("");
  $("#content").innerHTML=`<div class="section"><div class="empty">Loading…</div></div>`;
  const map={dashboard:renderDashboard,students:renderStudents,marks:renderMarks,importMarks:renderImportMarksLedger,subjects:renderSubjects,results:renderResults,settings:renderSettings,backup:renderBackup};
  try{await (map[page]||renderDashboard)();}catch(e){console.error(e);$("#content").innerHTML=`<div class="danger">${esc(errMsg(e))}</div>`;}
}

async function enterApp(user){
  state.user=user;await loadProfile();await loadFoundation();
  $("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden");
  $("#userText").textContent=state.profile.username||state.profile.display_name||user.email||"admin";
  renderYearSelect();renderNav();await navigate("dashboard");
}

async function v5ResolveLogin(login){
  const s=String(login||"").trim(); if(s.includes("@"))return s;
  try{const {data,error}=await sb.rpc("resolve_marks_login",{p_username:s});if(error)throw error;if(data)return data;}catch(e){
    if(String(e?.message||"").toLowerCase().includes("resolve_marks_login")) throw new Error("Username login needs the included ONLINE_LOGIN_ALIAS_PATCH.sql once. Until then, enter the administrator email.");
    throw e;
  }
  throw new Error("Invalid username or password.");
}

async function ensureMarksSsoSession(){
  const status=$("#ssoStatus"),errBox=$("#ssoError");
  const setStatus=(msg)=>{if(status)status.textContent=msg};
  const fail=(msg)=>{
    if(errBox){errBox.style.display="block";errBox.textContent=msg}
    throw new Error(msg);
  };

  setStatus("Checking Accounts login…");
  const {data:accountsData,error:accountsError}=await accountsSb.auth.getSession();
  if(accountsError)fail(errMsg(accountsError));

  const accountsSession=accountsData?.session;
  const email=String(accountsSession?.user?.email||"").trim().toLowerCase();
  if(!accountsSession?.user){
    setStatus("Accounts login required. Redirecting…");
    window.location.replace("../index.html");
    return null;
  }
  if(email!==ACCOUNTANT_EMAIL){
    setStatus("Marks Entry is available to the Accountant administrator only. Redirecting…");
    setTimeout(()=>window.location.replace("../index.html"),500);
    return null;
  }

  // Reuse an already valid Marks session when present.
  const {data:marksData,error:marksSessionError}=await sb.auth.getSession();
  if(marksSessionError)console.warn("Existing Marks session check:",marksSessionError);
  if(marksData?.session?.user){
    setStatus("Opening Marks Entry…");
    return marksData.session.user;
  }

  setStatus("Creating secure Marks session…");
  const response=await fetch(MARKS_SSO_FUNCTION_URL,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "apikey":SUPABASE_PUBLISHABLE_KEY,
      "Authorization":`Bearer ${accountsSession.access_token}`
    },
    body:"{}"
  });

  let payload={};
  try{payload=await response.json()}catch(_e){}
  if(!response.ok)fail(payload?.error||`Single-login bridge failed (${response.status}).`);
  if(!payload?.token_hash)fail("Single-login bridge did not return a Marks token.");

  const {data:verifyData,error:verifyError}=await sb.auth.verifyOtp({
    token_hash:payload.token_hash,
    type:"magiclink"
  });
  if(verifyError)fail(errMsg(verifyError));
  if(!verifyData?.user)fail("Marks session could not be created.");

  setStatus("Opening Marks Entry…");
  return verifyData.user;
}

async function init(){
  $("#closeModal").onclick=closeModal;
  $("#modalBackdrop").onclick=e=>{if(e.target.id==="modalBackdrop")closeModal()};
  $("#yearSelect").onchange=async()=>{state.yearId=num($("#yearSelect").value);await navigate(state.page)};
  $("#logoutBtn").onclick=async()=>{
    try{await sb.auth.signOut()}catch(_e){}
    window.location.replace("../index.html");
  };

  try{
    const user=await ensureMarksSsoSession();
    if(user)await enterApp(user);
  }catch(e){
    console.error("Marks single-login failed:",e);
    const box=$("#ssoError");
    if(box){box.style.display="block";box.textContent=errMsg(e)}
  }
}

async function v5DashboardCounts(){
  const {data,error}=await sb.from("students").select("class_name,gender").eq("academic_year_id",state.yearId).eq("active",true);if(error)throw error;
  const rows=data||[];return {total:rows.length,boys:rows.filter(x=>String(x.gender||"").toLowerCase()==="boy").length,girls:rows.filter(x=>String(x.gender||"").toLowerCase()==="girl").length,classes:new Set(rows.map(x=>x.class_name).filter(Boolean)).size};
}
async function v5ExamCompletion(examId){
  const [{data:students,error:e1},{data:subjects,error:e2},{data:marks,error:e3}]=await Promise.all([
    sb.from("students").select("id,class_name").eq("academic_year_id",state.yearId).eq("active",true),
    sb.from("subjects").select("class_name,components(id)").eq("academic_year_id",state.yearId).eq("active",true),
    sb.from("marks").select("student_id,component_id").eq("exam_id",examId)
  ]); if(e1)throw e1;if(e2)throw e2;if(e3)throw e3;
  const compsByClass=new Map();for(const s of subjects||[])compsByClass.set(s.class_name,(compsByClass.get(s.class_name)||0)+(s.components||[]).length);
  let expected=0;for(const st of _studentRowsSorted(students))expected+=compsByClass.get(st.class_name)||0;
  const done=(marks||[]).length;return {done,expected,percent:expected?Math.min(100,done/expected*100):0};
}
async function renderDashboard(){
  const [c,exams]=await Promise.all([v5DashboardCounts(),examOptions()]);
  const cards=[
    ["TOTAL STUDENTS",c.total,"var(--blue)","All active students"],["BOYS",c.boys,"var(--green)","Gender summary"],["GIRLS",c.girls,"var(--purple)","Gender summary"],["ACTIVE CLASSES",c.classes,"var(--orange)","Classes with students"]
  ];
  $("#content").innerHTML=`<div class="dashboard-cards">${cards.map(([t,v,col,sub])=>`<div class="dash-card"><div class="tone" style="background:${col}"></div><div class="inside"><small>${t}</small><strong style="color:${col}">${v}</strong><small>${sub}</small></div></div>`).join("")}</div><div class="exam-title">${esc(currentYear()?.name||"")} Examination Center</div><div id="examDashboard" class="exam-grid"></div><div class="quick-card"><h3>Quick Actions</h3><div class="quick-row"><button class="btn primary" onclick="studentDialog()">+ Add Student</button><button class="btn" onclick="navigate('students');setTimeout(importStudentsExcel,50)">Import Students Excel</button><button class="btn green" onclick="navigate('marks')">Manual Marks Entry</button><button class="btn" onclick="navigate('importMarks')">Import Marks Ledger</button><button class="btn dark" onclick="navigate('results')">Process Results</button></div></div>`;
  const host=$("#examDashboard");const colors=["var(--blue)","var(--purple)","var(--green)","var(--orange)"];
  const html=[];for(let i=0;i<exams.length;i++){const e=exams[i],comp=await v5ExamCompletion(e.id),col=colors[i%colors.length];html.push(`<div class="exam-card"><div class="topline" style="background:${col}"></div><div class="inside"><h3 style="color:${col}">${esc(e.exam_type||e.name)}</h3><p>${esc(e.name)}</p><small style="color:var(--muted)">Marks completion: ${comp.percent.toFixed(1)}%</small><div class="progress"><span style="width:${comp.percent}%;background:${col}"></span></div><div class="status-row"><span class="status-chip">${esc(e.status||"DRAFT")}</span><button class="btn" onclick="state.selectedExamId=${e.id};navigate('marks')">Open</button></div></div></div>`);}host.innerHTML=html.join("")||`<div class="section"><div class="empty">No examinations configured.</div></div>`;
}

async function renderStudents(){
  $("#content").innerHTML=`<div class="master-toolbar"><div class="toolbar"><div class="field"><label>Class</label><select id="studentClass"><option value="">All Classes</option>${CLASSES.map(c=>`<option>${c}</option>`).join("")}</select></div><button class="btn primary" onclick="studentDialog()">+ Add Student</button><button class="btn" onclick="importStudentsExcel()">Import Excel</button><button class="btn" onclick="exportStudentTemplate()">Student Excel Template</button><button class="btn" onclick="exportCurrentStudents()">Export Current List</button><div class="field grow"><label>Search</label><input id="studentSearch" placeholder="Name / roll / symbol / IEMIS ID"></div></div></div><div class="master-table-card"><div id="studentTable"></div></div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:9px;color:var(--muted);font-size:11px"><span>Tip: Edit/Delete buttons are available in each row. Existing students remain unchanged when you add only a new student.</span></div>`;
  $("#studentClass").onchange=loadStudents;$("#studentSearch").oninput=()=>{clearTimeout(renderStudents._t);renderStudents._t=setTimeout(loadStudents,220)};await loadStudents();
}

async function renderSubjects(){
  $("#content").innerHTML=`<div class="master-toolbar"><div class="toolbar"><div class="field"><label>Class</label><select id="subjectClass">${classOptions("Class 1")}</select></div><div class="field grow" style="max-width:280px"><label>Class Teacher</label><input id="classTeacherInput"></div><button class="btn" id="saveTeacherBtn">Save Teacher</button><button class="btn primary" id="addSubjectBtn">+ Subject</button><button class="btn" id="editSubjectBtn">Edit Subject</button><button class="btn red" id="deleteSubjectBtn">Delete Subject</button></div></div><div class="subject-split"><div class="subject-pane"><h3>Subjects</h3><div id="subjectList"></div></div><div class="subject-pane"><div style="display:flex;justify-content:space-between;align-items:center"><h3>Assessment Components</h3><button class="btn primary" id="addComponentBtn">+ Component</button></div><div id="componentList"></div><div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px"><button class="btn" id="editComponentBtn">Edit Component</button><button class="btn red" id="deleteComponentBtn">Delete Component</button></div></div></div>`;
  state.v5SubjectId=null;state.v5ComponentId=null;
  $("#subjectClass").onchange=v5LoadSubjectSetup;$("#saveTeacherBtn").onclick=v5SaveClassTeacher;$("#addSubjectBtn").onclick=()=>subjectDialog();$("#editSubjectBtn").onclick=()=>state.v5SubjectId?subjectDialog(state.v5SubjectId):toast("Select a subject first.");$("#deleteSubjectBtn").onclick=()=>state.v5SubjectId?deleteSubject(state.v5SubjectId):toast("Select a subject first.");$("#addComponentBtn").onclick=()=>state.v5SubjectId?componentDialog(state.v5SubjectId):toast("Select a subject first.");$("#editComponentBtn").onclick=()=>state.v5ComponentId&&state.v5SubjectId?componentDialog(state.v5SubjectId,state.v5ComponentId):toast("Select a component first.");$("#deleteComponentBtn").onclick=()=>state.v5ComponentId?deleteComponent(state.v5ComponentId):toast("Select a component first.");await v5LoadSubjectSetup();
}
async function v5LoadSubjectSetup(){
  const cls=$("#subjectClass").value;
  const [{data:cfg,error:ce},{data:subs,error:se}]=await Promise.all([sb.from("class_settings").select("*").eq("academic_year_id",state.yearId).eq("class_name",cls).maybeSingle(),sb.from("subjects").select("*,components(*)").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("sort_order").order("id")]);if(ce)throw ce;if(se)throw se;
  $("#classTeacherInput").value=cfg?.class_teacher||"";const list=subs||[];if(!list.find(x=>num(x.id)===num(state.v5SubjectId)))state.v5SubjectId=list[0]?.id||null;
  $("#subjectList").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Subject</th><th class="center">Total Credit Hour</th></tr></thead><tbody>${list.map(s=>`<tr class="${num(s.id)===num(state.v5SubjectId)?"subject-row-selected":""}" data-sid="${s.id}" style="cursor:pointer"><td>${esc(s.name)}</td><td class="center">${creditFmt(s.credit_hour)}</td></tr>`).join("")}</tbody></table></div>`;
  $$(`#subjectList tr[data-sid]`).forEach(r=>r.onclick=()=>{state.v5SubjectId=num(r.dataset.sid);state.v5ComponentId=null;v5LoadSubjectSetup();});
  const sub=list.find(x=>num(x.id)===num(state.v5SubjectId));const comps=(sub?.components||[]).sort((a,b)=>num(a.sort_order)-num(b.sort_order));if(!comps.find(x=>num(x.id)===num(state.v5ComponentId)))state.v5ComponentId=comps[0]?.id||null;
  $("#componentList").innerHTML=sub?`<div class="table-wrap"><table><thead><tr><th>Code</th><th>Label</th><th class="center">Full Marks</th><th class="center">Weight %</th><th class="center">Credit Hour</th><th class="center">Pass %</th></tr></thead><tbody>${comps.map(c=>`<tr class="${num(c.id)===num(state.v5ComponentId)?"subject-row-selected":""}" data-cid="${c.id}" style="cursor:pointer"><td>${esc(c.code)}</td><td>${esc(c.label)}</td><td class="center">${num(c.full_marks)}</td><td class="center">${c.weight_percent??""}</td><td class="center">${c.credit_hour??""}</td><td class="center">${c.pass_percent??""}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Select or add a subject.</div>`;
  $$(`#componentList tr[data-cid]`).forEach(r=>r.onclick=()=>{state.v5ComponentId=num(r.dataset.cid);v5LoadSubjectSetup();});
}
async function v5SaveClassTeacher(){const cls=$("#subjectClass").value,val=$("#classTeacherInput").value.trim();const {error}=await sb.from("class_settings").upsert({academic_year_id:state.yearId,class_name:cls,class_teacher:val},{onConflict:"academic_year_id,class_name"});if(error)return toast(errMsg(error));toast(`Class Teacher saved for ${cls}.`);}

async function subjectDialog(id=null){
  const cls=$("#subjectClass")?.value||"Class 1";let subject=null,components=[];if(id){const {data,error}=await sb.from("subjects").select("*,components(*)").eq("id",id).single();if(error)return toast(errMsg(error));subject=data;components=(data.components||[]);}const byCode=new Map(components.map(c=>[String(c.code||"").toUpperCase(),c]));const inc=byCode.get("IN")||byCode.get("INTERNAL")||{},th=byCode.get("TH")||byCode.get("THEORY")||{};
  openModal("Subject Setup",`<form id="v5SubjectForm" class="form-grid"><div class="field full"><label>Class Teacher</label><input name="teacher" value="${esc($("#classTeacherInput")?.value||"")}"></div><div class="field full"><label>Subject Name</label><input name="name" value="${esc(subject?.name||"")}" required></div><div class="full" style="background:#EAF1FF;color:var(--navy2);font-weight:600;padding:7px 8px">QUICK TWO-COMPONENT SETUP</div><div class="field"><label>Internal Full Marks</label><input name="in_fm" type="number" step="0.01" value="${inc.full_marks??50}"></div><div class="field"><label>Internal Weight %</label><input name="in_wt" type="number" step="0.01" value="${inc.weight_percent??50}"></div><div class="field"><label>Internal Credit Hour</label><input name="in_ch" type="number" step="0.01" value="${inc.credit_hour??2}"></div><div class="field"><label>Theory Full Marks</label><input name="th_fm" type="number" step="0.01" value="${th.full_marks??50}"></div><div class="field"><label>Theory Weight %</label><input name="th_wt" type="number" step="0.01" value="${th.weight_percent??50}"></div><div class="field"><label>Theory Credit Hour</label><input name="th_ch" type="number" step="0.01" value="${th.credit_hour??2}"></div><div class="info full">Pass rule: Internal/Evaluation = 40% minimum • Theory/Exam = 35% minimum. Extra Practical/Project components can be added after saving.</div><div class="form-actions full"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">SAVE SUBJECT</button></div></form>`);
  $("#v5SubjectForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));try{const p={academic_year_id:state.yearId,class_name:cls,name:f.name.trim().toUpperCase(),sort_order:subject?.sort_order||1,active:true};let sid=id;if(id){const {error}=await sb.from("subjects").update(p).eq("id",id);if(error)throw error;}else{const {data,error}=await sb.from("subjects").insert({...p,credit_hour:0}).select("id").single();if(error)throw error;sid=data.id;}await sb.from("class_settings").upsert({academic_year_id:state.yearId,class_name:cls,class_teacher:f.teacher.trim()},{onConflict:"academic_year_id,class_name"});const defs=[{code:"IN",label:"INTERNAL",full_marks:num(f.in_fm),weight_percent:num(f.in_wt),credit_hour:num(f.in_ch),pass_percent:40,sort_order:1},{code:"TH",label:"THEORY",full_marks:num(f.th_fm),weight_percent:num(f.th_wt),credit_hour:num(f.th_ch),pass_percent:35,sort_order:2}];for(const d of defs){const old=components.find(c=>String(c.code||"").toUpperCase()===d.code);const res=old?await sb.from("components").update(d).eq("id",old.id):await sb.from("components").insert({subject_id:sid,...d});if(res.error)throw res.error;}closeModal();toast("Subject saved successfully.");state.v5SubjectId=sid;await v5LoadSubjectSetup();}catch(err){toast(errMsg(err));}};
}

async function renderMarks(){
  const exams=await examOptions();const classes=await _classesWithStudents();const defaultClass=classes[0]||"Class 1";
  $("#content").innerHTML=`<div class="master-toolbar"><div class="toolbar"><div class="field" style="min-width:300px"><label>Examination</label><select id="markExam">${exams.map(e=>`<option value="${e.id}" ${num(e.id)===num(state.selectedExamId)?"selected":""}>${esc(e.name)}</option>`).join("")}</select></div><div class="field"><label>Class</label><select id="markClass">${classOptions(defaultClass)}</select></div><button class="btn primary" id="loadMarksBtn">Load Sheet</button><button class="btn" onclick="importMarksLedger()">Import Excel</button><button class="btn" onclick="exportMarksLedger(true)">Export Ledger</button><button class="btn" onclick="exportMarksLedger(false)">Blank Template</button></div><div id="markSubjectPicker" class="subject-picker"></div></div><div class="section" style="min-height:620px"><div class="marks-help">Excel Copy/Paste: copy one or more marks columns in Excel, click the first target mark cell here, then press Ctrl+V.</div><div id="marksArea"><div class="empty">Choose examination, class and one or more subjects, then click Load Sheet.</div></div></div>`;
  $("#markClass").onchange=loadMarkSubjects;$("#loadMarksBtn").onclick=loadSelectedMarksSheets;await loadMarkSubjects();
}
async function loadMarkSubjects(){const cls=$("#markClass")?.value||"";const {data,error}=await sb.from("subjects").select("id,name").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("sort_order").order("id");if(error)return toast(errMsg(error));const host=$("#markSubjectPicker");if(!host)return;host.innerHTML=`<label><input id="markAllSubjects" type="checkbox"> All</label>${(data||[]).map(s=>`<label><input class="mark-subject-choice" type="checkbox" value="${s.id}"> ${esc(s.name)}</label>`).join("")}`;$("#markAllSubjects").onchange=e=>{$$(".mark-subject-choice").forEach(x=>x.checked=e.currentTarget.checked)};if(!(data||[]).length)$("#marksArea").innerHTML=`<div class="empty">No active subjects for ${esc(cls)}. Add subjects/components in Subject & Credit Setup first.</div>`;}
function _v4SelectedSubjectIds(){return $$(".mark-subject-choice:checked").map(x=>num(x.value)).filter(Boolean);}

async function renderImportMarksLedger(){
  const exams=await examOptions();$("#content").innerHTML=`<div class="section"><div class="section-title"><div><h3>Marks Ledger Import / Export</h3><p>Use the exported sample/ledger so Excel columns match your current subjects and components.</p></div></div><div class="toolbar"><div class="field" style="min-width:310px"><label>Examination</label><select id="markExam">${exams.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></div><div class="field"><label>Class</label><select id="markClass">${classOptions("Class 1")}</select></div><button class="btn primary" onclick="importMarksLedger()">Import Marks Excel</button><button class="btn" onclick="exportMarksLedger(true)">Export Current Ledger</button><button class="btn" onclick="exportMarksLedger(false)">Blank Marks Template</button></div></div><div class="section"><div class="info">Workflow: export a ledger/template → fill marks in Excel → import the same file. Student rows can be matched by Roll No., Symbol No., IEMIS ID or Student Name. ABS is supported.</div><div class="empty">Select examination and class above, then choose Import or Export.</div></div>`;
}

async function renderResults(){
  const exams=await examOptions();$("#content").innerHTML=`<div class="master-toolbar"><div class="toolbar"><div class="field" style="min-width:300px"><label>Examination</label><select id="resExam">${exams.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></div><div class="field"><label>Class</label><select id="resClass">${classOptions("Class 1")}</select></div><div class="field"><label>Date of Issue (B.S.)</label><input id="issueDate" placeholder="2083-05-29"></div><button class="btn primary" id="loadResultsBtn">Calculate / Refresh</button><button class="btn dark" onclick="setResultStatus('FINALIZED')">Finalize</button><button class="btn green" onclick="setResultStatus('PUBLISHED')">Publish</button></div></div><div id="resultsStatusHost"></div><div class="master-table-card"><div id="resultsArea"><div class="empty">Select exam and class to preview results.</div></div></div>`;$("#loadResultsBtn").onclick=refreshResults;$("#resExam").onchange=refreshResults;$("#resClass").onchange=refreshResults;await refreshResults();
}
async function refreshResults(){
  const examId=num($("#resExam")?.value),cls=$("#resClass")?.value;if(!examId)return;
  $("#resultsArea").innerHTML=`<div class="empty">Calculating…</div>`;
  const [results,pubRes,examRes]=await Promise.all([
    calculateClassResults(examId,cls),
    sb.from("result_publications").select("*").eq("exam_id",examId).eq("class_name",cls).maybeSingle(),
    sb.from("exams").select("*").eq("id",examId).single()
  ]);
  if(pubRes.error)throw pubRes.error;if(examRes.error)throw examRes.error;
  const pub=pubRes.data||{status:"DRAFT",publish_date_bs:""},exam=examRes.data;
  const pass=results.filter(r=>r.status==="PASS").length,ng=results.filter(r=>r.status==="NG").length,inc=results.filter(r=>r.status==="INCOMPLETE").length,complete=results.length?Math.round((results.length-inc)/results.length*100):0;
  state.resultContext={examId,cls,results,pub,exam};if($("#issueDate"))$("#issueDate").value=pub.publish_date_bs||exam.publish_date_bs||"";
  const color={DRAFT:["#EEF2F7","var(--navy2)"],CALCULATED:["#EAF2FF","var(--blue2)"],FINALIZED:["#FFF4E8","var(--orange)"],PUBLISHED:["#E9F8F2","var(--green)"]}[pub.status]||["#EEF2F7","var(--navy2)"];
  $("#resultsStatusHost").innerHTML=`<div class="result-status-card"><span class="result-status-badge" style="background:${color[0]};color:${color[1]}">${esc(pub.status||"DRAFT")}</span><span class="result-status-text">Marks ${complete}% complete • Students ${results.length} • Pass ${pass} • NG ${ng} • Incomplete ${inc}</span><div class="result-status-actions"><button class="btn" onclick="v5ExportResultsExcel()">Export Result Excel</button><button class="btn" onclick="selectAllResultStudents(true)">Select All</button><button class="btn" onclick="selectAllResultStudents(false)">Clear</button><button class="btn green" onclick="downloadBulkResultsPdf()">Download Bulk PDF</button><button class="btn" onclick="printBulkResults()">Bulk Print</button></div></div>`;
  $("#resultsArea").innerHTML=`${inc?`<div class="notice">${inc} student result(s) are incomplete. Finalize/Publish after completing all required marks.</div>`:""}<div class="table-wrap"><table><thead><tr><th class="center" style="width:38px"><input id="resultSelectAll" type="checkbox" aria-label="Select all students"></th><th class="center">Roll</th><th>Student Name</th><th class="center">IEMIS ID</th><th class="center">Total Credit</th><th class="center">Total WGP</th><th class="center">GPA</th><th class="center">Result</th><th class="center">Preview</th></tr></thead><tbody>${results.map(r=>`<tr><td class="center"><input class="result-student-check" type="checkbox" value="${r.student.id}" aria-label="Select ${esc(r.student.name)}"></td><td class="center">${esc(r.student.roll_no||"")}</td><td>${esc(r.student.name)}</td><td class="center">${esc(r.student.registration_no||"")}</td><td class="center">${creditFmt(r.total_credit)}</td><td class="center">${r.total_wgp.toFixed(2)}</td><td class="center">${r.gpa_display}</td><td class="center">${esc(r.status)}</td><td class="center"><button class="btn small" onclick="printSingleResult(${r.student.id})">Preview Selected</button></td></tr>`).join("")}</tbody></table></div>`;
  const all=$("#resultSelectAll");if(all)all.onchange=e=>selectAllResultStudents(!!e.currentTarget.checked);
  $$(".result-student-check").forEach(x=>x.onchange=updateResultSelectionState);
  updateResultSelectionState();
}
async function v5ExportResultsExcel(){const c=state.resultContext;if(!c)return toast("Calculate results first.");const rows=[[`${currentYear()?.name||""} | ${c.exam.name} | ${c.cls} | RESULT`],[],["Roll No","Student Name","Symbol No","IEMIS ID","Total Credit","Total WGP","GPA","Result"]];for(const r of c.results)rows.push([r.student.roll_no||"",r.student.name||"",r.student.symbol_no||"",r.student.registration_no||"",r.total_credit,r.total_wgp,r.gpa_display,r.status]);_saveWorkbook(_newWorkbookFromAOA("Result",rows,[12,28,16,20,13,13,10,12]),`Result_${_safeFilename(c.cls)}_${_safeFilename(c.exam.name)}.xlsx`);}

function v5ClassDisplay(cls){const m={"Class 1":"ONE","Class 2":"TWO","Class 3":"THREE","Class 4":"FOUR","Class 5":"FIVE","Class 6":"SIX","Class 7":"SEVEN","Class 8":"EIGHT","Class 9":"NINE","Class 10":"TEN",Nursery:"NURSERY",LKG:"LKG",UKG:"UKG"};return m[cls]||String(cls||"").toUpperCase();}
function v5AdYear(bs){const n=parseInt(String(bs||"").trim(),10);return Number.isFinite(n)?String(n-57):"";}
function gradeSheetHtml(result,exam,cfg,issueDate){
  const st=result.student,year=String(cfg.bs_year_text||currentYear()?.name||""),ad=String(cfg.ad_year_text||v5AdYear(year)),assessment=String(cfg.assessment_label||exam.name||"").toUpperCase(),logo=state.settings.school_logo_path||"";let sn=0;
  const rows=result.subjects.map(s=>{sn++;const lines=s.components.map(c=>({name:`${String(s.name).toUpperCase()}(${String(c.code).toUpperCase()})`,credit:c.credit_hour,gp:c.grade_point,grade:c.grade}));return `<tr><td class="c">${sn}</td><td>${lines.map(x=>esc(x.name)).join("<br>")}</td><td class="c">${lines.map(x=>creditFmt(x.credit)).join("<br>")}</td><td class="c">${lines.map(x=>x.gp==null?"-":num(x.gp).toFixed(1)).join("<br>")}</td><td class="c">${lines.map(x=>esc(x.grade||"-")).join("<br>")}</td><td class="c"><b>${esc(s.final_grade||"-")}</b></td></tr>`}).join("");
  const roll=st.roll_no?`ROLL NO.: <b>${esc(st.roll_no)}</b> &nbsp;&nbsp; `:"";
  return `<div class="grade-sheet"><div class="gs-border"></div>${logo?`<div class="gs-logo"><img src="${esc(logo)}" alt="School Logo"></div>`:""}<div class="gs-school">${esc(state.settings.school_name||"St Augustine Academic Foundation")}</div><div class="gs-address">${esc(state.settings.school_address||"Suryodaya Municipality - 11, Tinghare")}</div><div class="gs-estd">Estd: ${esc(state.settings.established||"2053")}</div><div class="gs-exam">${esc(String(exam.name||"").toUpperCase())}</div><div class="gs-title">GRADE-SHEET</div><div class="gs-info">THE GRADE(S) SECURED BY: <b>${esc(String(st.name||"").toUpperCase())}</b> DATE OF BIRTH ${esc(st.dob||"      /      /      ")} &nbsp;&nbsp; ${roll}SYMBOL NO.: <b>${esc(st.symbol_no||"-")}</b> GRADE: <b>${esc(v5ClassDisplay(st.class_name))}</b> IN THE ${esc(assessment)} OF YEAR ${esc(year)} B.S. (${esc(ad)} A.D.) ARE GIVEN BELOW.</div><table class="gs-main"><thead><tr><th>S.N.</th><th>SUBJECTS</th><th>CREDIT<br>HOUR</th><th>GRADE<br>POINT</th><th>GRADE</th><th>FINAL GRADE</th></tr></thead><tbody>${rows}<tr class="gpa-row"><td></td><td></td><td colspan="4">GRADE POINT AVERAGE(GPA)${esc(result.gpa_display)}</td></tr></tbody></table><table class="gs-legend"><tbody><tr><td>A+</td><td>Outstanding</td><td>C+</td><td>Satisfactory</td></tr><tr><td>A</td><td>Excellent</td><td>C</td><td>Acceptable</td></tr><tr><td>B+</td><td>Very Good</td><td>D</td><td>Basic</td></tr><tr><td>B</td><td>Good</td><td>NG</td><td>Not Graded</td></tr></tbody></table><div class="gs-sign"><div class="line">PREPARED BY:${state.settings.prepared_by?` <b>${esc(String(state.settings.prepared_by).toUpperCase())}</b>`:""}</div><div class="line">CLASS TEACHER:${cfg.class_teacher?` <b>${esc(String(cfg.class_teacher).toUpperCase())}</b>`:""}</div><div class="line">DATE OF ISSUE:${issueDate?` <b>${esc(issueDate)}</b>`:""}</div><div class="gs-principal">PRINCIPAL</div></div><div class="gs-note-line"></div><div class="gs-notes">NOTE: ONE CREDIT HOUR EQUALS TO 32 WORKING HOURS.<br>INTERNAL(IN): THIS COVERS THE PARTICIPATION, PRACTICAL/PROJECT WORK AND TERMINAL.<br>THEORY(TH): THIS COVERS FINAL WRITTEN EXAMINATION (50%)<br>ABS: ABSENT <span class="gs-ng">NG: NOT GRADED</span></div></div>`;
}
function selectedResultStudentIds(){return $$(".result-student-check:checked").map(x=>num(x.value)).filter(Boolean);}
function selectAllResultStudents(checked=true){$$(".result-student-check").forEach(x=>x.checked=!!checked);const all=$("#resultSelectAll");if(all){all.checked=!!checked;all.indeterminate=false;}updateResultSelectionState();}
function updateResultSelectionState(){const boxes=$$(".result-student-check"),selected=boxes.filter(x=>x.checked).length,all=$("#resultSelectAll");if(all){all.checked=boxes.length>0&&selected===boxes.length;all.indeterminate=selected>0&&selected<boxes.length;}const status=$("#resultSelectionCount");if(status)status.textContent=`${selected} selected`;}
async function waitForPrintImages(root){const imgs=[...(root||document).querySelectorAll("img")];await Promise.all(imgs.map(img=>{if(img.complete&&img.naturalWidth>0){return img.decode?img.decode().catch(()=>{}):Promise.resolve();}return new Promise(resolve=>{const done=()=>resolve();img.addEventListener("load",done,{once:true});img.addEventListener("error",done,{once:true});setTimeout(done,1800);});}));}
async function printGradeSheetHtml(html){const host=$("#content"),old=host.innerHTML;host.innerHTML=html;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await waitForPrintImages(host);window.print();host.innerHTML=old;}
async function printSingleResult(studentId){const c=state.resultContext;if(!c)return;const r=c.results.find(x=>num(x.student.id)===num(studentId));if(!r)return toast("Student result not found.");const cfg=await gradeSheetSettings(c.cls);const issue=$("#issueDate")?.value||c.pub.publish_date_bs||"";if(!issue)return toast("Enter Date of Issue before preview/print.");await printGradeSheetHtml(gradeSheetHtml(r,c.exam,cfg,issue));await navigate("results");}
async function printBulkResults(){const c=state.resultContext;if(!c)return toast("Calculate results first.");const ids=selectedResultStudentIds();if(!ids.length)return toast("Select the student(s) to print, or click Select All.");const issue=$("#issueDate")?.value||c.pub.publish_date_bs||"";if(!issue)return toast("Enter Date of Issue before Bulk PDF/Print.");const cfg=await gradeSheetSettings(c.cls),chosen=c.results.filter(r=>ids.includes(num(r.student.id)));if(!chosen.length)return toast("No selected student results found.");await printGradeSheetHtml(`<div class="print-batch">${chosen.map(r=>gradeSheetHtml(r,c.exam,cfg,issue)).join("")}</div>`);await navigate("results");}
async function renderSettings(){
  const exams=await examOptions();$("#content").innerHTML=`<div class="settings-grid"><div class="settings-card"><h3>School Information</h3><form id="schoolForm"><div class="stack-field"><label>School Name</label><input name="school_name" value="${esc(state.settings.school_name||"")}"></div><div class="stack-field"><label>School Address</label><input name="school_address" value="${esc(state.settings.school_address||"")}"></div><div class="stack-field"><label>Established</label><input name="established" value="${esc(state.settings.established||"")}"></div><div class="stack-field"><label>Principal Name / Label</label><input name="principal_name" value="${esc(state.settings.principal_name||"")}"></div><div class="stack-field"><label>School Logo</label><div class="logo-row"><input id="logoName" readonly value="${state.settings.school_logo_path?"Logo saved":""}"><button type="button" class="btn" id="chooseLogoBtn">Choose / Change Logo</button></div></div><input type="hidden" name="school_logo_path" id="logoData" value="${esc(state.settings.school_logo_path||"")}"><button class="btn primary settings-wide-btn">SAVE SCHOOL SETTINGS</button></form><button class="btn settings-wide-btn" onclick="v5ClassSettingsDialog()">Class-wise Grade-Sheet Settings</button><button class="btn settings-wide-btn" onclick="v5AdminAccountDialog()">Accounts Single Login</button><button class="btn settings-wide-btn" onclick="v5GradingDialog()">Edit Grading Scale</button></div><div class="settings-card"><h3>Academic &amp; Examination Setup</h3><div class="stack-field"><label>Academic Year</label><div style="display:flex;gap:8px"><select id="settingsYear" style="max-width:150px">${state.years.map(y=>`<option value="${y.id}" ${num(y.id)===num(state.yearId)?"selected":""}>${esc(y.name)}</option>`).join("")}</select><button class="btn" id="activateSettingsYear">Activate</button></div></div><button class="btn primary" onclick="yearDialog()">+ Create New Academic Year</button><p style="color:var(--muted);font-size:11px;line-height:1.4">New academic years may copy subjects, components, class teacher/wording and examination structure. Students, marks and results are not copied.</p><h4 style="font-size:14px;margin:23px 0 8px">Examinations</h4><div class="exam-list">${exams.map(e=>`<div class="exam-item"><div><b>${esc(e.exam_type||e.name)}</b><small style="display:block;margin-top:3px">${esc(e.status)}${e.publish_date_bs?` • Issue: ${esc(e.publish_date_bs)}`:""}</small></div><div class="exam-actions"><button class="btn small" onclick="examDialog(${e.id})">Edit</button><button class="btn small red" onclick="deleteExam(${e.id})">Delete</button></div></div>`).join("")}</div><button class="btn primary settings-wide-btn" style="margin-top:28px" onclick="examDialog()">+ Add Examination</button></div></div>`;
  $("#schoolForm").onsubmit=saveSchoolSettings;$("#chooseLogoBtn").onclick=v5ChooseLogo;$("#activateSettingsYear").onclick=()=>activateYear(num($("#settingsYear").value));
}
async function v5ChooseLogo(){const input=document.createElement("input");input.type="file";input.accept="image/png,image/jpeg,image/webp,image/bmp";input.onchange=()=>{const f=input.files?.[0];if(!f)return;if(f.size>800000){toast("Please use a logo under 800 KB.");return;}const r=new FileReader();r.onload=async()=>{const value=String(r.result||"");if(!value.startsWith("data:image/"))return toast("Could not read the selected logo image.");const {error}=await sb.from("settings").upsert({key:"school_logo_path",value},{onConflict:"key"});if(error)return toast(errMsg(error));state.settings.school_logo_path=value;if($("#logoData"))$("#logoData").value=value;if($("#logoName"))$("#logoName").value=f.name;toast("School logo saved. It will appear on all grade-sheets.");};r.readAsDataURL(f)};input.click();}

async function v5ClassSettingsDialog(){openModal("Class-wise Grade-Sheet Settings",`<form id="classSettingsForm" class="form-grid"><div class="field full"><label>Class</label><select id="cfgClass">${classOptions("Class 1")}</select></div><div class="info full">Fixed identifiers: ROLL NO. • SYMBOL NO. (labels cannot be renamed)</div><div class="field full"><label>Class Teacher</label><input id="cfgTeacher"></div><div class="field full"><label>Assessment / Exam Wording</label><input id="cfgAssessment"></div><div class="field"><label>B.S. Year Text</label><input id="cfgBs"></div><div class="field"><label>A.D. Year Text</label><input id="cfgAd"></div><div class="form-actions full"><button type="button" class="btn" onclick="closeModal()">Close</button><button class="btn primary">SAVE CLASS SETTINGS</button></div></form>`);const load=async()=>{const cls=$("#cfgClass").value;const {data,error}=await sb.from("class_settings").select("*").eq("academic_year_id",state.yearId).eq("class_name",cls).maybeSingle();if(error)return toast(errMsg(error));$("#cfgTeacher").value=data?.class_teacher||"";$("#cfgAssessment").value=data?.assessment_label||"";$("#cfgBs").value=data?.bs_year_text||currentYear()?.name||"";$("#cfgAd").value=data?.ad_year_text||v5AdYear(currentYear()?.name||"");};$("#cfgClass").onchange=load;await load();$("#classSettingsForm").onsubmit=async e=>{e.preventDefault();const p={academic_year_id:state.yearId,class_name:$("#cfgClass").value,class_teacher:$("#cfgTeacher").value.trim(),assessment_label:$("#cfgAssessment").value.trim(),bs_year_text:$("#cfgBs").value.trim(),ad_year_text:$("#cfgAd").value.trim()};const {error}=await sb.from("class_settings").upsert(p,{onConflict:"academic_year_id,class_name"});if(error)return toast(errMsg(error));toast("Grade-Sheet settings saved.");};}

async function v5AdminAccountDialog(){
  openModal("Accounts Single Login",`<div class="info"><b>Marks Entry now uses the St. Augustine Accounts login.</b><br><br>No separate Marks Entry ID or password is required. Access is granted only after a valid Accountant Accounts session is verified. Marks/Result data remains in the separate Marks Supabase project.</div><div class="form-actions" style="margin-top:16px"><button type="button" class="btn primary" onclick="closeModal()">OK</button></div>`);
}
function v5GradingDialog(){openModal("Grading Scale",`<div class="section-title"><div><h3>Grading Scale</h3><p>Editable. Changes affect future calculations immediately.</p></div></div><div class="table-wrap"><table><thead><tr><th>Min %</th><th>Max %</th><th>Grade</th><th>Grade Point</th><th>Description</th><th>NG?</th><th></th></tr></thead><tbody>${state.grades.map(g=>`<tr><td>${num(g.min_percent)}</td><td>${num(g.max_percent)}</td><td>${esc(g.grade)}</td><td>${num(g.grade_point).toFixed(1)}</td><td>${esc(g.description||"")}</td><td>${g.is_ng?"Yes":"No"}</td><td><button class="btn small" onclick="gradeDialog(${g.id})">Edit</button></td></tr>`).join("")}</tbody></table></div>`);}

async function renderBackup(){
  $("#content").innerHTML=`<div class="section"><div class="section-title"><div><h3>Online Data Backup / Restore</h3><p>Create a complete Marks/Result JSON backup, or restore a previously downloaded backup.</p></div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn green" onclick="v5CreateBackup()">Create Backup Now</button><button class="btn primary" onclick="v11ChooseRestoreBackup()">Restore Backup</button><input id="v11RestoreFile" type="file" accept=".json,application/json" class="hidden"></div><div class="info" style="margin-top:14px"><strong>Restore safety:</strong> Restore replaces Marks/Result data in this Marks database only. It does not change the Accounts database or the Accounts single-login configuration. Before restoring, keep a fresh backup of the current data.</div></div>`;
  const f=$("#v11RestoreFile"); if(f)f.onchange=e=>v11RestoreBackupFile(e.currentTarget);
}
async function v5CreateBackup(){const tables=["settings","academic_years","exams","result_publications","students","subjects","class_settings","components","marks","grading_scale","import_profiles","import_logs"];const out={backup_version:2,created_at:new Date().toISOString(),project:"staugustine-marks-result",tables:{}};for(const t of tables){const {data,error}=await sb.from(t).select("*");if(error)return toast(`${t}: ${errMsg(error)}`);out.tables[t]=data||[];}const blob=new Blob([JSON.stringify(out,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`StAugustine_Marks_Backup_${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);toast("Backup downloaded successfully.");}
function v11ChooseRestoreBackup(){const f=$("#v11RestoreFile");if(f){f.value="";f.click();}}
async function v11RestoreBackupFile(input){
  const file=input?.files?.[0]; if(!file)return;
  let backup;
  try{backup=JSON.parse(await file.text());}catch(_e){input.value="";return toast("Invalid backup file: JSON could not be read.");}
  const required=["settings","academic_years","exams","result_publications","students","subjects","class_settings","components","marks","grading_scale","import_profiles","import_logs"];
  if(backup?.project!=="staugustine-marks-result"||!backup?.tables){input.value="";return toast("This is not a St. Augustine Marks backup file.");}
  const missing=required.filter(t=>!Array.isArray(backup.tables[t]));
  if(missing.length){input.value="";return toast(`Backup is incomplete: ${missing.join(", ")}`);}
  const c=backup.tables;
  const summary=`Backup date: ${backup.created_at||"Unknown"}\nAcademic years: ${c.academic_years.length}\nStudents: ${c.students.length}\nExams: ${c.exams.length}\nSubjects: ${c.subjects.length}\nMarks: ${c.marks.length}\n\nRESTORE WILL REPLACE THE CURRENT MARKS/RESULT DATA.\nType RESTORE to continue.`;
  const typed=prompt(summary,"");
  if(typed!=="RESTORE"){input.value="";return toast("Restore cancelled.");}
  if(!confirm("Final confirmation: restore this backup now? Current Marks/Result data will be replaced.")){input.value="";return toast("Restore cancelled.");}
  toast("Restoring backup… do not close this tab.");
  try{
    const {data,error}=await sb.rpc("restore_marks_backup_atomic",{p_backup:backup});
    if(error)throw error;
    state.yearId=null; await loadFoundation(); await navigate("dashboard");
    toast(`Restore complete. ${data?.students??c.students.length} students and ${data?.marks??c.marks.length} marks restored.`);
  }catch(e){
    console.error(e);
    const m=errMsg(e);
    if(m.toLowerCase().includes("restore_marks_backup_atomic"))toast("Restore support SQL is not installed. Run BACKUP_RESTORE_SUPPORT_SQL.sql once in the Marks Supabase project.");
    else toast(`Restore failed: ${m}`);
  }finally{input.value="";}
}



/* FINAL DESIGN STABILITY FIXES — keep original v1.4.3 look, repair v5 actions */
async function componentDialog(subjectId,id=null){
  let r={code:"",label:"",full_marks:100,weight_percent:"",credit_hour:1,pass_percent:0,sort_order:1};if(id){const {data,error}=await sb.from("components").select("*").eq("id",id).single();if(error)return toast(errMsg(error));r=data;}
  openModal(id?"Edit Component":"Add Component",`<form id="componentForm" class="form-grid three"><div class="field"><label>Code</label><input name="code" value="${esc(r.code)}" placeholder="IN / TH / PR" required></div><div class="field"><label>Label</label><input name="label" value="${esc(r.label)}" placeholder="INTERNAL / THEORY" required></div><div class="field"><label>Full Marks</label><input name="full_marks" type="number" step="0.01" min="0.01" value="${num(r.full_marks)}" required></div><div class="field"><label>Weight %</label><input name="weight_percent" type="number" step="0.01" value="${r.weight_percent??""}"></div><div class="field"><label>Credit Hour</label><input name="credit_hour" type="number" step="0.01" min="0" value="${r.credit_hour??""}"></div><div class="field"><label>Pass %</label><input name="pass_percent" type="number" step="0.01" min="0" max="100" value="${r.pass_percent??""}"></div><div class="field"><label>Sort Order</label><input name="sort_order" type="number" value="${num(r.sort_order)||1}"></div><div class="form-actions full"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">Save Component</button></div></form>`);
  $("#componentForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));const p={subject_id:subjectId,code:f.code.trim().toUpperCase(),label:f.label.trim().toUpperCase(),full_marks:num(f.full_marks),weight_percent:f.weight_percent===""?null:num(f.weight_percent),credit_hour:f.credit_hour===""?null:num(f.credit_hour),pass_percent:f.pass_percent===""?null:num(f.pass_percent),sort_order:num(f.sort_order)};const res=id?await sb.from("components").update(p).eq("id",id):await sb.from("components").insert(p);if(res.error)return toast(errMsg(res.error));closeModal();toast("Component saved.");state.v5SubjectId=subjectId;state.v5ComponentId=id||null;await v5LoadSubjectSetup();};
}
async function deleteSubject(id){if(!confirm("Delete this subject, all components and their marks?"))return;const {error}=await sb.from("subjects").delete().eq("id",id);if(error)return toast(errMsg(error));state.v5SubjectId=null;state.v5ComponentId=null;toast("Subject deleted.");await v5LoadSubjectSetup();}
async function deleteComponent(id){if(!confirm("Delete this component and its marks?"))return;const {error}=await sb.from("components").delete().eq("id",id);if(error)return toast(errMsg(error));state.v5ComponentId=null;toast("Component deleted.");await v5LoadSubjectSetup();}
/* re-export v5 functions referenced from inline handlers */
Object.assign(window,{navigate,renderDashboard,renderStudents,renderMarks,renderImportMarksLedger,renderSubjects,renderResults,renderSettings,renderBackup,v5LoadSubjectSetup,v5SaveClassTeacher,v5ExportResultsExcel,v5ClassSettingsDialog,v5AdminAccountDialog,v5GradingDialog,v5ChooseLogo,v5CreateBackup,v11ChooseRestoreBackup,v11RestoreBackupFile,subjectDialog,componentDialog,deleteSubject,deleteComponent,printSingleResult,printBulkResults,selectAllResultStudents,updateResultSelectionState});

/* ============================================================
   ONLINE V7 — FUNCTIONALITY FINALIZATION PHASE 1
   IMPORTANT: visual design remains the approved v6/original v1.4.3 design.
   This block only strengthens Excel workflows and marks-entry productivity.
   ============================================================ */

function _v7ReadWorkbook(file){
  return file.arrayBuffer().then(ab=>XLSX.read(ab,{type:"array",cellDates:false,cellText:false}));
}
function _v7SheetRows(wb,sheetName){
  const ws=wb.Sheets[sheetName];
  if(!ws)throw new Error("Selected Excel sheet was not found.");
  return XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:true});
}
function _v7Headers(rows,headerRow){
  const idx=Math.max(0,num(headerRow)-1);
  return (rows[idx]||[]).map(v=>String(v??"").trim());
}
function _v7PreviewTable(headers,rows,headerRow,maxRows=10){
  const start=Math.max(0,num(headerRow));
  const body=rows.slice(start,start+maxRows);
  if(!headers.length)return `<div class="empty">No columns found on the selected header row.</div>`;
  return `<div class="table-wrap" style="max-height:265px"><table><thead><tr>${headers.map((h,i)=>`<th>${esc(h||`Column ${i+1}`)}</th>`).join("")}</tr></thead><tbody>${body.map(r=>`<tr>${headers.map((_,i)=>`<td>${esc(r?.[i]??"")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function _v7SelectOptions(values,selected="",includeBlank=true){
  return `${includeBlank?'<option value="">— Not Mapped —</option>':""}${values.map(v=>`<option value="${esc(v)}" ${String(v)===String(selected)?"selected":""}>${esc(v)}</option>`).join("")}`;
}
function _v7GuessStudentMapping(headers){
  const aliases={
    name:["name","studentname","student","fullname","nameofstudent"],
    class_name:["class","classname","grade"],
    roll_no:["roll","rollno","rollnumber","sn","sno"],
    symbol_no:["symbol","symbolno","symbolnumber"],
    registration_no:["iemis","iemisid","registration","registrationno","regno","regdno"],
    dob:["dob","dateofbirth","birthdate"],
    gender:["gender","sex"]
  };
  const byNorm=new Map(headers.filter(Boolean).map(h=>[_normHeader(h),h]));
  const out={};
  for(const [field,names] of Object.entries(aliases)){
    for(const n of names){if(byNorm.has(n)){out[field]=byNorm.get(n);break;}}
  }
  return out;
}
function _v7MappedCell(row,headers,columnName){
  if(!columnName)return "";
  const i=headers.indexOf(columnName);
  return i>=0?_cleanCell(row?.[i]):"";
}

/* Student Excel import: same flexible mapping workflow as the approved desktop v1.4.3. */
async function importStudentsExcel(){
  _pickExcelFile(async file=>{
    const wb=await _v7ReadWorkbook(file),sheetNames=wb.SheetNames||[];
    if(!sheetNames.length)throw new Error("Excel workbook has no sheet.");
    openModal("Import Students from Excel",`<div class="form-grid three">
      <div class="field"><label>Sheet</label><select id="v7StuSheet">${sheetNames.map(x=>`<option>${esc(x)}</option>`).join("")}</select></div>
      <div class="field"><label>Header Row</label><select id="v7StuHeader">${Array.from({length:10},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join("")}</select></div>
      <div class="field"><label>Default Class</label><select id="v7StuClass">${classOptions($("#studentClass")?.value||"Class 1")}</select></div>
      <div class="full info">Map your Excel columns below. <b>Student Name is required.</b> Existing students are updated using Symbol No., then IEMIS ID, then Roll No., then Name.</div>
      <div id="v7StuMapping" class="full"></div>
      <div class="full"><h4 style="margin:4px 0 8px">Preview</h4><div id="v7StuPreview"></div></div>
      <div class="form-actions full"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="button" class="btn" id="v7StuRefresh">Refresh Preview</button><button type="button" class="btn green" id="v7StuRun">IMPORT STUDENTS</button></div>
    </div>`);
    const rebuild=()=>{
      const rows=_v7SheetRows(wb,$("#v7StuSheet").value),headerRow=num($("#v7StuHeader").value),headers=_v7Headers(rows,headerRow),guess=_v7GuessStudentMapping(headers);
      const fields=[["Student Name *","name"],["Class","class_name"],["Roll No","roll_no"],["Symbol No","symbol_no"],["IEMIS ID","registration_no"],["DOB","dob"],["Gender","gender"]];
      $("#v7StuMapping").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Software Field</th><th>Excel Column</th></tr></thead><tbody>${fields.map(([label,key])=>`<tr><td><strong>${label}</strong></td><td><select class="v7-stu-map" data-field="${key}">${_v7SelectOptions(headers,guess[key]||"")}</select></td></tr>`).join("")}</tbody></table></div>`;
      $("#v7StuPreview").innerHTML=_v7PreviewTable(headers,rows,headerRow,12);
    };
    $("#v7StuSheet").onchange=rebuild;$("#v7StuHeader").onchange=rebuild;$("#v7StuRefresh").onclick=rebuild;rebuild();
    $("#v7StuRun").onclick=async()=>{
      const btn=$("#v7StuRun");btn.disabled=true;
      try{
        const rows=_v7SheetRows(wb,$("#v7StuSheet").value),headerRow=num($("#v7StuHeader").value),headers=_v7Headers(rows,headerRow),defaultClass=$("#v7StuClass").value;
        const map={};$$('.v7-stu-map').forEach(x=>map[x.dataset.field]=x.value);
        if(!map.name)throw new Error("Student Name column is not mapped.");
        const {data:existing,error:e0}=await sb.from("students").select("*").eq("academic_year_id",state.yearId);if(e0)throw e0;
        const current=existing||[];let imported=0,updated=0;const errs=[];
        for(let r=headerRow;r<rows.length;r++){
          const row=rows[r]||[],name=_v7MappedCell(row,headers,map.name),cls=_v7MappedCell(row,headers,map.class_name)||defaultClass;
          if(!name){if(row.some(v=>_cleanCell(v)))errs.push(`Row ${r+1}: Student name is blank.`);continue;}
          if(!cls){errs.push(`Row ${r+1}: Class is blank and no default class is selected.`);continue;}
          const vals={roll_no:_v7MappedCell(row,headers,map.roll_no),symbol_no:_v7MappedCell(row,headers,map.symbol_no),registration_no:_v7MappedCell(row,headers,map.registration_no),dob:_v7MappedCell(row,headers,map.dob),gender:_v7MappedCell(row,headers,map.gender)};
          let match=null;
          if(vals.symbol_no)match=current.find(x=>_cleanCell(x.symbol_no).toLowerCase()===vals.symbol_no.toLowerCase());
          if(!match&&vals.registration_no)match=current.find(x=>_cleanCell(x.registration_no).toLowerCase()===vals.registration_no.toLowerCase());
          if(!match&&vals.roll_no)match=current.find(x=>x.class_name===cls&&_cleanCell(x.roll_no).toLowerCase()===vals.roll_no.toLowerCase());
          if(!match)match=current.find(x=>x.class_name===cls&&_cleanCell(x.name).toLowerCase()===name.toLowerCase());
          const payload={academic_year_id:state.yearId,class_name:cls,name,roll_no:vals.roll_no||null,symbol_no:vals.symbol_no||null,registration_no:vals.registration_no||null,dob:vals.dob||null,gender:vals.gender||null,active:true};
          const res=match?await sb.from("students").update(payload).eq("id",match.id).select().single():await sb.from("students").insert(payload).select().single();
          if(res.error){errs.push(`Row ${r+1}: ${res.error.message}`);continue;}
          if(match){Object.assign(match,res.data);updated++;}else{current.push(res.data);imported++;}
        }
        await _logImport("STUDENTS",file,null,defaultClass,imported,updated,errs.length);
        closeModal();toast(`Student Excel: ${imported} new, ${updated} updated${errs.length?`, ${errs.length} error(s)`:""}.`);
        if(errs.length)openModal("Student Import Report",`<div class="notice">Imported new: ${imported}<br>Updated existing: ${updated}<br>Errors: ${errs.length}</div><div class="table-wrap"><table><tbody>${errs.slice(0,100).map(x=>`<tr><td>${esc(x)}</td></tr>`).join("")}</tbody></table></div>`);
        if(state.page==="students")await loadStudents();
      }catch(e){console.error(e);toast(errMsg(e));}finally{btn.disabled=false;}
    };
  });
}

function _v7ComponentLabel(c){return `${c.subject_name} - ${c.code} / ${num(c.full_marks)}`;}
function _v7GuessIdentifier(headers){
  const normalized=new Map(headers.filter(Boolean).map(h=>[_normHeader(h),h]));
  for(const [method,aliases] of [["SYMBOL NO",["symbolno","symbol","symbolnumber"]],["ROLL NO",["rollno","roll","rollnumber"]],["REGISTRATION NO",["registrationno","regno","registration","regdno"]],["NAME",["studentname","name","student"]]]){
    for(const a of aliases)if(normalized.has(a))return {method,column:normalized.get(a)};
  }
  return {method:"NAME",column:headers[0]||""};
}
function _v7FindStudentByMethod(list,method,key){
  const k=_cleanCell(key).toLowerCase();if(!k)return null;
  if(method==="SYMBOL NO")return list.find(x=>_cleanCell(x.symbol_no).toLowerCase()===k)||null;
  if(method==="ROLL NO")return list.find(x=>_cleanCell(x.roll_no).toLowerCase()===k)||null;
  if(method==="REGISTRATION NO")return list.find(x=>_cleanCell(x.registration_no).toLowerCase()===k)||null;
  return list.find(x=>_cleanCell(x.name).toLowerCase()===k)||null;
}
async function _v7LoadMarksProfiles(){
  const {data,error}=await sb.from("import_profiles").select("id,name,json_data").eq("profile_type","MARKS").order("name");
  if(error)throw error;return data||[];
}

/* Marks Excel import: full v1.4.3-style mapping wizard, plus saved mappings. */
async function importMarksLedger(){
  const pageExam=num($("#markExam")?.value||state.selectedExamId),pageClass=$("#markClass")?.value||"Class 1";
  _pickExcelFile(async file=>{
    const wb=await _v7ReadWorkbook(file),sheetNames=wb.SheetNames||[];if(!sheetNames.length)throw new Error("Excel workbook has no sheet.");
    const exams=await examOptions(),profiles=await _v7LoadMarksProfiles();
    openModal("Import Marks Ledger",`<div class="form-grid three">
      <div class="field"><label>Sheet</label><select id="v7MkSheet">${sheetNames.map(x=>`<option>${esc(x)}</option>`).join("")}</select></div>
      <div class="field"><label>Header Row</label><select id="v7MkHeader">${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${i===2?"selected":""}>${i+1}</option>`).join("")}</select></div>
      <div class="field"><label>Examination</label><select id="v7MkExam">${exams.map(e=>`<option value="${e.id}" ${num(e.id)===pageExam?"selected":""}>${esc(e.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Class</label><select id="v7MkClass">${classOptions(pageClass)}</select></div>
      <div class="field"><label>Match Students By</label><select id="v7MkMethod"><option>NAME</option><option>ROLL NO</option><option>SYMBOL NO</option><option value="REGISTRATION NO">IEMIS ID</option></select></div>
      <div class="field"><label>Identifier Column</label><select id="v7MkIdColumn"></select></div>
      <div class="field full"><label>Saved Mapping</label><div style="display:flex;gap:7px"><select id="v7MkProfile" style="flex:1"><option value="">— None —</option>${profiles.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select><button type="button" class="btn" id="v7MkApplyProfile">Apply Saved Mapping</button><button type="button" class="btn" id="v7MkSaveProfile">Save Mapping</button></div></div>
      <div class="full info">Blank mark cells are left unchanged. Enter <b>ABS</b> for absent. Values above configured Full Marks are rejected.</div>
      <div id="v7MkMapping" class="full"></div>
      <div class="full"><h4 style="margin:4px 0 8px">Excel Preview</h4><div id="v7MkPreview"></div></div>
      <div class="form-actions full"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="button" class="btn" id="v7MkAnalyze">Re-analyze</button><button type="button" class="btn green" id="v7MkRun">IMPORT MARKS</button></div>
    </div>`);
    let v7Comps=[],v7Headers=[],v7Rows=[];
    const analyze=async(useProfile=false)=>{
      try{
        v7Rows=_v7SheetRows(wb,$("#v7MkSheet").value);const headerRow=num($("#v7MkHeader").value);v7Headers=_v7Headers(v7Rows,headerRow);v7Comps=await _allClassComponents($("#v7MkClass").value);
        const guessId=_v7GuessIdentifier(v7Headers);if(!$("#v7MkIdColumn").dataset.userSet){$("#v7MkMethod").value=guessId.method;}
        $("#v7MkIdColumn").innerHTML=_v7SelectOptions(v7Headers,$("#v7MkIdColumn").dataset.userSet?$("#v7MkIdColumn").value:guessId.column,false);
        const options=[`<option value="">Ignore</option>`,...v7Comps.map(c=>`<option value="${c.id}">${esc(_v7ComponentLabel(c))}</option>`)].join("");
        let profile=null;if(useProfile&&$("#v7MkProfile").value)profile=profiles.find(p=>String(p.id)===String($("#v7MkProfile").value))?.json_data||null;
        const bySig=new Map(v7Comps.map(c=>[`${_normHeader(c.subject_name)}|${_normHeader(c.code)}`,c.id]));
        const rowsHtml=v7Headers.map((h,i)=>{
          const norm=_normHeader(h);let cid="";const guessed=v7Comps.find(c=>_markHeaderCandidates(c).includes(norm));if(guessed)cid=String(guessed.id);
          if(profile){
            const old=profile.mapping?.[h];if(old&&v7Comps.some(c=>String(c.id)===String(old)))cid=String(old);
            else if(profile.signatures?.[h]){const sg=profile.signatures[h];const x=bySig.get(`${_normHeader(sg.subject_name)}|${_normHeader(sg.code)}`);if(x)cid=String(x);}
          }
          return `<tr><td>${esc(h||`Column ${i+1}`)}</td><td><select class="v7-mk-map" data-header="${esc(h)}">${options.replace(`value="${cid}"`,`value="${cid}" selected`)}</select></td></tr>`;
        }).join("");
        $("#v7MkMapping").innerHTML=`<div class="table-wrap" style="max-height:340px"><table><thead><tr><th>Excel Column</th><th>Map To</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
        $("#v7MkPreview").innerHTML=_v7PreviewTable(v7Headers,v7Rows,headerRow,8);
        if(profile){if(profile.identifier_method)$("#v7MkMethod").value=profile.identifier_method;if(profile.identifier_column&&v7Headers.includes(profile.identifier_column)){$("#v7MkIdColumn").value=profile.identifier_column;$("#v7MkIdColumn").dataset.userSet="1";}}
      }catch(e){console.error(e);toast(errMsg(e));}
    };
    $("#v7MkIdColumn").onchange=()=>{$("#v7MkIdColumn").dataset.userSet="1";};
    $("#v7MkSheet").onchange=()=>{$("#v7MkIdColumn").dataset.userSet="";analyze(false)};$("#v7MkHeader").onchange=()=>{$("#v7MkIdColumn").dataset.userSet="";analyze(false)};$("#v7MkClass").onchange=()=>analyze(false);$("#v7MkAnalyze").onclick=()=>analyze(false);$("#v7MkApplyProfile").onclick=()=>analyze(true);
    $("#v7MkSaveProfile").onclick=async()=>{
      try{
        const name=prompt("Mapping profile name:");if(!name)return;
        const mapping={},signatures={};$$('.v7-mk-map').forEach(x=>{if(x.value){mapping[x.dataset.header]=num(x.value);const c=v7Comps.find(z=>num(z.id)===num(x.value));if(c)signatures[x.dataset.header]={subject_name:c.subject_name,code:c.code};}});
        if(!Object.keys(mapping).length)return toast("Map at least one marks column first.");
        const payload={profile_type:"MARKS",name:name.trim(),json_data:{identifier_method:$("#v7MkMethod").value,identifier_column:$("#v7MkIdColumn").value,mapping,signatures}};
        const {error}=await sb.from("import_profiles").upsert(payload,{onConflict:"profile_type,name"});if(error)throw error;toast("Marks mapping saved.");
      }catch(e){console.error(e);toast(errMsg(e));}
    };
    $("#v7MkRun").onclick=async()=>{
      const btn=$("#v7MkRun");btn.disabled=true;
      try{
        const examId=num($("#v7MkExam").value),cls=$("#v7MkClass").value,headerRow=num($("#v7MkHeader").value),method=$("#v7MkMethod").value,idColumn=$("#v7MkIdColumn").value;
        if(!examId||!cls||!idColumn)throw new Error("Select examination, class and identifier column.");
        const colMappings=[];$$('.v7-mk-map').forEach(x=>{if(x.value){const c=v7Comps.find(z=>num(z.id)===num(x.value));if(c)colMappings.push({header:x.dataset.header,component:c});}});if(!colMappings.length)throw new Error("Map at least one marks column.");
        const {data:students,error:se}=await sb.from("students").select("*").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true);if(se)throw se;const list=students||[];
        const upserts=[],errs=[];let importedRows=0,skipped=0;
        for(let r=headerRow;r<v7Rows.length;r++){
          const row=v7Rows[r]||[],idVal=_v7MappedCell(row,v7Headers,idColumn);if(!idVal){if(row.some(v=>_cleanCell(v)))errs.push(`Row ${r+1}: student identifier is blank.`);continue;}
          const st=_v7FindStudentByMethod(list,method,idVal);if(!st){errs.push(`Row ${r+1}: student not found: ${idVal}`);continue;}
          let has=false,rowError=false;
          for(const m of colMappings){const raw=_v7MappedCell(row,v7Headers,m.header);if(!raw)continue;has=true;const upper=raw.toUpperCase();if(["ABS","AB","A","ABSENT"].includes(upper)){upserts.push({exam_id:examId,student_id:st.id,component_id:m.component.id,obtained_mark:null,status:"ABS"});continue;}const mark=Number(raw);if(!Number.isFinite(mark)||mark<0||mark>num(m.component.full_marks)){errs.push(`Row ${r+1} ${m.component.subject_name} ${m.component.code}: '${raw}' must be 0-${num(m.component.full_marks)} or ABS.`);rowError=true;continue;}upserts.push({exam_id:examId,student_id:st.id,component_id:m.component.id,obtained_mark:mark,status:"MARK"});}
          if(rowError)skipped++;else if(has)importedRows++;else skipped++;
        }
        for(let i=0;i<upserts.length;i+=500){const {error}=await sb.from("marks").upsert(upserts.slice(i,i+500),{onConflict:"exam_id,student_id,component_id"});if(error)throw error;}
        await _logImport("MARKS",file,examId,cls,importedRows,0,errs.length);closeModal();toast(`Marks Excel: ${upserts.length} cell(s) imported; ${importedRows} student row(s) accepted${errs.length?`; ${errs.length} error(s)`:""}.`);
        if(errs.length)openModal("Marks Import Report",`<div class="notice">Student rows imported: ${importedRows}<br>Skipped: ${skipped}<br>Imported mark cells: ${upserts.length}<br>Errors: ${errs.length}</div><div class="table-wrap"><table><tbody>${errs.slice(0,120).map(x=>`<tr><td>${esc(x)}</td></tr>`).join("")}</tbody></table></div>`);
        if(state.page==="marks"&&num($("#markExam")?.value)===examId&&$("#markClass")?.value===cls&&_v4SelectedSubjectIds().length)await loadSelectedMarksSheets();
      }catch(e){console.error(e);toast(errMsg(e));}finally{btn.disabled=false;}
    };
    await analyze(false);
  });
}

/* Keyboard productivity for the existing approved Marks Entry matrix. */
document.addEventListener("keydown",e=>{
  const el=e.target;if(!(el instanceof HTMLInputElement)||!el.classList.contains("mark-input"))return;
  if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==="s"){e.preventDefault();saveAllSelectedMarks();return;}
  const subject=num(el.dataset.subject),row=num(el.dataset.row),col=num(el.dataset.col);let target=null;
  if(e.key==="Enter"||e.key==="ArrowDown")target=document.querySelector(`.mark-input[data-subject="${subject}"][data-row="${row+1}"][data-col="${col}"]`);
  else if(e.key==="ArrowUp")target=document.querySelector(`.mark-input[data-subject="${subject}"][data-row="${row-1}"][data-col="${col}"]`);
  if(target){e.preventDefault();target.focus();target.select();}
});

Object.assign(window,{importStudentsExcel,importMarksLedger});


/* ============================================================
   v8 FUNCTIONALITY PHASE 2 — RESULT LIFECYCLE / RESULT EXPORT
   Preserves the approved v6 visual design.
   ============================================================ */
async function v8ClassCompletion(examId,cls){
  const [{data:students,error:e1},{data:subjects,error:e2},{data:marks,error:e3}]=await Promise.all([
    sb.from("students").select("id").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true),
    sb.from("subjects").select("id,components(id)").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true),
    sb.from("marks").select("student_id,component_id").eq("exam_id",examId)
  ]);
  if(e1)throw e1;if(e2)throw e2;if(e3)throw e3;
  const studentIds=new Set((students||[]).map(x=>num(x.id)));
  const componentIds=new Set((subjects||[]).flatMap(s=>(s.components||[]).map(c=>num(c.id))));
  const expected=studentIds.size*componentIds.size;
  let entered=0;
  for(const m of marks||[])if(studentIds.has(num(m.student_id))&&componentIds.has(num(m.component_id)))entered++;
  const percent=expected?Math.round((entered/expected*100+Number.EPSILON)*10)/10:0;
  return {entered,expected,percent};
}

async function v8SetClassResultStatus(examId,cls,status,date=""){
  const {data,error}=await sb.rpc("set_class_result_status",{
    p_exam_id:examId,
    p_class_name:cls,
    p_status:status,
    p_publish_date_bs:date||null
  });
  if(error)throw error;
  return data;
}

async function renderResults(){
  const exams=await examOptions();
  $("#content").innerHTML=`<div class="master-toolbar"><div class="toolbar"><div class="field" style="min-width:300px"><label>Examination</label><select id="resExam">${exams.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></div><div class="field"><label>Class</label><select id="resClass">${classOptions("Class 1")}</select></div><div class="field"><label>Date of Issue (B.S.)</label><input id="issueDate" placeholder="2083-05-29" maxlength="10"></div><button class="btn primary" id="loadResultsBtn">Calculate / Refresh</button><button class="btn dark" id="resFinalizeBtn" onclick="setResultStatus('FINALIZED')">Finalize</button><button class="btn green" id="resPublishBtn" onclick="setResultStatus('PUBLISHED')">Publish</button></div></div><div id="resultsStatusHost"></div><div class="master-table-card"><div id="resultsArea"><div class="empty">Select exam and class to preview results.</div></div></div>`;
  $("#loadResultsBtn").onclick=refreshResults;
  $("#resExam").onchange=refreshResults;
  $("#resClass").onchange=refreshResults;
  await refreshResults();
}

async function refreshResults(){
  const examId=num($("#resExam")?.value),cls=$("#resClass")?.value;if(!examId)return;
  $("#resultsArea").innerHTML=`<div class="empty">Calculating…</div>`;
  const [results,pubRes,examRes,completion]=await Promise.all([
    calculateClassResults(examId,cls),
    sb.from("result_publications").select("*").eq("exam_id",examId).eq("class_name",cls).maybeSingle(),
    sb.from("exams").select("*").eq("id",examId).single(),
    v8ClassCompletion(examId,cls)
  ]);
  if(pubRes.error)throw pubRes.error;if(examRes.error)throw examRes.error;
  let pub=pubRes.data||{status:"DRAFT",publish_date_bs:""};const exam=examRes.data;
  const pass=results.filter(r=>r.status==="PASS").length,ng=results.filter(r=>r.status==="NG").length,inc=results.filter(r=>r.status==="INCOMPLETE").length;

  // Match original local v1.4.3 lifecycle: complete calculations automatically become CALCULATED.
  // FINALIZED/PUBLISHED are preserved until a database change invalidates them back to DRAFT.
  const current=String(pub.status||"DRAFT").toUpperCase();
  let derived=current;
  if(!["FINALIZED","PUBLISHED"].includes(current))derived=(results.length>0&&inc===0&&completion.expected>0&&completion.entered>=completion.expected)?"CALCULATED":"DRAFT";
  if(derived!==current){
    try{await v8SetClassResultStatus(examId,cls,derived,"");pub={...pub,status:derived,publish_date_bs:derived==="DRAFT"?"":pub.publish_date_bs};}
    catch(e){console.error(e);toast(errMsg(e));}
  }

  state.resultContext={examId,cls,results,pub,exam,completion};
  if($("#issueDate"))$("#issueDate").value=pub.publish_date_bs||"";
  const status=String(pub.status||derived||"DRAFT").toUpperCase();
  const color={DRAFT:["#EEF2F7","var(--navy2)"],CALCULATED:["#EAF2FF","var(--blue2)"],FINALIZED:["#FFF4E8","var(--orange)"],PUBLISHED:["#E9F8F2","var(--green)"]}[status]||["#EEF2F7","var(--navy2)"];
  $("#resultsStatusHost").innerHTML=`<div class="result-status-card"><span class="result-status-badge" style="background:${color[0]};color:${color[1]}">${esc(status)}</span><span class="result-status-text">Marks ${completion.percent.toFixed(1)}% complete (${completion.entered}/${completion.expected}) • Students ${results.length} • Pass ${pass} • NG ${ng} • Incomplete ${inc}</span><div class="result-status-actions"><span id="resultSelectionCount" style="font-size:11px;color:var(--muted);margin-right:3px">0 selected</span><button class="btn" onclick="v5ExportResultsExcel()">Export Result Excel</button><button class="btn" onclick="selectAllResultStudents(true)">Select All</button><button class="btn" onclick="selectAllResultStudents(false)">Clear</button><button class="btn green" onclick="downloadBulkResultsPdf()">Download Bulk PDF</button><button class="btn" onclick="printBulkResults()">Bulk Print</button></div></div>`;
  $("#resultsArea").innerHTML=`${!results.length?`<div class="notice">No active students were found in ${esc(cls)}.</div>`:""}${inc?`<div class="notice">${inc} student result(s) are incomplete. Finalize/Publish after completing all required marks.</div>`:""}<div class="table-wrap"><table><thead><tr><th class="center" style="width:38px"><input id="resultSelectAll" type="checkbox" aria-label="Select all students"></th><th class="center">Roll</th><th>Student Name</th><th class="center">IEMIS ID</th><th class="center">Total Credit</th><th class="center">Total WGP</th><th class="center">GPA</th><th class="center">Result</th><th class="center">Preview</th></tr></thead><tbody>${results.map(r=>`<tr><td class="center"><input class="result-student-check" type="checkbox" value="${r.student.id}" aria-label="Select ${esc(r.student.name)}"></td><td class="center">${esc(r.student.roll_no||"")}</td><td>${esc(r.student.name)}</td><td class="center">${esc(r.student.registration_no||"")}</td><td class="center">${creditFmt(r.total_credit)}</td><td class="center">${r.total_wgp.toFixed(2)}</td><td class="center">${r.gpa_display}</td><td class="center">${esc(r.status)}</td><td class="center"><button class="btn small" onclick="printSingleResult(${r.student.id})">Preview / Print</button></td></tr>`).join("")}</tbody></table></div>`;
  const all=$("#resultSelectAll");if(all)all.onchange=e=>selectAllResultStudents(!!e.currentTarget.checked);
  $$(".result-student-check").forEach(x=>x.onchange=updateResultSelectionState);
  updateResultSelectionState();
  const finalBtn=$("#resFinalizeBtn"),publishBtn=$("#resPublishBtn");
  if(finalBtn)finalBtn.disabled=!results.length||inc>0;
  if(publishBtn)publishBtn.disabled=!results.length||inc>0;
}

async function setResultStatus(status){
  const c=state.resultContext;if(!c)return toast("Calculate results first.");
  const target=String(status||"").toUpperCase();
  if(!c.results.length)return toast("No students were found in this class.");
  const incomplete=c.results.filter(r=>r.incomplete);
  if(["CALCULATED","FINALIZED","PUBLISHED"].includes(target)&&incomplete.length)return toast(`Cannot ${target.toLowerCase()}. ${incomplete.length} student result(s) are incomplete.`);
  let date=($("#issueDate")?.value||"").trim();
  if(target==="PUBLISHED"&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return toast("Enter Date of Issue in YYYY-MM-DD format before publishing.");
  try{
    await v8SetClassResultStatus(c.examId,c.cls,target,date);
    toast(target==="FINALIZED"?`${c.cls} result finalized and ready to publish.`:`${c.cls} result ${target.toLowerCase()}.`);
    await refreshResults();
  }catch(e){console.error(e);toast(errMsg(e));}
}

/* Original v1.4.3-style detailed result Excel: each subject GP/Credit/WGP/Grade + totals. */
async function v5ExportResultsExcel(){
  const c=state.resultContext;if(!c)return toast("Calculate results first.");
  const {data:subjects,error}=await sb.from("subjects").select("id,name,sort_order").eq("academic_year_id",state.yearId).eq("class_name",c.cls).eq("active",true).order("sort_order").order("id");
  if(error)return toast(errMsg(error));
  const subs=subjects||[],headers=["Roll No","Student Name"];
  for(const s of subs)headers.push(`${s.name} GP`,`${s.name} Credit`,`${s.name} WGP`,`${s.name} Grade`);
  headers.push("Total Credit","Total WGP","GPA","Status");
  const rows=[[`${c.cls} | ${c.exam.name} | RESULT`],[],headers];
  for(const r of c.results){
    const row=[r.student.roll_no||"",r.student.name||""],byId=new Map(r.subjects.map(s=>[num(s.id),s]));
    for(const s of subs){const x=byId.get(num(s.id));if(!x)row.push("","","","");else row.push(x.final_grade_point==null?"":Math.round(num(x.final_grade_point)*10)/10,num(x.credit_hour),x.wgp==null?"":Math.round(num(x.wgp)*100)/100,x.final_grade||"");}
    row.push(r.total_credit,r.total_wgp,r.gpa==null?"":Math.round(num(r.gpa)*100)/100,r.status);rows.push(row);
  }
  const widths=headers.map((h,i)=>i===1?28:Math.max(11,Math.min(22,String(h).length+2)));
  const wb=_newWorkbookFromAOA("Result",rows,widths),ws=wb.Sheets.Result;
  const gpaCol=headers.indexOf("GPA"),wgpCol=headers.indexOf("Total WGP"),gpCols=headers.map((h,i)=>h.endsWith(" GP")?i:-1).filter(i=>i>=0);
  for(let rr=3;rr<rows.length;rr++){
    const excelRow=rr+1;
    const setFmt=(col,fmt)=>{const addr=XLSX.utils.encode_cell({r:excelRow-1,c:col});if(ws[addr])ws[addr].z=fmt;};
    setFmt(gpaCol,"0.00");setFmt(wgpCol,"0.00");gpCols.forEach(cc=>setFmt(cc,"0.0"));
  }
  _saveWorkbook(wb,`Result_${_safeFilename(c.cls)}_${_safeFilename(c.exam.name)}.xlsx`);
}

async function printSingleResult(studentId){
  const c=state.resultContext;if(!c)return;
  const r=c.results.find(x=>num(x.student.id)===num(studentId));if(!r)return toast("Student result not found.");
  const cfg=await gradeSheetSettings(c.cls),issue=($("#issueDate")?.value||c.pub.publish_date_bs||"").trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(issue))return toast("Enter Date of Issue in YYYY-MM-DD format before preview/print.");
  await printGradeSheetHtml(gradeSheetHtml(r,c.exam,cfg,issue));await navigate("results");
}

async function printBulkResults(){
  const c=state.resultContext;if(!c)return toast("Calculate results first.");
  const ids=selectedResultStudentIds();if(!ids.length)return toast("Select the student(s) to print, or click Select All.");
  const issue=($("#issueDate")?.value||c.pub.publish_date_bs||"").trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(issue))return toast("Enter Date of Issue in YYYY-MM-DD format before Bulk PDF/Print.");
  const cfg=await gradeSheetSettings(c.cls),chosen=c.results.filter(r=>ids.includes(num(r.student.id)));if(!chosen.length)return toast("No selected student results found.");
  await printGradeSheetHtml(`<div class="print-batch">${chosen.map(r=>gradeSheetHtml(r,c.exam,cfg,issue)).join("")}</div>`);await navigate("results");
}

async function downloadBulkResultsPdf(){
  const c=state.resultContext;if(!c)return toast("Calculate results first.");
  const ids=selectedResultStudentIds();if(!ids.length)return toast("Select the student(s) to download, or click Select All.");
  const issue=($("#issueDate")?.value||c.pub.publish_date_bs||"").trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(issue))return toast("Enter Date of Issue in YYYY-MM-DD format before downloading Bulk PDF.");
  if(typeof window.html2canvas!=="function"||!window.jspdf?.jsPDF)return toast("PDF libraries are still loading. Please wait a moment and try again.");
  const cfg=await gradeSheetSettings(c.cls);
  const chosen=c.results.filter(r=>ids.includes(num(r.student.id)));
  if(!chosen.length)return toast("No selected student results found.");

  /*
   * v23: render ONE grade sheet at a time with html2canvas and add that
   * canvas directly to jsPDF. This avoids html2pdf's hidden/off-screen DOM
   * pagination path, which could download a valid but completely blank PDF
   * in Chrome (both local and online).
   */
  const overlay=document.createElement("div");
  overlay.style.cssText="position:fixed;inset:0;z-index:2147483647;background:rgba(255,255,255,.97);display:flex;align-items:center;justify-content:center;font:700 16px Arial;color:#123c69;text-align:center;padding:24px;";
  overlay.textContent=`Preparing PDF… 0 / ${chosen.length}`;

  const host=document.createElement("div");
  host.className="bulk-pdf-direct-host";
  host.style.cssText="position:fixed;left:0;top:0;width:210mm;height:297mm;z-index:2147483646;background:#fff;color:#000;pointer-events:none;overflow:hidden;opacity:1;visibility:visible;transform:none;";
  document.body.appendChild(host);
  document.body.appendChild(overlay);

  try{
    if(document.fonts?.ready){try{await document.fonts.ready;}catch(_e){}}
    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true});

    for(let i=0;i<chosen.length;i++){
      host.innerHTML=gradeSheetHtml(chosen[i],c.exam,cfg,issue);
      const sheet=host.querySelector(".grade-sheet");
      if(!sheet)throw new Error("Grade sheet could not be prepared for PDF.");
      sheet.style.margin="0";
      sheet.style.display="block";
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      await waitForPrintImages(host);

      const rect=sheet.getBoundingClientRect();
      const canvas=await window.html2canvas(sheet,{
        scale:1.75,
        useCORS:true,
        allowTaint:false,
        backgroundColor:"#ffffff",
        logging:false,
        scrollX:0,
        scrollY:0,
        width:Math.ceil(rect.width),
        height:Math.ceil(rect.height),
        windowWidth:Math.max(Math.ceil(rect.width),794),
        windowHeight:Math.max(Math.ceil(rect.height),1123)
      });
      if(!canvas||canvas.width<100||canvas.height<100)throw new Error("PDF page capture was empty.");

      /* Guard against an all-white/blank capture before saving. */
      const probe=canvas.getContext("2d",{willReadFrequently:true});
      if(probe){
        const stepX=Math.max(1,Math.floor(canvas.width/24)),stepY=Math.max(1,Math.floor(canvas.height/32));
        let nonWhite=0;
        for(let y=0;y<canvas.height&&nonWhite<8;y+=stepY){
          for(let x=0;x<canvas.width&&nonWhite<8;x+=stepX){
            const d=probe.getImageData(x,y,1,1).data;
            if(d[3]>0&&(d[0]<245||d[1]<245||d[2]<245))nonWhite++;
          }
        }
        if(nonWhite===0)throw new Error("PDF page capture was blank. Please retry after the grade sheet finishes loading.");
      }

      if(i>0)pdf.addPage("a4","portrait");
      const image=canvas.toDataURL("image/jpeg",0.96);
      pdf.addImage(image,"JPEG",0,0,210,297,undefined,"FAST");
      overlay.textContent=`Preparing PDF… ${i+1} / ${chosen.length}`;
      await new Promise(resolve=>setTimeout(resolve,0));
    }

    const filename=`Result_${_safeFilename(c.cls)}_${_safeFilename(c.exam.name)}_${_safeFilename(issue)}.pdf`;
    pdf.save(filename);
    toast(`Bulk Result PDF downloaded: ${chosen.length} student(s).`);
  }catch(error){
    console.error(error);
    toast(`Bulk PDF could not be downloaded: ${errMsg(error)}`);
  }finally{
    host.remove();
    overlay.remove();
  }
}

Object.assign(window,{renderResults,refreshResults,setResultStatus,v5ExportResultsExcel,printSingleResult,printBulkResults,downloadBulkResultsPdf});

/* ============================================================
   v13 — TERM-WISE ASSESSMENT + COMPONENT CREDIT + BULK PDF
   ------------------------------------------------------------
   Subject/components remain reusable master templates.
   Actual FM / Pass % / Credit / Weight are stored per Examination.
   Full Marks has no 100-mark assumption: 900/900 = 100%.
   ============================================================ */

async function v12ResultLock(examId,cls){
  const {data,error}=await sb.from("result_publications").select("status,publish_date_bs").eq("exam_id",examId).eq("class_name",cls).maybeSingle();
  if(error)throw error;
  const status=String(data?.status||"DRAFT").toUpperCase();
  return {status,locked:["FINALIZED","PUBLISHED"].includes(status),publish_date_bs:data?.publish_date_bs||""};
}

async function v12EnsureExamSettings(examId,cls){
  const lock=await v12ResultLock(examId,cls);
  if(lock.locked)return lock;
  const {error}=await sb.rpc("ensure_exam_component_settings",{p_exam_id:examId,p_class_name:cls});
  if(error){
    const msg=String(error.message||"");
    if(/ensure_exam_component_settings|schema cache|function/i.test(msg))throw new Error("Term-wise Full Marks SQL is not installed. Run MARKS_WORKFLOW_V15_SQL.sql once in the Marks Supabase project.");
    if(/Full Marks cannot be lower than an already saved obtained mark/i.test(msg))throw new Error("Legacy Full Marks snapshot conflict. Run MARKS_V31_FULL_MARKS_ROOT_FIX.sql once in the Marks Supabase project, then reload this page.");
    throw error;
  }
  return lock;
}

async function v12EffectiveSubjects(examId,cls,subjectIds=null,{ensure=true}={}){
  if(ensure)await v12EnsureExamSettings(examId,cls);
  let req=sb.from("subjects").select("id,name,credit_hour,sort_order,active,components(*)").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("sort_order").order("id");
  if(Array.isArray(subjectIds)&&subjectIds.length)req=req.in("id",subjectIds);
  const {data:subjects,error}=await req;if(error)throw error;
  const list=subjects||[],compIds=list.flatMap(s=>(s.components||[]).map(c=>num(c.id))).filter(Boolean);
  if(!compIds.length)return list.map(s=>({...s,components:[]}));
  const {data:settings,error:se}=await sb.from("exam_component_settings").select("exam_id,component_id,full_marks,weight_percent,credit_hour,pass_percent").eq("exam_id",examId).in("component_id",compIds);
  if(se){
    const msg=String(se.message||"");
    if(/exam_component_settings|schema cache|relation/i.test(msg))throw new Error("Term-wise Full Marks SQL is not installed. Run MARKS_WORKFLOW_V15_SQL.sql once in the Marks Supabase project.");
    throw se;
  }
  const sm=new Map((settings||[]).map(x=>[num(x.component_id),x]));
  return list.map(s=>({...s,components:(s.components||[])
    .filter(c=>sm.has(num(c.id)))
    .map(c=>{const x=sm.get(num(c.id));return {...c,master_full_marks:c.full_marks,master_weight_percent:c.weight_percent,master_credit_hour:c.credit_hour,master_pass_percent:c.pass_percent,full_marks:x.full_marks,weight_percent:x.weight_percent,credit_hour:x.credit_hour,pass_percent:x.pass_percent,v12_exam_setting:true};})
    .sort((a,b)=>num(a.sort_order)-num(b.sort_order)||num(a.id)-num(b.id))}));
}


/* ============================================================
   v27 — FULL MARKS CONFLICT VISIBILITY
   Shows exactly which saved marks exceed the selected/proposed
   Full Marks, and highlights those students/cells in red.
   ============================================================ */
function v27SavedMarkOverFull(mark,full){
  if(!mark||String(mark.status||"").toUpperCase()==="ABS")return false;
  const om=Number(mark.obtained_mark),fm=Number(full);
  return Number.isFinite(om)&&Number.isFinite(fm)&&om>fm+1e-12;
}

function v27StudentHasConflict(student,subjects,mMap){
  return (subjects||[]).some(s=>(s.components||[]).some(c=>v27SavedMarkOverFull(mMap.get(`${student.id}_${c.id}`),c.full_marks)));
}

function v27ConflictHtml(conflicts,title="Full Marks Conflict Found"){
  if(!(conflicts||[]).length)return "";
  const hasInactiveSubject=(conflicts||[]).some(x=>x.subject_active===false);
  return `<div class="v27-conflict-box"><div class="v27-conflict-title">⚠ ${esc(title)}</div><div class="v27-conflict-note">The red saved mark is higher than the Full Marks for this examination/component. v30 checks every matching saved mark, including inactive/moved students and inactive/old subjects. ${hasInactiveSubject?'<strong>At least one blocker belongs to an inactive/old subject record.</strong> ':''}Use the IDs below to trace the exact database row; you do not need to temporarily raise Full Marks.</div><div class="table-wrap"><table class="v27-conflict-table"><thead><tr><th>Roll</th><th>Student</th><th>Student Record</th><th>Subject</th><th>Subject Status</th><th>Component</th><th>Full Marks</th><th>Saved Obtained Mark</th><th>Trace IDs</th></tr></thead><tbody>${conflicts.map(x=>`<tr><td>${esc(x.roll_no||"")}</td><td class="v27-conflict-student"><strong>${esc(x.name||"")}</strong>${x.active===false?` <small>(Inactive Student)</small>`:""}</td><td>${esc(x.class_name||"Unknown/old record")}</td><td>${esc(x.subject_name||"")}</td><td>${x.subject_active===false?'<strong class="v30-old-subject">INACTIVE / OLD</strong>':'Active'}</td><td>${esc(x.component_label||x.component_code||"")}</td><td class="center">${esc(x.full_marks)}</td><td class="center v27-over-mark"><strong>${esc(x.obtained_mark)}</strong></td><td class="v30-trace-ids"><small>Mark #${esc(x.mark_id??"")}<br>Student #${esc(x.student_id??"")}<br>Subject #${esc(x.subject_id??"")}<br>Component #${esc(x.component_id??"")}</small></td></tr>`).join("")}</tbody></table></div></div>`;
}

async function v27FindFullMarkConflicts(examId,cls,{subjectIds=null,proposedFullMarks=null}={}){
  // v30 deep trace: mirror the database ensure/guard scope exactly.
  // IMPORTANT: do NOT filter subjects by active=true here. The SQL ensure function scans
  // every subject in the examination academic year + class, so an inactive/old subject
  // component can be the hidden row that blocks Full Marks setup.
  const {data:exam,error:ee}=await sb.from("exams").select("id,academic_year_id,name").eq("id",examId).maybeSingle();
  if(ee)throw ee;
  const examYear=num(exam?.academic_year_id)||num(state.yearId);
  let sreq=sb.from("subjects").select("id,name,sort_order,active,class_name,academic_year_id,components(id,code,label,full_marks,sort_order)")
    .eq("academic_year_id",examYear).eq("class_name",cls).order("sort_order").order("id");
  if(Array.isArray(subjectIds)&&subjectIds.length)sreq=sreq.in("id",subjectIds.map(num));
  const {data:subjects,error:sue}=await sreq;if(sue)throw sue;
  const subs=subjects||[],compIds=subs.flatMap(s=>(s.components||[]).map(c=>num(c.id))).filter(Boolean);
  if(!compIds.length)return [];

  const [{data:settings,error:se},{data:marks,error:me}]=await Promise.all([
    sb.from("exam_component_settings").select("component_id,full_marks").eq("exam_id",examId).in("component_id",compIds),
    sb.from("marks").select("id,student_id,component_id,obtained_mark,status,updated_at").eq("exam_id",examId).in("component_id",compIds)
  ]);
  if(se)throw se;if(me)throw me;

  const settingMap=new Map((settings||[]).map(x=>[num(x.component_id),Number(x.full_marks)]));
  const compMap=new Map();
  for(const sub of subs)for(const c of sub.components||[]){
    const cid=num(c.id);
    const proposed=proposedFullMarks instanceof Map&&proposedFullMarks.has(cid)?Number(proposedFullMarks.get(cid)):null;
    const fm=Number.isFinite(proposed)?proposed:(settingMap.has(cid)?Number(settingMap.get(cid)):Number(c.full_marks));
    compMap.set(cid,{component_id:cid,subject_id:num(sub.id),subject_name:sub.name,subject_active:sub.active!==false,component_code:c.code,component_label:c.label||c.code,full_marks:fm,subject_sort:num(sub.sort_order),component_sort:num(c.sort_order)});
  }

  const candidateMarks=(marks||[]).filter(m=>{
    const c=compMap.get(num(m.component_id));return c&&v27SavedMarkOverFull(m,c.full_marks);
  });
  if(!candidateMarks.length)return [];

  const studentIds=[...new Set(candidateMarks.map(m=>num(m.student_id)).filter(Boolean))];
  let students=[];
  if(studentIds.length){
    const {data,error}=await sb.from("students").select("id,roll_no,name,active,class_name,academic_year_id,registration_no,symbol_no").in("id",studentIds);
    if(error)throw error;students=data||[];
  }
  const stMap=new Map(students.map(x=>[num(x.id),x]));
  const out=[];
  for(const m of candidateMarks){
    const c=compMap.get(num(m.component_id));if(!c)continue;
    const st=stMap.get(num(m.student_id));
    out.push({...c,mark_id:num(m.id),mark_updated_at:m.updated_at||null,student_id:num(m.student_id),roll_no:st?.roll_no??"",name:st?.name||`Student ID ${num(m.student_id)}`,active:st?.active,class_name:st?.class_name||"Unknown/old record",academic_year_id:st?.academic_year_id,registration_no:st?.registration_no||"",symbol_no:st?.symbol_no||"",obtained_mark:Number(m.obtained_mark)});
  }
  out.sort((a,b)=>{const aa=a.subject_active===false?0:1,ba=b.subject_active===false?0:1;if(aa!==ba)return aa-ba;const ar=Number(a.roll_no),br=Number(b.roll_no),af=Number.isFinite(ar),bf=Number.isFinite(br);if(af&&bf&&ar!==br)return ar-br;if(af!==bf)return af?-1:1;return String(a.roll_no||"").localeCompare(String(b.roll_no||""),undefined,{numeric:true})||a.subject_sort-b.subject_sort||a.component_sort-b.component_sort||String(a.name||"").localeCompare(String(b.name||""));});
  return out;
}

async function v27CheckTermSetupConflicts({toastOnConflict=false}={}){
  const box=$("#v27TermConflictBox"),examId=num($("#v12TermExam")?.value),cls=$("#subjectClass")?.value||"",subjectId=num(state.v5SubjectId);
  if(!box||!examId||!subjectId)return [];
  const proposed=new Map();
  for(const tr of $$('#v12TermSetupTable tr[data-v12-component]')){
    const cid=num(tr.dataset.v12Component),fm=Number(tr.querySelector('.v12-term-fm')?.value);if(cid&&Number.isFinite(fm))proposed.set(cid,fm);
  }
  try{
    const conflicts=await v27FindFullMarkConflicts(examId,cls,{subjectIds:[subjectId],proposedFullMarks:proposed});
    box.innerHTML=v27ConflictHtml(conflicts,"Saved marks above the Full Marks entered here");
    const badComponents=new Set(conflicts.map(x=>num(x.component_id)));
    $$('#v12TermSetupTable tr[data-v12-component]').forEach(tr=>{const bad=badComponents.has(num(tr.dataset.v12Component));tr.classList.toggle('v27-component-conflict',bad);const inp=tr.querySelector('.v12-term-fm');if(inp)inp.classList.toggle('v27-fm-conflict-input',bad);});
    state.v27TermConflicts=conflicts;
    if(conflicts.length&&toastOnConflict)toast(`${conflicts.length} saved mark(s) are above the entered Full Marks. See the red conflict list.`);
    return conflicts;
  }catch(e){console.error(e);box.innerHTML=`<div class="danger">Conflict check failed: ${esc(errMsg(e))}</div>`;return []}
}

async function v12InjectTermSetupPanel(){
  const split=document.querySelector(".subject-split");if(!split||$("#v12TermSetupPanel"))return;
  const exams=await examOptions();
  const panel=document.createElement("div");panel.id="v12TermSetupPanel";panel.className="section";panel.style.marginTop="14px";
  panel.innerHTML=`<div class="section-title"><div><h3>Term-wise Subject Assessment Setup</h3><p>Each examination keeps its own permanent setup. Every component (IN / TH / Practical etc.) has its own Full Marks, Pass %, Credit Hour and Weight %. Full Marks is not limited to 100.</p></div></div>
    <div class="toolbar" style="align-items:flex-end;flex-wrap:wrap">
      <div class="field" style="min-width:260px"><label>Examination / Term</label><select id="v12TermExam">${exams.map(e=>`<option value="${e.id}" ${num(e.id)===num(state.selectedExamId)?"selected":""}>${esc(e.name)}</option>`).join("")}</select></div>
      <button class="btn" id="v12CopyPreviousTerm" type="button">Copy Previous Exam Setup</button>
      <button class="btn" id="v12UseMasterDefaults" type="button">Use Current Master Defaults</button>
      <button class="btn green" id="v12SaveTermSetup" type="button">SAVE TERM SETUP</button>
    </div>
    <div class="info" style="margin-top:10px"><strong>Calculation rule:</strong> Percentage = Obtained Marks ÷ actual Full Marks × 100. Example: 810 / 900 = 90%; 900 / 900 = 100%.</div>
    <div id="v12TermSetupStatus" style="margin-top:10px"></div>
    <div id="v27TermConflictBox" style="margin-top:10px"></div>
    <div id="v12TermSetupTable" style="margin-top:10px"><div class="empty">Select a subject above.</div></div>`;
  split.insertAdjacentElement("afterend",panel);
  const ex=$("#v12TermExam");if(ex&&!ex.value&&ex.options.length)ex.selectedIndex=0;
  if(ex)ex.onchange=v12LoadTermSetup;
  $("#v12SaveTermSetup").onclick=v12SaveTermSetup;
  $("#v12CopyPreviousTerm").onclick=v12CopyPreviousTermSetup;
  $("#v12UseMasterDefaults").onclick=v12ApplyMasterDefaults;
}

async function v12LoadTermSetup(){
  const host=$("#v12TermSetupTable"),statusHost=$("#v12TermSetupStatus");if(!host)return;
  const examId=num($("#v12TermExam")?.value),cls=$("#subjectClass")?.value||"",subjectId=num(state.v5SubjectId);
  if(!examId){host.innerHTML=`<div class="empty">Add an examination in Settings first.</div>`;return;}
  if(!subjectId){host.innerHTML=`<div class="empty">Select or add a subject first.</div>`;return;}
  host.innerHTML=`<div class="empty">Loading term setup…</div>`;
  try{
    const lock=await v12EnsureExamSettings(examId,cls);
    const [{data:sub,error:se},{data:rows,error:re}]=await Promise.all([
      sb.from("subjects").select("id,name,components(*)").eq("id",subjectId).single(),
      sb.from("exam_component_settings").select("component_id,full_marks,weight_percent,credit_hour,pass_percent").eq("exam_id",examId)
    ]);
    if(se)throw se;if(re)throw re;
    const map=new Map((rows||[]).map(x=>[num(x.component_id),x]));
    const comps=(sub?.components||[]).filter(c=>map.has(num(c.id))).sort((a,b)=>num(a.sort_order)-num(b.sort_order)||num(a.id)-num(b.id));
    if(statusHost)statusHost.innerHTML=lock.locked?`<div class="notice"><strong>${esc(lock.status)} — LOCKED.</strong> This term's Full Marks setup cannot be changed unless the result lifecycle is returned to an editable state.</div>`:`<div class="info"><strong>${esc(lock.status)}</strong> — This examination/class setup is editable. Saving changes affects only this selected examination.</div>`;
    if(!comps.length){host.innerHTML=`<div class="empty">No assessment component is snapshotted for this subject in this examination.</div>`;return;}
    host.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Assessment Component</th><th>Master Default FM</th><th>Term Full Marks</th><th>Pass %</th><th>Component Credit Hour</th><th>Weight %</th></tr></thead><tbody>${comps.map(c=>{const x=map.get(num(c.id));const dis=lock.locked?"disabled":"";return `<tr data-v12-component="${c.id}"><td><strong>${esc(c.code)}</strong><br><small>${esc(c.label||"")}</small></td><td class="center">${num(c.full_marks)}</td><td><input class="v12-term-fm" type="number" step="0.001" min="0.001" value="${num(x.full_marks)}" ${dis}></td><td><input class="v12-term-pass" type="number" step="0.001" min="0" max="100" value="${x.pass_percent??""}" ${dis}></td><td><input class="v12-term-credit" type="number" step="0.001" min="0" value="${x.credit_hour??""}" ${dis}></td><td><input class="v12-term-weight" type="number" step="0.001" min="0" value="${x.weight_percent??""}" ${dis}></td></tr>`}).join("")}</tbody></table></div>`;
    const save=$("#v12SaveTermSetup"),copy=$("#v12CopyPreviousTerm"),defaults=$("#v12UseMasterDefaults");if(save)save.disabled=lock.locked;if(copy)copy.disabled=lock.locked;if(defaults)defaults.disabled=lock.locked;
    $$('#v12TermSetupTable .v12-term-fm').forEach(inp=>inp.oninput=()=>{clearTimeout(v27CheckTermSetupConflicts._t);v27CheckTermSetupConflicts._t=setTimeout(()=>v27CheckTermSetupConflicts(),180);});
    await v27CheckTermSetupConflicts();
  }catch(e){
    console.error(e);
    if(/Full Marks cannot be lower than an already saved obtained mark/i.test(errMsg(e))){
      try{const conflicts=await v27FindFullMarkConflicts(examId,cls);if(conflicts.length){if(statusHost)statusHost.innerHTML=`<div class="danger"><strong>Full Marks conflict detected.</strong> The software found the exact saved mark(s) causing the block.</div>`;const cbox=$("#v27TermConflictBox");if(cbox)cbox.innerHTML=v27ConflictHtml(conflicts,"These saved marks are blocking this Full Marks setup");host.innerHTML=`<div class="notice">Correct the red saved mark(s) in Marks Entry, then return here and save the Term Full Marks again.</div>`;return;}}catch(diagErr){console.error(diagErr);}
    }
    host.innerHTML=`<div class="danger">${esc(errMsg(e))}</div>`;
  }
}

async function v12SaveTermSetup(){
  const examId=num($("#v12TermExam")?.value),cls=$("#subjectClass")?.value||"";if(!examId)return toast("Select examination.");
  try{
    const lock=await v12ResultLock(examId,cls);if(lock.locked)return toast(`${lock.status}: this term setup is locked.`);
    const payload=[];
    for(const tr of $$('tr[data-v12-component]')){
      const component_id=num(tr.dataset.v12Component),fm=Number(tr.querySelector('.v12-term-fm')?.value),passRaw=tr.querySelector('.v12-term-pass')?.value??"",creditRaw=tr.querySelector('.v12-term-credit')?.value??"",weightRaw=tr.querySelector('.v12-term-weight')?.value??"";
      if(!Number.isFinite(fm)||fm<=0)return toast("Full Marks must be a positive number. It is not limited to 100.");
      const pass=passRaw===""?null:Number(passRaw),credit=creditRaw===""?null:Number(creditRaw),weight=weightRaw===""?null:Number(weightRaw);
      if(pass!=null&&(!Number.isFinite(pass)||pass<0||pass>100))return toast("Pass % must be between 0 and 100.");
      if(credit!=null&&(!Number.isFinite(credit)||credit<0))return toast("Credit Hour cannot be negative.");
      if(weight!=null&&(!Number.isFinite(weight)||weight<0))return toast("Weight % cannot be negative.");
      payload.push({exam_id:examId,component_id,full_marks:fm,pass_percent:pass,credit_hour:credit,weight_percent:weight,updated_at:new Date().toISOString()});
    }
    if(!payload.length)return toast("No term component is available to save.");
    const proposed=new Map(payload.map(x=>[num(x.component_id),Number(x.full_marks)]));
    const conflicts=await v27FindFullMarkConflicts(examId,cls,{subjectIds:[num(state.v5SubjectId)],proposedFullMarks:proposed});
    if(conflicts.length){const box=$("#v27TermConflictBox");if(box)box.innerHTML=v27ConflictHtml(conflicts,"Cannot save: these obtained marks are above the new Full Marks");const badComponents=new Set(conflicts.map(x=>num(x.component_id)));$$('#v12TermSetupTable tr[data-v12-component]').forEach(tr=>{const bad=badComponents.has(num(tr.dataset.v12Component));tr.classList.toggle('v27-component-conflict',bad);const inp=tr.querySelector('.v12-term-fm');if(inp)inp.classList.toggle('v27-fm-conflict-input',bad);});toast(`${conflicts.length} saved mark(s) are above the new Full Marks. See the red conflict list.`);return;}
    const {error}=await sb.from("exam_component_settings").upsert(payload,{onConflict:"exam_id,component_id"});if(error)throw error;
    const cbox=$("#v27TermConflictBox");if(cbox)cbox.innerHTML="";
    toast("Term-wise Full Marks setup saved. Other examinations are unchanged.");
    await v12LoadTermSetup();
  }catch(e){console.error(e);toast(errMsg(e));}
}

async function v12ApplyMasterDefaults(){
  const examId=num($("#v12TermExam")?.value),cls=$("#subjectClass")?.value||"",subjectId=num(state.v5SubjectId);if(!examId||!subjectId)return;
  if(!confirm("Replace this selected examination's values for the selected subject with the current master defaults? Other examinations will not change."))return;
  try{
    const lock=await v12ResultLock(examId,cls);if(lock.locked)return toast(`${lock.status}: this term setup is locked.`);
    await v12EnsureExamSettings(examId,cls);
    const {data,error}=await sb.from("subjects").select("components(*)").eq("id",subjectId).single();if(error)throw error;
    const rows=(data?.components||[]).map(c=>({exam_id:examId,component_id:c.id,full_marks:c.full_marks,weight_percent:c.weight_percent,credit_hour:c.credit_hour,pass_percent:c.pass_percent,updated_at:new Date().toISOString()}));
    if(rows.length){const {error:ue}=await sb.from("exam_component_settings").upsert(rows,{onConflict:"exam_id,component_id"});if(ue)throw ue;}
    toast("Current master defaults copied to this examination only.");await v12LoadTermSetup();
  }catch(e){console.error(e);toast(errMsg(e));}
}

async function v12CopyPreviousTermSetup(){
  const targetId=num($("#v12TermExam")?.value),cls=$("#subjectClass")?.value||"",subjectId=num(state.v5SubjectId);if(!targetId||!subjectId)return;
  try{
    const lock=await v12ResultLock(targetId,cls);if(lock.locked)return toast(`${lock.status}: this term setup is locked.`);
    const exams=await examOptions(),idx=exams.findIndex(e=>num(e.id)===targetId);if(idx<=0)return toast("No previous examination is available to copy.");
    const prev=exams[idx-1];
    const {data:sub,error:se}=await sb.from("subjects").select("components(id)").eq("id",subjectId).single();if(se)throw se;const compIds=(sub?.components||[]).map(c=>num(c.id));if(!compIds.length)return toast("This subject has no components.");
    const {data:source,error}=await sb.from("exam_component_settings").select("component_id,full_marks,weight_percent,credit_hour,pass_percent").eq("exam_id",prev.id).in("component_id",compIds);if(error)throw error;if(!(source||[]).length)return toast(`No saved setup was found in ${prev.name}.`);
    if(!confirm(`Copy ${prev.name} Full Marks setup into the selected examination for this subject?`))return;
    const rows=source.map(x=>({exam_id:targetId,component_id:x.component_id,full_marks:x.full_marks,weight_percent:x.weight_percent,credit_hour:x.credit_hour,pass_percent:x.pass_percent,updated_at:new Date().toISOString()}));
    const {error:ue}=await sb.from("exam_component_settings").upsert(rows,{onConflict:"exam_id,component_id"});if(ue)throw ue;
    toast(`${prev.name} setup copied to this examination.`);await v12LoadTermSetup();
  }catch(e){console.error(e);toast(errMsg(e));}
}

const v12BaseRenderSubjects=renderSubjects;
const v12BaseLoadSubjectSetup=v5LoadSubjectSetup;
renderSubjects=async function(){await v12BaseRenderSubjects();await v12InjectTermSetupPanel();await v12LoadTermSetup();};
v5LoadSubjectSetup=async function(){await v12BaseLoadSubjectSetup();if($("#v12TermSetupPanel"))await v12LoadTermSetup();};

/* Subject dialog now clearly separates reusable defaults from actual term setup. */
async function subjectDialog(id=null){
  const cls=$("#subjectClass")?.value||"Class 1";let subject=null,components=[];
  if(id){const {data,error}=await sb.from("subjects").select("*,components(*)").eq("id",id).single();if(error)return toast(errMsg(error));subject=data;components=(data.components||[]);}
  const byCode=new Map(components.map(c=>[String(c.code||"").toUpperCase(),c])),inc=byCode.get("IN")||byCode.get("INTERNAL")||{},th=byCode.get("TH")||byCode.get("THEORY")||{};
  openModal("Subject Setup",`<form id="v5SubjectForm" class="form-grid"><div class="field full"><label>Class Teacher</label><input name="teacher" value="${esc($("#classTeacherInput")?.value||"")}"></div><div class="field full"><label>Subject Name</label><input name="name" value="${esc(subject?.name||"")}" required></div><div class="full" style="background:#EAF1FF;color:var(--navy2);font-weight:600;padding:7px 8px">MASTER DEFAULTS FOR NEW EXAMINATIONS</div><div class="field"><label>Default Internal Full Marks</label><input name="in_fm" type="number" step="0.001" min="0.001" value="${inc.full_marks??50}"></div><div class="field"><label>Internal Weight %</label><input name="in_wt" type="number" step="0.001" value="${inc.weight_percent??50}"></div><div class="field"><label>Internal Credit Hour</label><input name="in_ch" type="number" step="0.001" value="${inc.credit_hour??2}"></div><div class="field"><label>Default Theory Full Marks</label><input name="th_fm" type="number" step="0.001" min="0.001" value="${th.full_marks??50}"></div><div class="field"><label>Theory Weight %</label><input name="th_wt" type="number" step="0.001" value="${th.weight_percent??50}"></div><div class="field"><label>Theory Credit Hour</label><input name="th_ch" type="number" step="0.001" value="${th.credit_hour??2}"></div><div class="info full"><strong>Important:</strong> These are reusable master defaults. Use <b>Term-wise Assessment / Full Marks</b> below Subject Setup to set the actual First/Second/Third/Final Term values. Full Marks is not limited to 100.</div><div class="form-actions full"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">SAVE SUBJECT DEFAULTS</button></div></form>`);
  $("#v5SubjectForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));try{const inFm=Number(f.in_fm),thFm=Number(f.th_fm);if(!Number.isFinite(inFm)||inFm<=0||!Number.isFinite(thFm)||thFm<=0)return toast("Default Full Marks must be positive. It is not limited to 100.");const p={academic_year_id:state.yearId,class_name:cls,name:f.name.trim().toUpperCase(),sort_order:subject?.sort_order||1,active:true};let sid=id;if(id){const {error}=await sb.from("subjects").update(p).eq("id",id);if(error)throw error;}else{const {data,error}=await sb.from("subjects").insert({...p,credit_hour:0}).select("id").single();if(error)throw error;sid=data.id;}await sb.from("class_settings").upsert({academic_year_id:state.yearId,class_name:cls,class_teacher:f.teacher.trim()},{onConflict:"academic_year_id,class_name"});const defs=[{code:"IN",label:"INTERNAL",full_marks:inFm,weight_percent:num(f.in_wt),credit_hour:num(f.in_ch),pass_percent:40,sort_order:1},{code:"TH",label:"THEORY",full_marks:thFm,weight_percent:num(f.th_wt),credit_hour:num(f.th_ch),pass_percent:35,sort_order:2}];for(const d of defs){const old=components.find(c=>String(c.code||"").toUpperCase()===d.code);const res=old?await sb.from("components").update(d).eq("id",old.id):await sb.from("components").insert({subject_id:sid,...d});if(res.error)throw res.error;}closeModal();toast("Subject master defaults saved. Set actual term FM in Term-wise Assessment Setup.");state.v5SubjectId=sid;await v5LoadSubjectSetup();}catch(err){toast(errMsg(err));}};
}

async function componentDialog(subjectId,id=null){
  let r={code:"",label:"",full_marks:100,weight_percent:"",credit_hour:1,pass_percent:0,sort_order:1};if(id){const {data,error}=await sb.from("components").select("*").eq("id",id).single();if(error)return toast(errMsg(error));r=data;}
  openModal(id?"Edit Component Default":"Add Component Default",`<form id="componentForm" class="form-grid three"><div class="field"><label>Code</label><input name="code" value="${esc(r.code)}" placeholder="IN / TH / PR" required></div><div class="field"><label>Label</label><input name="label" value="${esc(r.label)}" required></div><div class="field"><label>Default Full Marks</label><input name="full_marks" type="number" step="0.001" min="0.001" value="${num(r.full_marks)}" required></div><div class="field"><label>Weight %</label><input name="weight_percent" type="number" step="0.001" value="${r.weight_percent??""}"></div><div class="field"><label>Credit Hour</label><input name="credit_hour" type="number" step="0.001" min="0" value="${r.credit_hour??""}"></div><div class="field"><label>Pass %</label><input name="pass_percent" type="number" step="0.001" min="0" max="100" value="${r.pass_percent??""}"></div><div class="field"><label>Sort Order</label><input name="sort_order" type="number" value="${num(r.sort_order)||1}"></div><div class="info full">This Full Marks is a master default for new examination snapshots. Actual term value is edited in Term-wise Assessment Setup.</div><div class="form-actions full"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">Save Default</button></div></form>`);
  $("#componentForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget)),fm=Number(f.full_marks);if(!Number.isFinite(fm)||fm<=0)return toast("Full Marks must be positive. It is not limited to 100.");const p={subject_id:subjectId,code:f.code.trim().toUpperCase(),label:f.label.trim().toUpperCase(),full_marks:fm,weight_percent:f.weight_percent===""?null:num(f.weight_percent),credit_hour:f.credit_hour===""?null:num(f.credit_hour),pass_percent:f.pass_percent===""?null:num(f.pass_percent),sort_order:num(f.sort_order)};const res=id?await sb.from("components").update(p).eq("id",id):await sb.from("components").insert(p);if(res.error)return toast(errMsg(res.error));closeModal();toast("Component master default saved.");state.v5SubjectId=subjectId;state.v5ComponentId=id||null;await v5LoadSubjectSetup();};
}

/* Marks Entry: load only the selected examination's snapshotted components/FMs. */
async function loadSelectedMarksSheets(){
  const examId=num($("#markExam")?.value),cls=$("#markClass")?.value||"",subjectIds=_v4SelectedSubjectIds();
  if(!examId)return toast("Select examination.");const area=$("#marksArea");
  if(!subjectIds.length){state.marksContexts={};area.innerHTML=`<div class="empty">Select one or more subjects above. The student list will remain fixed on the left.</div>`;return;}
  area.innerHTML=`<div class="empty">Loading term-specific marks-entry table…</div>`;
  try{
    const [{data:students,error:e1},subjects]=await Promise.all([
      sb.from("students").select("id,roll_no,name,symbol_no,registration_no").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("roll_no").order("name"),
      v12EffectiveSubjects(examId,cls,subjectIds)
    ]);if(e1)throw e1;
    const rows=_studentRowsSorted(students);if(!rows.length){area.innerHTML=`<div class="empty">No active students in ${esc(cls)}. Add/import students first.</div>`;return;}
    const order=new Map(subjectIds.map((id,i)=>[id,i])),subs=(subjects||[]).sort((a,b)=>(order.get(num(a.id))??999)-(order.get(num(b.id))??999));
    const compIds=subs.flatMap(s=>(s.components||[]).map(c=>c.id));let marks=[];
    if(compIds.length){const {data,error:e3}=await sb.from("marks").select("student_id,component_id,obtained_mark,status").eq("exam_id",examId).in("student_id",rows.map(x=>x.id)).in("component_id",compIds);if(e3)throw e3;marks=data||[];}
    const mMap=new Map(marks.map(m=>[`${m.student_id}_${m.component_id}`,m]));state.marksContexts={};subs.forEach(s=>{const comps=(s.components||[]).slice().sort((a,b)=>num(a.sort_order)-num(b.sort_order)||num(a.id)-num(b.id));state.marksContexts[num(s.id)]={examId,cls,subjectId:num(s.id),subject:s,components:comps,students:rows};});
    const conflicts=[];for(const st of rows)for(const sub of subs)for(const c of (sub.components||[])){const m=mMap.get(`${st.id}_${c.id}`);if(v27SavedMarkOverFull(m,c.full_marks))conflicts.push({student_id:st.id,roll_no:st.roll_no,name:st.name,active:true,subject_name:sub.name,component_id:c.id,component_code:c.code,component_label:c.label||c.code,full_marks:num(c.full_marks),obtained_mark:Number(m.obtained_mark)});}
    const groupHeaders=subs.map(s=>{const comps=s.components||[],span=comps.length?1+comps.length*2:1;return `<th class="subject-group-head" colspan="${span}">${esc(s.name)}</th>`;}).join(""),subHeaders=subs.map(_v4SubjectHeaderCells).join("");
    area.innerHTML=`${v27ConflictHtml(conflicts,"Saved marks above this Term's Full Marks — red cells need correction")}<div class="marks-v4-statusbar"><div><b>${esc(cls)}</b> • ${rows.length} student(s) • ${subs.length} subject(s) • <b>Term-specific Full Marks</b></div><button class="btn green big" id="saveAllMatrixMarks">SAVE MARKS</button></div><div class="marks-v4-matrix-wrap"><table class="marks-v4-matrix"><thead><tr class="group-row"><th class="fixed-col select-col" rowspan="2"><input id="markAllStudents" type="checkbox" checked></th><th class="fixed-col sn-col" rowspan="2">S.N</th><th class="fixed-col name-col" rowspan="2">Student Name</th><th class="fixed-col reg-col" rowspan="2">IEMIS ID</th><th class="fixed-col symbol-col" rowspan="2">Symbol No.</th>${groupHeaders}</tr><tr class="sub-row">${subHeaders}</tr></thead><tbody>${rows.map((st,ri)=>`<tr data-matrix-row="${ri}" class="${v27StudentHasConflict(st,subs,mMap)?"v27-student-conflict-row":""}"><td class="fixed-col select-col"><input class="mark-student-select" data-row="${ri}" type="checkbox" checked></td><td class="fixed-col sn-col">${ri+1}</td><td class="fixed-col name-col ${v27StudentHasConflict(st,subs,mMap)?"v27-student-conflict":""}"><strong>${esc(st.name||"")}${v27StudentHasConflict(st,subs,mMap)?' <span class="v27-warning">⚠</span>':""}</strong></td><td class="fixed-col reg-col">${esc(st.registration_no||"")}</td><td class="fixed-col symbol-col"><strong>${esc(st.symbol_no||"")}</strong></td>${subs.map(s=>_v4SubjectBodyCells(s,st,ri,mMap)).join("")}</tr>`).join("")}</tbody></table></div><div class="marks-v4-bottom-actions"><button class="btn green big" onclick="saveAllSelectedMarks()">SAVE MARKS</button></div>`;
    $("#markAllStudents").onchange=e=>_v4SetAllStudents(e.currentTarget.checked);$$('.mark-student-select').forEach(cb=>cb.onchange=_v4UpdateAllStudentsCheckbox);$$('.subject-absent').forEach(cb=>cb.onchange=()=>_v4SubjectAbsentToggle(num(cb.dataset.subject),num(cb.dataset.row),cb.checked));$$('.mark-input').forEach(el=>{el.oninput=()=>{const abs=document.querySelector(`.subject-absent[data-subject="${el.dataset.subject}"][data-row="${el.dataset.row}"]`);if(abs?.checked&&!['ABS','AB','A','ABSENT'].includes(el.value.trim().toUpperCase())){abs.checked=false;$$(`.mark-input[data-subject="${el.dataset.subject}"][data-row="${el.dataset.row}"]`).forEach(x=>x.disabled=false);}_markCellValidate(el);};el.onpaste=_v4HandleMarksPaste;});$("#saveAllMatrixMarks").onclick=saveAllSelectedMarks;
  }catch(e){
    console.error(e);
    if(/Full Marks cannot be lower than an already saved obtained mark/i.test(errMsg(e))){
      try{const conflicts=await v27FindFullMarkConflicts(examId,cls);if(conflicts.length){area.innerHTML=`${v27ConflictHtml(conflicts,"These saved marks are blocking this Term's Full Marks setup")}<div class="notice"><strong>What to do:</strong> Note the red student/mark above. Increase the Term Full Marks or correct that student's saved obtained mark, then reload Marks Entry.</div>`;return;}}catch(diagErr){console.error(diagErr);}
    }
    if(/Full Marks cannot be lower than an already saved obtained mark/i.test(errMsg(e))){
      area.innerHTML=`<div class="danger"><strong>Full Marks conflict detected, but the student row could not be resolved automatically.</strong><br>The conflict is inside this examination and one of the selected subject components. v30 could not resolve the row in the normal table. Use the Deep Conflict Trace shown above (Mark ID / Student ID / Subject ID / Component ID) to correct the exact saved record; do not temporarily raise Full Marks.</div>`;
      return;
    }
    area.innerHTML=`<div class="danger">${esc(errMsg(e))}</div>`;
  }
}
async function loadMarksSheet(){return loadSelectedMarksSheets();}

/* Result calculation: actual OM / actual term FM × 100. */
async function calculateClassResults(examId,cls){
  const [{data:students,error:e1},subjects,{data:marks,error:e3}]=await Promise.all([
    sb.from("students").select("*").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("roll_no").order("name"),
    v12EffectiveSubjects(examId,cls,null),
    sb.from("marks").select("*").eq("exam_id",examId)
  ]);if(e1)throw e1;if(e3)throw e3;
  const m=new Map((marks||[]).map(x=>[`${x.student_id}_${x.component_id}`,x])),results=[];
  for(const st of _studentRowsSorted(students)){let incomplete=false,anyNg=false,totalCredit=0,totalWgp=0;const subs=[];
    for(const sub of subjects||[]){const comps=(sub.components||[]).sort((a,b)=>num(a.sort_order)-num(b.sort_order)),out=[];if(!comps.length)continue;
      for(const c of comps){const mr=m.get(`${st.id}_${c.id}`);let status=mr?.status||"MISSING",obt=mr?.obtained_mark,percent=null,g={grade:"-",grade_point:null,is_ng:false};if(status==="MISSING")incomplete=true;else{percent=status==="ABS"?0:(num(obt)/num(c.full_marks)*100);g=gradeForPercent(percent,c.pass_percent);if(g.is_ng)anyNg=true;}out.push({...c,status,obtained_mark:obt,percent,...g,wgp:g.grade_point==null?null:num(c.credit_hour)*g.grade_point});}
      const credit=out.reduce((a,c)=>a+num(c.credit_hour),0),missing=out.some(c=>c.status==="MISSING"),ng=out.some(c=>c.is_ng);let finalGrade="-",gp=null,wgp=null;if(missing||credit<=0){incomplete=true;}else{totalCredit+=credit;if(ng){finalGrade="NG";}else{wgp=out.reduce((a,c)=>a+num(c.wgp),0);gp=wgp/credit;finalGrade=finalGradeForSubjectGP(gp);totalWgp+=wgp;}}subs.push({...sub,components:out,credit_hour:credit,final_grade:finalGrade,final_grade_point:gp,wgp,is_ng:ng});}
    let gpa=null,status="INCOMPLETE";if(!incomplete&&totalCredit>0){if(anyNg){gpa=0;status="NG";}else{gpa=Math.round((totalWgp/totalCredit+1e-12)*100)/100;status="PASS";}}results.push({student:st,subjects:subs,total_credit:totalCredit,total_wgp:totalWgp,gpa,gpa_display:gpa==null?"-":gpa.toFixed(2),status,incomplete,has_ng:anyNg});
  }
  return results;
}

async function _allClassComponents(cls,examId=null){
  const eid=num(examId||$("#v7MkExam")?.value||$("#markExam")?.value||state.selectedExamId);if(!eid){const {data,error}=await sb.from("subjects").select("id,name,sort_order,components(*)").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("sort_order").order("id");if(error)throw error;const out=[];for(const s of data||[])for(const c of (s.components||[]).sort((a,b)=>num(a.sort_order)-num(b.sort_order)))out.push({...c,subject_id:s.id,subject_name:s.name});return out;}
  const subs=await v12EffectiveSubjects(eid,cls,null),out=[];for(const s of subs)for(const c of s.components||[])out.push({...c,subject_id:s.id,subject_name:s.name});return out;
}

async function v8ClassCompletion(examId,cls){
  const [{data:students,error:e1},subjects,{data:marks,error:e3}]=await Promise.all([
    sb.from("students").select("id").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true),
    v12EffectiveSubjects(examId,cls,null),
    sb.from("marks").select("student_id,component_id").eq("exam_id",examId)
  ]);if(e1)throw e1;if(e3)throw e3;
  const studentIds=new Set((students||[]).map(x=>num(x.id))),componentIds=new Set((subjects||[]).flatMap(s=>(s.components||[]).map(c=>num(c.id)))),expected=studentIds.size*componentIds.size;let entered=0;for(const m of marks||[])if(studentIds.has(num(m.student_id))&&componentIds.has(num(m.component_id)))entered++;const percent=expected?Math.round((entered/expected*100+Number.EPSILON)*10)/10:0;return {entered,expected,percent};
}

/* v12 complete backup includes term-specific assessment snapshots. */
async function renderBackup(){
  $("#content").innerHTML=`<div class="section"><div class="section-title"><div><h3>Online Data Backup / Restore</h3><p>Create a complete Marks/Result JSON backup, including term-wise Full Marks snapshots.</p></div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn green" onclick="v5CreateBackup()">Create Backup Now</button><button class="btn primary" onclick="v11ChooseRestoreBackup()">Restore Backup</button><input id="v11RestoreFile" type="file" accept=".json,application/json" class="hidden"></div><div class="info" style="margin-top:14px"><strong>v12 backup:</strong> Academic years, exams, students, subjects, marks, results and each examination's Full Marks setup are included. Old v11 backups are still supported.</div></div>`;const f=$("#v11RestoreFile");if(f)f.onchange=e=>v11RestoreBackupFile(e.currentTarget);
}
async function v5CreateBackup(){
  const tables=["settings","academic_years","exams","result_publications","students","subjects","class_settings","components","exam_component_settings","marks","grading_scale","import_profiles","import_logs"],out={backup_version:3,created_at:new Date().toISOString(),project:"staugustine-marks-result",tables:{}};
  for(const t of tables){const {data,error}=await sb.from(t).select("*");if(error)return toast(`${t}: ${errMsg(error)}`);out.tables[t]=data||[];}
  const blob=new Blob([JSON.stringify(out,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`StAugustine_Marks_Backup_${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);toast("Complete v12 backup downloaded successfully.");
}
async function v11RestoreBackupFile(input){
  const file=input?.files?.[0];if(!file)return;let backup;try{backup=JSON.parse(await file.text());}catch(_e){input.value="";return toast("Invalid backup file: JSON could not be read.");}
  const required=["settings","academic_years","exams","result_publications","students","subjects","class_settings","components","marks","grading_scale","import_profiles","import_logs"];
  if(backup?.project!=="staugustine-marks-result"||!backup?.tables){input.value="";return toast("This is not a St. Augustine Marks backup file.");}const missing=required.filter(t=>!Array.isArray(backup.tables[t]));if(missing.length){input.value="";return toast(`Backup is incomplete: ${missing.join(", ")}`);}const c=backup.tables,termCount=Array.isArray(c.exam_component_settings)?c.exam_component_settings.length:"legacy backup — will rebuild term snapshots";
  const summary=`Backup date: ${backup.created_at||"Unknown"}\nAcademic years: ${c.academic_years.length}\nStudents: ${c.students.length}\nExams: ${c.exams.length}\nSubjects: ${c.subjects.length}\nMarks: ${c.marks.length}\nTerm Full Marks snapshots: ${termCount}\n\nRESTORE WILL REPLACE THE CURRENT MARKS/RESULT DATA.\nType RESTORE to continue.`;
  const typed=prompt(summary,"");if(typed!=="RESTORE"){input.value="";return toast("Restore cancelled.");}if(!confirm("Final confirmation: restore this backup now? Current Marks/Result data will be replaced.")){input.value="";return toast("Restore cancelled.");}toast("Restoring backup… do not close this tab.");
  try{const {data,error}=await sb.rpc("restore_marks_backup_atomic",{p_backup:backup});if(error)throw error;state.yearId=null;await loadFoundation();await navigate("dashboard");toast(`Restore complete. ${data?.students??c.students.length} students and ${data?.marks??c.marks.length} marks restored.`);}catch(e){console.error(e);const m=errMsg(e);if(m.toLowerCase().includes("restore_marks_backup_atomic"))toast("Restore support SQL is not installed. Run MARKS_WORKFLOW_V15_SQL.sql once in the Marks Supabase project.");else toast(`Restore failed: ${m}`);}finally{input.value="";}
}

Object.assign(window,{renderSubjects,v5LoadSubjectSetup,subjectDialog,componentDialog,v12LoadTermSetup,v12SaveTermSetup,v12CopyPreviousTermSetup,v12ApplyMasterDefaults,loadSelectedMarksSheets,loadMarksSheet,calculateClassResults,_allClassComponents,v8ClassCompletion,renderBackup,v5CreateBackup,v11RestoreBackupFile});

/* ============================================================
   v14 — SUBJECT DISPLAY ORDER + LARGER RESULT TEXT
   ------------------------------------------------------------
   Subject order is explicitly controlled by sort_order.
   The same order flows to Subject Setup, Marks Entry, Results,
   Excel exports and Bulk PDF through the shared ordered queries.
   ============================================================ */

async function v14OrderedSubjects(cls){
  const {data,error}=await sb.from("subjects").select("id,name,sort_order,credit_hour,active,components(*)")
    .eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true)
    .order("sort_order").order("id");
  if(error)throw error;
  return data||[];
}

async function v14SetSubjectPosition(subjectId,cls,desiredOrder){
  const rows=await v14OrderedSubjects(cls);
  const target=rows.find(r=>num(r.id)===num(subjectId));
  if(!target)return;
  const rest=rows.filter(r=>num(r.id)!==num(subjectId));
  const wanted=Math.max(1,Math.min(rows.length,Math.trunc(Number(desiredOrder))||1));
  rest.splice(wanted-1,0,target);
  for(let i=0;i<rest.length;i++){
    const next=i+1;
    if(num(rest[i].sort_order)!==next){
      const {error}=await sb.from("subjects").update({sort_order:next}).eq("id",rest[i].id);
      if(error)throw error;
    }
  }
}

async function v14MoveSubject(subjectId,direction){
  try{
    const cls=$("#subjectClass")?.value||"";
    const rows=await v14OrderedSubjects(cls);
    const index=rows.findIndex(r=>num(r.id)===num(subjectId));
    if(index<0)return;
    const next=index+Number(direction||0);
    if(next<0||next>=rows.length)return;
    await v14SetSubjectPosition(subjectId,cls,next+1);
    state.v5SubjectId=num(subjectId);
    await v5LoadSubjectSetup();
    toast(`Subject moved to order ${next+1}.`);
  }catch(e){console.error(e);toast(errMsg(e));}
}

v5LoadSubjectSetup=async function(){
  const cls=$("#subjectClass")?.value||"Class 1";
  const [{data:cfg,error:ce},list]=await Promise.all([
    sb.from("class_settings").select("*").eq("academic_year_id",state.yearId).eq("class_name",cls).maybeSingle(),
    v14OrderedSubjects(cls)
  ]);
  if(ce)throw ce;
  if($("#classTeacherInput"))$("#classTeacherInput").value=cfg?.class_teacher||"";
  if(!list.find(x=>num(x.id)===num(state.v5SubjectId)))state.v5SubjectId=list[0]?.id||null;
  const host=$("#subjectList");
  if(host)host.innerHTML=`<div class="table-wrap"><table><thead><tr><th class="center" style="width:80px">Order</th><th>Subject</th><th class="center">Total Credit Hour</th><th class="center" style="width:120px">Move</th></tr></thead><tbody>${list.map(s=>`<tr class="${num(s.id)===num(state.v5SubjectId)?"subject-row-selected":""}" data-sid="${s.id}" style="cursor:pointer"><td class="center"><strong>${num(s.sort_order)}</strong></td><td>${esc(s.name)}</td><td class="center">${creditFmt(s.credit_hour)}</td><td class="center"><button type="button" class="btn small" title="Move up" onclick="event.stopPropagation();v14MoveSubject(${s.id},-1)">↑</button> <button type="button" class="btn small" title="Move down" onclick="event.stopPropagation();v14MoveSubject(${s.id},1)">↓</button></td></tr>`).join("")}</tbody></table></div>`;
  $$("#subjectList tr[data-sid]").forEach(r=>r.onclick=()=>{state.v5SubjectId=num(r.dataset.sid);state.v5ComponentId=null;v5LoadSubjectSetup();});
  const sub=list.find(x=>num(x.id)===num(state.v5SubjectId));
  const comps=(sub?.components||[]).slice().sort((a,b)=>num(a.sort_order)-num(b.sort_order)||num(a.id)-num(b.id));
  if(!comps.find(x=>num(x.id)===num(state.v5ComponentId)))state.v5ComponentId=comps[0]?.id||null;
  const compHost=$("#componentList");
  if(compHost)compHost.innerHTML=sub?`<div class="table-wrap"><table><thead><tr><th>Code</th><th>Label</th><th class="center">Full Marks</th><th class="center">Weight %</th><th class="center">Credit Hour</th><th class="center">Pass %</th></tr></thead><tbody>${comps.map(c=>`<tr class="${num(c.id)===num(state.v5ComponentId)?"subject-row-selected":""}" data-cid="${c.id}" style="cursor:pointer"><td>${esc(c.code)}</td><td>${esc(c.label)}</td><td class="center">${num(c.full_marks)}</td><td class="center">${c.weight_percent??""}</td><td class="center">${c.credit_hour??""}</td><td class="center">${c.pass_percent??""}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Select or add a subject.</div>`;
  $$("#componentList tr[data-cid]").forEach(r=>r.onclick=()=>{state.v5ComponentId=num(r.dataset.cid);v5LoadSubjectSetup();});
  if($("#v12TermSetupPanel"))await v12LoadTermSetup();
};

subjectDialog=async function(id=null){
  const cls=$("#subjectClass")?.value||"Class 1";
  let subject=null,components=[],defaultOrder=1;
  if(id){
    const {data,error}=await sb.from("subjects").select("*,components(*)").eq("id",id).single();
    if(error)return toast(errMsg(error));
    subject=data;components=(data.components||[]);defaultOrder=Math.max(1,Math.trunc(num(subject.sort_order))||1);
  }else{
    try{const rows=await v14OrderedSubjects(cls);defaultOrder=rows.length+1;}catch(_e){defaultOrder=1;}
  }
  const byCode=new Map(components.map(c=>[String(c.code||"").toUpperCase(),c]));
  const inc=byCode.get("IN")||byCode.get("INTERNAL")||{},th=byCode.get("TH")||byCode.get("THEORY")||{};
  openModal(id?"Edit Subject":"Add Subject",`<form id="v5SubjectForm" class="form-grid"><div class="field full"><label>Class Teacher</label><input name="teacher" value="${esc($("#classTeacherInput")?.value||"")}"></div><div class="field"><label>Subject Name</label><input name="name" value="${esc(subject?.name||"")}" required></div><div class="field"><label>Display Order</label><input name="sort_order" type="number" min="1" step="1" value="${defaultOrder}" required><small>1 = first subject, 2 = second, 3 = third…</small></div><div class="full" style="background:#EAF1FF;color:var(--navy2);font-weight:600;padding:7px 8px">MASTER DEFAULTS FOR NEW EXAMINATIONS</div><div class="field"><label>Default Internal Full Marks</label><input name="in_fm" type="number" step="0.001" min="0.001" value="${inc.full_marks??50}"></div><div class="field"><label>Internal Weight %</label><input name="in_wt" type="number" step="0.001" value="${inc.weight_percent??50}"></div><div class="field"><label>Internal Credit Hour</label><input name="in_ch" type="number" step="0.001" value="${inc.credit_hour??2}"></div><div class="field"><label>Default Theory Full Marks</label><input name="th_fm" type="number" step="0.001" min="0.001" value="${th.full_marks??50}"></div><div class="field"><label>Theory Weight %</label><input name="th_wt" type="number" step="0.001" value="${th.weight_percent??50}"></div><div class="field"><label>Theory Credit Hour</label><input name="th_ch" type="number" step="0.001" value="${th.credit_hour??2}"></div><div class="info full"><strong>Order:</strong> This same subject order is used in Marks Entry, Result/Grade Sheet, Excel and Bulk PDF. <strong>Term values:</strong> Use Term-wise Assessment Setup for the actual examination Full Marks / Pass % / Credit Hour / Weight %.</div><div class="form-actions full"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">SAVE SUBJECT</button></div></form>`);
  $("#v5SubjectForm").onsubmit=async e=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));
    try{
      const inFm=Number(f.in_fm),thFm=Number(f.th_fm),desired=Math.max(1,Math.trunc(Number(f.sort_order))||1);
      if(!Number.isFinite(inFm)||inFm<=0||!Number.isFinite(thFm)||thFm<=0)return toast("Default Full Marks must be positive. It is not limited to 100.");
      const p={academic_year_id:state.yearId,class_name:cls,name:f.name.trim().toUpperCase(),sort_order:desired,active:true};
      let sid=id;
      if(id){const {error}=await sb.from("subjects").update(p).eq("id",id);if(error)throw error;}
      else{const {data,error}=await sb.from("subjects").insert({...p,credit_hour:0}).select("id").single();if(error)throw error;sid=data.id;}
      await sb.from("class_settings").upsert({academic_year_id:state.yearId,class_name:cls,class_teacher:f.teacher.trim()},{onConflict:"academic_year_id,class_name"});
      const defs=[{code:"IN",label:"INTERNAL",full_marks:inFm,weight_percent:num(f.in_wt),credit_hour:num(f.in_ch),pass_percent:40,sort_order:1},{code:"TH",label:"THEORY",full_marks:thFm,weight_percent:num(f.th_wt),credit_hour:num(f.th_ch),pass_percent:35,sort_order:2}];
      for(const d of defs){const old=components.find(c=>String(c.code||"").toUpperCase()===d.code);const res=old?await sb.from("components").update(d).eq("id",old.id):await sb.from("components").insert({subject_id:sid,...d});if(res.error)throw res.error;}
      await v14SetSubjectPosition(sid,cls,desired);
      closeModal();state.v5SubjectId=sid;toast(`Subject saved at display order ${desired}.`);await v5LoadSubjectSetup();
    }catch(err){console.error(err);toast(errMsg(err));}
  };
};

loadMarkSubjects=async function(){
  const cls=$("#markClass")?.value||"";
  const {data,error}=await sb.from("subjects").select("id,name,sort_order").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("sort_order").order("id");
  if(error)return toast(errMsg(error));
  const host=$("#markSubjectPicker");if(!host)return;
  host.innerHTML=`<label><input id="markAllSubjects" type="checkbox"> All</label>${(data||[]).map(s=>`<label><input class="mark-subject-choice" type="checkbox" value="${s.id}"> ${esc(s.name)}</label>`).join("")}`;
  $("#markAllSubjects").onchange=e=>{$$(".mark-subject-choice").forEach(x=>x.checked=e.currentTarget.checked)};
  if(!(data||[]).length&&$("#marksArea"))$("#marksArea").innerHTML=`<div class="empty">No active subjects for ${esc(cls)}. Add subjects/components in Subject & Credit Setup first.</div>`;
};

Object.assign(window,{v14MoveSubject,v5LoadSubjectSetup,subjectDialog,loadMarkSubjects});


/* ============================================================
   v15 — SIMPLE SUBJECTS + CLASS CREDIT DEFAULTS + TERM MARKS
   ------------------------------------------------------------
   User workflow:
   1) Subjects: name + display order only (class-wise).
   2) Credit Hour / Default Setup: class-wise Internal + Exam CH.
   3) Marks Entry: Exam/Term + Class + Subject, enter the two Full
      Marks once; they apply to every student for that subject/term.
      Term-specific CH is prefilled from defaults and remains editable.
   4) Percentage = OM / FM * 100; existing editable grading scale
      supplies Grade + Grade Point. WGP = CH * GP and
      GPA = Total WGP / Total Credit Hour.
   ============================================================ */

function v15ComponentRole(c){
  const code=String(c?.code||"").trim().toUpperCase();
  const label=String(c?.label||"").trim().toUpperCase();
  if(["IN","INT","INTERNAL","EVALUATION"].includes(code)||/INTERNAL|EVALUATION/.test(label))return "internal";
  if(["TH","THEORY","EX","EXAM","EXAMINATION"].includes(code)||/THEORY|EXAM/.test(label))return "exam";
  return "other";
}
function v15RoleComponents(components){
  const all=(components||[]).slice().sort((a,b)=>num(a.sort_order)-num(b.sort_order)||num(a.id)-num(b.id));
  return {
    internal:all.find(c=>v15ComponentRole(c)==="internal")||null,
    exam:all.find(c=>v15ComponentRole(c)==="exam")||null
  };
}
async function v15OrderedClassSubjects(cls,{withComponents=true}={}){
  const select=withComponents?"id,name,sort_order,credit_hour,active,components(*)":"id,name,sort_order,credit_hour,active";
  const {data,error}=await sb.from("subjects").select(select)
    .eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true)
    .order("sort_order").order("id");
  if(error)throw error;return data||[];
}
async function v15EnsureSubjectRoles(subjectId){
  const {data,error}=await sb.from("components").select("*").eq("subject_id",subjectId).order("sort_order").order("id");
  if(error)throw error;
  const roles=v15RoleComponents(data||[]),created=[];
  if(!roles.internal){
    const {data:r,error:e}=await sb.from("components").insert({subject_id:subjectId,code:"IN",label:"INTERNAL",full_marks:100,weight_percent:50,credit_hour:2,pass_percent:40,sort_order:1}).select("*").single();
    if(e)throw e;created.push(r);
  }
  if(!roles.exam){
    const {data:r,error:e}=await sb.from("components").insert({subject_id:subjectId,code:"TH",label:"EXAM / THEORY",full_marks:100,weight_percent:50,credit_hour:2,pass_percent:35,sort_order:2}).select("*").single();
    if(e)throw e;created.push(r);
  }
  if(created.length){
    const {data:again,error:ae}=await sb.from("components").select("*").eq("subject_id",subjectId).order("sort_order").order("id");
    if(ae)throw ae;return v15RoleComponents(again||[]);
  }
  return roles;
}
async function v15SetSubjectPosition(subjectId,cls,desiredOrder){
  const rows=await v15OrderedClassSubjects(cls,{withComponents:false});
  const target=rows.find(r=>num(r.id)===num(subjectId));if(!target)return;
  const rest=rows.filter(r=>num(r.id)!==num(subjectId));
  const wanted=Math.max(1,Math.min(rows.length,Math.trunc(Number(desiredOrder))||1));
  rest.splice(wanted-1,0,target);
  for(let i=0;i<rest.length;i++){
    const order=i+1;
    if(num(rest[i].sort_order)!==order){const {error}=await sb.from("subjects").update({sort_order:order}).eq("id",rest[i].id);if(error)throw error;}
  }
}
async function v15MoveSubject(subjectId,direction){
  try{
    const cls=$("#subjectClass")?.value||"Class 1",rows=await v15OrderedClassSubjects(cls,{withComponents:false});
    const idx=rows.findIndex(r=>num(r.id)===num(subjectId)),next=idx+Number(direction||0);
    if(idx<0||next<0||next>=rows.length)return;
    await v15SetSubjectPosition(subjectId,cls,next+1);state.v5SubjectId=num(subjectId);await v15LoadSubjectAndCreditSetup();
  }catch(e){console.error(e);toast(errMsg(e));}
}
function v15CreditTotalRefresh(){
  let total=0;
  $$('tr[data-v15-credit-subject]').forEach(tr=>{
    const a=Number(tr.querySelector('.v15-in-ch')?.value||0),b=Number(tr.querySelector('.v15-ex-ch')?.value||0),sum=(Number.isFinite(a)?a:0)+(Number.isFinite(b)?b:0);
    const cell=tr.querySelector('.v15-sub-total');if(cell)cell.textContent=creditFmt(sum);total+=sum;
  });
  const totalCell=$("#v15CreditGrandTotal");if(totalCell)totalCell.textContent=creditFmt(total);
}

renderSubjects=async function(){
  $("#content").innerHTML=`
    <div class="section">
      <div class="section-title"><div><h3>Subjects</h3><p>Only Subject Name and Display Order are managed here. The same order is used in Marks Entry, Results, Grade Sheets, Excel and Bulk PDF.</p></div></div>
      <div class="toolbar" style="align-items:flex-end;flex-wrap:wrap">
        <div class="field"><label>Class</label><select id="subjectClass">${classOptions("Class 1")}</select></div>
        <div class="field grow" style="max-width:280px"><label>Class Teacher</label><input id="classTeacherInput"></div>
        <button class="btn" id="saveTeacherBtn">Save Teacher</button>
        <button class="btn primary" id="addSubjectBtn">+ Subject</button>
      </div>
      <div id="v15SubjectTable" style="margin-top:12px"></div>
    </div>
    <div class="section" style="margin-top:14px">
      <div class="section-title"><div><h3>Credit Hour / Default Setup</h3><p>Class-wise default Credit Hours. Internal and Exam/Theory can be different. These defaults prefill each new term; the selected term can still be changed independently in Marks Entry.</p></div><button class="btn green" id="v15SaveCreditBtn">SAVE CREDIT HOURS</button></div>
      <div id="v15CreditTable"></div>
    </div>`;
  state.v5SubjectId=null;
  $("#subjectClass").onchange=v15LoadSubjectAndCreditSetup;
  $("#saveTeacherBtn").onclick=v5SaveClassTeacher;
  $("#addSubjectBtn").onclick=()=>subjectDialog();
  $("#v15SaveCreditBtn").onclick=v15SaveCreditDefaults;
  await v15LoadSubjectAndCreditSetup();
};

async function v15LoadSubjectAndCreditSetup(){
  const cls=$("#subjectClass")?.value||"Class 1";
  const [{data:cfg,error:ce},subs]=await Promise.all([
    sb.from("class_settings").select("*").eq("academic_year_id",state.yearId).eq("class_name",cls).maybeSingle(),
    v15OrderedClassSubjects(cls)
  ]);
  if(ce)throw ce;if($("#classTeacherInput"))$("#classTeacherInput").value=cfg?.class_teacher||"";
  const list=subs||[];
  const sh=$("#v15SubjectTable");
  if(sh)sh.innerHTML=list.length?`<div class="table-wrap"><table><thead><tr><th class="center" style="width:90px">Order</th><th>Subject Name</th><th class="center" style="width:130px">Move</th><th class="center" style="width:180px">Action</th></tr></thead><tbody>${list.map(s=>`<tr><td class="center"><strong>${num(s.sort_order)}</strong></td><td><strong>${esc(s.name)}</strong></td><td class="center"><button class="btn small" onclick="v15MoveSubject(${s.id},-1)">↑</button> <button class="btn small" onclick="v15MoveSubject(${s.id},1)">↓</button></td><td class="center"><button class="btn small" onclick="subjectDialog(${s.id})">Edit</button> <button class="btn small red" onclick="v15DeleteSubject(${s.id})">Delete</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No subjects for ${esc(cls)}. Add the first subject.</div>`;
  const ch=$("#v15CreditTable");
  if(ch){
    if(!list.length)ch.innerHTML=`<div class="empty">Add subjects first.</div>`;
    else{
      ch.innerHTML=`<div class="table-wrap"><table><thead><tr><th class="center">Order</th><th>Subject</th><th class="center">Internal Credit Hour</th><th class="center">Exam / Theory Credit Hour</th><th class="center">Total Credit</th></tr></thead><tbody>${list.map(s=>{const r=v15RoleComponents(s.components||[]),ic=r.internal?.credit_hour??0,ec=r.exam?.credit_hour??0;return `<tr data-v15-credit-subject="${s.id}" data-in-component="${r.internal?.id||""}" data-ex-component="${r.exam?.id||""}"><td class="center">${num(s.sort_order)}</td><td><strong>${esc(s.name)}</strong></td><td class="center"><input class="v15-in-ch v15-credit-input" type="number" min="0" step="0.01" value="${creditFmt(ic)}"></td><td class="center"><input class="v15-ex-ch v15-credit-input" type="number" min="0" step="0.01" value="${creditFmt(ec)}"></td><td class="center"><strong class="v15-sub-total">${creditFmt(num(ic)+num(ec))}</strong></td></tr>`}).join("")}<tr class="v15-credit-total-row"><td colspan="4" class="right"><strong>TOTAL CREDIT HOURS</strong></td><td class="center"><strong id="v15CreditGrandTotal">0</strong></td></tr></tbody></table></div>`;
      $$('.v15-credit-input').forEach(i=>i.oninput=v15CreditTotalRefresh);v15CreditTotalRefresh();
    }
  }
}

subjectDialog=async function(id=null){
  const cls=$("#subjectClass")?.value||"Class 1";let row={name:"",sort_order:1};
  if(id){const {data,error}=await sb.from("subjects").select("id,name,sort_order").eq("id",id).single();if(error)return toast(errMsg(error));row=data;}
  else{try{row.sort_order=(await v15OrderedClassSubjects(cls,{withComponents:false})).length+1;}catch(_e){row.sort_order=1;}}
  openModal(id?"Edit Subject":"Add Subject",`<form id="v15SubjectForm" class="form-grid"><div class="field full"><label>Class</label><input value="${esc(cls)}" disabled></div><div class="field"><label>Subject Name</label><input name="name" value="${esc(row.name||"")}" required></div><div class="field"><label>Display Order</label><input name="sort_order" type="number" min="1" step="1" value="${Math.max(1,num(row.sort_order)||1)}" required><small>1 = first, 2 = second, 3 = third…</small></div><div class="info full">Only subject name and order are stored here. Full Marks are entered once per Term + Class + Subject in Marks Entry.</div><div class="form-actions full"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">SAVE SUBJECT</button></div></form>`);
  $("#v15SubjectForm").onsubmit=async e=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));const name=String(f.name||"").trim().toUpperCase(),order=Math.max(1,Math.trunc(Number(f.sort_order))||1);if(!name)return toast("Subject Name is required.");
    try{
      let sid=id;
      if(id){const {error}=await sb.from("subjects").update({name,sort_order:order}).eq("id",id);if(error)throw error;}
      else{const {data,error}=await sb.from("subjects").insert({academic_year_id:state.yearId,class_name:cls,name,credit_hour:0,sort_order:order,active:true}).select("id").single();if(error)throw error;sid=data.id;}
      await v15EnsureSubjectRoles(sid);await v15SetSubjectPosition(sid,cls,order);closeModal();toast("Subject saved.");await v15LoadSubjectAndCreditSetup();
    }catch(err){console.error(err);toast(errMsg(err));}
  };
};
async function v15DeleteSubject(id){
  if(!confirm("Delete this subject? Existing marks/history protection may block deletion if a finalized/published result uses it."))return;
  const {error}=await sb.from("subjects").delete().eq("id",id);if(error)return toast(errMsg(error));toast("Subject deleted.");await v15LoadSubjectAndCreditSetup();
}
async function v15SaveCreditDefaults(){
  const btn=$("#v15SaveCreditBtn");if(btn)btn.disabled=true;
  try{
    for(const tr of $$('tr[data-v15-credit-subject]')){
      const sid=num(tr.dataset.v15CreditSubject),inCh=Number(tr.querySelector('.v15-in-ch')?.value),exCh=Number(tr.querySelector('.v15-ex-ch')?.value);
      if(!Number.isFinite(inCh)||inCh<0||!Number.isFinite(exCh)||exCh<0)throw new Error("Credit Hour cannot be negative.");
      let inId=num(tr.dataset.inComponent),exId=num(tr.dataset.exComponent);
      if(!inId||!exId){const roles=await v15EnsureSubjectRoles(sid);inId=num(roles.internal?.id);exId=num(roles.exam?.id);}
      let r=await sb.from("components").update({credit_hour:inCh}).eq("id",inId);if(r.error)throw r.error;
      r=await sb.from("components").update({credit_hour:exCh}).eq("id",exId);if(r.error)throw r.error;
      r=await sb.from("subjects").update({credit_hour:inCh+exCh}).eq("id",sid);if(r.error)throw r.error;
    }
    toast("Class credit-hour defaults saved. Existing term snapshots remain unchanged.");await v15LoadSubjectAndCreditSetup();
  }catch(e){console.error(e);toast(errMsg(e));}finally{if(btn)btn.disabled=false;}
}

/* ---------- Simple Marks Entry ---------- */
renderMarks=async function(){
  const exams=await examOptions(),defaultExam=num(state.selectedExamId)||num(exams[0]?.id),defaultClass="Class 1";
  $("#content").innerHTML=`<div class="section"><div class="toolbar" style="align-items:flex-end;flex-wrap:wrap"><div class="field" style="min-width:280px"><label>Examination / Term</label><select id="markExam">${exams.map(e=>`<option value="${e.id}" ${num(e.id)===defaultExam?"selected":""}>${esc(e.name)}</option>`).join("")}</select></div><div class="field"><label>Class</label><select id="markClass">${classOptions(defaultClass)}</select></div><div class="field" style="min-width:240px"><label>Subject</label><select id="markSubject"></select></div><button class="btn primary" id="loadMarksBtn">LOAD MARKS SHEET</button></div></div><div class="section"><div class="marks-help"><strong>Excel Copy/Paste:</strong> copy one or two marks columns from Excel, click the first Internal/Exam mark cell, then press Ctrl+V.</div><div id="marksArea"><div class="empty">Choose Term, Class and Subject, then load the marks sheet.</div></div></div>`;
  $("#markClass").onchange=loadMarkSubjects;$("#loadMarksBtn").onclick=v15LoadMarksSheet;$("#markExam").onchange=()=>{state.selectedExamId=num($("#markExam").value)};await loadMarkSubjects();
};
loadMarkSubjects=async function(){
  const cls=$("#markClass")?.value||"Class 1",host=$("#markSubject");if(!host)return;
  const rows=await v15OrderedClassSubjects(cls,{withComponents:false});
  host.innerHTML=rows.map(s=>`<option value="${s.id}">${num(s.sort_order)}. ${esc(s.name)}</option>`).join("");
  if(!rows.length&&$("#marksArea"))$("#marksArea").innerHTML=`<div class="empty">No subject is configured for ${esc(cls)}.</div>`;
};
function v15MarkValidate(el){
  const raw=String(el.value||"").trim(),full=Number(el.dataset.full);el.classList.remove("invalid","abs");if(!raw)return true;
  if(["ABS","AB","A","ABSENT"].includes(raw.toUpperCase())){el.classList.add("abs");return true;}
  const v=Number(raw),ok=Number.isFinite(v)&&v>=0&&v<=full;if(!ok)el.classList.add("invalid");return ok;
}
function v15CurrentSetupValues(){
  return {inFm:Number($("#v15InFm")?.value),exFm:Number($("#v15ExFm")?.value),inCh:Number($("#v15InCh")?.value),exCh:Number($("#v15ExCh")?.value)};
}
function v15ApplySetupToSheet(){
  const v=v15CurrentSetupValues();
  $$('.v15-mark-input[data-col="0"]').forEach(i=>{i.dataset.full=Number.isFinite(v.inFm)?v.inFm:0;v15MarkValidate(i)});
  $$('.v15-mark-input[data-col="1"]').forEach(i=>{i.dataset.full=Number.isFinite(v.exFm)?v.exFm:0;v15MarkValidate(i)});
  const ih=$("#v15InHeader"),eh=$("#v15ExHeader");if(ih)ih.textContent=Number.isFinite(v.inFm)?`Internal OM / ${v.inFm}`:"Internal OM";if(eh)eh.textContent=Number.isFinite(v.exFm)?`Exam OM / ${v.exFm}`:"Exam OM";
  const c=state.marksContext;if(c)(c.students||[]).forEach((_,i)=>v15RefreshRowSummary(i));
}
function v15RefreshRowSummary(row){
  const c=state.marksContext;if(!c)return;const v=v15CurrentSetupValues(),credit=[v.inCh,v.exCh],fm=[v.inFm,v.exFm],comps=[c.internal,c.exam];let complete=true,ng=false,totalWgp=0,totalCredit=0;
  for(let col=0;col<2;col++){
    const el=document.querySelector(`.v15-mark-input[data-row="${row}"][data-col="${col}"]`),raw=String(el?.value||"").trim().toUpperCase(),ch=Number(credit[col]);
    if(!raw){complete=false;continue;}if(!Number.isFinite(ch)||ch<0||!Number.isFinite(fm[col])||fm[col]<=0){complete=false;continue;}totalCredit+=ch;
    const pct=["ABS","AB","A","ABSENT"].includes(raw)?0:Number(raw)/fm[col]*100,pass=comps[col]?.pass_percent??(col===0?40:35),g=gradeForPercent(pct,pass);
    if(g.is_ng||g.grade_point==null){ng=true;continue;}totalWgp+=ch*num(g.grade_point);
  }
  let gp="-",grade="-",wgp="-";if(complete&&totalCredit>0){if(ng){grade="NG";}else{const n=totalWgp/totalCredit;gp=n.toFixed(2);grade=finalGradeForSubjectGP(n);wgp=totalWgp.toFixed(2);}}
  const cells=$$(`tr[data-v15-mark-row="${row}"] .v15-summary`);if(cells[0])cells[0].textContent=gp;if(cells[1])cells[1].textContent=wgp;if(cells[2])cells[2].textContent=grade;
}
function v15HandlePaste(ev){
  ev.preventDefault();const start=ev.currentTarget,text=ev.clipboardData?.getData("text/plain")||"",rows=text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter((x,i,a)=>!(i===a.length-1&&x==="")).map(x=>x.split("\t"));if(!rows.length)return;
  const r0=num(start.dataset.row),c0=num(start.dataset.col);let n=0;
  for(let r=0;r<rows.length;r++)for(let c=0;c<rows[r].length;c++){
    const col=c0+c;if(col>1)continue;const el=document.querySelector(`.v15-mark-input[data-row="${r0+r}"][data-col="${col}"]`);if(!el)continue;el.value=String(rows[r][c]??"").trim();v15MarkValidate(el);v15RefreshRowSummary(r0+r);n++;
  }
  toast(`Pasted ${n} mark cell(s).`);
}
async function v15LoadMarksSheet(){
  const examId=num($("#markExam")?.value),cls=$("#markClass")?.value||"",subjectId=num($("#markSubject")?.value),area=$("#marksArea");
  if(!examId||!subjectId)return toast("Select Examination, Class and Subject.");state.selectedExamId=examId;area.innerHTML=`<div class="empty">Loading marks sheet…</div>`;
  try{
    await v15EnsureSubjectRoles(subjectId);const lock=await v12EnsureExamSettings(examId,cls);const subjects=await v12EffectiveSubjects(examId,cls,[subjectId],{ensure:false}),subject=subjects[0];if(!subject)throw new Error("Subject was not found.");
    const roles=v15RoleComponents(subject.components||[]);if(!roles.internal||!roles.exam)throw new Error("Internal/Exam components are missing. Re-save the subject once.");
    const [{data:students,error:se},{data:marks,error:me}]=await Promise.all([
      sb.from("students").select("id,roll_no,name,symbol_no,registration_no,class_name").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("roll_no").order("name"),
      sb.from("marks").select("student_id,component_id,obtained_mark,status").eq("exam_id",examId).in("component_id",[roles.internal.id,roles.exam.id])
    ]);if(se)throw se;if(me)throw me;const rows=_studentRowsSorted(students),m=new Map((marks||[]).map(x=>[`${x.student_id}_${x.component_id}`,x]));
    state.marksContext={examId,cls,subjectId,subject,internal:roles.internal,exam:roles.exam,students:rows,lock};
    const disabled=lock.locked?"disabled":"";
    area.innerHTML=`<div class="section-title"><div><h3>${esc(subject.name)}</h3><p>${esc(cls)} • ${rows.length} student(s) • ${lock.locked?esc(lock.status)+" — locked":"Term-specific setup"}</p></div><button id="v15SaveMarksBtn" class="btn green" ${disabled}>SAVE SETUP & MARKS</button></div>
      <div class="v15-term-setup">
        <div class="v15-term-card"><strong>INTERNAL</strong><label>Full Marks<input id="v15InFm" type="number" min="0.001" step="0.001" value="${num(roles.internal.full_marks)}" ${disabled}></label><label>Credit Hour<input id="v15InCh" type="number" min="0" step="0.01" value="${creditFmt(roles.internal.credit_hour??0)}" ${disabled}></label><small>Default pass: ${roles.internal.pass_percent??40}%</small></div>
        <div class="v15-term-card"><strong>EXAM / THEORY</strong><label>Full Marks<input id="v15ExFm" type="number" min="0.001" step="0.001" value="${num(roles.exam.full_marks)}" ${disabled}></label><label>Credit Hour<input id="v15ExCh" type="number" min="0" step="0.01" value="${creditFmt(roles.exam.credit_hour??0)}" ${disabled}></label><small>Default pass: ${roles.exam.pass_percent??35}%</small></div>
        <div class="v15-formula-card"><strong>Calculation</strong><span>% = Obtained ÷ Full Marks × 100</span><span>WGP = Credit Hour × Grade Point</span><span>GPA = Total WGP ÷ Total Credit Hour</span></div>
      </div>
      ${lock.locked?`<div class="notice"><strong>${esc(lock.status)}:</strong> this class/term result is locked. Return it to an editable status before changing setup or marks.</div>`:""}
      <div class="table-wrap"><table class="v15-marks-table"><thead><tr><th>Roll</th><th>Student Name</th><th id="v15InHeader">Internal OM / ${num(roles.internal.full_marks)}</th><th id="v15ExHeader">Exam OM / ${num(roles.exam.full_marks)}</th><th>Subject GP</th><th>WGP</th><th>Grade</th></tr></thead><tbody>${rows.map((s,ri)=>{const mi=m.get(`${s.id}_${roles.internal.id}`),mt=m.get(`${s.id}_${roles.exam.id}`),vi=mi?(mi.status==="ABS"?"ABS":mi.obtained_mark??""):"",vt=mt?(mt.status==="ABS"?"ABS":mt.obtained_mark??""):"";return `<tr data-v15-mark-row="${ri}"><td>${esc(s.roll_no||"")}</td><td><strong>${esc(s.name)}</strong></td><td><input class="v15-mark-input mark-input" data-row="${ri}" data-col="0" data-student="${s.id}" data-component="${roles.internal.id}" data-full="${num(roles.internal.full_marks)}" value="${esc(vi)}" ${disabled}></td><td><input class="v15-mark-input mark-input" data-row="${ri}" data-col="1" data-student="${s.id}" data-component="${roles.exam.id}" data-full="${num(roles.exam.full_marks)}" value="${esc(vt)}" ${disabled}></td><td class="center v15-summary">-</td><td class="center v15-summary">-</td><td class="center v15-summary">-</td></tr>`}).join("")}</tbody></table></div>
      <div class="form-actions" style="margin-top:12px"><button class="btn green big" id="v15SaveMarksBottom" ${disabled}>SAVE SETUP & MARKS</button></div>`;
    ["v15InFm","v15ExFm","v15InCh","v15ExCh"].forEach(id=>{const el=$("#"+id);if(el)el.oninput=v15ApplySetupToSheet;});
    $$('.v15-mark-input').forEach(el=>{el.oninput=()=>{v15MarkValidate(el);v15RefreshRowSummary(num(el.dataset.row));};el.onpaste=v15HandlePaste;});
    if($("#v15SaveMarksBtn"))$("#v15SaveMarksBtn").onclick=v15SaveSetupAndMarks;if($("#v15SaveMarksBottom"))$("#v15SaveMarksBottom").onclick=v15SaveSetupAndMarks;v15ApplySetupToSheet();
  }catch(e){console.error(e);area.innerHTML=`<div class="danger">${esc(errMsg(e))}</div>`;}
}
async function v15SaveSetupAndMarks(){
  const c=state.marksContext;if(!c)return toast("Load a marks sheet first.");const lock=await v12ResultLock(c.examId,c.cls);if(lock.locked)return toast(`${lock.status}: result is locked.`);
  const v=v15CurrentSetupValues();if(!Number.isFinite(v.inFm)||v.inFm<=0||!Number.isFinite(v.exFm)||v.exFm<=0)return toast("Internal and Exam Full Marks must be positive. They are not limited to 100.");if(!Number.isFinite(v.inCh)||v.inCh<0||!Number.isFinite(v.exCh)||v.exCh<0)return toast("Credit Hour cannot be negative.");if(v.inCh+v.exCh<=0)return toast("Total Credit Hour must be greater than 0.");
  v15ApplySetupToSheet();let invalid=0;for(const el of $$('.v15-mark-input'))if(!v15MarkValidate(el))invalid++;if(invalid)return toast(`${invalid} invalid mark cell(s). Correct the red cells first.`);
  const buttons=$$("#v15SaveMarksBtn,#v15SaveMarksBottom");buttons.forEach(b=>b.disabled=true);
  try{
    const settingRows=[
      {exam_id:c.examId,component_id:c.internal.id,full_marks:v.inFm,credit_hour:v.inCh,pass_percent:c.internal.pass_percent??40,weight_percent:c.internal.weight_percent??50,updated_at:new Date().toISOString()},
      {exam_id:c.examId,component_id:c.exam.id,full_marks:v.exFm,credit_hour:v.exCh,pass_percent:c.exam.pass_percent??35,weight_percent:c.exam.weight_percent??50,updated_at:new Date().toISOString()}
    ];
    const sr=await sb.from("exam_component_settings").upsert(settingRows,{onConflict:"exam_id,component_id"});if(sr.error)throw sr.error;
    const upserts=[],deletes=[];for(const el of $$('.v15-mark-input')){const raw=el.value.trim(),student_id=num(el.dataset.student),component_id=num(el.dataset.component);if(!raw){deletes.push([student_id,component_id]);continue;}if(["ABS","AB","A","ABSENT"].includes(raw.toUpperCase()))upserts.push({exam_id:c.examId,student_id,component_id,obtained_mark:null,status:"ABS"});else upserts.push({exam_id:c.examId,student_id,component_id,obtained_mark:Number(raw),status:"MARK"});}
    for(let i=0;i<upserts.length;i+=500){const {error}=await sb.from("marks").upsert(upserts.slice(i,i+500),{onConflict:"exam_id,student_id,component_id"});if(error)throw error;}
    for(const [sid,cid] of deletes){const {error}=await sb.from("marks").delete().eq("exam_id",c.examId).eq("student_id",sid).eq("component_id",cid);if(error)throw error;}
    toast(`Saved ${c.subject.name}: term Full Marks/Credit Hours and ${upserts.length} mark cell(s).`);await v15LoadMarksSheet();
  }catch(e){console.error(e);toast(errMsg(e));}finally{buttons.forEach(b=>b.disabled=false);}
}
loadMarksSheet=async function(){return v15LoadMarksSheet();};
loadSelectedMarksSheets=async function(){return v15LoadMarksSheet();};
saveMarks=async function(){return v15SaveSetupAndMarks();};
saveAllSelectedMarks=async function(){return v15SaveSetupAndMarks();};

/* ---------- Result calculation with actual term FM ---------- */
calculateClassResults=async function(examId,cls){
  const [{data:students,error:e1},subjects,{data:marks,error:e3}]=await Promise.all([
    sb.from("students").select("*").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("roll_no").order("name"),
    v12EffectiveSubjects(examId,cls,null),
    sb.from("marks").select("*").eq("exam_id",examId)
  ]);if(e1)throw e1;if(e3)throw e3;const mm=new Map((marks||[]).map(x=>[`${x.student_id}_${x.component_id}`,x])),results=[];
  for(const st of _studentRowsSorted(students)){let incomplete=false,anyNg=false,totalCredit=0,totalWgp=0;const subs=[];
    for(const sub of subjects||[]){const roles=v15RoleComponents(sub.components||[]),comps=[roles.internal,roles.exam].filter(Boolean);if(!comps.length)continue;const out=[];
      for(const c of comps){const mr=mm.get(`${st.id}_${c.id}`),status=mr?.status||"MISSING",obt=mr?.obtained_mark;let percent=null,g={grade:"-",grade_point:null,is_ng:false};if(status==="MISSING")incomplete=true;else{percent=status==="ABS"?0:(num(obt)/num(c.full_marks)*100);g=gradeForPercent(percent,c.pass_percent??(v15ComponentRole(c)==="internal"?40:35));if(g.is_ng)anyNg=true;}const ch=num(c.credit_hour),wgp=g.grade_point==null?null:ch*num(g.grade_point);out.push({...c,status,obtained_mark:obt,percent,...g,wgp});}
      const credit=out.reduce((a,c)=>a+num(c.credit_hour),0),missing=out.some(c=>c.status==="MISSING"),ng=out.some(c=>c.is_ng);let finalGrade="-",gp=null,wgp=null;if(missing||credit<=0){incomplete=true;}else{totalCredit+=credit;if(ng){finalGrade="NG";}else{wgp=out.reduce((a,c)=>a+num(c.wgp),0);gp=wgp/credit;finalGrade=finalGradeForSubjectGP(gp);totalWgp+=wgp;}}subs.push({...sub,components:out,credit_hour:credit,final_grade:finalGrade,final_grade_point:gp,wgp,is_ng:ng});
    }
    let gpa=null,status="INCOMPLETE";if(!incomplete&&totalCredit>0){if(anyNg){gpa=0;status="NG";}else{gpa=Math.round((totalWgp/totalCredit+1e-12)*100)/100;status="PASS";}}results.push({student:st,subjects:subs,total_credit:totalCredit,total_wgp:totalWgp,gpa,gpa_display:gpa==null?"-":gpa.toFixed(2),status,incomplete,has_ng:anyNg});
  }return results;
};

/* Keep grade sheets readable and show total WGP explicitly. */
gradeSheetHtml=function(result,exam,cfg,issueDate){
  const school=state.settings.school_name||"St Augustine Academic Foundation",addr=state.settings.school_address||"Suryodaya Municipality - 11, Tinghare";
  return `<div class="print-sheet"><div class="print-school"><h1>${esc(school)}</h1><p>${esc(addr)}</p><p>ESTD. ${esc(state.settings.established||"2053")}</p></div><div class="print-title">${esc(cfg.assessment_label||exam.name)}</div><div class="print-meta"><div><b>Student:</b> ${esc(result.student.name)}</div><div><b>Class:</b> ${esc(result.student.class_name)}</div><div><b>Roll No.:</b> ${esc(result.student.roll_no||"")}</div><div><b>Symbol No.:</b> ${esc(result.student.symbol_no||"")}</div><div><b>B.S. Year:</b> ${esc(cfg.bs_year_text||currentYear()?.name||"")}</div><div><b>Date of Issue:</b> ${esc(issueDate||"-")}</div></div><table class="grade-table"><thead><tr><th>Subject</th><th>Part</th><th>FM</th><th>OM</th><th>Credit</th><th>Grade</th><th>GP</th><th>WGP</th></tr></thead><tbody>${result.subjects.map(s=>s.components.map((c,i)=>`<tr>${i===0?`<td rowspan="${s.components.length}"><strong>${esc(s.name)}</strong><br>Final: ${esc(s.final_grade)}</td>`:""}<td>${v15ComponentRole(c)==="internal"?"INTERNAL":"EXAM"}</td><td class="center">${num(c.full_marks)}</td><td class="center">${c.status==="ABS"?"ABS":c.status==="MISSING"?"-":num(c.obtained_mark)}</td><td class="center">${creditFmt(c.credit_hour)}</td><td class="center">${esc(c.grade)}</td><td class="center">${c.grade_point==null?"-":num(c.grade_point).toFixed(2)}</td><td class="center">${c.wgp==null?"-":num(c.wgp).toFixed(2)}</td></tr>`).join("")).join("")}<tr class="grade-total-row"><td colspan="4"><strong>Overall Result: ${esc(result.status)}</strong></td><td class="center"><strong>${creditFmt(result.total_credit)}</strong></td><td class="right"><strong>Total WGP</strong></td><td class="center"><strong>${num(result.total_wgp).toFixed(2)}</strong></td><td class="center"><strong>GPA ${result.gpa_display}</strong></td></tr></tbody></table><div class="v15-result-formula">Percentage = Obtained Marks ÷ Full Marks × 100 &nbsp; • &nbsp; WGP = Credit Hour × Grade Point &nbsp; • &nbsp; GPA = Total WGP ÷ Total Credit Hour</div><div class="print-foot"><span>Prepared By: ${esc(state.settings.prepared_by||"")}</span><span>Class Teacher: ${esc(cfg.class_teacher||"")}</span><span>Principal: ${esc(state.settings.principal_name||"")}</span></div></div>`;
};

_allClassComponents=async function(cls,examId=null){
  const eid=num(examId||$("#markExam")?.value||state.selectedExamId);if(!eid){const rows=await v15OrderedClassSubjects(cls);const out=[];for(const s of rows){const r=v15RoleComponents(s.components||[]);for(const c of [r.internal,r.exam].filter(Boolean))out.push({...c,subject_id:s.id,subject_name:s.name});}return out;}
  const subs=await v12EffectiveSubjects(eid,cls,null),out=[];for(const s of subs){const r=v15RoleComponents(s.components||[]);for(const c of [r.internal,r.exam].filter(Boolean))out.push({...c,subject_id:s.id,subject_name:s.name});}return out;
};
v8ClassCompletion=async function(examId,cls){
  const [{data:students,error:e1},subjects,{data:marks,error:e3}]=await Promise.all([
    sb.from("students").select("id").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true),
    v12EffectiveSubjects(examId,cls,null),sb.from("marks").select("student_id,component_id").eq("exam_id",examId)
  ]);if(e1)throw e1;if(e3)throw e3;const studentIds=new Set((students||[]).map(x=>num(x.id))),componentIds=new Set();for(const s of subjects||[]){const r=v15RoleComponents(s.components||[]);[r.internal,r.exam].filter(Boolean).forEach(c=>componentIds.add(num(c.id)));}const expected=studentIds.size*componentIds.size;let entered=0;for(const m of marks||[])if(studentIds.has(num(m.student_id))&&componentIds.has(num(m.component_id)))entered++;return {entered,expected,percent:expected?Math.round(entered/expected*1000)/10:0};
};

Object.assign(window,{renderSubjects,v15LoadSubjectAndCreditSetup,subjectDialog,v15DeleteSubject,v15MoveSubject,v15SaveCreditDefaults,renderMarks,loadMarkSubjects,v15LoadMarksSheet,loadMarksSheet,loadSelectedMarksSheets,v15SaveSetupAndMarks,saveMarks,saveAllSelectedMarks,calculateClassResults,gradeSheetHtml,_allClassComponents,v8ClassCompletion});

/* v15 final grade-sheet renderer: preserve approved A4 design, show total CH/WGP/GPA. */
gradeSheetHtml=function(result,exam,cfg,issueDate){
  const st=result.student,year=String(cfg.bs_year_text||currentYear()?.name||""),ad=String(cfg.ad_year_text||v5AdYear(year)),assessment=String(cfg.assessment_label||exam.name||"").toUpperCase(),logo=state.settings.school_logo_path||"";let sn=0;
  const rows=result.subjects.map(s=>{sn++;const lines=s.components.map(c=>({name:`${String(s.name).toUpperCase()}(${v15ComponentRole(c)==="internal"?"IN":"TH"})`,credit:c.credit_hour,gp:c.grade_point,grade:c.grade}));return `<tr><td class="c">${sn}</td><td>${lines.map(x=>esc(x.name)).join("<br>")}</td><td class="c">${lines.map(x=>creditFmt(x.credit)).join("<br>")}</td><td class="c">${lines.map(x=>x.gp==null?"-":num(x.gp).toFixed(1)).join("<br>")}</td><td class="c">${lines.map(x=>esc(x.grade||"-")).join("<br>")}</td><td class="c"><b>${esc(s.final_grade||"-")}</b></td></tr>`}).join("");
  const roll=st.roll_no?`ROLL NO.: <b>${esc(st.roll_no)}</b> &nbsp;&nbsp; `:"";
  return `<div class="grade-sheet"><div class="gs-border"></div>${logo?`<div class="gs-logo"><img src="${esc(logo)}" alt="School Logo"></div>`:""}<div class="gs-school">${esc(state.settings.school_name||"St Augustine Academic Foundation")}</div><div class="gs-address">${esc(state.settings.school_address||"Suryodaya Municipality - 11, Tinghare")}</div><div class="gs-estd">Estd: ${esc(state.settings.established||"2053")}</div><div class="gs-exam">${esc(String(exam.name||"").toUpperCase())}</div><div class="gs-title">GRADE-SHEET</div><div class="gs-info">THE GRADE(S) SECURED BY: <b>${esc(String(st.name||"").toUpperCase())}</b> DATE OF BIRTH ${esc(st.dob||"      /      /      ")} &nbsp;&nbsp; ${roll}SYMBOL NO.: <b>${esc(st.symbol_no||"-")}</b> GRADE: <b>${esc(v5ClassDisplay(st.class_name))}</b> IN THE ${esc(assessment)} OF YEAR ${esc(year)} B.S. (${esc(ad)} A.D.) ARE GIVEN BELOW.</div><table class="gs-main"><thead><tr><th>S.N.</th><th>SUBJECTS</th><th>CREDIT<br>HOUR</th><th>GRADE<br>POINT</th><th>GRADE</th><th>FINAL GRADE</th></tr></thead><tbody>${rows}<tr class="gpa-row"><td></td><td><b>TOTAL</b></td><td><b>${creditFmt(result.total_credit)}</b></td><td colspan="2"><b>TOTAL WGP ${num(result.total_wgp).toFixed(2)}</b></td><td><b>GPA ${esc(result.gpa_display)}</b></td></tr></tbody></table><table class="gs-legend"><tbody><tr><td>A+</td><td>Outstanding</td><td>C+</td><td>Satisfactory</td></tr><tr><td>A</td><td>Excellent</td><td>C</td><td>Acceptable</td></tr><tr><td>B+</td><td>Very Good</td><td>D</td><td>Basic</td></tr><tr><td>B</td><td>Good</td><td>NG</td><td>Not Graded</td></tr></tbody></table><div class="gs-sign"><div class="line">PREPARED BY:${state.settings.prepared_by?` <b>${esc(String(state.settings.prepared_by).toUpperCase())}</b>`:""}</div><div class="line">CLASS TEACHER:${cfg.class_teacher?` <b>${esc(String(cfg.class_teacher).toUpperCase())}</b>`:""}</div><div class="line">DATE OF ISSUE:${issueDate?` <b>${esc(issueDate)}</b>`:""}</div><div class="gs-principal">PRINCIPAL</div></div><div class="gs-note-line"></div><div class="gs-notes">NOTE: ONE CREDIT HOUR EQUALS TO 32 WORKING HOURS.<br>INTERNAL(IN): INTERNAL / EVALUATION MARKS.<br>THEORY(TH): WRITTEN / EXAMINATION MARKS.<br>FORMULA: % = OM ÷ FM × 100; WGP = CREDIT HOUR × GRADE POINT; GPA = TOTAL WGP ÷ TOTAL CREDIT HOUR.<br>ABS: ABSENT <span class="gs-ng">NG: NOT GRADED</span></div></div>`;
};
window.gradeSheetHtml=gradeSheetHtml;


/* ============================================================
   v18 — SAFE UNPUBLISH + DYNAMIC GRADE SHEET
   ------------------------------------------------------------
   - Published/finalized class result can be safely returned to CALCULATED.
   - Marks remain intact; Marks Entry becomes editable again.
   - Grade Sheet hides Total WGP, adds Grade Remarks, Roman Grade heading,
     stronger repeated school-name watermark, and dynamic flowing lower layout.
   ============================================================ */

function v18RomanGrade(cls){
  const map={"Class 1":"I","Class 2":"II","Class 3":"III","Class 4":"IV","Class 5":"V","Class 6":"VI","Class 7":"VII","Class 8":"VIII","Class 9":"IX","Class 10":"X",Nursery:"NURSERY",LKG:"LKG",UKG:"UKG"};
  return map[cls]||String(cls||"").replace(/^Class\s*/i,"").toUpperCase();
}
function v18GradeRemark(grade){
  return ({"A+":"OUTSTANDING","A":"EXCELLENT","B+":"VERY GOOD","B":"GOOD","C+":"SATISFACTORY","C":"ACCEPTABLE","D":"BASIC","NG":"NOT GRADED","Error":"ERROR"})[String(grade||"")]||"-";
}

async function unpublishResult(){
  const c=state.resultContext;
  if(!c)return toast("Calculate results first.");
  const current=String(c.pub?.status||"DRAFT").toUpperCase();
  if(!["PUBLISHED","FINALIZED"].includes(current))return toast("This result is already editable.");
  const action=current==="PUBLISHED"?"Unpublish this result and reopen Marks Entry for correction?\n\nAll existing marks will be kept.":"Return this finalized result to editable mode?\n\nAll existing marks will be kept.";
  if(!confirm(action))return;
  try{
    const date=($("#issueDate")?.value||c.pub?.publish_date_bs||"").trim();
    await v8SetClassResultStatus(c.examId,c.cls,"CALCULATED",date);
    toast(current==="PUBLISHED"?"Result unpublished. Marks Entry is editable; correct marks, save, then publish again.":"Result returned to editable mode.");
    await refreshResults();
  }catch(e){console.error(e);toast(errMsg(e));}
}

const v18RefreshResultsBase=refreshResults;
refreshResults=async function(){
  await v18RefreshResultsBase();
  const c=state.resultContext;if(!c)return;
  const status=String(c.pub?.status||"DRAFT").toUpperCase();
  let btn=$("#resUnpublishBtn");
  if(["PUBLISHED","FINALIZED"].includes(status)){
    if(!btn){
      btn=document.createElement("button");
      btn.id="resUnpublishBtn";
      btn.type="button";
      btn.className="btn red";
      const publishBtn=$("#resPublishBtn");
      if(publishBtn?.parentNode)publishBtn.parentNode.insertBefore(btn,publishBtn.nextSibling);
    }
    btn.textContent=status==="PUBLISHED"?"UNPUBLISH / EDIT":"RETURN TO EDIT";
    btn.onclick=unpublishResult;
    btn.style.display="";
    if($("#resFinalizeBtn"))$("#resFinalizeBtn").disabled=true;
    if($("#resPublishBtn"))$("#resPublishBtn").disabled=true;
  }else if(btn){btn.remove();}
};

/* Final v19 grade sheet renderer. Existing result calculations are unchanged. */
gradeSheetHtml=function(result,exam,cfg,issueDate){
  const st=result.student,
        year=String(cfg.bs_year_text||currentYear()?.name||""),
        ad=String(cfg.ad_year_text||v5AdYear(year)),
        assessment=String(cfg.assessment_label||exam.name||"").toUpperCase(),
        logo=state.settings.school_logo_path||"",
        gradeRoman=v18RomanGrade(st.class_name);
  let sn=0;
  const rows=result.subjects.map(s=>{
    sn++;
    const lines=s.components.map(c=>({
      name:`${String(s.name).toUpperCase()}(${v15ComponentRole(c)==="internal"?"IN":"TH"})`,
      credit:c.credit_hour,
      gp:c.grade_point,
      grade:c.grade
    }));
    return `<tr><td class="c">${sn}</td><td>${lines.map(x=>esc(x.name)).join("<br>")}</td><td class="c">${lines.map(x=>creditFmt(x.credit)).join("<br>")}</td><td class="c">${lines.map(x=>x.gp==null?"-":num(x.gp).toFixed(1)).join("<br>")}</td><td class="c">${lines.map(x=>esc(x.grade||"-")).join("<br>")}</td><td class="c"><b>${esc(s.final_grade||"-")}</b></td><td class="c"><b>${esc(v18GradeRemark(s.final_grade))}</b></td></tr>`;
  }).join("");
  const roll=st.roll_no?`ROLL NO.: <b>${esc(st.roll_no)}</b> &nbsp;&nbsp; `:"";
  const watermarks=Array.from({length:40},()=>`<span>ST. AUGUSTINE ACADEMIC FOUNDATION</span>`).join("");
  const sparse=result.subjects.length<=4?" gs-sparse":"";
  const roomy=result.subjects.length>=5&&result.subjects.length<=6?" gs-roomy":"";
  const compact=result.subjects.length>8?" gs-compact":"";
  const tight=result.subjects.length>10?" gs-tight":"";
  return `<div class="grade-sheet${sparse}${roomy}${compact}${tight}">
    <div class="gs-border"></div>
    <div class="gs-watermark" aria-hidden="true">${watermarks}</div>
    ${logo?`<div class="gs-logo"><img src="${esc(logo)}" alt="School Logo"></div>`:""}
    <div class="gs-school">${esc(state.settings.school_name||"St Augustine Academic Foundation")}</div>
    <div class="gs-address">${esc(state.settings.school_address||"Suryodaya Municipality - 11, Tinghare")}</div>
    <div class="gs-estd">Estd: ${esc(state.settings.established||"2053")}</div>
    <div class="gs-grade-head">GRADE ${esc(gradeRoman)}</div>
    <div class="gs-exam">${esc(String(exam.name||"").toUpperCase())}</div>
    <div class="gs-title">GRADE-SHEET</div>
    <div class="gs-flow">
      <div class="gs-info">THE GRADE(S) SECURED BY: <b>${esc(String(st.name||"").toUpperCase())}</b> DATE OF BIRTH ${esc(st.dob||"      /      /      ")} &nbsp;&nbsp; IEMIS ID: <b>${esc(st.registration_no||"-")}</b> &nbsp;&nbsp; ${roll}SYMBOL NO.: <b>${esc(st.symbol_no||"-")}</b> GRADE: <b>${esc(gradeRoman)}</b> IN THE ${esc(assessment)} OF YEAR ${esc(year)} B.S. (${esc(ad)} A.D.) ARE GIVEN BELOW.</div>
      <table class="gs-main"><thead><tr><th>S.N.</th><th>SUBJECTS</th><th>CREDIT<br>HOUR</th><th>GRADE<br>POINT</th><th>GRADE</th><th>FINAL GRADE</th><th>REMARKS</th></tr></thead><tbody>${rows}<tr class="gpa-row"><td></td><td><b>TOTAL</b></td><td><b>${creditFmt(result.total_credit)}</b></td><td colspan="4"><b>GRADE POINT AVERAGE = ${esc(result.gpa_display)}</b></td></tr></tbody></table>
      <table class="gs-legend"><tbody><tr><td>A+</td><td>Outstanding</td><td>C+</td><td>Satisfactory</td></tr><tr><td>A</td><td>Excellent</td><td>C</td><td>Acceptable</td></tr><tr><td>B+</td><td>Very Good</td><td>D</td><td>Basic</td></tr><tr><td>B</td><td>Good</td><td>NG</td><td>Not Graded</td></tr></tbody></table>
      <div class="gs-sign"><div class="line gs-prepared-line">PREPARED BY: <span class="gs-dots">..........................</span></div><div class="line">CLASS TEACHER:${cfg.class_teacher?` <b>${esc(String(cfg.class_teacher).toUpperCase())}</b>`:""}</div><div class="line gs-date-line">DATE OF ISSUE:${issueDate?` <b>${esc(issueDate)}</b>`:""}</div><div class="gs-principal"><div class="gs-principal-dots">..........................</div><div class="gs-principal-name">${esc(String(state.settings.principal_name||"").toUpperCase())}</div><div class="gs-principal-role">PRINCIPAL</div></div></div>
      <div class="gs-note-line"></div>
      <div class="gs-notes">NOTE: ONE CREDIT HOUR EQUALS TO 32 WORKING HOURS.<br>INTERNAL(IN): INTERNAL / EVALUATION MARKS.<br>THEORY(TH): WRITTEN / EXAMINATION MARKS.<br>ABS: ABSENT <span class="gs-ng">NG: NOT GRADED</span></div>
    </div>
  </div>`;
};

Object.assign(window,{refreshResults,unpublishResult,gradeSheetHtml,v18RomanGrade,v18GradeRemark});

/* Build: v29 Global Full Marks Conflict Finder + v28 Result Diagnostics + v26 Roll Order Fix. */

/* ============================================================
   v28 — RESULT PROCESSING FULL-MARKS CONFLICT DIAGNOSTICS
   Preflights saved OM vs effective Term Full Marks before the
   result engine/RPC runs, so the exact student is visible.
   ============================================================ */
function v28RenderResultFullMarkConflicts(conflicts,examId,cls){
  const area=$("#resultsArea"),status=$("#resultsStatusHost");
  const examText=$("#resExam option:checked")?.textContent||"Selected Examination";
  state.resultContext=null;
  if(status)status.innerHTML=`<div class="result-status-card v28-result-conflict-status"><span class="result-status-badge" style="background:#FFE5E2;color:#A61F1F">CONFLICT</span><span class="result-status-text"><strong>${conflicts.length} saved mark(s)</strong> are higher than the Full Marks for ${esc(examText)} • ${esc(cls)}. Result calculation is paused until these marks are corrected.</span></div>`;
  if(area)area.innerHTML=`${v27ConflictHtml(conflicts,"Result Processing blocked — these saved marks are above Full Marks")}<div class="notice"><strong>How to fix:</strong> Open <b>Marks Entry</b>, choose <b>${esc(examText)}</b> and <b>${esc(cls)}</b>, then correct the red student's obtained mark or increase that component's Term Full Marks. After saving, return here and click <b>Calculate / Refresh</b>.</div>`;
  const f=$("#resFinalizeBtn"),p=$("#resPublishBtn");if(f)f.disabled=true;if(p)p.disabled=true;
}

const v28RefreshResultsBase=refreshResults;
refreshResults=async function(){
  const examId=num($("#resExam")?.value),cls=$("#resClass")?.value||"";if(!examId||!cls)return;
  if($("#resultsArea"))$("#resultsArea").innerHTML=`<div class="empty">Checking Full Marks and saved marks…</div>`;
  try{
    const conflicts=await v27FindFullMarkConflicts(examId,cls);
    if(conflicts.length){v28RenderResultFullMarkConflicts(conflicts,examId,cls);return;}
    await v28RefreshResultsBase();
  }catch(e){
    console.error(e);
    if(/Full Marks cannot be lower than an already saved obtained mark/i.test(errMsg(e))){
      try{
        const conflicts=await v27FindFullMarkConflicts(examId,cls);
        if(conflicts.length){v28RenderResultFullMarkConflicts(conflicts,examId,cls);return;}
      }catch(diagErr){console.error(diagErr);}
      const area=$("#resultsArea"),status=$("#resultsStatusHost");
      if(status)status.innerHTML=`<div class="result-status-card v28-result-conflict-status"><span class="result-status-badge" style="background:#FFE5E2;color:#A61F1F">CONFLICT</span><span class="result-status-text">A saved mark is higher than its Term Full Marks.</span></div>`;
      if(area)area.innerHTML=`<div class="danger"><strong>Full Marks conflict detected, but the old student row could not be resolved automatically.</strong><br>Use the Deep Conflict Trace for ${esc(cls)} to identify the exact Mark ID / Student ID / Subject ID / Component ID. Correct that saved record; do not temporarily raise Full Marks.</div>`;
      return;
    }
    throw e;
  }
};
window.refreshResults=refreshResults;


/* Build: v29 — conflict diagnostics now scan all saved marks for selected exam/components, including inactive/moved/old student records. */


/* Build: v31 — Full Marks root fix companion: backend ensure ignores inactive subjects and safely bootstraps missing term snapshots. */

/* ============================================================
   v32.2 FINAL — SELECTED CLASS EXCEL EXPORTS
   ------------------------------------------------------------
   Result Processing now exports ONLY the currently selected
   Examination + Class.

   1) Export Grade Details:
      Subject GP / Credit / WGP / Grade + Total Credit / WGP / GPA.
   2) Export Marks Details:
      Raw saved obtained marks for every subject/component.
   ============================================================ */

function v322Fmt(v,decimals=2){
  if(v===null||v===undefined||v==="")return "";
  const n=Number(v);if(!Number.isFinite(n))return v;
  const p=10**decimals;return Math.round((n+Number.EPSILON)*p)/p;
}
function v322MarkCell(component){
  const st=String(component?.status||"MISSING").toUpperCase();
  if(st==="ABS")return "ABS";
  if(st==="MISSING")return "";
  return component?.obtained_mark==null?"":v322Fmt(component.obtained_mark,3);
}
function v322Widths(headers){
  return headers.map((h,i)=>{
    const t=String(h||"");
    if(i===1)return {wch:28};
    if(/student name/i.test(t))return {wch:28};
    if(/iemis|symbol/i.test(t))return {wch:16};
    return {wch:Math.max(11,Math.min(24,t.length+2))};
  });
}
function v322SaveSheet(sheetName,title,headers,dataRows,filename){
  const rows=[[title],[],headers,...dataRows];
  const ws=XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"]=v322Widths(headers);
  ws["!freeze"]={xSplit:0,ySplit:3};
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,sheetName.slice(0,31));
  XLSX.writeFile(wb,filename,{compression:true});
}

async function v322ExportSelectedClassGradeDetails(){
  const c=state.resultContext;
  if(!c)return toast("Calculate / Refresh the selected examination and class first.");
  const examId=num($("#resExam")?.value),cls=$("#resClass")?.value||"";
  if(!examId||!cls)return toast("Select examination and class first.");
  if(num(c.examId)!==examId||c.cls!==cls){await refreshResults();return v322ExportSelectedClassGradeDetails();}
  if(!c.results?.length)return toast(`No students found in ${cls}.`);

  const subjects=await v12EffectiveSubjects(examId,cls,null);
  const headers=["Roll No","Student Name","Symbol No","IEMIS ID"];
  for(const s of subjects||[])headers.push(`${s.name} GP`,`${s.name} Credit`,`${s.name} WGP`,`${s.name} Grade`);
  headers.push("Total Credit","Total WGP","GPA","Status");

  const rows=[];
  for(const r of c.results){
    const byId=new Map((r.subjects||[]).map(s=>[num(s.id),s]));
    const row=[r.student.roll_no||"",r.student.name||"",r.student.symbol_no||"",r.student.registration_no||""];
    for(const s of subjects||[]){
      const x=byId.get(num(s.id));
      if(!x)row.push("","","","");
      else row.push(x.final_grade_point==null?"":v322Fmt(x.final_grade_point,1),v322Fmt(x.credit_hour,2),x.wgp==null?"":v322Fmt(x.wgp,2),x.final_grade||"");
    }
    row.push(v322Fmt(r.total_credit,2),v322Fmt(r.total_wgp,2),r.gpa==null?"":v322Fmt(r.gpa,2),r.status||"");
    rows.push(row);
  }
  const year=currentYear()?.name||"";
  v322SaveSheet("Grade Details",`${year} | ${c.exam.name} | ${cls} | GRADE DETAILS`,headers,rows,`Grade_Details_${_safeFilename(cls)}_${_safeFilename(c.exam.name)}.xlsx`);
  toast(`${cls} Grade Details Excel exported.`);
}

async function v322ExportSelectedClassMarksDetails(){
  const c=state.resultContext;
  if(!c)return toast("Calculate / Refresh the selected examination and class first.");
  const examId=num($("#resExam")?.value),cls=$("#resClass")?.value||"";
  if(!examId||!cls)return toast("Select examination and class first.");
  if(num(c.examId)!==examId||c.cls!==cls){await refreshResults();return v322ExportSelectedClassMarksDetails();}

  const [subjects,studentsRes,marksRes]=await Promise.all([
    v12EffectiveSubjects(examId,cls,null),
    sb.from("students").select("id,roll_no,name,symbol_no,registration_no").eq("academic_year_id",state.yearId).eq("class_name",cls).eq("active",true).order("roll_no").order("name"),
    sb.from("marks").select("student_id,component_id,obtained_mark,status").eq("exam_id",examId)
  ]);
  if(studentsRes.error)throw studentsRes.error;if(marksRes.error)throw marksRes.error;
  const students=_studentRowsSorted(studentsRes.data||[]);if(!students.length)return toast(`No students found in ${cls}.`);
  const comps=[];
  for(const s of subjects||[])for(const cp of (s.components||[]).slice().sort((a,b)=>num(a.sort_order)-num(b.sort_order)||num(a.id)-num(b.id)))comps.push({...cp,subject_name:s.name});
  if(!comps.length)return toast(`No subject/component setup found in ${cls}.`);
  const mm=new Map((marksRes.data||[]).map(m=>[`${m.student_id}_${m.component_id}`,m]));
  const headers=["Roll No","Student Name","Symbol No","IEMIS ID",...comps.map(cp=>`${cp.subject_name} ${cp.code} (FM ${v322Fmt(cp.full_marks,3)})`)];
  const rows=students.map(st=>{
    const row=[st.roll_no||"",st.name||"",st.symbol_no||"",st.registration_no||""];
    for(const cp of comps){const m=mm.get(`${st.id}_${cp.id}`);row.push(!m?"":String(m.status||"MARK").toUpperCase()==="ABS"?"ABS":m.obtained_mark??"");}
    return row;
  });
  const year=currentYear()?.name||"";
  v322SaveSheet("Marks Details",`${year} | ${c.exam.name} | ${cls} | MARKS DETAILS`,headers,rows,`Marks_Details_${_safeFilename(cls)}_${_safeFilename(c.exam.name)}.xlsx`);
  toast(`${cls} Marks Details Excel exported.`);
}

const v322RefreshResultsBase=refreshResults;
refreshResults=async function(){
  await v322RefreshResultsBase();
  const host=document.querySelector(".result-status-actions");
  if(!host)return;
  const old=host.querySelector('button[onclick="v5ExportResultsExcel()"]');
  if(old)old.remove();
  if(!document.getElementById("v322GradeDetailsBtn")){
    const grade=document.createElement("button");grade.className="btn";grade.id="v322GradeDetailsBtn";grade.textContent="Export Grade Details";grade.onclick=v322ExportSelectedClassGradeDetails;
    const marks=document.createElement("button");marks.className="btn";marks.id="v322MarksDetailsBtn";marks.textContent="Export Marks Details";marks.onclick=v322ExportSelectedClassMarksDetails;
    const anchor=host.querySelector("button");
    if(anchor){host.insertBefore(marks,anchor);host.insertBefore(grade,marks);}else{host.appendChild(grade);host.appendChild(marks);}
  }
};

const v322RenderResultsBase=renderResults;
renderResults=async function(){
  setPageActions("");
  await v322RenderResultsBase();
  setPageActions("");
};
window.renderResults=renderResults;
Object.assign(window,{refreshResults,v322ExportSelectedClassGradeDetails,v322ExportSelectedClassMarksDetails});

/* Build: v32.2 FINAL — selected class Grade Details + Marks Details Excel exports. */

/* ============================================================
   v32.3 — FAST-CLICK / STALE-RENDER SAFETY
   ------------------------------------------------------------
   Purpose: prevent intermittent "Cannot set properties of null
   (setting 'innerHTML')" errors when a different Marks page is
   clicked before the previous async page has finished rendering.

   Scope: UI timing only. No marks/result calculation, Supabase
   tables, exports, grade sheets, subjects, students or SQL logic
   is changed.
   ============================================================ */
(function(){
  const v323DomRaceError=e=>/Cannot\s+(?:set|read)\s+properties\s+of\s+(?:null|undefined)|Cannot\s+read\s+property/i.test(String(e?.message||e||''));

  if(!Number.isFinite(Number(state._uiEpoch)))state._uiEpoch=0;
  state._navBusy=false;
  state._pendingPage=null;

  /* A page-specific async task may finish after the user has moved
     to another page. In that case a missing old-page DOM node is a
     stale render, not a real application/data error. */
  function v323WrapPageTask(base,page,label){
    return async function(...args){
      const epoch=Number(state._uiEpoch||0);
      try{return await base.apply(this,args);}
      catch(e){
        if((state.page!==page||Number(state._uiEpoch||0)!==epoch)&&v323DomRaceError(e)){
          console.debug(`[v32.3] Ignored stale ${label||page} render after page change.`,e);
          return;
        }
        throw e;
      }
    };
  }

  /* Protect the short async refreshers that can still be running when
     navigation starts after a page is already visible. */
  const _v323LoadStudents=loadStudents;
  loadStudents=v323WrapPageTask(_v323LoadStudents,'students','student list');

  const _v323SubjectSetup=v15LoadSubjectAndCreditSetup;
  v15LoadSubjectAndCreditSetup=v323WrapPageTask(_v323SubjectSetup,'subjects','subject setup');

  const _v323LoadMarkSubjects=loadMarkSubjects;
  loadMarkSubjects=v323WrapPageTask(_v323LoadMarkSubjects,'marks','marks subject list');

  const _v323LoadMarksSheet=v15LoadMarksSheet;
  v15LoadMarksSheet=v323WrapPageTask(_v323LoadMarksSheet,'marks','marks sheet');
  loadMarksSheet=async function(){return v15LoadMarksSheet();};
  loadSelectedMarksSheets=async function(){return v15LoadMarksSheet();};

  const _v323RefreshResults=refreshResults;
  refreshResults=v323WrapPageTask(_v323RefreshResults,'results','result refresh');

  /* Serialize only full-page navigation. Fast repeated clicks are not
     lost: while one page is loading, the LAST clicked page is queued
     and opens immediately after the current render finishes. This
     keeps old and new page DOM trees from being rendered concurrently. */
  navigate=async function(page){
    const target=String(page||'dashboard');
    if(state._navBusy){
      state._pendingPage=target;
      return;
    }

    state._navBusy=true;
    state._pendingPage=null;
    const epoch=++state._uiEpoch;
    state.page=target;
    renderNav();
    setV5Title(target);
    setPageActions('');

    const content=$('#content');
    if(content)content.innerHTML=`<div class="section"><div class="empty">Loading…</div></div>`;

    const map={
      dashboard:renderDashboard,
      students:renderStudents,
      marks:renderMarks,
      importMarks:renderImportMarksLedger,
      subjects:renderSubjects,
      results:renderResults,
      settings:renderSettings,
      backup:renderBackup
    };

    try{
      await (map[target]||renderDashboard)();
    }catch(e){
      console.error(e);
      /* If another click was queued while this render was running, do
         not flash a harmless old-page null-DOM error to the user. */
      const hasQueued=!!state._pendingPage;
      if(!(hasQueued&&v323DomRaceError(e))){
        const host=$('#content');
        if(host&&Number(state._uiEpoch||0)===epoch&&state.page===target){
          host.innerHTML=`<div class="danger">${esc(errMsg(e))}</div>`;
        }
      }
    }finally{
      state._navBusy=false;
      const pending=state._pendingPage;
      state._pendingPage=null;
      if(pending&&pending!==state.page){
        setTimeout(()=>navigate(pending),0);
      }
    }
  };

  Object.assign(window,{navigate,loadStudents,loadMarkSubjects,loadMarksSheet,loadSelectedMarksSheets,refreshResults});
})();

/* Build: v32.3 — fast-click/stale-render safety only. */

