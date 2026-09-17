"use strict";
const SUPABASE_URL="https://hspsaglksnmhuqfuxccm.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_-byhdB5_dxkqQ0YXmC8yEQ_xDSWMbOp";
const sb=window.supabase?.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,storage:window.sessionStorage,storageKey:"sa_accounts_supabase_session",autoRefreshToken:true,detectSessionInUrl:false}});
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let storageMode="local",currentType="official",historyCache=[];
const LOCAL_KEY="sa_letter_maker_letters_v1";
const TABLE_HEADERS=["SN","NAME","CLASS","ROLL NO","EMIS ID","GENDER","REMARKS"];
const toast=m=>{const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove("show"),2600)};
const esc=v=>String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#039;"}[c]));
const uid=()=>crypto?.randomUUID?.()||("ltr_"+Date.now()+Math.random().toString(36).slice(2));
function localLetters(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||"[]")}catch{return[]}}
function saveLocalLetters(a){localStorage.setItem(LOCAL_KEY,JSON.stringify(a))}
function getAccountsDB(){try{return JSON.parse(localStorage.getItem("sa_accounts_final_clean_v13")||"{}")}catch{return{}}}
function todayNepali(){return getAccountsDB()?.settings?.workingDate||"2083-06-01"}
function nepaliDigits(s){return String(s).replace(/\d/g,d=>"०१२३४५६७८९"[d])}
function defaultPatra(){const y=Number(String(todayNepali()).slice(0,4))||2083;return `${nepaliDigits(String(y).slice(-3))}/${nepaliDigits(String(y+1).slice(-2))}`}
function typeLabel(t){return t==="official"?"Official Letter":t==="parent"?"Parent / Student Letter":"Custom Letter"}
function setView(id){["dashboardView","editorView","historyView"].forEach(x=>$("#"+x).classList.toggle("hidden",x!==id));window.scrollTo({top:0,behavior:"smooth"})}
async function init(){
  bind();
  const isLocalFile=location.protocol==="file:";
  if(!isLocalFile&&sb){
    try{
      const {data:{session}}=await sb.auth.getSession();
      if(!session?.user){location.href="../index.html";return}
      const {data:p}=await sb.from("app_users").select("role,active").eq("auth_user_id",session.user.id).maybeSingle();
      if(!p?.active||p.role!=="accountant"){
        toast("Letter Maker is available to Accountant login.");
        setTimeout(()=>location.href="../index.html",1200);
        return;
      }
      const test=await sb.from("school_letters").select("letter_id",{head:true,count:"exact"}).limit(1);
      if(!test.error)storageMode="online";
    }catch(e){console.warn(e)}
  }
  $("#modeBadge").textContent=storageMode==="online"?"ONLINE SAVE":(isLocalFile?"LOCAL TEST":"LOCAL SAVE");
  if(storageMode!=="online"){
    $("#setupNote").classList.remove("hidden");
    $("#setupNote").innerHTML=isLocalFile
      ?"Local test mode is active. You can design, preview, save locally and print letters without changing live data."
      :"Letter Maker is working in local-save mode. Run <b>LETTER_MAKER_SETUP.sql</b> in Supabase once to save Letter History online across devices.";
  }
  await loadHistory();renderRecent();
}
function bind(){
  $$(".type-card[data-type]").forEach(b=>b.onclick=()=>openEditor(b.dataset.type));
  $("#historyBtn").onclick=()=>openHistory();$("#refreshHistory").onclick=async()=>{await loadHistory();renderRecent()};
  $("#backDashboard").onclick=()=>setView("dashboardView");$("#historyBack").onclick=()=>setView("dashboardView");$("#historyRefresh2").onclick=async()=>{await loadHistory();renderHistory()};
  $("#historySearch").oninput=renderHistory;$("#historyType").onchange=renderHistory;
  ["patraSankhya","chalanNo","letterDate","nepalSambat","recipient","office","address","subject","salutation","bodyText","signatureTitle","signatureOrg","signaturePhone"].forEach(id=>$("#"+id).addEventListener("input",renderPreview));
  $("#tableEnabled").onchange=()=>{$("#tableEditor").classList.toggle("hidden",!$("#tableEnabled").checked);renderPreview()};
  $("#addRowBtn").onclick=()=>{addTableRow();renderPreview()};$("#resetTableBtn").onclick=()=>resetTable();
  $("#saveBtn").onclick=saveLetter;$("#saveBtnMobile").onclick=saveLetter;$("#printBtn").onclick=printLetter;$("#printBtnMobile").onclick=printLetter;$("#clearBtn").onclick=()=>openEditor(currentType);
}
function resetTable(rows){
  const th=$("#editTable thead"),tb=$("#editTable tbody");th.innerHTML=`<tr>${TABLE_HEADERS.map(h=>`<th><input class="th-input" value="${h}"></th>`).join("")}</tr>`;tb.innerHTML="";
  (rows?.length?rows:[Array(TABLE_HEADERS.length).fill("")]).forEach(r=>addTableRow(r));$$("#editTable input").forEach(i=>i.oninput=renderPreview);renderPreview();
}
function addTableRow(row=Array(TABLE_HEADERS.length).fill("")){const tr=document.createElement("tr");tr.innerHTML=TABLE_HEADERS.map((_,i)=>`<td><input value="${esc(row[i]||"")}"></td>`).join("");$("#editTable tbody").appendChild(tr);tr.querySelectorAll("input").forEach(i=>i.oninput=renderPreview)}
async function nextChalan(){const list=historyCache.filter(x=>x.letter_type==="official");return String(Math.max(0,...list.map(x=>Number(x.chalan_no)||0))+1)}
async function openEditor(type,letter=null){
  currentType=type||"official";setView("editorView");$("#editorEyebrow").textContent=typeLabel(currentType).toUpperCase();$("#editorTitle").textContent=letter?"Edit "+typeLabel(currentType):"Create "+typeLabel(currentType);
  $$(".official-only").forEach(x=>x.classList.toggle("hidden",currentType!=="official"));
  $("#letterId").value=letter?.letter_id||"";$("#patraSankhya").value=letter?.patra_sankhya||defaultPatra();$("#chalanNo").value=letter?.chalan_no||await nextChalan();$("#letterDate").value=letter?.nepali_date||todayNepali();$("#nepalSambat").value=letter?.nepal_sambat||"";
  $("#recipient").value=letter?.recipient||(currentType==="parent"?"माननीय अभिभावकज्यू":"");$("#office").value=letter?.office||"";$("#address").value=letter?.address||"";$("#subject").value=letter?.subject||"";$("#salutation").value=letter?.salutation||"महोदय,";$("#bodyText").value=letter?.body||"";
  $("#signatureTitle").value=letter?.signature_title||"प्रधानाध्यापक";$("#signatureOrg").value=letter?.signature_org||"सेन्ट अगस्टाइन एकेडेमिक फाउण्डेशन\nसूर्योदय नगरपालिका-११";$("#signaturePhone").value=letter?.signature_phone||"९८६४१८५१२२";
  const enabled=!!(letter?.table_rows?.length);$("#tableEnabled").checked=enabled;$("#tableEditor").classList.toggle("hidden",!enabled);resetTable(letter?.table_rows||null);if(letter?.table_headers?.length){$$("#editTable thead input").forEach((i,n)=>i.value=letter.table_headers[n]||TABLE_HEADERS[n])}
  renderPreview();
}
function tableData(){return {headers:$$('#editTable thead input').map(i=>i.value.trim()),rows:$$('#editTable tbody tr').map(tr=>[...tr.querySelectorAll('input')].map(i=>i.value.trim())).filter(r=>r.some(Boolean))}}
function collect(){const t=tableData();return {letter_id:$("#letterId").value||null,letter_type:currentType,patra_sankhya:$("#patraSankhya").value.trim(),chalan_no:Number($("#chalanNo").value)||null,nepali_date:$("#letterDate").value.trim(),nepal_sambat:$("#nepalSambat").value.trim(),recipient:$("#recipient").value.trim(),office:$("#office").value.trim(),address:$("#address").value.trim(),subject:$("#subject").value.trim(),salutation:$("#salutation").value.trim(),body:$("#bodyText").value.trim(),table_headers:$("#tableEnabled").checked&&currentType==="official"?t.headers:[],table_rows:$("#tableEnabled").checked&&currentType==="official"?t.rows:[],signature_title:$("#signatureTitle").value.trim(),signature_org:$("#signatureOrg").value.trim(),signature_phone:$("#signaturePhone").value.trim(),status:"final"}}
function renderPreview(){
  const x=collect(),official=x.letter_type==="official";
  const meta=official?`<div class="letter-meta"><div><b>प.स.</b> ${esc(x.patra_sankhya)}</div><div></div><div><b>च.न.</b> ${esc(x.chalan_no||"")}</div><div class="right"><b>मिति:</b> ${esc(x.nepali_date)}</div><div></div><div class="right">${x.nepal_sambat?`<b>नेपाल संवत् :</b> ${esc(x.nepal_sambat)}`:""}</div></div>`:"";
  const rec=[x.recipient,official?x.office:"",official?x.address:""].filter(Boolean).map(esc).join("\n");
  const tbl=x.table_rows?.length?`<div class="letter-table-title">सहभागी / विवरण</div><table class="preview-table"><thead><tr>${x.table_headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${x.table_rows.map((r,ri)=>`<tr>${r.map((c,ci)=>`<td>${ci===0&&!c?ri+1:esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`:"";
  const sal=official&&x.salutation?`<div class="letter-salutation">${esc(x.salutation)}</div>`:"";
  $("#letterPaper").innerHTML=`<img class="page-bg" src="letterhead.png" alt="Letterhead"><div class="page-content">${meta}<div class="recipient-block">${rec}</div><div class="letter-subject">विषय: ${esc(x.subject||"")}</div>${sal}<div class="letter-body">${esc(x.body)}</div>${tbl}<div class="sign-wrap"><div class="sign-line"></div><b>${esc(x.signature_title)}</b><br>${esc(x.signature_org).replace(/\n/g,"<br>")}${x.signature_phone?`<br>सम्पर्क नं.: ${esc(x.signature_phone)}`:""}</div></div>`;
}
async function saveLetter(){
  const x=collect();if(!x.nepali_date)return toast("मिति लेख्नुहोस्।");if(!x.subject)return toast("विषय लेख्नुहोस्।");if(!x.body)return toast("पत्रको व्यहोरा लेख्नुहोस्।");
  try{
    if(storageMode==="online"){
      const payload={...x};delete payload.letter_id;
      let res;if(x.letter_id)res=await sb.from("school_letters").update({...payload,updated_at:new Date().toISOString()}).eq("letter_id",x.letter_id).select().single();else res=await sb.from("school_letters").insert(payload).select().single();
      if(res.error)throw res.error;$("#letterId").value=res.data.letter_id;
    }else{
      const a=localLetters(),i=a.findIndex(v=>v.letter_id===x.letter_id),row={...x,letter_id:x.letter_id||uid(),updated_at:new Date().toISOString(),created_at:i>=0?a[i].created_at:new Date().toISOString()};if(i>=0)a[i]=row;else a.unshift(row);saveLocalLetters(a);$("#letterId").value=row.letter_id;
    }
    await loadHistory();renderRecent();toast("Letter saved.");
  }catch(e){console.error(e);toast("Letter not saved: "+String(e?.message||"Unknown error"))}
}
async function loadHistory(){if(storageMode==="online"){const {data,error}=await sb.from("school_letters").select("*").order("created_at",{ascending:false});if(error)throw error;historyCache=data||[]}else historyCache=localLetters().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))}
function renderRecent(){const a=historyCache.slice(0,6);$("#recentLetters").innerHTML=a.length?historyTable(a):'<div class="empty">No saved letters yet.</div>'}
function openHistory(){setView("historyView");renderHistory()}
function renderHistory(){const q=$("#historySearch").value.toLowerCase().trim(),t=$("#historyType").value;const a=historyCache.filter(x=>(!t||x.letter_type===t)&&(!q||[x.subject,x.recipient,x.office,x.nepali_date,x.patra_sankhya,String(x.chalan_no||"")].some(v=>String(v||"").toLowerCase().includes(q))));$("#historyList").innerHTML=a.length?historyTable(a):'<div class="empty">No matching letters.</div>'}
function historyTable(a){return `<div style="overflow:auto"><table class="history-table"><thead><tr><th>Date</th><th>Type</th><th>Ch.No.</th><th>Subject</th><th>To</th><th>Action</th></tr></thead><tbody>${a.map(x=>`<tr><td>${esc(x.nepali_date)}</td><td>${esc(typeLabel(x.letter_type))}</td><td>${esc(x.chalan_no||'-')}</td><td><b>${esc(x.subject)}</b></td><td>${esc(x.recipient||x.office||'-')}</td><td><div class="history-actions"><button class="ghost" onclick="editLetter('${x.letter_id}')">Open</button><button class="ghost" onclick="duplicateLetter('${x.letter_id}')">Duplicate</button><button class="print" onclick="printSavedLetter('${x.letter_id}')">Print</button><button class="danger" onclick="deleteLetter('${x.letter_id}')">Delete</button></div></td></tr>`).join("")}</tbody></table></div>`}
function findLetter(id){return historyCache.find(x=>String(x.letter_id)===String(id))}
window.editLetter=id=>{const x=findLetter(id);if(x)openEditor(x.letter_type,x)};
window.duplicateLetter=id=>{const x=findLetter(id);if(!x)return;const y={...x,letter_id:null,chalan_no:null,subject:x.subject+" (Copy)"};openEditor(y.letter_type,y)};
window.deleteLetter=async id=>{const x=findLetter(id);if(!x||!confirm("Delete this letter?"))return;try{if(storageMode==="online"){const {error}=await sb.from("school_letters").delete().eq("letter_id",id);if(error)throw error}else saveLocalLetters(localLetters().filter(v=>v.letter_id!==id));await loadHistory();renderHistory();renderRecent();toast("Letter deleted.")}catch(e){toast("Delete failed: "+String(e?.message||""))}};
window.printSavedLetter=id=>{const x=findLetter(id);if(!x)return;openEditor(x.letter_type,x);setTimeout(printLetter,150)};
function printLetter(){renderPreview();const html=$("#letterPaper").outerHTML;const w=window.open("","_blank","width=900,height=1000");if(!w)return toast("Popup blocked. Allow popups for Print/PDF.");w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc($("#subject").value||"Letter")}</title><link rel="stylesheet" href="style.css"><style>body{margin:0;background:#fff}.letter-paper{box-shadow:none;margin:0}.page-bg{display:block}@page{size:A4 portrait;margin:0}</style></head><body>${html}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);w.document.close()}
init();
