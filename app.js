"use strict";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const NP_MONTHS = ["Baisakh","Jestha","Ashadh","Shrawan","Bhadra","Ashwin","Kartik","Mangsir","Poush","Magh","Falgun","Chaitra"];
const CLASSES = ["Nursery","LKG","UKG",...Array.from({length:10},(_,i)=>`Class ${i+1}`)];
const PERMISSION_OPTIONS = [
  ["dashboard","Dashboard"],["studentList","Student Directory"],["studentSearch","Student Transaction Search"],["receiptRegister","Fee Receipt Register"],
  ["dailyCollection","Daily Collection / Fees Day Book"],["outstanding","Outstanding / Reminder Preview"],["examHallPass","Exam Hall Pass Eligibility"],
  ["quickRegister","Quick Receipt Register"],["monthly","Monthly Summary"],["headwise","Head-wise Collection"],["daybook","General Day Book"],["reports","General Reports"]
];
const DB_KEY = "sa_accounts_final_clean_v13";

/* ONLINE AUTH — Supabase */
const SUPABASE_URL = "https://hspsaglksnmhuqfuxccm.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-byhdB5_dxkqQ0YXmC8yEQ_xDSWMbOp";
const ACCOUNT_EMAILS = Object.freeze({
  accountant:"accountant@staugustine.edu.np",
  md:"md@staugustine.edu.np",
  ceo:"ceo@staugustine.edu.np"
});
/*
   Secure session rule:
   - Refresh / reload in the same browser tab keeps the Supabase login.
   - Closing the tab/browser clears the session, so the next open requires the password again.
   - We intentionally use sessionStorage instead of localStorage for Supabase Auth.
*/
try{
  localStorage.removeItem("sb-hspsaglksnmhuqfuxccm-auth-token");
}catch(_err){}

const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth:{
    persistSession:true,
    storage:window.sessionStorage,
    storageKey:"sa_accounts_supabase_session",
    autoRefreshToken:true,
    detectSessionInUrl:false
  }
});


function blankDB(){
  const defaultPerm={dashboard:true,studentList:false,studentSearch:false,receiptRegister:false,dailyCollection:true,outstanding:false,examHallPass:false,quickRegister:false,monthly:true,headwise:true,daybook:true,reports:true};
  return {
    version:5,
    settings:{
      schoolName:"St. Augustine Academic Foundation",address:"Suryodaya Municipality-11, Tinghare",estd:"2053",phone:"",pan:"",logoData:"",issuedBy:"Sagar",
      receiptPrefix:"R-",nextReceiptNumber:1,registrationPrefix:"",nextRegistrationNumber:1,workingDate:"2083-01-01",
      academicYears:["2083","2084","2085","2086","2087","2088","2089","2090"],
      permissions:{md:{...defaultPerm},ceo:{...defaultPerm}}
    },
    security:{initialized:false,users:{},failed:{}},
    routes:[],students:[],feeHeads:[],feePlans:[],overrides:[],receipts:[],quickReceipts:[],expenses:[],banks:[],bankTransactions:[],archivedStudents:[]
  };
}
let db=blankDB();
let session={role:null,page:"dashboard",loginAt:null,lastActivity:null};
let paymentState={year:"",className:"",studentId:"",selectedMonths:[],date:"",mode:"Cash",discount:0,paid:0};

function loadDB(){try{const raw=localStorage.getItem(DB_KEY);if(raw){db=Object.assign(blankDB(),JSON.parse(raw));db.settings=Object.assign(blankDB().settings,db.settings||{});db.security=Object.assign(blankDB().security,db.security||{});db.settings.permissions=db.settings.permissions||blankDB().settings.permissions;}}catch(e){console.error(e);db=blankDB();}}
function saveDB(){localStorage.setItem(DB_KEY,JSON.stringify(db));}
function uid(p="id"){return p+"_"+Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function money(n){return "Rs. "+Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:0,maximumFractionDigits:2})}
function num(n){const x=Number(n||0);return Number.isFinite(x)?x:0}
function sum(arr,fn=x=>x){return arr.reduce((a,x)=>a+num(fn(x)),0)}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove("show"),2600)}
function npDateValid(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||""))}
function workingDate(){return db.settings.workingDate||"2083-01-01"}
function yearOfDate(d){return String(d||"").slice(0,4)}
function monthIndexFromDate(d){const p=String(d||"").split("-");const i=Number(p[1])-1;return i>=0&&i<12?i:-1}
function monthNameFromDate(d){const i=monthIndexFromDate(d);return i>=0?NP_MONTHS[i]:""}
function roleName(r=session.role){return r==="accountant"?"Accountant":r==="ceo"?"CEO":"Managing Director (MD)"}
function isAccountant(){return session.role==="accountant"}
function hasPermission(page){if(isAccountant())return true;const p=db.settings.permissions?.[session.role]||{};const aliases={students:"studentList",quickRegister:"quickRegister"};const key=aliases[page]||page;return !!p[key] || page==="help" || page==="dashboard"&&!!p.dashboard}
function getYear(){return $("#academicYear")?.value||db.settings.academicYears[0]||"2083"}
function classesOptions(blank="Select Class"){return `<option value="">${blank}</option>`+CLASSES.map(c=>`<option>${c}</option>`).join("")}
function yearsOptions(selected=""){return db.settings.academicYears.map(y=>`<option ${String(y)===String(selected)?"selected":""}>${esc(y)}</option>`).join("")}
function monthsOptions(blank="Select Month"){return `<option value="">${blank}</option>`+NP_MONTHS.map((m,i)=>`<option value="${i}">${m}</option>`).join("")}
function routeById(id){return db.routes.find(x=>x.id===id)}
function studentById(id){return db.students.find(x=>x.id===id)}
function feeHeadById(id){return db.feeHeads.find(x=>x.id===id)}
function receiptById(id){return db.receipts.find(x=>x.id===id)}
function nextReceiptNo(commit=false){const s=db.settings;const value=`${s.receiptPrefix||""}${String(num(s.nextReceiptNumber)||1).padStart(5,"0")}`;if(commit){s.nextReceiptNumber=(num(s.nextReceiptNumber)||1)+1;saveDB()}return value}
function nextRegistrationNo(commit=false){const s=db.settings;const value=`${s.registrationPrefix||""}${String(num(s.nextRegistrationNumber)||1).padStart(4,"0")}`;if(commit){s.nextRegistrationNumber=(num(s.nextRegistrationNumber)||1)+1;saveDB()}return value}

/* Offline salted SHA-256 implementation */
function sha256(ascii){function rightRotate(v,a){return(v>>>a)|(v<<(32-a))}const mathPow=Math.pow,maxWord=mathPow(2,32),lengthProperty="length";let i,j,result="",words=[],asciiBitLength=ascii[lengthProperty]*8;let hash=sha256.h=sha256.h||[],k=sha256.k=sha256.k||[],primeCounter=k[lengthProperty],isComposite={};for(let candidate=2;primeCounter<64;candidate++){if(!isComposite[candidate]){for(i=0;i<313;i+=candidate)isComposite[i]=candidate;hash[primeCounter]=(mathPow(candidate,.5)*maxWord)|0;k[primeCounter++]=(mathPow(candidate,1/3)*maxWord)|0}}ascii+="\x80";while(ascii[lengthProperty]%64-56)ascii+="\x00";for(i=0;i<ascii[lengthProperty];i++){j=ascii.charCodeAt(i);if(j>>8)return "";words[i>>2]|=j<<((3-i)%4)*8}words[words[lengthProperty]]=((asciiBitLength/maxWord)|0);words[words[lengthProperty]]=asciiBitLength;for(j=0;j<words[lengthProperty];){let w=words.slice(j,j+=16),oldHash=hash;hash=hash.slice(0,8);for(i=0;i<64;i++){let w15=w[i-15],w2=w[i-2],a=hash[0],e=hash[4];let temp1=hash[7]+(rightRotate(e,6)^rightRotate(e,11)^rightRotate(e,25))+((e&hash[5])^((~e)&hash[6]))+k[i]+(w[i]=(i<16)?w[i]:(w[i-16]+(rightRotate(w15,7)^rightRotate(w15,18)^(w15>>>3))+w[i-7]+(rightRotate(w2,17)^rightRotate(w2,19)^(w2>>>10)))|0);let temp2=(rightRotate(a,2)^rightRotate(a,13)^rightRotate(a,22))+((a&hash[1])^(a&hash[2])^(hash[1]&hash[2]));hash=[(temp1+temp2)|0,a,hash[1],hash[2],(hash[3]+temp1)|0,hash[4],hash[5],hash[6]]}for(i=0;i<8;i++)hash[i]=(hash[i]+oldHash[i])|0}for(i=0;i<8;i++)for(j=3;j+1;j--){let b=(hash[i]>>(j*8))&255;result+=(b<16?0:"")+b.toString(16)}return result}
function salt(){return Array.from({length:16},()=>Math.floor(Math.random()*256).toString(16).padStart(2,"0")).join("")}
function setPassword(role,password){const s=salt();db.security.users[role]={salt:s,hash:sha256(s+"|"+password)};db.security.failed[role]={count:0,lockedUntil:0};}
function verifyPassword(role,password){const u=db.security.users[role];return !!u&&sha256(u.salt+"|"+password)===u.hash}
function lockInfo(role){const f=db.security.failed[role]||{count:0,lockedUntil:0};if(f.lockedUntil>Date.now())return f.lockedUntil-Date.now();return 0}
function recordFailed(role){const f=db.security.failed[role]||{count:0,lockedUntil:0};if(f.lockedUntil<=Date.now())f.lockedUntil=0;f.count=(f.count||0)+1;if(f.count>=5){f.count=0;f.lockedUntil=Date.now()+60000}db.security.failed[role]=f;saveDB();return f}
function clearFailed(role){db.security.failed[role]={count:0,lockedUntil:0};saveDB()}

async function loadOnlinePermissions(authUserId, role){
  if(role === "accountant") return;
  const keyMap={
    dashboard:"dashboard",
    student_directory:"studentList",
    student_transaction_search:"studentSearch",
    fee_receipt_register:"receiptRegister",
    daily_collection:"dailyCollection",
    outstanding_reminder:"outstanding",
    exam_hall_pass:"examHallPass",
    quick_receipt_register:"quickRegister",
    monthly_summary:"monthly",
    headwise_collection:"headwise",
    daybook:"daybook",
    general_reports:"reports",
    banking_report:"banking"
  };
  const {data,error}=await sb.from("user_report_permissions").select("report_key,can_view").eq("auth_user_id",authUserId);
  if(error) throw error;
  const perms={};
  (data||[]).forEach(row=>{const k=keyMap[row.report_key];if(k)perms[k]=!!row.can_view});
  db.settings.permissions[role]=perms;
}

async function openOnlineSession(user, expectedRole=null){
  const {data:profile,error}=await sb.from("app_users").select("auth_user_id,display_name,role,active").eq("auth_user_id",user.id).single();
  if(error) throw error;
  if(!profile?.active) throw new Error("This account is inactive.");
  if(expectedRole && profile.role!==expectedRole) throw new Error("This login does not match the selected role.");
  await loadOnlinePermissions(user.id,profile.role);
  session={role:profile.role,page:"dashboard",loginAt:new Date(),lastActivity:Date.now(),authUserId:user.id};
  $("#setupView").classList.add("hidden");
  $("#loginView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#topRole").textContent=roleName().toUpperCase();
  $("#userText").textContent=profile.display_name||roleName();
  $$('.accountant-only').forEach(x=>x.style.display=isAccountant()?"":"none");
  populateYears();
  if($("#workingDate")) $("#workingDate").value=db.settings.workingDate;
  updateSideLogo();
  renderPage();
  updateClock();
  if($("#loginPassword")) $("#loginPassword").value="";
}

async function initAuth(){
  loadDB();
  $("#setupView").classList.add("hidden");
  $("#appView").classList.add("hidden");
  if(!sb){
    $("#loginView").classList.remove("hidden");
    toast("Supabase library could not load. Check internet connection.");
    return;
  }
  try{
    const {data:{session:authSession}}=await sb.auth.getSession();
    if(authSession?.user){
      await openOnlineSession(authSession.user);
    }else{
      $("#loginView").classList.remove("hidden");
    }
  }catch(err){
    console.error(err);
    await sb.auth.signOut().catch(()=>{});
    $("#loginView").classList.remove("hidden");
    toast("Could not restore online session. Please login again.");
  }
}

async function logout(msg="Logged out."){
  if(sb) await sb.auth.signOut().catch(()=>{});
  $("#appView").classList.add("hidden");
  $("#setupView").classList.add("hidden");
  $("#loginView").classList.remove("hidden");
  if($("#loginPassword")) $("#loginPassword").value="";
  session={role:null,page:"dashboard",loginAt:null,lastActivity:null};
  toast(msg);
}

function navItems(){
 const all=[
  ["dashboard","▦","Dashboard"],["feePayment","▣","Fee Payment"],["quickReceipt","＋","Quick Receipt"],["quickRegister","▤","Quick Receipt Register"],["students","♟","Students"],["studentSearch","⌕","Fee Card"],["admitCard","🪪","Admit Card"],
  ["receiptRegister","▤","Receipt Register"],["feeStructure","≡","Fee Structure"],["dailyCollection","▥","Daily Collection"],["outstanding","!","Outstanding / Reminder"],
  ["examHallPass","✓","Exam Hall Pass"],["expenses","−","Expenses"],["daybook","▧","Day Book"],["monthly","▦","Monthly Summary"],["headwise","#","Head-wise Collection"],
  ["reports","▩","Reports"],["access","⚿","MD / CEO Access"],["settings","⚙","Settings"],["help","?","Help"]
 ];
 const accountantOnly=new Set(["feePayment","quickReceipt","feeStructure","expenses","access","settings"]);
 return all.filter(([p])=>isAccountant()?true:(!accountantOnly.has(p)&&hasPermission(p)));
}
function renderSideNav(){const n=$("#sideNav");n.innerHTML=navItems().map(([p,i,l])=>`<button class="nav-btn ${session.page===p?"active":""}" data-page="${p}"><span class="nav-icon">${i}</span>${l}</button>`).join("");$$('.nav-btn').forEach(b=>b.onclick=()=>navigate(b.dataset.page))}
const PAGE_TITLES={dashboard:"Accounts Dashboard",feePayment:"Fee Payment",quickReceipt:"Quick Receipt",quickRegister:"Quick Receipt Register",students:"Students",studentSearch:"Fee Card",admitCard:"Admit Card",receiptRegister:"Receipt Register",feeStructure:"Fee Structure",dailyCollection:"Daily Collection / Fees Day Book",outstanding:"Outstanding / Reminder",examHallPass:"Exam Hall Pass",expenses:"Expenses",daybook:"Day Book",monthly:"Monthly Summary",headwise:"Head-wise Collection",reports:"Reports",access:"MD / CEO Access Control",settings:"Settings",help:"Help"};
function navigate(page){if(!isAccountant()&&!hasPermission(page)){toast("This report is not enabled for your login.");return}session.page=page;renderPage()}
function renderPage(){renderSideNav();const title=PAGE_TITLES[session.page]||"Accounts";$("#pageTitle").textContent=title;$("#breadcrumb").textContent=`Accounts > ${title}`;const map={dashboard:renderDashboard,feePayment:renderFeePayment,quickReceipt:renderQuickReceipt,quickRegister:renderQuickRegister,students:renderStudents,studentSearch:renderStudentSearch,admitCard:renderAdmitCard,receiptRegister:renderReceiptRegister,feeStructure:renderFeeStructure,dailyCollection:renderDailyCollection,outstanding:renderOutstanding,examHallPass:renderExamHallPass,expenses:renderExpenses,daybook:renderDayBook,monthly:renderMonthly,headwise:renderHeadwise,reports:renderReports,access:renderAccess,settings:renderSettings,help:renderHelp};(map[session.page]||renderDashboard)();renderSideNav();}

function totalFeeIncome(){return sum(db.receipts,r=>r.paid)}
function totalQuickIncome(){return sum(db.quickReceipts,r=>r.amount)}
function totalExpense(){return sum(db.expenses,x=>x.amount)}
function totalDues(){return sum(db.students,s=>s.dues)}
function dashboardCard(title,value,subvalue,links,tone="blue"){return `<div class="dash-card premium-dash-card tone-${tone}"><div class="dash-card-head"><h3>${title}</h3></div><div class="dash-value">${value}</div>${subvalue?`<div class="dash-subvalue">${subvalue}</div>`:""}<div class="dash-links multi">${links.map(([l,p])=>`<button class="link-btn" onclick="navigate('${p}')">${l}</button>`).join("")}</div></div>`}
function renderDashboard(){
 let cards=[];
 const can=p=>isAccountant()||hasPermission(p);
 if(isAccountant()||can("receiptRegister"))cards.push(dashboardCard("Fee Collection",money(totalFeeIncome()),`Dues ${money(totalDues())}`,isAccountant() ? [["Fee Receive","feePayment"],["Receipts","receiptRegister"]] : [["Receipts","receiptRegister"]],"green"));
 if(isAccountant()||can("studentList")||can("studentSearch"))cards.push(dashboardCard("Students",String(db.students.length),"Active student records",isAccountant()?[["Students","students"],["Fee Card","studentSearch"]]:[["Students","students"],["Fee Card","studentSearch"]].filter(x=>can(x[1])),"blue"));
 if(isAccountant())cards.push(dashboardCard("Fee Setup",String(db.feeHeads.length),`${db.feePlans.length} plans · ${db.routes.length} routes`,[["Fee Setup","feeStructure"],["Fee Card","studentSearch"]],"violet"));
 if(isAccountant()||can("dailyCollection")||can("daybook"))cards.push(dashboardCard("Other Income",money(totalQuickIncome()),`Expenses ${money(totalExpense())}`,[["Daily Collection","dailyCollection"],["Day Book","daybook"]].filter(x=>can(x[1])),"amber"));
 if(isAccountant()||can("outstanding")||can("examHallPass"))cards.push(dashboardCard("Outstanding",money(totalDues()),"Current dues",[["Outstanding","outstanding"],["Exam Hall Pass","examHallPass"]].filter(x=>can(x[1])),"red"));
 if(isAccountant()||can("monthly")||can("headwise")||can("reports"))cards.push(dashboardCard("Reports",esc(getYear()),"Academic Year",[["Monthly","monthly"],["Head-wise","headwise"],["Reports","reports"]].filter(x=>can(x[1])),"slate"));
 if(isAccountant())cards.push(dashboardCard("Quick Receipt",String(db.quickReceipts.length),"Receipts",[["New Receipt","quickReceipt"],["Register","quickRegister"]],"cyan"));
 if(isAccountant())cards.push(dashboardCard("Controls","MD / CEO","Read-only access",[["Access","access"],["Settings","settings"]],"navy"));
 $("#content").innerHTML=`<div class="dashboard-welcome"><div><span class="dashboard-eyebrow">ST. AUGUSTINE ACADEMIC FOUNDATION</span><h3>Accounts Overview</h3></div><div class="dashboard-date"><span>Academic Year</span><b>${esc(getYear())}</b></div></div><div class="dashboard-grid premium-dashboard-grid">${cards.join("")}</div>`;
}

/* STUDENTS */
function renderStudents(){
 if(!isAccountant()&&!hasPermission("studentList")){return unauthorized()}
 const readonly=!isAccountant();
 $("#content").innerHTML=`
 <div class="section"><div class="section-title"><div><h3>Student Master</h3><p>Use Year → Class filtering. Student numbers are generated from Settings.</p></div>${readonly?"":`<button class="btn primary" id="newStudentBtn">+ New Admission</button>`}</div>
 <div class="toolbar"><div class="field"><label>Academic Year</label><select id="stuYear">${yearsOptions(getYear())}</select></div><div class="field"><label>Class</label><select id="stuClass">${classesOptions("All Classes")}</select></div><div class="field"><label>Route</label><select id="stuRoute"><option value="">All Routes</option>${db.routes.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join("")}</select></div><div class="field"><label>Gender</label><select id="stuGender"><option value="">All</option><option>Male</option><option>Female</option><option>Other</option></select></div><div class="field"><label>Search</label><input id="stuSearch" placeholder="Name / Registration / Phone"></div><button class="btn green" id="studentExport">Export Excel</button></div>
 <div id="studentHost"></div></div>`;
 if(!readonly)$("#newStudentBtn").onclick=()=>openStudentForm();["stuYear","stuClass","stuRoute","stuGender","stuSearch"].forEach(id=>$("#"+id).oninput=drawStudentList);$("#studentExport").onclick=exportStudents;drawStudentList();
}
function filteredStudents(){const y=$("#stuYear")?.value||getYear(),c=$("#stuClass")?.value||"",r=$("#stuRoute")?.value||"",g=$("#stuGender")?.value||"",q=($("#stuSearch")?.value||"").toLowerCase();return db.students.filter(s=>(!y||s.year===y)&&(!c||s.className===c)&&(!r||s.routeId===r)&&(!g||s.gender===g)&&(!q||[s.name,s.registrationNo,s.phone,s.guardian].some(v=>String(v||"").toLowerCase().includes(q))))}
function drawStudentList(){const rows=filteredStudents();$("#studentHost").innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Reg. No.</th><th>Student Name</th><th>Class</th><th>Guardian</th><th>Phone</th><th>Route</th><th class="amount">Dues</th>${isAccountant()?"<th>Action</th>":""}</tr></thead><tbody>${rows.map(s=>`<tr><td>${esc(s.registrationNo)}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.className)}</td><td>${esc(s.guardian||s.fatherName||s.motherName||"")}</td><td>${esc(s.phone||"")}</td><td>${esc(routeById(s.routeId)?.name||"")}</td><td class="amount ${num(s.dues)>0?"danger-text":""}">${money(s.dues)}</td>${isAccountant()?`<td class="nowrap"><button class="btn small" onclick="openStudentForm('${s.id}')">Edit</button> <button class="btn small" onclick="openLedgerDirect('${s.id}')">Ledger</button></td>`:""}</tr>`).join("")}</tbody></table></div>`:`<div class="empty">No students found.</div>`}
function openStudentForm(id=""){const s=id?studentById(id):null;const reg=s?.registrationNo||nextRegistrationNo(false);openModal("STUDENT MASTER",s?"Edit Student":"New Admission",`
 <form id="studentForm" class="form-grid three"><input type="hidden" name="id" value="${esc(s?.id||"")}"><div><label>Academic Year</label><select name="year">${yearsOptions(s?.year||getYear())}</select></div><div><label>Registration No.</label><input name="registrationNo" value="${esc(reg)}" ${s?"":"readonly"}></div><div><label>Class</label><select name="className" required>${classesOptions()} </select></div><div><label>Student Name</label><input name="name" value="${esc(s?.name||"")}" required></div><div><label>Roll No.</label><input name="roll" value="${esc(s?.roll||"")}"></div><div><label>Gender</label><select name="gender"><option></option><option>Male</option><option>Female</option><option>Other</option></select></div><div><label>Caste</label><input name="caste" value="${esc(s?.caste||"")}"></div><div><label>Category</label><select name="category"><option>New</option><option>Old</option></select></div><div><label>Route</label><select name="routeId"><option value="">No Bus Route</option>${db.routes.filter(r=>r.active!==false).map(r=>`<option value="${r.id}">${esc(r.name)} (${money(r.amount)}/month)</option>`).join("")}</select></div><div><label>Father Name</label><input name="fatherName" value="${esc(s?.fatherName||"")}"></div><div><label>Mother Name</label><input name="motherName" value="${esc(s?.motherName||"")}"></div><div><label>Guardian Name</label><input name="guardian" value="${esc(s?.guardian||"")}"></div><div><label>Phone</label><input name="phone" value="${esc(s?.phone||"")}"></div><div><label>Opening / Old Dues</label><input name="dues" type="number" min="0" step="0.01" value="${num(s?.dues)}"></div><div><label>Advance</label><input name="advance" type="number" min="0" step="0.01" value="${num(s?.advance)}"></div><div class="full form-actions"><button type="button" class="btn" onclick="closeModal()">Close</button><button class="btn primary">Save Student</button></div></form>`);
 const f=$("#studentForm");f.className="form-grid three";f.className="form-grid three";f.className="form-grid three";f.className="form-grid three"; // preserve modal form layout
 f.elements.className.value=s?.className||"";f.elements.gender.value=s?.gender||"";f.elements.category.value=s?.category||"New";f.elements.routeId.value=s?.routeId||"";
 f.onsubmit=e=>{e.preventDefault();const fd=new FormData(f);const obj=Object.fromEntries(fd.entries());if(s){Object.assign(s,obj,{dues:num(obj.dues),advance:num(obj.advance)});}else{db.students.push({id:uid("stu"),...obj,registrationNo:nextRegistrationNo(true),dues:num(obj.dues),advance:num(obj.advance),closedMonths:{},createdDate:workingDate()})}saveDB();closeModal();renderStudents();toast("Student saved.")};
}
function exportStudents(){const rows=filteredStudents().map(s=>[s.year,s.registrationNo,s.name,s.className,s.roll,s.gender,s.caste,s.category,s.fatherName,s.motherName,s.guardian,s.phone,routeById(s.routeId)?.name||"",s.dues]);exportXLS("Student_List.xls",["Year","Registration No","Student Name","Class","Roll","Gender","Caste","Category","Father","Mother","Guardian","Phone","Route","Dues"],rows,"Student List")}

/* FEE STRUCTURE */
function renderFeeStructure(){if(!isAccountant())return unauthorized();$("#content").innerHTML=`
 <div class="two-col"><div class="section"><div class="section-title"><div><h3>Route Plan / Master</h3><p>Route name is internal. Accounting receipts show this charge as “Transportation Fee”.</p></div><button class="btn primary" id="addRoute">+ Route</button></div><div id="routeHost"></div></div>
 <div class="section"><div class="section-title"><div><h3>Fee Heads</h3><p>Select exactly which Nepali months each fee applies.</p></div><button class="btn primary" id="addHead">+ Fee Head</button></div><div id="headHost"></div></div></div>
 <div class="section"><div class="section-title"><div><h3>Fee Plans</h3><p>Amount by Academic Year, Class and Student Category.</p></div><button class="btn primary" id="addPlan">+ Fee Plan</button></div><div id="planHost"></div></div>`;$("#addRoute").onclick=()=>openRouteForm();$("#addHead").onclick=()=>openFeeHeadForm();$("#addPlan").onclick=()=>openFeePlanForm();drawRoutes();drawFeeHeads();drawFeePlans()}
function drawRoutes(){const h=$("#routeHost");h.innerHTML=db.routes.length?`<div class="table-wrap compact"><table><thead><tr><th>Route</th><th class="amount">Monthly Bus Fee</th><th>Status</th><th>Action</th></tr></thead><tbody>${db.routes.map(r=>`<tr><td>${esc(r.name)}</td><td class="amount">${money(r.amount)}</td><td>${r.active!==false?"Active":"Inactive"}</td><td><button class="btn small" onclick="openRouteForm('${r.id}')">Edit</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No routes yet.</div>`}
function openRouteForm(id=""){const r=db.routes.find(x=>x.id===id);openModal("ROUTE PLAN",r?"Edit Route":"New Route",`<form id="routeForm" class="form-grid"><div><label>Route Name</label><input name="name" value="${esc(r?.name||"")}" required></div><div><label>Default Monthly Bus Fee</label><input name="amount" type="number" min="0" step="0.01" value="${num(r?.amount)}" required></div><div><label>Status</label><select name="active"><option value="true">Active</option><option value="false">Inactive</option></select></div><div class="full form-actions"><button type="button" class="btn" onclick="closeModal()">Close</button><button class="btn primary">Save</button></div></form>`);const f=$("#routeForm");f.elements.active.value=String(r?.active!==false);f.onsubmit=e=>{e.preventDefault();const fd=new FormData(f),o={name:fd.get("name"),amount:num(fd.get("amount")),active:fd.get("active")==="true"};r?Object.assign(r,o):db.routes.push({id:uid("route"),...o});saveDB();closeModal();renderFeeStructure();toast("Route saved.")}}
function drawFeeHeads(){const h=$("#headHost");h.innerHTML=db.feeHeads.length?`<div class="table-wrap compact"><table><thead><tr><th>Fee Head</th><th>Frequency</th><th>Applicable Months</th><th>Action</th></tr></thead><tbody>${db.feeHeads.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.frequency)}</td><td>${(x.months||[]).map(i=>NP_MONTHS[i]).join(", ")}</td><td><button class="btn small" onclick="openFeeHeadForm('${x.id}')">Edit</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No fee heads yet.</div>`}
function openFeeHeadForm(id=""){const x=feeHeadById(id);openModal("FEE HEAD",x?"Edit Fee Head":"New Fee Head",`<form id="headForm"><div class="form-grid"><div><label>Fee Head Name</label><input name="name" value="${esc(x?.name||"")}" required></div><div><label>Frequency / Type</label><select name="frequency"><option>Monthly</option><option>Quarterly</option><option>Half-Yearly</option><option>Yearly / One-Time</option><option>Selected Months</option></select></div><div class="full"><label>Applicable Nepali Months</label><div class="month-grid">${NP_MONTHS.map((m,i)=>`<label class="month-box"><input type="checkbox" name="months" value="${i}" ${(x?.months||[]).includes(i)?"checked":""}>${m}</label>`).join("")}</div></div><div class="full form-actions"><button type="button" class="btn" onclick="closeModal()">Close</button><button class="btn primary">Save Fee Head</button></div></div></form>`);const f=$("#headForm");f.elements.frequency.value=x?.frequency||"Monthly";f.onsubmit=e=>{e.preventDefault();const fd=new FormData(f),months=[...f.querySelectorAll('input[name="months"]:checked')].map(c=>num(c.value));if(!months.length)return toast("Select at least one applicable month.");const o={name:fd.get("name"),frequency:fd.get("frequency"),months};x?Object.assign(x,o):db.feeHeads.push({id:uid("head"),...o});saveDB();closeModal();renderFeeStructure();toast("Fee head saved.")}}
function drawFeePlans(){const h=$("#planHost");h.innerHTML=db.feePlans.length?`<div class="table-wrap"><table><thead><tr><th>Year</th><th>Fee Head</th><th>Category</th><th>Classes</th><th class="amount">Amount</th><th>Action</th></tr></thead><tbody>${db.feePlans.map(p=>`<tr><td>${p.year}</td><td>${esc(feeHeadById(p.headId)?.name||"")}</td><td>${esc(p.category)}</td><td>${(p.classes||[]).join(", ")}</td><td class="amount">${money(p.amount)}</td><td><button class="btn small" onclick="openFeePlanForm('${p.id}')">Edit</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No fee plans yet.</div>`}
function openFeePlanForm(id=""){const p=db.feePlans.find(x=>x.id===id);openModal("FEE PLAN",p?"Edit Fee Plan":"New Fee Plan",`<form id="planForm" class="form-grid"><div><label>Academic Year</label><select name="year">${yearsOptions(p?.year||getYear())}</select></div><div><label>Fee Head</label><select name="headId" required><option value="">Select Fee Head</option>${db.feeHeads.map(h=>`<option value="${h.id}">${esc(h.name)}</option>`).join("")}</select></div><div><label>Student Category</label><select name="category"><option>All</option><option>New</option><option>Old</option></select></div><div><label>Amount</label><input name="amount" type="number" min="0" step="0.01" value="${num(p?.amount)}" required></div><div class="full"><label>Classes</label><div class="multi-checks">${CLASSES.map(c=>`<label><input type="checkbox" name="classes" value="${c}" ${(p?.classes||[]).includes(c)?"checked":""}>${c}</label>`).join("")}</div></div><div class="full form-actions"><button type="button" class="btn" onclick="closeModal()">Close</button><button class="btn primary">Save Fee Plan</button></div></form>`);const f=$("#planForm");f.elements.headId.value=p?.headId||"";f.elements.category.value=p?.category||"All";f.onsubmit=e=>{e.preventDefault();const fd=new FormData(f),classes=[...f.querySelectorAll('input[name="classes"]:checked')].map(c=>c.value);if(!classes.length)return toast("Select at least one class.");const o={year:fd.get("year"),headId:fd.get("headId"),category:fd.get("category"),amount:num(fd.get("amount")),classes};p?Object.assign(p,o):db.feePlans.push({id:uid("plan"),...o});saveDB();closeModal();renderFeeStructure();toast("Fee plan saved.")}}

/* CHARGES / OVERRIDES */
function applicablePlan(student,headId,year){return db.feePlans.find(p=>p.year===year&&p.headId===headId&&(p.classes||[]).includes(student.className)&&(p.category==="All"||p.category===student.category))}
function overrideFor(studentId,year,monthIndex,type,refId){return db.overrides.find(o=>o.studentId===studentId&&o.year===year&&o.monthIndex===monthIndex&&o.type===type&&(o.refId||"")===(refId||""))}
function monthCharges(student,year,monthIndex){const items=[];db.feeHeads.forEach(h=>{if(!(h.months||[]).includes(monthIndex))return;const p=applicablePlan(student,h.id,year);if(!p)return;const ov=overrideFor(student.id,year,monthIndex,"fee",h.id);items.push({type:"fee",refId:h.id,label:h.name,amount:ov?num(ov.amount):num(p.amount),overridden:!!ov})});const route=routeById(student.routeId);if(route&&route.active!==false){const ov=overrideFor(student.id,year,monthIndex,"transport",route.id);items.push({type:"transport",refId:route.id,label:"Transportation Fee",amount:ov?num(ov.amount):num(route.amount),overridden:!!ov})}return items}
function isMonthClosed(student,year,idx){return !!student.closedMonths?.[year]?.includes(idx)}
function closeMonths(student,year,months){student.closedMonths=student.closedMonths||{};const set=new Set(student.closedMonths[year]||[]);months.forEach(m=>set.add(m));student.closedMonths[year]=[...set].sort((a,b)=>a-b)}
function studentOpenDueThrough(student,year,toIdx,fromIdx=0){let total=num(student.dues);for(let i=fromIdx;i<=toIdx;i++)if(!isMonthClosed(student,year,i))total+=sum(monthCharges(student,year,i),x=>x.amount);return total}

function openLedgerDirect(studentId){const s=studentById(studentId);if(!s)return;navigate("studentSearch");setTimeout(()=>{const y=$("#searchYear");const c=$("#searchClass");const st=$("#searchStudent");if(y){y.value=s.year;y.dispatchEvent(new Event("change"));c.value=s.className;c.dispatchEvent(new Event("change"));st.value=s.id;st.dispatchEvent(new Event("change"))}},0)}
function renderStudentSearch(){if(!isAccountant()&&!hasPermission("studentSearch"))return unauthorized();$("#content").innerHTML=`<div class="section"><div class="section-title"><div><h3>Student Report / Personal Ledger</h3><p>Students appear only after selecting Academic Year and Class.</p></div></div><div class="toolbar"><div class="field"><label>Academic Year</label><select id="searchYear"><option value="">Select Year</option>${yearsOptions()}</select></div><div class="field"><label>Class</label><select id="searchClass" disabled>${classesOptions()}</select></div><div class="field"><label>Student</label><select id="searchStudent" disabled><option value="">Select Student</option></select></div></div><div id="studentReportHost" style="margin-top:14px"></div></div>`;$("#searchYear").onchange=()=>{const y=$("#searchYear").value;$("#searchClass").disabled=!y;$("#searchClass").value="";$("#searchStudent").innerHTML='<option value="">Select Student</option>';$("#searchStudent").disabled=true;$("#studentReportHost").innerHTML=""};$("#searchClass").onchange=()=>{const y=$("#searchYear").value,c=$("#searchClass").value,arr=db.students.filter(s=>s.year===y&&s.className===c);$("#searchStudent").innerHTML='<option value="">Select Student</option>'+arr.map(s=>`<option value="${s.id}">${esc(s.registrationNo)} - ${esc(s.name)}</option>`).join("");$("#searchStudent").disabled=!c;$("#studentReportHost").innerHTML=""};$("#searchStudent").onchange=drawStudentReport}
function drawStudentReport(){const s=studentById($("#searchStudent").value),y=$("#searchYear").value;if(!s){$("#studentReportHost").innerHTML="";return}const receipts=db.receipts.filter(r=>r.studentId===s.id&&r.year===y).sort((a,b)=>a.date.localeCompare(b.date)||a.receiptNo.localeCompare(b.receiptNo));const rows=receipts.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.receiptNo)}</td><td>${esc(r.months.map(i=>NP_MONTHS[i]).join(", "))}</td><td>${r.items.map(i=>`${esc(i.label)}: ${money(i.amount)}`).join("<br>")}</td><td class="amount">${money(r.grandTotal)}</td><td class="amount">${money(r.paid)}</td><td class="amount">${money(r.balance)}</td><td>${isAccountant()?`<button class="btn small" onclick="showReceiptById('${r.id}')">View / Reprint</button>`:`View only`}</td></tr>`).join("");$("#studentReportHost").innerHTML=`<div class="summary-strip"><div class="summary-box"><small>Registration</small><strong>${esc(s.registrationNo)}</strong></div><div class="summary-box"><small>Student</small><strong>${esc(s.name)}</strong></div><div class="summary-box"><small>Class</small><strong>${esc(s.className)}</strong></div><div class="summary-box"><small>Current Dues</small><strong class="stat-red">${money(s.dues)}</strong></div><div class="summary-box"><small>Route</small><strong>${esc(routeById(s.routeId)?.name||"-")}</strong></div></div>${isAccountant()?`<div class="section"><div class="section-title"><div><h3>Personal Fee Overrides</h3><p>Change one student's one month fee without changing the master rate.</p></div><button class="btn primary" onclick="openOverrideForm('${s.id}','${y}')">+ Add Override</button></div>${overrideTable(s.id,y)}</div>`:""}<div class="section"><div class="section-title"><div><h3>Transaction History</h3></div></div>${receipts.length?`<div class="table-wrap"><table><thead><tr><th>Nepali Date</th><th>Receipt No.</th><th>Fee Months</th><th>Fee Details</th><th class="amount">Grand Total</th><th class="amount">Received</th><th class="amount">Dues After</th><th>Receipt</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="empty">No transactions for this student.</div>`}</div><div class="section"><div class="section-title"><div><h3>Month-wise Ledger</h3></div></div>${ledgerTable(s,y)}</div>`}
function ledgerTable(s,y){return `<div class="table-wrap"><table><thead><tr><th>Month</th><th>Status</th><th>Applicable Charges</th><th class="amount">Total</th></tr></thead><tbody>${NP_MONTHS.map((m,i)=>{const items=monthCharges(s,y,i),closed=isMonthClosed(s,y,i);return `<tr><td>${m}</td><td>${closed?'<span class="chip good">Processed</span>':'<span class="chip blue">Open</span>'}</td><td>${items.map(x=>`${esc(x.label)} ${x.overridden?'<span class="chip">Override</span>':''}: ${money(x.amount)}`).join("<br>")||"-"}</td><td class="amount">${money(sum(items,x=>x.amount))}</td></tr>`}).join("")}</tbody></table></div>`}
function overrideTable(studentId,year){const arr=db.overrides.filter(o=>o.studentId===studentId&&o.year===year);return arr.length?`<div class="table-wrap compact"><table><thead><tr><th>Month</th><th>Fee</th><th class="amount">Override Amount</th><th>Reason</th><th>Action</th></tr></thead><tbody>${arr.map(o=>`<tr><td>${NP_MONTHS[o.monthIndex]}</td><td>${o.type==="transport"?"Transportation Fee":esc(feeHeadById(o.refId)?.name||"")}</td><td class="amount">${money(o.amount)}</td><td>${esc(o.reason||"")}</td><td><button class="btn small" onclick="openOverrideForm('${studentId}','${year}','${o.id}')">Edit</button> <button class="btn small red" onclick="deleteOverride('${o.id}')">Delete</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No personal overrides.</div>`}
function openOverrideForm(studentId,year,id=""){const s=studentById(studentId),o=db.overrides.find(x=>x.id===id);const feeOpts=db.feeHeads.map(h=>`<option value="fee|${h.id}">${esc(h.name)}</option>`).join("")+(s.routeId?`<option value="transport|${s.routeId}">Transportation Fee</option>`:"");openModal("PERSONAL LEDGER","Personal Fee Override",`<form id="overrideForm" class="form-grid"><div><label>Month</label><select name="monthIndex">${NP_MONTHS.map((m,i)=>`<option value="${i}">${m}</option>`).join("")}</select></div><div><label>Fee</label><select name="feeKey">${feeOpts}</select></div><div><label>Override Amount</label><input name="amount" type="number" min="0" step="0.01" value="${num(o?.amount)}" required></div><div><label>Reason</label><input name="reason" value="${esc(o?.reason||"")}"></div><div class="full form-actions"><button type="button" class="btn" onclick="closeModal()">Close</button><button class="btn primary">Save Override</button></div></form>`);const f=$("#overrideForm");if(o){f.elements.monthIndex.value=o.monthIndex;f.elements.feeKey.value=`${o.type}|${o.refId}`}f.onsubmit=e=>{e.preventDefault();const fd=new FormData(f),[type,refId]=fd.get("feeKey").split("|");const obj={studentId,year,monthIndex:num(fd.get("monthIndex")),type,refId,amount:num(fd.get("amount")),reason:fd.get("reason")};o?Object.assign(o,obj):db.overrides.push({id:uid("ov"),...obj});saveDB();closeModal();drawStudentReport();toast("Override saved.")}}
function deleteOverride(id){if(!confirm("Delete this personal override?"))return;db.overrides=db.overrides.filter(x=>x.id!==id);saveDB();drawStudentReport();toast("Override deleted.")}

/* FEE PAYMENT */
function renderFeePayment(){if(!isAccountant())return unauthorized();paymentState={year:getYear(),className:"",studentId:"",selectedMonths:[],date:workingDate(),mode:"Cash",discount:0,paid:0};$("#content").innerHTML=`<div class="section"><div class="section-title"><div><h3>Fee Payment</h3><p>Receipt number is automatic. Select Year → Class → Student → Month(s).</p></div><div><b>Next Receipt:</b> ${esc(nextReceiptNo(false))}</div></div><div class="form-grid three"><div><label>Academic Year</label><select id="payYear">${yearsOptions(paymentState.year)}</select></div><div><label>Class</label><select id="payClass">${classesOptions()}</select></div><div><label>Student</label><select id="payStudent" disabled><option value="">Select Student</option></select></div><div><label>Nepali Date</label><input id="payDate" value="${esc(workingDate())}" placeholder="2083-05-25"></div><div><label>Payment Mode</label><select id="payMode"><option>Cash</option><option>Bank</option></select></div><div><label>Registration No.</label><input id="payReg" readonly></div></div></div><div id="payHost"></div>`;$("#payClass").onchange=fillPayStudents;$("#payYear").onchange=fillPayStudents;$("#payStudent").onchange=drawPayPanel;$("#payDate").oninput=e=>paymentState.date=e.target.value;$("#payMode").onchange=e=>paymentState.mode=e.target.value}
function fillPayStudents(){const y=$("#payYear").value,c=$("#payClass").value,arr=db.students.filter(s=>s.year===y&&s.className===c);$("#payStudent").disabled=!c;$("#payStudent").innerHTML='<option value="">Select Student</option>'+arr.map(s=>`<option value="${s.id}">${esc(s.registrationNo)} - ${esc(s.name)}</option>`).join("");$("#payHost").innerHTML="";$("#payReg").value=""}
function drawPayPanel(){const s=studentById($("#payStudent").value),y=$("#payYear").value;if(!s){$("#payHost").innerHTML="";return}paymentState.year=y;paymentState.studentId=s.id;paymentState.selectedMonths=[];$("#payReg").value=s.registrationNo;const months=NP_MONTHS.map((m,i)=>`<label class="month-box ${isMonthClosed(s,y,i)?"processed":""}"><input class="payMonth" type="checkbox" value="${i}" ${isMonthClosed(s,y,i)?"disabled":""}>${m}${isMonthClosed(s,y,i)?" — Processed":""}</label>`).join("");$("#payHost").innerHTML=`<div class="section"><div class="section-title"><div><h3>${esc(s.name)} — ${esc(s.className)}</h3><p>Guardian: ${esc(s.guardian||s.fatherName||s.motherName||"-")} · Current Dues: ${money(s.dues)}</p></div></div><div class="month-grid">${months}</div></div><div id="payCalc"></div>`;$$('.payMonth').forEach(c=>c.onchange=()=>{paymentState.selectedMonths=$$('.payMonth:checked').map(x=>num(x.value));drawPaymentCalc()});drawPaymentCalc()}
function currentPayItems(s,y,months){const rows=[];months.forEach(mi=>monthCharges(s,y,mi).forEach(i=>rows.push({...i,monthIndex:mi,month:NP_MONTHS[mi]})));return rows}
function drawPaymentCalc(){const s=studentById(paymentState.studentId),y=paymentState.year;if(!s)return;const items=currentPayItems(s,y,paymentState.selectedMonths),currentTotal=sum(items,x=>x.amount),oldDues=num(s.dues),grand=currentTotal+oldDues,discount=Math.min(num(paymentState.discount),grand),net=Math.max(0,grand-discount);if(!paymentState.paid)paymentState.paid=net;$("#payCalc").innerHTML=`<div class="section"><div class="section-title"><div><h3>Selected Fee Details</h3><p>Transportation is shown as “Transportation Fee” regardless of route name.</p></div></div>${items.length?`<div class="payment-lines">${items.map(i=>`<div class="payment-line"><div class="month">${i.month}</div><div class="label">${esc(i.label)}${i.overridden?' <span class="chip">Personal Override</span>':''}</div><div class="amt">${money(i.amount)}</div></div>`).join("")}</div>`:`<div class="empty">Select one or more open months.</div>`}<div class="totals-panel" style="margin-top:12px"><div class="row"><span>Current Fee Total</span><b>${money(currentTotal)}</b></div><div class="row"><span>Old Dues</span><b>${money(oldDues)}</b></div><div class="row"><span>Discount</span><input id="payDiscount" type="number" min="0" step="0.01" value="${num(paymentState.discount)}"></div><div class="row grand"><span>Net Payable</span><b>${money(net)}</b></div><div class="row"><span>Received Amount</span><input id="payPaid" type="number" min="0" step="0.01" value="${num(paymentState.paid)}"></div><div class="row"><span>New Dues / Balance</span><b class="stat-red">${money(Math.max(0,net-num(paymentState.paid)))}</b></div><div class="row"><span>Advance</span><b>${money(Math.max(0,num(paymentState.paid)-net))}</b></div></div><div class="form-actions" style="margin-top:12px"><button class="btn primary big" id="savePayment" ${paymentState.selectedMonths.length||oldDues>0?"":"disabled"}>Save & Print Receipt</button></div></div>`;$("#payDiscount").oninput=e=>{paymentState.discount=num(e.target.value);paymentState.paid=Math.max(0,grand-paymentState.discount);drawPaymentCalc()};$("#payPaid").oninput=e=>{paymentState.paid=num(e.target.value);const out=$("#payPaid");out.value=e.target.value;const net2=Math.max(0,grand-num(paymentState.discount));const rows=$$(".totals-panel .row");rows[5].querySelector("b").textContent=money(Math.max(0,net2-paymentState.paid));rows[6].querySelector("b").textContent=money(Math.max(0,paymentState.paid-net2))};$("#savePayment").onclick=savePayment}
function savePayment(){const s=studentById(paymentState.studentId),y=paymentState.year;if(!s)return;if(!npDateValid(paymentState.date))return toast("Enter Nepali date as YYYY-MM-DD.");const items=currentPayItems(s,y,paymentState.selectedMonths),currentTotal=sum(items,x=>x.amount),oldDues=num(s.dues),grand=currentTotal+oldDues,discount=Math.min(num(paymentState.discount),grand),net=Math.max(0,grand-discount),paid=num(paymentState.paid),balance=Math.max(0,net-paid),advance=Math.max(0,paid-net);if(!items.length&&oldDues<=0)return toast("Select at least one payable month.");const receipt={id:uid("rcp"),receiptNo:nextReceiptNo(true),date:paymentState.date,year:y,studentId:s.id,registrationNo:s.registrationNo,studentName:s.name,className:s.className,guardian:s.guardian||s.fatherName||s.motherName||"",months:[...paymentState.selectedMonths],items,oldDues,currentTotal,grandTotal:grand,discount,netPayable:net,paid,balance,advance,mode:paymentState.mode,issuedBy:db.settings.issuedBy};db.receipts.push(receipt);closeMonths(s,y,paymentState.selectedMonths);s.dues=balance;s.advance=num(s.advance)+advance;saveDB();showReceiptById(receipt.id,true);toast("Payment saved. Processed months are now closed.");renderFeePayment()}

/* RECEIPTS */
function renderReceiptRegister(){if(!isAccountant()&&!hasPermission("receiptRegister"))return unauthorized();$("#content").innerHTML=`<div class="section"><div class="section-title"><div><h3>Fee Receipt Register</h3><p>Search old receipts and reprint them.</p></div><button class="btn green" id="receiptExport">Export Excel</button></div><div class="toolbar"><div class="field"><label>Receipt / Student</label><input id="receiptSearch" placeholder="Receipt No. / Name / Reg. No."></div><div class="field"><label>From Nepali Date</label><input id="receiptFrom" placeholder="2083-01-01"></div><div class="field"><label>To Nepali Date</label><input id="receiptTo" placeholder="2083-12-30"></div></div><div id="receiptRegHost" style="margin-top:12px"></div></div>`;["receiptSearch","receiptFrom","receiptTo"].forEach(id=>$("#"+id).oninput=drawReceiptRegister);$("#receiptExport").onclick=()=>{const arr=receiptRegisterRows();exportXLS("Fee_Receipt_Register.xls",["Date","Receipt No","Reg No","Student","Class","Months","Total","Discount","Received","Dues","Mode"],arr.map(r=>[r.date,r.receiptNo,r.registrationNo,r.studentName,r.className,r.months.map(i=>NP_MONTHS[i]).join(", "),r.grandTotal,r.discount,r.paid,r.balance,r.mode]),"Fee Receipt Register")};drawReceiptRegister()}
function receiptRegisterRows(){const q=($("#receiptSearch")?.value||"").toLowerCase(),f=$("#receiptFrom")?.value||"",t=$("#receiptTo")?.value||"";return db.receipts.filter(r=>(!q||[r.receiptNo,r.studentName,r.registrationNo].some(v=>String(v||"").toLowerCase().includes(q)))&&(!f||r.date>=f)&&(!t||r.date<=t)).sort((a,b)=>b.date.localeCompare(a.date)||b.receiptNo.localeCompare(a.receiptNo))}
function drawReceiptRegister(){const arr=receiptRegisterRows();$("#receiptRegHost").innerHTML=arr.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Student</th><th>Class</th><th>Months</th><th class="amount">Received</th><th class="amount">Dues</th><th>Mode</th><th>Action</th></tr></thead><tbody>${arr.map(r=>`<tr><td>${r.date}</td><td><b>${esc(r.receiptNo)}</b></td><td>${esc(r.studentName)}</td><td>${esc(r.className)}</td><td>${r.months.map(i=>NP_MONTHS[i]).join(", ")}</td><td class="amount">${money(r.paid)}</td><td class="amount">${money(r.balance)}</td><td>${r.mode}</td><td>${isAccountant()?`<button class="btn small" onclick="showReceiptById('${r.id}')">View / Reprint</button>`:"View only"}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No receipts found.</div>`}
function receiptHTML(r){const logo=db.settings.logoData?`<img src="${db.settings.logoData}" alt="Logo">`:`<div style="font-weight:900;font-size:22px">SA</div>`;return `<div class="a5-receipt" id="printReceipt"><div class="receipt-head"><div class="receipt-school"><h1>${esc(db.settings.schoolName)}</h1><p>${esc(db.settings.address)}</p><p><b>ESTD:</b> ${esc(db.settings.estd||"")} &nbsp; <b>Telephone:</b> ${esc(db.settings.phone||"")} &nbsp; <b>PAN No.:</b> ${esc(db.settings.pan||"")}</p></div><div class="receipt-logo">${logo}</div></div><div class="receipt-title">FEE RECEIPT</div><div class="receipt-meta"><div><b>Receipt No.:</b> ${esc(r.receiptNo)}</div><div><b>Nepali Date:</b> ${esc(r.date)}</div><div><b>Registration No.:</b> ${esc(r.registrationNo)}</div><div><b>Class:</b> ${esc(r.className)}</div><div><b>Student Name:</b> ${esc(r.studentName)}</div><div><b>Parent/Guardian:</b> ${esc(r.guardian||"")}</div><div style="grid-column:1/-1"><b>Fee For Month(s):</b> ${esc(r.months.map(i=>NP_MONTHS[i]).join(", ")||"-")}</div></div><div class="receipt-olddues"><b>Old Dues:</b> ${num(r.oldDues)>0?money(r.oldDues):""}</div><table class="receipt-table"><thead><tr><th style="width:7%">S.N.</th><th>Particular</th><th style="width:20%">Total Amount</th><th style="width:20%">Receive Amount</th><th style="width:18%">Balance</th></tr></thead><tbody>${r.items.map((i,idx)=>`<tr><td class="center">${idx+1}</td><td>${esc(i.month?i.month+" - ":"")}${esc(i.label)}</td><td class="num">${money(i.amount)}</td><td></td><td></td></tr>`).join("")||`<tr><td class="center">1</td><td>Old Dues Payment</td><td class="num">${money(r.oldDues)}</td><td></td><td></td></tr>`}</tbody></table><table class="receipt-summary"><tr><td>Total Amount</td><td>${money(r.currentTotal)}</td></tr><tr><td>Dues</td><td>${num(r.oldDues)>0?money(r.oldDues):""}</td></tr><tr><td><b>Grand Total</b></td><td><b>${money(r.netPayable)}</b></td></tr><tr><td>Received Amount</td><td>${money(r.paid)}</td></tr><tr><td>Balance</td><td>${money(r.balance)}</td></tr></table><div class="amount-words"><b>Amount in Words:</b> ${esc(amountInWords(r.paid))} only.</div><div class="receipt-note">Bill is essential to get the deposit refunded.</div><div class="receipt-sign"><div class="sign-block left">Issued by: <b>${esc(db.settings.issuedBy||r.issuedBy||"")}</b></div><div class="sign-block">Accountant</div></div><div class="receipt-foot">Computer generated fee receipt · Nepali Date: ${esc(r.date)}</div></div>`}
function showReceiptById(id,autoPrint=false){const r=receiptById(id);if(!r)return;openModal("RECEIPT",`Receipt ${r.receiptNo}`,`<div class="no-print form-actions" style="margin-bottom:10px"><button class="btn" onclick="closeModal()">Close</button>${isAccountant()?`<button class="btn primary" onclick="printReceipt('${r.id}')">Print / Reprint A5</button>`:""}</div><div class="receipt-preview">${receiptHTML(r)}</div>`);if(autoPrint)setTimeout(()=>printReceipt(r.id),250)}
function printReceipt(id){const r=receiptById(id);if(!r)return;const w=window.open("","_blank","width=760,height=900");w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(r.receiptNo)}</title><link rel="stylesheet" href="style.css"></head><body>${receiptHTML(r)}<script>setTimeout(()=>window.print(),400)<\/script></body></html>`);w.document.close()}
function amountInWords(n){n=Math.round(num(n));if(n===0)return "Zero Rupees";const one=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"],ten=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];function two(x){return x<20?one[x]:ten[Math.floor(x/10)]+(x%10?" "+one[x%10]:"")}function three(x){return x>=100?one[Math.floor(x/100)]+" Hundred"+(x%100?" "+two(x%100):""):two(x)}let parts=[];if(n>=10000000){parts.push(three(Math.floor(n/10000000))+" Crore");n%=10000000}if(n>=100000){parts.push(two(Math.floor(n/100000))+" Lakh");n%=100000}if(n>=1000){parts.push(two(Math.floor(n/1000))+" Thousand");n%=1000}if(n)parts.push(three(n));return "Rupees "+parts.join(" ")}

/* QUICK RECEIPT */
function renderQuickReceipt(){if(!isAccountant())return unauthorized();$("#content").innerHTML=`<div class="two-col"><div class="section"><div class="section-title"><div><h3>New Quick Receipt</h3><p>For rent, extra income and other non-student school income.</p></div><b>Next Receipt: ${esc(nextReceiptNo(false))}</b></div><form id="quickForm" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(workingDate())}" placeholder="2083-05-25" required></div><div><label>Payment Mode</label><select name="mode"><option>Cash</option><option>Bank</option></select></div><div class="full"><label>Income Topic / Title</label><input name="title" placeholder="Rent Income / Extra Income / Other Income" required></div><div><label>Amount</label><input name="amount" type="number" min="0" step="0.01" required></div><div><label>Received From (optional)</label><input name="receivedFrom"></div><div class="full"><label>Remarks</label><textarea name="remarks"></textarea></div><div class="full form-actions"><button class="btn primary big">Save & Print Quick Receipt</button></div></form></div><div class="section"><div class="section-title"><div><h3>Quick Receipt Register</h3><p>All non-student income is included in school income reports.</p></div><button class="btn green" id="quickExport">Export Excel</button></div><div id="quickList"></div></div></div>`;$("#quickForm").onsubmit=saveQuickReceipt;$("#quickExport").onclick=exportQuickReceipts;drawQuickList()}

function renderQuickRegister(){if(!isAccountant()&&!hasPermission("quickRegister"))return unauthorized();const a=[...db.quickReceipts].sort((x,y)=>y.date.localeCompare(x.date));$("#content").innerHTML=`<div class="section"><div class="section-title"><div><h3>Quick Receipt Register</h3><p>Miscellaneous school income. MD/CEO access is read-only.</p></div>${isAccountant()?`<button class="btn green" id="qrExportOnly">Export Excel</button>`:""}</div>${a.length?`<div class="table-wrap"><table><thead><tr><th>Nepali Date</th><th>Receipt No.</th><th>Income Title</th><th>Received From</th><th>Mode</th><th class="amount">Amount</th><th>Remarks</th><th>Action</th></tr></thead><tbody>${a.map(q=>`<tr><td>${q.date}</td><td><b>${esc(q.receiptNo)}</b></td><td>${esc(q.title)}</td><td>${esc(q.receivedFrom||"")}</td><td>${q.mode}</td><td class="amount">${money(q.amount)}</td><td>${esc(q.remarks||"")}</td><td>${isAccountant()?`<button class="btn small" onclick="showQuickReceipt('${q.id}')">View / Reprint</button>`:"Read only"}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No Quick Receipts.</div>`}</div>`;if(isAccountant())$("#qrExportOnly").onclick=exportQuickReceipts}

function saveQuickReceipt(e){e.preventDefault();const fd=new FormData(e.target),date=fd.get("date");if(!npDateValid(date))return toast("Enter Nepali date as YYYY-MM-DD.");const q={id:uid("qrcp"),receiptNo:nextReceiptNo(true),date,year:yearOfDate(date),mode:fd.get("mode"),title:fd.get("title"),amount:num(fd.get("amount")),receivedFrom:fd.get("receivedFrom"),remarks:fd.get("remarks"),issuedBy:db.settings.issuedBy};db.quickReceipts.push(q);saveDB();showQuickReceipt(q.id,true);renderQuickReceipt();toast("Quick Receipt saved.")}
function drawQuickList(){const arr=[...db.quickReceipts].sort((a,b)=>b.date.localeCompare(a.date));$("#quickList").innerHTML=arr.length?`<div class="table-wrap compact"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Title</th><th>Mode</th><th class="amount">Amount</th><th>Action</th></tr></thead><tbody>${arr.map(q=>`<tr><td>${q.date}</td><td>${esc(q.receiptNo)}</td><td>${esc(q.title)}</td><td>${q.mode}</td><td class="amount">${money(q.amount)}</td><td><button class="btn small" onclick="showQuickReceipt('${q.id}')">View / Reprint</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No Quick Receipts yet.</div>`}
function quickReceiptHTML(q){const logo=db.settings.logoData?`<img src="${db.settings.logoData}">`:`<b>SA</b>`;return `<div class="a5-receipt"><div class="receipt-head"><div class="receipt-school"><h1>${esc(db.settings.schoolName)}</h1><p>${esc(db.settings.address)}</p><p>ESTD: ${esc(db.settings.estd)} · Tel: ${esc(db.settings.phone)} · PAN: ${esc(db.settings.pan)}</p></div><div class="receipt-logo">${logo}</div></div><div class="receipt-title">QUICK RECEIPT</div><div class="receipt-meta"><div><b>Receipt No.:</b> ${esc(q.receiptNo)}</div><div><b>Nepali Date:</b> ${esc(q.date)}</div><div><b>Received From:</b> ${esc(q.receivedFrom||"-")}</div><div><b>Mode:</b> ${esc(q.mode)}</div></div><table class="receipt-table" style="margin-top:10px"><thead><tr><th>S.N.</th><th>Particular</th><th>Amount</th></tr></thead><tbody><tr><td class="center">1</td><td>${esc(q.title)}${q.remarks?`<br><small>${esc(q.remarks)}</small>`:""}</td><td class="num">${money(q.amount)}</td></tr></tbody></table><div class="amount-words"><b>Amount in Words:</b> ${esc(amountInWords(q.amount))} only.</div><div class="receipt-sign" style="margin-top:35px"><div class="sign-block left">Issued by: <b>${esc(db.settings.issuedBy)}</b></div><div class="sign-block">Accountant</div></div></div>`}
function showQuickReceipt(id,autoPrint=false){const q=db.quickReceipts.find(x=>x.id===id);if(!q)return;openModal("QUICK RECEIPT",`Receipt ${q.receiptNo}`,`<div class="no-print form-actions" style="margin-bottom:10px"><button class="btn" onclick="closeModal()">Close</button>${isAccountant()?`<button class="btn primary" onclick="printQuickReceipt('${q.id}')">Print / Reprint</button>`:""}</div><div class="receipt-preview">${quickReceiptHTML(q)}</div>`);if(autoPrint)setTimeout(()=>printQuickReceipt(q.id),250)}
function printQuickReceipt(id){const q=db.quickReceipts.find(x=>x.id===id);if(!q)return;const w=window.open("","_blank","width=760,height=900");w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="style.css"><title>${esc(q.receiptNo)}</title></head><body>${quickReceiptHTML(q)}<script>setTimeout(()=>window.print(),400)<\/script></body></html>`);w.document.close()}
function exportQuickReceipts(){exportXLS("Quick_Receipt_Register.xls",["Nepali Date","Receipt No","Title","Received From","Mode","Amount","Remarks"],db.quickReceipts.map(q=>[q.date,q.receiptNo,q.title,q.receivedFrom,q.mode,q.amount,q.remarks]),"Quick Receipt Register")}

/* DAILY COLLECTION */
function renderDailyCollection(){if(!isAccountant()&&!hasPermission("dailyCollection"))return unauthorized();$("#content").innerHTML=`<div class="section"><div class="section-title"><div><h3>Daily Collection / Fees Day Book</h3><p>Use one day, two days, or any Nepali date range.</p></div><div class="toolbar"><button class="btn" id="dcSummary">Summary</button><button class="btn green" id="dcExport">Export Excel</button></div></div><div class="toolbar"><div class="field"><label>From Nepali Date</label><input id="dcFrom" value="${esc(workingDate())}" placeholder="2083-05-01"></div><div class="field"><label>To Nepali Date</label><input id="dcTo" value="${esc(workingDate())}" placeholder="2083-05-30"></div><button class="btn cyan" id="dcSearch">Search</button></div><div id="dailyHost" style="margin-top:12px"></div></div>`;$("#dcSearch").onclick=drawDailyCollection;$("#dcSummary").onclick=()=>{const rows=dailyRows();toast(`Receipts: ${rows.length} · Collection: ${money(sum(rows,r=>r.paid))}`)};$("#dcExport").onclick=exportDailyCollection;drawDailyCollection()}
function dailyRows(){const f=$("#dcFrom")?.value||"",t=$("#dcTo")?.value||"";return db.receipts.filter(r=>(!f||r.date>=f)&&(!t||r.date<=t)).sort((a,b)=>a.date.localeCompare(b.date)||a.receiptNo.localeCompare(b.receiptNo))}
function dailyHeads(rows){const set=[];rows.forEach(r=>r.items.forEach(i=>{if(!set.includes(i.label))set.push(i.label)}));return set}
function itemTotalByLabel(r,label){return sum(r.items.filter(i=>i.label===label),i=>i.amount)}
function drawDailyCollection(){const rows=dailyRows(),heads=dailyHeads(rows);const cols=heads.map(h=>`<th class="amount">${esc(h)}</th>`).join("");const data=rows.map(r=>`<tr><td>${r.date}</td><td>${esc(r.receiptNo)}</td><td>${esc(r.studentName)}</td><td>${esc(r.className)}</td>${heads.map(h=>`<td class="amount">${itemTotalByLabel(r,h)?money(itemTotalByLabel(r,h)):"-"}</td>`).join("")}<td class="amount">${money(r.currentTotal)}</td><td class="amount">${money(r.discount)}</td><td class="amount">${money(r.paid)}</td><td class="amount">${money(r.balance)}</td><td class="amount">${r.mode==="Cash"?money(r.paid):"-"}</td><td class="amount">${r.mode==="Bank"?money(r.paid):"-"}</td></tr>`).join("");const total=`<tr class="total-row"><td colspan="4"><b>TOTAL</b></td>${heads.map(h=>`<td class="amount">${money(sum(rows,r=>itemTotalByLabel(r,h)))}</td>`).join("")}<td class="amount">${money(sum(rows,r=>r.currentTotal))}</td><td class="amount">${money(sum(rows,r=>r.discount))}</td><td class="amount">${money(sum(rows,r=>r.paid))}</td><td class="amount">${money(sum(rows,r=>r.balance))}</td><td class="amount">${money(sum(rows,r=>r.mode==="Cash"?r.paid:0))}</td><td class="amount">${money(sum(rows,r=>r.mode==="Bank"?r.paid:0))}</td></tr>`;$("#dailyHost").innerHTML=rows.length?`<div class="table-wrap cyan-table"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Student</th><th>Class</th>${cols}<th class="amount">Total Fees</th><th class="amount">Discount</th><th class="amount">Received</th><th class="amount">Dues</th><th class="amount">Cash</th><th class="amount">Bank</th></tr></thead><tbody>${data}${total}</tbody></table></div>`:`<div class="empty">No fee receipts in this date range.</div>`}
function exportDailyCollection(){const rows=dailyRows(),heads=dailyHeads(rows),headers=["Date","Receipt No","Student","Class",...heads,"Total Fees","Discount","Received","Dues","Cash","Bank"],data=rows.map(r=>[r.date,r.receiptNo,r.studentName,r.className,...heads.map(h=>itemTotalByLabel(r,h)),r.currentTotal,r.discount,r.paid,r.balance,r.mode==="Cash"?r.paid:0,r.mode==="Bank"?r.paid:0]);data.push(["TOTAL","","","",...heads.map(h=>sum(rows,r=>itemTotalByLabel(r,h))),sum(rows,r=>r.currentTotal),sum(rows,r=>r.discount),sum(rows,r=>r.paid),sum(rows,r=>r.balance),sum(rows,r=>r.mode==="Cash"?r.paid:0),sum(rows,r=>r.mode==="Bank"?r.paid:0)]);exportXLS("Daily_Collection.xls",headers,data,"Daily Collection / Fees Day Book")}

/* OUTSTANDING */
function renderOutstanding(){if(!isAccountant()&&!hasPermission("outstanding"))return unauthorized();$("#content").innerHTML=`<div class="section"><div class="section-title"><div><h3>Outstanding / Reminder Letter</h3><p>Calculate only unpaid charges in the selected month range, plus carried Dues.</p></div><div class="toolbar"><button class="btn green" id="outExport">Export Excel</button>${isAccountant()?`<button class="btn primary" id="outPrint">Print 4 Slips / A4</button>`:""}</div></div><div class="toolbar"><div class="field"><label>Academic Year</label><select id="outYear">${yearsOptions(getYear())}</select></div><div class="field"><label>Class</label><select id="outClass">${classesOptions()}</select></div><div class="field"><label>From Month</label><select id="outFrom">${NP_MONTHS.map((m,i)=>`<option value="${i}">${m}</option>`).join("")}</select></div><div class="field"><label>To Month</label><select id="outTo">${NP_MONTHS.map((m,i)=>`<option value="${i}" ${i===2?"selected":""}>${m}</option>`).join("")}</select></div><button class="btn cyan" id="outPreview">Preview</button></div><div id="outHost" style="margin-top:12px"></div></div>`;$("#outPreview").onclick=drawOutstanding;$("#outExport").onclick=exportOutstanding;if(isAccountant())$("#outPrint").onclick=printOutstanding;drawOutstanding()}
function outstandingRows(){const y=$("#outYear")?.value||getYear(),c=$("#outClass")?.value||"",f=num($("#outFrom")?.value),t=num($("#outTo")?.value);if(!c)return[];return db.students.filter(s=>s.year===y&&s.className===c).map(s=>{const items=[];for(let i=f;i<=t;i++)if(!isMonthClosed(s,y,i))monthCharges(s,y,i).forEach(x=>items.push({...x,month:NP_MONTHS[i]}));const open=sum(items,x=>x.amount),old=num(s.dues),total=open+old;return {s,items,old,open,total}}).filter(x=>x.total>0)}
function drawOutstanding(){const rows=outstandingRows();$("#outHost").innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Student</th><th>Guardian</th><th>Unpaid Details</th><th class="amount">Old Dues</th><th class="amount">Open Fees</th><th class="amount">Total Due</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.s.name)}</b><br><small>${esc(x.s.registrationNo)}</small></td><td>${esc(x.s.guardian||x.s.fatherName||x.s.motherName||"")}</td><td>${x.items.map(i=>`${i.month} - ${esc(i.label)}: ${money(i.amount)}`).join("<br>")}</td><td class="amount">${money(x.old)}</td><td class="amount">${money(x.open)}</td><td class="amount danger-text">${money(x.total)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Select a class. If selected students have no outstanding amount, this list remains empty.</div>`}
function exportOutstanding(){const rows=outstandingRows();exportXLS("Outstanding_Reminder.xls",["Reg No","Student","Class","Guardian","Old Dues","Unpaid Fee Details","Total Due"],rows.map(x=>[x.s.registrationNo,x.s.name,x.s.className,x.s.guardian||x.s.fatherName||x.s.motherName,x.old,x.items.map(i=>`${i.month} ${i.label}: ${i.amount}`).join(" | "),x.total]),"Outstanding / Reminder")}
function printOutstanding(){const rows=outstandingRows();if(!rows.length)return toast("No outstanding slips to print.");const y=$("#outYear").value,from=NP_MONTHS[num($("#outFrom").value)],to=NP_MONTHS[num($("#outTo").value)];const slips=rows.map(x=>`<div class="slip"><h3>${esc(db.settings.schoolName)}</h3><p>${esc(db.settings.address)}</p><h4>Fee Reminder</h4><p><b>Student:</b> ${esc(x.s.name)} &nbsp; <b>Class:</b> ${esc(x.s.className)}</p><p><b>Guardian:</b> ${esc(x.s.guardian||x.s.fatherName||x.s.motherName||"")}</p><p><b>Period:</b> ${from} to ${to}, ${y}</p><p><b>Old Dues:</b> ${money(x.old)}</p><table>${x.items.map(i=>`<tr><td>${i.month} - ${esc(i.label)}</td><td>${money(i.amount)}</td></tr>`).join("")}</table><p class="due"><b>Total Due: ${money(x.total)}</b></p></div>`).join("");const w=window.open("","_blank","width=900,height=900");w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:10mm}body{font-family:Arial;margin:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8mm}.slip{border:1px solid #000;padding:7mm;min-height:125mm;break-inside:avoid}.slip h3,.slip h4{text-align:center;margin:2px}.slip p{font-size:12px;margin:5px 0}.slip table{width:100%;font-size:11px;border-collapse:collapse}.slip td{border-bottom:1px solid #ddd;padding:3px}.slip td:last-child{text-align:right}.due{text-align:right;font-size:14px!important}</style></head><body><div class="grid">${slips}</div><script>setTimeout(()=>window.print(),300)<\/script></body></html>`);w.document.close()}

/* EXAM HALL PASS */
function renderExamHallPass(){if(!isAccountant()&&!hasPermission("examHallPass"))return unauthorized();$("#content").innerHTML=`<div class="section"><div class="section-title"><div><h3>Exam Hall Pass / Fee Clearance</h3><p>Due = Rs. 0 through the selected month means Eligible.</p></div><div class="toolbar"><button class="btn green" id="hallExport">Export</button>${isAccountant()?`<button class="btn primary" id="hallPrint">Print Eligible Hall Passes</button>`:""}</div></div><div class="toolbar"><div class="field"><label>Academic Year</label><select id="hallYear">${yearsOptions(getYear())}</select></div><div class="field"><label>Class</label><select id="hallClass">${classesOptions()}</select></div><div class="field"><label>Cutoff Month</label><select id="hallMonth">${NP_MONTHS.map((m,i)=>`<option value="${i}" ${i===2?"selected":""}>${m}</option>`).join("")}</select></div><button class="btn cyan" id="hallView">View Status</button></div><div id="hallHost" style="margin-top:12px"></div></div>`;$("#hallView").onclick=drawHallPass;$("#hallExport").onclick=exportHallPass;if(isAccountant())$("#hallPrint").onclick=printHallPasses;drawHallPass()}
function hallRows(){const y=$("#hallYear")?.value||getYear(),c=$("#hallClass")?.value||"",to=num($("#hallMonth")?.value);if(!c)return[];return db.students.filter(s=>s.year===y&&s.className===c).map(s=>{const due=studentOpenDueThrough(s,y,to,0);return {s,due,eligible:due<=0.0001}})}
function drawHallPass(){const rows=hallRows();$("#hallHost").innerHTML=rows.length?`<div class="summary-strip"><div class="summary-box"><small>Total Students</small><strong>${rows.length}</strong></div><div class="summary-box"><small>Eligible</small><strong class="stat-green">${rows.filter(x=>x.eligible).length}</strong></div><div class="summary-box"><small>Not Eligible</small><strong class="stat-red">${rows.filter(x=>!x.eligible).length}</strong></div></div><div class="table-wrap"><table><thead><tr>${isAccountant()?"<th>Select</th>":""}<th>Reg. No.</th><th>Student</th><th>Class</th><th class="amount">Due Through Cutoff</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr class="${x.eligible?"hall-row-eligible":"hall-row-not"}">${isAccountant()?`<td><input class="hallSelect" type="checkbox" value="${x.s.id}" ${x.eligible?"checked":"disabled"}></td>`:""}<td>${esc(x.s.registrationNo)}</td><td><b>${esc(x.s.name)}</b></td><td>${esc(x.s.className)}</td><td class="amount">${money(x.due)}</td><td>${x.eligible?'<span class="chip good">Eligible / Hall Pass</span>':'<span class="chip bad">Not Eligible</span>'}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Select a class to view hall-pass eligibility.</div>`}
function exportHallPass(){const rows=hallRows(),month=NP_MONTHS[num($("#hallMonth")?.value)];exportXLS("Exam_Hall_Pass_Status.xls",["Reg No","Student","Class","Cutoff Month","Due","Status"],rows.map(x=>[x.s.registrationNo,x.s.name,x.s.className,month,x.due,x.eligible?"Eligible":"Not Eligible"]),"Exam Hall Pass Status")}
function printHallPasses(){const rows=hallRows().filter(x=>x.eligible),selected=new Set($$('.hallSelect:checked').map(x=>x.value)),pick=rows.filter(x=>selected.has(x.s.id));if(!pick.length)return toast("Select at least one eligible student.");const y=$("#hallYear").value,month=NP_MONTHS[num($("#hallMonth").value)],date=workingDate();const html=pick.map(x=>`<div class="pass"><h2>${esc(db.settings.schoolName)}</h2><p>${esc(db.settings.address)}</p><h3>EXAM HALL PASS</h3><p><b>Student:</b> ${esc(x.s.name)}</p><p><b>Registration No.:</b> ${esc(x.s.registrationNo)}</p><p><b>Class:</b> ${esc(x.s.className)}</p><p><b>Fee Clearance:</b> Cleared through ${month}, ${y}</p><p><b>Nepali Date:</b> ${esc(date)}</p><div class="sig">Accountant</div></div>`).join("");const w=window.open("","_blank","width=900,height=900");w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:12mm}body{font-family:Arial}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10mm}.pass{border:2px solid #111;padding:8mm;min-height:110mm;break-inside:avoid}.pass h2,.pass h3{text-align:center;margin:5px}.pass p{font-size:13px}.sig{margin-top:35px;border-top:1px solid #000;width:130px;text-align:center;margin-left:auto}</style></head><body><div class="grid">${html}</div><script>setTimeout(()=>window.print(),300)<\/script></body></html>`);w.document.close()}

/* EXPENSES */
function renderExpenses(){if(!isAccountant())return unauthorized();$("#content").innerHTML=`<div class="two-col"><div class="section"><div class="section-title"><div><h3>New Expense</h3></div></div><form id="expForm" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(workingDate())}" required></div><div><label>Mode</label><select name="mode"><option>Cash</option><option>Bank</option></select></div><div class="full"><label>Expense Head</label><input name="head" placeholder="Salary / Stationery / Maintenance / etc." required></div><div><label>Amount</label><input name="amount" type="number" min="0" step="0.01" required></div><div><label>Paid To</label><input name="paidTo"></div><div class="full"><label>Remarks</label><textarea name="remarks"></textarea></div><div class="full form-actions"><button class="btn primary">Save Expense</button></div></form></div><div class="section"><div class="section-title"><div><h3>Expense Register</h3></div><button class="btn green" id="expExport">Export Excel</button></div><div id="expHost"></div></div></div>`;$("#expForm").onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),date=fd.get("date");if(!npDateValid(date))return toast("Use Nepali date YYYY-MM-DD.");db.expenses.push({id:uid("exp"),date,year:yearOfDate(date),head:fd.get("head"),amount:num(fd.get("amount")),mode:fd.get("mode"),paidTo:fd.get("paidTo"),remarks:fd.get("remarks")});saveDB();renderExpenses();toast("Expense saved.")};$("#expExport").onclick=()=>exportXLS("Expenses.xls",["Date","Head","Paid To","Mode","Amount","Remarks"],db.expenses.map(x=>[x.date,x.head,x.paidTo,x.mode,x.amount,x.remarks]),"Expense Register");drawExpenses()}
function drawExpenses(){const a=[...db.expenses].sort((a,b)=>b.date.localeCompare(a.date));$("#expHost").innerHTML=a.length?`<div class="table-wrap compact"><table><thead><tr><th>Date</th><th>Head</th><th>Mode</th><th>Paid To</th><th class="amount">Amount</th></tr></thead><tbody>${a.map(x=>`<tr><td>${x.date}</td><td>${esc(x.head)}</td><td>${x.mode}</td><td>${esc(x.paidTo||"")}</td><td class="amount">${money(x.amount)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No expenses yet.</div>`}

/* DAY BOOK & REPORTS */
function allTransactions(){const out=[];db.receipts.forEach(r=>out.push({date:r.date,type:"Fee Receipt",ref:r.receiptNo,details:`${r.studentName} - ${r.className}`,head:"Student Fees",mode:r.mode,income:r.paid,expense:0}));db.quickReceipts.forEach(q=>out.push({date:q.date,type:"Quick Receipt",ref:q.receiptNo,details:q.receivedFrom||q.title,head:q.title,mode:q.mode,income:q.amount,expense:0}));db.expenses.forEach(e=>out.push({date:e.date,type:"Expense",ref:"",details:e.paidTo||e.remarks,head:e.head,mode:e.mode,income:0,expense:e.amount}));return out.sort((a,b)=>a.date.localeCompare(b.date))}
function transactionTable(rows){return rows.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Head</th><th>Details</th><th>Mode</th><th class="amount">Income</th><th class="amount">Expense</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.date}</td><td>${x.type}</td><td>${esc(x.ref)}</td><td>${esc(x.head)}</td><td>${esc(x.details)}</td><td>${x.mode}</td><td class="amount stat-green">${x.income?money(x.income):"-"}</td><td class="amount stat-red">${x.expense?money(x.expense):"-"}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No transactions.</div>`}
function renderDayBook(){if(!isAccountant()&&!hasPermission("daybook"))return unauthorized();$("#content").innerHTML=`<div class="section"><div class="section-title"><div><h3>General Day Book</h3></div><button class="btn green" id="dayExport">Export Excel</button></div><div class="toolbar"><div class="field"><label>From Nepali Date</label><input id="dayFrom" value="${esc(workingDate())}"></div><div class="field"><label>To Nepali Date</label><input id="dayTo" value="${esc(workingDate())}"></div><button class="btn cyan" id="daySearch">Search</button></div><div id="dayHost" style="margin-top:12px"></div></div>`;$("#daySearch").onclick=drawDayBook;$("#dayExport").onclick=()=>{const rows=dayRows();exportXLS("Day_Book.xls",["Date","Type","Reference","Head","Details","Mode","Income","Expense"],rows.map(x=>[x.date,x.type,x.ref,x.head,x.details,x.mode,x.income,x.expense]),"General Day Book")};drawDayBook()}
function dayRows(){const f=$("#dayFrom")?.value||"",t=$("#dayTo")?.value||"";return allTransactions().filter(x=>(!f||x.date>=f)&&(!t||x.date<=t))}
function drawDayBook(){const rows=dayRows(),inc=sum(rows,x=>x.income),exp=sum(rows,x=>x.expense);$("#dayHost").innerHTML=`<div class="summary-strip"><div class="summary-box"><small>Income</small><strong class="stat-green">${money(inc)}</strong></div><div class="summary-box"><small>Expense</small><strong class="stat-red">${money(exp)}</strong></div><div class="summary-box"><small>Net</small><strong>${money(inc-exp)}</strong></div><div class="summary-box"><small>Cash Income</small><strong>${money(sum(rows,x=>x.mode==="Cash"?x.income:0))}</strong></div><div class="summary-box"><small>Bank Income</small><strong>${money(sum(rows,x=>x.mode==="Bank"?x.income:0))}</strong></div></div>${transactionTable(rows)}`}
function renderMonthly(){if(!isAccountant()&&!hasPermission("monthly"))return unauthorized();const y=getYear(),rows=NP_MONTHS.map((m,i)=>{const fee=sum(db.receipts.filter(r=>r.year===y&&monthIndexFromDate(r.date)===i),r=>r.paid),quick=sum(db.quickReceipts.filter(r=>r.year===y&&monthIndexFromDate(r.date)===i),r=>r.amount),exp=sum(db.expenses.filter(r=>r.year===y&&monthIndexFromDate(r.date)===i),r=>r.amount);return [m,fee,quick,fee+quick,exp,fee+quick-exp]});$("#content").innerHTML=`<div class="section"><div class="section-title"><div><h3>Monthly Summary — ${y}</h3></div><button class="btn green" id="monthlyExport">Export Excel</button></div><div class="table-wrap"><table><thead><tr><th>Month</th><th class="amount">Fee Collection</th><th class="amount">Quick Income</th><th class="amount">Total Income</th><th class="amount">Expense</th><th class="amount">Net</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r[0]}</td>${r.slice(1).map(v=>`<td class="amount">${money(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;$("#monthlyExport").onclick=()=>exportXLS("Monthly_Summary.xls",["Month","Fee Collection","Quick Income","Total Income","Expense","Net"],rows,"Monthly Summary")}
function renderHeadwise(){if(!isAccountant()&&!hasPermission("headwise"))return unauthorized();const y=getYear(),map={};db.receipts.filter(r=>r.year===y).forEach(r=>r.items.forEach(i=>map[i.label]=(map[i.label]||0)+num(i.amount)));db.quickReceipts.filter(q=>q.year===y).forEach(q=>map[`Quick Income - ${q.title}`]=(map[`Quick Income - ${q.title}`]||0)+num(q.amount));const rows=Object.entries(map);$("#content").innerHTML=`<div class="section"><div class="section-title"><div><h3>Head-wise Collection — ${y}</h3></div><button class="btn green" id="headExport">Export Excel</button></div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Income / Fee Head</th><th class="amount">Amount</th></tr></thead><tbody>${rows.map(([k,v])=>`<tr><td>${esc(k)}</td><td class="amount">${money(v)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No data.</div>`}</div>`;$("#headExport").onclick=()=>exportXLS("Headwise_Collection.xls",["Head","Amount"],rows,"Head-wise Collection")}
function renderReports(){if(!isAccountant()&&!hasPermission("reports"))return unauthorized();$("#content").innerHTML=`<div class="section"><div class="section-title"><div><h3>General Accounts Report</h3><p>Fee receipts + Quick Receipts + Expenses.</p></div><button class="btn green" id="repExport">Export Excel</button></div><div class="toolbar"><div class="field"><label>From Nepali Date</label><input id="repFrom" value="${esc(workingDate())}"></div><div class="field"><label>To Nepali Date</label><input id="repTo" value="${esc(workingDate())}"></div><button class="btn cyan" id="repSearch">Search</button></div><div id="reportHost" style="margin-top:12px"></div></div>${(!isAccountant()&&hasPermission("quickRegister"))||isAccountant()?`<div class="section"><div class="section-title"><div><h3>Quick Receipt Register</h3></div>${isAccountant()?`<button class="btn green" onclick="exportQuickReceipts()">Export Excel</button>`:""}</div>${quickRegisterTable()}</div>`:""}`;$("#repSearch").onclick=drawReports;$("#repExport").onclick=exportReport;drawReports()}
function reportRows(){const f=$("#repFrom")?.value||"",t=$("#repTo")?.value||"";return allTransactions().filter(x=>(!f||x.date>=f)&&(!t||x.date<=t))}
function drawReports(){const rows=reportRows(),inc=sum(rows,x=>x.income),exp=sum(rows,x=>x.expense);$("#reportHost").innerHTML=`<div class="summary-strip"><div class="summary-box"><small>Total Income</small><strong class="stat-green">${money(inc)}</strong></div><div class="summary-box"><small>Total Expense</small><strong class="stat-red">${money(exp)}</strong></div><div class="summary-box"><small>Net</small><strong>${money(inc-exp)}</strong></div><div class="summary-box"><small>Current Student Dues</small><strong class="stat-red">${money(totalDues())}</strong></div><div class="summary-box"><small>Transactions</small><strong>${rows.length}</strong></div></div>${transactionTable(rows)}`}
function exportReport(){const rows=reportRows();exportXLS("Accounts_Report.xls",["Date","Type","Reference","Head","Details","Mode","Income","Expense"],rows.map(x=>[x.date,x.type,x.ref,x.head,x.details,x.mode,x.income,x.expense]),"Accounts Report")}
function quickRegisterTable(){const a=[...db.quickReceipts].sort((a,b)=>b.date.localeCompare(a.date));return a.length?`<div class="table-wrap compact"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Title</th><th>Mode</th><th class="amount">Amount</th></tr></thead><tbody>${a.map(q=>`<tr><td>${q.date}</td><td>${esc(q.receiptNo)}</td><td>${esc(q.title)}</td><td>${q.mode}</td><td class="amount">${money(q.amount)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No Quick Receipts.</div>`}

/* ACCESS */
function renderAccess(){if(!isAccountant())return unauthorized();$("#content").innerHTML=`<div class="notice"><strong>Important:</strong> MD and CEO remain read-only. A checked item only grants viewing access; it never gives edit, payment, delete, fee setup, password, or configuration rights.</div><div class="permission-grid">${["md","ceo"].map(role=>`<div class="permission-card"><h4>${role==="md"?"Managing Director (MD)":"CEO"} — View Permissions</h4>${PERMISSION_OPTIONS.map(([key,label])=>`<div class="perm-row"><span>${label}</span><label class="toggle"><input class="permCheck" data-role="${role}" data-key="${key}" type="checkbox" ${db.settings.permissions?.[role]?.[key]?"checked":""}></label></div>`).join("")}</div>`).join("")}</div>`;$$('.permCheck').forEach(c=>c.onchange=()=>{const r=c.dataset.role,k=c.dataset.key;db.settings.permissions[r]=db.settings.permissions[r]||{};db.settings.permissions[r][k]=c.checked;saveDB();toast(`${roleName(r)} access updated.`)})}

/* SETTINGS + SECURITY */
function renderSettings(){if(!isAccountant())return unauthorized();$("#content").innerHTML=`<div class="two-col"><div class="section"><div class="section-title"><div><h3>School & Receipt Settings</h3></div></div><form id="setForm" class="form-grid"><div class="full"><label>School Name</label><input name="schoolName" value="${esc(db.settings.schoolName)}"></div><div class="full"><label>Address</label><input name="address" value="${esc(db.settings.address)}"></div><div><label>ESTD</label><input name="estd" value="${esc(db.settings.estd)}"></div><div><label>Telephone</label><input name="phone" value="${esc(db.settings.phone)}"></div><div><label>PAN No.</label><input name="pan" value="${esc(db.settings.pan)}"></div><div><label>Issued By</label><input name="issuedBy" value="${esc(db.settings.issuedBy)}"></div><div><label>Receipt Prefix</label><input name="receiptPrefix" value="${esc(db.settings.receiptPrefix)}"></div><div><label>Next Receipt Number</label><input name="nextReceiptNumber" type="number" min="1" value="${num(db.settings.nextReceiptNumber)}"></div><div><label>Registration Prefix</label><input name="registrationPrefix" value="${esc(db.settings.registrationPrefix)}"></div><div><label>Next Registration Number</label><input name="nextRegistrationNumber" type="number" min="1" value="${num(db.settings.nextRegistrationNumber)}"></div><div><label>Default Working Nepali Date</label><input name="workingDate" value="${esc(db.settings.workingDate)}" placeholder="2083-05-25"></div><div class="full"><label>School Logo</label><div class="two-col"><div class="logo-preview" id="logoPreview">${db.settings.logoData?`<img src="${db.settings.logoData}">`:"No Logo"}</div><div><input id="logoUpload" type="file" accept="image/*"><p class="card-note">Logo is resized and stored locally in this browser for receipt printing.</p><button type="button" class="btn" id="removeLogo">Remove Logo</button></div></div></div><div class="full form-actions"><button class="btn primary">Save Settings</button></div></form></div><div><div class="section"><div class="section-title"><div><h3>Security</h3><p>Passwords are stored as salted hashes, never displayed as plain text.</p></div></div><div class="security-panel"><h4>Change Accountant Password</h4><form id="changeOwn" class="form-grid"><div><label>Current Password</label><input name="current" type="password" required></div><div><label>New Password</label><input name="next" type="password" minlength="6" required></div><div><label>Confirm New Password</label><input name="confirm" type="password" minlength="6" required></div><div class="form-actions"><button class="btn primary">Change & Logout</button></div></form></div><div class="security-panel" style="margin-top:12px"><h4>Reset CEO Password</h4><form id="resetCEO" class="form-grid"><div><label>New Password</label><input name="next" type="password" minlength="6" required></div><div><label>Confirm</label><input name="confirm" type="password" minlength="6" required></div><div class="full form-actions"><button class="btn">Reset CEO Password</button></div></form></div><div class="security-panel" style="margin-top:12px"><h4>Reset MD Password</h4><form id="resetMD" class="form-grid"><div><label>New Password</label><input name="next" type="password" minlength="6" required></div><div><label>Confirm</label><input name="confirm" type="password" minlength="6" required></div><div class="full form-actions"><button class="btn">Reset MD Password</button></div></form></div></div><div class="section"><div class="section-title"><div><h3>Local Data</h3></div></div><button class="btn green" id="backupBtn">Download JSON Backup</button> <button class="btn red" id="resetAllBtn">Reset Everything to Zero</button><p class="card-note">Reset deletes all locally entered operational data. Login passwords and settings are also reset and first-time setup will appear again.</p></div></div></div>`;
 $("#setForm").onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);["schoolName","address","estd","phone","pan","issuedBy","receiptPrefix","registrationPrefix","workingDate"].forEach(k=>db.settings[k]=fd.get(k));db.settings.nextReceiptNumber=Math.max(1,num(fd.get("nextReceiptNumber")));db.settings.nextRegistrationNumber=Math.max(1,num(fd.get("nextRegistrationNumber")));saveDB();$("#workingDate").value=db.settings.workingDate;updateSideLogo();toast("Settings saved.")};
 $("#logoUpload").onchange=handleLogoUpload;$("#removeLogo").onclick=()=>{db.settings.logoData="";saveDB();renderSettings();updateSideLogo()};
 $("#changeOwn").onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);if(!verifyPassword("accountant",fd.get("current")))return toast("Current password is incorrect.");if(fd.get("next")!==fd.get("confirm"))return toast("New passwords do not match.");setPassword("accountant",fd.get("next"));saveDB();logout("Accountant password changed. Please login again.")};
 $("#resetCEO").onsubmit=e=>resetRolePassword(e,"ceo");$("#resetMD").onsubmit=e=>resetRolePassword(e,"md");$("#backupBtn").onclick=backupJSON;$("#resetAllBtn").onclick=resetEverything;
}
function resetRolePassword(e,role){e.preventDefault();const fd=new FormData(e.target);if(fd.get("next")!==fd.get("confirm"))return toast("Passwords do not match.");setPassword(role,fd.get("next"));saveDB();e.target.reset();toast(`${roleName(role)} password reset.`)}
function handleLogoUpload(e){const f=e.target.files?.[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{const img=new Image();img.onload=()=>{const c=document.createElement("canvas"),max=260,scale=Math.min(1,max/img.width,max/img.height);c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext("2d").drawImage(img,0,0,c.width,c.height);db.settings.logoData=c.toDataURL("image/png",.88);saveDB();renderSettings();updateSideLogo();toast("Logo uploaded.")};img.src=rd.result};rd.readAsDataURL(f)}
function updateSideLogo(){const el=$("#sideLogo");if(!el)return;if(db.settings.logoData){el.textContent="";el.style.backgroundImage=`url(${db.settings.logoData})`;el.classList.add("img")}else{el.textContent="SA";el.style.backgroundImage="";el.classList.remove("img")}}
function backupJSON(){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(db,null,2)],{type:"application/json"}));a.download=`StAugustine_Accounts_Backup_${workingDate()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function resetEverything(){if(!confirm("This will delete ALL local data, settings and passwords. Continue?"))return;localStorage.removeItem(DB_KEY);db=blankDB();$("#appView").classList.add("hidden");$("#loginView").classList.add("hidden");$("#setupView").classList.remove("hidden");session={role:null,page:"dashboard",loginAt:null,lastActivity:null};toast("Local data reset. Create secure accounts again.")}

function renderHelp(){$("#content").innerHTML=`<div class="help-grid"><div class="help-card"><h4>Recommended Setup Order</h4><p>1 Settings & passwords → 2 Route Plan → 3 Fee Head → 4 Fee Plan → 5 New Admission → 6 Personal Override (if needed) → 7 Fee Payment.</p></div><div class="help-card"><h4>Nepali Date</h4><p>All date entry/filtering uses manual Bikram Sambat style YYYY-MM-DD, for example 2083-05-25.</p></div><div class="help-card"><h4>Dues Rule</h4><p>When selected months are processed, those months close. Any unpaid shortage is carried forward separately as Dues.</p></div><div class="help-card"><h4>Security</h4><p>No default password is shown. First launch creates passwords. Accountant can reset CEO/MD passwords and changing the Accountant password logs the current session out.</p></div><div class="help-card"><h4>Important Local Security Note</h4><p>This is an offline local prototype. Password hashing and role checks protect normal use, but browser/local files cannot provide the same security as a server database. Before multi-computer/public deployment, use a secure backend and server-side authorization.</p></div><div class="help-card"><h4>MD / CEO</h4><p>They are always read-only. Accountant decides exactly which reports they may view using Access Control.</p></div></div>`}
function unauthorized(){$("#content").innerHTML=`<div class="section"><div class="empty">This module is not enabled for your login.</div></div>`}

/* EXPORT */
function exportXLS(filename,headers,rows,title){const safe=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");const html=`<html><head><meta charset="UTF-8"><style>table{border-collapse:collapse}th,td{border:1px solid #777;padding:5px}th{background:#00b9e8} .num{text-align:right}</style></head><body><h3>${safe(title)}</h3><table><tr>${headers.map(h=>`<th>${safe(h)}</th>`).join("")}</tr>${rows.map(r=>`<tr>${r.map(c=>`<td>${safe(c)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([html],{type:"application/vnd.ms-excel"}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

/* MODAL */
function openModal(k,t,h){$("#modalKicker").textContent=k;$("#modalTitle").textContent=t;$("#modalContent").innerHTML=h;$("#modalBackdrop").classList.remove("hidden")}
function closeModal(){$("#modalBackdrop").classList.add("hidden");$("#modalContent").innerHTML=""}

/* BOOT & AUTH — ONLINE SUPABASE LOGIN */
$("#setupView").classList.add("hidden");
$("#togglePassword").onclick=()=>{const i=$("#loginPassword");i.type=i.type==="password"?"text":"password";$("#togglePassword").textContent=i.type==="password"?"Show":"Hide"};
$("#loginForm").onsubmit=async e=>{
  e.preventDefault();
  if(!sb)return toast("Supabase connection is unavailable.");
  const role=$("#loginRole").value,pwd=$("#loginPassword").value,email=ACCOUNT_EMAILS[role];
  const btn=e.target.querySelector('button[type="submit"]');
  const oldText=btn?.textContent||"Login";
  if(btn){btn.disabled=true;btn.textContent="Signing in...";}
  try{
    const {data,error}=await sb.auth.signInWithPassword({email,password:pwd});
    if(error)throw error;
    if(!data?.user)throw new Error("Login failed.");
    await openOnlineSession(data.user,role);
    toast("Online login successful.");
  }catch(err){
    console.error(err);
    await sb.auth.signOut().catch(()=>{});
    toast(err?.message||"Login failed.");
  }finally{
    if(btn){btn.disabled=false;btn.textContent=oldText;}
  }
};
$("#logoutBtn").onclick=()=>logout();$("#homeBtn").onclick=()=>navigate("dashboard");$("#refreshBtn").onclick=()=>{renderPage();toast("Refreshed.")};$("#academicYear").onchange=()=>renderPage();$("#workingDate").oninput=e=>{if(npDateValid(e.target.value)){db.settings.workingDate=e.target.value;saveDB()}};$$('.top-link').forEach(b=>b.onclick=()=>navigate(b.dataset.page));$("#closeModal").onclick=closeModal;$("#modalBackdrop").onclick=e=>{if(e.target===$("#modalBackdrop"))closeModal()};
function populateYears(){const sel=$("#academicYear"),old=sel.value;sel.innerHTML=db.settings.academicYears.map(y=>`<option>${y}</option>`).join("");if(db.settings.academicYears.includes(old))sel.value=old}
function updateClock(){if(!session.loginAt)return;const d=new Date();$("#clockText").textContent=d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});$("#loginTime").textContent="Login Time: "+session.loginAt.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}
setInterval(updateClock,1000);["click","keydown","mousemove"].forEach(ev=>document.addEventListener(ev,()=>{if(session.role)session.lastActivity=Date.now()},{passive:true}));setInterval(()=>{if(session.role&&Date.now()-session.lastActivity>30*60*1000)logout("Session expired after 30 minutes of inactivity.")},60000);

window.navigate=navigate;window.openStudentForm=openStudentForm;window.openLedgerDirect=openLedgerDirect;window.openRouteForm=openRouteForm;window.openFeeHeadForm=openFeeHeadForm;window.openFeePlanForm=openFeePlanForm;window.openOverrideForm=openOverrideForm;window.deleteOverride=deleteOverride;window.showReceiptById=showReceiptById;window.printReceipt=printReceipt;window.showQuickReceipt=showQuickReceipt;window.printQuickReceipt=printQuickReceipt;window.closeModal=closeModal;window.exportQuickReceipts=exportQuickReceipts;

initAuth();


/* ====================== V5 REVIEW 1 OVERRIDES ====================== */
const NEPAL_ADDRESS_DATA = {
  "Koshi": {
    "Bhojpur": ["Bhojpur Municipality","Shadananda Municipality","Tyamke Maiyum Rural Municipality"],
    "Dhankuta": ["Dhankuta Municipality","Pakhribas Municipality","Mahalaxmi Municipality"],
    "Ilam": ["Ilam Municipality","Suryodaya Municipality","Deumai Municipality","Mai Municipality","Rong Rural Municipality"],
    "Jhapa": ["Bhadrapur Municipality","Mechinagar Municipality","Damak Municipality","Arjundhara Municipality","Kankai Municipality"],
    "Morang": ["Biratnagar Metropolitan City","Belbari Municipality","Letang Municipality","Urlabari Municipality","Sundar Haraicha Municipality"],
    "Sunsari": ["Inaruwa Municipality","Dharan Sub-Metropolitan City","Itahari Sub-Metropolitan City","Barahakshetra Municipality"],
  },
  "Madhesh": {
    "Bara": ["Kalaiya Sub-Metropolitan City","Jitpur Simara Sub-Metropolitan City"],
    "Dhanusha": ["Janakpurdham Sub-Metropolitan City","Mithila Municipality"],
    "Mahottari": ["Jaleshwar Municipality","Bardibas Municipality"],
    "Parsa": ["Birgunj Metropolitan City","Pokhariya Municipality"],
    "Rautahat": ["Gaur Municipality","Chandrapur Municipality"],
    "Saptari": ["Rajbiraj Municipality","Kanchanrup Municipality"],
    "Siraha": ["Siraha Municipality","Lahan Municipality"],
    "Sarlahi": ["Malangwa Municipality","Bagmati Municipality","Haripur Municipality"],
  },
  "Bagmati": {
    "Bhaktapur": ["Bhaktapur Municipality","Madhyapur Thimi Municipality","Changunarayan Municipality"],
    "Chitwan": ["Bharatpur Metropolitan City","Ratnanagar Municipality","Khairahani Municipality","Madi Municipality"],
    "Dhading": ["Nilkantha Municipality","Khaniyabas Rural Municipality"],
    "Kathmandu": ["Kathmandu Metropolitan City","Budhanilkantha Municipality","Kirtipur Municipality","Tokha Municipality"],
    "Kavrepalanchok": ["Dhulikhel Municipality","Banepa Municipality","Panauti Municipality"],
    "Lalitpur": ["Lalitpur Metropolitan City","Godawari Municipality","Mahalaxmi Municipality"],
    "Makwanpur": ["Hetauda Sub-Metropolitan City","Thaha Municipality"],
    "Nuwakot": ["Bidur Municipality","Belkotgadhi Municipality"],
    "Ramechhap": ["Manthali Municipality","Ramechhap Municipality"],
    "Rasuwa": ["Uttargaya Rural Municipality","Gosaikunda Rural Municipality"],
    "Sindhuli": ["Kamalamai Municipality","Dudhouli Municipality"],
    "Sindhupalchok": ["Chautara Sangachokgadhi Municipality","Melamchi Municipality"],
  },
  "Gandaki": {
    "Baglung": ["Baglung Municipality","Dhorpatan Municipality"],
    "Gorkha": ["Gorkha Municipality","Palungtar Municipality"],
    "Kaski": ["Pokhara Metropolitan City","Annapurna Rural Municipality"],
    "Lamjung": ["Besisahar Municipality","Madhya Nepal Municipality"],
    "Mustang": ["Gharpajhong Rural Municipality","Thasang Rural Municipality"],
    "Myagdi": ["Beni Municipality","Annapurna Rural Municipality"],
    "Nawalpur": ["Kawasoti Municipality","Gaindakot Municipality"],
    "Parbat": ["Kushma Municipality","Phalebas Municipality"],
    "Syangja": ["Putalibazar Municipality","Waling Municipality"],
    "Tanahun": ["Byas Municipality","Shuklagandaki Municipality"],
  },
  "Lumbini": {
    "Arghakhanchi": ["Sandhikharka Municipality","Sitganga Municipality"],
    "Banke": ["Nepalgunj Sub-Metropolitan City","Kohalpur Municipality"],
    "Bardiya": ["Gulariya Municipality","Rajapur Municipality"],
    "Dang": ["Ghorahi Sub-Metropolitan City","Tulsipur Sub-Metropolitan City","Lamahi Municipality"],
    "Eastern Rukum": ["Sisne Rural Municipality","Putha Uttarganga Rural Municipality"],
    "Gulmi": ["Resunga Municipality","Musikot Municipality"],
    "Kapilvastu": ["Kapilvastu Municipality","Banganga Municipality"],
    "Palpa": ["Tansen Municipality","Rampur Municipality"],
    "Parasi": ["Ramgram Municipality","Sunwal Municipality"],
    "Pyuthan": ["Pyuthan Municipality","Sworgadwari Municipality"],
    "Rolpa": ["Rolpa Municipality","Runtigadhi Rural Municipality"],
    "Rupandehi": ["Siddharthanagar Municipality","Butwal Sub-Metropolitan City","Tilottama Municipality"],
  },
  "Karnali": {
    "Dailekh": ["Narayan Municipality","Dullu Municipality"],
    "Dolpa": ["Thuli Bheri Municipality","Tripurasundari Municipality"],
    "Humla": ["Simkot Rural Municipality","Sarkegad Rural Municipality"],
    "Jajarkot": ["Bheri Municipality","Chhedagad Municipality"],
    "Jumla": ["Chandannath Municipality","Tila Rural Municipality"],
    "Kalikot": ["Khandachakra Municipality","Raskot Municipality"],
    "Mugu": ["Chhayanath Rara Municipality","Soru Rural Municipality"],
    "Salyan": ["Sharada Municipality","Bagchaur Municipality"],
    "Surkhet": ["Birendranagar Municipality","Panchapuri Municipality"],
    "Western Rukum": ["Musikot Municipality","Aathbiskot Municipality"],
  },
  "Sudurpashchim": {
    "Achham": ["Mangalsen Municipality","Kamalbazar Municipality"],
    "Baitadi": ["Dasharathchand Municipality","Patan Municipality"],
    "Bajhang": ["Jayaprithvi Municipality","Bungal Municipality"],
    "Bajura": ["Badimalika Municipality","Triveni Municipality"],
    "Dadeldhura": ["Amargadhi Municipality","Parshuram Municipality"],
    "Darchula": ["Mahakali Municipality","Shailyashikhar Municipality"],
    "Doti": ["Dipayal Silgadhi Municipality","Shikhar Municipality"],
    "Kailali": ["Dhangadhi Sub-Metropolitan City","Tikapur Municipality","Godawari Municipality"],
    "Kanchanpur": ["Bhimdatta Municipality","Krishnapur Municipality","Shuklaphanta Municipality"],
  }
};

function upgradeV5Data(){
  db.version = 5;
  db.settings = Object.assign({
    quickReceiptPrefix:'QR-',nextQuickReceiptNumber:1,
    expensePrefix:'PV-',nextExpenseNumber:1,
    reminderQRData:'',reminderWhatsApp:'',
    reminderTemplate:'तपाईंको नानीको {{toMonth}} महिनासम्मको बाँकी शुल्क समयमा बुझाइदिनु हुन अनुरोध छ।',
    reminderOnlineNote:'दिएको QR मार्फत online payment गर्न सक्नुहुन्छ। Payment गरेपछि विद्यालयलाई {{whatsapp}} मा जानकारी गराउनु होला।',
    remindHeader:'Fee Reminder / Outstanding Notice',
    admitCardTitle:'ADMIT CARD',
    admitCardTerm:'First Term',
    examCoordinatorName:'Exam Coordinator',
    principalName:'Principal',
    accountantSignName:'Accountant',
    examCoordinatorPost:'Exam Coordinator',
    principalPost:'Principal',
    accountantSignPost:'Accountant'
  }, db.settings||{});
  db.students = (db.students||[]).map(s=>Object.assign({
    mobileNumber:s.mobileNumber||s.phone||'', emergencyPhone:s.emergencyPhone||'', dobNp:s.dobNp||'',
    openingDues: (s.openingDues!=null ? s.openingDues : num(s.dues)),
    permCountry:s.permCountry||'Nepal', permProvince:s.permProvince||'', permDistrict:s.permDistrict||'', permMunicipality:s.permMunicipality||'', permWard:s.permWard||'',
    tempSameAsPermanent:s.tempSameAsPermanent||false, tempCountry:s.tempCountry||'Nepal', tempProvince:s.tempProvince||'', tempDistrict:s.tempDistrict||'', tempMunicipality:s.tempMunicipality||'', tempWard:s.tempWard||''
  }, s));
  (db.receipts||[]).forEach(r=>{ if(r.guardian==null) r.guardian=''; if(r.mode==null) r.mode='Cash'; });
  (db.quickReceipts||[]).forEach(q=>{ if(!q.receiptNo) q.receiptNo=nextQuickReceiptNo(true); });
  (db.expenses||[]).forEach(e=>{ if(!e.voucherNo) e.voucherNo=''; });
  saveDB();
}
function parseISODate(s){ const d=new Date(s+'T00:00:00'); return isNaN(+d)?null:d; }
function npMonthLength(m){ return [31,31,32,31,31,30,30,29,30,29,30,30][m-1]||30; }
function addDaysToNpDate(np,days){ if(!npDateValid(np)) return np; let [y,m,d]=np.split('-').map(Number); let step = days>=0?1:-1; for(let n=Math.abs(days);n>0;n--){ d += step; if(step>0){ let ml=npMonthLength(m); if(d>ml){ d=1; m++; if(m>12){m=1;y++;} } } else { if(d<1){ m--; if(m<1){m=12;y--;} d=npMonthLength(m);} } } return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }
function syncAutoWorkingDate(){ const todayAD=(new Date()).toISOString().slice(0,10); const last=db.settings.lastAutoSyncAD||todayAD; if(!db.settings.workingDate) db.settings.workingDate='2083-01-01'; const a=parseISODate(last), b=parseISODate(todayAD); if(a&&b){ const diff=Math.floor((b-a)/(24*3600*1000)); if(diff!==0) db.settings.workingDate=addDaysToNpDate(db.settings.workingDate,diff); } db.settings.lastAutoSyncAD=todayAD; saveDB(); }
function nextQuickReceiptNo(commit=false){ const s=db.settings; const v=`${s.quickReceiptPrefix||''}${String(num(s.nextQuickReceiptNumber)||1).padStart(5,'0')}`; if(commit){ s.nextQuickReceiptNumber=(num(s.nextQuickReceiptNumber)||1)+1; saveDB(); } return v; }
function nextExpenseNo(commit=false){ const s=db.settings; const v=`${s.expensePrefix||''}${String(num(s.nextExpenseNumber)||1).padStart(5,'0')}`; if(commit){ s.nextExpenseNumber=(num(s.nextExpenseNumber)||1)+1; saveDB(); } return v; }
function selectedValuesByName(name, root=document){ return [...root.querySelectorAll(`input[name="${name}"]:checked`)].map(x=>x.value); }
function uniqueCasteList(){ return [...new Set((db.students||[]).map(s=>String(s.caste||'').trim()).filter(Boolean))].sort(); }
function checkGroup(name, items, selected, labeler=x=>x){ return `<div class="multi-checks">${items.map(item=>`<label><input type="checkbox" name="${name}" value="${esc(item)}" ${(selected||[]).includes(String(item))?'checked':''}>${esc(labeler(item))}</label>`).join('')}</div>` }
function renderAddressBlock(prefix, s){
  return `<div class="full address-card"><h4>${prefix==='perm'?'Permanent Address':'Temporary Address'}</h4>${prefix==='temp'?`<label class="same-address"><input type="checkbox" name="tempSameAsPermanent" ${(s?.tempSameAsPermanent)?'checked':''}> Same as Permanent Address</label>`:''}<div class="form-grid three"><div><label>Country</label><select name="${prefix}Country"><option>Nepal</option></select></div><div><label>Province</label><select name="${prefix}Province"></select></div><div><label>District</label><select name="${prefix}District"></select></div><div><label>Municipality / Rural Municipality</label><select name="${prefix}Municipality"></select></div><div><label>Ward No.</label><input name="${prefix}Ward" value="${esc(s?.[prefix+'Ward']||'')}"></div></div></div>`;
}
function fillAddressSelects(form,prefix,silent){
  const provSel=form.elements[prefix+'Province'], distSel=form.elements[prefix+'District'], munSel=form.elements[prefix+'Municipality'];
  const currentProv = provSel.dataset.value || provSel.value || '';
  provSel.innerHTML='<option value="">Select Province</option>'+Object.keys(NEPAL_ADDRESS_DATA).map(p=>`<option ${p===currentProv?'selected':''}>${esc(p)}</option>`).join('');
  const prov = provSel.value || currentProv;
  const districts = prov && NEPAL_ADDRESS_DATA[prov] ? Object.keys(NEPAL_ADDRESS_DATA[prov]) : [];
  const currentDist = distSel.dataset.value || distSel.value || '';
  distSel.innerHTML='<option value="">Select District</option>'+districts.map(d=>`<option ${d===currentDist?'selected':''}>${esc(d)}</option>`).join('');
  const dist = distSel.value || currentDist;
  const muns = prov && dist && NEPAL_ADDRESS_DATA[prov] && NEPAL_ADDRESS_DATA[prov][dist] ? NEPAL_ADDRESS_DATA[prov][dist] : [];
  const currentMun = munSel.dataset.value || munSel.value || '';
  munSel.innerHTML='<option value="">Select Municipality</option>'+muns.map(m=>`<option ${m===currentMun?'selected':''}>${esc(m)}</option>`).join('');
  if(!silent){ provSel.dataset.value=''; distSel.dataset.value=''; munSel.dataset.value=''; }
}
function copyPermanentToTemporary(form){ ['Country','Province','District','Municipality','Ward'].forEach(k=>{ const src=form.elements['perm'+k], dst=form.elements['temp'+k]; if(src&&dst){ dst.value=src.value; if(k!=='Ward'){ dst.dataset.value=src.value; } } }); fillAddressSelects(form,'temp',true); form.elements.tempMunicipality.value=form.elements.permMunicipality.value; }

// override student screens
function renderStudents(){
 if(!isAccountant()&&!hasPermission('studentList')) return unauthorized();
 const readonly=!isAccountant();
 const castes=uniqueCasteList();
 $('#content').innerHTML=`<div class="section"><div class="section-title"><div><h3>Student Master</h3><p>Use multi-select Class / Route / Caste filters and export exactly the filtered result.</p></div>${readonly?'':`<button class="btn primary" id="newStudentBtn">+ New Admission</button>`}</div>
 <div class="toolbar block-toolbar"><div class="field"><label>Academic Year</label><select id="stuYear">${yearsOptions(getYear())}</select></div><div class="field"><label>Gender</label><select id="stuGender"><option value="">All</option><option>Male</option><option>Female</option><option>Other</option></select></div><div class="field grow"><label>Search</label><input id="stuSearch" placeholder="Name / Registration / Mobile / Guardian / DOB"></div><button class="btn green" id="studentExport">Export Excel</button></div>
 <div class="section sub-section"><div class="mini-filters"><div><label class="filter-head">Class (multi-select)</label>${checkGroup('stuClassCheck',CLASSES,[])}</div><div><label class="filter-head">Route (multi-select)</label>${checkGroup('stuRouteCheck',(db.routes||[]).map(r=>r.id),[],id=>(routeById(id)?.name||id))}</div><div><label class="filter-head">Caste (multi-select)</label>${castes.length?checkGroup('stuCasteCheck',castes,[]):'<div class="card-note">No caste values added yet.</div>'}</div></div></div>
 <div id="studentHost"></div></div>`;
 if(!readonly) $('#newStudentBtn').onclick=()=>openStudentForm();
 ['stuYear','stuGender','stuSearch'].forEach(id=>$('#'+id).oninput=drawStudentList);
 $$('input[name="stuClassCheck"],input[name="stuRouteCheck"],input[name="stuCasteCheck"]').forEach(x=>x.onchange=drawStudentList);
 $('#studentExport').onclick=exportStudents; drawStudentList();
}
function filteredStudents(){
 const y=$('#stuYear')?.value||getYear(), g=$('#stuGender')?.value||'', q=($('#stuSearch')?.value||'').toLowerCase();
 const classes=selectedValuesByName('stuClassCheck'), routes=selectedValuesByName('stuRouteCheck'), castes=selectedValuesByName('stuCasteCheck');
 return (db.students||[]).filter(s=>(!y||s.year===y)&&(!classes.length||classes.includes(s.className))&&(!routes.length||routes.includes(s.routeId||''))&&(!castes.length||castes.includes(String(s.caste||'')))&&(!g||s.gender===g)&&(!q||[s.name,s.registrationNo,s.mobileNumber,s.phone,s.guardian,s.fatherName,s.motherName,s.dobNp].some(v=>String(v||'').toLowerCase().includes(q))));
}
function drawStudentList(){
 const rows=filteredStudents();
 $('#studentHost').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Reg. No.</th><th>Student Name</th><th>Class</th><th>Guardian</th><th>Mobile</th><th>Phone</th><th>Nepali DOB</th><th>Route</th><th>Caste</th><th class="amount">Dues</th>${isAccountant()?'<th>Action</th>':''}</tr></thead><tbody>${rows.map(s=>`<tr><td>${esc(s.registrationNo)}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.className)}</td><td>${esc(s.guardian||s.fatherName||s.motherName||'')}</td><td>${esc(s.mobileNumber||'')}</td><td>${esc(s.phone||'')}</td><td>${esc(s.dobNp||'')}</td><td>${esc(routeById(s.routeId)?.name||'')}</td><td>${esc(s.caste||'')}</td><td class="amount ${num(s.dues)>0?'danger-text':''}">${money(s.dues)}</td>${isAccountant()?`<td class="nowrap"><button class="btn small" onclick="openStudentForm('${s.id}')">Edit</button> <button class="btn small" onclick="openLedgerDirect('${s.id}')">Fee Card</button></td>`:''}</tr>`).join('')}</tbody></table></div>`:`<div class="empty">No students found.</div>`;
}
function openStudentForm(id=''){
 const s=id?studentById(id):null; const reg=s?.registrationNo||nextRegistrationNo(false);
 openModal('STUDENT MASTER',s?'Edit Student':'New Admission',`
  <form id="studentForm" class="form-grid three"><input type="hidden" name="id" value="${esc(s?.id||'')}">
  <div><label>Academic Year</label><select name="year">${yearsOptions(s?.year||getYear())}</select></div>
  <div><label>Registration No.</label><input name="registrationNo" value="${esc(reg)}" readonly></div>
  <div><label>Class</label><select name="className" required>${classesOptions()}</select></div>
  <div><label>Student Name</label><input name="name" value="${esc(s?.name||'')}" required></div>
  <div><label>Roll No.</label><input name="roll" value="${esc(s?.roll||'')}"></div>
  <div><label>Nepali Date of Birth</label><input name="dobNp" value="${esc(s?.dobNp||'')}" placeholder="2083-01-01"></div>
  <div><label>Gender</label><select name="gender"><option></option><option>Male</option><option>Female</option><option>Other</option></select></div>
  <div><label>Caste</label><input name="caste" value="${esc(s?.caste||'')}"></div>
  <div><label>Category</label><select name="category"><option>New</option><option>Old</option></select></div>
  <div><label>Route</label><select name="routeId"><option value="">No Bus Route</option>${db.routes.filter(r=>r.active!==false).map(r=>`<option value="${r.id}">${esc(r.name)} (${money(r.amount)}/month)</option>`).join('')}</select></div>
  <div><label>Father Name</label><input name="fatherName" value="${esc(s?.fatherName||'')}"></div>
  <div><label>Mother Name</label><input name="motherName" value="${esc(s?.motherName||'')}"></div>
  <div><label>Guardian Name</label><input name="guardian" value="${esc(s?.guardian||'')}"></div>
  <div><label>Mobile Number</label><input name="mobileNumber" value="${esc(s?.mobileNumber||'')}"></div>
  <div><label>Phone / Emergency Number</label><input name="phone" value="${esc(s?.phone||'')}"></div>
  <div><label>Opening / Old Dues</label><input name="openingDues" type="number" min="0" step="0.01" value="${num(s?.openingDues!=null?s.openingDues:s?.dues)}"></div>
  <div><label>Advance</label><input name="advance" type="number" min="0" step="0.01" value="${num(s?.advance)}"></div>
  ${renderAddressBlock('perm',s)}
  ${renderAddressBlock('temp',s)}
  <div class="full form-actions"><button type="button" class="btn" onclick="closeModal()">Close</button><button class="btn primary">Save Student</button></div></form>`);
 const f=$('#studentForm');
 f.elements.className.value=s?.className||''; f.elements.gender.value=s?.gender||''; f.elements.category.value=s?.category||'New'; f.elements.routeId.value=s?.routeId||'';
 ['perm','temp'].forEach(prefix=>{ ['Province','District','Municipality'].forEach(k=>f.elements[prefix+k].dataset.value=s?.[prefix+k]||''); fillAddressSelects(f,prefix,true); f.elements[prefix+'Province'].value=s?.[prefix+'Province']||''; fillAddressSelects(f,prefix,true); f.elements[prefix+'District'].value=s?.[prefix+'District']||''; fillAddressSelects(f,prefix,true); f.elements[prefix+'Municipality'].value=s?.[prefix+'Municipality']||''; f.elements[prefix+'Country'].value=s?.[prefix+'Country']||'Nepal'; });
 ['perm','temp'].forEach(prefix=>{ f.elements[prefix+'Province'].onchange=()=>fillAddressSelects(f,prefix); f.elements[prefix+'District'].onchange=()=>fillAddressSelects(f,prefix); });
 const sameCb=f.elements.tempSameAsPermanent; if(sameCb){ sameCb.onchange=()=>{ if(sameCb.checked) copyPermanentToTemporary(f); }; }
 ['permProvince','permDistrict','permMunicipality','permWard','permCountry'].forEach(name=>{ if(f.elements[name]) f.elements[name].addEventListener('change',()=>{ if(f.elements.tempSameAsPermanent?.checked) copyPermanentToTemporary(f); }); });
 f.onsubmit=e=>{ e.preventDefault(); const fd=new FormData(f); const obj=Object.fromEntries(fd.entries()); obj.tempSameAsPermanent=!!f.elements.tempSameAsPermanent?.checked; if(obj.tempSameAsPermanent) copyPermanentToTemporary(f), Object.assign(obj,{tempCountry:f.elements.tempCountry.value,tempProvince:f.elements.tempProvince.value,tempDistrict:f.elements.tempDistrict.value,tempMunicipality:f.elements.tempMunicipality.value,tempWard:f.elements.tempWard.value}); if(s){ Object.assign(s,obj,{openingDues:num(obj.openingDues), dues:num(s.dues), advance:num(obj.advance)}); if(s.openingDues!==num(obj.openingDues)) s.openingDues=num(obj.openingDues); }
 else { db.students.push({id:uid('stu'),...obj,registrationNo:nextRegistrationNo(true),openingDues:num(obj.openingDues),dues:num(obj.openingDues),advance:num(obj.advance),closedMonths:{},createdDate:workingDate()}); }
 saveDB(); closeModal(); renderStudents(); toast('Student saved.'); };
}
function exportStudents(){
 const rows=filteredStudents().map(s=>[s.year,s.registrationNo,s.name,s.className,s.roll,s.gender,s.caste,s.category,s.fatherName,s.motherName,s.guardian,s.mobileNumber,s.phone,s.dobNp,routeById(s.routeId)?.name||'',s.permProvince,s.permDistrict,s.permMunicipality,s.permWard,s.tempProvince,s.tempDistrict,s.tempMunicipality,s.tempWard,s.dues]);
 exportXLS('Student_List.xls',['Year','Registration No','Student Name','Class','Roll','Gender','Caste','Category','Father','Mother','Guardian','Mobile Number','Phone / Emergency','Nepali DOB','Route','Permanent Province','Permanent District','Permanent Municipality','Permanent Ward','Temporary Province','Temporary District','Temporary Municipality','Temporary Ward','Dues'],rows,'Student List');
}

// Fee Card rename and details
function renderStudentSearch(){
 if(!isAccountant()&&!hasPermission('studentSearch')) return unauthorized();
 $('#content').innerHTML=`<div class="section"><div class="section-title"><div><h3>Fee Card</h3><p>Select Academic Year → Class → Student to view full fee details and personal ledger.</p></div></div><div class="toolbar"><div class="field"><label>Academic Year</label><select id="searchYear"><option value="">Select Year</option>${yearsOptions()}</select></div><div class="field"><label>Class</label><select id="searchClass" disabled>${classesOptions()}</select></div><div class="field"><label>Student</label><select id="searchStudent" disabled><option value="">Select Student</option></select></div></div><div id="studentReportHost" style="margin-top:14px"></div></div>`;
 $('#searchYear').onchange=()=>{ const y=$('#searchYear').value; $('#searchClass').disabled=!y; $('#searchClass').value=''; $('#searchStudent').innerHTML='<option value="">Select Student</option>'; $('#searchStudent').disabled=true; $('#studentReportHost').innerHTML=''; };
 $('#searchClass').onchange=()=>{ const y=$('#searchYear').value,c=$('#searchClass').value,arr=db.students.filter(s=>s.year===y&&s.className===c); $('#searchStudent').innerHTML='<option value="">Select Student</option>'+arr.map(s=>`<option value="${s.id}">${esc(s.registrationNo)} - ${esc(s.name)}</option>`).join(''); $('#searchStudent').disabled=!c; $('#studentReportHost').innerHTML=''; };
 $('#searchStudent').onchange=drawStudentReport;
}
function drawStudentReport(){ const s=studentById($('#searchStudent').value), y=$('#searchYear').value; if(!s){ $('#studentReportHost').innerHTML=''; return; } const receipts=db.receipts.filter(r=>r.studentId===s.id&&r.year===y).sort((a,b)=>a.date.localeCompare(b.date)||a.receiptNo.localeCompare(b.receiptNo)); const rows=receipts.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.receiptNo)}</td><td>${esc((r.months||[]).map(i=>NP_MONTHS[i]).join(', '))}</td><td>${(r.items||[]).map(i=>`${esc(i.label)}: ${money(i.amount)}`).join('<br>')}</td><td class="amount">${money(r.grandTotal)}</td><td class="amount">${money(r.discount)}</td><td class="amount">${money(r.paid)}</td><td class="amount">${money(r.balance)}</td><td>${isAccountant()?`<button class="btn small" onclick="showReceiptById('${r.id}')">View</button> <button class="btn small" onclick="printReceipt('${r.id}')">Print</button> <button class="btn small" onclick="openReceiptEdit('${r.id}')">Edit</button> <button class="btn small red" onclick="deleteReceipt('${r.id}')">Delete</button>`:'View only'}</td></tr>`).join(''); $('#studentReportHost').innerHTML=`<div class="summary-strip"><div class="summary-box"><small>Registration</small><strong>${esc(s.registrationNo)}</strong></div><div class="summary-box"><small>Student</small><strong>${esc(s.name)}</strong></div><div class="summary-box"><small>Class</small><strong>${esc(s.className)}</strong></div><div class="summary-box"><small>Guardian</small><strong>${esc(s.guardian||s.fatherName||s.motherName||'-')}</strong></div><div class="summary-box"><small>Current Dues</small><strong class="stat-red">${money(s.dues)}</strong></div></div>${isAccountant()?`<div class="section"><div class="section-title"><div><h3>Personal Fee Overrides</h3><p>Change one student\'s one month fee without changing the master rate.</p></div><button class="btn primary" onclick="openOverrideForm('${s.id}','${y}')">+ Add Override</button></div>${overrideTable(s.id,y)}</div>`:''}<div class="section"><div class="section-title"><div><h3>Transaction History</h3></div></div>${receipts.length?`<div class="table-wrap"><table><thead><tr><th>Nepali Date</th><th>Receipt No.</th><th>Fee Months</th><th>Fee Details</th><th class="amount">Grand Total</th><th class="amount">Discount</th><th class="amount">Received</th><th class="amount">Dues After</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="empty">No transactions for this student.</div>`}</div><div class="section"><div class="section-title"><div><h3>Month-wise Ledger</h3></div></div>${ledgerTable(s,y)}</div>`; }

function receiptHTML(r){ const logo=db.settings.logoData?`<img src="${db.settings.logoData}" alt="Logo">`:`<div style="font-weight:900;font-size:22px">SA</div>`; return `<div class="a5-receipt a5-bordered" id="printReceipt"><div class="receipt-head"><div class="receipt-school tight-header"><h1>${esc(db.settings.schoolName)}</h1><p>${esc(db.settings.address)}</p><p><b>ESTD:</b> ${esc(db.settings.estd||'')} &nbsp; <b>Telephone:</b> ${esc(db.settings.phone||'')} &nbsp; <b>PAN No.:</b> ${esc(db.settings.pan||'')}</p></div><div class="receipt-logo">${logo}</div></div><div class="receipt-title">FEE RECEIPT</div><div class="receipt-meta"><div><b>Receipt No.:</b> ${esc(r.receiptNo)}</div><div><b>Nepali Date:</b> ${esc(r.date)}</div><div><b>Registration No.:</b> ${esc(r.registrationNo)}</div><div><b>Class:</b> ${esc(r.className)}</div><div><b>Student Name:</b> ${esc(r.studentName)}</div><div><b>Parent/Guardian:</b> ${esc(r.guardian||'')}</div><div style="grid-column:1/-1"><b>Fee For Month(s):</b> ${esc((r.months||[]).map(i=>NP_MONTHS[i]).join(', ')||'-')}</div></div><div class="receipt-olddues"><b>Old Dues:</b> ${num(r.oldDues)>0?money(r.oldDues):''}</div><table class="receipt-table"><thead><tr><th style="width:7%">S.N.</th><th>Particular</th><th style="width:20%">Total Amount</th><th style="width:20%">Receive Amount</th><th style="width:18%">Balance</th></tr></thead><tbody>${(r.items||[]).map((i,idx)=>`<tr><td class="center">${idx+1}</td><td>${esc(i.label)}</td><td class="num">${money(i.amount)}</td><td></td><td></td></tr>`).join('')||`<tr><td class="center">1</td><td>Old Dues Payment</td><td class="num">${money(r.oldDues)}</td><td></td><td></td></tr>`}</tbody></table><table class="receipt-summary"><tr><td>Total Amount</td><td>${money(r.currentTotal)}</td></tr><tr><td>Dues</td><td>${num(r.oldDues)>0?money(r.oldDues):''}</td></tr><tr><td><b>Grand Total</b></td><td><b>${money(r.netPayable)}</b></td></tr><tr><td>Received Amount</td><td>${money(r.paid)}</td></tr><tr><td>Balance</td><td>${money(r.balance)}</td></tr></table><div class="amount-words"><b>Amount in Words:</b> ${esc(amountInWords(r.paid))} only.</div><div class="receipt-note">Bill is essential to get the deposit refunded.</div><div class="receipt-sign"><div class="sign-block left">Issued by: <b>${esc(db.settings.issuedBy||r.issuedBy||'')}</b></div><div class="sign-block">Accountant</div></div><div class="receipt-foot">Computer generated fee receipt · Nepali Date: ${esc(r.date)}</div></div>`; }
function showReceiptById(id,autoPrint=false){ const r=receiptById(id); if(!r) return; openModal('RECEIPT',`Receipt ${r.receiptNo}`,`<div class="no-print form-actions" style="margin-bottom:10px"><button class="btn" onclick="closeModal()">Close</button>${isAccountant()?`<button class="btn primary" onclick="printReceipt('${r.id}')">Print / Reprint A5</button> <button class="btn" onclick="openReceiptEdit('${r.id}')">Edit</button> <button class="btn red" onclick="deleteReceipt('${r.id}')">Delete</button>`:''}</div><div class="receipt-preview">${receiptHTML(r)}</div>`); if(autoPrint) setTimeout(()=>printReceipt(r.id),250); }
function recalculateStudentState(student,year){ student.closedMonths = student.closedMonths || {}; student.closedMonths[year]=[]; student.dues = num(student.openingDues); student.advance = 0; const receipts=db.receipts.filter(r=>r.studentId===student.id&&r.year===year).sort((a,b)=>a.date.localeCompare(b.date)||a.receiptNo.localeCompare(b.receiptNo)); receipts.forEach(r=>{ r.oldDues = num(student.dues); r.currentTotal = sum(r.items||[],x=>x.amount); r.grandTotal = num(r.oldDues)+num(r.currentTotal); r.netPayable = Math.max(0,num(r.grandTotal)-num(r.discount)); r.balance = Math.max(0,num(r.netPayable)-num(r.paid)); r.advance = Math.max(0,num(r.paid)-num(r.netPayable)); closeMonths(student,year,r.months||[]); student.dues = num(r.balance); student.advance += num(r.advance); }); saveDB(); }
function openReceiptEdit(id){ const r=receiptById(id); if(!r||!isAccountant()) return; openModal('EDIT RECEIPT',`Edit ${r.receiptNo}`,`<form id="receiptEditForm" class="form-grid"><div><label>Receipt No.</label><input value="${esc(r.receiptNo)}" readonly></div><div><label>Nepali Date</label><input name="date" value="${esc(r.date)}"></div><div><label>Payment Mode</label><select name="mode"><option ${r.mode==='Cash'?'selected':''}>Cash</option><option ${r.mode==='Bank'?'selected':''}>Bank</option></select></div><div><label>Discount Amount</label><input name="discount" type="number" min="0" step="0.01" value="${num(r.discount)}"></div><div><label>Received Amount</label><input name="paid" type="number" min="0" step="0.01" value="${num(r.paid)}"></div><div class="full"><label>Student</label><input value="${esc(r.studentName)} - ${esc(r.className)}" readonly></div><div class="full form-actions"><button type="button" class="btn" onclick="showReceiptById('${r.id}')">Back</button><button class="btn primary">Save Changes</button></div></form>`); const f=$('#receiptEditForm'); f.onsubmit=e=>{ e.preventDefault(); const fd=new FormData(f); if(!npDateValid(fd.get('date'))) return toast('Enter Nepali date as YYYY-MM-DD.'); r.date=fd.get('date'); r.mode=fd.get('mode'); r.discount=num(fd.get('discount')); r.paid=num(fd.get('paid')); const s=studentById(r.studentId); if(s) recalculateStudentState(s,r.year); saveDB(); closeModal(); showReceiptById(id); toast('Receipt updated.'); }; }
function deleteReceipt(id){ if(!isAccountant()) return; const r=receiptById(id); if(!r) return; if(!confirm(`Delete receipt ${r.receiptNo}?`)) return; db.receipts=db.receipts.filter(x=>x.id!==id); const s=studentById(r.studentId); if(s) recalculateStudentState(s,r.year); saveDB(); closeModal(); if(session.page==='receiptRegister') renderReceiptRegister(); else if(session.page==='studentSearch') drawStudentReport(); else renderPage(); toast('Receipt deleted.'); }
function drawReceiptRegister(){ const arr=receiptRegisterRows(); $('#receiptRegHost').innerHTML=arr.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Student</th><th>Class</th><th>Months</th><th class="amount">Received</th><th class="amount">Dues</th><th>Mode</th><th>Action</th></tr></thead><tbody>${arr.map(r=>`<tr><td>${r.date}</td><td><b>${esc(r.receiptNo)}</b></td><td>${esc(r.studentName)}</td><td>${esc(r.className)}</td><td>${esc((r.months||[]).map(i=>NP_MONTHS[i]).join(', '))}</td><td class="amount">${money(r.paid)}</td><td class="amount">${money(r.balance)}</td><td>${r.mode}</td><td>${isAccountant()?`<button class="btn small" onclick="showReceiptById('${r.id}')">View</button> <button class="btn small" onclick="printReceipt('${r.id}')">Print</button> <button class="btn small" onclick="openReceiptEdit('${r.id}')">Edit</button> <button class="btn small red" onclick="deleteReceipt('${r.id}')">Delete</button>`:'View only'}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No receipts found.</div>`; }

// quick receipt numbering
function renderQuickReceipt(){ if(!isAccountant()) return unauthorized(); $('#content').innerHTML=`<div class="two-col"><div class="section"><div class="section-title"><div><h3>New Quick Receipt</h3><p>For rent, extra income and other non-student school income.</p></div><b>Next Receipt: ${esc(nextQuickReceiptNo(false))}</b></div><form id="quickForm" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(workingDate())}" placeholder="2083-05-25" required></div><div><label>Payment Mode</label><select name="mode"><option>Cash</option><option>Bank</option></select></div><div class="full"><label>Income Topic / Title</label><input name="title" placeholder="Rent Income / Extra Income / Other Income" required></div><div><label>Amount</label><input name="amount" type="number" min="0" step="0.01" required></div><div><label>Received From (optional)</label><input name="receivedFrom"></div><div class="full"><label>Remarks</label><textarea name="remarks"></textarea></div><div class="full form-actions"><button class="btn primary big">Save & Print Quick Receipt</button></div></form></div><div class="section"><div class="section-title"><div><h3>Quick Receipt Register</h3><p>All non-student income is included in school income reports.</p></div><button class="btn green" id="quickExport">Export Excel</button></div><div id="quickList"></div></div></div>`; $('#quickForm').onsubmit=saveQuickReceipt; $('#quickExport').onclick=exportQuickReceipts; drawQuickList(); }
function saveQuickReceipt(e){ e.preventDefault(); const fd=new FormData(e.target), date=fd.get('date'); if(!npDateValid(date)) return toast('Enter Nepali date as YYYY-MM-DD.'); const q={id:uid('qrcp'),receiptNo:nextQuickReceiptNo(true),date,year:yearOfDate(date),mode:fd.get('mode'),title:fd.get('title'),amount:num(fd.get('amount')),receivedFrom:fd.get('receivedFrom'),remarks:fd.get('remarks'),issuedBy:db.settings.issuedBy}; db.quickReceipts.push(q); saveDB(); showQuickReceipt(q.id,true); renderQuickReceipt(); toast('Quick Receipt saved.'); }

// reminder / outstanding
function reminderReplacement(text, row){ return String(text||'').replace(/{{student}}/g,row.s.name).replace(/{{guardian}}/g,row.s.guardian||row.s.fatherName||row.s.motherName||'').replace(/{{class}}/g,row.s.className).replace(/{{toMonth}}/g,NP_MONTHS[num($('#outTo')?.value||0)]).replace(/{{total}}/g,money(row.total)).replace(/{{whatsapp}}/g,db.settings.reminderWhatsApp||'विद्यालय'); }
function groupedOutstandingItems(items){ const map={}; items.forEach(i=>{ const key=i.label+'|'+i.amount; map[key]=map[key]||{label:i.label, months:[], perAmount:i.amount, total:0}; map[key].months.push(i.month); map[key].total += num(i.amount); }); return Object.values(map); }
function outstandingRows(){ const y=$('#outYear')?.value||getYear(), c=$('#outClass')?.value||'', f=num($('#outFrom')?.value), t=num($('#outTo')?.value); if(!c) return []; return db.students.filter(s=>s.year===y&&s.className===c).map(s=>{ const items=[]; for(let i=f;i<=t;i++) if(!isMonthClosed(s,y,i)) monthCharges(s,y,i).forEach(x=>items.push({...x,month:NP_MONTHS[i]})); const grouped=groupedOutstandingItems(items), open=sum(items,x=>x.amount), old=num(s.dues), total=open+old; return {s,items,grouped,old,open,total}; }).filter(x=>x.total>=0); }
function renderOutstanding(){ if(!isAccountant()&&!hasPermission('outstanding')) return unauthorized(); $('#content').innerHTML=`<div class="section"><div class="section-title"><div><h3>Outstanding / Reminder Letter</h3><p>Preview unpaid charges with QR and custom reminder message.</p></div><div class="toolbar"><button class="btn green" id="outExport">Export Excel</button>${isAccountant()?`<button class="btn primary" id="outPrint">Print 4 Slips / A4</button>`:''}</div></div><div class="toolbar"><div class="field"><label>Academic Year</label><select id="outYear">${yearsOptions(getYear())}</select></div><div class="field"><label>Class</label><select id="outClass">${classesOptions()}</select></div><div class="field"><label>From Month</label><select id="outFrom">${NP_MONTHS.map((m,i)=>`<option value="${i}">${m}</option>`).join('')}</select></div><div class="field"><label>Up To Month</label><select id="outTo">${NP_MONTHS.map((m,i)=>`<option value="${i}" ${i===2?'selected':''}>${m}</option>`).join('')}</select></div><button class="btn cyan" id="outPreview">Preview</button></div><div id="outHost" style="margin-top:12px"></div></div>`; $('#outPreview').onclick=drawOutstanding; $('#outExport').onclick=exportOutstanding; if(isAccountant()) $('#outPrint').onclick=printOutstanding; drawOutstanding(); }
function drawOutstanding(){ const rows=outstandingRows(); $('#outHost').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr>${isAccountant()?'<th>Select</th>':''}<th>Student</th><th>Guardian</th><th>Up To</th><th>Heading-wise Due</th><th class="amount">Old Dues</th><th class="amount">Open Fees</th><th class="amount">Grand Total</th></tr></thead><tbody>${rows.map((x,idx)=>`<tr><td>${isAccountant()?`<input class="outSelect" name="outSelect" type="checkbox" value="${x.s.id}" ${x.total>0?'checked':''}>`:''}</td><td><b>${esc(x.s.name)}</b><br><small>${esc(x.s.registrationNo)}</small></td><td>${esc(x.s.guardian||x.s.fatherName||x.s.motherName||'')}</td><td>Up to ${NP_MONTHS[num($('#outTo').value)]}</td><td>${x.grouped.length?x.grouped.map(g=>`${esc(g.label)} · Months: ${esc(g.months.join(', '))} · Per Month: ${money(g.perAmount)} · Total: ${money(g.total)}`).join('<br>'):'<span class="muted">No open fee</span>'}</td><td class="amount">${money(x.old)}</td><td class="amount">${money(x.open)}</td><td class="amount ${x.total>0?'danger-text':'good-text'}">${money(x.total)}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">Select a class to preview reminder letters.</div>`; }
function exportOutstanding(){ const rows=outstandingRows(); exportXLS('Outstanding_Reminder.xls',['Reg No','Student','Class','Guardian','Up To Month','Old Dues','Heading Details','Grand Total'],rows.map(x=>[x.s.registrationNo,x.s.name,x.s.className,x.s.guardian||x.s.fatherName||x.s.motherName,NP_MONTHS[num($('#outTo')?.value||0)],x.old,x.grouped.map(g=>`${g.label}; Months=${g.months.join(', ')}; PerMonth=${g.perAmount}; Total=${g.total}`).join(' | '),x.total]),'Outstanding / Reminder'); }
function selectedOutstandingRows(){ const selected=selectedValuesByName('outSelect'); const rows=outstandingRows(); return selected.length?rows.filter(r=>selected.includes(r.s.id)):rows; }
function printOutstanding(){ const rows=selectedOutstandingRows(); if(!rows.length) return toast('No reminder slips to print.'); const y=$('#outYear').value, to=NP_MONTHS[num($('#outTo').value)]; const qr=db.settings.reminderQRData?`<img src="${db.settings.reminderQRData}" class="reminder-qr">`:''; const slips=rows.map(x=>`<div class="slip modern-slip"><div class="slip-head"><h3>${esc(db.settings.schoolName)}</h3><p>${esc(db.settings.address)}</p><h4>${esc(db.settings.remindHeader||'Fee Reminder')}</h4></div><p><b>Student:</b> ${esc(x.s.name)} &nbsp; <b>Class:</b> ${esc(x.s.className)}</p><p><b>Guardian:</b> ${esc(x.s.guardian||x.s.fatherName||x.s.motherName||'')}</p><p><b>Period:</b> Up to ${to}, ${y}</p><table class="slip-detail"><thead><tr><th>Particular</th><th>Months</th><th>Per Month</th><th>Total</th></tr></thead><tbody>${x.grouped.map(g=>`<tr><td>${esc(g.label)}</td><td>${esc(g.months.join(', '))}</td><td>${money(g.perAmount)}</td><td>${money(g.total)}</td></tr>`).join('')}${num(x.old)>0?`<tr><td>Old Dues</td><td>-</td><td>-</td><td>${money(x.old)}</td></tr>`:''}</tbody></table><p class="due"><b>Grand Total: ${money(x.total)}</b></p><div class="slip-message">${esc(reminderReplacement(db.settings.reminderTemplate,x))}</div><div class="slip-online">${esc(reminderReplacement(db.settings.reminderOnlineNote,x))}</div><div class="slip-qr-wrap">${qr}${db.settings.reminderWhatsApp?`<div class="qr-note">WhatsApp: ${esc(db.settings.reminderWhatsApp)}</div>`:''}</div></div>`).join(''); const w=window.open('','_blank','width=960,height=900'); w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:8mm}body{font-family:Arial;margin:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm}.modern-slip{border:1px solid #000;padding:5mm;min-height:137mm;break-inside:avoid}.modern-slip h3,.modern-slip h4{text-align:center;margin:2px}.modern-slip p{font-size:11px;margin:4px 0}.slip-detail{width:100%;font-size:10px;border-collapse:collapse;margin:5px 0}.slip-detail th,.slip-detail td{border:1px solid #aaa;padding:3px}.due{text-align:right;font-size:13px!important}.reminder-qr{width:72px;height:72px;object-fit:contain;border:1px solid #ddd}.slip-qr-wrap{display:flex;align-items:center;justify-content:space-between;margin-top:6px}.slip-message,.slip-online{font-size:10px;line-height:1.3;margin-top:6px;white-space:pre-wrap}</style></head><body><div class="grid">${slips}</div><script>setTimeout(()=>window.print(),300)<\/script></body></html>`); w.document.close(); }

// admit card
function renderAdmitCard(){ if(!isAccountant()) return unauthorized(); $('#content').innerHTML=`<div class="section"><div class="section-title"><div><h3>Admit Card</h3><p>Print colorful admit cards — 6 cards on one A4 page.</p></div><button class="btn primary" id="admitPrintBtn">Print Admit Cards</button></div><div class="toolbar"><div class="field"><label>Academic Year</label><select id="admYear">${yearsOptions(getYear())}</select></div><div class="field"><label>Class</label><select id="admClass">${classesOptions()}</select></div><button class="btn cyan" id="admView">View Students</button></div><div id="admitHost" style="margin-top:12px"></div></div>`; $('#admView').onclick=drawAdmitList; $('#admitPrintBtn').onclick=printAdmitCards; drawAdmitList(); }
function drawAdmitList(){ const y=$('#admYear')?.value||getYear(), c=$('#admClass')?.value||''; const rows=c?db.students.filter(s=>s.year===y&&s.className===c):[]; $('#admitHost').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="admitAll" checked></th><th>Reg. No.</th><th>Student</th><th>Class</th><th>Guardian</th><th class="amount">Current Due</th></tr></thead><tbody>${rows.map(s=>`<tr><td><input class="admitSel" name="admitSel" type="checkbox" value="${s.id}" checked></td><td>${esc(s.registrationNo)}</td><td>${esc(s.name)}</td><td>${esc(s.className)}</td><td>${esc(s.guardian||s.fatherName||s.motherName||'')}</td><td class="amount">${money(s.dues)}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">Select Academic Year and Class to view students for admit card printing.</div>`; const all=$('#admitAll'); if(all) all.onchange=()=>$$('.admitSel').forEach(c=>c.checked=all.checked); }
function selectedAdmitStudents(){ return selectedValuesByName('admitSel').map(id=>studentById(id)).filter(Boolean); }
function printAdmitCards(){ const students=selectedAdmitStudents(); if(!students.length) return toast('Select at least one student.'); const logo=db.settings.logoData?`<img src="${db.settings.logoData}" class="admit-logo">`:''; const cards=students.map(s=>`<div class="admit-card"><div class="admit-top">${logo}<div class="admit-school"><div class="admit-school-name">${esc(db.settings.schoolName)}</div><div class="admit-school-sub">${esc(db.settings.address)}</div><div class="admit-term">${esc(db.settings.admitCardTerm||'First Term')}</div><div class="admit-title">${esc(db.settings.admitCardTitle||'ADMIT CARD')}</div></div></div><div class="admit-body"><div><b>Student Name:</b> ${esc(s.name)}</div><div><b>Class:</b> ${esc(s.className)}</div><div><b>Registration No.:</b> ${esc(s.registrationNo)}</div><div><b>Guardian Name:</b> ${esc(s.guardian||s.fatherName||s.motherName||'')}</div></div><div class="admit-signs"><div><span>....................</span><small>${esc(db.settings.examCoordinatorName||'Exam Coordinator')}</small><small>${esc(db.settings.examCoordinatorPost||'Exam Coordinator')}</small></div><div><span>....................</span><small>${esc(db.settings.principalName||'Principal')}</small><small>${esc(db.settings.principalPost||'Principal')}</small></div><div><span>....................</span><small>${esc(db.settings.accountantSignName||'Accountant')}</small><small>${esc(db.settings.accountantSignPost||'Accountant')}</small></div></div></div>`).join(''); const w=window.open('','_blank','width=1000,height=900'); w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:8mm}body{font-family:Arial;margin:0}.admit-grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.admit-card{break-inside:avoid;border:2px solid #2a7bbf;border-radius:12px;padding:4mm;background:linear-gradient(180deg,#f6fbff,#ffffff);min-height:87mm;position:relative;box-shadow:inset 0 0 0 3px #d9eefc}.admit-top{display:flex;gap:10px;align-items:center;border-bottom:1px solid #b8ddf6;padding-bottom:6px}.admit-logo{width:52px;height:52px;object-fit:contain}.admit-school{text-align:center;flex:1}.admit-school-name{font-size:16px;font-weight:800;color:#155b92}.admit-school-sub{font-size:10px}.admit-term{display:inline-block;margin-top:3px;padding:2px 8px;background:#0ea5e9;color:#fff;border-radius:999px;font-size:10px;font-weight:700}.admit-title{margin-top:4px;font-size:14px;font-weight:900;color:#b51d1d;letter-spacing:.08em}.admit-body{font-size:12px;line-height:1.55;padding-top:7px}.admit-signs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;position:absolute;left:4mm;right:4mm;bottom:4mm;text-align:center}.admit-signs span{display:block;font-size:14px}.admit-signs small{display:block;font-size:9px}</style></head><body><div class="admit-grid">${cards}</div><script>setTimeout(()=>window.print(),300)<\/script></body></html>`); w.document.close(); }

// settings redesign
function renderSettings(){ if(!isAccountant()) return unauthorized(); $('#content').innerHTML=`<div class="two-col"><div><div class="section"><div class="section-title"><div><h3>School & Receipt Settings</h3><p>All common setup options are grouped clearly here.</p></div></div><form id="setForm" class="form-grid"><div class="full"><label>School Name</label><input name="schoolName" value="${esc(db.settings.schoolName)}"></div><div class="full"><label>Address</label><input name="address" value="${esc(db.settings.address)}"></div><div><label>ESTD</label><input name="estd" value="${esc(db.settings.estd)}"></div><div><label>Telephone</label><input name="phone" value="${esc(db.settings.phone)}"></div><div><label>PAN No.</label><input name="pan" value="${esc(db.settings.pan)}"></div><div><label>Issued By</label><input name="issuedBy" value="${esc(db.settings.issuedBy)}"></div><div><label>Default Working Nepali Date</label><input name="workingDate" value="${esc(db.settings.workingDate)}"></div><div class="full"><label>School Logo</label><div class="two-col"><div class="logo-preview" id="logoPreview">${db.settings.logoData?`<img src="${db.settings.logoData}">`:'No Logo'}</div><div><input id="logoUpload" type="file" accept="image/*"><p class="card-note">Upload once from local file. The logo is used in receipt and admit card printing.</p><button type="button" class="btn" id="removeLogo">Remove Logo</button></div></div></div><div class="full form-actions"><button class="btn primary">Save General Settings</button></div></form></div><div class="section"><div class="section-title"><div><h3>Numbering Settings</h3></div></div><form id="numberForm" class="form-grid"><div><label>Receipt Prefix</label><input name="receiptPrefix" value="${esc(db.settings.receiptPrefix||'R-')}"></div><div><label>Next Fee Receipt No.</label><input name="nextReceiptNumber" type="number" min="1" value="${num(db.settings.nextReceiptNumber)}"></div><div><label>Quick Receipt Prefix</label><input name="quickReceiptPrefix" value="${esc(db.settings.quickReceiptPrefix||'QR-')}"></div><div><label>Next Quick Receipt No.</label><input name="nextQuickReceiptNumber" type="number" min="1" value="${num(db.settings.nextQuickReceiptNumber)}"></div><div><label>Payment / Voucher Prefix</label><input name="expensePrefix" value="${esc(db.settings.expensePrefix||'PV-')}"></div><div><label>Next Voucher No.</label><input name="nextExpenseNumber" type="number" min="1" value="${num(db.settings.nextExpenseNumber)}"></div><div><label>Admission / Registration Prefix</label><input name="registrationPrefix" value="${esc(db.settings.registrationPrefix)}"></div><div><label>Next Registration No.</label><input name="nextRegistrationNumber" type="number" min="1" value="${num(db.settings.nextRegistrationNumber)}"></div><div class="full form-actions"><button class="btn primary">Save Numbering</button></div></form></div><div class="section"><div class="section-title"><div><h3>Reminder Letter Settings</h3><p>Everything for QR reminder slips is managed here.</p></div></div><form id="remindForm" class="form-grid"><div class="full"><label>Reminder Header</label><input name="remindHeader" value="${esc(db.settings.remindHeader||'Fee Reminder')}"></div><div class="full"><label>WhatsApp / Contact Number</label><input name="reminderWhatsApp" value="${esc(db.settings.reminderWhatsApp||'')}"></div><div class="full"><label>Reminder Message Template</label><textarea name="reminderTemplate">${esc(db.settings.reminderTemplate||'')}</textarea></div><div class="full"><label>Online Payment / QR Note</label><textarea name="reminderOnlineNote">${esc(db.settings.reminderOnlineNote||'')}</textarea></div><div class="full"><label>Reminder QR Upload</label><div class="two-col"><div class="logo-preview" id="qrPreview">${db.settings.reminderQRData?`<img src="${db.settings.reminderQRData}">`:'No QR'}</div><div><input id="qrUpload" type="file" accept="image/*"><button type="button" class="btn" id="removeQR">Remove QR</button><p class="card-note">Placeholders you can use in text: {{student}}, {{guardian}}, {{class}}, {{toMonth}}, {{total}}, {{whatsapp}}</p></div></div></div><div class="full form-actions"><button class="btn primary">Save Reminder Settings</button></div></form></div><div class="section"><div class="section-title"><div><h3>Admit Card Settings</h3></div></div><form id="admitSetForm" class="form-grid"><div><label>Term / Exam Name</label><input name="admitCardTerm" value="${esc(db.settings.admitCardTerm||'First Term')}"></div><div><label>Card Title</label><input name="admitCardTitle" value="${esc(db.settings.admitCardTitle||'ADMIT CARD')}"></div><div><label>Exam Coordinator Name</label><input name="examCoordinatorName" value="${esc(db.settings.examCoordinatorName||'Exam Coordinator')}"></div><div><label>Post</label><input name="examCoordinatorPost" value="${esc(db.settings.examCoordinatorPost||'Exam Coordinator')}"></div><div><label>Principal Name</label><input name="principalName" value="${esc(db.settings.principalName||'Principal')}"></div><div><label>Post</label><input name="principalPost" value="${esc(db.settings.principalPost||'Principal')}"></div><div><label>Accountant Name</label><input name="accountantSignName" value="${esc(db.settings.accountantSignName||'Accountant')}"></div><div><label>Post</label><input name="accountantSignPost" value="${esc(db.settings.accountantSignPost||'Accountant')}"></div><div class="full form-actions"><button class="btn primary">Save Admit Card Settings</button></div></form></div></div><div><div class="section"><div class="section-title"><div><h3>Security</h3><p>No visible demo passwords. Accountant can reset CEO and MD here.</p></div></div><div class="security-panel"><h4>Change Accountant Password</h4><form id="changeOwn" class="form-grid"><div><label>Current Password</label><input name="current" type="password" required></div><div><label>New Password</label><input name="next" type="password" minlength="6" required></div><div><label>Confirm New Password</label><input name="confirm" type="password" minlength="6" required></div><div class="form-actions"><button class="btn primary">Change & Logout</button></div></form></div><div class="security-panel" style="margin-top:12px"><h4>Reset CEO Password</h4><form id="resetCEO" class="form-grid"><div><label>New Password</label><input name="next" type="password" minlength="6" required></div><div><label>Confirm</label><input name="confirm" type="password" minlength="6" required></div><div class="full form-actions"><button class="btn">Reset CEO Password</button></div></form></div><div class="security-panel" style="margin-top:12px"><h4>Reset MD Password</h4><form id="resetMD" class="form-grid"><div><label>New Password</label><input name="next" type="password" minlength="6" required></div><div><label>Confirm</label><input name="confirm" type="password" minlength="6" required></div><div class="full form-actions"><button class="btn">Reset MD Password</button></div></form></div></div><div class="section"><div class="section-title"><div><h3>Local Data</h3></div></div><button class="btn green" id="backupBtn">Download JSON Backup</button> <button class="btn red" id="resetAllBtn">Reset Everything to Zero</button><p class="card-note">Reset deletes all locally entered operational data. Login passwords and settings are also reset and first-time setup will appear again.</p></div></div></div>`;
 $('#setForm').onsubmit=e=>{ e.preventDefault(); const fd=new FormData(e.target); ['schoolName','address','estd','phone','pan','issuedBy','workingDate'].forEach(k=>db.settings[k]=fd.get(k)); saveDB(); $('#workingDate').value=db.settings.workingDate; updateSideLogo(); toast('General settings saved.'); };
 $('#numberForm').onsubmit=e=>{ e.preventDefault(); const fd=new FormData(e.target); ['receiptPrefix','quickReceiptPrefix','expensePrefix','registrationPrefix'].forEach(k=>db.settings[k]=fd.get(k)); ['nextReceiptNumber','nextQuickReceiptNumber','nextExpenseNumber','nextRegistrationNumber'].forEach(k=>db.settings[k]=Math.max(1,num(fd.get(k)))); saveDB(); toast('Numbering saved.'); };
 $('#remindForm').onsubmit=e=>{ e.preventDefault(); const fd=new FormData(e.target); ['remindHeader','reminderWhatsApp','reminderTemplate','reminderOnlineNote'].forEach(k=>db.settings[k]=fd.get(k)); saveDB(); toast('Reminder settings saved.'); };
 $('#admitSetForm').onsubmit=e=>{ e.preventDefault(); const fd=new FormData(e.target); ['admitCardTerm','admitCardTitle','examCoordinatorName','examCoordinatorPost','principalName','principalPost','accountantSignName','accountantSignPost'].forEach(k=>db.settings[k]=fd.get(k)); saveDB(); toast('Admit card settings saved.'); };
 $('#logoUpload').onchange=handleLogoUpload; $('#removeLogo').onclick=()=>{ db.settings.logoData=''; saveDB(); renderSettings(); updateSideLogo(); };
 $('#qrUpload').onchange=handleQRUpload; $('#removeQR').onclick=()=>{ db.settings.reminderQRData=''; saveDB(); renderSettings(); };
 $('#changeOwn').onsubmit=e=>{ e.preventDefault(); const fd=new FormData(e.target); if(!verifyPassword('accountant',fd.get('current'))) return toast('Current password is incorrect.'); if(fd.get('next')!==fd.get('confirm')) return toast('New passwords do not match.'); setPassword('accountant',fd.get('next')); saveDB(); logout('Accountant password changed. Please login again.'); };
 $('#resetCEO').onsubmit=e=>resetRolePassword(e,'ceo'); $('#resetMD').onsubmit=e=>resetRolePassword(e,'md'); $('#backupBtn').onclick=backupJSON; $('#resetAllBtn').onclick=resetEverything; }
function handleQRUpload(e){ const f=e.target.files?.[0]; if(!f) return; const rd=new FileReader(); rd.onload=()=>{ const img=new Image(); img.onload=()=>{ const c=document.createElement('canvas'), max=300, scale=Math.min(1,max/img.width,max/img.height); c.width=Math.max(1,Math.round(img.width*scale)); c.height=Math.max(1,Math.round(img.height*scale)); c.getContext('2d').drawImage(img,0,0,c.width,c.height); db.settings.reminderQRData=c.toDataURL('image/png',.92); saveDB(); renderSettings(); toast('QR uploaded.'); }; img.src=rd.result; }; rd.readAsDataURL(f); }

function renderExpenses(){ if(!isAccountant()) return unauthorized(); $('#content').innerHTML=`<div class="two-col"><div class="section"><div class="section-title"><div><h3>New Expense</h3></div><div><b>Next Voucher:</b> ${esc(nextExpenseNo(false))}</div></div><form id="expForm" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(workingDate())}" required></div><div><label>Mode</label><select name="mode"><option>Cash</option><option>Bank</option></select></div><div class="full"><label>Expense Head</label><input name="head" placeholder="Salary / Stationery / Maintenance / etc." required></div><div><label>Amount</label><input name="amount" type="number" min="0" step="0.01" required></div><div><label>Paid To</label><input name="paidTo"></div><div class="full"><label>Remarks</label><textarea name="remarks"></textarea></div><div class="full form-actions"><button class="btn primary">Save Expense</button></div></form></div><div class="section"><div class="section-title"><div><h3>Expense Register</h3></div><button class="btn green" id="expExport">Export Excel</button></div><div id="expHost"></div></div></div>`; $('#expForm').onsubmit=e=>{ e.preventDefault(); const fd=new FormData(e.target), date=fd.get('date'); if(!npDateValid(date)) return toast('Use Nepali date YYYY-MM-DD.'); db.expenses.push({id:uid('exp'),voucherNo:nextExpenseNo(true),date,year:yearOfDate(date),head:fd.get('head'),amount:num(fd.get('amount')),mode:fd.get('mode'),paidTo:fd.get('paidTo'),remarks:fd.get('remarks')}); saveDB(); renderExpenses(); toast('Expense saved.'); }; $('#expExport').onclick=()=>exportXLS('Expenses.xls',['Voucher No','Date','Head','Paid To','Mode','Amount','Remarks'],db.expenses.map(x=>[x.voucherNo,x.date,x.head,x.paidTo,x.mode,x.amount,x.remarks]),'Expense Register'); drawExpenses(); }
function drawExpenses(){ const a=[...db.expenses].sort((a,b)=>b.date.localeCompare(a.date)); $('#expHost').innerHTML=a.length?`<div class="table-wrap compact"><table><thead><tr><th>Voucher No.</th><th>Date</th><th>Head</th><th>Mode</th><th>Paid To</th><th class="amount">Amount</th></tr></thead><tbody>${a.map(x=>`<tr><td>${esc(x.voucherNo||'')}</td><td>${x.date}</td><td>${esc(x.head)}</td><td>${x.mode}</td><td>${esc(x.paidTo||'')}</td><td class="amount">${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No expenses yet.</div>`; }

// auto working date on startup
upgradeV5Data();
syncAutoWorkingDate();
if(document.querySelector('#workingDate')) document.querySelector('#workingDate').value=db.settings.workingDate;
window.openReceiptEdit=openReceiptEdit; window.deleteReceipt=deleteReceipt; window.renderAdmitCard=renderAdmitCard; window.printAdmitCards=printAdmitCards;
/* ==================== END V5 REVIEW 1 OVERRIDES ==================== */

/* ==================== V6 POLISHED LOCAL TEST OVERRIDES ==================== */
function upgradeV6Data(){
  db.version=6;
  db.banks=db.banks||[];
  db.bankTransactions=db.bankTransactions||[];
  db.settings=Object.assign({
    examCoordinatorSignatureData:'',principalSignatureData:'',accountantSignatureData:'',
    cashOpeningBalance:0,dateAnchorInitialized:false
  },db.settings||{});
  db.students=(db.students||[]).map(s=>Object.assign({masterId:s.masterId||s.id,admitHallNo:s.admitHallNo||'',yearEndStatus:s.yearEndStatus||''},s));
  if(!PERMISSION_OPTIONS.some(x=>x[0]==='banking')) PERMISSION_OPTIONS.push(['banking','Banking Report']);
  saveDB();
}
function syncAutoWorkingDateV6(){
  const now=new Date();
  const todayAD=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const anchorAD='2026-09-11', anchorNP='2083-05-26';
  if(!db.settings.dateAnchorInitialized){
    const hasTxn=(db.receipts||[]).length||(db.quickReceipts||[]).length||(db.expenses||[]).length||(db.bankTransactions||[]).length;
    if(!hasTxn && (!db.settings.workingDate || db.settings.workingDate==='2083-01-01')){
      const a=parseISODate(anchorAD),b=parseISODate(todayAD),diff=a&&b?Math.floor((b-a)/(24*3600*1000)):0;
      db.settings.workingDate=addDaysToNpDate(anchorNP,diff);
    }
    db.settings.lastAutoSyncAD=todayAD;
    db.settings.dateAnchorInitialized=true;
    saveDB();
    return;
  }
  const last=db.settings.lastAutoSyncAD||todayAD,a=parseISODate(last),b=parseISODate(todayAD);
  if(a&&b){const diff=Math.floor((b-a)/(24*3600*1000));if(diff)db.settings.workingDate=addDaysToNpDate(db.settings.workingDate||anchorNP,diff);}
  db.settings.lastAutoSyncAD=todayAD;saveDB();
}
function bankById(id){return (db.banks||[]).find(b=>b.id===id)}
function activeBanks(){return (db.banks||[]).filter(b=>b.active!==false)}
function bankOptions(selected='',blank='Select Bank'){return `<option value="">${blank}</option>`+activeBanks().map(b=>`<option value="${b.id}" ${b.id===selected?'selected':''}>${esc(b.name)}</option>`).join('')}
function bankLabel(id){return bankById(id)?.name||'Unassigned Bank'}
function totalDues(){const y=getYear();return sum((db.students||[]).filter(s=>s.year===y),s=>s.dues)}
function studentMasterId(s){return s?.masterId||s?.id||''}
function linkedStudentIds(s){const m=studentMasterId(s);return (db.students||[]).filter(x=>studentMasterId(x)===m).map(x=>x.id)}

function navItems(){
 const all=[
  ['dashboard','▦','Dashboard'],['feePayment','▣','Fee Payment'],['quickReceipt','＋','Quick Receipt'],['quickRegister','▤','Quick Receipt Register'],['students','♟','Students'],['studentUpdate','⇧','Student Update'],['studentSearch','⌕','Fee Card'],['admitCard','🪪','Admit Card'],
  ['receiptRegister','▤','Receipt Register'],['feeStructure','≡','Fee Structure'],['dailyCollection','▥','Daily Collection'],['outstanding','!','Outstanding / Reminder'],['examHallPass','✓','Exam Hall Pass'],['expenses','−','Expenses'],['banking','▰','Banking Transactions'],['daybook','▧','Day Book'],['monthly','▦','Monthly Summary'],['headwise','#','Head-wise Collection'],
  ['reports','▩','Reports'],['access','⚿','MD / CEO Access'],['settings','⚙','Settings'],['help','?','Help']
 ];
 const accountantOnly=new Set(['feePayment','quickReceipt','feeStructure','expenses','studentUpdate','access','settings']);
 return all.filter(([p])=>isAccountant()?true:(!accountantOnly.has(p)&&hasPermission(p)));
}
Object.assign(PAGE_TITLES,{studentUpdate:'Student Update / Year-End Promotion',banking:'Banking Transactions'});
function renderPage(){renderSideNav();const title=PAGE_TITLES[session.page]||'Accounts';$('#pageTitle').textContent=title;$('#breadcrumb').textContent=`Accounts > ${title}`;const map={dashboard:renderDashboard,feePayment:renderFeePayment,quickReceipt:renderQuickReceipt,quickRegister:renderQuickRegister,students:renderStudents,studentUpdate:renderStudentUpdate,studentSearch:renderStudentSearch,admitCard:renderAdmitCard,receiptRegister:renderReceiptRegister,feeStructure:renderFeeStructure,dailyCollection:renderDailyCollection,outstanding:renderOutstanding,examHallPass:renderExamHallPass,expenses:renderExpenses,banking:renderBanking,daybook:renderDayBook,monthly:renderMonthly,headwise:renderHeadwise,reports:renderReports,access:renderAccess,settings:renderSettings,help:renderHelp};(map[session.page]||renderDashboard)();renderSideNav();}

/* ---------- Fee payment: free numeric discount + bank account ---------- */
function renderFeePayment(){
 if(!isAccountant())return unauthorized();
 paymentState={year:getYear(),className:'',studentId:'',selectedMonths:[],date:workingDate(),mode:'Cash',bankId:'',discount:0,paid:0};
 $('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Fee Payment</h3><p>Year → Class → Student → Month(s). Receipt number is automatic.</p></div><div class="next-number"><small>Next Receipt</small><b>${esc(nextReceiptNo(false))}</b></div></div><div class="form-grid three"><div><label>Academic Year</label><select id="payYear">${yearsOptions(paymentState.year)}</select></div><div><label>Class</label><select id="payClass">${classesOptions()}</select></div><div><label>Student</label><select id="payStudent" disabled><option value="">Select Student</option></select></div><div><label>Nepali Date</label><input id="payDate" value="${esc(workingDate())}" placeholder="2083-05-26"></div><div><label>Payment Mode</label><select id="payMode"><option>Cash</option><option>Bank</option></select></div><div id="payBankWrap" class="hidden"><label>Bank Account</label><select id="payBank">${bankOptions()}</select></div><div><label>Registration No.</label><input id="payReg" readonly></div></div></div><div id="payHost"></div>`;
 $('#payClass').onchange=fillPayStudents;$('#payYear').onchange=fillPayStudents;$('#payStudent').onchange=drawPayPanel;$('#payDate').oninput=e=>paymentState.date=e.target.value;
 $('#payMode').onchange=e=>{paymentState.mode=e.target.value;$('#payBankWrap').classList.toggle('hidden',e.target.value!=='Bank');};
 $('#payBank').onchange=e=>paymentState.bankId=e.target.value;
}
function drawPaymentCalc(){
 const s=studentById(paymentState.studentId),y=paymentState.year;if(!s)return;
 const items=currentPayItems(s,y,paymentState.selectedMonths),currentTotal=sum(items,x=>x.amount),oldDues=num(s.dues),grand=currentTotal+oldDues;
 let discount=Math.min(Math.max(0,num(paymentState.discount)),grand),net=Math.max(0,grand-discount);
 if(paymentState.paid===0 && (items.length||oldDues>0)) paymentState.paid=net;
 $('#payCalc').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Selected Fee Details</h3><p>Discount accepts any amount such as 50, 350 or 1000.</p></div></div>${items.length?`<div class="payment-lines">${items.map(i=>`<div class="payment-line"><div class="month">${i.month}</div><div class="label">${esc(i.label)}${i.overridden?' <span class="chip">Scholarship</span>':''}</div><div class="amt">${money(i.amount)}</div></div>`).join('')}</div>`:`<div class="empty">Select one or more open months.</div>`}<div class="totals-panel polished-totals" style="margin-top:12px"><div class="row"><span>Current Fee Total</span><b>${money(currentTotal)}</b></div><div class="row"><span>Old Dues</span><b>${money(oldDues)}</b></div><div class="row"><span>Discount</span><input id="payDiscount" inputmode="decimal" type="number" min="0" step="1" value="${num(paymentState.discount)}"></div><div class="row grand"><span>Net Payable</span><b id="payNet">${money(net)}</b></div><div class="row"><span>Received Amount</span><input id="payPaid" inputmode="decimal" type="number" min="0" step="1" value="${num(paymentState.paid)}"></div><div class="row"><span>New Dues / Balance</span><b id="payNewDues" class="stat-red">${money(Math.max(0,net-num(paymentState.paid)))}</b></div><div class="row"><span>Advance</span><b id="payAdvance">${money(Math.max(0,num(paymentState.paid)-net))}</b></div></div><div class="form-actions" style="margin-top:14px"><button class="btn primary big" id="savePayment" ${paymentState.selectedMonths.length||oldDues>0?'':'disabled'}>Save & Print Receipt</button></div></div>`;
 const refresh=()=>{paymentState.discount=Math.min(Math.max(0,num($('#payDiscount').value)),grand);const n=Math.max(0,grand-paymentState.discount);paymentState.paid=Math.max(0,num($('#payPaid').value));$('#payNet').textContent=money(n);$('#payNewDues').textContent=money(Math.max(0,n-paymentState.paid));$('#payAdvance').textContent=money(Math.max(0,paymentState.paid-n));};
 $('#payDiscount').oninput=refresh;$('#payPaid').oninput=refresh;$('#savePayment').onclick=savePayment;
}
function savePayment(){
 const s=studentById(paymentState.studentId),y=paymentState.year;if(!s)return;if(!npDateValid(paymentState.date))return toast('Enter Nepali date as YYYY-MM-DD.');
 if(paymentState.mode==='Bank'&&!paymentState.bankId)return toast('Select the bank account that received this payment.');
 const items=currentPayItems(s,y,paymentState.selectedMonths),currentTotal=sum(items,x=>x.amount),oldDues=num(s.dues),grand=currentTotal+oldDues,discount=Math.min(num(paymentState.discount),grand),net=Math.max(0,grand-discount),paid=num(paymentState.paid),balance=Math.max(0,net-paid),advance=Math.max(0,paid-net);
 if(!items.length&&oldDues<=0)return toast('Select at least one payable month.');
 const receipt={id:uid('rcp'),receiptNo:nextReceiptNo(true),date:paymentState.date,year:y,studentId:s.id,masterId:studentMasterId(s),registrationNo:s.registrationNo,studentName:s.name,className:s.className,guardian:s.guardian||s.fatherName||s.motherName||'',months:[...paymentState.selectedMonths],items,oldDues,currentTotal,grandTotal:grand,discount,netPayable:net,paid,balance,advance,mode:paymentState.mode,bankId:paymentState.mode==='Bank'?paymentState.bankId:'',issuedBy:db.settings.issuedBy};
 db.receipts.push(receipt);closeMonths(s,y,paymentState.selectedMonths);s.dues=balance;s.advance=num(s.advance)+advance;saveDB();showReceiptById(receipt.id,true);toast('Payment saved.');renderFeePayment();
}
function openReceiptEdit(id){
 const r=receiptById(id);if(!r||!isAccountant())return;
 openModal('EDIT RECEIPT',`Edit ${r.receiptNo}`,`<form id="receiptEditForm" class="form-grid"><div><label>Receipt No.</label><input value="${esc(r.receiptNo)}" readonly></div><div><label>Nepali Date</label><input name="date" value="${esc(r.date)}"></div><div><label>Payment Mode</label><select name="mode" id="editReceiptMode"><option ${r.mode==='Cash'?'selected':''}>Cash</option><option ${r.mode==='Bank'?'selected':''}>Bank</option></select></div><div id="editReceiptBankWrap" class="${r.mode==='Bank'?'':'hidden'}"><label>Bank Account</label><select name="bankId">${bankOptions(r.bankId||'')}</select></div><div><label>Discount Amount</label><input name="discount" type="number" min="0" step="1" value="${num(r.discount)}"></div><div><label>Received Amount</label><input name="paid" type="number" min="0" step="1" value="${num(r.paid)}"></div><div class="full"><label>Student</label><input value="${esc(r.studentName)} - ${esc(r.className)}" readonly></div><div class="full form-actions"><button type="button" class="btn" onclick="showReceiptById('${r.id}')">Back</button><button class="btn primary">Save Changes</button></div></form>`);
 const f=$('#receiptEditForm');$('#editReceiptMode').onchange=e=>$('#editReceiptBankWrap').classList.toggle('hidden',e.target.value!=='Bank');
 f.onsubmit=e=>{e.preventDefault();const fd=new FormData(f);if(!npDateValid(fd.get('date')))return toast('Enter Nepali date as YYYY-MM-DD.');if(fd.get('mode')==='Bank'&&!fd.get('bankId'))return toast('Select a bank.');r.date=fd.get('date');r.mode=fd.get('mode');r.bankId=r.mode==='Bank'?fd.get('bankId'):'';r.discount=num(fd.get('discount'));r.paid=num(fd.get('paid'));const s=studentById(r.studentId);if(s)recalculateStudentState(s,r.year);saveDB();closeModal();showReceiptById(id);toast('Receipt updated.');};
}

/* ---------- Quick Receipt + Expenses with bank account ---------- */
function renderQuickReceipt(){
 if(!isAccountant())return unauthorized();
 $('#content').innerHTML=`<div class="two-col"><div class="section premium-section"><div class="section-title"><div><h3>New Quick Receipt</h3><p>Rent, extra income and other non-student school income.</p></div><div class="next-number"><small>Next Receipt</small><b>${esc(nextQuickReceiptNo(false))}</b></div></div><form id="quickForm" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(workingDate())}" required></div><div><label>Payment Mode</label><select name="mode" id="quickMode"><option>Cash</option><option>Bank</option></select></div><div id="quickBankWrap" class="full hidden"><label>Bank Account</label><select name="bankId">${bankOptions()}</select></div><div class="full"><label>Income Topic / Title</label><input name="title" placeholder="Rent Income / Extra Income / Other Income" required></div><div><label>Amount</label><input name="amount" type="number" min="0" step="1" required></div><div><label>Received From (optional)</label><input name="receivedFrom"></div><div class="full"><label>Remarks</label><textarea name="remarks"></textarea></div><div class="full form-actions"><button class="btn primary big">Save & Print Quick Receipt</button></div></form></div><div class="section premium-section"><div class="section-title"><div><h3>Quick Receipt Register</h3><p>All miscellaneous income remains searchable and exportable.</p></div><button class="btn green" id="quickExport">Export Excel</button></div><div id="quickList"></div></div></div>`;
 $('#quickMode').onchange=e=>$('#quickBankWrap').classList.toggle('hidden',e.target.value!=='Bank');$('#quickForm').onsubmit=saveQuickReceipt;$('#quickExport').onclick=exportQuickReceipts;drawQuickList();
}
function saveQuickReceipt(e){e.preventDefault();const fd=new FormData(e.target),date=fd.get('date'),mode=fd.get('mode');if(!npDateValid(date))return toast('Enter Nepali date as YYYY-MM-DD.');if(mode==='Bank'&&!fd.get('bankId'))return toast('Select the bank account.');const q={id:uid('qrcp'),receiptNo:nextQuickReceiptNo(true),date,year:yearOfDate(date),mode,bankId:mode==='Bank'?fd.get('bankId'):'',title:fd.get('title'),amount:num(fd.get('amount')),receivedFrom:fd.get('receivedFrom'),remarks:fd.get('remarks'),issuedBy:db.settings.issuedBy};db.quickReceipts.push(q);saveDB();showQuickReceipt(q.id,true);renderQuickReceipt();toast('Quick Receipt saved.');}
function drawQuickList(){const arr=[...db.quickReceipts].sort((a,b)=>b.date.localeCompare(a.date));$('#quickList').innerHTML=arr.length?`<div class="table-wrap compact"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Title</th><th>Mode</th><th>Bank</th><th class="amount">Amount</th><th>Action</th></tr></thead><tbody>${arr.map(q=>`<tr><td>${q.date}</td><td>${esc(q.receiptNo)}</td><td>${esc(q.title)}</td><td>${q.mode}</td><td>${q.mode==='Bank'?esc(bankLabel(q.bankId)):''}</td><td class="amount">${money(q.amount)}</td><td><button class="btn small" onclick="showQuickReceipt('${q.id}')">View / Reprint</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No Quick Receipts yet.</div>`;}
function exportQuickReceipts(){exportXLS('Quick_Receipt_Register.xls',['Nepali Date','Receipt No','Title','Received From','Mode','Bank','Amount','Remarks'],db.quickReceipts.map(q=>[q.date,q.receiptNo,q.title,q.receivedFrom,q.mode,q.mode==='Bank'?bankLabel(q.bankId):'',q.amount,q.remarks]),'Quick Receipt Register')}
function renderExpenses(){
 if(!isAccountant())return unauthorized();
 $('#content').innerHTML=`<div class="two-col"><div class="section premium-section"><div class="section-title"><div><h3>New Expense</h3><p>Choose Cash or a specific Bank account.</p></div><div class="next-number"><small>Next Voucher</small><b>${esc(nextExpenseNo(false))}</b></div></div><form id="expForm" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(workingDate())}" required></div><div><label>Mode</label><select name="mode" id="expMode"><option>Cash</option><option>Bank</option></select></div><div id="expBankWrap" class="full hidden"><label>Bank Account</label><select name="bankId">${bankOptions()}</select></div><div class="full"><label>Expense Head</label><input name="head" placeholder="Salary / Stationery / Maintenance / etc." required></div><div><label>Amount</label><input name="amount" type="number" min="0" step="1" required></div><div><label>Paid To</label><input name="paidTo"></div><div class="full"><label>Remarks</label><textarea name="remarks"></textarea></div><div class="full form-actions"><button class="btn primary">Save Expense</button></div></form></div><div class="section premium-section"><div class="section-title"><div><h3>Expense Register</h3></div><button class="btn green" id="expExport">Export Excel</button></div><div id="expHost"></div></div></div>`;
 $('#expMode').onchange=e=>$('#expBankWrap').classList.toggle('hidden',e.target.value!=='Bank');
 $('#expForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),date=fd.get('date'),mode=fd.get('mode');if(!npDateValid(date))return toast('Use Nepali date YYYY-MM-DD.');if(mode==='Bank'&&!fd.get('bankId'))return toast('Select the bank account used for this expense.');db.expenses.push({id:uid('exp'),voucherNo:nextExpenseNo(true),date,year:yearOfDate(date),head:fd.get('head'),amount:num(fd.get('amount')),mode,bankId:mode==='Bank'?fd.get('bankId'):'',paidTo:fd.get('paidTo'),remarks:fd.get('remarks')});saveDB();renderExpenses();toast('Expense saved.');};
 $('#expExport').onclick=()=>exportXLS('Expenses.xls',['Voucher No','Date','Head','Paid To','Mode','Bank','Amount','Remarks'],db.expenses.map(x=>[x.voucherNo,x.date,x.head,x.paidTo,x.mode,x.mode==='Bank'?bankLabel(x.bankId):'',x.amount,x.remarks]),'Expense Register');drawExpenses();
}
function drawExpenses(){const a=[...db.expenses].sort((a,b)=>b.date.localeCompare(a.date));$('#expHost').innerHTML=a.length?`<div class="table-wrap compact"><table><thead><tr><th>Voucher No.</th><th>Date</th><th>Head</th><th>Mode</th><th>Bank</th><th>Paid To</th><th class="amount">Amount</th></tr></thead><tbody>${a.map(x=>`<tr><td>${esc(x.voucherNo||'')}</td><td>${x.date}</td><td>${esc(x.head)}</td><td>${x.mode}</td><td>${x.mode==='Bank'?esc(bankLabel(x.bankId)):''}</td><td>${esc(x.paidTo||'')}</td><td class="amount">${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No expenses yet.</div>`;}

/* ---------- Banking ---------- */
function openBankForm(id=''){
 if(!isAccountant())return;const b=bankById(id);
 openModal('BANK MASTER',b?'Edit Bank Account':'New Bank Account',`<form id="bankForm" class="form-grid"><div class="full"><label>Bank Name</label><input name="name" value="${esc(b?.name||'')}" required></div><div><label>Account Name (optional)</label><input name="accountName" value="${esc(b?.accountName||'')}"></div><div><label>Account No. (optional)</label><input name="accountNo" value="${esc(b?.accountNo||'')}"></div><div><label>Opening Balance</label><input name="openingBalance" type="number" step="1" value="${num(b?.openingBalance)}"></div><div><label>Status</label><select name="active"><option value="true">Active</option><option value="false">Inactive</option></select></div><div class="full form-actions"><button type="button" class="btn" onclick="closeModal()">Close</button><button class="btn primary">Save Bank</button></div></form>`);
 const f=$('#bankForm');f.elements.active.value=String(b?.active!==false);f.onsubmit=e=>{e.preventDefault();const fd=new FormData(f),o={name:fd.get('name'),accountName:fd.get('accountName'),accountNo:fd.get('accountNo'),openingBalance:num(fd.get('openingBalance')),active:fd.get('active')==='true'};b?Object.assign(b,o):db.banks.push({id:uid('bank'),...o});saveDB();closeModal();renderBanking();toast('Bank account saved.');};
}
function cashBalanceThrough(toDate='9999-99-99'){
 let bal=num(db.settings.cashOpeningBalance);
 db.receipts.filter(r=>r.date<=toDate&&r.mode==='Cash').forEach(r=>bal+=num(r.paid));
 db.quickReceipts.filter(q=>q.date<=toDate&&q.mode==='Cash').forEach(q=>bal+=num(q.amount));
 db.expenses.filter(e=>e.date<=toDate&&e.mode==='Cash').forEach(e=>bal-=num(e.amount));
 (db.bankTransactions||[]).filter(t=>t.date<=toDate).forEach(t=>{if(t.type==='cash_deposit')bal-=num(t.amount);if(t.type==='withdrawal')bal+=num(t.amount);});return bal;
}
function bankBalanceThrough(bankId,toDate='9999-99-99'){
 const b=bankById(bankId);let bal=num(b?.openingBalance);
 db.receipts.filter(r=>r.date<=toDate&&r.mode==='Bank'&&r.bankId===bankId).forEach(r=>bal+=num(r.paid));
 db.quickReceipts.filter(q=>q.date<=toDate&&q.mode==='Bank'&&q.bankId===bankId).forEach(q=>bal+=num(q.amount));
 db.expenses.filter(e=>e.date<=toDate&&e.mode==='Bank'&&e.bankId===bankId).forEach(e=>bal-=num(e.amount));
 (db.bankTransactions||[]).filter(t=>t.date<=toDate&&t.bankId===bankId).forEach(t=>{if(t.type==='cash_deposit')bal+=num(t.amount);if(t.type==='withdrawal')bal-=num(t.amount);});return bal;
}
function bankingRows(from='',to=''){
 const rows=[];const ok=d=>(!from||d>=from)&&(!to||d<=to);
 db.receipts.filter(r=>ok(r.date)&&r.mode==='Bank').forEach(r=>rows.push({date:r.date,type:'Direct Fee Receipt',ref:r.receiptNo,bankId:r.bankId,details:`${r.studentName} - ${r.className}`,inflow:r.paid,outflow:0,cashIn:0,cashOut:0}));
 db.quickReceipts.filter(q=>ok(q.date)&&q.mode==='Bank').forEach(q=>rows.push({date:q.date,type:'Direct Quick Receipt',ref:q.receiptNo,bankId:q.bankId,details:q.title,inflow:q.amount,outflow:0,cashIn:0,cashOut:0}));
 db.expenses.filter(e=>ok(e.date)&&e.mode==='Bank').forEach(e=>rows.push({date:e.date,type:'Bank Expense',ref:e.voucherNo||'',bankId:e.bankId,details:`${e.head}${e.paidTo?' - '+e.paidTo:''}`,inflow:0,outflow:e.amount,cashIn:0,cashOut:0}));
 (db.bankTransactions||[]).filter(t=>ok(t.date)).forEach(t=>rows.push({date:t.date,type:t.type==='cash_deposit'?'Cash → Bank Deposit':'Bank Withdrawal → Cash',ref:t.ref||'',bankId:t.bankId,details:[t.person,t.purpose,t.remarks].filter(Boolean).join(' · '),inflow:t.type==='cash_deposit'?t.amount:0,outflow:t.type==='withdrawal'?t.amount:0,cashIn:t.type==='withdrawal'?t.amount:0,cashOut:t.type==='cash_deposit'?t.amount:0}));
 return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
}
function saveBankTransaction(e){e.preventDefault();const fd=new FormData(e.target),date=fd.get('date'),type=fd.get('type'),bankId=fd.get('bankId'),amount=num(fd.get('amount'));if(!npDateValid(date))return toast('Use Nepali date YYYY-MM-DD.');if(!bankId)return toast('Select a bank.');if(amount<=0)return toast('Enter an amount.');if(type==='cash_deposit'&&amount>cashBalanceThrough(date))return toast('Deposit is higher than available cash balance.');if(type==='withdrawal'&&amount>bankBalanceThrough(bankId,date))return toast('Withdrawal is higher than available bank balance.');db.bankTransactions.push({id:uid('btx'),date,type,bankId,amount,person:fd.get('person'),purpose:fd.get('purpose'),remarks:fd.get('remarks')});saveDB();renderBanking();toast(type==='cash_deposit'?'Cash deposited to bank.':'Bank withdrawal saved.');}
function renderBanking(){
 if(!isAccountant()&&!hasPermission('banking'))return unauthorized();const readonly=!isAccountant(),today=workingDate();
 const balanceCards=`<div class="bank-balance-grid"><div class="bank-balance-card cash"><small>Cash Balance</small><strong>${money(cashBalanceThrough(today))}</strong></div>${(db.banks||[]).map(b=>`<div class="bank-balance-card"><small>${esc(b.name)}</small><strong>${money(bankBalanceThrough(b.id,today))}</strong><span>${esc(b.accountNo||'')}</span></div>`).join('')||'<div class="bank-balance-card"><small>Bank Accounts</small><strong>None</strong><span>Add a bank account to begin.</span></div>'}</div>`;
 $('#content').innerHTML=`${balanceCards}${readonly?'':`<div class="two-col"><div class="section premium-section"><div class="section-title"><div><h3>Bank Accounts</h3><p>Create and manage multiple school bank accounts.</p></div><button class="btn primary" id="addBankBtn">+ Bank Account</button></div><div id="bankList"></div></div><div class="section premium-section"><div class="section-title"><div><h3>New Banking Transaction</h3><p>Deposit daily cash to bank or withdraw bank money to cash.</p></div></div><form id="bankTxForm" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(today)}" required></div><div><label>Transaction</label><select name="type"><option value="cash_deposit">Cash → Bank Deposit</option><option value="withdrawal">Bank Withdrawal → Cash</option></select></div><div><label>Bank</label><select name="bankId">${bankOptions()}</select></div><div><label>Amount</label><input name="amount" type="number" min="0" step="1" required></div><div><label>Deposited / Withdrawn By</label><input name="person"></div><div><label>Purpose / Heading</label><input name="purpose" placeholder="Deposit / Office use / Salary / etc."></div><div class="full"><label>Remarks</label><textarea name="remarks"></textarea></div><div class="full form-actions"><button class="btn primary">Save Banking Transaction</button></div></form></div></div>`}<div class="section premium-section"><div class="section-title"><div><h3>Banking Report</h3></div><button class="btn green" id="bankExport">Export Excel</button></div><div class="toolbar"><div class="field"><label>From Nepali Date</label><input id="bankFrom" value="${esc(today)}"></div><div class="field"><label>To Nepali Date</label><input id="bankTo" value="${esc(today)}"></div><button class="btn cyan" id="bankSearch">Search</button></div><div id="bankReportHost" style="margin-top:14px"></div></div>`;
 if(!readonly){$('#addBankBtn').onclick=()=>openBankForm();$('#bankTxForm').onsubmit=saveBankTransaction;drawBankList();}$('#bankSearch').onclick=drawBankReport;$('#bankExport').onclick=exportBankReport;drawBankReport();
}
function drawBankList(){const h=$('#bankList');if(!h)return;h.innerHTML=db.banks.length?`<div class="table-wrap compact"><table><thead><tr><th>Bank</th><th>Account No.</th><th class="amount">Opening</th><th class="amount">Current</th><th>Status</th><th>Action</th></tr></thead><tbody>${db.banks.map(b=>`<tr><td><b>${esc(b.name)}</b><br><small>${esc(b.accountName||'')}</small></td><td>${esc(b.accountNo||'')}</td><td class="amount">${money(b.openingBalance)}</td><td class="amount">${money(bankBalanceThrough(b.id,workingDate()))}</td><td>${b.active!==false?'Active':'Inactive'}</td><td><button class="btn small" onclick="openBankForm('${b.id}')">Edit</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No bank accounts yet.</div>`;}
function drawBankReport(){
  const f=$('#bankFrom')?.value||'',t=$('#bankTo')?.value||'',rows=bankingRows(f,t),prev=addDaysToNpDate(f||workingDate(),-1);
  const cards=[
    `<div class="summary-box"><small>Opening Cash</small><strong>${money(cashBalanceThrough(prev))}</strong></div>`,
    `<div class="summary-box"><small>Cash at End</small><strong>${money(cashBalanceThrough(t||workingDate()))}</strong></div>`,
    ...db.banks.map(b=>`<div class="summary-box"><small>${esc(b.name)} Closing</small><strong>${money(bankBalanceThrough(b.id,t||workingDate()))}</strong></div>`)
  ].join('');
  const body=rows.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Bank</th><th>Details</th><th class="amount">Bank In</th><th class="amount">Bank Out</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.date}</td><td>${r.type}</td><td>${esc(r.ref||'')}</td><td>${esc(bankLabel(r.bankId))}</td><td>${esc(r.details||'')}</td><td class="amount stat-green">${r.inflow?money(r.inflow):'-'}</td><td class="amount stat-red">${r.outflow?money(r.outflow):'-'}</td></tr>`).join('')}<tr class="total-row"><td colspan="5"><b>TOTAL MOVEMENT</b></td><td class="amount"><b>${money(sum(rows,r=>r.inflow))}</b></td><td class="amount"><b>${money(sum(rows,r=>r.outflow))}</b></td></tr></tbody></table></div>`:`<div class="empty">No banking transactions in this date range.</div>`;
  $('#bankReportHost').innerHTML=`<div class="summary-strip flexible-summary">${cards}</div>${body}`;
}
function exportBankReport(){const f=$('#bankFrom')?.value||'',t=$('#bankTo')?.value||'',rows=bankingRows(f,t);exportXLS('Banking_Report.xls',['Date','Type','Reference','Bank','Details','Bank In','Bank Out'],rows.map(r=>[r.date,r.type,r.ref,bankLabel(r.bankId),r.details,r.inflow,r.outflow]),'Banking Report')}

/* ---------- Outstanding report: multi-class ---------- */
function renderOutstanding(){
 if(!isAccountant()&&!hasPermission('outstanding'))return unauthorized();
 $('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Outstanding / Reminder</h3><p>Use this screen both as a multi-class outstanding report and for QR reminder printing.</p></div><div class="toolbar"><button class="btn green" id="outExport">Export Excel</button>${isAccountant()?'<button class="btn primary" id="outPrint">Print Selected — 4 Slips / A4</button>':''}</div></div><div class="toolbar"><div class="field"><label>Academic Year</label><select id="outYear">${yearsOptions(getYear())}</select></div><div class="field"><label>From Month</label><select id="outFrom">${NP_MONTHS.map((m,i)=>`<option value="${i}">${m}</option>`).join('')}</select></div><div class="field"><label>Up To Month</label><select id="outTo">${NP_MONTHS.map((m,i)=>`<option value="${i}" ${i===2?'selected':''}>${m}</option>`).join('')}</select></div><button class="btn cyan" id="outPreview">Preview Report</button></div><div class="class-filter-panel"><div class="filter-head">Classes — select one or many</div>${checkGroup('outClassCheck',CLASSES,[])}</div><div id="outHost" style="margin-top:12px"></div></div>`;
 $('#outPreview').onclick=drawOutstanding;$('#outExport').onclick=exportOutstanding;if(isAccountant())$('#outPrint').onclick=printOutstanding;$$('input[name="outClassCheck"]').forEach(x=>x.onchange=drawOutstanding);drawOutstanding();
}
function outstandingRows(){const y=$('#outYear')?.value||getYear(),classes=selectedValuesByName('outClassCheck'),f=num($('#outFrom')?.value),t=num($('#outTo')?.value);if(!classes.length)return[];return db.students.filter(s=>s.year===y&&classes.includes(s.className)).map(s=>{const items=[];for(let i=f;i<=t;i++)if(!isMonthClosed(s,y,i))monthCharges(s,y,i).forEach(x=>items.push({...x,month:NP_MONTHS[i]}));const grouped=groupedOutstandingItems(items),open=sum(items,x=>x.amount),old=num(s.dues),total=open+old;return{s,items,grouped,old,open,total};}).filter(x=>x.total>=0)}
function drawOutstanding(){const rows=outstandingRows();if(!rows.length){$('#outHost').innerHTML='<div class="empty">Select one or more classes to view outstanding dues.</div>';return;}const byClass={};rows.forEach(x=>byClass[x.s.className]=(byClass[x.s.className]||0)+x.total);$('#outHost').innerHTML=`<div class="summary-strip flexible-summary">${Object.entries(byClass).map(([c,v])=>`<div class="summary-box"><small>${esc(c)} Due</small><strong class="stat-red">${money(v)}</strong></div>`).join('')}<div class="summary-box"><small>Overall Due</small><strong class="stat-red">${money(sum(rows,x=>x.total))}</strong></div></div><div class="table-wrap"><table><thead><tr>${isAccountant()?'<th>Select</th>':''}<th>Class</th><th>Student</th><th>Guardian</th><th>Up To</th><th>Heading-wise Due</th><th class="amount">Old Dues</th><th class="amount">Open Fees</th><th class="amount">Grand Total</th></tr></thead><tbody>${rows.map(x=>`<tr>${isAccountant()?`<td><input class="outSelect" name="outSelect" type="checkbox" value="${x.s.id}" ${x.total>0?'checked':''}></td>`:''}<td>${esc(x.s.className)}</td><td><b>${esc(x.s.name)}</b><br><small>${esc(x.s.registrationNo)}</small></td><td>${esc(x.s.guardian||x.s.fatherName||x.s.motherName||'')}</td><td>Up to ${NP_MONTHS[num($('#outTo').value)]}</td><td>${x.grouped.length?x.grouped.map(g=>`${esc(g.label)} · ${g.months.length} month(s) · ${money(g.perAmount)} × ${g.months.length} = <b>${money(g.total)}</b>`).join('<br>'):'<span class="muted">No open fee</span>'}</td><td class="amount">${money(x.old)}</td><td class="amount">${money(x.open)}</td><td class="amount ${x.total>0?'danger-text':'good-text'}">${money(x.total)}</td></tr>`).join('')}</tbody></table></div>`;}
function exportOutstanding(){const rows=outstandingRows();exportXLS('Outstanding_Reminder.xls',['Reg No','Student','Class','Guardian','Up To Month','Old Dues','Heading Details','Grand Total'],rows.map(x=>[x.s.registrationNo,x.s.name,x.s.className,x.s.guardian||x.s.fatherName||x.s.motherName,NP_MONTHS[num($('#outTo')?.value||0)],x.old,x.grouped.map(g=>`${g.label}; Months=${g.months.join(', ')}; Count=${g.months.length}; PerMonth=${g.perAmount}; Total=${g.total}`).join(' | '),x.total]),'Outstanding / Reminder')}

/* ---------- Fee Card Scholarship Matrix ---------- */
function scholarshipBaseAmount(s,y,mi,type,refId){if(type==='transport'){const r=routeById(s.routeId);return r?num(r.amount):0;}const h=feeHeadById(refId);if(!h||(h.months||[]).indexOf(mi)<0)return null;const p=applicablePlan(s,refId,y);return p?num(p.amount):null;}
function scholarshipRows(s,y){const rows=[];db.feeHeads.forEach(h=>{const p=applicablePlan(s,h.id,y);if(p)rows.push({type:'fee',refId:h.id,label:h.name});});if(s.routeId&&routeById(s.routeId))rows.push({type:'transport',refId:s.routeId,label:'Transportation Fee'});return rows;}
function openScholarshipMatrix(studentId,year){
 const s=studentById(studentId);if(!s||!isAccountant())return;const rows=scholarshipRows(s,year);
 openModal('FEE CARD',`Scholarship — ${s.name}`,`<div class="info"><b>Scholarship rule:</b> Unpaid/future amounts can be changed. Paid fee items are locked. A newly-added unpaid fee in an earlier month remains editable.</div><div class="scholarship-wrap"><table class="scholarship-table"><thead><tr><th>Fee Head</th>${NP_MONTHS.map(m=>`<th>${m}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><th>${esc(row.label)}</th>${NP_MONTHS.map((m,mi)=>{const base=scholarshipBaseAmount(s,year,mi,row.type,row.refId),ov=overrideFor(s.id,year,mi,row.type,row.refId),effective=ov?num(ov.amount):base,closed=isMonthClosed(s,year,mi);if(base===null)return '<td class="na-cell">0</td>';return `<td class="${closed?'locked-cell':''}"><input class="schCell" data-type="${row.type}" data-ref="${row.refId}" data-month="${mi}" data-base="${base}" type="number" min="0" step="1" value="${num(effective)}" ${closed?'disabled title="Paid / processed — locked"':''}>${closed?'<span class="mini-lock">LOCK</span>':''}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div><div class="form-actions scholarship-actions"><button class="btn red" id="removeScholarship">Remove Unpaid Scholarship Changes</button><button class="btn" onclick="closeModal()">Close</button><button class="btn primary" id="saveScholarship">Save & Apply Scholarship</button></div>`);
 $('#saveScholarship').onclick=()=>{const cells=$$('.schCell:not(:disabled)');cells.forEach(inp=>{const type=inp.dataset.type,refId=inp.dataset.ref,mi=num(inp.dataset.month),base=num(inp.dataset.base),val=Math.max(0,num(inp.value)),existing=overrideFor(s.id,year,mi,type,refId);if(Math.abs(val-base)<.0001){if(existing)db.overrides=db.overrides.filter(o=>o.id!==existing.id);}else if(existing){existing.amount=val;existing.reason='Scholarship';}else db.overrides.push({id:uid('ov'),studentId:s.id,year,monthIndex:mi,type,refId,amount:val,reason:'Scholarship'});});saveDB();closeModal();drawStudentReport();toast('Scholarship applied.');};
 $('#removeScholarship').onclick=()=>{if(!confirm('Remove scholarship changes from all unpaid months?'))return;db.overrides=db.overrides.filter(o=>!(o.studentId===s.id&&o.year===year&&!isMonthClosed(s,year,o.monthIndex)));saveDB();closeModal();drawStudentReport();toast('Unpaid scholarship changes removed.');};
}
function drawStudentReport(){
 const s=studentById($('#searchStudent').value),y=$('#searchYear').value;if(!s){$('#studentReportHost').innerHTML='';return;}const ids=linkedStudentIds(s);const receipts=db.receipts.filter(r=>ids.includes(r.studentId)&&r.year===y).sort((a,b)=>a.date.localeCompare(b.date)||a.receiptNo.localeCompare(b.receiptNo));const rows=receipts.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.receiptNo)}</td><td>${esc((r.months||[]).map(i=>NP_MONTHS[i]).join(', '))}</td><td>${(r.items||[]).map(i=>`${esc(i.label)}: ${money(i.amount)}`).join('<br>')}</td><td class="amount">${money(r.grandTotal)}</td><td class="amount">${money(r.discount)}</td><td class="amount">${money(r.paid)}</td><td class="amount">${money(r.balance)}</td><td>${isAccountant()?`<button class="btn small" onclick="showReceiptById('${r.id}')">View</button> <button class="btn small" onclick="printReceipt('${r.id}')">Print</button> <button class="btn small" onclick="openReceiptEdit('${r.id}')">Edit</button> <button class="btn small red" onclick="deleteReceipt('${r.id}')">Delete</button>`:'View only'}</td></tr>`).join('');
 $('#studentReportHost').innerHTML=`<div class="summary-strip"><div class="summary-box"><small>Registration</small><strong>${esc(s.registrationNo)}</strong></div><div class="summary-box"><small>Student</small><strong>${esc(s.name)}</strong></div><div class="summary-box"><small>Class</small><strong>${esc(s.className)}</strong></div><div class="summary-box"><small>Guardian</small><strong>${esc(s.guardian||s.fatherName||s.motherName||'-')}</strong></div><div class="summary-box"><small>Current Dues</small><strong class="stat-red">${money(s.dues)}</strong></div></div>${isAccountant()?`<div class="section premium-section"><div class="section-title"><div><h3>Scholarship</h3><p>Month-wise student-specific fee adjustment. Paid fee items stay locked; newly-added unpaid fee items remain editable.</p></div><button class="btn primary" onclick="openScholarshipMatrix('${s.id}','${y}')">Open Scholarship Matrix</button></div><div class="card-note">Changes here affect only ${esc(s.name)}. Master Fee Structure and other students remain unchanged.</div></div>`:''}<div class="section premium-section"><div class="section-title"><div><h3>Transaction History</h3></div></div>${receipts.length?`<div class="table-wrap"><table><thead><tr><th>Nepali Date</th><th>Receipt No.</th><th>Fee Months</th><th>Fee Details</th><th class="amount">Grand Total</th><th class="amount">Discount</th><th class="amount">Received</th><th class="amount">Dues After</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="empty">No transactions for this student.</div>`}</div><div class="section premium-section"><div class="section-title"><div><h3>Month-wise Ledger</h3></div></div>${ledgerTable(s,y)}</div>`;
}

/* ---------- Student Update / Year-end Promotion ---------- */
function nextClassName(c){const i=CLASSES.indexOf(c);return i>=0&&i<CLASSES.length-1?CLASSES[i+1]:c;}
function renderStudentUpdate(){
 if(!isAccountant())return unauthorized();
 $('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Student Update / Year-End Promotion</h3></div></div><div class="toolbar"><div class="field"><label>Current Academic Year</label><select id="updYear">${yearsOptions(getYear())}</select></div><div class="field"><label>Class</label><select id="updClass">${classesOptions()}</select></div><button class="btn cyan" id="updLoad">Load Students</button></div><div id="studentUpdateHost"></div></div>`;$('#updLoad').onclick=drawStudentUpdate;$('#updClass').onchange=drawStudentUpdate;drawStudentUpdate();
}
function drawStudentUpdate(){const y=$('#updYear')?.value||getYear(),c=$('#updClass')?.value||'',ny=String(num(y)+1),rows=c?db.students.filter(s=>s.year===y&&s.className===c):[];$('#studentUpdateHost').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Reg. No.</th><th>Student</th><th class="amount">Dues</th><th>Status for ${ny}</th><th>Destination Class</th><th>Existing Status</th></tr></thead><tbody>${rows.map(s=>`<tr><td>${esc(s.registrationNo)}</td><td><b>${esc(s.name)}</b></td><td class="amount ${num(s.dues)>0?'danger-text':''}">${money(s.dues)}</td><td><select class="updAction" data-id="${s.id}"><option value="">No Change</option><option value="Promote">Promote</option><option value="Repeat">Repeat Same Class</option><option value="Transfer">Transfer / Left School</option><option value="Dropout">Dropout</option></select></td><td><select class="updTarget" data-id="${s.id}">${CLASSES.map(k=>`<option ${k===nextClassName(s.className)?'selected':''}>${k}</option>`).join('')}</select></td><td>${esc(s.yearEndStatus||'-')}</td></tr>`).join('')}</tbody></table></div><div class="form-actions" style="margin-top:14px"><button class="btn primary big" id="applyStudentUpdate">Review & Apply ${esc(y)} → ${esc(ny)}</button></div>`:`<div class="empty">Select a class to load students.</div>`;if($('#applyStudentUpdate'))$('#applyStudentUpdate').onclick=applyStudentUpdate;}
function applyStudentUpdate(){const y=$('#updYear').value,ny=String(num(y)+1),selected=[];$$('.updAction').forEach(a=>{if(a.value)selected.push({s:studentById(a.dataset.id),action:a.value,target:$(`.updTarget[data-id="${a.dataset.id}"]`)?.value});});if(!selected.length)return toast('Choose at least one student action.');const blocked=selected.filter(x=>(x.action==='Transfer'||x.action==='Dropout')&&num(x.s.dues)>0);if(blocked.length)return alert('Clear dues before Transfer/Dropout:\n'+blocked.map(x=>`${x.s.name}: ${money(x.s.dues)}`).join('\n'));const summary=selected.map(x=>`${x.s.name}: ${x.action}${x.action==='Promote'||x.action==='Repeat'?' → '+(x.action==='Repeat'?x.s.className:x.target):''}`).join('\n');if(!confirm(`Apply these updates for ${ny}?\n\n${summary}`))return;selected.forEach(({s,action,target})=>{s.yearEndStatus=action;s.yearEndUpdatedTo=ny;if(action==='Promote'||action==='Repeat'){const dest=action==='Repeat'?s.className:target;if(!db.students.some(x=>x.year===ny&&studentMasterId(x)===studentMasterId(s))){const clone={...s,id:uid('stu'),masterId:studentMasterId(s),year:ny,className:dest,category:'Old',dues:num(s.dues),openingDues:num(s.dues),advance:num(s.advance),closedMonths:{},createdDate:workingDate(),yearEndStatus:'',yearEndUpdatedTo:'',previousRecordId:s.id};db.students.push(clone);s.nextYearRecordId=clone.id;}}});saveDB();drawStudentUpdate();toast(`Student update applied for ${ny}.`);}

/* ---------- Admit Card polish + hall number + PNG signatures ---------- */
function renderAdmitCard(){if(!isAccountant())return unauthorized();$('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Admit Card</h3><p>Select students, enter Hall No. if needed, and print 6 colorful cards on one A4 page.</p></div><button class="btn primary big" id="admitPrintBtn">Print Admit Cards</button></div><div class="toolbar"><div class="field"><label>Academic Year</label><select id="admYear">${yearsOptions(getYear())}</select></div><div class="field"><label>Class</label><select id="admClass">${classesOptions()}</select></div><button class="btn cyan" id="admView">View Students</button></div><div id="admitHost" style="margin-top:12px"></div></div>`;$('#admView').onclick=drawAdmitList;$('#admClass').onchange=drawAdmitList;$('#admitPrintBtn').onclick=printAdmitCards;drawAdmitList();}
function drawAdmitList(){const y=$('#admYear')?.value||getYear(),c=$('#admClass')?.value||'',rows=c?db.students.filter(s=>s.year===y&&s.className===c):[];$('#admitHost').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="admitAll" checked></th><th>Reg. No.</th><th>Student</th><th>Guardian</th><th>Hall No.</th><th class="amount">Current Due</th></tr></thead><tbody>${rows.map(s=>`<tr><td><input class="admitSel" name="admitSel" type="checkbox" value="${s.id}" checked></td><td>${esc(s.registrationNo)}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.guardian||s.fatherName||s.motherName||'')}</td><td><input class="hallInput table-input" data-id="${s.id}" value="${esc(s.admitHallNo||'')}" placeholder="Hall No."></td><td class="amount">${money(s.dues)}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">Select Academic Year and Class to view students.</div>`;const all=$('#admitAll');if(all)all.onchange=()=>$$('.admitSel').forEach(c=>c.checked=all.checked);$$('.hallInput').forEach(inp=>inp.onchange=()=>{const s=studentById(inp.dataset.id);if(s){s.admitHallNo=inp.value;saveDB();}});}
function admitSignature(data,name,post){return `<div class="admit-sign-cell">${data?`<img src="${data}" class="signature-img">`:'<div class="signature-dots">....................</div>'}<small class="sign-name">${esc(name)}</small><small>${esc(post)}</small></div>`;}
function printAdmitCards(){const students=selectedAdmitStudents();if(!students.length)return toast('Select at least one student.');const logo=db.settings.logoData?`<img src="${db.settings.logoData}" class="admit-logo">`:'';const cards=students.map(s=>`<div class="admit-card"><div class="admit-top">${logo}<div class="admit-school"><div class="admit-school-name">${esc(db.settings.schoolName)}</div><div class="admit-school-sub">${esc(db.settings.address)}</div><div class="admit-term">${esc(db.settings.admitCardTerm||'First Term')}</div><div class="admit-title">${esc(db.settings.admitCardTitle||'ADMIT CARD')}</div></div></div><div class="admit-body v6-admit-body"><div class="admit-line"><span>Student Name:</span><b>${esc(s.name)}</b></div><div class="admit-line"><span>Class:</span><b>${esc(s.className)}</b></div><div class="admit-line"><span>Guardian Name:</span><b>${esc(s.guardian||s.fatherName||s.motherName||'')}</b></div><div class="admit-line"><span>Registration No.:</span><b>${esc(s.registrationNo)}</b></div><div class="admit-line"><span>Hall No.:</span><b>${esc(s.admitHallNo||'........................')}</b></div></div><div class="admit-signs">${admitSignature(db.settings.examCoordinatorSignatureData,db.settings.examCoordinatorName||'Exam Coordinator',db.settings.examCoordinatorPost||'Exam Coordinator')}${admitSignature(db.settings.principalSignatureData,db.settings.principalName||'Principal',db.settings.principalPost||'Principal')}${admitSignature(db.settings.accountantSignatureData,db.settings.accountantSignName||'Accountant',db.settings.accountantSignPost||'Accountant')}</div></div>`).join('');const w=window.open('','_blank','width=1000,height=900');w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:7mm}*{box-sizing:border-box}body{font-family:Arial;margin:0;background:#fff}.admit-grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.admit-card{break-inside:avoid;border:2px solid #2d7fbd;border-radius:12px;padding:4mm;background:linear-gradient(145deg,#f3fbff,#fff 58%,#f8fbff);height:88mm;position:relative;box-shadow:inset 0 0 0 3px #d9eefc}.admit-top{display:flex;gap:8px;align-items:center;border-bottom:1px solid #b8ddf6;padding-bottom:5px}.admit-logo{width:48px;height:48px;object-fit:contain}.admit-school{text-align:center;flex:1}.admit-school-name{font-size:15px;font-weight:900;color:#155b92;line-height:1.15}.admit-school-sub{font-size:9px}.admit-term{display:inline-block;margin-top:3px;padding:2px 8px;background:#0ea5e9;color:#fff;border-radius:999px;font-size:9px;font-weight:700}.admit-title{margin-top:4px;font-size:14px;font-weight:900;color:#b51d1d;letter-spacing:.08em}.v6-admit-body{font-size:11px;padding-top:10px;display:grid;gap:6px}.admit-line{display:grid;grid-template-columns:92px 1fr;align-items:end}.admit-line span{font-weight:700}.admit-line b{font-weight:900;border-bottom:1px dotted #111;min-height:17px;padding:0 4px 2px}.admit-signs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;position:absolute;left:4mm;right:4mm;bottom:3mm;text-align:center}.signature-img{display:block;margin:0 auto 1px;width:58px;height:25px;object-fit:contain}.signature-dots{height:25px;display:flex;align-items:end;justify-content:center;font-size:11px}.admit-sign-cell small{display:block;font-size:8px;line-height:1.15}.sign-name{font-weight:700}</style></head><body><div class="admit-grid">${cards}</div><script>setTimeout(()=>window.print(),300)<\/script></body></html>`);w.document.close();}
function handleSignatureUpload(e,key){const f=e.target.files?.[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas'),maxW=500,maxH=180,scale=Math.min(1,maxW/img.width,maxH/img.height);c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);db.settings[key]=c.toDataURL('image/png');saveDB();renderSettings();toast('Signature uploaded.');};img.src=rd.result;};rd.readAsDataURL(f);}

/* ---------- Settings: clear control center ---------- */
function settingImagePreview(data,label){return `<div class="signature-preview">${data?`<img src="${data}" alt="${esc(label)}">`:`<span>${esc(label)}<br>Not uploaded</span>`}</div>`;}
function renderSettings(){
 if(!isAccountant())return unauthorized();
 $('#content').innerHTML=`<div class="settings-hero"><div><h3>Settings Control Center</h3><p>School, receipt, reminder, admit card, numbering, banking and security settings are grouped clearly in one place.</p></div></div><div class="settings-grid"><div><div class="section premium-section"><div class="section-title"><div><h3>School & Receipt Settings</h3></div></div><form id="setForm" class="form-grid"><div class="full"><label>School Name</label><input name="schoolName" value="${esc(db.settings.schoolName)}"></div><div class="full"><label>Address</label><input name="address" value="${esc(db.settings.address)}"></div><div><label>ESTD</label><input name="estd" value="${esc(db.settings.estd)}"></div><div><label>Telephone</label><input name="phone" value="${esc(db.settings.phone)}"></div><div><label>PAN No.</label><input name="pan" value="${esc(db.settings.pan)}"></div><div><label>Issued By</label><input name="issuedBy" value="${esc(db.settings.issuedBy)}"></div><div><label>Working Nepali Date</label><input name="workingDate" value="${esc(db.settings.workingDate)}"></div><div><label>Opening Cash Balance</label><input name="cashOpeningBalance" type="number" step="1" value="${num(db.settings.cashOpeningBalance)}"></div><div class="full"><label>School Logo</label><div class="upload-panel"><div class="logo-preview">${db.settings.logoData?`<img src="${db.settings.logoData}">`:'No Logo'}</div><div><input id="logoUpload" type="file" accept="image/*"><button type="button" class="btn" id="removeLogo">Remove Logo</button></div></div></div><div class="full form-actions"><button class="btn primary">Save General Settings</button></div></form></div><div class="section premium-section"><div class="section-title"><div><h3>Numbering Settings</h3></div></div><form id="numberForm" class="form-grid"><div><label>Fee Receipt Prefix</label><input name="receiptPrefix" value="${esc(db.settings.receiptPrefix||'R-')}"></div><div><label>Next Fee Receipt No.</label><input name="nextReceiptNumber" type="number" min="1" value="${num(db.settings.nextReceiptNumber)}"></div><div><label>Quick Receipt Prefix</label><input name="quickReceiptPrefix" value="${esc(db.settings.quickReceiptPrefix||'QR-')}"></div><div><label>Next Quick Receipt No.</label><input name="nextQuickReceiptNumber" type="number" min="1" value="${num(db.settings.nextQuickReceiptNumber)}"></div><div><label>Payment / Voucher Prefix</label><input name="expensePrefix" value="${esc(db.settings.expensePrefix||'PV-')}"></div><div><label>Next Voucher No.</label><input name="nextExpenseNumber" type="number" min="1" value="${num(db.settings.nextExpenseNumber)}"></div><div><label>Admission Prefix</label><input name="registrationPrefix" value="${esc(db.settings.registrationPrefix)}" placeholder="83-"></div><div><label>Next Registration No.</label><input name="nextRegistrationNumber" type="number" min="1" value="${num(db.settings.nextRegistrationNumber)}"></div><div class="full form-actions"><button class="btn primary">Save Numbering</button></div></form></div><div class="section premium-section"><div class="section-title"><div><h3>Reminder Letter Settings</h3></div></div><form id="remindForm" class="form-grid"><div class="full"><label>Reminder Header</label><input name="remindHeader" value="${esc(db.settings.remindHeader||'Fee Reminder')}"></div><div class="full"><label>WhatsApp / Contact Number</label><input name="reminderWhatsApp" value="${esc(db.settings.reminderWhatsApp||'')}"></div><div class="full"><label>Reminder Message Template</label><textarea name="reminderTemplate">${esc(db.settings.reminderTemplate||'')}</textarea></div><div class="full"><label>Online Payment / QR Note</label><textarea name="reminderOnlineNote">${esc(db.settings.reminderOnlineNote||'')}</textarea></div><div class="full"><label>Reminder QR</label><div class="upload-panel"><div class="logo-preview">${db.settings.reminderQRData?`<img src="${db.settings.reminderQRData}">`:'No QR'}</div><div><input id="qrUpload" type="file" accept="image/*"><button type="button" class="btn" id="removeQR">Remove QR</button><p class="card-note">Use {{student}}, {{guardian}}, {{class}}, {{toMonth}}, {{total}}, {{whatsapp}}</p></div></div></div><div class="full form-actions"><button class="btn primary">Save Reminder Settings</button></div></form></div></div><div><div class="section premium-section"><div class="section-title"><div><h3>Admit Card Settings</h3><p>Names, posts and PNG signatures.</p></div></div><form id="admitSetForm" class="form-grid"><div><label>Term / Exam Name</label><input name="admitCardTerm" value="${esc(db.settings.admitCardTerm||'First Term')}"></div><div><label>Card Title</label><input name="admitCardTitle" value="${esc(db.settings.admitCardTitle||'ADMIT CARD')}"></div><div><label>Exam Coordinator Name</label><input name="examCoordinatorName" value="${esc(db.settings.examCoordinatorName||'Exam Coordinator')}"></div><div><label>Post</label><input name="examCoordinatorPost" value="${esc(db.settings.examCoordinatorPost||'Exam Coordinator')}"></div><div><label>Principal Name</label><input name="principalName" value="${esc(db.settings.principalName||'Principal')}"></div><div><label>Post</label><input name="principalPost" value="${esc(db.settings.principalPost||'Principal')}"></div><div><label>Accountant Name</label><input name="accountantSignName" value="${esc(db.settings.accountantSignName||'Accountant')}"></div><div><label>Post</label><input name="accountantSignPost" value="${esc(db.settings.accountantSignPost||'Accountant')}"></div><div class="full signature-upload-grid"><div>${settingImagePreview(db.settings.examCoordinatorSignatureData,'Exam Coordinator Signature')}<input id="sigExamUpload" type="file" accept="image/png"><button type="button" class="btn small" data-remove-sig="examCoordinatorSignatureData">Remove</button></div><div>${settingImagePreview(db.settings.principalSignatureData,'Principal Signature')}<input id="sigPrincipalUpload" type="file" accept="image/png"><button type="button" class="btn small" data-remove-sig="principalSignatureData">Remove</button></div><div>${settingImagePreview(db.settings.accountantSignatureData,'Accountant Signature')}<input id="sigAccountantUpload" type="file" accept="image/png"><button type="button" class="btn small" data-remove-sig="accountantSignatureData">Remove</button></div></div><div class="full form-actions"><button class="btn primary">Save Admit Card Settings</button></div></form></div><div class="section premium-section"><div class="section-title"><div><h3>Banking Setup</h3><p>Bank accounts and bank transactions are managed from one dedicated screen.</p></div><button class="btn primary" id="openBankingSettings">Open Banking Transactions</button></div><p class="card-note">Current bank accounts: <b>${db.banks.length}</b>. Fee/Quick Receipt can select a specific bank when payment mode is Bank.</p></div><div class="section premium-section"><div class="section-title"><div><h3>MD / CEO Access Control</h3><p>Choose exactly which read-only reports MD and CEO can view.</p></div><button class="btn primary" id="openAccessSettings">Open Access Control</button></div></div><div class="section premium-section"><div class="section-title"><div><h3>Login & Security</h3><p>Passwords are never displayed in plain text.</p></div></div><div class="security-panel"><h4>Change Accountant Password</h4><form id="changeOwn" class="form-grid"><div><label>Current Password</label><input name="current" type="password" required></div><div><label>New Password</label><input name="next" type="password" minlength="6" required></div><div><label>Confirm</label><input name="confirm" type="password" minlength="6" required></div><div class="form-actions"><button class="btn primary">Change & Logout</button></div></form></div><div class="security-panel" style="margin-top:12px"><h4>Reset CEO Password</h4><form id="resetCEO" class="form-grid"><div><label>New Password</label><input name="next" type="password" minlength="6" required></div><div><label>Confirm</label><input name="confirm" type="password" minlength="6" required></div><div class="full form-actions"><button class="btn">Reset CEO Password</button></div></form></div><div class="security-panel" style="margin-top:12px"><h4>Reset MD Password</h4><form id="resetMD" class="form-grid"><div><label>New Password</label><input name="next" type="password" minlength="6" required></div><div><label>Confirm</label><input name="confirm" type="password" minlength="6" required></div><div class="full form-actions"><button class="btn">Reset MD Password</button></div></form></div></div><div class="section premium-section"><div class="section-title"><div><h3>Local Data</h3></div></div><button class="btn green" id="backupBtn">Download JSON Backup</button> <button class="btn red" id="resetAllBtn">Reset Everything to Zero</button></div></div></div>`;
 $('#setForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);['schoolName','address','estd','phone','pan','issuedBy','workingDate'].forEach(k=>db.settings[k]=fd.get(k));db.settings.cashOpeningBalance=num(fd.get('cashOpeningBalance'));saveDB();$('#workingDate').value=db.settings.workingDate;updateSideLogo();toast('General settings saved.');};
 $('#numberForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);['receiptPrefix','quickReceiptPrefix','expensePrefix','registrationPrefix'].forEach(k=>db.settings[k]=fd.get(k));['nextReceiptNumber','nextQuickReceiptNumber','nextExpenseNumber','nextRegistrationNumber'].forEach(k=>db.settings[k]=Math.max(1,num(fd.get(k))));saveDB();toast('Numbering saved.');};
 $('#remindForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);['remindHeader','reminderWhatsApp','reminderTemplate','reminderOnlineNote'].forEach(k=>db.settings[k]=fd.get(k));saveDB();toast('Reminder settings saved.');};
 $('#admitSetForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);['admitCardTerm','admitCardTitle','examCoordinatorName','examCoordinatorPost','principalName','principalPost','accountantSignName','accountantSignPost'].forEach(k=>db.settings[k]=fd.get(k));saveDB();toast('Admit card settings saved.');};
 $('#logoUpload').onchange=handleLogoUpload;$('#removeLogo').onclick=()=>{db.settings.logoData='';saveDB();renderSettings();updateSideLogo();};$('#qrUpload').onchange=handleQRUpload;$('#removeQR').onclick=()=>{db.settings.reminderQRData='';saveDB();renderSettings();};
 $('#sigExamUpload').onchange=e=>handleSignatureUpload(e,'examCoordinatorSignatureData');$('#sigPrincipalUpload').onchange=e=>handleSignatureUpload(e,'principalSignatureData');$('#sigAccountantUpload').onchange=e=>handleSignatureUpload(e,'accountantSignatureData');$$('[data-remove-sig]').forEach(b=>b.onclick=()=>{db.settings[b.dataset.removeSig]='';saveDB();renderSettings();});
 $('#openBankingSettings').onclick=()=>navigate('banking');$('#openAccessSettings').onclick=()=>navigate('access');$('#changeOwn').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);if(!verifyPassword('accountant',fd.get('current')))return toast('Current password is incorrect.');if(fd.get('next')!==fd.get('confirm'))return toast('New passwords do not match.');setPassword('accountant',fd.get('next'));saveDB();logout('Accountant password changed. Please login again.');};$('#resetCEO').onsubmit=e=>resetRolePassword(e,'ceo');$('#resetMD').onsubmit=e=>resetRolePassword(e,'md');$('#backupBtn').onclick=backupJSON;$('#resetAllBtn').onclick=resetEverything;
}

/* ---------- Unified reports include bank detail ---------- */
function allTransactions(){const out=[];db.receipts.forEach(r=>out.push({date:r.date,type:'Fee Receipt',ref:r.receiptNo,details:`${r.studentName} - ${r.className}${r.mode==='Bank'?' · '+bankLabel(r.bankId):''}`,head:'Student Fees',mode:r.mode,income:r.paid,expense:0}));db.quickReceipts.forEach(q=>out.push({date:q.date,type:'Quick Receipt',ref:q.receiptNo,details:`${q.receivedFrom||q.title}${q.mode==='Bank'?' · '+bankLabel(q.bankId):''}`,head:q.title,mode:q.mode,income:q.amount,expense:0}));db.expenses.forEach(e=>out.push({date:e.date,type:'Expense',ref:e.voucherNo||'',details:`${e.paidTo||e.remarks||''}${e.mode==='Bank'?' · '+bankLabel(e.bankId):''}`,head:e.head,mode:e.mode,income:0,expense:e.amount}));(db.bankTransactions||[]).forEach(t=>out.push({date:t.date,type:t.type==='cash_deposit'?'Cash to Bank':'Bank Withdrawal',ref:'',details:`${bankLabel(t.bankId)} · ${t.person||''} · ${t.purpose||''}`,head:'Banking Transfer',mode:'Transfer',income:0,expense:0}));return out.sort((a,b)=>a.date.localeCompare(b.date));}

/* receipt print keeps border */
function printReceipt(id){const r=receiptById(id);if(!r)return;const w=window.open('','_blank','width=760,height=900');w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(r.receiptNo)}</title><link rel="stylesheet" href="style.css"><style>@media print{.a5-receipt.a5-bordered{border:1.4px solid #111!important}}</style></head><body>${receiptHTML(r)}<script>setTimeout(()=>window.print(),400)<\/script></body></html>`);w.document.close();}

upgradeV6Data();
syncAutoWorkingDateV6();
if($('#workingDate'))$('#workingDate').value=db.settings.workingDate;
window.openBankForm=openBankForm;window.openScholarshipMatrix=openScholarshipMatrix;window.renderBanking=renderBanking;window.renderStudentUpdate=renderStudentUpdate;
/* ==================== END V6 POLISHED LOCAL TEST OVERRIDES ==================== */

/* V6 user-facing wording: Scholarship instead of Override */
function ledgerTable(s,y){return `<div class="table-wrap"><table><thead><tr><th>Month</th><th>Status</th><th>Applicable Charges</th><th class="amount">Total</th></tr></thead><tbody>${NP_MONTHS.map((m,i)=>{const items=monthCharges(s,y,i),closed=isMonthClosed(s,y,i);return `<tr><td>${m}</td><td>${closed?'<span class="chip good">Processed / Locked</span>':'<span class="chip blue">Open</span>'}</td><td>${items.map(x=>`${esc(x.label)} ${x.overridden?'<span class="chip">Scholarship</span>':''}: ${money(x.amount)}`).join('<br>')||'-'}</td><td class="amount">${money(sum(items,x=>x.amount))}</td></tr>`}).join('')}</tbody></table></div>`}

/* ==================== V7 LOCAL TEST FIXES ====================
   1) Banking: show transferred amount + remaining cash clearly.
   2) Student delete/archive while preserving receipt history.
   3) Fee Payment: strict student-id data binding, no stale ledger.
   4) Reminder: exactly 4 slips per A4 page.
   5) Reminder: print only explicitly selected students.
   6) Reminder + Admit Card: shared school logo and one-line school name.
================================================================ */

// ---------- V7 student delete ----------
function deleteStudentV7(id){
  if(!isAccountant()) return toast('Only Accountant can delete students.');
  const s=studentById(id); if(!s) return;
  const linkedReceipts=(db.receipts||[]).filter(r=>r.studentId===s.id || (r.masterId&&r.masterId===studentMasterId(s)));
  const message=linkedReceipts.length
    ? `${s.name} has ${linkedReceipts.length} saved receipt(s).\n\nThe student will be removed from active student lists, but saved financial receipts will be preserved for audit/history.\n\nContinue?`
    : `Delete ${s.name} (${s.registrationNo})?\n\nThis student has no saved fee receipts. This action cannot be undone.`;
  if(!confirm(message)) return;
  db.archivedStudents=db.archivedStudents||[];
  if(linkedReceipts.length){
    db.archivedStudents.push({...s,archivedAt:workingDate(),archivedReason:'Deleted by Accountant'});
  }
  db.students=(db.students||[]).filter(x=>x.id!==id);
  db.overrides=(db.overrides||[]).filter(o=>o.studentId!==id);
  saveDB();
  renderStudents();
  toast(linkedReceipts.length?'Student removed from active list; receipt history preserved.':'Student deleted.');
}
function drawStudentList(){
 const rows=filteredStudents();
 $('#studentHost').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Reg. No.</th><th>Student Name</th><th>Class</th><th>Guardian</th><th>Mobile</th><th>Phone</th><th>Nepali DOB</th><th>Route</th><th>Caste</th><th class="amount">Dues</th>${isAccountant()?'<th>Action</th>':''}</tr></thead><tbody>${rows.map(s=>`<tr><td>${esc(s.registrationNo)}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.className)}</td><td>${esc(s.guardian||s.fatherName||s.motherName||'')}</td><td>${esc(s.mobileNumber||'')}</td><td>${esc(s.phone||'')}</td><td>${esc(s.dobNp||'')}</td><td>${esc(routeById(s.routeId)?.name||'')}</td><td>${esc(s.caste||'')}</td><td class="amount ${num(s.dues)>0?'danger-text':''}">${money(s.dues)}</td>${isAccountant()?`<td class="nowrap"><button class="btn small" onclick="openStudentForm('${s.id}')">Edit</button> <button class="btn small" onclick="openLedgerDirect('${s.id}')">Fee Card</button> <button class="btn small red" onclick="deleteStudentV7('${s.id}')">Delete</button></td>`:''}</tr>`).join('')}</tbody></table></div>`:`<div class="empty">No students found.</div>`;
}

// ---------- V7 fee payment strict binding ----------
function renderFeePayment(){
 if(!isAccountant())return unauthorized();
 paymentState={year:getYear(),className:'',studentId:'',selectedMonths:[],date:workingDate(),mode:'Cash',bankId:'',discount:0,paid:0};
 $('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Fee Payment</h3><p>Year → Class → Student → Month(s). Student details always refresh from the selected Student ID.</p></div><div class="next-number"><small>Next Receipt</small><b>${esc(nextReceiptNo(false))}</b></div></div><div class="form-grid three"><div><label>Academic Year</label><select id="payYear">${yearsOptions(paymentState.year)}</select></div><div><label>Class</label><select id="payClass">${classesOptions()}</select></div><div><label>Student</label><select id="payStudent" disabled autocomplete="off"><option value="">Select Student</option></select></div><div><label>Nepali Date</label><input id="payDate" value="${esc(workingDate())}" placeholder="2083-05-26"></div><div><label>Payment Mode</label><select id="payMode"><option>Cash</option><option>Bank</option></select></div><div id="payBankWrap" class="hidden"><label>Bank Account</label><select id="payBank">${bankOptions()}</select></div><div><label>Registration No.</label><input id="payReg" readonly></div></div></div><div id="payHost"></div>`;
 $('#payClass').onchange=fillPayStudents;
 $('#payYear').onchange=fillPayStudents;
 $('#payStudent').onchange=()=>drawPayPanel();
 $('#payDate').oninput=e=>paymentState.date=e.target.value;
 $('#payMode').onchange=e=>{paymentState.mode=e.target.value;$('#payBankWrap').classList.toggle('hidden',e.target.value!=='Bank');if(e.target.value!=='Bank')paymentState.bankId='';};
 $('#payBank').onchange=e=>paymentState.bankId=e.target.value;
}
function fillPayStudents(){
 const y=String($('#payYear')?.value||''),c=String($('#payClass')?.value||'');
 const arr=(db.students||[]).filter(s=>String(s.year)===y&&String(s.className)===c).sort((a,b)=>String(a.registrationNo||'').localeCompare(String(b.registrationNo||''),undefined,{numeric:true})||String(a.name||'').localeCompare(String(b.name||'')));
 paymentState.year=y;paymentState.className=c;paymentState.studentId='';paymentState.selectedMonths=[];paymentState.discount=0;paymentState.paid=0;
 const sel=$('#payStudent');sel.disabled=!c;sel.innerHTML='<option value="">Select Student</option>'+arr.map(s=>`<option value="${esc(s.id)}">${esc(s.registrationNo)} - ${esc(s.name)}</option>`).join('');sel.value='';
 if($('#payHost'))$('#payHost').innerHTML='';if($('#payReg'))$('#payReg').value='';
}
function drawPayPanel(){
 const y=String($('#payYear')?.value||''),c=String($('#payClass')?.value||''),selectedId=String($('#payStudent')?.value||'');
 const s=(db.students||[]).find(x=>String(x.id)===selectedId&&String(x.year)===y&&String(x.className)===c);
 paymentState.studentId='';paymentState.selectedMonths=[];paymentState.discount=0;paymentState.paid=0;
 if(!s){if($('#payHost'))$('#payHost').innerHTML='';if($('#payReg'))$('#payReg').value='';return;}
 paymentState.year=y;paymentState.className=c;paymentState.studentId=s.id;
 $('#payReg').value=s.registrationNo||'';
 const months=NP_MONTHS.map((m,i)=>`<label class="month-box ${isMonthClosed(s,y,i)?'processed':''}"><input class="payMonth" type="checkbox" value="${i}" ${isMonthClosed(s,y,i)?'disabled':''}>${m}${isMonthClosed(s,y,i)?' — Processed':''}</label>`).join('');
 $('#payHost').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>${esc(s.name)} — ${esc(s.className)}</h3><p><b>Registration:</b> ${esc(s.registrationNo||'')} &nbsp; · &nbsp; <b>Guardian:</b> ${esc(s.guardian||s.fatherName||s.motherName||'-')} &nbsp; · &nbsp; <b>Current Dues:</b> ${money(s.dues)}</p></div></div><div class="month-grid">${months}</div></div><div id="payCalc"></div>`;
 $$('.payMonth').forEach(box=>box.onchange=()=>{paymentState.selectedMonths=$$('.payMonth:checked').map(x=>num(x.value));drawPaymentCalc();});
 drawPaymentCalc();
}

// ---------- V7 banking summary ----------
function bankingRangeSummary(from,to){
 const f=from||'0000-00-00',t=to||'9999-99-99',inRange=d=>d>=f&&d<=t;
 const cashFee=sum((db.receipts||[]).filter(r=>inRange(r.date)&&r.mode==='Cash'),r=>r.paid);
 const cashQuick=sum((db.quickReceipts||[]).filter(q=>inRange(q.date)&&q.mode==='Cash'),q=>q.amount);
 const cashIncome=cashFee+cashQuick;
 const cashExpenses=sum((db.expenses||[]).filter(e=>inRange(e.date)&&e.mode==='Cash'),e=>e.amount);
 const deposits=sum((db.bankTransactions||[]).filter(x=>inRange(x.date)&&x.type==='cash_deposit'),x=>x.amount);
 const withdrawals=sum((db.bankTransactions||[]).filter(x=>inRange(x.date)&&x.type==='withdrawal'),x=>x.amount);
 const directBank=sum((db.receipts||[]).filter(r=>inRange(r.date)&&r.mode==='Bank'),r=>r.paid)+sum((db.quickReceipts||[]).filter(q=>inRange(q.date)&&q.mode==='Bank'),q=>q.amount);
 return {cashIncome,cashExpenses,deposits,withdrawals,directBank};
}
function renderBanking(){
 if(!isAccountant()&&!hasPermission('banking'))return unauthorized();
 const readonly=!isAccountant(),today=workingDate(),todaySummary=bankingRangeSummary(today,today);
 const balanceCards=`<div class="bank-balance-grid"><div class="bank-balance-card cash"><small>Cash Collected Today</small><strong>${money(todaySummary.cashIncome)}</strong><span>Fee + Quick Receipt</span></div><div class="bank-balance-card"><small>Transferred to Bank Today</small><strong>${money(todaySummary.deposits)}</strong><span>Cash → Bank</span></div><div class="bank-balance-card cash"><small>Remaining Cash</small><strong>${money(cashBalanceThrough(today))}</strong><span>After deposits / expenses / withdrawals</span></div>${(db.banks||[]).map(b=>`<div class="bank-balance-card"><small>${esc(b.name)} Balance</small><strong>${money(bankBalanceThrough(b.id,today))}</strong><span>${esc(b.accountNo||'')}</span></div>`).join('')||'<div class="bank-balance-card"><small>Bank Accounts</small><strong>None</strong><span>Add a bank account to begin.</span></div>'}</div>`;
 $('#content').innerHTML=`${balanceCards}${readonly?'':`<div class="two-col"><div class="section premium-section"><div class="section-title"><div><h3>Bank Accounts</h3><p>Create and manage multiple school bank accounts.</p></div><button class="btn primary" id="addBankBtn">+ Bank Account</button></div><div id="bankList"></div></div><div class="section premium-section"><div class="section-title"><div><h3>New Banking Transaction</h3><p>Deposit daily cash to bank or withdraw bank money to cash.</p></div></div><form id="bankTxForm" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(today)}" required></div><div><label>Transaction</label><select name="type"><option value="cash_deposit">Cash → Bank Deposit</option><option value="withdrawal">Bank Withdrawal → Cash</option></select></div><div><label>Bank</label><select name="bankId">${bankOptions()}</select></div><div><label>Amount</label><input name="amount" type="number" min="0" step="1" required></div><div><label>Deposited / Withdrawn By</label><input name="person"></div><div><label>Purpose / Heading</label><input name="purpose" placeholder="Deposit / Office use / Salary / etc."></div><div class="full"><label>Remarks</label><textarea name="remarks"></textarea></div><div class="full form-actions"><button class="btn primary">Save Banking Transaction</button></div></form></div></div>`}<div class="section premium-section"><div class="section-title"><div><h3>Banking Report</h3><p>See cash collection, bank transfer, remaining cash, direct bank receipts and withdrawals together.</p></div><button class="btn green" id="bankExport">Export Excel</button></div><div class="toolbar"><div class="field"><label>From Nepali Date</label><input id="bankFrom" value="${esc(today)}"></div><div class="field"><label>To Nepali Date</label><input id="bankTo" value="${esc(today)}"></div><button class="btn cyan" id="bankSearch">Search</button></div><div id="bankReportHost" style="margin-top:14px"></div></div>`;
 if(!readonly){$('#addBankBtn').onclick=()=>openBankForm();$('#bankTxForm').onsubmit=saveBankTransaction;drawBankList();}
 $('#bankSearch').onclick=drawBankReport;$('#bankExport').onclick=exportBankReport;drawBankReport();
}
function drawBankReport(){
 const f=$('#bankFrom')?.value||'',t=$('#bankTo')?.value||'',rows=bankingRows(f,t),prev=addDaysToNpDate(f||workingDate(),-1),sumr=bankingRangeSummary(f,t);
 const cards=[
  `<div class="summary-box"><small>Opening Cash</small><strong>${money(cashBalanceThrough(prev))}</strong></div>`,
  `<div class="summary-box"><small>Cash Collection</small><strong class="stat-green">${money(sumr.cashIncome)}</strong></div>`,
  `<div class="summary-box"><small>Cash → Bank Transfer</small><strong>${money(sumr.deposits)}</strong></div>`,
  `<div class="summary-box"><small>Bank → Cash Withdrawal</small><strong>${money(sumr.withdrawals)}</strong></div>`,
  `<div class="summary-box"><small>Cash Expenses</small><strong class="stat-red">${money(sumr.cashExpenses)}</strong></div>`,
  `<div class="summary-box"><small>Remaining Cash</small><strong>${money(cashBalanceThrough(t||workingDate()))}</strong></div>`,
  ...db.banks.map(b=>`<div class="summary-box"><small>${esc(b.name)} Closing</small><strong>${money(bankBalanceThrough(b.id,t||workingDate()))}</strong></div>`)
 ].join('');
 const body=rows.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Bank</th><th>Details</th><th class="amount">Bank In</th><th class="amount">Bank Out</th><th class="amount">Cash Movement</th><th class="amount">Cash Balance*</th><th class="amount">Bank Balance*</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.date}</td><td>${r.type}</td><td>${esc(r.ref||'')}</td><td>${esc(bankLabel(r.bankId))}</td><td>${esc(r.details||'')}</td><td class="amount stat-green">${r.inflow?money(r.inflow):'-'}</td><td class="amount stat-red">${r.outflow?money(r.outflow):'-'}</td><td class="amount">${r.cashOut?'- '+money(r.cashOut):(r.cashIn?'+ '+money(r.cashIn):'-')}</td><td class="amount">${money(cashBalanceThrough(r.date))}</td><td class="amount">${r.bankId?money(bankBalanceThrough(r.bankId,r.date)):'-'}</td></tr>`).join('')}<tr class="total-row"><td colspan="5"><b>TOTAL MOVEMENT</b></td><td class="amount"><b>${money(sum(rows,r=>r.inflow))}</b></td><td class="amount"><b>${money(sum(rows,r=>r.outflow))}</b></td><td class="amount"><b>To Bank ${money(sumr.deposits)}</b></td><td colspan="2"></td></tr></tbody></table><div class="card-note">* Balance columns show the closing balance for that Nepali date.</div></div>`:`<div class="empty">No banking transactions in this date range.</div>`;
 $('#bankReportHost').innerHTML=`<div class="summary-strip flexible-summary">${cards}</div>${body}`;
}
function exportBankReport(){
 const f=$('#bankFrom')?.value||'',t=$('#bankTo')?.value||'',rows=bankingRows(f,t),s=bankingRangeSummary(f,t);
 const data=rows.map(r=>[r.date,r.type,r.ref,bankLabel(r.bankId),r.details,r.inflow,r.outflow,r.cashIn?r.cashIn:-r.cashOut,cashBalanceThrough(r.date),r.bankId?bankBalanceThrough(r.bankId,r.date):'']);
 data.push(['SUMMARY','','','','Cash Collection',s.cashIncome,'','','','']);
 data.push(['SUMMARY','','','','Cash to Bank Transfer',s.deposits,'','','','']);
 data.push(['SUMMARY','','','','Remaining Cash','','','',cashBalanceThrough(t||workingDate()),'']);
 exportXLS('Banking_Report.xls',['Date','Type','Reference','Bank','Details','Bank In','Bank Out','Cash Movement','Cash Balance','Bank Balance'],data,'Banking Report');
}

// ---------- V7 Outstanding / Reminder selection and 4-per-A4 print ----------
function renderOutstanding(){
 if(!isAccountant()&&!hasPermission('outstanding'))return unauthorized();
 $('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Outstanding / Reminder</h3><p>Review multi-class outstanding dues. Reminder print includes only the students you explicitly tick.</p></div><div class="toolbar"><button class="btn green" id="outExport">Export Excel</button>${isAccountant()?'<button class="btn primary" id="outPrint" disabled>Print Selected — 4 Slips / A4</button>':''}</div></div><div class="toolbar"><div class="field"><label>Academic Year</label><select id="outYear">${yearsOptions(getYear())}</select></div><div class="field"><label>From Month</label><select id="outFrom">${NP_MONTHS.map((m,i)=>`<option value="${i}">${m}</option>`).join('')}</select></div><div class="field"><label>Up To Month</label><select id="outTo">${NP_MONTHS.map((m,i)=>`<option value="${i}" ${i===2?'selected':''}>${m}</option>`).join('')}</select></div><button class="btn cyan" id="outPreview">Preview Report</button></div><div class="class-filter-panel"><div class="filter-head">Classes — select one or many</div>${checkGroup('outClassCheck',CLASSES,[])}</div><div id="outHost" style="margin-top:12px"></div></div>`;
 $('#outPreview').onclick=drawOutstanding;$('#outExport').onclick=exportOutstanding;if(isAccountant())$('#outPrint').onclick=printOutstanding;$$('input[name="outClassCheck"]').forEach(x=>x.onchange=drawOutstanding);drawOutstanding();
}
function selectedOutstandingRows(){
 const selected=selectedValuesByName('outSelect');
 if(!selected.length)return[];
 return outstandingRows().filter(r=>selected.includes(r.s.id)&&r.total>0);
}
function updateOutstandingSelectionUI(){
 const selected=$$('input[name="outSelect"]:checked').length,total=$$('input[name="outSelect"]:not(:disabled)').length;
 const count=$('#outSelectedCount');if(count)count.textContent=`Selected: ${selected} / ${total}`;
 const btn=$('#outPrint');if(btn)btn.disabled=selected===0;
 const all=$('#outSelectAll');if(all){all.checked=total>0&&selected===total;all.indeterminate=selected>0&&selected<total;}
}
function drawOutstanding(){
 const rows=outstandingRows();
 if(!rows.length){$('#outHost').innerHTML='<div class="empty">Select one or more classes to view outstanding dues.</div>';const b=$('#outPrint');if(b)b.disabled=true;return;}
 const byClass={};rows.forEach(x=>byClass[x.s.className]=(byClass[x.s.className]||0)+x.total);
 $('#outHost').innerHTML=`<div class="summary-strip flexible-summary">${Object.entries(byClass).map(([c,v])=>`<div class="summary-box"><small>${esc(c)} Due</small><strong class="stat-red">${money(v)}</strong></div>`).join('')}<div class="summary-box"><small>Overall Due</small><strong class="stat-red">${money(sum(rows,x=>x.total))}</strong></div><div class="summary-box"><small>Reminder Selection</small><strong id="outSelectedCount">Selected: 0</strong></div></div><div class="table-wrap"><table><thead><tr>${isAccountant()?'<th><input type="checkbox" id="outSelectAll" title="Select all students with due"></th>':''}<th>Class</th><th>Student</th><th>Guardian</th><th>Up To</th><th>Heading-wise Due</th><th class="amount">Old Dues</th><th class="amount">Open Fees</th><th class="amount">Grand Total</th></tr></thead><tbody>${rows.map(x=>`<tr>${isAccountant()?`<td><input class="outSelect" name="outSelect" type="checkbox" value="${x.s.id}" ${x.total>0?'':'disabled'}></td>`:''}<td>${esc(x.s.className)}</td><td><b>${esc(x.s.name)}</b><br><small>${esc(x.s.registrationNo)}</small></td><td>${esc(x.s.guardian||x.s.fatherName||x.s.motherName||'')}</td><td>Up to ${NP_MONTHS[num($('#outTo').value)]}</td><td>${x.grouped.length?x.grouped.map(g=>`${esc(g.label)} · ${g.months.length} month(s) · ${money(g.perAmount)} × ${g.months.length} = <b>${money(g.total)}</b>`).join('<br>'):'<span class="muted">No open fee</span>'}</td><td class="amount">${money(x.old)}</td><td class="amount">${money(x.open)}</td><td class="amount ${x.total>0?'danger-text':'good-text'}">${money(x.total)}</td></tr>`).join('')}</tbody></table></div>`;
 $$('.outSelect').forEach(x=>x.onchange=updateOutstandingSelectionUI);
 const all=$('#outSelectAll');if(all)all.onchange=()=>{$$('.outSelect:not(:disabled)').forEach(x=>x.checked=all.checked);updateOutstandingSelectionUI();};
 updateOutstandingSelectionUI();
}
function printOutstanding(){
 const rows=selectedOutstandingRows();
 if(!rows.length)return toast('Select at least one student before printing reminder letters.');
 const y=$('#outYear').value,to=NP_MONTHS[num($('#outTo').value)],logo=db.settings.logoData?`<img src="${db.settings.logoData}" class="reminder-logo">`:'';
 const qr=db.settings.reminderQRData?`<img src="${db.settings.reminderQRData}" class="reminder-qr">`:'';
 const slipHTML=x=>`<div class="slip"><div class="reminder-head">${logo}<div class="reminder-school"><div class="reminder-school-name">${esc(db.settings.schoolName)}</div><div class="reminder-address">${esc(db.settings.address)}</div><div class="reminder-title">${esc(db.settings.remindHeader||'Fee Reminder')}</div></div></div><div class="student-row"><b>${esc(x.s.name)}</b> · ${esc(x.s.className)} · Reg: ${esc(x.s.registrationNo)}</div><div class="small-row"><b>Guardian:</b> ${esc(x.s.guardian||x.s.fatherName||x.s.motherName||'')} &nbsp; <b>Period:</b> Up to ${to}, ${y}</div><table class="slip-detail"><thead><tr><th>Particular</th><th>Months</th><th>Rate</th><th>Total</th></tr></thead><tbody>${x.grouped.map(g=>`<tr><td>${esc(g.label)}</td><td>${esc(g.months.join(', '))}</td><td>${money(g.perAmount)}</td><td>${money(g.total)}</td></tr>`).join('')}${num(x.old)>0?`<tr><td>Old Dues</td><td>-</td><td>-</td><td>${money(x.old)}</td></tr>`:''}</tbody></table><div class="grand">Grand Total: ${money(x.total)}</div><div class="message">${esc(reminderReplacement(db.settings.reminderTemplate,x))}</div><div class="bottom"><div class="online">${esc(reminderReplacement(db.settings.reminderOnlineNote,x))}${db.settings.reminderWhatsApp?`<div class="whatsapp">WhatsApp: ${esc(db.settings.reminderWhatsApp)}</div>`:''}</div>${qr}</div></div>`;
 const pages=[];for(let i=0;i<rows.length;i+=4)pages.push(`<section class="reminder-page">${rows.slice(i,i+4).map(slipHTML).join('')}</section>`);
 const w=window.open('','_blank','width=1000,height=920');
 w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:6mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#111}.reminder-page{height:284mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:4mm;page-break-after:always}.reminder-page:last-child{page-break-after:auto}.slip{border:1px solid #333;border-radius:4px;padding:3mm;min-height:0;overflow:hidden;display:flex;flex-direction:column}.reminder-head{display:flex;align-items:center;gap:2.5mm;border-bottom:1px solid #9eb7c9;padding-bottom:1.5mm;margin-bottom:1.5mm}.reminder-logo{width:10mm;height:10mm;object-fit:contain;flex:0 0 auto}.reminder-school{min-width:0;text-align:center;flex:1}.reminder-school-name{font-size:11px;font-weight:900;color:#124d7a;white-space:nowrap;line-height:1.1}.reminder-address{font-size:7.5px;line-height:1.1}.reminder-title{font-size:9px;font-weight:900;color:#a91c1c;margin-top:1px}.student-row{font-size:8.6px;margin-bottom:1mm}.small-row{font-size:7.6px;margin-bottom:1.2mm}.slip-detail{width:100%;border-collapse:collapse;font-size:7.5px;table-layout:fixed}.slip-detail th,.slip-detail td{border:1px solid #aaa;padding:1.1mm;vertical-align:top;word-break:break-word}.slip-detail th:nth-child(1){width:35%}.slip-detail th:nth-child(2){width:30%}.slip-detail th:nth-child(3),.slip-detail th:nth-child(4){width:17.5%;text-align:right}.slip-detail td:nth-child(3),.slip-detail td:nth-child(4){text-align:right}.grand{text-align:right;font-size:9px;font-weight:900;margin-top:1.2mm}.message,.online{font-size:7.2px;line-height:1.18;white-space:pre-wrap}.message{margin-top:1.2mm}.bottom{display:flex;align-items:flex-end;justify-content:space-between;gap:2mm;margin-top:auto;padding-top:1mm}.online{flex:1}.whatsapp{font-weight:700;margin-top:.8mm}.reminder-qr{width:14mm;height:14mm;object-fit:contain;border:1px solid #ddd;flex:0 0 auto}@media print{.reminder-page{break-after:page}.reminder-page:last-child{break-after:auto}}</style></head><body>${pages.join('')}<script>setTimeout(()=>window.print(),350)<\/script></body></html>`);
 w.document.close();
}

// ---------- V7 Admit Card header: logo + one-line school name ----------
function printAdmitCards(){
 const students=selectedAdmitStudents();if(!students.length)return toast('Select at least one student.');
 const logo=db.settings.logoData?`<img src="${db.settings.logoData}" class="admit-logo">`:'';
 const cards=students.map(s=>`<div class="admit-card"><div class="admit-top">${logo}<div class="admit-school"><div class="admit-school-name">${esc(db.settings.schoolName)}</div><div class="admit-school-sub">${esc(db.settings.address)}</div><div class="admit-term">${esc(db.settings.admitCardTerm||'First Term')}</div><div class="admit-title">${esc(db.settings.admitCardTitle||'ADMIT CARD')}</div></div></div><div class="admit-body"><div class="admit-line"><span>Student Name:</span><b>${esc(s.name)}</b></div><div class="admit-line"><span>Class:</span><b>${esc(s.className)}</b></div><div class="admit-line"><span>Guardian Name:</span><b>${esc(s.guardian||s.fatherName||s.motherName||'')}</b></div><div class="admit-line"><span>Registration No.:</span><b>${esc(s.registrationNo)}</b></div><div class="admit-line"><span>Hall No.:</span><b>${esc(s.admitHallNo||'........................')}</b></div></div><div class="admit-signs">${admitSignature(db.settings.examCoordinatorSignatureData,db.settings.examCoordinatorName||'Exam Coordinator',db.settings.examCoordinatorPost||'Exam Coordinator')}${admitSignature(db.settings.principalSignatureData,db.settings.principalName||'Principal',db.settings.principalPost||'Principal')}${admitSignature(db.settings.accountantSignatureData,db.settings.accountantSignName||'Accountant',db.settings.accountantSignPost||'Accountant')}</div></div>`).join('');
 const w=window.open('','_blank','width=1000,height=900');
 w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:7mm}*{box-sizing:border-box}body{font-family:Arial;margin:0;background:#fff}.admit-grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.admit-card{break-inside:avoid;border:2px solid #2d7fbd;border-radius:12px;padding:4mm;background:linear-gradient(145deg,#f3fbff,#fff 58%,#f8fbff);height:88mm;position:relative;box-shadow:inset 0 0 0 3px #d9eefc}.admit-top{display:flex;gap:6px;align-items:center;border-bottom:1px solid #b8ddf6;padding-bottom:5px}.admit-logo{width:42px;height:42px;object-fit:contain;flex:0 0 auto}.admit-school{text-align:center;flex:1;min-width:0}.admit-school-name{font-size:13px;font-weight:900;color:#155b92;line-height:1.1;white-space:nowrap}.admit-school-sub{font-size:8.5px}.admit-term{display:inline-block;margin-top:3px;padding:2px 8px;background:#0ea5e9;color:#fff;border-radius:999px;font-size:8.5px;font-weight:700}.admit-title{margin-top:3px;font-size:13px;font-weight:900;color:#b51d1d;letter-spacing:.08em}.admit-body{font-size:10.5px;padding-top:9px;display:grid;gap:5px}.admit-line{display:grid;grid-template-columns:88px 1fr;align-items:end}.admit-line span{font-weight:700}.admit-line b{font-weight:900;border-bottom:1px dotted #111;min-height:16px;padding:0 4px 2px}.admit-signs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;position:absolute;left:4mm;right:4mm;bottom:3mm;text-align:center}.signature-img{display:block;margin:0 auto 1px;width:58px;height:25px;object-fit:contain}.signature-dots{height:25px;display:flex;align-items:end;justify-content:center;font-size:11px}.admit-sign-cell small{display:block;font-size:8px;line-height:1.15}.sign-name{font-weight:700}</style></head><body><div class="admit-grid">${cards}</div><script>setTimeout(()=>window.print(),300)<\/script></body></html>`);
 w.document.close();
}

window.deleteStudentV7=deleteStudentV7;
if(!db.archivedStudents)db.archivedStudents=[];
/* ==================== END V7 LOCAL TEST FIXES ==================== */


/* ==================== V8 LOCAL TEST IMPROVEMENTS ==================== */
PAGE_TITLES.feePayment='Fee Receive';

function navItems(){
 const all=[
  ['dashboard','▦','Dashboard'],['feePayment','▣','Fee Receive'],['quickReceipt','＋','Quick Receipt'],['quickRegister','▤','Quick Receipt Register'],['students','♟','Students'],['studentUpdate','⇧','Student Update'],['studentSearch','⌕','Fee Card'],['admitCard','🪪','Admit Card'],
  ['receiptRegister','▤','Receipt Register'],['feeStructure','≡','Fee Structure'],['dailyCollection','▥','Daily Collection'],['outstanding','!','Outstanding / Reminder'],['examHallPass','✓','Exam Hall Pass'],['expenses','−','Expenses'],['banking','▰','Banking Transactions'],['daybook','▧','Day Book'],['monthly','▦','Monthly Summary'],['headwise','#','Head-wise Collection'],
  ['reports','▩','Reports'],['access','⚿','MD / CEO Access'],['settings','⚙','Settings'],['help','?','Help']
 ];
 const accountantOnly=new Set(['feePayment','quickReceipt','feeStructure','expenses','studentUpdate','access','settings']);
 return all.filter(([p])=>isAccountant()?true:(!accountantOnly.has(p)&&hasPermission(p)));
}

function todayCollectionByHead(){
 const d=workingDate(),map={};
 (db.receipts||[]).filter(r=>r.date===d).forEach(r=>{
   const components=(r.items||[]).map(i=>({label:i.label||'Student Fees',amount:num(i.amount)}));
   if(num(r.oldDues)>0)components.push({label:'Old Dues',amount:num(r.oldDues)});
   const base=sum(components,x=>x.amount),received=Math.max(0,num(r.paid));
   if(base>0){
     const alloc=Math.min(received,Math.max(0,num(r.netPayable)||base));
     components.forEach(x=>{map[x.label]=(map[x.label]||0)+(x.amount/base)*alloc;});
     const excess=Math.max(0,received-alloc);if(excess)map['Advance']=(map['Advance']||0)+excess;
   }else if(received){map['Student Fees']=(map['Student Fees']||0)+received;}
 });
 (db.quickReceipts||[]).filter(q=>q.date===d).forEach(q=>{const label=q.title||'Quick Receipt';map[label]=(map[label]||0)+num(q.amount);});
 return Object.entries(map).filter(([,v])=>v>0.0001).sort((a,b)=>b[1]-a[1]);
}
function collectionDonutHTML(){
 const rows=todayCollectionByHead(),total=sum(rows,x=>x[1]),palette=['#1479bd','#18a999','#f59e0b','#8b5cf6','#e35d6a','#2f855a','#d97706','#2563eb','#6b7280','#0e7490','#be123c','#7c3aed'];
 if(!rows.length)return `<div class="collection-chart-panel"><div class="chart-heading"><div><h3>Today’s Collection by Heading</h3><p>Nepali Date: ${esc(workingDate())}</p></div><strong>${money(0)}</strong></div><div class="chart-empty">No collection transactions for this date.</div></div>`;
 let acc=0;const stops=[];rows.forEach((r,i)=>{const start=acc;acc+=r[1]/total*100;stops.push(`${palette[i%palette.length]} ${start.toFixed(3)}% ${acc.toFixed(3)}%`)});
 const legend=rows.map((r,i)=>`<div class="chart-legend-row"><span class="chart-dot" style="background:${palette[i%palette.length]}"></span><span class="chart-name">${esc(r[0])}</span><b>${money(r[1])}</b></div>`).join('');
 return `<div class="collection-chart-panel"><div class="chart-heading"><div><h3>Today’s Collection by Heading</h3><p>Nepali Date: ${esc(workingDate())}</p></div><strong>${money(total)}</strong></div><div class="collection-chart-body"><div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops.join(',')})"><div class="donut-center"><small>Total</small><b>${money(total)}</b></div></div></div><div class="chart-legend">${legend}</div></div></div>`;
}
function renderDashboard(){
 let cards=[];const can=p=>isAccountant()||hasPermission(p),today=workingDate();
 const todayFees=sum((db.receipts||[]).filter(r=>r.date===today),r=>num(r.paid));
 const todayOther=sum((db.quickReceipts||[]).filter(r=>r.date===today),r=>num(r.amount));
 const todayExpenses=sum((db.expenses||[]).filter(e=>e.date===today),e=>num(e.amount));
 const bankTotal=sum((db.banks||[]),b=>bankBalanceThrough(b.id,today));
 if(isAccountant()||can('receiptRegister'))cards.push(dashboardCard('Fee Collection',money(totalFeeIncome()),`Today ${money(todayFees)}`,isAccountant()?[['Fee Receive','feePayment'],['Receipts','receiptRegister']]:[['Receipts','receiptRegister']], 'green'));
 if(isAccountant()||can('studentList')||can('studentSearch'))cards.push(dashboardCard('Students',String(db.students.length),'Active records',isAccountant()?[['Students','students'],['Fee Card','studentSearch']]:[['Students','students'],['Fee Card','studentSearch']].filter(x=>can(x[1])),'blue'));
 if(isAccountant())cards.push(dashboardCard('Fee Setup',String(db.feeHeads.length),`${db.feePlans.length} plans · ${db.routes.length} routes`,[['Fee Setup','feeStructure'],['Student Update','studentUpdate']],'violet'));
 if(isAccountant()||can('dailyCollection')||can('daybook'))cards.push(dashboardCard('Today Received',money(todayFees+todayOther),`Expense ${money(todayExpenses)}`,[['Daily Collection','dailyCollection'],['Day Book','daybook']].filter(x=>can(x[1])),'amber'));
 if(isAccountant()||can('outstanding')||can('examHallPass'))cards.push(dashboardCard('Outstanding',money(totalDues()),'Current dues',[['Outstanding','outstanding'],['Exam Hall Pass','examHallPass']].filter(x=>can(x[1])),'red'));
 if(isAccountant()||can('monthly')||can('headwise')||can('reports'))cards.push(dashboardCard('Reports',esc(getYear()),'Academic Year',[['Monthly','monthly'],['Head-wise','headwise'],['Reports','reports']].filter(x=>can(x[1])),'slate'));
 if(isAccountant())cards.push(dashboardCard('Quick Receipt',String(db.quickReceipts.length),`Today ${money(todayOther)}`,[['New Receipt','quickReceipt'],['Register','quickRegister']],'cyan'));
 if(isAccountant()||can('banking'))cards.push(dashboardCard('Bank Balance',money(bankTotal),`Cash ${money(cashBalanceThrough(today))}`,[['Banking','banking'],['Day Book','daybook']].filter(x=>can(x[1])),'navy'));
 $('#content').innerHTML=`<div class="dashboard-welcome"><div><span class="dashboard-eyebrow">ST. AUGUSTINE ACADEMIC FOUNDATION</span><h3>Accounts Overview</h3></div><div class="dashboard-date"><span>Nepali Date</span><b>${esc(today)}</b></div></div><div class="dashboard-grid premium-dashboard-grid">${cards.join('')}</div>${collectionDonutHTML()}`;
}

/* Fee Receive: searchable student selector + one selectedStudentId source of truth */
function renderFeePayment(){
 if(!isAccountant())return unauthorized();
 paymentState={year:getYear(),className:'',studentId:'',selectedMonths:[],date:workingDate(),mode:'Cash',bankId:'',discount:0,paid:0};
 $('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Fee Receive</h3><p>Year → Class → type Student Name → Month(s). Receipt number is automatic.</p></div><div class="next-number"><small>Next Receipt</small><b>${esc(nextReceiptNo(false))}</b></div></div><div class="form-grid three"><div><label>Academic Year</label><select id="payYear">${yearsOptions(paymentState.year)}</select></div><div><label>Class</label><select id="payClass">${classesOptions()}</select></div><div class="student-search-field"><label>Student</label><input id="payStudentSearch" type="text" disabled autocomplete="off" placeholder="Select class, then type student name"><div id="payStudentResults" class="student-search-results hidden"></div></div><div><label>Nepali Date</label><input id="payDate" value="${esc(workingDate())}" placeholder="2083-05-26"></div><div><label>Payment Mode</label><select id="payMode"><option>Cash</option><option>Bank</option></select></div><div id="payBankWrap" class="hidden"><label>Bank Account</label><select id="payBank">${bankOptions()}</select></div><div><label>Registration No.</label><input id="payReg" readonly></div></div></div><div id="payHost"></div>`;
 $('#payClass').onchange=resetFeeReceiveStudents;$('#payYear').onchange=resetFeeReceiveStudents;
 const input=$('#payStudentSearch');input.oninput=drawFeeReceiveStudentResults;input.onfocus=drawFeeReceiveStudentResults;
 $('#payDate').oninput=e=>paymentState.date=e.target.value;
 $('#payMode').onchange=e=>{paymentState.mode=e.target.value;$('#payBankWrap').classList.toggle('hidden',e.target.value!=='Bank');if(e.target.value!=='Bank')paymentState.bankId='';};
 $('#payBank').onchange=e=>paymentState.bankId=e.target.value;
 input.onblur=()=>setTimeout(()=>$('#payStudentResults')?.classList.add('hidden'),160);
}
function resetFeeReceiveStudents(){
 const y=String($('#payYear')?.value||''),c=String($('#payClass')?.value||'');paymentState.year=y;paymentState.className=c;paymentState.studentId='';paymentState.selectedMonths=[];paymentState.discount=0;paymentState.paid=0;
 const input=$('#payStudentSearch');if(input){input.disabled=!c;input.value='';input.placeholder=c?'Type student name (e.g. Sagar)':'Select class first';}
 if($('#payStudentResults')){$('#payStudentResults').innerHTML='';$('#payStudentResults').classList.add('hidden');}if($('#payHost'))$('#payHost').innerHTML='';if($('#payReg'))$('#payReg').value='';
}
function feeReceiveStudents(){const y=String($('#payYear')?.value||''),c=String($('#payClass')?.value||'');return (db.students||[]).filter(s=>String(s.year)===y&&String(s.className)===c).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));}
function drawFeeReceiveStudentResults(){
 const host=$('#payStudentResults'),input=$('#payStudentSearch');if(!host||!input||input.disabled)return;const q=input.value.trim().toLowerCase();let arr=feeReceiveStudents();
 if(q)arr=arr.filter(s=>String(s.name||'').toLowerCase().includes(q)).sort((a,b)=>{const aa=String(a.name||'').toLowerCase().startsWith(q)?0:1,bb=String(b.name||'').toLowerCase().startsWith(q)?0:1;return aa-bb||String(a.name||'').localeCompare(String(b.name||''));});
 arr=arr.slice(0,80);host.innerHTML=arr.length?arr.map(s=>`<button type="button" class="student-search-option" onclick="selectFeeReceiveStudent('${esc(s.id)}')"><b>${esc(s.name)}</b><small>${esc(s.guardian||s.fatherName||s.motherName||'')}</small></button>`).join(''):'<div class="student-search-empty">No matching student.</div>';host.classList.remove('hidden');
}
function selectFeeReceiveStudent(id){
 const y=String($('#payYear')?.value||''),c=String($('#payClass')?.value||''),s=(db.students||[]).find(x=>String(x.id)===String(id)&&String(x.year)===y&&String(x.className)===c);if(!s)return;
 paymentState.studentId=s.id;paymentState.selectedMonths=[];paymentState.discount=0;paymentState.paid=0;$('#payStudentSearch').value=s.name;$('#payStudentResults').classList.add('hidden');drawPayPanel();
}
function feeReceiveOutsideClick(){setTimeout(()=>{document.addEventListener('click',e=>{const field=e.target.closest?.('.student-search-field');if(!field&&$('#payStudentResults'))$('#payStudentResults').classList.add('hidden');});},0);}
function fillPayStudents(){resetFeeReceiveStudents();}
function drawPayPanel(){
 const y=String($('#payYear')?.value||''),c=String($('#payClass')?.value||''),selectedId=String(paymentState.studentId||'');
 const s=(db.students||[]).find(x=>String(x.id)===selectedId&&String(x.year)===y&&String(x.className)===c);
 paymentState.selectedMonths=[];paymentState.discount=0;paymentState.paid=0;
 if(!s){paymentState.studentId='';if($('#payHost'))$('#payHost').innerHTML='';if($('#payReg'))$('#payReg').value='';return;}
 $('#payReg').value=s.registrationNo||'';
 const months=NP_MONTHS.map((m,i)=>`<label class="month-box ${isMonthClosed(s,y,i)?'processed':''}"><input class="payMonth" type="checkbox" value="${i}" ${isMonthClosed(s,y,i)?'disabled':''}>${m}${isMonthClosed(s,y,i)?' — Processed':''}</label>`).join('');
 $('#payHost').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>${esc(s.name)} — ${esc(s.className)}</h3><p><b>Registration:</b> ${esc(s.registrationNo||'')} &nbsp; · &nbsp; <b>Guardian:</b> ${esc(s.guardian||s.fatherName||s.motherName||'-')} &nbsp; · &nbsp; <b>Current Dues:</b> ${money(s.dues)}</p></div></div><div class="month-grid">${months}</div></div><div id="payCalc"></div>`;
 $$('.payMonth').forEach(box=>box.onchange=()=>{paymentState.selectedMonths=$$('.payMonth:checked').map(x=>num(x.value));drawPaymentCalc();});drawPaymentCalc();
}
window.selectFeeReceiveStudent=selectFeeReceiveStudent;

/* Day Book: Net, bank transfers and remaining cash */
function allTransactions(){
 const out=[];
 (db.receipts||[]).forEach(r=>out.push({date:r.date,type:'Fee Receipt',ref:r.receiptNo,details:`${r.studentName} - ${r.className}${r.mode==='Bank'?' · '+bankLabel(r.bankId):''}`,head:'Student Fees',mode:r.mode,income:num(r.paid),expense:0,transfer:0,bankId:r.bankId||''}));
 (db.quickReceipts||[]).forEach(q=>out.push({date:q.date,type:'Quick Receipt',ref:q.receiptNo,details:`${q.receivedFrom||q.title}${q.mode==='Bank'?' · '+bankLabel(q.bankId):''}`,head:q.title,mode:q.mode,income:num(q.amount),expense:0,transfer:0,bankId:q.bankId||''}));
 (db.expenses||[]).forEach(e=>out.push({date:e.date,type:'Expense',ref:e.voucherNo||'',details:`${e.paidTo||e.remarks||''}${e.mode==='Bank'?' · '+bankLabel(e.bankId):''}`,head:e.head,mode:e.mode,income:0,expense:num(e.amount),transfer:0,bankId:e.bankId||''}));
 (db.bankTransactions||[]).forEach(t=>out.push({date:t.date,type:t.type==='cash_deposit'?'Cash to Bank':'Bank Withdrawal',ref:'',details:`${bankLabel(t.bankId)}${t.person?' · '+t.person:''}${t.purpose?' · '+t.purpose:''}`,head:'Banking Transfer',mode:'Transfer',income:0,expense:0,transfer:t.type==='cash_deposit'?num(t.amount):-num(t.amount),bankId:t.bankId||''}));
 return out.sort((a,b)=>a.date.localeCompare(b.date)||String(a.ref||'').localeCompare(String(b.ref||'')));
}
function renderDayBook(){if(!isAccountant()&&!hasPermission('daybook'))return unauthorized();$('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>General Day Book</h3><p>Income, expenses, bank transfers and remaining cash for any Nepali date range.</p></div><button class="btn green" id="dayExport">Export Excel</button></div><div class="toolbar"><div class="field"><label>From Nepali Date</label><input id="dayFrom" value="${esc(workingDate())}"></div><div class="field"><label>To Nepali Date</label><input id="dayTo" value="${esc(workingDate())}"></div><button class="btn cyan" id="daySearch">Search</button></div><div id="dayHost" style="margin-top:12px"></div></div>`;$('#daySearch').onclick=drawDayBook;$('#dayExport').onclick=exportDayBookV8;drawDayBook();}
function dayRows(){const f=$('#dayFrom')?.value||'',t=$('#dayTo')?.value||'';return allTransactions().filter(x=>(!f||x.date>=f)&&(!t||x.date<=t));}
function dayBookBankSummary(rows){const m={};rows.filter(x=>num(x.transfer)>0).forEach(x=>m[x.bankId]=(m[x.bankId]||0)+num(x.transfer));return m;}
function drawDayBook(){
 const rows=dayRows(),inc=sum(rows,x=>x.income),exp=sum(rows,x=>x.expense),net=inc-exp,deposits=sum(rows,x=>Math.max(0,num(x.transfer))),f=$('#dayFrom')?.value||workingDate(),t=$('#dayTo')?.value||workingDate(),remaining=cashBalanceThrough(t),bankMap=dayBookBankSummary(rows);
 const bankText=Object.entries(bankMap).length?Object.entries(bankMap).map(([id,v])=>`${esc(bankLabel(id))}: <b>${money(v)}</b>`).join(' &nbsp; · &nbsp; '):'<span class="muted">No Cash → Bank transfer</span>';
 const body=rows.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Head</th><th>Details</th><th>Mode</th><th class="amount">Income</th><th class="amount">Expense</th><th class="amount">Bank Transfer</th><th class="amount">Remaining Cash*</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.type)}</td><td>${esc(x.ref||'')}</td><td>${esc(x.head||'')}</td><td>${esc(x.details||'')}</td><td>${esc(x.mode||'')}</td><td class="amount stat-green">${x.income?money(x.income):'-'}</td><td class="amount stat-red">${x.expense?money(x.expense):'-'}</td><td class="amount">${num(x.transfer)>0?money(x.transfer):(num(x.transfer)<0?'Bank → Cash '+money(Math.abs(x.transfer)):'-')}</td><td class="amount">${money(cashBalanceThrough(x.date))}</td></tr>`).join('')}<tr class="total-row"><td colspan="6"><b>TOTAL / NET ${money(net)}</b></td><td class="amount"><b>${money(inc)}</b></td><td class="amount"><b>${money(exp)}</b></td><td class="amount"><b>${money(deposits)}</b></td><td class="amount"><b>${money(remaining)}</b></td></tr></tbody></table><div class="card-note">* Remaining Cash is the closing cash balance through that Nepali date.</div></div>`:'<div class="empty">No transactions in this date range.</div>';
 $('#dayHost').innerHTML=`<div class="summary-strip flexible-summary"><div class="summary-box"><small>Income</small><strong class="stat-green">${money(inc)}</strong></div><div class="summary-box"><small>Expense</small><strong class="stat-red">${money(exp)}</strong></div><div class="summary-box"><small>Net Amount</small><strong>${money(net)}</strong></div><div class="summary-box"><small>Transfer to Bank</small><strong>${money(deposits)}</strong></div><div class="summary-box"><small>Remaining Cash</small><strong class="stat-green">${money(remaining)}</strong></div></div><div class="bank-transfer-summary"><b>Bank Transfer Breakdown:</b> ${bankText}</div>${body}`;
}
function exportDayBookV8(){const rows=dayRows(),t=$('#dayTo')?.value||workingDate();const data=rows.map(x=>[x.date,x.type,x.ref,x.head,x.details,x.mode,x.income,x.expense,num(x.transfer)>0?x.transfer:num(x.transfer)<0?-Math.abs(x.transfer):0,cashBalanceThrough(x.date)]);const inc=sum(rows,x=>x.income),exp=sum(rows,x=>x.expense);data.push(['TOTAL / NET','','','','','','',exp,sum(rows,x=>Math.max(0,num(x.transfer))),cashBalanceThrough(t)]);data.push(['NET AMOUNT',inc-exp,'','','','','','','','']);exportXLS('Day_Book.xls',['Date','Type','Reference','Head','Details','Mode','Income','Expense','Bank Transfer','Remaining Cash'],data,'General Day Book');}

/* Reminder QR larger while preserving 4 slips per A4 */
function printOutstanding(){
 const rows=selectedOutstandingRows();if(!rows.length)return toast('Select at least one student before printing reminder letters.');
 const y=$('#outYear').value,to=NP_MONTHS[num($('#outTo').value)],logo=db.settings.logoData?`<img src="${db.settings.logoData}" class="reminder-logo">`:'',qr=db.settings.reminderQRData?`<img src="${db.settings.reminderQRData}" class="reminder-qr" alt="Payment QR">`:'';
 const slipHTML=x=>`<div class="slip"><div class="reminder-head">${logo}<div class="reminder-school"><div class="reminder-school-name">${esc(db.settings.schoolName)}</div><div class="reminder-address">${esc(db.settings.address)}</div><div class="reminder-title">${esc(db.settings.remindHeader||'Fee Reminder')}</div></div></div><div class="student-row"><b>${esc(x.s.name)}</b> · ${esc(x.s.className)} · Reg: ${esc(x.s.registrationNo)}</div><div class="small-row"><b>Guardian:</b> ${esc(x.s.guardian||x.s.fatherName||x.s.motherName||'')} &nbsp; <b>Period:</b> Up to ${to}, ${y}</div><table class="slip-detail"><thead><tr><th>Particular</th><th>Months</th><th>Rate</th><th>Total</th></tr></thead><tbody>${x.grouped.map(g=>`<tr><td>${esc(g.label)}</td><td>${esc(g.months.join(', '))}</td><td>${money(g.perAmount)}</td><td>${money(g.total)}</td></tr>`).join('')}${num(x.old)>0?`<tr><td>Old Dues</td><td>-</td><td>-</td><td>${money(x.old)}</td></tr>`:''}</tbody></table><div class="grand">Grand Total: ${money(x.total)}</div><div class="message">${esc(reminderReplacement(db.settings.reminderTemplate,x))}</div><div class="bottom"><div class="online">${esc(reminderReplacement(db.settings.reminderOnlineNote,x))}${db.settings.reminderWhatsApp?`<div class="whatsapp">WhatsApp: ${esc(db.settings.reminderWhatsApp)}</div>`:''}</div>${qr}</div></div>`;
 const pages=[];for(let i=0;i<rows.length;i+=4)pages.push(`<section class="reminder-page">${rows.slice(i,i+4).map(slipHTML).join('')}</section>`);const w=window.open('','_blank','width=1000,height=920');
 w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#111}.reminder-page{height:287mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:3mm;page-break-after:always}.reminder-page:last-child{page-break-after:auto}.slip{border:1px solid #333;border-radius:4px;padding:2.7mm;min-height:0;overflow:hidden;display:flex;flex-direction:column}.reminder-head{display:flex;align-items:center;gap:2.2mm;border-bottom:1px solid #9eb7c9;padding-bottom:1.3mm;margin-bottom:1.3mm}.reminder-logo{width:10mm;height:10mm;object-fit:contain;flex:0 0 auto}.reminder-school{min-width:0;text-align:center;flex:1}.reminder-school-name{font-size:10.8px;font-weight:900;color:#124d7a;white-space:nowrap;line-height:1.08}.reminder-address{font-size:7.2px;line-height:1.08}.reminder-title{font-size:8.7px;font-weight:900;color:#a91c1c;margin-top:1px}.student-row{font-size:8.4px;margin-bottom:.8mm}.small-row{font-size:7.3px;margin-bottom:1mm}.slip-detail{width:100%;border-collapse:collapse;font-size:7.1px;table-layout:fixed}.slip-detail th,.slip-detail td{border:1px solid #aaa;padding:.85mm;vertical-align:top;word-break:break-word}.slip-detail th:nth-child(1){width:35%}.slip-detail th:nth-child(2){width:30%}.slip-detail th:nth-child(3),.slip-detail th:nth-child(4){width:17.5%;text-align:right}.slip-detail td:nth-child(3),.slip-detail td:nth-child(4){text-align:right}.grand{text-align:right;font-size:8.8px;font-weight:900;margin-top:1mm}.message,.online{font-size:6.9px;line-height:1.13;white-space:pre-wrap}.message{margin-top:1mm}.bottom{display:flex;align-items:flex-end;justify-content:space-between;gap:2mm;margin-top:auto;padding-top:.7mm}.online{flex:1}.whatsapp{font-weight:700;margin-top:.6mm}.reminder-qr{width:22mm;height:22mm;object-fit:contain;border:1px solid #ddd;background:#fff;padding:.7mm;flex:0 0 auto}@media print{.reminder-page{break-after:page}.reminder-page:last-child{break-after:auto}}</style></head><body>${pages.join('')}<script>setTimeout(()=>window.print(),350)<\/script></body></html>`);w.document.close();
}

/* Admit Card: clearer term/exam heading */
function printAdmitCards(){
 const students=selectedAdmitStudents();if(!students.length)return toast('Select at least one student.');const logo=db.settings.logoData?`<img src="${db.settings.logoData}" class="admit-logo">`:'';
 const cards=students.map(s=>`<div class="admit-card"><div class="admit-top">${logo}<div class="admit-school"><div class="admit-school-name">${esc(db.settings.schoolName)}</div><div class="admit-school-sub">${esc(db.settings.address)}</div><div class="admit-term">${esc(db.settings.admitCardTerm||'First Term Exam')}</div><div class="admit-title">${esc(db.settings.admitCardTitle||'ADMIT CARD')}</div></div></div><div class="admit-body"><div class="admit-line"><span>Student Name:</span><b>${esc(s.name)}</b></div><div class="admit-line"><span>Class:</span><b>${esc(s.className)}</b></div><div class="admit-line"><span>Guardian Name:</span><b>${esc(s.guardian||s.fatherName||s.motherName||'')}</b></div><div class="admit-line"><span>Registration No.:</span><b>${esc(s.registrationNo)}</b></div><div class="admit-line"><span>Hall No.:</span><b>${esc(s.admitHallNo||'........................')}</b></div></div><div class="admit-signs">${admitSignature(db.settings.examCoordinatorSignatureData,db.settings.examCoordinatorName||'Exam Coordinator',db.settings.examCoordinatorPost||'Exam Coordinator')}${admitSignature(db.settings.principalSignatureData,db.settings.principalName||'Principal',db.settings.principalPost||'Principal')}${admitSignature(db.settings.accountantSignatureData,db.settings.accountantSignName||'Accountant',db.settings.accountantSignPost||'Accountant')}</div></div>`).join('');
 const w=window.open('','_blank','width=1000,height=900');w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:7mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;background:#fff}.admit-grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.admit-card{break-inside:avoid;border:2px solid #2d7fbd;border-radius:12px;padding:4mm;background:linear-gradient(145deg,#f3fbff,#fff 58%,#f8fbff);height:88mm;position:relative;box-shadow:inset 0 0 0 3px #d9eefc}.admit-top{display:flex;gap:6px;align-items:center;border-bottom:1px solid #b8ddf6;padding-bottom:5px}.admit-logo{width:42px;height:42px;object-fit:contain;flex:0 0 auto}.admit-school{text-align:center;flex:1;min-width:0}.admit-school-name{font-size:13px;font-weight:900;color:#155b92;line-height:1.1;white-space:nowrap}.admit-school-sub{font-size:8.5px}.admit-term{display:inline-block;margin-top:4px;padding:3px 11px;background:#0b6397;color:#fff;border:1px solid #064b75;border-radius:5px;font-family:Arial,sans-serif;font-size:10.5px;line-height:1.15;font-weight:900;letter-spacing:.02em;text-shadow:0 1px 0 rgba(0,0,0,.15)}.admit-title{margin-top:3px;font-size:13px;font-weight:900;color:#b51d1d;letter-spacing:.08em}.admit-body{font-size:10.5px;padding-top:9px;display:grid;gap:5px}.admit-line{display:grid;grid-template-columns:88px 1fr;align-items:end}.admit-line span{font-weight:700}.admit-line b{font-weight:900;border-bottom:1px dotted #111;min-height:16px;padding:0 4px 2px}.admit-signs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;position:absolute;left:4mm;right:4mm;bottom:3mm;text-align:center}.signature-img{display:block;margin:0 auto 1px;width:58px;height:25px;object-fit:contain}.signature-dots{height:25px;display:flex;align-items:end;justify-content:center;font-size:11px}.admit-sign-cell small{display:block;font-size:8px;line-height:1.15}.sign-name{font-weight:700}</style></head><body><div class="admit-grid">${cards}</div><script>setTimeout(()=>window.print(),300)<\/script></body></html>`);w.document.close();
}

/* Ensure dashboard/control nav additions are active after re-render */
window.selectFeeReceiveStudent=selectFeeReceiveStudent;
/* ==================== END V8 LOCAL TEST IMPROVEMENTS ==================== */

/* ==================== V9 TWO PRIORITY FIXES ====================
   1) Fee Receive: true autocomplete -> exact student selection -> one selectedStudentId source of truth.
   2) School phone number on A5 Fee Receipt + Reminder Letter.
   Keeps existing localStorage DB key/data unchanged.
*/
let feeReceiveV9Context={year:'',className:''};

function clearFeeReceiveSelectedStudentV9(){
  paymentState.studentId='';
  paymentState.selectedMonths=[];
  paymentState.discount=0;
  paymentState.paid=0;
  if($('#payReg'))$('#payReg').value='';
  if($('#payHost'))$('#payHost').innerHTML='<div class="section premium-section"><div class="empty">Type a student name and select the exact student from the search results.</div></div>';
}

function renderFeePayment(){
  if(!isAccountant())return unauthorized();
  const keepYear=feeReceiveV9Context.year||getYear();
  const keepClass=feeReceiveV9Context.className||'';
  paymentState={year:keepYear,className:keepClass,studentId:'',selectedMonths:[],date:workingDate(),mode:'Cash',bankId:'',discount:0,paid:0};
  $('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Fee Receive</h3><p>Year → Class → type Student Name → select the exact student → Month(s).</p></div><div class="next-number"><small>Next Receipt</small><b>${esc(nextReceiptNo(false))}</b></div></div><div class="form-grid three"><div><label>Academic Year</label><select id="payYear">${yearsOptions(keepYear)}</select></div><div><label>Class</label><select id="payClass">${classesOptions()}</select></div><div class="student-search-field"><label>Student</label><input id="payStudentSearch" type="text" autocomplete="off" placeholder="Select class, then type student name"><div id="payStudentResults" class="student-search-results hidden"></div></div><div><label>Nepali Date</label><input id="payDate" value="${esc(workingDate())}" placeholder="2083-05-26"></div><div><label>Payment Mode</label><select id="payMode"><option>Cash</option><option>Bank</option></select></div><div id="payBankWrap" class="hidden"><label>Bank Account</label><select id="payBank">${bankOptions()}</select></div><div><label>Registration No.</label><input id="payReg" readonly></div></div></div><div id="payHost"><div class="section premium-section"><div class="empty">Select a class, then search and select a student.</div></div></div>`;
  $('#payClass').value=CLASSES.includes(keepClass)?keepClass:'';
  paymentState.className=$('#payClass').value;
  feeReceiveV9Context={year:String($('#payYear').value||''),className:String($('#payClass').value||'')};
  const input=$('#payStudentSearch');
  input.disabled=!$('#payClass').value;
  input.placeholder=$('#payClass').value?'Type student name (e.g. Sagar)':'Select class first';
  $('#payClass').onchange=resetFeeReceiveStudents;
  $('#payYear').onchange=resetFeeReceiveStudents;
  input.oninput=()=>{
    // Any typing/editing invalidates the previous selected student immediately.
    if(paymentState.studentId)clearFeeReceiveSelectedStudentV9();
    drawFeeReceiveStudentResults();
  };
  input.onfocus=drawFeeReceiveStudentResults;
  input.onkeydown=e=>{
    if(e.key==='Escape'){$('#payStudentResults')?.classList.add('hidden');return;}
    if(e.key==='Enter'){
      const first=$('#payStudentResults .student-search-option');
      if(first){e.preventDefault();first.click();}
    }
  };
  input.onblur=()=>setTimeout(()=>$('#payStudentResults')?.classList.add('hidden'),220);
  $('#payDate').oninput=e=>paymentState.date=e.target.value;
  $('#payMode').onchange=e=>{paymentState.mode=e.target.value;$('#payBankWrap').classList.toggle('hidden',e.target.value!=='Bank');if(e.target.value!=='Bank')paymentState.bankId='';};
  $('#payBank').onchange=e=>paymentState.bankId=e.target.value;
}

function resetFeeReceiveStudents(){
  const y=String($('#payYear')?.value||''),c=String($('#payClass')?.value||'');
  feeReceiveV9Context={year:y,className:c};
  paymentState.year=y;paymentState.className=c;
  clearFeeReceiveSelectedStudentV9();
  const input=$('#payStudentSearch');
  if(input){input.disabled=!c;input.value='';input.placeholder=c?'Type student name (e.g. Sagar)':'Select class first';}
  const results=$('#payStudentResults');if(results){results.innerHTML='';results.classList.add('hidden');}
  if(!c&&$('#payHost'))$('#payHost').innerHTML='<div class="section premium-section"><div class="empty">Select a class first.</div></div>';
}

function feeReceiveStudents(){
  const y=String($('#payYear')?.value||''),c=String($('#payClass')?.value||'');
  return (db.students||[]).filter(s=>String(s.year)===y&&String(s.className)===c&&s.active!==false).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
}

function drawFeeReceiveStudentResults(){
  const host=$('#payStudentResults'),input=$('#payStudentSearch');
  if(!host||!input||input.disabled)return;
  const q=input.value.trim().toLowerCase();
  let arr=feeReceiveStudents();
  if(q){
    arr=arr.filter(s=>String(s.name||'').toLowerCase().includes(q)).sort((a,b)=>{
      const an=String(a.name||'').toLowerCase(),bn=String(b.name||'').toLowerCase();
      const aa=an.startsWith(q)?0:1,bb=bn.startsWith(q)?0:1;
      return aa-bb||an.localeCompare(bn);
    });
  }
  arr=arr.slice(0,100);
  host.innerHTML=arr.length?arr.map(s=>`<button type="button" class="student-search-option" data-student-id="${esc(s.id)}" onclick="selectFeeReceiveStudent('${esc(s.id)}')"><b>${esc(s.name)}</b><small>${esc(s.guardian||s.fatherName||s.motherName||'')}</small></button>`).join(''):'<div class="student-search-empty">No matching student in this Year / Class.</div>';
  host.classList.remove('hidden');
}

function selectFeeReceiveStudent(id){
  const y=String($('#payYear')?.value||''),c=String($('#payClass')?.value||'');
  const s=(db.students||[]).find(x=>String(x.id)===String(id)&&String(x.year)===y&&String(x.className)===c&&x.active!==false);
  if(!s){clearFeeReceiveSelectedStudentV9();return toast('Student could not be loaded. Please search again.');}
  // Clear old record first, then set exactly one source of truth: selectedStudentId.
  clearFeeReceiveSelectedStudentV9();
  paymentState.year=y;paymentState.className=c;paymentState.studentId=s.id;
  feeReceiveV9Context={year:y,className:c};
  $('#payStudentSearch').value=s.name;
  $('#payStudentResults').classList.add('hidden');
  drawPayPanel();
}

function drawPayPanel(){
  const y=String(paymentState.year||$('#payYear')?.value||''),c=String(paymentState.className||$('#payClass')?.value||''),selectedId=String(paymentState.studentId||'');
  const s=(db.students||[]).find(x=>String(x.id)===selectedId&&String(x.year)===y&&String(x.className)===c&&x.active!==false);
  paymentState.selectedMonths=[];paymentState.discount=0;paymentState.paid=0;
  if(!s){clearFeeReceiveSelectedStudentV9();return;}
  $('#payReg').value=s.registrationNo||'';
  const months=NP_MONTHS.map((m,i)=>`<label class="month-box ${isMonthClosed(s,y,i)?'processed':''}"><input class="payMonth" type="checkbox" value="${i}" ${isMonthClosed(s,y,i)?'disabled':''}>${m}${isMonthClosed(s,y,i)?' — Processed':''}</label>`).join('');
  $('#payHost').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>${esc(s.name)} — ${esc(s.className)}</h3><p><b>Registration:</b> ${esc(s.registrationNo||'')} &nbsp; · &nbsp; <b>Guardian:</b> ${esc(s.guardian||s.fatherName||s.motherName||'-')} &nbsp; · &nbsp; <b>Current Dues:</b> ${money(s.dues)}</p></div></div><div class="month-grid">${months}</div></div><div id="payCalc"></div>`;
  $$('.payMonth').forEach(box=>box.onchange=()=>{paymentState.selectedMonths=$$('.payMonth:checked').map(x=>num(x.value));drawPaymentCalc();});
  drawPaymentCalc();
}

function savePayment(){
  const s=(db.students||[]).find(x=>String(x.id)===String(paymentState.studentId||''));
  const y=paymentState.year;
  if(!s)return toast('Select the exact student from the search results first.');
  if(String(s.year)!==String(y)||String(s.className)!==String(paymentState.className))return toast('Student selection changed. Please select the student again.');
  if(!npDateValid(paymentState.date))return toast('Enter Nepali date as YYYY-MM-DD.');
  if(paymentState.mode==='Bank'&&!paymentState.bankId)return toast('Select the bank account that received this payment.');
  const items=currentPayItems(s,y,paymentState.selectedMonths),currentTotal=sum(items,x=>x.amount),oldDues=num(s.dues),grand=currentTotal+oldDues,discount=Math.min(num(paymentState.discount),grand),net=Math.max(0,grand-discount),paid=num(paymentState.paid),balance=Math.max(0,net-paid),advance=Math.max(0,paid-net);
  if(!items.length&&oldDues<=0)return toast('Select at least one payable month.');
  const receipt={id:uid('rcp'),receiptNo:nextReceiptNo(true),date:paymentState.date,year:y,studentId:s.id,masterId:studentMasterId(s),registrationNo:s.registrationNo,studentName:s.name,className:s.className,guardian:s.guardian||s.fatherName||s.motherName||'',months:[...paymentState.selectedMonths],items,oldDues,currentTotal,grandTotal:grand,discount,netPayable:net,paid,balance,advance,mode:paymentState.mode,bankId:paymentState.mode==='Bank'?paymentState.bankId:'',issuedBy:db.settings.issuedBy};
  db.receipts.push(receipt);closeMonths(s,y,paymentState.selectedMonths);s.dues=balance;s.advance=num(s.advance)+advance;saveDB();
  // Keep the same Year/Class ready so the next student's fee can be received immediately.
  feeReceiveV9Context={year:y,className:s.className};
  showReceiptById(receipt.id,true);toast('Payment saved. Search and select the next student when ready.');renderFeePayment();
}

/* A5 Fee Receipt: school phone is always part of the contact header. */
function receiptHTML(r){
  const logo=db.settings.logoData?`<img src="${db.settings.logoData}" alt="Logo">`:`<div style="font-weight:900;font-size:22px">SA</div>`;
  const phone=esc(db.settings.phone||'—');
  return `<div class="a5-receipt a5-bordered" id="printReceipt"><div class="receipt-head"><div class="receipt-school tight-header"><h1>${esc(db.settings.schoolName)}</h1><p>${esc(db.settings.address)}</p><p><b>Phone:</b> ${phone}</p><p><b>ESTD:</b> ${esc(db.settings.estd||'')} &nbsp; <b>PAN No.:</b> ${esc(db.settings.pan||'')}</p></div><div class="receipt-logo">${logo}</div></div><div class="receipt-title">FEE RECEIPT</div><div class="receipt-meta"><div><b>Receipt No.:</b> ${esc(r.receiptNo)}</div><div><b>Nepali Date:</b> ${esc(r.date)}</div><div><b>Registration No.:</b> ${esc(r.registrationNo)}</div><div><b>Class:</b> ${esc(r.className)}</div><div><b>Student Name:</b> ${esc(r.studentName)}</div><div><b>Parent/Guardian:</b> ${esc(r.guardian||'')}</div><div style="grid-column:1/-1"><b>Fee For Month(s):</b> ${esc((r.months||[]).map(i=>NP_MONTHS[i]).join(', ')||'-')}</div></div><div class="receipt-olddues"><b>Old Dues:</b> ${num(r.oldDues)>0?money(r.oldDues):''}</div><table class="receipt-table"><thead><tr><th style="width:7%">S.N.</th><th>Particular</th><th style="width:20%">Total Amount</th><th style="width:20%">Receive Amount</th><th style="width:18%">Balance</th></tr></thead><tbody>${(r.items||[]).map((i,idx)=>`<tr><td class="center">${idx+1}</td><td>${esc(i.label)}</td><td class="num">${money(i.amount)}</td><td></td><td></td></tr>`).join('')||`<tr><td class="center">1</td><td>Old Dues Payment</td><td class="num">${money(r.oldDues)}</td><td></td><td></td></tr>`}</tbody></table><table class="receipt-summary"><tr><td>Total Amount</td><td>${money(r.currentTotal)}</td></tr><tr><td>Dues</td><td>${num(r.oldDues)>0?money(r.oldDues):''}</td></tr><tr><td><b>Grand Total</b></td><td><b>${money(r.netPayable)}</b></td></tr><tr><td>Received Amount</td><td>${money(r.paid)}</td></tr><tr><td>Balance</td><td>${money(r.balance)}</td></tr></table><div class="amount-words"><b>Amount in Words:</b> ${esc(amountInWords(r.paid))} only.</div><div class="receipt-note">Bill is essential to get the deposit refunded.</div><div class="receipt-sign"><div class="sign-block left">Issued by: <b>${esc(db.settings.issuedBy||r.issuedBy||'')}</b></div><div class="sign-block">Accountant</div></div><div class="receipt-foot">Phone: ${phone} · Nepali Date: ${esc(r.date)}</div></div>`;
}

/* Reminder Letter: same saved school phone number appears in every slip. */
function printOutstanding(){
  const rows=selectedOutstandingRows();if(!rows.length)return toast('Select at least one student before printing reminder letters.');
  const y=$('#outYear').value,to=NP_MONTHS[num($('#outTo').value)],logo=db.settings.logoData?`<img src="${db.settings.logoData}" class="reminder-logo">`:'',qr=db.settings.reminderQRData?`<img src="${db.settings.reminderQRData}" class="reminder-qr" alt="Payment QR">`:'';
  const schoolPhone=esc(db.settings.phone||'—');
  const slipHTML=x=>`<div class="slip"><div class="reminder-head">${logo}<div class="reminder-school"><div class="reminder-school-name">${esc(db.settings.schoolName)}</div><div class="reminder-address">${esc(db.settings.address)}</div><div class="reminder-phone"><b>Phone:</b> ${schoolPhone}</div><div class="reminder-title">${esc(db.settings.remindHeader||'Fee Reminder')}</div></div></div><div class="student-row"><b>${esc(x.s.name)}</b> · ${esc(x.s.className)} · Reg: ${esc(x.s.registrationNo)}</div><div class="small-row"><b>Guardian:</b> ${esc(x.s.guardian||x.s.fatherName||x.s.motherName||'')} &nbsp; <b>Period:</b> Up to ${to}, ${y}</div><table class="slip-detail"><thead><tr><th>Particular</th><th>Months</th><th>Rate</th><th>Total</th></tr></thead><tbody>${x.grouped.map(g=>`<tr><td>${esc(g.label)}</td><td>${esc(g.months.join(', '))}</td><td>${money(g.perAmount)}</td><td>${money(g.total)}</td></tr>`).join('')}${num(x.old)>0?`<tr><td>Old Dues</td><td>-</td><td>-</td><td>${money(x.old)}</td></tr>`:''}</tbody></table><div class="grand">Grand Total: ${money(x.total)}</div><div class="message">${esc(reminderReplacement(db.settings.reminderTemplate,x))}</div><div class="bottom"><div class="online">${esc(reminderReplacement(db.settings.reminderOnlineNote,x))}${db.settings.reminderWhatsApp?`<div class="whatsapp">WhatsApp: ${esc(db.settings.reminderWhatsApp)}</div>`:''}</div>${qr}</div></div>`;
  const pages=[];for(let i=0;i<rows.length;i+=4)pages.push(`<section class="reminder-page">${rows.slice(i,i+4).map(slipHTML).join('')}</section>`);const w=window.open('','_blank','width=1000,height=920');
  w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#111}.reminder-page{height:287mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:3mm;page-break-after:always}.reminder-page:last-child{page-break-after:auto}.slip{border:1px solid #333;border-radius:4px;padding:2.7mm;min-height:0;overflow:hidden;display:flex;flex-direction:column}.reminder-head{display:flex;align-items:center;gap:2.2mm;border-bottom:1px solid #9eb7c9;padding-bottom:1.1mm;margin-bottom:1.2mm}.reminder-logo{width:10mm;height:10mm;object-fit:contain;flex:0 0 auto}.reminder-school{min-width:0;text-align:center;flex:1}.reminder-school-name{font-size:10.8px;font-weight:900;color:#124d7a;white-space:nowrap;line-height:1.06}.reminder-address,.reminder-phone{font-size:7px;line-height:1.08}.reminder-title{font-size:8.5px;font-weight:900;color:#a91c1c;margin-top:1px}.student-row{font-size:8.4px;margin-bottom:.8mm}.small-row{font-size:7.3px;margin-bottom:1mm}.slip-detail{width:100%;border-collapse:collapse;font-size:7.1px;table-layout:fixed}.slip-detail th,.slip-detail td{border:1px solid #aaa;padding:.85mm;vertical-align:top;word-break:break-word}.slip-detail th:nth-child(1){width:35%}.slip-detail th:nth-child(2){width:30%}.slip-detail th:nth-child(3),.slip-detail th:nth-child(4){width:17.5%;text-align:right}.slip-detail td:nth-child(3),.slip-detail td:nth-child(4){text-align:right}.grand{text-align:right;font-size:8.8px;font-weight:900;margin-top:1mm}.message,.online{font-size:6.9px;line-height:1.13;white-space:pre-wrap}.message{margin-top:1mm}.bottom{display:flex;align-items:flex-end;justify-content:space-between;gap:2mm;margin-top:auto;padding-top:.7mm}.online{flex:1}.whatsapp{font-weight:700;margin-top:.6mm}.reminder-qr{width:22mm;height:22mm;object-fit:contain;border:1px solid #ddd;background:#fff;padding:.7mm;flex:0 0 auto}@media print{.reminder-page{break-after:page}.reminder-page:last-child{break-after:auto}}</style></head><body>${pages.join('')}<script>setTimeout(()=>window.print(),350)<\/script></body></html>`);w.document.close();
}

window.selectFeeReceiveStudent=selectFeeReceiveStudent;
/* ==================== END V9 TWO PRIORITY FIXES ==================== */

/* ==================== V10 CRITICAL STUDENT IDENTITY REPAIR ====================
   Root fix for legacy/localStorage records where multiple student rows can share,
   miss, or carry stale IDs/master IDs. Selection now uses a dedicated recordKey.
*/
function studentIdentityText(v){return String(v??'').trim().toLowerCase().replace(/\s+/g,' ')}
function ensureStudentRecordKey(s){
  if(!s)return '';
  if(!s.recordKey){s.recordKey=uid('srec');}
  return String(s.recordKey);
}
function studentByRecordKey(key){
  const k=String(key||'');
  return (db.students||[]).find(s=>String(ensureStudentRecordKey(s))===k) || null;
}
function repairStudentIdentityV10(){
  const students=db.students||[];
  let changed=false;
  const snapshots=students.map((s,index)=>({
    s,index,
    oldId:String(s.id||''),
    oldMaster:String(s.masterId||''),
    year:String(s.year||''),
    reg:String(s.registrationNo||''),
    name:String(s.name||''),
    cls:String(s.className||'')
  }));

  // 1) Every visible student row gets a persistent, unique UI record key.
  const usedRecordKeys=new Set();
  students.forEach(s=>{
    let rk=String(s.recordKey||'').trim();
    if(!rk||usedRecordKeys.has(rk)){rk=uid('srec');s.recordKey=rk;changed=true;}
    usedRecordKeys.add(rk);
  });

  // 2) Repair missing/duplicate database student IDs.
  const usedIds=new Set();
  snapshots.forEach(x=>{
    let id=String(x.s.id||'').trim();
    if(!id||usedIds.has(id)){id=uid('stu');x.s.id=id;changed=true;}
    usedIds.add(id);
    x.newId=id;
  });

  // 3) Rebuild person/master identity from Registration No. so two different
  // students can never become linked merely because a legacy ID was duplicated.
  const masterByPerson=new Map();
  students.forEach(s=>{
    const reg=String(s.registrationNo||'').trim();
    const personKey=reg?`reg:${reg}`:`rec:${ensureStudentRecordKey(s)}`;
    if(!masterByPerson.has(personKey))masterByPerson.set(personKey,String(s.id));
    const wanted=masterByPerson.get(personKey);
    if(String(s.masterId||'')!==wanted){s.masterId=wanted;changed=true;}
  });

  const oldGroups=new Map();
  snapshots.forEach(x=>{
    const k=x.oldId;
    if(!oldGroups.has(k))oldGroups.set(k,[]);
    oldGroups.get(k).push(x.s);
  });

  function findReceiptStudent(r){
    const ry=String(r.year||yearOfDate(r.date)||'');
    const rr=String(r.registrationNo||'').trim();
    const rn=studentIdentityText(r.studentName);
    const rc=String(r.className||'').trim();
    let c=students.filter(s=>!ry||String(s.year||'')===ry);
    if(rr){const m=c.filter(s=>String(s.registrationNo||'').trim()===rr);if(m.length===1)return m[0];if(m.length)c=m;}
    if(rc){const m=c.filter(s=>String(s.className||'').trim()===rc);if(m.length)c=m;}
    if(rn){const m=c.filter(s=>studentIdentityText(s.name)===rn);if(m.length===1)return m[0];if(m.length)c=m;}
    const old=oldGroups.get(String(r.studentId||''))||[];
    if(old.length===1)return old[0];
    if(c.length===1)return c[0];
    return null;
  }

  // 4) Re-link receipts using the human-visible identity saved on each receipt.
  (db.receipts||[]).forEach(r=>{
    const target=findReceiptStudent(r);
    if(target){
      if(String(r.studentId||'')!==String(target.id)){r.studentId=target.id;changed=true;}
      const m=studentMasterId(target);
      if(String(r.masterId||'')!==String(m)){r.masterId=m;changed=true;}
    }
  });

  // 5) Re-link overrides when the legacy ID points unambiguously to one student
  // in the override's academic year. Ambiguous old overrides are left untouched
  // rather than assigning them to the wrong child.
  (db.overrides||[]).forEach(o=>{
    const old=oldGroups.get(String(o.studentId||''))||[];
    const yearMatches=old.filter(s=>String(s.year||'')===String(o.year||''));
    const target=yearMatches.length===1?yearMatches[0]:(old.length===1?old[0]:null);
    if(target&&String(o.studentId)!==String(target.id)){o.studentId=target.id;changed=true;}
  });

  db.identityRepairVersion=10;
  if(changed)saveDB();
  else if(!localStorage.getItem(DB_KEY))saveDB();
  return changed;
}

// Fee Card now selects by recordKey, never by a possibly-corrupt legacy id.
function renderStudentSearch(){
  if(!isAccountant()&&!hasPermission('studentSearch'))return unauthorized();
  $('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Fee Card</h3><p>Select Academic Year → Class → Student to view the exact student record.</p></div></div><div class="toolbar"><div class="field"><label>Academic Year</label><select id="searchYear"><option value="">Select Year</option>${yearsOptions()}</select></div><div class="field"><label>Class</label><select id="searchClass" disabled>${classesOptions()}</select></div><div class="field"><label>Student</label><select id="searchStudent" disabled><option value="">Select Student</option></select></div></div><div id="studentReportHost" style="margin-top:14px"></div></div>`;
  $('#searchYear').onchange=()=>{const y=$('#searchYear').value;$('#searchClass').disabled=!y;$('#searchClass').value='';$('#searchStudent').innerHTML='<option value="">Select Student</option>';$('#searchStudent').disabled=true;$('#studentReportHost').innerHTML='';};
  $('#searchClass').onchange=()=>{
    const y=String($('#searchYear').value||''),c=String($('#searchClass').value||''),arr=(db.students||[]).filter(s=>String(s.year)===y&&String(s.className)===c&&s.active!==false);
    $('#searchStudent').innerHTML='<option value="">Select Student</option>'+arr.map(s=>`<option value="${esc(ensureStudentRecordKey(s))}">${esc(s.registrationNo)} - ${esc(s.name)}</option>`).join('');
    $('#searchStudent').disabled=!c;$('#studentReportHost').innerHTML='';saveDB();
  };
  $('#searchStudent').onchange=drawStudentReport;
}

function drawStudentReport(){
  const s=studentByRecordKey($('#searchStudent')?.value),y=String($('#searchYear')?.value||'');
  if(!s){if($('#studentReportHost'))$('#studentReportHost').innerHTML='';return;}
  const ids=linkedStudentIds(s);
  const receipts=(db.receipts||[]).filter(r=>ids.includes(r.studentId)&&String(r.year)===y).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.receiptNo).localeCompare(String(b.receiptNo)));
  const rows=receipts.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.receiptNo)}</td><td>${esc((r.months||[]).map(i=>NP_MONTHS[i]).join(', '))}</td><td>${(r.items||[]).map(i=>`${esc(i.label)}: ${money(i.amount)}`).join('<br>')}</td><td class="amount">${money(r.grandTotal)}</td><td class="amount">${money(r.discount)}</td><td class="amount">${money(r.paid)}</td><td class="amount">${money(r.balance)}</td><td>${isAccountant()?`<button class="btn small" onclick="showReceiptById('${r.id}')">View</button> <button class="btn small" onclick="printReceipt('${r.id}')">Print</button> <button class="btn small" onclick="openReceiptEdit('${r.id}')">Edit</button> <button class="btn small red" onclick="deleteReceipt('${r.id}')">Delete</button>`:'View only'}</td></tr>`).join('');
  $('#studentReportHost').innerHTML=`<div class="summary-strip"><div class="summary-box"><small>Registration</small><strong>${esc(s.registrationNo)}</strong></div><div class="summary-box"><small>Student</small><strong>${esc(s.name)}</strong></div><div class="summary-box"><small>Class</small><strong>${esc(s.className)}</strong></div><div class="summary-box"><small>Guardian</small><strong>${esc(s.guardian||s.fatherName||s.motherName||'-')}</strong></div><div class="summary-box"><small>Current Dues</small><strong class="stat-red">${money(s.dues)}</strong></div></div>${isAccountant()?`<div class="section premium-section"><div class="section-title"><div><h3>Scholarship</h3><p>Month-wise student-specific fee adjustment. Paid fee items stay locked; newly-added unpaid fee items remain editable.</p></div><button class="btn primary" onclick="openScholarshipMatrix('${s.id}','${y}')">Open Scholarship Matrix</button></div><div class="card-note">Changes here affect only ${esc(s.name)}. Master Fee Structure and other students remain unchanged.</div></div>`:''}<div class="section premium-section"><div class="section-title"><div><h3>Transaction History</h3></div></div>${receipts.length?`<div class="table-wrap"><table><thead><tr><th>Nepali Date</th><th>Receipt No.</th><th>Fee Months</th><th>Fee Details</th><th class="amount">Grand Total</th><th class="amount">Discount</th><th class="amount">Received</th><th class="amount">Dues After</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="empty">No transactions for this student.</div>`}</div><div class="section premium-section"><div class="section-title"><div><h3>Month-wise Ledger</h3></div></div>${ledgerTable(s,y)}</div>`;
}

function openLedgerDirect(studentId){
  const s=studentById(studentId);if(!s)return;navigate('studentSearch');
  setTimeout(()=>{const y=$('#searchYear'),c=$('#searchClass'),st=$('#searchStudent');if(y&&c&&st){y.value=s.year;y.dispatchEvent(new Event('change'));c.value=s.className;c.dispatchEvent(new Event('change'));st.value=ensureStudentRecordKey(s);st.dispatchEvent(new Event('change'));}},0);
}

// Fee Receive search results also use recordKey so duplicate legacy IDs cannot
// cause "Sujata selected but Sara loaded".
function drawFeeReceiveStudentResults(){
  const host=$('#payStudentResults'),input=$('#payStudentSearch');
  if(!host||!input||input.disabled)return;
  const q=input.value.trim().toLowerCase();
  let arr=feeReceiveStudents();
  if(q){arr=arr.filter(s=>studentIdentityText(s.name).includes(q)).sort((a,b)=>{const an=studentIdentityText(a.name),bn=studentIdentityText(b.name),aa=an.startsWith(q)?0:1,bb=bn.startsWith(q)?0:1;return aa-bb||an.localeCompare(bn);});}
  arr=arr.slice(0,100);
  host.innerHTML=arr.length?arr.map(s=>`<button type="button" class="student-search-option" data-student-key="${esc(ensureStudentRecordKey(s))}" onclick="selectFeeReceiveStudent('${esc(ensureStudentRecordKey(s))}')"><b>${esc(s.name)}</b><small>${esc(s.guardian||s.fatherName||s.motherName||'')}</small></button>`).join(''):'<div class="student-search-empty">No matching student in this Year / Class.</div>';
  host.classList.remove('hidden');saveDB();
}

function selectFeeReceiveStudent(recordKey){
  const y=String($('#payYear')?.value||''),c=String($('#payClass')?.value||'');
  const s=studentByRecordKey(recordKey);
  if(!s||String(s.year)!==y||String(s.className)!==c||s.active===false){clearFeeReceiveSelectedStudentV9();return toast('Student could not be loaded. Please search again.');}
  clearFeeReceiveSelectedStudentV9();
  paymentState.year=y;paymentState.className=c;paymentState.studentId=s.id;paymentState.studentRecordKey=ensureStudentRecordKey(s);
  feeReceiveV9Context={year:y,className:c};
  $('#payStudentSearch').value=s.name;
  $('#payStudentResults').classList.add('hidden');
  drawPayPanel();
}

function drawPayPanel(){
  const y=String(paymentState.year||$('#payYear')?.value||''),c=String(paymentState.className||$('#payClass')?.value||'');
  const s=paymentState.studentRecordKey?studentByRecordKey(paymentState.studentRecordKey):(db.students||[]).find(x=>String(x.id)===String(paymentState.studentId||''));
  paymentState.selectedMonths=[];paymentState.discount=0;paymentState.paid=0;
  if(!s||String(s.year)!==y||String(s.className)!==c||s.active===false){clearFeeReceiveSelectedStudentV9();return;}
  paymentState.studentId=s.id;paymentState.studentRecordKey=ensureStudentRecordKey(s);
  $('#payReg').value=s.registrationNo||'';
  const months=NP_MONTHS.map((m,i)=>`<label class="month-box ${isMonthClosed(s,y,i)?'processed':''}"><input class="payMonth" type="checkbox" value="${i}" ${isMonthClosed(s,y,i)?'disabled':''}>${m}${isMonthClosed(s,y,i)?' — Processed':''}</label>`).join('');
  $('#payHost').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>${esc(s.name)} — ${esc(s.className)}</h3><p><b>Registration:</b> ${esc(s.registrationNo||'')} &nbsp; · &nbsp; <b>Guardian:</b> ${esc(s.guardian||s.fatherName||s.motherName||'-')} &nbsp; · &nbsp; <b>Current Dues:</b> ${money(s.dues)}</p></div></div><div class="month-grid">${months}</div></div><div id="payCalc"></div>`;
  $$('.payMonth').forEach(box=>box.onchange=()=>{paymentState.selectedMonths=$$('.payMonth:checked').map(x=>num(x.value));drawPaymentCalc();});
  drawPaymentCalc();
}

function clearFeeReceiveSelectedStudentV9(){
  paymentState.studentId='';paymentState.studentRecordKey='';paymentState.selectedMonths=[];paymentState.discount=0;paymentState.paid=0;
  if($('#payReg'))$('#payReg').value='';
  if($('#payHost'))$('#payHost').innerHTML='<div class="section premium-section"><div class="empty">Type a student name and select the exact student from the search results.</div></div>';
}

repairStudentIdentityV10();
window.selectFeeReceiveStudent=selectFeeReceiveStudent;
/* ==================== END V10 CRITICAL STUDENT IDENTITY REPAIR ==================== */

/* ==================== V11 RECEIPT DISCOUNT + SIGNATURE FIX ====================
   1) Discounted fee receipts use only the actual cash/bank received amount.
   2) Printed Grand Total stays as the gross charge; discount remains hidden.
   3) Footer signature lines follow the requested print layout.
*/
function v11ReceiptGross(r){
  const current=num(r.currentTotal!=null?r.currentTotal:sum(r.items||[],x=>x.amount));
  const old=num(r.oldDues);
  return num(r.grandTotal!=null?r.grandTotal:(current+old));
}
function v11ReceiptNet(r){return Math.max(0,v11ReceiptGross(r)-Math.max(0,num(r.discount)));}
function v11ActualReceived(r){
  const paid=Math.max(0,num(r.paid));
  const net=v11ReceiptNet(r);
  return num(r.discount)>0?Math.min(paid,net):paid;
}

function drawPaymentCalc(){
  const s=paymentState.studentRecordKey?studentByRecordKey(paymentState.studentRecordKey):studentById(paymentState.studentId),y=paymentState.year;if(!s)return;
  const items=currentPayItems(s,y,paymentState.selectedMonths),currentTotal=sum(items,x=>x.amount),oldDues=num(s.dues),grand=currentTotal+oldDues;
  let discount=Math.min(Math.max(0,num(paymentState.discount)),grand),net=Math.max(0,grand-discount);
  if(paymentState.paid===0 && (items.length||oldDues>0)) paymentState.paid=net;
  if(discount>0 && num(paymentState.paid)>net) paymentState.paid=net;
  $('#payCalc').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Selected Fee Details</h3><p>Discount accepts any amount such as 50, 350 or 1000.</p></div></div>${items.length?`<div class="payment-lines">${items.map(i=>`<div class="payment-line"><div class="month">${i.month}</div><div class="label">${esc(i.label)}${i.overridden?' <span class="chip">Scholarship</span>':''}</div><div class="amt">${money(i.amount)}</div></div>`).join('')}</div>`:`<div class="empty">Select one or more open months.</div>`}<div class="totals-panel polished-totals" style="margin-top:12px"><div class="row"><span>Current Fee Total</span><b>${money(currentTotal)}</b></div><div class="row"><span>Old Dues</span><b>${money(oldDues)}</b></div><div class="row"><span>Discount</span><input id="payDiscount" inputmode="decimal" type="number" min="0" step="1" value="${num(paymentState.discount)}"></div><div class="row grand"><span>Net Payable</span><b id="payNet">${money(net)}</b></div><div class="row"><span>Received Amount</span><input id="payPaid" inputmode="decimal" type="number" min="0" step="1" value="${num(paymentState.paid)}"></div><div class="row"><span>New Dues / Balance</span><b id="payNewDues" class="stat-red">${money(Math.max(0,net-num(paymentState.paid)))}</b></div><div class="row"><span>Advance</span><b id="payAdvance">${money(Math.max(0,num(paymentState.paid)-net))}</b></div></div><div class="form-actions" style="margin-top:14px"><button class="btn primary big" id="savePayment" ${paymentState.selectedMonths.length||oldDues>0?'':'disabled'}>Save & Print Receipt</button></div></div>`;
  $('#payDiscount').oninput=()=>{
    paymentState.discount=Math.min(Math.max(0,num($('#payDiscount').value)),grand);
    const n=Math.max(0,grand-paymentState.discount);
    // When a discount is entered, the default/maximum receipt amount becomes the net amount.
    if(paymentState.discount>0) paymentState.paid=Math.min(n, num(paymentState.paid)||n);
    else if(num(paymentState.paid)===0) paymentState.paid=n;
    $('#payPaid').value=paymentState.paid;
    $('#payNet').textContent=money(n);
    $('#payNewDues').textContent=money(Math.max(0,n-paymentState.paid));
    $('#payAdvance').textContent=money(Math.max(0,paymentState.paid-n));
  };
  $('#payPaid').oninput=()=>{
    const n=Math.max(0,grand-Math.min(Math.max(0,num($('#payDiscount').value)),grand));
    let p=Math.max(0,num($('#payPaid').value));
    if(num($('#payDiscount').value)>0 && p>n){p=n;$('#payPaid').value=p;}
    paymentState.paid=p;
    $('#payNewDues').textContent=money(Math.max(0,n-p));
    $('#payAdvance').textContent=money(Math.max(0,p-n));
  };
  $('#savePayment').onclick=savePayment;
}

function savePayment(){
  const s=paymentState.studentRecordKey?studentByRecordKey(paymentState.studentRecordKey):(db.students||[]).find(x=>String(x.id)===String(paymentState.studentId||''));
  const y=paymentState.year;
  if(!s)return toast('Select the exact student from the search results first.');
  if(String(s.year)!==String(y)||String(s.className)!==String(paymentState.className))return toast('Student selection changed. Please select the student again.');
  if(!npDateValid(paymentState.date))return toast('Enter Nepali date as YYYY-MM-DD.');
  if(paymentState.mode==='Bank'&&!paymentState.bankId)return toast('Select the bank account that received this payment.');
  const items=currentPayItems(s,y,paymentState.selectedMonths),currentTotal=sum(items,x=>x.amount),oldDues=num(s.dues),grand=currentTotal+oldDues,discount=Math.min(Math.max(0,num(paymentState.discount)),grand),net=Math.max(0,grand-discount);
  let paid=Math.max(0,num(paymentState.paid));
  if(discount>0) paid=Math.min(paid||net,net);
  const balance=Math.max(0,net-paid),advance=Math.max(0,paid-net);
  if(!items.length&&oldDues<=0)return toast('Select at least one payable month.');
  const receipt={id:uid('rcp'),receiptNo:nextReceiptNo(true),date:paymentState.date,year:y,studentId:s.id,masterId:studentMasterId(s),registrationNo:s.registrationNo,studentName:s.name,className:s.className,guardian:s.guardian||s.fatherName||s.motherName||'',months:[...paymentState.selectedMonths],items,oldDues,currentTotal,grandTotal:grand,discount,netPayable:net,paid,balance,advance,mode:paymentState.mode,bankId:paymentState.mode==='Bank'?paymentState.bankId:'',issuedBy:db.settings.issuedBy};
  db.receipts.push(receipt);closeMonths(s,y,paymentState.selectedMonths);s.dues=balance;s.advance=num(s.advance)+advance;saveDB();
  feeReceiveV9Context={year:y,className:s.className};
  showReceiptById(receipt.id,true);toast('Payment saved. Receipt amount reflects the amount actually received after discount.');renderFeePayment();
}

function recalculateStudentState(student,year){
  student.closedMonths=student.closedMonths||{};student.closedMonths[year]=[];student.dues=num(student.openingDues);student.advance=0;
  const receipts=(db.receipts||[]).filter(r=>r.studentId===student.id&&String(r.year)===String(year)).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.receiptNo).localeCompare(String(b.receiptNo)));
  receipts.forEach(r=>{
    r.oldDues=num(student.dues);r.currentTotal=sum(r.items||[],x=>x.amount);r.grandTotal=num(r.oldDues)+num(r.currentTotal);r.discount=Math.min(Math.max(0,num(r.discount)),r.grandTotal);r.netPayable=Math.max(0,num(r.grandTotal)-num(r.discount));
    if(num(r.discount)>0&&num(r.paid)>num(r.netPayable))r.paid=num(r.netPayable);
    r.balance=Math.max(0,num(r.netPayable)-num(r.paid));r.advance=Math.max(0,num(r.paid)-num(r.netPayable));closeMonths(student,year,r.months||[]);student.dues=num(r.balance);student.advance+=num(r.advance);
  });
  saveDB();
}

function openReceiptEdit(id){
  const r=receiptById(id);if(!r||!isAccountant())return;
  openModal('EDIT RECEIPT',`Edit ${r.receiptNo}`,`<form id="receiptEditForm" class="form-grid"><div><label>Receipt No.</label><input value="${esc(r.receiptNo)}" readonly></div><div><label>Nepali Date</label><input name="date" value="${esc(r.date)}"></div><div><label>Payment Mode</label><select name="mode" id="editReceiptMode"><option ${r.mode==='Cash'?'selected':''}>Cash</option><option ${r.mode==='Bank'?'selected':''}>Bank</option></select></div><div id="editReceiptBankWrap" class="${r.mode==='Bank'?'':'hidden'}"><label>Bank Account</label><select name="bankId">${bankOptions(r.bankId||'')}</select></div><div><label>Discount Amount</label><input name="discount" id="editDiscount" type="number" min="0" step="1" value="${num(r.discount)}"></div><div><label>Received Amount</label><input name="paid" id="editPaid" type="number" min="0" step="1" value="${v11ActualReceived(r)}"></div><div class="full"><label>Student</label><input value="${esc(r.studentName)} - ${esc(r.className)}" readonly></div><div class="full form-actions"><button type="button" class="btn" onclick="showReceiptById('${r.id}')">Back</button><button class="btn primary">Save Changes</button></div></form>`);
  const f=$('#receiptEditForm');$('#editReceiptMode').onchange=e=>$('#editReceiptBankWrap').classList.toggle('hidden',e.target.value!=='Bank');
  $('#editDiscount').oninput=()=>{const gross=v11ReceiptGross(r),d=Math.min(Math.max(0,num($('#editDiscount').value)),gross),n=Math.max(0,gross-d);if(d>0&&num($('#editPaid').value)>n)$('#editPaid').value=n;};
  f.onsubmit=e=>{e.preventDefault();const fd=new FormData(f);if(!npDateValid(fd.get('date')))return toast('Enter Nepali date as YYYY-MM-DD.');if(fd.get('mode')==='Bank'&&!fd.get('bankId'))return toast('Select a bank.');r.date=fd.get('date');r.mode=fd.get('mode');r.bankId=r.mode==='Bank'?fd.get('bankId'):'';r.discount=Math.min(Math.max(0,num(fd.get('discount'))),v11ReceiptGross(r));r.netPayable=Math.max(0,v11ReceiptGross(r)-r.discount);r.paid=Math.max(0,num(fd.get('paid')));if(r.discount>0)r.paid=Math.min(r.paid,r.netPayable);r.balance=Math.max(0,r.netPayable-r.paid);r.advance=Math.max(0,r.paid-r.netPayable);const s=studentById(r.studentId);if(s)recalculateStudentState(s,r.year);saveDB();closeModal();showReceiptById(id);toast('Receipt updated.');};
}

function receiptHTML(r){
  const logo=db.settings.logoData?`<img src="${db.settings.logoData}" alt="Logo">`:`<div style="font-weight:900;font-size:22px">SA</div>`;
  const phone=esc(db.settings.phone||'—');
  const gross=v11ReceiptGross(r),net=v11ReceiptNet(r),received=v11ActualReceived(r),balance=Math.max(0,net-received);
  return `<div class="a5-receipt a5-bordered" id="printReceipt"><div class="receipt-head"><div class="receipt-school tight-header"><h1>${esc(db.settings.schoolName)}</h1><p>${esc(db.settings.address)}</p><p><b>Phone:</b> ${phone}</p><p><b>ESTD:</b> ${esc(db.settings.estd||'')} &nbsp; <b>PAN No.:</b> ${esc(db.settings.pan||'')}</p></div><div class="receipt-logo">${logo}</div></div><div class="receipt-title">FEE RECEIPT</div><div class="receipt-meta"><div><b>Receipt No.:</b> ${esc(r.receiptNo)}</div><div><b>Nepali Date:</b> ${esc(r.date)}</div><div><b>Registration No.:</b> ${esc(r.registrationNo)}</div><div><b>Class:</b> ${esc(r.className)}</div><div><b>Student Name:</b> ${esc(r.studentName)}</div><div><b>Parent/Guardian:</b> ${esc(r.guardian||'')}</div><div style="grid-column:1/-1"><b>Fee For Month(s):</b> ${esc((r.months||[]).map(i=>NP_MONTHS[i]).join(', ')||'-')}</div></div><div class="receipt-olddues"><b>Old Dues:</b> ${num(r.oldDues)>0?money(r.oldDues):''}</div><table class="receipt-table"><thead><tr><th style="width:7%">S.N.</th><th>Particular</th><th style="width:20%">Total Amount</th><th style="width:20%">Receive Amount</th><th style="width:18%">Balance</th></tr></thead><tbody>${(r.items||[]).map((i,idx)=>`<tr><td class="center">${idx+1}</td><td>${esc(i.label)}</td><td class="num">${money(i.amount)}</td><td></td><td></td></tr>`).join('')||`<tr><td class="center">1</td><td>Old Dues Payment</td><td class="num">${money(r.oldDues)}</td><td></td><td></td></tr>`}</tbody></table><table class="receipt-summary"><tr><td>Total Amount</td><td>${money(r.currentTotal)}</td></tr><tr><td>Dues</td><td>${num(r.oldDues)>0?money(r.oldDues):''}</td></tr><tr><td><b>Grand Total</b></td><td><b>${money(gross)}</b></td></tr><tr><td>Received Amount</td><td>${money(received)}</td></tr><tr><td>Balance</td><td>${money(balance)}</td></tr></table><div class="amount-words"><b>Amount in Words:</b> ${esc(amountInWords(received))} only.</div><div class="receipt-note">Bill is essential to get the deposit refunded.</div><div class="receipt-sign v11-sign"><div class="sign-block left issued-by-no-line">Issued by: <b>${esc(db.settings.issuedBy||r.issuedBy||'')}</b></div><div class="sign-block accountant-dotted"><span></span><div>Accountant</div></div></div><div class="receipt-foot">Phone: ${phone} · Nepali Date: ${esc(r.date)}</div></div>`;
}

function repairDiscountReceiptsV11(){
  let changed=false;const affected=new Set();
  (db.receipts||[]).forEach(r=>{
    const gross=v11ReceiptGross(r),discount=Math.min(Math.max(0,num(r.discount)),gross),net=Math.max(0,gross-discount);
    r.grandTotal=gross;r.discount=discount;r.netPayable=net;
    if(discount>0&&num(r.paid)>net){r.paid=net;r.advance=0;changed=true;affected.add(`${r.studentId}|||${r.year}`);}
    const b=Math.max(0,net-num(r.paid));if(num(r.balance)!==b){r.balance=b;changed=true;affected.add(`${r.studentId}|||${r.year}`);}
  });
  if(changed){
    affected.forEach(k=>{const [sid,year]=k.split('|||'),s=studentById(sid);if(s)recalculateStudentState(s,year);});
    saveDB();
  }
  db.receiptDiscountRepairVersion=11;saveDB();
}
repairDiscountReceiptsV11();
/* ==================== END V11 RECEIPT DISCOUNT + SIGNATURE FIX ==================== */

/* ==================== V12 ITEM-LEVEL FEE PROCESSING ====================
   Requirement:
   - A paid month is NOT permanently sealed against newly-created fee heads.
   - Only fee items already present in a saved receipt are treated as processed.
   - A new Fee Head/Fee Plan (or Transportation Fee after route assignment)
     can therefore appear automatically in an earlier month for every eligible
     student, even when other fee items from that month were already paid.
   - Existing receipts stay unchanged.
   - Scholarship can change a newly-added unpaid item in a previously-paid month.
========================================================================== */

function v12NormText(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ');}
function v12CurrentItemKey(type,refId,monthIndex,label=''){
  const mi=Number(monthIndex);
  if(type==='transport') return `transport|${mi}`; // route may change later; transport for a month is one accounting item
  if(refId) return `fee|${String(refId)}|${mi}`;
  return `label|${v12NormText(label)}|${mi}`;
}
function v12ReceiptItemKeys(student,year){
  const keys=new Set();
  const ids=typeof linkedStudentIds==='function'?linkedStudentIds(student):[student.id];
  (db.receipts||[]).filter(r=>String(r.year)===String(year)&&ids.includes(r.studentId)).forEach(r=>{
    (r.items||[]).forEach(it=>{
      let mi=(it.monthIndex===0||it.monthIndex)?Number(it.monthIndex):null;
      if((mi===null||Number.isNaN(mi))&&it.month){const x=NP_MONTHS.indexOf(it.month);if(x>=0)mi=x;}
      if((mi===null||Number.isNaN(mi))&&(r.months||[]).length===1)mi=Number(r.months[0]);
      if(mi===null||Number.isNaN(mi))return;
      const type=it.type||(/transport/i.test(String(it.label||''))?'transport':'fee');
      if(type==='transport'){
        keys.add(`transport|${mi}`);
        return;
      }
      if(it.refId)keys.add(`fee|${String(it.refId)}|${mi}`);
      if(it.label)keys.add(`label|${v12NormText(it.label)}|${mi}`);
    });
  });
  return keys;
}
function v12ItemProcessed(student,year,monthIndex,itemOrType,refId='',label=''){
  const item=typeof itemOrType==='object'?itemOrType:{type:itemOrType,refId,label};
  const keys=v12ReceiptItemKeys(student,year);
  if(item.type==='transport')return keys.has(`transport|${Number(monthIndex)}`);
  const idKey=item.refId?`fee|${String(item.refId)}|${Number(monthIndex)}`:'';
  const labelKey=`label|${v12NormText(item.label||label)}|${Number(monthIndex)}`;
  return (!!idKey&&keys.has(idKey))||keys.has(labelKey);
}
function v12ApplicableCharges(student,year,monthIndex){
  return monthCharges(student,year,monthIndex).map(x=>({...x,monthIndex:Number(monthIndex),month:NP_MONTHS[Number(monthIndex)]}));
}
function v12UnpaidMonthCharges(student,year,monthIndex){
  return v12ApplicableCharges(student,year,monthIndex).filter(x=>num(x.amount)>0&&!v12ItemProcessed(student,year,monthIndex,x));
}
function v12MonthState(student,year,monthIndex){
  const all=v12ApplicableCharges(student,year,monthIndex).filter(x=>num(x.amount)>0);
  const unpaid=all.filter(x=>!v12ItemProcessed(student,year,monthIndex,x));
  const paid=all.filter(x=>v12ItemProcessed(student,year,monthIndex,x));
  return {all,unpaid,paid,noCharge:all.length===0,processed:all.length>0&&unpaid.length===0,partial:paid.length>0&&unpaid.length>0};
}

// Existing code calls this everywhere. It now means "no unpaid applicable item remains".
function isMonthClosed(student,year,idx){
  const st=v12MonthState(student,year,idx);
  return st.noCharge||st.processed;
}

// Fee Receive must never recharge items that were already included in an older receipt.
function currentPayItems(s,y,months){
  const rows=[];
  (months||[]).forEach(mi=>v12UnpaidMonthCharges(s,y,Number(mi)).forEach(i=>rows.push(i)));
  return rows;
}

function studentOpenDueThrough(student,year,toIdx,fromIdx=0){
  let total=num(student.dues);
  for(let i=Number(fromIdx);i<=Number(toIdx);i++)total+=sum(v12UnpaidMonthCharges(student,year,i),x=>x.amount);
  return total;
}

function drawPayPanel(){
  const y=String(paymentState.year||$('#payYear')?.value||''),c=String(paymentState.className||$('#payClass')?.value||'');
  const s=paymentState.studentRecordKey?studentByRecordKey(paymentState.studentRecordKey):(db.students||[]).find(x=>String(x.id)===String(paymentState.studentId||''));
  paymentState.selectedMonths=[];paymentState.discount=0;paymentState.paid=0;
  if(!s||String(s.year)!==y||String(s.className)!==c||s.active===false){clearFeeReceiveSelectedStudentV9();return;}
  paymentState.studentId=s.id;paymentState.studentRecordKey=ensureStudentRecordKey(s);
  $('#payReg').value=s.registrationNo||'';
  const months=NP_MONTHS.map((m,i)=>{
    const st=v12MonthState(s,y,i),pending=sum(st.unpaid,x=>x.amount);
    if(st.noCharge)return `<label class="month-box processed no-charge"><input class="payMonth" type="checkbox" value="${i}" disabled>${m} — No Charge</label>`;
    if(st.processed)return `<label class="month-box processed"><input class="payMonth" type="checkbox" value="${i}" disabled>${m} — Processed</label>`;
    const note=st.partial?` — New/Pending ${money(pending)}`:(pending>0?` — ${money(pending)}`:'');
    return `<label class="month-box ${st.partial?'pending-new':''}"><input class="payMonth" type="checkbox" value="${i}">${m}${note}</label>`;
  }).join('');
  $('#payHost').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>${esc(s.name)} — ${esc(s.className)}</h3><p><b>Registration:</b> ${esc(s.registrationNo||'')} &nbsp; · &nbsp; <b>Guardian:</b> ${esc(s.guardian||s.fatherName||s.motherName||'-')} &nbsp; · &nbsp; <b>Current Dues:</b> ${money(s.dues)}</p></div></div><div class="month-grid">${months}</div><div class="card-note" style="margin-top:10px"><b>Rule:</b> A previously paid month can reopen only for a newly-added unpaid fee item. Already-paid items are never charged again.</div></div><div id="payCalc"></div>`;
  $$('.payMonth').forEach(box=>box.onchange=()=>{paymentState.selectedMonths=$$('.payMonth:checked').map(x=>num(x.value));drawPaymentCalc();});
  drawPaymentCalc();
}

// Reminder / dues report also uses only unpaid fee items, including newly-added past fees.
function outstandingRows(){
  const y=$('#outYear')?.value||getYear(),classes=selectedValuesByName('outClassCheck'),f=num($('#outFrom')?.value),t=num($('#outTo')?.value);
  if(!classes.length)return[];
  return (db.students||[]).filter(s=>s.year===y&&classes.includes(s.className)&&s.active!==false).map(s=>{
    const items=[];
    for(let i=f;i<=t;i++)v12UnpaidMonthCharges(s,y,i).forEach(x=>items.push({...x,month:NP_MONTHS[i]}));
    const grouped=groupedOutstandingItems(items),open=sum(items,x=>x.amount),old=num(s.dues),total=open+old;
    return{s,items,grouped,old,open,total};
  }).filter(x=>x.total>=0);
}

function ledgerTable(s,y){
  return `<div class="table-wrap"><table><thead><tr><th>Month</th><th>Status</th><th>Applicable Charges</th><th class="amount">Pending</th></tr></thead><tbody>${NP_MONTHS.map((m,i)=>{
    const st=v12MonthState(s,y,i);
    let status=st.noCharge?'<span class="chip">No Charge</span>':st.processed?'<span class="chip good">Processed</span>':st.partial?'<span class="chip warn">Partly Processed · New Fee Pending</span>':'<span class="chip blue">Open</span>';
    const lines=st.all.map(x=>{const paid=v12ItemProcessed(s,y,i,x);return `${esc(x.label)} ${x.overridden?'<span class="chip">Scholarship</span>':''}: ${money(x.amount)} ${paid?'<span class="chip good">Paid</span>':num(x.amount)>0?'<span class="chip warn">Pending</span>':'<span class="chip">Zero</span>'}`;}).join('<br>')||'-';
    return `<tr><td>${m}</td><td>${status}</td><td>${lines}</td><td class="amount">${money(sum(st.unpaid,x=>x.amount))}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function openScholarshipMatrix(studentId,year){
  const s=studentById(studentId);if(!s||!isAccountant())return;const rows=scholarshipRows(s,year);
  openModal('FEE CARD',`Scholarship — ${s.name}`,`<div class="info"><b>Scholarship rule:</b> Only the exact fee item already received is locked. If a new fee is later added to an old month, that new item stays editable until it is received.</div><div class="scholarship-wrap"><table class="scholarship-table"><thead><tr><th>Fee Head</th>${NP_MONTHS.map(m=>`<th>${m}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><th>${esc(row.label)}</th>${NP_MONTHS.map((m,mi)=>{
    const base=scholarshipBaseAmount(s,year,mi,row.type,row.refId),ov=overrideFor(s.id,year,mi,row.type,row.refId),effective=ov?num(ov.amount):base;
    if(base===null)return '<td class="na-cell">0</td>';
    const locked=v12ItemProcessed(s,year,mi,{type:row.type,refId:row.refId,label:row.label});
    return `<td class="${locked?'locked-cell':''}"><input class="schCell" data-type="${row.type}" data-ref="${row.refId}" data-label="${esc(row.label)}" data-month="${mi}" data-base="${base}" type="number" min="0" step="1" value="${num(effective)}" ${locked?'disabled title="This exact fee item was already received"':''}>${locked?'<span class="mini-lock">PAID</span>':''}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div><div class="form-actions scholarship-actions"><button class="btn red" id="removeScholarship">Remove Unpaid Scholarship Changes</button><button class="btn" onclick="closeModal()">Close</button><button class="btn primary" id="saveScholarship">Save & Apply Scholarship</button></div>`);
  $('#saveScholarship').onclick=()=>{
    $$('.schCell:not(:disabled)').forEach(inp=>{const type=inp.dataset.type,refId=inp.dataset.ref,mi=num(inp.dataset.month),base=num(inp.dataset.base),val=Math.max(0,num(inp.value)),existing=overrideFor(s.id,year,mi,type,refId);if(Math.abs(val-base)<.0001){if(existing)db.overrides=db.overrides.filter(o=>o.id!==existing.id);}else if(existing){existing.amount=val;existing.reason='Scholarship';}else db.overrides.push({id:uid('ov'),studentId:s.id,year,monthIndex:mi,type,refId,amount:val,reason:'Scholarship'});});
    saveDB();closeModal();drawStudentReport();toast('Scholarship applied.');
  };
  $('#removeScholarship').onclick=()=>{
    if(!confirm('Remove scholarship changes from all unpaid fee items?'))return;
    db.overrides=db.overrides.filter(o=>{
      if(!(o.studentId===s.id&&String(o.year)===String(year)))return true;
      const label=o.type==='transport'?'Transportation Fee':(feeHeadById(o.refId)?.name||'');
      return v12ItemProcessed(s,year,o.monthIndex,{type:o.type,refId:o.refId,label});
    });
    saveDB();closeModal();drawStudentReport();toast('Unpaid scholarship changes removed.');
  };
}

// Refresh Fee Card helper text to match the new item-level rule.
const v12DrawStudentReportBase=drawStudentReport;
drawStudentReport=function(){
  v12DrawStudentReportBase();
  const note=$('#studentReportHost .section-title p');
  // Do not rely on this selector for functionality; it is only a wording refresh.
};

// Mark migration/version only; no mass data rewrite is needed because receipts themselves
// are the audit source used to determine which fee items were already processed.
db.itemLevelFeeVersion=12;saveDB();
/* ==================== END V12 ITEM-LEVEL FEE PROCESSING ==================== */


/* ==================== FINAL CLEAN V13 PATCH ====================
   Final local clean build requested by user:
   - New localStorage key starts operational data at zero.
   - A5 receipt: no duplicate Nepali Date in footer; school name blue + bold.
   - Outstanding/Reminder: no student rows until at least one class is selected.
   - Fee Receive: Cash/Bank selector always visible; Bank Account selector activates for Bank.
   - Direct bank receipts flow into the selected bank and appear in Daily Collection.
*/

function receiptHTML(r){
  const logo=db.settings.logoData?`<img src="${db.settings.logoData}" alt="Logo">`:`<div style="font-weight:900;font-size:22px">SA</div>`;
  const phone=esc(db.settings.phone||'—');
  const gross=typeof v11ReceiptGross==='function'?v11ReceiptGross(r):num(r.grandTotal||r.netPayable);
  const received=typeof v11ActualReceived==='function'?v11ActualReceived(r):num(r.paid);
  const balance=Math.max(0,num(r.netPayable)-received);
  return `<div class="a5-receipt a5-bordered" id="printReceipt"><div class="receipt-head"><div class="receipt-school tight-header"><h1 class="final-school-name">${esc(db.settings.schoolName)}</h1><p>${esc(db.settings.address)}</p><p><b>Phone:</b> ${phone}</p><p><b>ESTD:</b> ${esc(db.settings.estd||'')} &nbsp; <b>PAN No.:</b> ${esc(db.settings.pan||'')}</p></div><div class="receipt-logo">${logo}</div></div><div class="receipt-title">FEE RECEIPT</div><div class="receipt-meta"><div><b>Receipt No.:</b> ${esc(r.receiptNo)}</div><div><b>Nepali Date:</b> ${esc(r.date)}</div><div><b>Registration No.:</b> ${esc(r.registrationNo)}</div><div><b>Class:</b> ${esc(r.className)}</div><div><b>Student Name:</b> ${esc(r.studentName)}</div><div><b>Parent/Guardian:</b> ${esc(r.guardian||'')}</div><div style="grid-column:1/-1"><b>Fee For Month(s):</b> ${esc((r.months||[]).map(i=>NP_MONTHS[i]).join(', ')||'-')}</div></div><div class="receipt-olddues"><b>Old Dues:</b> ${num(r.oldDues)>0?money(r.oldDues):''}</div><table class="receipt-table"><thead><tr><th style="width:7%">S.N.</th><th>Particular</th><th style="width:20%">Total Amount</th><th style="width:20%">Receive Amount</th><th style="width:18%">Balance</th></tr></thead><tbody>${(r.items||[]).map((i,idx)=>`<tr><td class="center">${idx+1}</td><td>${esc(i.label)}</td><td class="num">${money(i.amount)}</td><td></td><td></td></tr>`).join('')||`<tr><td class="center">1</td><td>Old Dues Payment</td><td class="num">${money(r.oldDues)}</td><td></td><td></td></tr>`}</tbody></table><table class="receipt-summary"><tr><td>Total Amount</td><td>${money(r.currentTotal)}</td></tr><tr><td>Dues</td><td>${num(r.oldDues)>0?money(r.oldDues):''}</td></tr><tr><td><b>Grand Total</b></td><td><b>${money(gross)}</b></td></tr><tr><td>Received Amount</td><td>${money(received)}</td></tr><tr><td>Balance</td><td>${money(balance)}</td></tr></table><div class="amount-words"><b>Amount in Words:</b> ${esc(amountInWords(received))} only.</div><div class="receipt-note">Bill is essential to get the deposit refunded.</div><div class="receipt-sign v11-sign"><div class="sign-block left issued-by-no-line">Issued by: <b>${esc(db.settings.issuedBy||r.issuedBy||'')}</b></div><div class="sign-block accountant-dotted"><span></span><div>Accountant</div></div></div><div class="receipt-foot">Phone: ${phone}</div></div>`;
}

function renderFeePayment(){
  if(!isAccountant())return unauthorized();
  const keepYear=feeReceiveV9Context?.year||getYear();
  const keepClass=feeReceiveV9Context?.className||'';
  paymentState={year:keepYear,className:keepClass,studentId:'',studentRecordKey:'',selectedMonths:[],date:workingDate(),mode:'Cash',bankId:'',discount:0,paid:0};
  $('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Fee Receive</h3><p>Year → Class → type Student Name → select the exact student → Month(s).</p></div><div class="next-number"><small>Next Receipt</small><b>${esc(nextReceiptNo(false))}</b></div></div><div class="form-grid three"><div><label>Academic Year</label><select id="payYear">${yearsOptions(keepYear)}</select></div><div><label>Class</label><select id="payClass">${classesOptions()}</select></div><div class="student-search-field"><label>Student</label><input id="payStudentSearch" type="text" autocomplete="off" placeholder="Select class, then type student name"><div id="payStudentResults" class="student-search-results hidden"></div></div><div><label>Nepali Date</label><input id="payDate" value="${esc(workingDate())}" placeholder="2083-05-26"></div><div><label>Payment Mode</label><select id="payMode"><option value="Cash">Cash</option><option value="Bank">Bank</option></select></div><div id="payBankWrap"><label>Bank Account</label><select id="payBank" disabled>${bankOptions()}</select><div class="student-search-hint" id="payBankHint">Choose Bank mode to receive directly into a school bank account.</div></div><div><label>Registration No.</label><input id="payReg" readonly></div></div></div><div id="payHost"><div class="section premium-section"><div class="empty">Select a class, then search and select a student.</div></div></div>`;
  $('#payClass').value=CLASSES.includes(keepClass)?keepClass:'';
  paymentState.className=$('#payClass').value;
  feeReceiveV9Context={year:String($('#payYear').value||''),className:String($('#payClass').value||'')};
  const input=$('#payStudentSearch');
  input.disabled=!$('#payClass').value;
  input.placeholder=$('#payClass').value?'Type student name (e.g. Sagar)':'Select class first';
  $('#payClass').onchange=resetFeeReceiveStudents;
  $('#payYear').onchange=resetFeeReceiveStudents;
  input.oninput=()=>{if(paymentState.studentId||paymentState.studentRecordKey)clearFeeReceiveSelectedStudentV9();drawFeeReceiveStudentResults();};
  input.onfocus=drawFeeReceiveStudentResults;
  input.onkeydown=e=>{if(e.key==='Escape'){$('#payStudentResults')?.classList.add('hidden');return;}if(e.key==='Enter'){const first=$('#payStudentResults .student-search-option');if(first){e.preventDefault();first.click();}}};
  input.onblur=()=>setTimeout(()=>$('#payStudentResults')?.classList.add('hidden'),220);
  $('#payDate').oninput=e=>paymentState.date=e.target.value;
  const bankSelect=$('#payBank'),bankHint=$('#payBankHint');
  $('#payMode').onchange=e=>{
    paymentState.mode=e.target.value;
    const isBank=e.target.value==='Bank';
    bankSelect.disabled=!isBank;
    if(!isBank){paymentState.bankId='';bankSelect.value='';bankHint.textContent='Choose Bank mode to receive directly into a school bank account.';}
    else if(!activeBanks().length){bankHint.textContent='No active bank account. Add one from Banking Transactions / Settings first.';toast('No active bank account. Add a bank account first.');}
    else{bankHint.textContent='Select the bank where the parent deposited the fee.';}
  };
  bankSelect.onchange=e=>paymentState.bankId=e.target.value;
}

function renderOutstanding(){
  if(!isAccountant()&&!hasPermission('outstanding'))return unauthorized();
  $('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Outstanding / Reminder</h3><p>First select one or more classes. Students appear only after class selection.</p></div><div class="toolbar"><button class="btn green" id="outExport">Export Excel</button>${isAccountant()?'<button class="btn primary" id="outPrint" disabled>Print Selected — 4 Slips / A4</button>':''}</div></div><div class="toolbar"><div class="field"><label>Academic Year</label><select id="outYear">${yearsOptions(getYear())}</select></div><div class="field"><label>From Month</label><select id="outFrom">${NP_MONTHS.map((m,i)=>`<option value="${i}">${m}</option>`).join('')}</select></div><div class="field"><label>Up To Month</label><select id="outTo">${NP_MONTHS.map((m,i)=>`<option value="${i}" ${i===2?'selected':''}>${m}</option>`).join('')}</select></div><button class="btn cyan" id="outPreview">Preview Report</button></div><div class="class-filter-panel"><div class="filter-head">Class — select first</div>${checkGroup('outClassCheck',CLASSES,[])}</div><div id="outHost" style="margin-top:12px"><div class="empty">Select a class first. Student names will appear only after class selection.</div></div></div>`;
  const refresh=()=>{const selected=selectedValuesByName('outClassCheck');if(!selected.length){$('#outHost').innerHTML='<div class="empty">Select a class first. Student names will appear only after class selection.</div>';const b=$('#outPrint');if(b)b.disabled=true;return;}drawOutstanding();};
  $('#outPreview').onclick=refresh;
  $('#outExport').onclick=()=>{if(!selectedValuesByName('outClassCheck').length)return toast('Select at least one class first.');exportOutstanding();};
  if(isAccountant())$('#outPrint').onclick=printOutstanding;
  $$('input[name="outClassCheck"]').forEach(x=>{x.checked=false;x.onchange=refresh;});
  $('#outYear').onchange=refresh;$('#outFrom').onchange=refresh;$('#outTo').onchange=refresh;
}

function drawDailyCollection(){
  const rows=dailyRows(),heads=dailyHeads(rows);const cols=heads.map(h=>`<th class="amount">${esc(h)}</th>`).join('');
  const data=rows.map(r=>`<tr><td>${r.date}</td><td>${esc(r.receiptNo)}</td><td>${esc(r.studentName)}</td><td>${esc(r.className)}</td>${heads.map(h=>`<td class="amount">${itemTotalByLabel(r,h)?money(itemTotalByLabel(r,h)):'-'}</td>`).join('')}<td class="amount">${money(r.currentTotal)}</td><td class="amount">${money(r.discount)}</td><td class="amount">${money(r.paid)}</td><td class="amount">${money(r.balance)}</td><td class="amount">${r.mode==='Cash'?money(r.paid):'-'}</td><td>${r.mode==='Bank'?esc(bankLabel(r.bankId)):'-'}</td><td class="amount">${r.mode==='Bank'?money(r.paid):'-'}</td></tr>`).join('');
  const total=`<tr class="total-row"><td colspan="4"><b>TOTAL</b></td>${heads.map(h=>`<td class="amount">${money(sum(rows,r=>itemTotalByLabel(r,h)))}</td>`).join('')}<td class="amount">${money(sum(rows,r=>r.currentTotal))}</td><td class="amount">${money(sum(rows,r=>r.discount))}</td><td class="amount">${money(sum(rows,r=>r.paid))}</td><td class="amount">${money(sum(rows,r=>r.balance))}</td><td class="amount">${money(sum(rows,r=>r.mode==='Cash'?r.paid:0))}</td><td><b>Direct Bank</b></td><td class="amount">${money(sum(rows,r=>r.mode==='Bank'?r.paid:0))}</td></tr>`;
  $('#dailyHost').innerHTML=rows.length?`<div class="table-wrap cyan-table"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Student</th><th>Class</th>${cols}<th class="amount">Total Fees</th><th class="amount">Discount</th><th class="amount">Received</th><th class="amount">Dues</th><th class="amount">Cash</th><th>Bank Account</th><th class="amount">Bank Received</th></tr></thead><tbody>${data}${total}</tbody></table></div>`:`<div class="empty">No fee receipts in this date range.</div>`;
}
function exportDailyCollection(){
  const rows=dailyRows(),heads=dailyHeads(rows),headers=['Date','Receipt No','Student','Class',...heads,'Total Fees','Discount','Received','Dues','Cash','Bank Account','Bank Received'],data=rows.map(r=>[r.date,r.receiptNo,r.studentName,r.className,...heads.map(h=>itemTotalByLabel(r,h)),r.currentTotal,r.discount,r.paid,r.balance,r.mode==='Cash'?r.paid:0,r.mode==='Bank'?bankLabel(r.bankId):'',r.mode==='Bank'?r.paid:0]);
  data.push(['TOTAL','','','',...heads.map(h=>sum(rows,r=>itemTotalByLabel(r,h))),sum(rows,r=>r.currentTotal),sum(rows,r=>r.discount),sum(rows,r=>r.paid),sum(rows,r=>r.balance),sum(rows,r=>r.mode==='Cash'?r.paid:0),'',sum(rows,r=>r.mode==='Bank'?r.paid:0)]);
  exportXLS('Daily_Collection.xls',headers,data,'Daily Collection / Fees Day Book');
}

/* Ensure a brand-new final build starts with no operational data. */
db.banks=db.banks||[];db.bankTransactions=db.bankTransactions||[];db.archivedStudents=db.archivedStudents||[];
window.selectFeeReceiveStudent=selectFeeReceiveStudent;
/* ==================== END FINAL CLEAN V13 PATCH ==================== */


/* ==================== ONLINE LOGIN V14 SAFETY PATCH ====================
   Auth is now handled by Supabase. Operational data is still local in this test build.
   Password-change/reset UI is disabled until the full online migration phase.
*/
const _v14RenderSettingsBase = renderSettings;
renderSettings = function(){
  _v14RenderSettingsBase();
  const securityForms=[document.getElementById('changeOwn'),document.getElementById('resetCEO'),document.getElementById('resetMD')].filter(Boolean);
  securityForms.forEach(form=>{
    [...form.elements].forEach(el=>el.disabled=true);
  });
  const first=securityForms[0]?.closest('.section');
  if(first){
    const p=first.querySelector('.section-title p');
    if(p)p.textContent='Online authentication is active. Password changes are managed in Supabase during this migration stage.';
  }
};

/* Keep the selector aligned with the authenticated role after restored sessions. */
if(sb){
  sb.auth.onAuthStateChange((event)=>{
    if(event==='SIGNED_OUT' && session.role){
      session={role:null,page:'dashboard',loginAt:null,lastActivity:null};
      document.getElementById('appView')?.classList.add('hidden');
      document.getElementById('loginView')?.classList.remove('hidden');
    }
  });
}
/* ==================== END ONLINE LOGIN V14 SAFETY PATCH ==================== */

/* ==================== STUDENTS ONLINE V15 ====================
   Phase scope:
   - Supabase Auth remains active from v14.
   - Student Master list/add/edit now uses public.students in Supabase.
   - Student rows are NOT persisted to localStorage.
   - Routes are read from Supabase for safe student route assignment.
   - Fee receipts / fee setup / banking remain migration-stage modules for now.
*/

function v15StudentFromRow(r){
  return {
    id:r.id,
    masterId:r.student_uuid,
    studentUuid:r.student_uuid,
    year:r.academic_year,
    registrationNo:r.registration_no,
    className:r.class_name,
    name:r.student_name,
    roll:r.roll_no||'',
    dobNp:r.dob_np||'',
    gender:r.gender||'',
    caste:r.caste||'',
    category:r.category||'New',
    fatherName:r.father_name||'',
    motherName:r.mother_name||'',
    guardian:r.guardian_name||'',
    mobileNumber:r.mobile_number||'',
    phone:r.phone||'',
    routeId:r.route_id||'',
    openingDues:num(r.opening_dues),
    dues:num(r.dues),
    advance:num(r.advance),
    active:r.active!==false,
    permCountry:r.perm_country||'Nepal',
    permProvince:r.perm_province||'',
    permDistrict:r.perm_district||'',
    permMunicipality:r.perm_municipality||'',
    permWard:r.perm_ward||'',
    tempSameAsPermanent:!!r.temp_same_as_permanent,
    tempCountry:r.temp_country||'Nepal',
    tempProvince:r.temp_province||'',
    tempDistrict:r.temp_district||'',
    tempMunicipality:r.temp_municipality||'',
    tempWard:r.temp_ward||'',
    admitHallNo:r.admit_hall_no||'',
    createdDate:r.created_np_date||'',
    yearEndStatus:r.year_end_status||'',
    yearEndUpdatedTo:r.year_end_updated_to||'',
    archivedNpDate:r.archived_np_date||'',
    archiveReason:r.archive_reason||'',
    archivedAt:r.archived_at||'',
    updatedAt:r.updated_at||''
  };
}

function v15Nullable(value){
  const s=String(value??'').trim();
  return s===''?null:s;
}

async function v15LoadOnlineRoutes(){
  if(!isAccountant()) return;
  const {data,error}=await sb.from('routes')
    .select('route_id,route_name,default_monthly_amount,active')
    .order('route_name',{ascending:true});
  if(error) throw error;
  db.routes=(data||[]).map(r=>({
    id:r.route_id,
    name:r.route_name,
    amount:num(r.default_monthly_amount),
    active:r.active!==false,
    online:true
  }));
}

async function v15LoadOnlineStudents(){
  if(!isAccountant()){
    db.students=[];
    return;
  }
  const {data,error}=await sb.from('students')
    .select('id,created_at,student_uuid,academic_year,registration_no,class_name,student_name,roll_no,dob_np,gender,caste,category,father_name,mother_name,guardian_name,mobile_number,phone,route_id,opening_dues,dues,advance,active,perm_country,perm_province,perm_district,perm_municipality,perm_ward,temp_same_as_permanent,temp_country,temp_province,temp_district,temp_municipality,temp_ward,admit_hall_no,created_np_date,year_end_status,year_end_updated_to,archived_np_date,archive_reason,archived_at,updated_at')
    .eq('active',true)
    .order('academic_year',{ascending:false})
    .order('class_name',{ascending:true})
    .order('student_name',{ascending:true});
  if(error) throw error;
  db.students=(data||[]).map(v15StudentFromRow);
}

async function v15RefreshStudentMaster(){
  if(!isAccountant()){
    db.students=[];
    return;
  }
  await Promise.all([v15LoadOnlineRoutes(),v15LoadOnlineStudents()]);
}

/* Never write online student rows into localStorage during this migration. */
const _v15SaveDBLocalOnly=saveDB;
saveDB=function(){
  const onlineStudents=db.students;
  try{
    db.students=[];
    _v15SaveDBLocalOnly();
  }finally{
    db.students=onlineStudents;
  }
};

const _v15OpenOnlineSessionBase=openOnlineSession;
openOnlineSession=async function(user,expectedRole=null){
  await _v15OpenOnlineSessionBase(user,expectedRole);
  try{
    await v15RefreshStudentMaster();
    saveDB();
    renderPage();
  }catch(error){
    console.error('Student online load failed:',error);
    db.students=[];
    toast('Login succeeded, but online Students could not load: '+(error?.message||'Unknown error'));
  }
};

/* Safer Student Master row list during phase 1: Fee Card stays for the later receipt phase. */
drawStudentList=function(){
  const rows=filteredStudents();
  $('#studentHost').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Reg. No.</th><th>Student Name</th><th>Class</th><th>Guardian</th><th>Mobile</th><th>Phone</th><th>Nepali DOB</th><th>Route</th><th>Caste</th><th class="amount">Dues</th>${isAccountant()?'<th>Action</th>':''}</tr></thead><tbody>${rows.map(s=>`<tr><td>${esc(s.registrationNo)}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.className)}</td><td>${esc(s.guardian||s.fatherName||s.motherName||'')}</td><td>${esc(s.mobileNumber||'')}</td><td>${esc(s.phone||'')}</td><td>${esc(s.dobNp||'')}</td><td>${esc(routeById(s.routeId)?.name||'')}</td><td>${esc(s.caste||'')}</td><td class="amount ${num(s.dues)>0?'danger-text':''}">${money(s.dues)}</td>${isAccountant()?`<td class="nowrap"><button class="btn small" onclick="openStudentForm('${s.id}')">Edit</button></td>`:''}</tr>`).join('')}</tbody></table></div>`:`<div class="empty">No online students found for this filter.</div>`;
};

const _v15RenderStudentsBase=renderStudents;
renderStudents=function(){
  _v15RenderStudentsBase();
};

async function v15NextRegistrationNo(){
  const {data,error}=await sb.rpc('next_document_number',{p_counter_key:'student_registration'});
  if(error) throw error;
  const value=String(data||'').trim();
  if(!value) throw new Error('Registration number could not be generated.');
  return value;
}

function v15StudentPayloadFromForm(form,existing,registrationNo){
  const fd=new FormData(form);
  const o=Object.fromEntries(fd.entries());
  const same=!!form.elements.tempSameAsPermanent?.checked;
  if(same){
    copyPermanentToTemporary(form);
    o.tempCountry=form.elements.tempCountry.value;
    o.tempProvince=form.elements.tempProvince.value;
    o.tempDistrict=form.elements.tempDistrict.value;
    o.tempMunicipality=form.elements.tempMunicipality.value;
    o.tempWard=form.elements.tempWard.value;
  }
  const opening=Math.max(0,num(o.openingDues));
  const payload={
    academic_year:String(o.year||'').trim(),
    registration_no:registrationNo,
    class_name:String(o.className||'').trim(),
    student_name:String(o.name||'').trim(),
    roll_no:v15Nullable(o.roll),
    dob_np:v15Nullable(o.dobNp),
    gender:v15Nullable(o.gender),
    caste:v15Nullable(o.caste),
    category:(o.category==='Old'?'Old':'New'),
    father_name:v15Nullable(o.fatherName),
    mother_name:v15Nullable(o.motherName),
    guardian_name:v15Nullable(o.guardian),
    mobile_number:v15Nullable(o.mobileNumber),
    phone:v15Nullable(o.phone),
    route_id:v15Nullable(o.routeId),
    opening_dues:opening,
    dues:existing?Math.max(0,num(existing.dues)):opening,
    advance:Math.max(0,num(o.advance)),
    active:true,
    perm_country:v15Nullable(o.permCountry)||'Nepal',
    perm_province:v15Nullable(o.permProvince),
    perm_district:v15Nullable(o.permDistrict),
    perm_municipality:v15Nullable(o.permMunicipality),
    perm_ward:v15Nullable(o.permWard),
    temp_same_as_permanent:same,
    temp_country:v15Nullable(o.tempCountry)||'Nepal',
    temp_province:v15Nullable(o.tempProvince),
    temp_district:v15Nullable(o.tempDistrict),
    temp_municipality:v15Nullable(o.tempMunicipality),
    temp_ward:v15Nullable(o.tempWard),
    admit_hall_no:v15Nullable(existing?.admitHallNo),
    created_np_date:existing?.createdDate||workingDate(),
    year_end_status:v15Nullable(existing?.yearEndStatus),
    year_end_updated_to:v15Nullable(existing?.yearEndUpdatedTo)
  };
  if(!payload.academic_year||!payload.class_name||!payload.student_name){
    throw new Error('Academic Year, Class and Student Name are required.');
  }
  return payload;
}

openStudentForm=function(id=''){
  if(!isAccountant()) return unauthorized();
  const s=id?studentById(id):null;
  const reg=s?.registrationNo||'Generated on Save';
  openModal('STUDENT MASTER',s?'Edit Online Student':'New Online Admission',`
    <form id="studentForm" class="form-grid three"><input type="hidden" name="id" value="${esc(s?.id||'')}">
    <div><label>Academic Year</label><select name="year">${yearsOptions(s?.year||getYear())}</select></div>
    <div><label>Registration No.</label><input name="registrationNo" value="${esc(reg)}" readonly></div>
    <div><label>Class</label><select name="className" required>${classesOptions()}</select></div>
    <div><label>Student Name</label><input name="name" value="${esc(s?.name||'')}" required></div>
    <div><label>Roll No.</label><input name="roll" value="${esc(s?.roll||'')}"></div>
    <div><label>Nepali Date of Birth</label><input name="dobNp" value="${esc(s?.dobNp||'')}" placeholder="2083-01-01"></div>
    <div><label>Gender</label><select name="gender"><option></option><option>Male</option><option>Female</option><option>Other</option></select></div>
    <div><label>Caste</label><input name="caste" value="${esc(s?.caste||'')}"></div>
    <div><label>Category</label><select name="category"><option>New</option><option>Old</option></select></div>
    <div><label>Route</label><select name="routeId"><option value="">No Bus Route</option>${(db.routes||[]).filter(r=>r.active!==false).map(r=>`<option value="${r.id}">${esc(r.name)} (${money(r.amount)}/month)</option>`).join('')}</select></div>
    <div><label>Father Name</label><input name="fatherName" value="${esc(s?.fatherName||'')}"></div>
    <div><label>Mother Name</label><input name="motherName" value="${esc(s?.motherName||'')}"></div>
    <div><label>Guardian Name</label><input name="guardian" value="${esc(s?.guardian||'')}"></div>
    <div><label>Mobile Number</label><input name="mobileNumber" value="${esc(s?.mobileNumber||'')}"></div>
    <div><label>Phone / Emergency Number</label><input name="phone" value="${esc(s?.phone||'')}"></div>
    <div><label>Opening / Old Dues</label><input name="openingDues" type="number" min="0" step="0.01" value="${num(s?.openingDues!=null?s.openingDues:s?.dues)}"></div>
    <div><label>Advance</label><input name="advance" type="number" min="0" step="0.01" value="${num(s?.advance)}"></div>
    ${renderAddressBlock('perm',s)}
    ${renderAddressBlock('temp',s)}
    <div class="full form-actions"><button type="button" class="btn" onclick="closeModal()">Close</button><button class="btn primary" id="onlineStudentSaveBtn">Save Online Student</button></div>
    </form>`);

  const f=$('#studentForm');
  f.elements.className.value=s?.className||'';
  f.elements.gender.value=s?.gender||'';
  f.elements.category.value=s?.category||'New';
  f.elements.routeId.value=s?.routeId||'';
  ['perm','temp'].forEach(prefix=>{
    ['Province','District','Municipality'].forEach(k=>f.elements[prefix+k].dataset.value=s?.[prefix+k]||'');
    fillAddressSelects(f,prefix,true);
    f.elements[prefix+'Province'].value=s?.[prefix+'Province']||'';
    fillAddressSelects(f,prefix,true);
    f.elements[prefix+'District'].value=s?.[prefix+'District']||'';
    fillAddressSelects(f,prefix,true);
    f.elements[prefix+'Municipality'].value=s?.[prefix+'Municipality']||'';
    f.elements[prefix+'Country'].value=s?.[prefix+'Country']||'Nepal';
  });
  ['perm','temp'].forEach(prefix=>{
    f.elements[prefix+'Province'].onchange=()=>fillAddressSelects(f,prefix);
    f.elements[prefix+'District'].onchange=()=>fillAddressSelects(f,prefix);
  });
  const sameCb=f.elements.tempSameAsPermanent;
  if(sameCb) sameCb.onchange=()=>{if(sameCb.checked)copyPermanentToTemporary(f);};
  ['permProvince','permDistrict','permMunicipality','permWard','permCountry'].forEach(name=>{
    if(f.elements[name])f.elements[name].addEventListener('change',()=>{if(f.elements.tempSameAsPermanent?.checked)copyPermanentToTemporary(f);});
  });

  f.onsubmit=async e=>{
    e.preventDefault();
    const btn=$('#onlineStudentSaveBtn');
    const old=btn?.textContent||'Save Online Student';
    if(btn){btn.disabled=true;btn.textContent='Saving...';}
    try{
      if(s){
        const payload=v15StudentPayloadFromForm(f,s,s.registrationNo);
        const {data,error}=await sb.from('students').update(payload).eq('id',s.id).select().single();
        if(error)throw error;
        const mapped=v15StudentFromRow(data);
        const idx=db.students.findIndex(x=>x.id===s.id);
        if(idx>=0)db.students[idx]=mapped;
      }else{
        let saved=null,lastError=null;
        for(let attempt=0;attempt<10&&!saved;attempt++){
          const registrationNo=await v15NextRegistrationNo();
          const payload=v15StudentPayloadFromForm(f,null,registrationNo);
          const {data,error}=await sb.from('students').insert(payload).select().single();
          if(!error){saved=data;break;}
          lastError=error;
          if(error.code!=='23505')throw error;
        }
        if(!saved)throw lastError||new Error('Student could not be saved.');
        db.students.push(v15StudentFromRow(saved));
      }
      saveDB();
      closeModal();
      renderStudents();
      toast('Student saved online successfully.');
    }catch(error){
      console.error('Online student save failed:',error);
      toast('Student save failed: '+(error?.message||'Unknown error'));
    }finally{
      if(btn){btn.disabled=false;btn.textContent=old;}
    }
  };
};

window.openStudentForm=openStudentForm;
window.v15RefreshStudentMaster=v15RefreshStudentMaster;

/* Refresh button also re-fetches central Student Master for Accountant. */
const _v15RefreshButton=document.getElementById('refreshBtn');
if(_v15RefreshButton){
  _v15RefreshButton.onclick=async()=>{
    try{
      if(isAccountant())await v15RefreshStudentMaster();
      renderPage();
      toast('Online data refreshed.');
    }catch(error){
      console.error(error);
      toast('Refresh failed: '+(error?.message||'Unknown error'));
    }
  };
}

/* ==================== END STUDENTS ONLINE V15 ==================== */

/* ==================== ROUTES + FEE STRUCTURE ONLINE V16 ====================
   Phase scope:
   - Routes, yearly Transportation Fee Plans, Fee Heads and Fee Plans now use Supabase.
   - These online master rows are never persisted into localStorage.
   - Accountant can create/edit; MD/CEO still cannot read base operational tables.
   - Fee/transport calculations use the academic-year online plans loaded here.
*/

db.transportPlans=db.transportPlans||[];

function v16MonthsFromDb(value){
  const a=Array.isArray(value)?value.map(Number).filter(Number.isFinite):[];
  if(!a.length)return [];
  // Accounts schema uses Nepali month numbers 1..12. Keep a defensive 0..11 fallback.
  const oneBased=a.every(n=>n>=1&&n<=12);
  return [...new Set((oneBased?a.map(n=>n-1):a).filter(n=>n>=0&&n<12))].sort((x,y)=>x-y);
}
function v16MonthsToDb(value){
  return [...new Set((value||[]).map(Number).filter(n=>n>=0&&n<12).map(n=>n+1))].sort((a,b)=>a-b);
}
function v16MonthChecks(name,selected=[]){
  return `<div class="month-grid">${NP_MONTHS.map((m,i)=>`<label class="month-box"><input type="checkbox" name="${name}" value="${i}" ${selected.includes(i)?'checked':''}>${m}</label>`).join('')}</div>`;
}
function v16SelectedMonths(form,name){
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(x=>num(x.value)).sort((a,b)=>a-b);
}
function v16MonthText(months){return (months||[]).map(i=>NP_MONTHS[i]).join(', ')||'—';}

function v16RouteFromRow(r){return {id:r.route_id,name:r.route_name,amount:num(r.default_monthly_amount),active:r.active!==false,online:true};}
function v16TransportPlanFromRow(r){return {id:r.transport_plan_id,year:r.academic_year,routeId:r.route_id,amount:num(r.monthly_amount),months:v16MonthsFromDb(r.applicable_months),active:r.active!==false,online:true};}
function v16FeeHeadFromRow(r){return {id:r.fee_head_id,name:r.fee_name,feeGroup:r.fee_group||'',accountName:r.account_name||'',frequency:r.frequency||'Monthly',months:v16MonthsFromDb(r.applicable_months),active:r.active!==false,online:true};}
function v16FeePlanFromRow(r){return {id:r.fee_plan_id,year:r.academic_year,headId:r.fee_head_id,classes:Array.isArray(r.class_names)?r.class_names:[],category:r.student_category||'All',amount:num(r.amount),active:r.active!==false,remarks:r.remarks||'',online:true};}

async function v16LoadOnlineFeeSetup(){
  if(!isAccountant()){
    db.routes=[];db.transportPlans=[];db.feeHeads=[];db.feePlans=[];
    return;
  }
  const [routesRes,transportRes,headsRes,plansRes]=await Promise.all([
    sb.from('routes').select('route_id,route_name,default_monthly_amount,active').order('route_name',{ascending:true}),
    sb.from('transport_fee_plans').select('transport_plan_id,academic_year,route_id,monthly_amount,applicable_months,active').order('academic_year',{ascending:false}),
    sb.from('fee_heads').select('fee_head_id,fee_name,fee_group,account_name,frequency,applicable_months,active').order('fee_name',{ascending:true}),
    sb.from('fee_plans').select('fee_plan_id,academic_year,fee_head_id,class_names,student_category,amount,active,remarks').order('academic_year',{ascending:false})
  ]);
  for(const result of [routesRes,transportRes,headsRes,plansRes])if(result.error)throw result.error;
  db.routes=(routesRes.data||[]).map(v16RouteFromRow);
  db.transportPlans=(transportRes.data||[]).map(v16TransportPlanFromRow);
  db.feeHeads=(headsRes.data||[]).map(v16FeeHeadFromRow);
  db.feePlans=(plansRes.data||[]).map(v16FeePlanFromRow);
}

async function v16RefreshFeeSetup(){await v16LoadOnlineFeeSetup();}

/* Keep online masters out of the legacy localStorage payload. */
const _v16SaveDBBase=saveDB;
saveDB=function(){
  const keep={routes:db.routes,transportPlans:db.transportPlans,feeHeads:db.feeHeads,feePlans:db.feePlans};
  try{
    db.routes=[];db.transportPlans=[];db.feeHeads=[];db.feePlans=[];
    _v16SaveDBBase();
  }finally{
    db.routes=keep.routes;db.transportPlans=keep.transportPlans;db.feeHeads=keep.feeHeads;db.feePlans=keep.feePlans;
  }
};

/* Load online fee masters after the v15 online session opens. */
const _v16OpenOnlineSessionBase=openOnlineSession;
openOnlineSession=async function(user,expectedRole=null){
  await _v16OpenOnlineSessionBase(user,expectedRole);
  if(isAccountant()){
    try{
      await v16RefreshFeeSetup();
      renderPage();
    }catch(error){
      console.error('Online Fee Setup load failed:',error);
      toast('Login succeeded, but online Fee Setup could not load: '+(error?.message||'Unknown error'));
    }
  }
};

function transportPlanFor(routeId,year){
  return (db.transportPlans||[]).find(p=>p.routeId===routeId&&String(p.year)===String(year)&&p.active!==false);
}

/* Academic-year-safe online fee calculation. */
applicablePlan=function(student,headId,year){
  return (db.feePlans||[]).find(p=>p.active!==false&&String(p.year)===String(year)&&p.headId===headId&&(p.classes||[]).includes(student.className)&&(p.category==='All'||p.category===student.category));
};
monthCharges=function(student,year,monthIndex){
  const items=[];
  (db.feeHeads||[]).filter(h=>h.active!==false).forEach(h=>{
    if(!(h.months||[]).includes(monthIndex))return;
    const p=applicablePlan(student,h.id,year);if(!p)return;
    const ov=overrideFor(student.id,year,monthIndex,'fee',h.id);
    items.push({type:'fee',refId:h.id,label:h.name,amount:ov?num(ov.amount):num(p.amount),overridden:!!ov});
  });
  const route=routeById(student.routeId);
  const tp=route&&route.active!==false?transportPlanFor(route.id,year):null;
  if(tp&&tp.active!==false&&(tp.months||[]).includes(monthIndex)){
    const ov=overrideFor(student.id,year,monthIndex,'transport',route.id);
    items.push({type:'transport',refId:route.id,label:'Transportation Fee',amount:ov?num(ov.amount):num(tp.amount),overridden:!!ov});
  }
  return items;
};
scholarshipBaseAmount=function(s,y,mi,type,refId){
  if(type==='transport'){
    const tp=transportPlanFor(refId,y);
    return tp&&(tp.months||[]).includes(mi)?num(tp.amount):null;
  }
  const h=feeHeadById(refId);if(!h||h.active===false||!(h.months||[]).includes(mi))return null;
  const p=applicablePlan(s,refId,y);return p?num(p.amount):null;
};
scholarshipRows=function(s,y){
  const rows=[];
  (db.feeHeads||[]).filter(h=>h.active!==false).forEach(h=>{if(applicablePlan(s,h.id,y))rows.push({type:'fee',refId:h.id,label:h.name});});
  const tp=s.routeId?transportPlanFor(s.routeId,y):null;
  if(tp)rows.push({type:'transport',refId:s.routeId,label:'Transportation Fee'});
  return rows;
};

renderFeeStructure=function(){
  if(!isAccountant())return unauthorized();
  $('#content').innerHTML=`
  
  <div class="two-col">
    <div class="section premium-section"><div class="section-title"><div><h3>Route Master</h3><p>Route name + default suggested amount. Actual yearly bus fee is set in Transportation Fee Plan.</p></div><button class="btn primary" id="addRoute">+ Route</button></div><div id="routeHost"></div></div>
    <div class="section premium-section"><div class="section-title"><div><h3>Transportation Fee Plan</h3><p>Set route fee separately for each Academic Year and applicable Nepali months.</p></div><button class="btn primary" id="addTransportPlan">+ Transport Plan</button></div><div id="transportPlanHost"></div></div>
  </div>
  <div class="two-col">
    <div class="section premium-section"><div class="section-title"><div><h3>Fee Heads</h3><p>Select exactly which Nepali months each fee applies.</p></div><button class="btn primary" id="addHead">+ Fee Head</button></div><div id="headHost"></div></div>
    <div class="section premium-section"><div class="section-title"><div><h3>Fee Plans</h3><p>Amount by Academic Year, Class and Student Category.</p></div><button class="btn primary" id="addPlan">+ Fee Plan</button></div><div id="planHost"></div></div>
  </div>`;
  $('#addRoute').onclick=()=>openRouteForm();
  $('#addTransportPlan').onclick=()=>openTransportPlanForm();
  $('#addHead').onclick=()=>openFeeHeadForm();
  $('#addPlan').onclick=()=>openFeePlanForm();
  drawRoutes();drawTransportPlans();drawFeeHeads();drawFeePlans();
};

drawRoutes=function(){
  const h=$('#routeHost');
  h.innerHTML=(db.routes||[]).length?`<div class="table-wrap compact"><table><thead><tr><th>Route</th><th class="amount">Default Monthly Fee</th><th>Status</th><th>Action</th></tr></thead><tbody>${db.routes.map(r=>`<tr><td>${esc(r.name)}</td><td class="amount">${money(r.amount)}</td><td>${r.active!==false?'Active':'Inactive'}</td><td><button class="btn small" onclick="openRouteForm('${r.id}')">Edit</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No online routes yet.</div>`;
};

openRouteForm=function(id=''){
  const r=(db.routes||[]).find(x=>x.id===id);
  openModal('ONLINE ROUTE',r?'Edit Route':'New Route',`<form id="routeForm" class="form-grid"><div><label>Route Name</label><input name="name" value="${esc(r?.name||'')}" required></div><div><label>Default Monthly Bus Fee</label><input name="amount" type="number" min="0" step="0.01" value="${num(r?.amount)}" required></div><div><label>Status</label><select name="active"><option value="true">Active</option><option value="false">Inactive</option></select></div><div class="full form-actions"><button type="button" class="btn" onclick="closeModal()">Close</button><button class="btn primary" id="saveOnlineRoute">Save Online</button></div></form>`);
  const f=$('#routeForm');f.elements.active.value=String(r?.active!==false);
  f.onsubmit=async e=>{e.preventDefault();const btn=$('#saveOnlineRoute'),old=btn.textContent;btn.disabled=true;btn.textContent='Saving...';try{
    const payload={route_name:String(f.elements.name.value||'').trim(),default_monthly_amount:Math.max(0,num(f.elements.amount.value)),active:f.elements.active.value==='true'};
    let result=r?await sb.from('routes').update(payload).eq('route_id',r.id).select('route_id,route_name,default_monthly_amount,active').single():await sb.from('routes').insert(payload).select('route_id,route_name,default_monthly_amount,active').single();
    if(result.error)throw result.error;await v16RefreshFeeSetup();closeModal();renderFeeStructure();toast('Route saved online.');
  }catch(error){console.error(error);toast('Route save failed: '+(error?.message||'Unknown error'));}finally{btn.disabled=false;btn.textContent=old;}};
};

function drawTransportPlans(){
  const h=$('#transportPlanHost');
  const rows=[...(db.transportPlans||[])].sort((a,b)=>String(b.year).localeCompare(String(a.year))||String(routeById(a.routeId)?.name||'').localeCompare(String(routeById(b.routeId)?.name||'')));
  h.innerHTML=rows.length?`<div class="table-wrap compact"><table><thead><tr><th>Year</th><th>Route</th><th class="amount">Monthly Fee</th><th>Months</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(p.year)}</td><td>${esc(routeById(p.routeId)?.name||'Unknown Route')}</td><td class="amount">${money(p.amount)}</td><td>${esc(v16MonthText(p.months))}</td><td>${p.active!==false?'Active':'Inactive'}</td><td><button class="btn small" onclick="openTransportPlanForm('${p.id}')">Edit</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No yearly Transportation Fee Plan yet.</div>`;
}

function openTransportPlanForm(id=''){
  const p=(db.transportPlans||[]).find(x=>x.id===id);
  const allMonths=Array.from({length:12},(_,i)=>i);
  openModal('TRANSPORTATION FEE',p?'Edit Yearly Transport Plan':'New Yearly Transport Plan',`<form id="transportPlanForm" class="form-grid"><div><label>Academic Year</label><select name="year">${yearsOptions(p?.year||getYear())}</select></div><div><label>Route</label><select name="routeId" required><option value="">Select Route</option>${(db.routes||[]).map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div><div><label>Monthly Amount</label><input name="amount" type="number" min="0" step="0.01" value="${num(p?.amount)}" required></div><div><label>Status</label><select name="active"><option value="true">Active</option><option value="false">Inactive</option></select></div><div class="full"><label>Applicable Nepali Months</label>${v16MonthChecks('months',p?.months?.length?p.months:allMonths)}</div><div class="full form-actions"><button type="button" class="btn" onclick="closeModal()">Close</button><button class="btn primary" id="saveTransportPlan">Save Online</button></div></form>`);
  const f=$('#transportPlanForm');f.elements.routeId.value=p?.routeId||'';f.elements.active.value=String(p?.active!==false);
  f.onsubmit=async e=>{e.preventDefault();const months=v16SelectedMonths(f,'months');if(!months.length)return toast('Select at least one applicable month.');const btn=$('#saveTransportPlan'),old=btn.textContent;btn.disabled=true;btn.textContent='Saving...';try{
    const payload={academic_year:String(f.elements.year.value),route_id:f.elements.routeId.value,monthly_amount:Math.max(0,num(f.elements.amount.value)),applicable_months:v16MonthsToDb(months),active:f.elements.active.value==='true'};
    let result=p?await sb.from('transport_fee_plans').update(payload).eq('transport_plan_id',p.id).select('transport_plan_id,academic_year,route_id,monthly_amount,applicable_months,active').single():await sb.from('transport_fee_plans').insert(payload).select('transport_plan_id,academic_year,route_id,monthly_amount,applicable_months,active').single();
    if(result.error)throw result.error;await v16RefreshFeeSetup();closeModal();renderFeeStructure();toast('Transportation Fee Plan saved online.');
  }catch(error){console.error(error);toast('Transport plan save failed: '+(error?.message||'Unknown error'));}finally{btn.disabled=false;btn.textContent=old;}};
}

drawFeeHeads=function(){
  const h=$('#headHost');
  const rows=db.feeHeads||[];
  h.innerHTML=rows.length?`<div class="table-wrap compact"><table><thead><tr><th>Fee Head</th><th>Group</th><th>Frequency</th><th>Applicable Months</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.feeGroup||'')}</td><td>${esc(x.frequency)}</td><td>${esc(v16MonthText(x.months))}</td><td>${x.active!==false?'Active':'Inactive'}</td><td><button class="btn small" onclick="openFeeHeadForm('${x.id}')">Edit</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No online fee heads yet.</div>`;
};

openFeeHeadForm=function(id=''){
  const x=feeHeadById(id);
  openModal('ONLINE FEE HEAD',x?'Edit Fee Head':'New Fee Head',`<form id="headForm"><div class="form-grid"><div><label>Fee Head Name</label><input name="name" value="${esc(x?.name||'')}" required></div><div><label>Fee Group</label><input name="feeGroup" value="${esc(x?.feeGroup||'General')}" placeholder="Example: Academic Fee"></div><div><label>Account Name</label><input name="accountName" value="${esc(x?.accountName||x?.name||'')}" placeholder="Accounting heading"></div><div><label>Frequency / Type</label><select name="frequency"><option>Monthly</option><option>Quarterly</option><option>Half-Yearly</option><option>Yearly / One-Time</option><option>Selected Months</option></select></div><div><label>Status</label><select name="active"><option value="true">Active</option><option value="false">Inactive</option></select></div><div class="full"><label>Applicable Nepali Months</label>${v16MonthChecks('months',x?.months||[])}</div><div class="full form-actions"><button type="button" class="btn" onclick="closeModal()">Close</button><button class="btn primary" id="saveOnlineHead">Save Online</button></div></div></form>`);
  const f=$('#headForm');f.elements.frequency.value=x?.frequency||'Monthly';f.elements.active.value=String(x?.active!==false);
  f.onsubmit=async e=>{e.preventDefault();const months=v16SelectedMonths(f,'months');if(!months.length)return toast('Select at least one applicable month.');const btn=$('#saveOnlineHead'),old=btn.textContent;btn.disabled=true;btn.textContent='Saving...';try{
    const name=String(f.elements.name.value||'').trim();
    const payload={fee_name:name,fee_group:String(f.elements.feeGroup.value||'General').trim()||'General',account_name:String(f.elements.accountName.value||name).trim()||name,frequency:f.elements.frequency.value,applicable_months:v16MonthsToDb(months),active:f.elements.active.value==='true'};
    let result=x?await sb.from('fee_heads').update(payload).eq('fee_head_id',x.id).select('fee_head_id,fee_name,fee_group,account_name,frequency,applicable_months,active').single():await sb.from('fee_heads').insert(payload).select('fee_head_id,fee_name,fee_group,account_name,frequency,applicable_months,active').single();
    if(result.error)throw result.error;await v16RefreshFeeSetup();closeModal();renderFeeStructure();toast('Fee Head saved online.');
  }catch(error){console.error(error);toast('Fee Head save failed: '+(error?.message||'Unknown error'));}finally{btn.disabled=false;btn.textContent=old;}};
};

drawFeePlans=function(){
  const h=$('#planHost');
  const rows=[...(db.feePlans||[])].sort((a,b)=>String(b.year).localeCompare(String(a.year))||String(feeHeadById(a.headId)?.name||'').localeCompare(String(feeHeadById(b.headId)?.name||'')));
  h.innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Year</th><th>Fee Head</th><th>Category</th><th>Classes</th><th class="amount">Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(p.year)}</td><td>${esc(feeHeadById(p.headId)?.name||'')}</td><td>${esc(p.category)}</td><td>${esc((p.classes||[]).join(', '))}</td><td class="amount">${money(p.amount)}</td><td>${p.active!==false?'Active':'Inactive'}</td><td><button class="btn small" onclick="openFeePlanForm('${p.id}')">Edit</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No online fee plans yet.</div>`;
};

openFeePlanForm=function(id=''){
  const p=(db.feePlans||[]).find(x=>x.id===id);
  openModal('ONLINE FEE PLAN',p?'Edit Fee Plan':'New Fee Plan',`<form id="planForm" class="form-grid"><div><label>Academic Year</label><select name="year">${yearsOptions(p?.year||getYear())}</select></div><div><label>Fee Head</label><select name="headId" required><option value="">Select Fee Head</option>${(db.feeHeads||[]).filter(h=>h.active!==false||h.id===p?.headId).map(h=>`<option value="${h.id}">${esc(h.name)}</option>`).join('')}</select></div><div><label>Student Category</label><select name="category"><option>All</option><option>New</option><option>Old</option></select></div><div><label>Amount</label><input name="amount" type="number" min="0" step="0.01" value="${num(p?.amount)}" required></div><div><label>Status</label><select name="active"><option value="true">Active</option><option value="false">Inactive</option></select></div><div class="full"><label>Remarks</label><input name="remarks" value="${esc(p?.remarks||'')}" placeholder="Optional"></div><div class="full"><label>Classes</label><div class="multi-checks">${CLASSES.map(c=>`<label><input type="checkbox" name="classes" value="${c}" ${(p?.classes||[]).includes(c)?'checked':''}>${c}</label>`).join('')}</div></div><div class="full form-actions"><button type="button" class="btn" onclick="closeModal()">Close</button><button class="btn primary" id="saveOnlinePlan">Save Online</button></div></form>`);
  const f=$('#planForm');f.elements.headId.value=p?.headId||'';f.elements.category.value=p?.category||'All';f.elements.active.value=String(p?.active!==false);
  f.onsubmit=async e=>{e.preventDefault();const classes=[...f.querySelectorAll('input[name="classes"]:checked')].map(c=>c.value);if(!classes.length)return toast('Select at least one class.');const btn=$('#saveOnlinePlan'),old=btn.textContent;btn.disabled=true;btn.textContent='Saving...';try{
    const payload={academic_year:String(f.elements.year.value),fee_head_id:f.elements.headId.value,class_names:classes,student_category:f.elements.category.value,amount:Math.max(0,num(f.elements.amount.value)),active:f.elements.active.value==='true',remarks:v15Nullable(f.elements.remarks.value)};
    let result=p?await sb.from('fee_plans').update(payload).eq('fee_plan_id',p.id).select('fee_plan_id,academic_year,fee_head_id,class_names,student_category,amount,active,remarks').single():await sb.from('fee_plans').insert(payload).select('fee_plan_id,academic_year,fee_head_id,class_names,student_category,amount,active,remarks').single();
    if(result.error)throw result.error;await v16RefreshFeeSetup();closeModal();renderFeeStructure();toast('Fee Plan saved online.');
  }catch(error){console.error(error);toast('Fee Plan save failed: '+(error?.message||'Unknown error'));}finally{btn.disabled=false;btn.textContent=old;}};
};

window.openRouteForm=openRouteForm;
window.openTransportPlanForm=openTransportPlanForm;
window.openFeeHeadForm=openFeeHeadForm;
window.openFeePlanForm=openFeePlanForm;
window.v16RefreshFeeSetup=v16RefreshFeeSetup;

/* Global refresh now refreshes online Students + Fee Setup. */
const _v16RefreshButton=document.getElementById('refreshBtn');
if(_v16RefreshButton){
  _v16RefreshButton.onclick=async()=>{
    try{
      if(isAccountant()){
        await Promise.all([v15LoadOnlineStudents(),v16LoadOnlineFeeSetup()]);
      }
      renderPage();
      toast('Online data refreshed.');
    }catch(error){
      console.error(error);toast('Refresh failed: '+(error?.message||'Unknown error'));
    }
  };
}

/* ==================== END ROUTES + FEE STRUCTURE ONLINE V16 ==================== */

/* ==================== ONLINE SCHOLARSHIP + FEE RECEIVE V17 ====================
   Phase scope:
   - Student-specific Scholarship / Fee Override is stored in Supabase.
   - Active fee receipts + receipt items are loaded from Supabase and are the
     audit source for exact-item locking.
   - Fee Receive is created only through create_fee_receipt_atomic().
   - Student dues/advance are refreshed from Supabase after every receipt.
   - Existing receipt rows are treated as immutable in the browser: View/Reprint only.
   - Bank master is loaded online only so a direct Bank fee receipt can point
     to a valid bank. Bank-transfer transaction migration remains a later phase.
=============================================================================== */

async function v17FetchAll(buildQuery,pageSize=1000){
  const rows=[];
  for(let from=0;;from+=pageSize){
    const {data,error}=await buildQuery().range(from,from+pageSize-1);
    if(error) throw error;
    const batch=data||[];
    rows.push(...batch);
    if(batch.length<pageSize) break;
  }
  return rows;
}

function v17StudentRowByUuidYear(studentUuid,year){
  return (db.students||[]).find(s=>String(s.studentUuid||studentMasterId(s))===String(studentUuid||'')&&String(s.year)===String(year||''))||null;
}

function v17OverrideFromRow(r){
  const student=v17StudentRowByUuidYear(r.student_uuid,r.academic_year);
  return {
    id:r.override_id,
    studentId:student?.id||'',
    studentUuid:r.student_uuid,
    year:String(r.academic_year||''),
    monthIndex:Math.max(0,num(r.month_no)-1),
    type:r.item_type,
    refId:r.item_type==='transport'?(r.route_id||''):(r.fee_head_id||''),
    baseAmount:num(r.base_amount),
    amount:num(r.override_amount),
    reason:r.reason||'Scholarship',
    active:r.active!==false,
    online:true
  };
}

function v17BankFromRow(r){
  return {
    id:r.bank_id,
    name:r.bank_name,
    accountName:r.account_name||'',
    accountNo:r.account_no||'',
    openingBalance:num(r.opening_balance),
    active:r.active!==false,
    remarks:r.remarks||'',
    online:true
  };
}

function v17ReceiptFromRows(r,items){
  const student=v17StudentRowByUuidYear(r.student_uuid,r.academic_year);
  const months=(Array.isArray(r.selected_months)?r.selected_months:[]).map(x=>num(x)-1).filter(x=>x>=0&&x<12);
  const mappedItems=(items||[]).map(i=>{
    const mi=Math.max(0,num(i.month_no)-1);
    return {
      id:i.receipt_item_id,
      type:i.item_type,
      refId:i.item_type==='transport'?(i.route_id||''):(i.fee_head_id||''),
      label:i.item_label|| (i.item_type==='transport'?'Transportation Fee':''),
      baseAmount:num(i.base_amount),
      adjustmentAmount:num(i.adjustment_amount),
      amount:num(i.final_amount),
      monthIndex:mi,
      month:NP_MONTHS[mi]||''
    };
  });
  return {
    id:r.receipt_id,
    receiptNo:r.receipt_no,
    date:r.nepali_date,
    year:String(r.academic_year||''),
    studentId:student?.id||'',
    masterId:r.student_uuid,
    studentUuid:r.student_uuid,
    registrationNo:r.registration_no||student?.registrationNo||'',
    studentName:r.student_name||student?.name||'',
    className:r.class_name||student?.className||'',
    guardian:r.guardian_name||student?.guardian||student?.fatherName||student?.motherName||'',
    months,
    items:mappedItems,
    oldDues:num(r.old_dues),
    currentTotal:num(r.current_fee_total),
    grandTotal:num(r.grand_total),
    discount:num(r.discount),
    netPayable:num(r.net_payable),
    paid:num(r.received_amount),
    balance:num(r.balance),
    advance:num(r.advance_amount),
    mode:r.payment_mode||'Cash',
    bankId:r.bank_id||'',
    issuedBy:r.issued_by||'',
    remarks:r.remarks||'',
    status:r.status||'active',
    online:true,
    createdAt:r.created_at||''
  };
}

async function v17LoadOnlineOverrides(){
  if(!isAccountant()){db.overrides=[];return;}
  const rows=await v17FetchAll(()=>sb.from('student_fee_overrides')
    .select('override_id,student_uuid,academic_year,month_no,item_type,fee_head_id,route_id,base_amount,override_amount,reason,active,created_at,updated_at')
    .eq('active',true)
    .order('created_at',{ascending:true}));
  db.overrides=rows.map(v17OverrideFromRow).filter(o=>o.studentId);
}

async function v17LoadOnlineBanks(){
  if(!isAccountant()){db.banks=[];return;}
  const rows=await v17FetchAll(()=>sb.from('banks')
    .select('bank_id,bank_name,account_name,account_no,opening_balance,active,remarks,created_at,updated_at')
    .order('bank_name',{ascending:true}));
  db.banks=rows.map(v17BankFromRow);
}

async function v17LoadOnlineReceipts(){
  if(!isAccountant()){db.receipts=[];return;}
  const receiptRows=await v17FetchAll(()=>sb.from('fee_receipts')
    .select('receipt_id,receipt_no,nepali_date,academic_year,student_uuid,registration_no,student_name,class_name,guardian_name,selected_months,old_dues,current_fee_total,grand_total,discount,net_payable,received_amount,balance,advance_amount,payment_mode,bank_id,issued_by,remarks,status,created_at')
    .eq('status','active')
    .order('created_at',{ascending:true}));
  const activeIds=new Set(receiptRows.map(r=>r.receipt_id));
  let itemRows=[];
  if(activeIds.size){
    itemRows=await v17FetchAll(()=>sb.from('fee_receipt_items')
      .select('receipt_item_id,receipt_id,student_uuid,academic_year,month_no,item_type,fee_head_id,route_id,item_label,base_amount,adjustment_amount,final_amount,created_at')
      .order('created_at',{ascending:true}));
    itemRows=itemRows.filter(i=>activeIds.has(i.receipt_id));
  }
  const grouped=new Map();
  itemRows.forEach(i=>{if(!grouped.has(i.receipt_id))grouped.set(i.receipt_id,[]);grouped.get(i.receipt_id).push(i);});
  db.receipts=receiptRows.map(r=>v17ReceiptFromRows(r,grouped.get(r.receipt_id)||[]));
}

async function v17LoadOnlineFeeTransactions(){
  if(!isAccountant()){
    db.overrides=[];db.receipts=[];db.banks=[];
    return;
  }
  await Promise.all([v17LoadOnlineOverrides(),v17LoadOnlineBanks(),v17LoadOnlineReceipts()]);
}

async function v17RefreshAllOnline(){
  if(!isAccountant())return;
  await Promise.all([v15LoadOnlineStudents(),v16LoadOnlineFeeSetup()]);
  await v17LoadOnlineFeeTransactions();
}

/* Do not cache central fee transaction state in localStorage. */
const _v17SaveDBBase=saveDB;
saveDB=function(){
  const keep={overrides:db.overrides,receipts:db.receipts,banks:db.banks};
  try{
    db.overrides=[];db.receipts=[];db.banks=[];
    _v17SaveDBBase();
  }finally{
    db.overrides=keep.overrides;db.receipts=keep.receipts;db.banks=keep.banks;
  }
};

const _v17OpenOnlineSessionBase=openOnlineSession;
openOnlineSession=async function(user,expectedRole=null){
  await _v17OpenOnlineSessionBase(user,expectedRole);
  if(isAccountant()){
    try{
      await v17LoadOnlineFeeTransactions();
      renderPage();
    }catch(error){
      console.error('Online Fee Receive data load failed:',error);
      toast('Login succeeded, but online Fee Receive data could not load: '+(error?.message||'Unknown error'));
    }
  }
};

/* Student Master regains Fee Card now that Scholarship/Receipt state is online. */
drawStudentList=function(){
  const rows=filteredStudents();
  $('#studentHost').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Reg. No.</th><th>Student Name</th><th>Class</th><th>Guardian</th><th>Mobile</th><th>Phone</th><th>Nepali DOB</th><th>Route</th><th>Caste</th><th class="amount">Dues</th>${isAccountant()?'<th>Action</th>':''}</tr></thead><tbody>${rows.map(s=>`<tr><td>${esc(s.registrationNo)}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.className)}</td><td>${esc(s.guardian||s.fatherName||s.motherName||'')}</td><td>${esc(s.mobileNumber||'')}</td><td>${esc(s.phone||'')}</td><td>${esc(s.dobNp||'')}</td><td>${esc(routeById(s.routeId)?.name||'')}</td><td>${esc(s.caste||'')}</td><td class="amount ${num(s.dues)>0?'danger-text':''}">${money(s.dues)}</td>${isAccountant()?`<td class="nowrap"><button class="btn small" onclick="openStudentForm('${s.id}')">Edit</button> <button class="btn small" onclick="openLedgerDirect('${s.id}')">Fee Card</button> <button class="btn small red" onclick="deleteOnlineStudent('${s.id}')">Delete</button></td>`:''}</tr>`).join('')}</tbody></table></div>`:`<div class="empty">No students found for this filter.</div>`;
};

/* Online Scholarship writer. Exact paid cells stay disabled by v12 receipt-item locking. */
openScholarshipMatrix=function(studentId,year){
  const s=studentById(studentId);if(!s||!isAccountant())return;const rows=scholarshipRows(s,year);
  openModal('FEE CARD',`Scholarship — ${s.name}`,`<div class="scholarship-wrap"><table class="scholarship-table"><thead><tr><th>Fee Head</th>${NP_MONTHS.map(m=>`<th>${m}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><th>${esc(row.label)}</th>${NP_MONTHS.map((m,mi)=>{
    const base=scholarshipBaseAmount(s,year,mi,row.type,row.refId),ov=overrideFor(s.id,String(year),mi,row.type,row.refId),effective=ov?num(ov.amount):base;
    if(base===null)return '<td class="na-cell">0</td>';
    const locked=v12ItemProcessed(s,year,mi,{type:row.type,refId:row.refId,label:row.label});
    return `<td class="${locked?'locked-cell':''}"><input class="schCell" data-type="${row.type}" data-ref="${row.refId}" data-label="${esc(row.label)}" data-month="${mi}" data-base="${base}" type="number" min="0" step="1" value="${num(effective)}" ${locked?'disabled title="This exact fee item was already received"':''}>${locked?'<span class="mini-lock">PAID</span>':''}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div><div class="form-actions scholarship-actions"><button class="btn red" id="removeScholarship">Remove Unpaid Scholarship Changes</button><button class="btn" onclick="closeModal()">Close</button><button class="btn primary" id="saveScholarship">Save Online Scholarship</button></div>`);

  $('#saveScholarship').onclick=async()=>{
    const btn=$('#saveScholarship'),old=btn.textContent;btn.disabled=true;btn.textContent='Saving...';
    try{
      // Refresh active receipts first so a fee paid on another device is not edited here.
      await v17LoadOnlineReceipts();
      const ops=[];
      $$('.schCell:not(:disabled)').forEach(inp=>{
        const type=inp.dataset.type,refId=inp.dataset.ref,mi=num(inp.dataset.month),base=Math.max(0,num(inp.dataset.base)),val=Math.max(0,num(inp.value));
        const label=inp.dataset.label||'';
        if(v12ItemProcessed(s,year,mi,{type,refId,label}))return;
        const existing=overrideFor(s.id,String(year),mi,type,refId);
        if(Math.abs(val-base)<0.0001){
          if(existing?.id) ops.push({kind:'deactivate',id:existing.id});
        }else if(existing?.id){
          ops.push({kind:'update',id:existing.id,payload:{base_amount:base,override_amount:val,reason:'Scholarship',active:true}});
        }else{
          ops.push({kind:'insert',payload:{student_uuid:s.studentUuid||studentMasterId(s),academic_year:String(year),month_no:mi+1,item_type:type,fee_head_id:type==='fee'?refId:null,route_id:type==='transport'?refId:null,base_amount:base,override_amount:val,reason:'Scholarship',active:true}});
        }
      });
      for(const op of ops){
        let result;
        if(op.kind==='deactivate')result=await sb.from('student_fee_overrides').update({active:false}).eq('override_id',op.id);
        else if(op.kind==='update')result=await sb.from('student_fee_overrides').update(op.payload).eq('override_id',op.id);
        else result=await sb.from('student_fee_overrides').insert(op.payload);
        if(result.error)throw result.error;
      }
      await v17LoadOnlineOverrides();
      closeModal();drawStudentReport();toast(ops.length?'Scholarship saved online.':'No Scholarship change to save.');
    }catch(error){console.error(error);toast('Scholarship save failed: '+(error?.message||'Unknown error'));}
    finally{if(btn){btn.disabled=false;btn.textContent=old;}}
  };

  $('#removeScholarship').onclick=async()=>{
    if(!confirm('Remove Scholarship changes from all unpaid fee items for this student/year?'))return;
    const btn=$('#removeScholarship'),old=btn.textContent;btn.disabled=true;btn.textContent='Removing...';
    try{
      await v17LoadOnlineReceipts();
      const ids=(db.overrides||[]).filter(o=>o.studentId===s.id&&String(o.year)===String(year)).filter(o=>{
        const label=o.type==='transport'?'Transportation Fee':(feeHeadById(o.refId)?.name||'');
        return !v12ItemProcessed(s,year,o.monthIndex,{type:o.type,refId:o.refId,label});
      }).map(o=>o.id).filter(Boolean);
      if(ids.length){
        const {error}=await sb.from('student_fee_overrides').update({active:false}).in('override_id',ids);
        if(error)throw error;
      }
      await v17LoadOnlineOverrides();
      closeModal();drawStudentReport();toast(ids.length?'Unpaid Scholarship changes removed online.':'No unpaid Scholarship changes found.');
    }catch(error){console.error(error);toast('Scholarship remove failed: '+(error?.message||'Unknown error'));}
    finally{if(btn){btn.disabled=false;btn.textContent=old;}}
  };
};
window.openScholarshipMatrix=openScholarshipMatrix;

/* Online bank master: needed only for direct Bank fee receipts in this phase. */
openBankForm=function(id=''){
  if(!isAccountant())return unauthorized();
  const b=bankById(id);
  openModal('ONLINE BANK ACCOUNT',b?'Edit Bank Account':'Add Bank Account',`<form id="bankForm" class="form-grid"><div><label>Bank Name</label><input name="name" value="${esc(b?.name||'')}" required></div><div><label>Account Name</label><input name="accountName" value="${esc(b?.accountName||'')}"></div><div><label>Account No.</label><input name="accountNo" value="${esc(b?.accountNo||'')}"></div><div><label>Opening Balance</label><input name="openingBalance" type="number" step="0.01" value="${num(b?.openingBalance)}"></div><div><label>Status</label><select name="active"><option value="true">Active</option><option value="false">Inactive</option></select></div><div class="full"><label>Remarks</label><input name="remarks" value="${esc(b?.remarks||'')}"></div><div class="full form-actions"><button type="button" class="btn" onclick="closeModal()">Close</button><button class="btn primary" id="saveOnlineBank">Save Online Bank</button></div></form>`);
  const f=$('#bankForm');f.elements.active.value=String(b?.active!==false);
  f.onsubmit=async e=>{e.preventDefault();const btn=$('#saveOnlineBank'),old=btn.textContent;btn.disabled=true;btn.textContent='Saving...';try{
    const payload={bank_name:String(f.elements.name.value||'').trim(),account_name:v15Nullable(f.elements.accountName.value),account_no:v15Nullable(f.elements.accountNo.value),opening_balance:num(f.elements.openingBalance.value),active:f.elements.active.value==='true',remarks:v15Nullable(f.elements.remarks.value)};
    const result=b?await sb.from('banks').update(payload).eq('bank_id',b.id):await sb.from('banks').insert(payload);
    if(result.error)throw result.error;await v17LoadOnlineBanks();closeModal();renderPage();toast('Bank account saved online.');
  }catch(error){console.error(error);toast('Bank save failed: '+(error?.message||'Unknown error'));}finally{btn.disabled=false;btn.textContent=old;}};
};
window.openBankForm=openBankForm;

/* Fee Receive UI: receipt number is now generated atomically on Save. */
renderFeePayment=function(){
  if(!isAccountant())return unauthorized();
  const keepYear=feeReceiveV9Context?.year||getYear();
  const keepClass=feeReceiveV9Context?.className||'';
  paymentState={year:keepYear,className:keepClass,studentId:'',studentRecordKey:'',selectedMonths:[],date:workingDate(),mode:'Cash',bankId:'',discount:0,paid:0};
  $('#content').innerHTML=`<div class="notice" style="margin-bottom:12px"><strong>ONLINE & TRANSACTION-SAFE:</strong> Receipt No., fee-item locking, Scholarship, receipt items and student dues are controlled by Supabase in one atomic save.</div><div class="section premium-section"><div class="section-title"><div><h3>Fee Receive</h3><p>Year → Class → type Student Name → select the exact student → Month(s).</p></div><div class="next-number"><small>Receipt No.</small><b>Generated securely on Save</b></div></div><div class="form-grid three"><div><label>Academic Year</label><select id="payYear">${yearsOptions(keepYear)}</select></div><div><label>Class</label><select id="payClass">${classesOptions()}</select></div><div class="student-search-field"><label>Student</label><input id="payStudentSearch" type="text" autocomplete="off" placeholder="Select class, then type student name"><div id="payStudentResults" class="student-search-results hidden"></div></div><div><label>Nepali Date</label><input id="payDate" value="${esc(workingDate())}" placeholder="2083-05-26"></div><div><label>Payment Mode</label><select id="payMode"><option value="Cash">Cash</option><option value="Bank">Bank</option></select></div><div id="payBankWrap"><label>Bank Account</label><select id="payBank" disabled>${bankOptions()}</select><div class="student-search-hint" id="payBankHint">Choose Bank mode to receive directly into an online school bank account.</div></div><div><label>Registration No.</label><input id="payReg" readonly></div></div></div><div id="payHost"><div class="section premium-section"><div class="empty">Select a class, then search and select a student.</div></div></div>`;
  $('#payClass').value=CLASSES.includes(keepClass)?keepClass:'';
  paymentState.className=$('#payClass').value;
  feeReceiveV9Context={year:String($('#payYear').value||''),className:String($('#payClass').value||'')};
  const input=$('#payStudentSearch');input.disabled=!$('#payClass').value;input.placeholder=$('#payClass').value?'Type student name (e.g. Sagar)':'Select class first';
  $('#payClass').onchange=resetFeeReceiveStudents;$('#payYear').onchange=resetFeeReceiveStudents;
  input.oninput=()=>{if(paymentState.studentId||paymentState.studentRecordKey)clearFeeReceiveSelectedStudentV9();drawFeeReceiveStudentResults();};
  input.onfocus=drawFeeReceiveStudentResults;
  input.onkeydown=e=>{if(e.key==='Escape'){$('#payStudentResults')?.classList.add('hidden');return;}if(e.key==='Enter'){const first=$('#payStudentResults .student-search-option');if(first){e.preventDefault();first.click();}}};
  input.onblur=()=>setTimeout(()=>$('#payStudentResults')?.classList.add('hidden'),220);
  $('#payDate').oninput=e=>paymentState.date=e.target.value;
  const bankSelect=$('#payBank'),bankHint=$('#payBankHint');
  $('#payMode').onchange=e=>{paymentState.mode=e.target.value;const isBank=e.target.value==='Bank';bankSelect.disabled=!isBank;if(!isBank){paymentState.bankId='';bankSelect.value='';bankHint.textContent='Choose Bank mode to receive directly into an online school bank account.';}else if(!activeBanks().length){bankHint.textContent='No active online bank account. Add one from Banking first.';toast('No active online bank account. Add a bank account first.');}else bankHint.textContent='Select the bank where the parent deposited the fee.';};
  bankSelect.onchange=e=>paymentState.bankId=e.target.value;
};

function v17RpcItems(items){
  return (items||[]).map(i=>({
    month_no:num(i.monthIndex)+1,
    item_type:i.type,
    fee_head_id:i.type==='fee'?i.refId:null,
    route_id:i.type==='transport'?i.refId:null
  }));
}

function v17RenderSavedReceiptToWindow(win,r){
  if(!win)return;
  try{
    const cssHref=new URL('style.css',window.location.href).href;
    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>${esc(r.receiptNo)}</title><link rel="stylesheet" href="${cssHref}"></head><body>${receiptHTML(r)}<script>setTimeout(()=>window.print(),500)<\/script></body></html>`);
    win.document.close();
  }catch(e){console.warn('Receipt print window failed:',e);}
}

savePayment=async function(){
  const s=paymentState.studentRecordKey?studentByRecordKey(paymentState.studentRecordKey):(db.students||[]).find(x=>String(x.id)===String(paymentState.studentId||''));
  const y=String(paymentState.year||'');
  if(!s)return toast('Select the exact student from the search results first.');
  if(String(s.year)!==y||String(s.className)!==String(paymentState.className))return toast('Student selection changed. Please select the student again.');
  if(!npDateValid(paymentState.date))return toast('Enter Nepali date as YYYY-MM-DD.');
  if(paymentState.mode==='Bank'&&!paymentState.bankId)return toast('Select the online bank account that received this payment.');

  // Refresh online state immediately before save to reduce stale-screen conflicts.
  try{await Promise.all([v15LoadOnlineStudents(),v17LoadOnlineOverrides(),v17LoadOnlineReceipts()]);}
  catch(error){console.error(error);return toast('Could not refresh online fee state: '+(error?.message||'Unknown error'));}
  const fresh=(db.students||[]).find(x=>x.id===s.id)||s;
  const items=currentPayItems(fresh,y,paymentState.selectedMonths);
  const oldDues=num(fresh.dues),currentTotal=sum(items,x=>x.amount),grand=currentTotal+oldDues;
  const discount=Math.min(Math.max(0,num(paymentState.discount)),grand),net=Math.max(0,grand-discount);
  let paid=Math.max(0,num(paymentState.paid));if(discount>0)paid=Math.min(paid||net,net);
  if(!items.length&&oldDues<=0)return toast('Select at least one payable month.');

  const btn=$('#savePayment'),oldBtn=btn?.textContent||'Save & Print Receipt';if(btn){btn.disabled=true;btn.textContent='Saving Online...';}
  const printWin=window.open('','_blank','width=760,height=900');
  if(printWin){printWin.document.write('<!doctype html><html><body style="font-family:Arial;padding:24px">Saving secure online receipt…</body></html>');printWin.document.close();}
  try{
    const {data,error}=await sb.rpc('create_fee_receipt_atomic',{
      p_nepali_date:paymentState.date,
      p_academic_year:y,
      p_student_id:fresh.id,
      p_selected_months:(paymentState.selectedMonths||[]).map(i=>num(i)+1),
      p_items:v17RpcItems(items),
      p_discount:discount,
      p_received_amount:paid,
      p_payment_mode:paymentState.mode,
      p_bank_id:paymentState.mode==='Bank'?paymentState.bankId:null,
      p_issued_by:db.settings.issuedBy||null,
      p_remarks:null
    });
    if(error)throw error;
    await Promise.all([v15LoadOnlineStudents(),v17LoadOnlineOverrides(),v17LoadOnlineReceipts()]);
    const receiptId=data?.receipt_id||'';
    const receipt=(db.receipts||[]).find(r=>r.id===receiptId)|| (db.receipts||[]).find(r=>r.receiptNo===data?.receipt_no);
    feeReceiveV9Context={year:y,className:fresh.className};
    if(receipt){
      showReceiptById(receipt.id,false);
      v17RenderSavedReceiptToWindow(printWin,receipt);
    }else if(printWin){printWin.close();}
    toast(`Online receipt ${data?.receipt_no||''} saved successfully.`);
    renderFeePayment();
  }catch(error){
    console.error('Online fee receipt save failed:',error);
    if(printWin)printWin.close();
    const msg=String(error?.message||'Unknown error');
    toast('Fee receipt was NOT saved: '+msg);
    // Refresh again after a concurrency/validation failure so the screen reflects central data.
    try{await Promise.all([v15LoadOnlineStudents(),v17LoadOnlineOverrides(),v17LoadOnlineReceipts()]);drawPayPanel();}catch(_){/* ignore secondary refresh */}
  }finally{if(btn){btn.disabled=false;btn.textContent=oldBtn;}}
};
window.savePayment=savePayment;

/* Online receipts are immutable in the UI during the migration. */
drawReceiptRegister=function(){
  const arr=receiptRegisterRows();
  $('#receiptRegHost').innerHTML=arr.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Student</th><th>Class</th><th>Months</th><th class="amount">Received</th><th class="amount">Dues</th><th>Mode</th><th>Action</th></tr></thead><tbody>${arr.map(r=>`<tr><td>${r.date}</td><td><b>${esc(r.receiptNo)}</b></td><td>${esc(r.studentName)}</td><td>${esc(r.className)}</td><td>${esc((r.months||[]).map(i=>NP_MONTHS[i]).join(', '))}</td><td class="amount">${money(r.paid)}</td><td class="amount">${money(r.balance)}</td><td>${esc(r.mode)}</td><td>${isAccountant()?`<button class="btn small" onclick="showReceiptById('${r.id}')">View / Reprint</button>`:'View only'}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No online fee receipts found.</div>`;
};

/* Prevent accidental local receipt correction from legacy console/UI hooks. */
openReceiptEdit=function(){toast('Saved online receipts are protected. To correct one, cancel the receipt and create a new receipt.');};
deleteReceipt=function(){toast('Online receipts cannot be deleted. Use the future Void correction workflow.');};
window.openReceiptEdit=openReceiptEdit;window.deleteReceipt=deleteReceipt;

/* Banking transaction entry itself is deliberately held until the next online phase. */
const _v17RenderBankingBase=renderBanking;
renderBanking=function(){
  _v17RenderBankingBase();
  const section=$('#content .section');
  if(section)section.insertAdjacentHTML('afterbegin','<div class="notice" style="margin-bottom:12px"><strong>Migration note:</strong> Bank Account Master is online for direct Bank fee receipts. Cash Deposit / Withdrawal transaction entry is not online yet; do not enter those transactions until the next phase.</div>');
  const txForm=$('#bankTxForm');
  if(txForm){[...txForm.elements].forEach(el=>el.disabled=true);}
};
window.renderBanking=renderBanking;

/* Global refresh now includes online Student + Fee Setup + Scholarship + Receipts + Banks. */
const _v17RefreshButton=document.getElementById('refreshBtn');
if(_v17RefreshButton){
  _v17RefreshButton.onclick=async()=>{
    try{if(isAccountant())await v17RefreshAllOnline();renderPage();toast('All online fee data refreshed.');}
    catch(error){console.error(error);toast('Refresh failed: '+(error?.message||'Unknown error'));}
  };
}

if(sb){
  sb.auth.onAuthStateChange(event=>{
    if(event==='SIGNED_OUT'){
      db.overrides=[];db.receipts=[];db.banks=[];
    }
  });
}

window.v17RefreshAllOnline=v17RefreshAllOnline;
/* ==================== END ONLINE SCHOLARSHIP + FEE RECEIVE V17 ==================== */


/* ==================== V17.1 FEE RECEIVE REFINEMENT ====================
   Requested improvements:
   1) Select All eligible/unpaid months.
   2) Cash Received + Bank Received can be entered together on one receipt.
   3) Bank portion goes only to the selected active online bank account.
   Database prerequisite: create_fee_receipt_atomic_split() + cash_received /
   bank_received columns (V17.1 SQL) must already be installed in Supabase.
============================================================================ */

function v171CashReceived(r){
  const explicit=num(r?.cashReceived);
  const bankExplicit=num(r?.bankReceived);
  if(explicit>0||bankExplicit>0)return explicit;
  return String(r?.mode||'').toLowerCase()==='cash'?num(r?.paid):0;
}
function v171BankReceived(r){
  const explicit=num(r?.bankReceived);
  const cashExplicit=num(r?.cashReceived);
  if(explicit>0||cashExplicit>0)return explicit;
  return String(r?.mode||'').toLowerCase()==='bank'?num(r?.paid):0;
}
function v171PaymentLabel(r){
  const cash=v171CashReceived(r),bank=v171BankReceived(r);
  if(cash>0&&bank>0)return 'Cash + Bank';
  if(bank>0)return 'Bank';
  return 'Cash';
}

/* Read new split-payment columns from Supabase while remaining compatible with old V17 rows. */
v17ReceiptFromRows=function(r,items){
  const student=v17StudentRowByUuidYear(r.student_uuid,r.academic_year);
  const months=(Array.isArray(r.selected_months)?r.selected_months:[]).map(x=>num(x)-1).filter(x=>x>=0&&x<12);
  const mappedItems=(items||[]).map(i=>{
    const mi=Math.max(0,num(i.month_no)-1);
    return {
      id:i.receipt_item_id,
      type:i.item_type,
      refId:i.item_type==='transport'?(i.route_id||''):(i.fee_head_id||''),
      label:i.item_label||(i.item_type==='transport'?'Transportation Fee':''),
      baseAmount:num(i.base_amount),adjustmentAmount:num(i.adjustment_amount),amount:num(i.final_amount),
      monthIndex:mi,month:NP_MONTHS[mi]||''
    };
  });
  const paid=num(r.received_amount),rawCash=num(r.cash_received),rawBank=num(r.bank_received);
  let cash=rawCash,bank=rawBank;
  if(cash===0&&bank===0&&paid>0){
    if(String(r.payment_mode||'').toLowerCase()==='bank')bank=paid;else cash=paid;
  }
  const mode=cash>0&&bank>0?'Cash + Bank':bank>0?'Bank':'Cash';
  return {
    id:r.receipt_id,receiptNo:r.receipt_no,date:r.nepali_date,year:String(r.academic_year||''),
    studentId:student?.id||'',masterId:r.student_uuid,studentUuid:r.student_uuid,
    registrationNo:r.registration_no||student?.registrationNo||'',studentName:r.student_name||student?.name||'',
    className:r.class_name||student?.className||'',guardian:r.guardian_name||student?.guardian||student?.fatherName||student?.motherName||'',
    months,items:mappedItems,oldDues:num(r.old_dues),currentTotal:num(r.current_fee_total),grandTotal:num(r.grand_total),
    discount:num(r.discount),netPayable:num(r.net_payable),paid,balance:num(r.balance),advance:num(r.advance_amount),
    cashReceived:cash,bankReceived:bank,mode,rawPaymentMode:r.payment_mode||'Cash',bankId:r.bank_id||'',
    issuedBy:r.issued_by||'',remarks:r.remarks||'',status:r.status||'active',online:true,createdAt:r.created_at||''
  };
};

v17LoadOnlineReceipts=async function(){
  if(!isAccountant()){db.receipts=[];return;}
  const receiptRows=await v17FetchAll(()=>sb.from('fee_receipts')
    .select('receipt_id,receipt_no,nepali_date,academic_year,student_uuid,registration_no,student_name,class_name,guardian_name,selected_months,old_dues,current_fee_total,grand_total,discount,net_payable,received_amount,balance,advance_amount,payment_mode,cash_received,bank_received,bank_id,issued_by,remarks,status,created_at')
    .eq('status','active')
    .order('created_at',{ascending:true}));
  const activeIds=new Set(receiptRows.map(r=>r.receipt_id));
  let itemRows=[];
  if(activeIds.size){
    itemRows=await v17FetchAll(()=>sb.from('fee_receipt_items')
      .select('receipt_item_id,receipt_id,student_uuid,academic_year,month_no,item_type,fee_head_id,route_id,item_label,base_amount,adjustment_amount,final_amount,created_at')
      .order('created_at',{ascending:true}));
    itemRows=itemRows.filter(i=>activeIds.has(i.receipt_id));
  }
  const grouped=new Map();
  itemRows.forEach(i=>{if(!grouped.has(i.receipt_id))grouped.set(i.receipt_id,[]);grouped.get(i.receipt_id).push(i);});
  db.receipts=receiptRows.map(r=>v17ReceiptFromRows(r,grouped.get(r.receipt_id)||[]));
};

/* Fee Receive header: both Cash and Bank are always available in the same receipt. */
renderFeePayment=function(){
  if(!isAccountant())return unauthorized();
  const keepYear=feeReceiveV9Context?.year||getYear(),keepClass=feeReceiveV9Context?.className||'';
  paymentState={year:keepYear,className:keepClass,studentId:'',studentRecordKey:'',selectedMonths:[],date:workingDate(),discount:0,paid:0,cashReceived:0,bankReceived:0,bankId:''};
  $('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Fee Receive</h3></div><div class="next-number"><small>Receipt No.</small><b>Auto Generated</b></div></div><div class="form-grid three"><div><label>Academic Year</label><select id="payYear">${yearsOptions(keepYear)}</select></div><div><label>Class</label><select id="payClass">${classesOptions()}</select></div><div class="student-search-field"><label>Student</label><input id="payStudentSearch" type="text" autocomplete="off" placeholder="Select class, then type student name"><div id="payStudentResults" class="student-search-results hidden"></div></div><div><label>Nepali Date</label><input id="payDate" value="${esc(workingDate())}" placeholder="2083-05-26"></div><div><label>Registration No.</label><input id="payReg" readonly></div><div><label>Bank Account</label><select id="payBank" disabled>${bankOptions()}</select><div class="student-search-hint" id="payBankHint"></div></div></div></div><div id="payHost"><div class="section premium-section"><div class="empty">Select a class, then search and select a student.</div></div></div>`;
  $('#payClass').value=CLASSES.includes(keepClass)?keepClass:'';paymentState.className=$('#payClass').value;
  feeReceiveV9Context={year:String($('#payYear').value||''),className:String($('#payClass').value||'')};
  const input=$('#payStudentSearch');input.disabled=!$('#payClass').value;input.placeholder=$('#payClass').value?'Type student name (e.g. Sagar)':'Select class first';
  $('#payClass').onchange=resetFeeReceiveStudents;$('#payYear').onchange=resetFeeReceiveStudents;
  input.oninput=()=>{if(paymentState.studentId||paymentState.studentRecordKey)clearFeeReceiveSelectedStudentV9();drawFeeReceiveStudentResults();};
  input.onfocus=drawFeeReceiveStudentResults;
  input.onkeydown=e=>{if(e.key==='Escape'){$('#payStudentResults')?.classList.add('hidden');return;}if(e.key==='Enter'){const first=$('#payStudentResults .student-search-option');if(first){e.preventDefault();first.click();}}};
  input.onblur=()=>setTimeout(()=>$('#payStudentResults')?.classList.add('hidden'),220);
  $('#payDate').oninput=e=>paymentState.date=e.target.value;
  $('#payBank').onchange=e=>paymentState.bankId=e.target.value;
};

/* Student month panel + Select All. */
drawPayPanel=function(){
  const y=String(paymentState.year||$('#payYear')?.value||''),c=String(paymentState.className||$('#payClass')?.value||'');
  const s=paymentState.studentRecordKey?studentByRecordKey(paymentState.studentRecordKey):(db.students||[]).find(x=>String(x.id)===String(paymentState.studentId||''));
  paymentState.selectedMonths=[];paymentState.discount=0;paymentState.paid=0;paymentState.cashReceived=0;paymentState.bankReceived=0;paymentState.bankId='';
  if(!s||String(s.year)!==y||String(s.className)!==c||s.active===false){clearFeeReceiveSelectedStudentV9();return;}
  paymentState.studentId=s.id;paymentState.studentRecordKey=ensureStudentRecordKey(s);$('#payReg').value=s.registrationNo||'';
  const bank=$('#payBank');if(bank){bank.value='';bank.disabled=true;}const hint=$('#payBankHint');if(hint)hint.textContent='Enter a Bank Received amount to activate bank selection.';
  const months=NP_MONTHS.map((m,i)=>{
    const st=v12MonthState(s,y,i),pending=sum(st.unpaid,x=>x.amount);
    if(st.noCharge)return `<label class="month-box processed no-charge"><input class="payMonth" type="checkbox" value="${i}" disabled>${m} — No Charge</label>`;
    if(st.processed)return `<label class="month-box processed"><input class="payMonth" type="checkbox" value="${i}" disabled>${m} — Processed</label>`;
    const note=st.partial?` — New/Pending ${money(pending)}`:(pending>0?` — ${money(pending)}`:'');
    return `<label class="month-box ${st.partial?'pending-new':''}"><input class="payMonth" type="checkbox" value="${i}">${m}${note}</label>`;
  }).join('');
  $('#payHost').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>${esc(s.name)} — ${esc(s.className)}</h3><p><b>Registration:</b> ${esc(s.registrationNo||'')} &nbsp; · &nbsp; <b>Guardian:</b> ${esc(s.guardian||s.fatherName||s.motherName||'-')} &nbsp; · &nbsp; <b>Current Dues:</b> ${money(s.dues)}</p></div><label class="select-all-months"><input id="paySelectAll" type="checkbox"> <b>Select All Open Months</b></label></div><div class="month-grid">${months}</div></div><div id="payCalc"></div>`;
  const enabled=$$('.payMonth:not(:disabled)'),selectAll=$('#paySelectAll');
  if(selectAll)selectAll.disabled=!enabled.length;
  const syncMonths=()=>{
    const checked=enabled.filter(x=>x.checked);paymentState.selectedMonths=checked.map(x=>num(x.value));
    if(selectAll){selectAll.checked=enabled.length>0&&checked.length===enabled.length;selectAll.indeterminate=checked.length>0&&checked.length<enabled.length;}
    drawPaymentCalc();
  };
  enabled.forEach(box=>box.onchange=syncMonths);
  if(selectAll)selectAll.onchange=()=>{enabled.forEach(box=>box.checked=selectAll.checked);selectAll.indeterminate=false;syncMonths();};
  drawPaymentCalc();
};

/* Actual received starts at zero; Cash + Bank = Total Received. */
drawPaymentCalc=function(){
  const s=paymentState.studentRecordKey?studentByRecordKey(paymentState.studentRecordKey):studentById(paymentState.studentId),y=paymentState.year;if(!s)return;
  const items=currentPayItems(s,y,paymentState.selectedMonths),currentTotal=sum(items,x=>x.amount),oldDues=num(s.dues),grand=currentTotal+oldDues;
  const discount=Math.min(Math.max(0,num(paymentState.discount)),grand),net=Math.max(0,grand-discount);
  paymentState.cashReceived=Math.max(0,num(paymentState.cashReceived));paymentState.bankReceived=Math.max(0,num(paymentState.bankReceived));paymentState.paid=paymentState.cashReceived+paymentState.bankReceived;
  const received=paymentState.paid;
  $('#payCalc').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Fee Details</h3></div></div>${items.length?`<div class="payment-lines">${items.map(i=>`<div class="payment-line"><div class="month">${i.month}</div><div class="label">${esc(i.label)}${i.overridden?' <span class="chip">Scholarship</span>':''}</div><div class="amt">${money(i.amount)}</div></div>`).join('')}</div>`:`<div class="empty">Select one or more open months.</div>`}<div class="totals-panel polished-totals" style="margin-top:12px"><div class="row"><span>Current Fee Total</span><b>${money(currentTotal)}</b></div><div class="row"><span>Old Dues</span><b>${money(oldDues)}</b></div><div class="row"><span>Discount</span><input id="payDiscount" inputmode="decimal" type="number" min="0" step="1" value="${num(paymentState.discount)}"></div><div class="row grand"><span>Net Payable</span><b id="payNet">${money(net)}</b></div><div class="row split-receive-row"><span>Cash Received</span><input id="payCashReceived" inputmode="decimal" type="number" min="0" step="1" value="${num(paymentState.cashReceived)}"></div><div class="row split-receive-row"><span>Bank Received</span><input id="payBankReceived" inputmode="decimal" type="number" min="0" step="1" value="${num(paymentState.bankReceived)}"></div><div class="row"><span><b>Total Received</b></span><b id="payTotalReceived">${money(received)}</b></div><div class="row"><span>New Dues / Balance</span><b id="payNewDues" class="stat-red">${money(Math.max(0,net-received))}</b></div><div class="row"><span>Advance</span><b id="payAdvance">${money(Math.max(0,received-net))}</b></div></div><div class="form-actions" style="margin-top:14px"><button class="btn primary big" id="savePayment" ${(paymentState.selectedMonths.length||oldDues>0)?'':'disabled'}>Save & Print Receipt</button></div></div>`;
  const bankSelect=$('#payBank'),bankHint=$('#payBankHint');
  const recalc=()=>{
    paymentState.discount=Math.min(Math.max(0,num($('#payDiscount')?.value)),grand);
    const n=Math.max(0,grand-paymentState.discount);
    paymentState.cashReceived=Math.max(0,num($('#payCashReceived')?.value));paymentState.bankReceived=Math.max(0,num($('#payBankReceived')?.value));
    paymentState.paid=paymentState.cashReceived+paymentState.bankReceived;
    const bankOn=paymentState.bankReceived>0;
    if(bankSelect){bankSelect.disabled=!bankOn;if(!bankOn){paymentState.bankId='';bankSelect.value='';}}
    if(bankHint){
      if(!bankOn)bankHint.textContent='Enter a Bank Received amount to activate bank selection.';
      else if(!activeBanks().length)bankHint.textContent='No active online bank account. Add one from Banking first.';
      else bankHint.textContent='Select the exact bank where this Bank amount was received.';
    }
    $('#payNet').textContent=money(n);$('#payTotalReceived').textContent=money(paymentState.paid);$('#payNewDues').textContent=money(Math.max(0,n-paymentState.paid));$('#payAdvance').textContent=money(Math.max(0,paymentState.paid-n));
  };
  $('#payDiscount').oninput=recalc;$('#payCashReceived').oninput=recalc;$('#payBankReceived').oninput=recalc;$('#savePayment').onclick=savePayment;
};

savePayment=async function(){
  const s=paymentState.studentRecordKey?studentByRecordKey(paymentState.studentRecordKey):(db.students||[]).find(x=>String(x.id)===String(paymentState.studentId||'')),y=String(paymentState.year||'');
  if(!s)return toast('Select the exact student from the search results first.');
  if(String(s.year)!==y||String(s.className)!==String(paymentState.className))return toast('Student selection changed. Please select the student again.');
  if(!npDateValid(paymentState.date))return toast('Enter Nepali date as YYYY-MM-DD.');
  const cash=Math.max(0,num(paymentState.cashReceived)),bank=Math.max(0,num(paymentState.bankReceived)),totalReceived=cash+bank;
  if(totalReceived<=0)return toast('Enter Cash Received, Bank Received, or both.');
  if(bank>0&&!paymentState.bankId)return toast('Select the exact online bank account that received the Bank amount.');

  try{await Promise.all([v15LoadOnlineStudents(),v17LoadOnlineOverrides(),v17LoadOnlineReceipts(),v17LoadOnlineBanks()]);}
  catch(error){console.error(error);return toast('Could not refresh online fee state: '+(error?.message||'Unknown error'));}
  const fresh=(db.students||[]).find(x=>x.id===s.id)||s,items=currentPayItems(fresh,y,paymentState.selectedMonths),oldDues=num(fresh.dues),currentTotal=sum(items,x=>x.amount),grand=currentTotal+oldDues;
  const discount=Math.min(Math.max(0,num(paymentState.discount)),grand),net=Math.max(0,grand-discount);
  if(!items.length&&oldDues<=0)return toast('Select at least one payable month.');
  if(discount>0&&totalReceived>net)return toast('With discount, Cash + Bank cannot be higher than Net Payable.');

  const btn=$('#savePayment'),oldBtn=btn?.textContent||'Save & Print Receipt';if(btn){btn.disabled=true;btn.textContent='Saving Online...';}
  const printWin=window.open('','_blank','width=760,height=900');if(printWin){printWin.document.write('<!doctype html><html><body style="font-family:Arial;padding:24px">Saving secure online receipt…</body></html>');printWin.document.close();}
  try{
    const {data,error}=await sb.rpc('create_fee_receipt_atomic_split',{
      p_nepali_date:paymentState.date,p_academic_year:y,p_student_id:fresh.id,
      p_selected_months:(paymentState.selectedMonths||[]).map(i=>num(i)+1),p_items:v17RpcItems(items),p_discount:discount,
      p_cash_received:cash,p_bank_received:bank,p_bank_id:bank>0?paymentState.bankId:null,p_issued_by:db.settings.issuedBy||null,p_remarks:null
    });
    if(error)throw error;
    await Promise.all([v15LoadOnlineStudents(),v17LoadOnlineOverrides(),v17LoadOnlineReceipts(),v17LoadOnlineBanks()]);
    const receiptId=data?.receipt_id||'',receipt=(db.receipts||[]).find(r=>r.id===receiptId)||(db.receipts||[]).find(r=>r.receiptNo===data?.receipt_no);
    feeReceiveV9Context={year:y,className:fresh.className};
    if(receipt){showReceiptById(receipt.id,false);v17RenderSavedReceiptToWindow(printWin,receipt);}else if(printWin)printWin.close();
    toast(`Online receipt ${data?.receipt_no||''} saved — Cash ${money(cash)} + Bank ${money(bank)}.`);renderFeePayment();
  }catch(error){
    console.error('Online split fee receipt save failed:',error);if(printWin)printWin.close();toast('Fee receipt was NOT saved: '+String(error?.message||'Unknown error'));
    try{await Promise.all([v15LoadOnlineStudents(),v17LoadOnlineOverrides(),v17LoadOnlineReceipts(),v17LoadOnlineBanks()]);drawPayPanel();}catch(_){/* ignore secondary refresh */}
  }finally{if(btn){btn.disabled=false;btn.textContent=oldBtn;}}
};
window.savePayment=savePayment;

/* Receipt print shows the payment split and selected destination bank. */
receiptHTML=function(r){
  const logo=db.settings.logoData?`<img src="${db.settings.logoData}" alt="Logo">`:`<div style="font-weight:900;font-size:22px">SA</div>`,phone=esc(db.settings.phone||'—');
  const gross=v11ReceiptGross(r),net=v11ReceiptNet(r),received=v11ActualReceived(r),balance=Math.max(0,net-received),cash=v171CashReceived(r),bank=v171BankReceived(r),bankName=bank>0?bankLabel(r.bankId):'';
  return `<div class="a5-receipt a5-bordered" id="printReceipt"><div class="receipt-head"><div class="receipt-school tight-header"><h1>${esc(db.settings.schoolName)}</h1><p>${esc(db.settings.address)}</p><p><b>Phone:</b> ${phone}</p><p><b>ESTD:</b> ${esc(db.settings.estd||'')} &nbsp; <b>PAN No.:</b> ${esc(db.settings.pan||'')}</p></div><div class="receipt-logo">${logo}</div></div><div class="receipt-title">FEE RECEIPT</div><div class="receipt-meta"><div><b>Receipt No.:</b> ${esc(r.receiptNo)}</div><div><b>Nepali Date:</b> ${esc(r.date)}</div><div><b>Registration No.:</b> ${esc(r.registrationNo)}</div><div><b>Class:</b> ${esc(r.className)}</div><div><b>Student Name:</b> ${esc(r.studentName)}</div><div><b>Parent/Guardian:</b> ${esc(r.guardian||'')}</div><div style="grid-column:1/-1"><b>Fee For Month(s):</b> ${esc((r.months||[]).map(i=>NP_MONTHS[i]).join(', ')||'-')}</div></div><div class="receipt-olddues"><b>Old Dues:</b> ${num(r.oldDues)>0?money(r.oldDues):''}</div><table class="receipt-table"><thead><tr><th style="width:7%">S.N.</th><th>Particular</th><th style="width:20%">Total Amount</th><th style="width:20%">Receive Amount</th><th style="width:18%">Balance</th></tr></thead><tbody>${(r.items||[]).map((i,idx)=>`<tr><td class="center">${idx+1}</td><td>${esc(i.label)}</td><td class="num">${money(i.amount)}</td><td></td><td></td></tr>`).join('')||`<tr><td class="center">1</td><td>Old Dues Payment</td><td class="num">${money(r.oldDues)}</td><td></td><td></td></tr>`}</tbody></table><table class="receipt-summary"><tr><td>Total Amount</td><td>${money(r.currentTotal)}</td></tr><tr><td>Dues</td><td>${num(r.oldDues)>0?money(r.oldDues):''}</td></tr><tr><td><b>Grand Total</b></td><td><b>${money(gross)}</b></td></tr><tr><td>Cash Received</td><td>${money(cash)}</td></tr><tr><td>Bank Received</td><td>${money(bank)}</td></tr>${bank>0?`<tr><td>Bank Account</td><td>${esc(bankName)}</td></tr>`:''}<tr><td><b>Total Received</b></td><td><b>${money(received)}</b></td></tr><tr><td>Balance</td><td>${money(balance)}</td></tr></table><div class="amount-words"><b>Amount in Words:</b> ${esc(amountInWords(received))} only.</div><div class="receipt-note">Bill is essential to get the deposit refunded.</div><div class="receipt-sign v11-sign"><div class="sign-block left issued-by-no-line">Issued by: <b>${esc(db.settings.issuedBy||r.issuedBy||'')}</b></div><div class="sign-block accountant-dotted"><span></span><div>Accountant</div></div></div><div class="receipt-foot">Phone: ${phone} · Nepali Date: ${esc(r.date)}</div></div>`;
};

/* Split-aware Fee Receipt Register. */
drawReceiptRegister=function(){
  const arr=receiptRegisterRows();
  $('#receiptRegHost').innerHTML=arr.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Student</th><th>Class</th><th>Months</th><th class="amount">Cash</th><th class="amount">Bank</th><th class="amount">Total Received</th><th class="amount">Dues</th><th>Mode / Bank</th><th>Action</th></tr></thead><tbody>${arr.map(r=>`<tr><td>${r.date}</td><td><b>${esc(r.receiptNo)}</b></td><td>${esc(r.studentName)}</td><td>${esc(r.className)}</td><td>${esc((r.months||[]).map(i=>NP_MONTHS[i]).join(', '))}</td><td class="amount">${money(v171CashReceived(r))}</td><td class="amount">${money(v171BankReceived(r))}</td><td class="amount"><b>${money(r.paid)}</b></td><td class="amount">${money(r.balance)}</td><td>${esc(v171PaymentLabel(r))}${v171BankReceived(r)>0?`<br><small>${esc(bankLabel(r.bankId))}</small>`:''}</td><td>${isAccountant()?`<button class="btn small" onclick="showReceiptById('${r.id}')">View / Reprint</button>`:'View only'}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No online fee receipts found.</div>`;
};

/* Split-aware cash and bank balances. */
cashBalanceThrough=function(toDate='9999-99-99'){
  let bal=num(db.settings.cashOpeningBalance);
  (db.receipts||[]).filter(r=>r.date<=toDate).forEach(r=>bal+=v171CashReceived(r));
  (db.quickReceipts||[]).filter(q=>q.date<=toDate&&q.mode==='Cash').forEach(q=>bal+=num(q.amount));
  (db.expenses||[]).filter(e=>e.date<=toDate&&e.mode==='Cash').forEach(e=>bal-=num(e.amount));
  (db.bankTransactions||[]).filter(t=>t.date<=toDate).forEach(t=>{if(t.type==='cash_deposit')bal-=num(t.amount);if(t.type==='withdrawal')bal+=num(t.amount);});return bal;
};
bankBalanceThrough=function(bankId,toDate='9999-99-99'){
  const b=bankById(bankId);let bal=num(b?.openingBalance);
  (db.receipts||[]).filter(r=>r.date<=toDate&&r.bankId===bankId).forEach(r=>bal+=v171BankReceived(r));
  (db.quickReceipts||[]).filter(q=>q.date<=toDate&&q.mode==='Bank'&&q.bankId===bankId).forEach(q=>bal+=num(q.amount));
  (db.expenses||[]).filter(e=>e.date<=toDate&&e.mode==='Bank'&&e.bankId===bankId).forEach(e=>bal-=num(e.amount));
  (db.bankTransactions||[]).filter(t=>t.date<=toDate&&t.bankId===bankId).forEach(t=>{if(t.type==='cash_deposit')bal+=num(t.amount);if(t.type==='withdrawal')bal-=num(t.amount);});return bal;
};
bankingRows=function(from='',to=''){
  const rows=[],ok=d=>(!from||d>=from)&&(!to||d<=to);
  (db.receipts||[]).filter(r=>ok(r.date)&&v171BankReceived(r)>0).forEach(r=>rows.push({date:r.date,type:'Direct Fee Receipt',ref:r.receiptNo,bankId:r.bankId,details:`${r.studentName} - ${r.className}${v171CashReceived(r)>0?' · Split payment':''}`,inflow:v171BankReceived(r),outflow:0,cashIn:0,cashOut:0}));
  (db.quickReceipts||[]).filter(q=>ok(q.date)&&q.mode==='Bank').forEach(q=>rows.push({date:q.date,type:'Direct Quick Receipt',ref:q.receiptNo,bankId:q.bankId,details:q.title,inflow:q.amount,outflow:0,cashIn:0,cashOut:0}));
  (db.expenses||[]).filter(e=>ok(e.date)&&e.mode==='Bank').forEach(e=>rows.push({date:e.date,type:'Bank Expense',ref:e.voucherNo||'',bankId:e.bankId,details:`${e.head}${e.paidTo?' - '+e.paidTo:''}`,inflow:0,outflow:e.amount,cashIn:0,cashOut:0}));
  (db.bankTransactions||[]).filter(t=>ok(t.date)).forEach(t=>rows.push({date:t.date,type:t.type==='cash_deposit'?'Cash → Bank Deposit':'Bank Withdrawal → Cash',ref:t.ref||'',bankId:t.bankId,details:[t.person,t.purpose,t.remarks].filter(Boolean).join(' · '),inflow:t.type==='cash_deposit'?t.amount:0,outflow:t.type==='withdrawal'?t.amount:0,cashIn:t.type==='withdrawal'?t.amount:0,cashOut:t.type==='cash_deposit'?t.amount:0}));
  return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
};

/* Daily Collection reports the exact split instead of treating a mixed receipt as 100% Bank. */
drawDailyCollection=function(){
  const rows=dailyRows(),heads=dailyHeads(rows),cols=heads.map(h=>`<th class="amount">${esc(h)}</th>`).join('');
  const data=rows.map(r=>`<tr><td>${r.date}</td><td>${esc(r.receiptNo)}</td><td>${esc(r.studentName)}</td><td>${esc(r.className)}</td>${heads.map(h=>`<td class="amount">${itemTotalByLabel(r,h)?money(itemTotalByLabel(r,h)):'-'}</td>`).join('')}<td class="amount">${money(r.currentTotal)}</td><td class="amount">${money(r.discount)}</td><td class="amount">${money(r.paid)}</td><td class="amount">${money(r.balance)}</td><td class="amount">${v171CashReceived(r)>0?money(v171CashReceived(r)):'-'}</td><td>${v171BankReceived(r)>0?esc(bankLabel(r.bankId)):'-'}</td><td class="amount">${v171BankReceived(r)>0?money(v171BankReceived(r)):'-'}</td></tr>`).join('');
  const total=`<tr class="total-row"><td colspan="4"><b>TOTAL</b></td>${heads.map(h=>`<td class="amount">${money(sum(rows,r=>itemTotalByLabel(r,h)))}</td>`).join('')}<td class="amount">${money(sum(rows,r=>r.currentTotal))}</td><td class="amount">${money(sum(rows,r=>r.discount))}</td><td class="amount">${money(sum(rows,r=>r.paid))}</td><td class="amount">${money(sum(rows,r=>r.balance))}</td><td class="amount">${money(sum(rows,r=>v171CashReceived(r)))}</td><td><b>Direct Bank</b></td><td class="amount">${money(sum(rows,r=>v171BankReceived(r)))}</td></tr>`;
  $('#dailyHost').innerHTML=rows.length?`<div class="table-wrap cyan-table"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Student</th><th>Class</th>${cols}<th class="amount">Total Fees</th><th class="amount">Discount</th><th class="amount">Received</th><th class="amount">Dues</th><th class="amount">Cash Received</th><th>Bank Account</th><th class="amount">Bank Received</th></tr></thead><tbody>${data}${total}</tbody></table></div>`:`<div class="empty">No fee receipts in this date range.</div>`;
};
exportDailyCollection=function(){
  const rows=dailyRows(),heads=dailyHeads(rows),headers=['Date','Receipt No','Student','Class',...heads,'Total Fees','Discount','Received','Dues','Cash Received','Bank Account','Bank Received'],data=rows.map(r=>[r.date,r.receiptNo,r.studentName,r.className,...heads.map(h=>itemTotalByLabel(r,h)),r.currentTotal,r.discount,r.paid,r.balance,v171CashReceived(r),v171BankReceived(r)>0?bankLabel(r.bankId):'',v171BankReceived(r)]);
  data.push(['TOTAL','','','',...heads.map(h=>sum(rows,r=>itemTotalByLabel(r,h))),sum(rows,r=>r.currentTotal),sum(rows,r=>r.discount),sum(rows,r=>r.paid),sum(rows,r=>r.balance),sum(rows,r=>v171CashReceived(r)),'',sum(rows,r=>v171BankReceived(r))]);
  exportXLS('Daily_Collection.xls',headers,data,'Daily Collection / Fees Day Book');
};

/* Day Book mode is descriptive for mixed receipts. */
allTransactions=function(){
  const out=[];
  (db.receipts||[]).forEach(r=>out.push({date:r.date,type:'Fee Receipt',ref:r.receiptNo,details:`${r.studentName} - ${r.className}${v171BankReceived(r)>0?' · '+bankLabel(r.bankId):''}`,head:'Student Fees',mode:v171PaymentLabel(r),income:r.paid,expense:0}));
  (db.quickReceipts||[]).forEach(q=>out.push({date:q.date,type:'Quick Receipt',ref:q.receiptNo,details:`${q.receivedFrom||q.title}${q.mode==='Bank'?' · '+bankLabel(q.bankId):''}`,head:q.title,mode:q.mode,income:q.amount,expense:0}));
  (db.expenses||[]).forEach(e=>out.push({date:e.date,type:'Expense',ref:e.voucherNo||'',details:`${e.paidTo||e.remarks||''}${e.mode==='Bank'?' · '+bankLabel(e.bankId):''}`,head:e.head,mode:e.mode,income:0,expense:e.amount}));
  (db.bankTransactions||[]).forEach(t=>out.push({date:t.date,type:t.type==='cash_deposit'?'Cash to Bank':'Bank Withdrawal',ref:'',details:`${bankLabel(t.bankId)} · ${t.person||''} · ${t.purpose||''}`,head:'Banking Transfer',mode:'Transfer',income:0,expense:0}));
  return out.sort((a,b)=>a.date.localeCompare(b.date));
};

window.v171PaymentLabel=v171PaymentLabel;
/* ==================== END V17.1 FEE RECEIVE REFINEMENT ==================== */

/* ==================== FINAL ONLINE OPERATIONS V18 ====================
   Requires the numbered Remaining SQL Pack to be run in order.
   Adds: Quick Receipt / Expenses / Bank Transactions / Bank Master online,
   safe Student Year-End RPC, central settings/counters/assets, online access
   control, and secure MD/CEO report bundles.
======================================================================= */

function v18QuickFromRow(r){return {id:r.quick_receipt_id,receiptNo:r.receipt_no,date:r.nepali_date,year:String(r.academic_year||''),incomeHeadId:r.income_head_id||'',title:r.income_title||'',amount:num(r.amount),receivedFrom:r.received_from||'',mode:r.payment_mode||'Cash',bankId:r.bank_id||'',remarks:r.remarks||'',issuedBy:r.issued_by||'',status:r.status||'active'};}
function v18ExpenseFromRow(r){return {id:r.expense_id,voucherNo:r.voucher_no,date:r.nepali_date,year:String(r.academic_year||''),expenseHeadId:r.expense_head_id||'',head:r.expense_head||'',amount:num(r.amount),mode:r.payment_mode||'Cash',bankId:r.bank_id||'',paidTo:r.paid_to||'',remarks:r.remarks||'',enteredBy:r.entered_by||'',status:r.status||'active'};}
function v18BankTxFromRow(r){return {id:r.bank_transaction_id,date:r.nepali_date,year:String(r.academic_year||''),type:r.transaction_type,bankId:r.bank_id,amount:num(r.amount),person:r.person_name||'',purpose:r.purpose||'',remarks:r.remarks||'',ref:r.reference_no||'',status:r.status||'active'};}
function v18IncomeHeadFromRow(r){return {id:r.income_head_id,name:r.head_name,description:r.description||'',active:r.active!==false};}
function v18ExpenseHeadFromRow(r){return {id:r.expense_head_id,name:r.head_name,description:r.description||'',active:r.active!==false};}
function v18BankFromRow(r){return {id:r.bank_id,name:r.bank_name,accountName:r.account_name||'',accountNo:r.account_no||'',openingBalance:num(r.opening_balance),active:r.active!==false,remarks:r.remarks||''};}

async function v18SignedAsset(path){if(!path)return '';try{const {data,error}=await sb.storage.from('account-assets').createSignedUrl(path,3600);if(error)throw error;return data?.signedUrl||'';}catch(e){console.warn('Signed asset URL failed',path,e);return '';}}

async function v18LoadSharedSettings(){
  try{
    const baseResults=await Promise.all([
      sb.from('app_settings').select('*').eq('id',1).maybeSingle(),
      sb.from('academic_years').select('*').order('year',{ascending:true})
    ]);
    const setRes=baseResults[0],yearRes=baseResults[1];
    if(setRes.error)throw setRes.error;if(yearRes.error)throw yearRes.error;
    let counterRes={data:[],error:null};
    if(isAccountant()){
      counterRes=await sb.from('document_counters').select('counter_key,prefix,next_number,padding').in('counter_key',['student_registration','fee_receipt','quick_receipt','expense_voucher']);
      if(counterRes.error)throw counterRes.error;
    }
    const r=setRes.data||{};
    Object.assign(db.settings,{
      schoolName:r.school_name||db.settings.schoolName,address:r.address||db.settings.address,estd:r.estd||db.settings.estd,
      phone:r.phone||'',pan:r.pan||'',issuedBy:r.issued_by||db.settings.issuedBy,workingDate:r.working_nepali_date||db.settings.workingDate,
      cashOpeningBalance:num(r.cash_opening_balance),remindHeader:r.reminder_header||db.settings.remindHeader||'Fee Reminder',
      reminderWhatsApp:r.reminder_whatsapp||'',reminderTemplate:r.reminder_template||'',reminderOnlineNote:r.reminder_online_note||'',
      admitCardTerm:r.admit_card_term||db.settings.admitCardTerm||'First Term',admitCardTitle:r.admit_card_title||db.settings.admitCardTitle||'ADMIT CARD',
      examCoordinatorName:r.exam_coordinator_name||db.settings.examCoordinatorName||'Exam Coordinator',examCoordinatorPost:r.exam_coordinator_post||db.settings.examCoordinatorPost||'Exam Coordinator',
      principalName:r.principal_name||db.settings.principalName||'Principal',principalPost:r.principal_post||db.settings.principalPost||'Principal',
      accountantSignName:r.accountant_sign_name||db.settings.accountantSignName||'Accountant',accountantSignPost:r.accountant_sign_post||db.settings.accountantSignPost||'Accountant'
    });
    const yrs=(yearRes.data||[]).map(x=>String(x.year||'')).filter(Boolean);if(yrs.length)db.settings.academicYears=yrs;
    const counters=new Map((counterRes.data||[]).map(x=>[x.counter_key,x]));
    const fr=counters.get('fee_receipt'),qr=counters.get('quick_receipt'),ev=counters.get('expense_voucher'),sr=counters.get('student_registration');
    if(fr){db.settings.receiptPrefix=fr.prefix||'';db.settings.nextReceiptNumber=num(fr.next_number)}
    if(qr){db.settings.quickReceiptPrefix=qr.prefix||'';db.settings.nextQuickReceiptNumber=num(qr.next_number)}
    if(ev){db.settings.expensePrefix=ev.prefix||'';db.settings.nextExpenseNumber=num(ev.next_number)}
    if(sr){db.settings.registrationPrefix=sr.prefix||'';db.settings.nextRegistrationNumber=num(sr.next_number)}
    const [logo,qrImg,sigE,sigP,sigA]=await Promise.all([v18SignedAsset(r.logo_path),v18SignedAsset(r.reminder_qr_path),v18SignedAsset(r.exam_coordinator_signature_path),v18SignedAsset(r.principal_signature_path),v18SignedAsset(r.accountant_signature_path)]);
    db.settings.logoData=logo;db.settings.reminderQRData=qrImg;db.settings.examCoordinatorSignatureData=sigE;db.settings.principalSignatureData=sigP;db.settings.accountantSignatureData=sigA;
    db.settings._assetPaths={logo:r.logo_path||'',qr:r.reminder_qr_path||'',sigExam:r.exam_coordinator_signature_path||'',sigPrincipal:r.principal_signature_path||'',sigAccountant:r.accountant_signature_path||''};
  }catch(e){console.error('Shared settings load failed',e);toast('Online settings could not load: '+(e?.message||'Unknown error'));}
}

async function v18LoadOperations(){
  if(!isAccountant())return;
  const [qh,eh,q,e,t,b]=await Promise.all([
    sb.from('income_heads').select('income_head_id,head_name,description,active').eq('active',true).order('head_name'),
    sb.from('expense_heads').select('expense_head_id,head_name,description,active').eq('active',true).order('head_name'),
    sb.from('quick_receipts').select('*').eq('status','active').order('nepali_date',{ascending:false}),
    sb.from('expenses').select('*').eq('status','active').order('nepali_date',{ascending:false}),
    sb.from('bank_transactions').select('*').eq('status','active').order('nepali_date',{ascending:false}),
    sb.from('banks').select('bank_id,bank_name,account_name,account_no,opening_balance,active,remarks').order('bank_name')
  ]);
  for(const x of [qh,eh,q,e,t,b])if(x.error)throw x.error;
  db.incomeHeads=(qh.data||[]).map(v18IncomeHeadFromRow);db.expenseHeads=(eh.data||[]).map(v18ExpenseHeadFromRow);
  db.quickReceipts=(q.data||[]).map(v18QuickFromRow);db.expenses=(e.data||[]).map(v18ExpenseFromRow);db.bankTransactions=(t.data||[]).map(v18BankTxFromRow);db.banks=(b.data||[]).map(v18BankFromRow);
}

async function v18RefreshAll(){await v18LoadSharedSettings();if(isAccountant()){await v17RefreshAllOnline();await v18LoadOperations();}populateYears();updateSideLogo();}

const _v18SaveDBBase=saveDB;
saveDB=function(){const keep={quickReceipts:db.quickReceipts,expenses:db.expenses,bankTransactions:db.bankTransactions,incomeHeads:db.incomeHeads,expenseHeads:db.expenseHeads};try{db.quickReceipts=[];db.expenses=[];db.bankTransactions=[];db.incomeHeads=[];db.expenseHeads=[];_v18SaveDBBase();}finally{Object.assign(db,keep);}};

const _v18OpenBase=openOnlineSession;
openOnlineSession=async function(user,expectedRole=null){await _v18OpenBase(user,expectedRole);try{await v18LoadSharedSettings();if(isAccountant())await v18LoadOperations();populateYears();if($('#workingDate'))$('#workingDate').value=db.settings.workingDate;updateSideLogo();renderPage();}catch(e){console.error('V18 online load failed',e);toast('Login succeeded, but final online data could not load: '+(e?.message||'Unknown error'));}};

const _v18RefreshBtn=document.getElementById('refreshBtn');if(_v18RefreshBtn){_v18RefreshBtn.onclick=async()=>{try{await v18RefreshAll();renderPage();toast('All online data refreshed.');}catch(e){console.error(e);toast('Refresh failed: '+(e?.message||'Unknown error'));}};}

function v18ToggleBank(selectMode,bankSelect){const mode=selectMode?.value||'Cash';if(bankSelect){bankSelect.disabled=mode!=='Bank';if(mode!=='Bank')bankSelect.value='';}}

/* Quick Receipt — fully online */
renderQuickReceipt=function(){if(!isAccountant())return unauthorized();const heads=(db.incomeHeads||[]).filter(x=>x.active!==false);$('#content').innerHTML=`<div class="two-col"><div class="section premium-section"><div class="section-title"><div><h3>Quick Receipt</h3></div><div class="next-number"><small>Receipt No.</small><b>Auto Generated</b></div></div><form id="quickForm" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(workingDate())}" required></div><div><label>Payment Mode</label><select name="mode"><option>Cash</option><option>Bank</option></select></div><div><label>Income Head</label><select name="incomeHeadId"><option value="">Custom / Other</option>${heads.map(h=>`<option value="${h.id}">${esc(h.name)}</option>`).join('')}</select></div><div><label>Custom Title (only if needed)</label><input name="title" placeholder="Rent / Donation / Other"></div><div><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" required></div><div><label>Received From</label><input name="receivedFrom"></div><div class="full"><label>Bank Account</label><select name="bankId" disabled>${bankOptions()}</select></div><div class="full"><label>Remarks</label><textarea name="remarks"></textarea></div><div class="full form-actions"><button class="btn primary big">Save & Print Quick Receipt</button></div></form></div><div class="section premium-section"><div class="section-title"><div><h3>Quick Receipt Register</h3></div><button class="btn green" id="quickExport">Export Excel</button></div><div id="quickList"></div></div></div>`;const f=$('#quickForm'),mode=f.elements.mode,bank=f.elements.bankId;mode.onchange=()=>v18ToggleBank(mode,bank);f.onsubmit=saveQuickReceipt;$('#quickExport').onclick=exportQuickReceipts;drawQuickList();};

saveQuickReceipt=async function(e){e.preventDefault();const f=e.target,fd=new FormData(f),date=fd.get('date'),mode=fd.get('mode'),amount=num(fd.get('amount'));if(!npDateValid(date))return toast('Use Nepali date YYYY-MM-DD.');if(amount<=0)return toast('Enter an amount.');if(mode==='Bank'&&!fd.get('bankId'))return toast('Select Bank Account.');const btn=f.querySelector('button[type="submit"]'),old=btn.textContent;btn.disabled=true;btn.textContent='Saving…';try{const {data,error}=await sb.rpc('create_quick_receipt_atomic',{p_nepali_date:date,p_academic_year:yearOfDate(date),p_amount:amount,p_payment_mode:mode,p_income_head_id:fd.get('incomeHeadId')||null,p_income_title:fd.get('title')||null,p_received_from:fd.get('receivedFrom')||null,p_bank_id:mode==='Bank'?(fd.get('bankId')||null):null,p_remarks:fd.get('remarks')||null,p_issued_by:db.settings.issuedBy||null});if(error)throw error;await v18LoadOperations();const q=db.quickReceipts.find(x=>x.id===data?.quick_receipt_id)||db.quickReceipts.find(x=>x.receiptNo===data?.receipt_no);if(q)showQuickReceipt(q.id,true);renderQuickReceipt();toast('Online Quick Receipt saved.');}catch(err){console.error(err);toast('Quick Receipt NOT saved: '+(err?.message||'Unknown error'));}finally{btn.disabled=false;btn.textContent=old;}};

quickReceiptHTML=function(q){const logo=db.settings.logoData?`<img src="${db.settings.logoData}">`:`<b>SA</b>`,bank=q.mode==='Bank'?bankLabel(q.bankId):'';return `<div class="a5-receipt"><div class="receipt-head"><div class="receipt-school"><h1>${esc(db.settings.schoolName)}</h1><p>${esc(db.settings.address)}</p><p>ESTD: ${esc(db.settings.estd)} · Tel: ${esc(db.settings.phone)} · PAN: ${esc(db.settings.pan)}</p></div><div class="receipt-logo">${logo}</div></div><div class="receipt-title">QUICK RECEIPT</div><div class="receipt-meta"><div><b>Receipt No.:</b> ${esc(q.receiptNo)}</div><div><b>Nepali Date:</b> ${esc(q.date)}</div><div><b>Received From:</b> ${esc(q.receivedFrom||'-')}</div><div><b>Mode:</b> ${esc(q.mode)}${bank?` — ${esc(bank)}`:''}</div></div><table class="receipt-table" style="margin-top:10px"><thead><tr><th>S.N.</th><th>Particular</th><th>Amount</th></tr></thead><tbody><tr><td class="center">1</td><td>${esc(q.title)}${q.remarks?`<br><small>${esc(q.remarks)}</small>`:''}</td><td class="num">${money(q.amount)}</td></tr></tbody></table><div class="amount-words"><b>Amount in Words:</b> ${esc(amountInWords(q.amount))} only.</div><div class="receipt-sign" style="margin-top:35px"><div class="sign-block left">Issued by: <b>${esc(q.issuedBy||db.settings.issuedBy||'')}</b></div><div class="sign-block">Accountant</div></div></div>`;};

drawQuickList=function(){const h=$('#quickList');if(!h)return;const a=[...(db.quickReceipts||[])].sort((x,y)=>y.date.localeCompare(x.date));h.innerHTML=a.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Income</th><th>From</th><th>Mode / Bank</th><th class="amount">Amount</th><th>Action</th></tr></thead><tbody>${a.map(q=>`<tr><td>${q.date}</td><td><b>${esc(q.receiptNo)}</b></td><td>${esc(q.title)}</td><td>${esc(q.receivedFrom||'')}</td><td>${esc(q.mode)}${q.mode==='Bank'?`<br><small>${esc(bankLabel(q.bankId))}</small>`:''}</td><td class="amount">${money(q.amount)}</td><td><button class="btn small" onclick="showQuickReceipt('${q.id}')">View / Reprint</button> <button class="btn small red" onclick="v18VoidQuick('${q.id}')">Cancel</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No online Quick Receipts.</div>`;};
async function v18VoidQuick(id){const reason=prompt('Cancellation reason:');if(!reason)return;try{const {error}=await sb.rpc('void_quick_receipt',{p_quick_receipt_id:id,p_reason:reason});if(error)throw error;await v18LoadOperations();renderQuickReceipt();toast('Quick Receipt cancelled.');}catch(e){toast('Could not cancel: '+(e?.message||'Unknown error'));}}
window.v18VoidQuick=v18VoidQuick;

/* Expenses — fully online */
renderExpenses=function(){if(!isAccountant())return unauthorized();const heads=(db.expenseHeads||[]).filter(x=>x.active!==false);$('#content').innerHTML=`<div class="two-col"><div class="section premium-section"><div class="section-title"><div><h3>Expense Entry</h3></div><div class="next-number"><small>Voucher No.</small><b>Auto Generated</b></div></div><form id="expForm" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(workingDate())}" required></div><div><label>Mode</label><select name="mode"><option>Cash</option><option>Bank</option></select></div><div><label>Expense Head</label><select name="expenseHeadId"><option value="">Custom / Other</option>${heads.map(h=>`<option value="${h.id}">${esc(h.name)}</option>`).join('')}</select></div><div><label>Custom Head</label><input name="head"></div><div><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" required></div><div><label>Paid To</label><input name="paidTo"></div><div class="full"><label>Bank Account</label><select name="bankId" disabled>${bankOptions()}</select></div><div class="full"><label>Remarks</label><textarea name="remarks"></textarea></div><div class="full form-actions"><button class="btn primary">Save Expense</button></div></form></div><div class="section premium-section"><div class="section-title"><div><h3>Expense Register</h3></div><button class="btn green" id="expExport">Export Excel</button></div><div id="expHost"></div></div></div>`;const f=$('#expForm'),mode=f.elements.mode,bank=f.elements.bankId;mode.onchange=()=>v18ToggleBank(mode,bank);f.onsubmit=v18SaveExpense;$('#expExport').onclick=()=>exportXLS('Expenses.xls',['Voucher No','Date','Head','Paid To','Mode','Bank','Amount','Remarks'],db.expenses.map(x=>[x.voucherNo,x.date,x.head,x.paidTo,x.mode,x.mode==='Bank'?bankLabel(x.bankId):'',x.amount,x.remarks]),'Expense Register');v18DrawExpenses();};
async function v18SaveExpense(e){e.preventDefault();const f=e.target,fd=new FormData(f),date=fd.get('date'),mode=fd.get('mode'),amount=num(fd.get('amount'));if(!npDateValid(date))return toast('Use Nepali date YYYY-MM-DD.');if(amount<=0)return toast('Enter an amount.');if(mode==='Bank'&&!fd.get('bankId'))return toast('Select Bank Account.');const btn=f.querySelector('button[type="submit"]'),old=btn.textContent;btn.disabled=true;btn.textContent='Saving…';try{const {error}=await sb.rpc('create_expense_atomic',{p_nepali_date:date,p_academic_year:yearOfDate(date),p_amount:amount,p_payment_mode:mode,p_expense_head_id:fd.get('expenseHeadId')||null,p_expense_head:fd.get('head')||null,p_paid_to:fd.get('paidTo')||null,p_bank_id:mode==='Bank'?(fd.get('bankId')||null):null,p_remarks:fd.get('remarks')||null,p_entered_by:db.settings.issuedBy||null});if(error)throw error;await v18LoadOperations();renderExpenses();toast('Online Expense saved.');}catch(err){console.error(err);toast('Expense NOT saved: '+(err?.message||'Unknown error'));}finally{btn.disabled=false;btn.textContent=old;}}
function v18DrawExpenses(){const h=$('#expHost');if(!h)return;const rows=[...(db.expenses||[])].sort((a,b)=>b.date.localeCompare(a.date));h.innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Voucher</th><th>Date</th><th>Head</th><th>Paid To</th><th>Mode / Bank</th><th class="amount">Amount</th><th>Remarks</th><th>Action</th></tr></thead><tbody>${rows.map(e=>`<tr><td><b>${esc(e.voucherNo)}</b></td><td>${e.date}</td><td>${esc(e.head)}</td><td>${esc(e.paidTo||'')}</td><td>${esc(e.mode)}${e.mode==='Bank'?`<br><small>${esc(bankLabel(e.bankId))}</small>`:''}</td><td class="amount">${money(e.amount)}</td><td>${esc(e.remarks||'')}</td><td><button class="btn small red" onclick="v18VoidExpense('${e.id}')">Cancel</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No online expenses.</div>`;}
async function v18VoidExpense(id){const reason=prompt('Cancellation reason:');if(!reason)return;try{const {error}=await sb.rpc('void_expense',{p_expense_id:id,p_reason:reason});if(error)throw error;await v18LoadOperations();renderExpenses();toast('Expense cancelled.');}catch(e){toast('Could not cancel: '+(e?.message||'Unknown error'));}}
window.v18VoidExpense=v18VoidExpense;

/* Bank master + bank transactions — fully online */
openBankForm=function(id=''){if(!isAccountant())return;const b=bankById(id);openModal('BANK MASTER',b?'Edit Bank Account':'New Bank Account',`<form id="bankForm" class="form-grid"><div class="full"><label>Bank Name</label><input name="name" value="${esc(b?.name||'')}" required></div><div><label>Account Name</label><input name="accountName" value="${esc(b?.accountName||'')}"></div><div><label>Account No.</label><input name="accountNo" value="${esc(b?.accountNo||'')}"></div><div><label>Opening Balance</label><input name="openingBalance" type="number" step="1" value="${num(b?.openingBalance)}"></div><div><label>Status</label><select name="active"><option value="true">Active</option><option value="false">Inactive</option></select></div><div class="full form-actions"><button type="button" class="btn" onclick="closeModal()">Close</button><button class="btn primary">Save Bank</button></div></form>`);const f=$('#bankForm');f.elements.active.value=String(b?.active!==false);f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f),payload={bank_name:fd.get('name'),account_name:fd.get('accountName')||null,account_no:fd.get('accountNo')||null,opening_balance:num(fd.get('openingBalance')),active:fd.get('active')==='true'};try{const q=b?sb.from('banks').update(payload).eq('bank_id',b.id):sb.from('banks').insert(payload);const {error}=await q;if(error)throw error;await v18LoadOperations();closeModal();renderBanking();toast('Online Bank Account saved.');}catch(err){toast('Bank was NOT saved: '+(err?.message||'Unknown error'));}};};
window.openBankForm=openBankForm;

saveBankTransaction=async function(e){e.preventDefault();const f=e.target,fd=new FormData(f),date=fd.get('date'),type=fd.get('type'),bankId=fd.get('bankId'),amount=num(fd.get('amount'));if(!npDateValid(date))return toast('Use Nepali date YYYY-MM-DD.');if(!bankId)return toast('Select a bank.');if(amount<=0)return toast('Enter an amount.');const btn=f.querySelector('button[type="submit"]'),old=btn.textContent;btn.disabled=true;btn.textContent='Saving…';try{const {error}=await sb.rpc('create_bank_transaction_atomic',{p_nepali_date:date,p_academic_year:yearOfDate(date),p_transaction_type:type,p_bank_id:bankId,p_amount:amount,p_person_name:fd.get('person')||null,p_purpose:fd.get('purpose')||null,p_remarks:fd.get('remarks')||null,p_reference_no:null});if(error)throw error;await v18LoadOperations();renderBanking();toast(type==='cash_deposit'?'Cash deposited to bank online.':'Bank withdrawal saved online.');}catch(err){toast('Bank transaction NOT saved: '+(err?.message||'Unknown error'));}finally{btn.disabled=false;btn.textContent=old;}};
window.saveBankTransaction=saveBankTransaction;

/* Year-end student update — server-side atomic */
applyStudentUpdate=async function(){const y=$('#updYear').value,ny=String(num(y)+1),selected=[];$$('.updAction').forEach(a=>{if(a.value)selected.push({s:studentById(a.dataset.id),action:a.value,target:$(`.updTarget[data-id="${a.dataset.id}"]`)?.value});});if(!selected.length)return toast('Choose at least one student action.');const blocked=selected.filter(x=>(x.action==='Transfer'||x.action==='Dropout')&&num(x.s.dues)>0);if(blocked.length)return alert('Clear dues before Transfer/Dropout:\n'+blocked.map(x=>`${x.s.name}: ${money(x.s.dues)}`).join('\n'));const summary=selected.map(x=>`${x.s.name}: ${x.action}${x.action==='Promote'||x.action==='Repeat'?' → '+(x.action==='Repeat'?x.s.className:x.target):''}`).join('\n');if(!confirm(`Apply these ONLINE updates for ${ny}?\n\n${summary}`))return;try{for(const x of selected){const {error}=await sb.rpc('apply_student_year_end_action_atomic',{p_student_id:x.s.id,p_action:x.action,p_target_class:x.action==='Promote'?x.target:null,p_actor:db.settings.issuedBy||null});if(error)throw new Error(`${x.s.name}: ${error.message}`);}await v15LoadOnlineStudents();renderStudentUpdate();toast(`Student update applied online for ${ny}.`);}catch(e){console.error(e);toast('Student update stopped: '+(e?.message||'Unknown error'));}};
window.applyStudentUpdate=applyStudentUpdate;

/* Hall No. is a student master field: write online. */
const _v18DrawAdmitBase=drawAdmitList;drawAdmitList=function(){_v18DrawAdmitBase();$$('.hallInput').forEach(inp=>inp.onchange=async()=>{const s=studentById(inp.dataset.id);if(!s)return;const value=inp.value||null;try{const {error}=await sb.from('students').update({admit_hall_no:value}).eq('id',s.id);if(error)throw error;s.admitHallNo=value||'';toast('Hall No. saved online.');}catch(e){toast('Hall No. NOT saved: '+(e?.message||'Unknown error'));}});};

/* Central Settings + Storage */
async function v18SaveAppSettings(payload,msg){const {error}=await sb.from('app_settings').update(payload).eq('id',1);if(error)throw error;await v18LoadSharedSettings();toast(msg||'Online settings saved.');}
async function v18UploadAsset(file,pathColumn,stableBase){if(!file)return;const ext=(file.name.split('.').pop()||'png').toLowerCase().replace(/[^a-z0-9]/g,'')||'png',path=`settings/${stableBase}.${ext}`;const {error}=await sb.storage.from('account-assets').upload(path,file,{upsert:true,contentType:file.type||undefined});if(error)throw error;await v18SaveAppSettings({[pathColumn]:path},'Asset uploaded online.');renderSettings();}
async function v18RemoveAsset(key,pathColumn){const path=db.settings._assetPaths?.[key]||'';try{if(path)await sb.storage.from('account-assets').remove([path]);await v18SaveAppSettings({[pathColumn]:null},'Asset removed.');renderSettings();}catch(e){toast('Could not remove asset: '+(e?.message||'Unknown error'));}}


/* ============================================================
   V20 — SECURE CEO / MD PASSWORD RESET
   Service-role credentials stay inside the Accounts Edge Function.
   The browser sends only the logged-in Accountant access token.
   ============================================================ */
const V20_PASSWORD_RESET_FUNCTION=`${SUPABASE_URL}/functions/v1/reset-role-password`;

async function v20ResetRolePassword(role,newPassword){
  if(!isAccountant())throw new Error('Accountant access required.');
  const target=String(role||'').trim().toLowerCase();
  if(!['ceo','md'].includes(target))throw new Error('Invalid account role.');
  if(String(newPassword||'').length<6)throw new Error('Password must contain at least 6 characters.');

  const {data:{session},error:sessionError}=await sb.auth.getSession();
  if(sessionError)throw sessionError;
  if(!session?.access_token)throw new Error('Your Accounts login session has expired. Please login again.');

  const response=await fetch(V20_PASSWORD_RESET_FUNCTION,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'apikey':SUPABASE_PUBLISHABLE_KEY,
      'Authorization':`Bearer ${session.access_token}`
    },
    body:JSON.stringify({role:target,new_password:String(newPassword)})
  });

  let payload={};
  try{payload=await response.json();}catch(_e){}
  if(!response.ok)throw new Error(payload?.error||`Password reset failed (${response.status}).`);
  return payload;
}

function v20BindRolePasswordReset(formId,role,label){
  const form=$('#'+formId);
  if(!form)return;

  form.querySelectorAll('input,button').forEach(x=>x.disabled=false);
  if(!form.querySelector('.v20-reset-note')){
    form.insertAdjacentHTML(
      'beforeend',
      '<div class="full card-note v20-reset-note">Secure server-side reset. The service-role key is never stored in this browser.</div>'
    );
  }

  form.onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(form);
    const next=String(fd.get('next')||'');
    const confirmPassword=String(fd.get('confirm')||'');
    if(next!==confirmPassword)return toast('New passwords do not match.');
    if(next.length<6)return toast('Use at least 6 characters for the new password.');
    if(!confirm(`Reset ${label} password now?`))return;

    const btn=form.querySelector('button[type="submit"],button');
    const oldText=btn?.textContent||'Reset Password';
    if(btn){btn.disabled=true;btn.textContent='Resetting…';}
    try{
      await v20ResetRolePassword(role,next);
      form.reset();
      toast(`${label} password reset successfully.`);
    }catch(err){
      console.error('Role password reset failed:',err);
      toast(err?.message||`${label} password reset failed.`);
    }finally{
      if(btn){btn.disabled=false;btn.textContent=oldText;}
    }
  };
}

const _v18RenderSettingsBase=renderSettings;renderSettings=function(){_v18RenderSettingsBase();if(!isAccountant())return;const set=$('#setForm');if(set)set.onsubmit=async e=>{e.preventDefault();const fd=new FormData(set);try{await v18SaveAppSettings({school_name:fd.get('schoolName'),address:fd.get('address'),estd:fd.get('estd'),phone:fd.get('phone'),pan:fd.get('pan'),issued_by:fd.get('issuedBy'),working_nepali_date:fd.get('workingDate'),cash_opening_balance:num(fd.get('cashOpeningBalance'))},'General settings saved online.');renderSettings();}catch(err){toast('Settings NOT saved: '+(err?.message||'Unknown error'));}};const numForm=$('#numberForm');if(numForm)numForm.onsubmit=async e=>{e.preventDefault();const fd=new FormData(numForm),rows=[['fee_receipt',fd.get('receiptPrefix'),fd.get('nextReceiptNumber')],['quick_receipt',fd.get('quickReceiptPrefix'),fd.get('nextQuickReceiptNumber')],['expense_voucher',fd.get('expensePrefix'),fd.get('nextExpenseNumber')],['student_registration',fd.get('registrationPrefix'),fd.get('nextRegistrationNumber')]];try{for(const [key,prefix,next] of rows){const {error}=await sb.from('document_counters').update({prefix:prefix||'',next_number:Math.max(1,num(next))}).eq('counter_key',key);if(error)throw error;}await v18LoadSharedSettings();renderSettings();toast('Numbering settings saved online.');}catch(err){toast('Numbering NOT saved: '+(err?.message||'Unknown error'));}};const remind=$('#remindForm');if(remind)remind.onsubmit=async e=>{e.preventDefault();const fd=new FormData(remind);try{await v18SaveAppSettings({reminder_header:fd.get('remindHeader'),reminder_whatsapp:fd.get('reminderWhatsApp'),reminder_template:fd.get('reminderTemplate'),reminder_online_note:fd.get('reminderOnlineNote')},'Reminder settings saved online.');renderSettings();}catch(err){toast('Reminder settings NOT saved: '+(err?.message||'Unknown error'));}};const admit=$('#admitSetForm');if(admit)admit.onsubmit=async e=>{e.preventDefault();const fd=new FormData(admit);try{await v18SaveAppSettings({admit_card_term:fd.get('admitCardTerm'),admit_card_title:fd.get('admitCardTitle'),exam_coordinator_name:fd.get('examCoordinatorName'),exam_coordinator_post:fd.get('examCoordinatorPost'),principal_name:fd.get('principalName'),principal_post:fd.get('principalPost'),accountant_sign_name:fd.get('accountantSignName'),accountant_sign_post:fd.get('accountantSignPost')},'Admit Card settings saved online.');renderSettings();}catch(err){toast('Admit Card settings NOT saved: '+(err?.message||'Unknown error'));}};
  const logo=$('#logoUpload'),qr=$('#qrUpload'),se=$('#sigExamUpload'),sp=$('#sigPrincipalUpload'),sa=$('#sigAccountantUpload');if(logo)logo.onchange=e=>v18UploadAsset(e.target.files?.[0],'logo_path','school-logo');if(qr)qr.onchange=e=>v18UploadAsset(e.target.files?.[0],'reminder_qr_path','reminder-qr');if(se)se.onchange=e=>v18UploadAsset(e.target.files?.[0],'exam_coordinator_signature_path','exam-signature');if(sp)sp.onchange=e=>v18UploadAsset(e.target.files?.[0],'principal_signature_path','principal-signature');if(sa)sa.onchange=e=>v18UploadAsset(e.target.files?.[0],'accountant_signature_path','accountant-signature');const rmLogo=$('#removeLogo');if(rmLogo)rmLogo.onclick=()=>v18RemoveAsset('logo','logo_path');const rmQR=$('#removeQR');if(rmQR)rmQR.onclick=()=>v18RemoveAsset('qr','reminder_qr_path');$$('[data-remove-sig]').forEach(btn=>btn.onclick=()=>{const key=btn.dataset.removeSig;if(key==='examCoordinatorSignatureData')v18RemoveAsset('sigExam','exam_coordinator_signature_path');if(key==='principalSignatureData')v18RemoveAsset('sigPrincipal','principal_signature_path');if(key==='accountantSignatureData')v18RemoveAsset('sigAccountant','accountant_signature_path');});
  const own=$('#changeOwn');if(own)own.onsubmit=async e=>{e.preventDefault();const fd=new FormData(own);if(fd.get('next')!==fd.get('confirm'))return toast('New passwords do not match.');try{const {error:reauth}=await sb.auth.signInWithPassword({email:ACCOUNT_EMAILS.accountant,password:fd.get('current')});if(reauth)throw new Error('Current password is incorrect.');const {error}=await sb.auth.updateUser({password:fd.get('next')});if(error)throw error;await logout('Password changed. Please login again.');}catch(err){toast(err?.message||'Password change failed.');}};v20BindRolePasswordReset('resetCEO','ceo','CEO');v20BindRolePasswordReset('resetMD','md','MD');
};

/* MD/CEO Access Control — central user_report_permissions */
const V18_PERM_DB={dashboard:'dashboard',studentList:'student_directory',studentSearch:'student_transaction_search',receiptRegister:'fee_receipt_register',dailyCollection:'daily_collection',outstanding:'outstanding_reminder',examHallPass:'exam_hall_pass',quickRegister:'quick_receipt_register',monthly:'monthly_summary',headwise:'headwise_collection',daybook:'daybook',reports:'general_reports',banking:'banking_report'};
const _v18RenderAccessBase=renderAccess;renderAccess=function(){_v18RenderAccessBase();if(!isAccountant())return;$$('.permCheck').forEach(c=>c.onchange=async()=>{const role=c.dataset.role,key=c.dataset.key,reportKey=V18_PERM_DB[key];if(!reportKey)return toast('This permission is not mapped online yet.');try{const {data:profile,error:pErr}=await sb.from('app_users').select('auth_user_id').eq('role',role).eq('active',true).maybeSingle();if(pErr)throw pErr;if(!profile?.auth_user_id)throw new Error('Role account not found.');const {error}=await sb.from('user_report_permissions').upsert({auth_user_id:profile.auth_user_id,report_key:reportKey,can_view:c.checked},{onConflict:'auth_user_id,report_key'});if(error)throw error;db.settings.permissions[role]=db.settings.permissions[role]||{};db.settings.permissions[role][key]=c.checked;toast(`${roleName(role)} online access updated.`);}catch(e){c.checked=!c.checked;toast('Access update failed: '+(e?.message||'Unknown error'));}});};

/* Safe latest Fee Receipt void. */
async function v18VoidFeeReceipt(id){const reason=prompt('Cancellation reason (latest receipt only):');if(!reason)return;try{const {error}=await sb.rpc('void_latest_fee_receipt_atomic',{p_receipt_id:id,p_reason:reason});if(error)throw error;await Promise.all([v15LoadOnlineStudents(),v17LoadOnlineReceipts()]);renderPage();toast('Fee Receipt cancelled safely.');}catch(e){toast('Could not cancel receipt: '+(e?.message||'Unknown error'));}}
window.v18VoidFeeReceipt=v18VoidFeeReceipt;
const _v18DrawReceiptReg=drawReceiptRegister;drawReceiptRegister=function(){_v18DrawReceiptReg();if(!isAccountant())return;$$('#receiptRegHost tbody tr').forEach(tr=>{const btn=tr.querySelector('button');if(!btn)return;const m=btn.getAttribute('onclick')?.match(/showReceiptById\('([^']+)'\)/);if(m){const voidBtn=document.createElement('button');voidBtn.className='btn small red';voidBtn.textContent='Cancel Receipt';voidBtn.onclick=()=>v18VoidFeeReceipt(m[1]);btn.parentElement.append(' ',voidBtn);}});};

/* ---------- Secure read-only report portal for MD / CEO ---------- */
async function v18ReportCall(key,from='',to='',year=''){const {data,error}=await sb.rpc('report_portal_bundle',{p_report_key:key,p_from_date:from||null,p_to_date:to||null,p_year:year||null});if(error)throw error;return data;}
function v18ObjTable(rows,columns){return rows?.length?`<div class="table-wrap"><table><thead><tr>${columns.map(c=>`<th>${esc(c[1])}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${columns.map(c=>`<td class="${c[2]||''}">${c[3]==='money'?money(r[c[0]]):esc(r[c[0]]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:`<div class="empty">No records.</div>`;}

const _v18RenderDashAccountant=renderDashboard;renderDashboard=function(){if(isAccountant())return _v18RenderDashAccountant();if(!hasPermission('dashboard'))return unauthorized();$('#content').innerHTML='<div class="section"><div class="empty">Loading dashboard…</div></div>';v18ReportCall('dashboard','','',getYear()).then(d=>{$('#content').innerHTML=`<div class="dashboard-welcome"><div><span class="dashboard-eyebrow">${esc(roleName())} · READ ONLY</span><h3>Accounts Overview</h3></div><div class="dashboard-date"><span>Academic Year</span><b>${esc(getYear())}</b></div></div><div class="dashboard-grid premium-dashboard-grid"><div class="dash-card premium-dash-card tone-green"><div class="dash-card-head"><h3>Fee Collection</h3></div><div class="dash-value">${money(d.fee_received)}</div></div><div class="dash-card premium-dash-card tone-cyan"><div class="dash-card-head"><h3>Other Income</h3></div><div class="dash-value">${money(d.quick_income)}</div></div><div class="dash-card premium-dash-card tone-red"><div class="dash-card-head"><h3>Expenses</h3></div><div class="dash-value">${money(d.expenses)}</div></div><div class="dash-card premium-dash-card tone-amber"><div class="dash-card-head"><h3>Outstanding</h3></div><div class="dash-value">${money(d.dues)}</div></div><div class="dash-card premium-dash-card tone-blue"><div class="dash-card-head"><h3>Cash Balance</h3></div><div class="dash-value">${money(d.cash_balance)}</div></div><div class="dash-card premium-dash-card tone-navy"><div class="dash-card-head"><h3>Bank Balance</h3></div><div class="dash-value">${money(d.bank_balance)}</div></div></div>`;}).catch(e=>{$('#content').innerHTML=`<div class="empty">${esc(e.message)}</div>`;});};

const _v18DailyAccountant=renderDailyCollection;renderDailyCollection=function(){if(isAccountant())return _v18DailyAccountant();if(!hasPermission('dailyCollection'))return unauthorized();$('#content').innerHTML=`<div class="section"><div class="section-title"><div><h3>Daily Collection — Read Only</h3></div></div><div class="toolbar"><div class="field"><label>From</label><input id="roFrom" value="${esc(workingDate())}"></div><div class="field"><label>To</label><input id="roTo" value="${esc(workingDate())}"></div><button class="btn cyan" id="roLoad">Load</button></div><div id="roHost"></div></div>`;const load=async()=>{try{const rows=await v18ReportCall('daily_collection',$('#roFrom').value,$('#roTo').value,'');$('#roHost').innerHTML=v18ObjTable(rows,[['nepali_date','Date'],['receipt_no','Receipt No.'],['student_name','Student'],['class_name','Class'],['received_amount','Total Received','amount','money'],['cash_received','Cash Received','amount','money'],['bank_received','Bank Received','amount','money'],['balance','Dues','amount','money']]);}catch(e){$('#roHost').innerHTML=`<div class="empty">${esc(e.message)}</div>`;}};$('#roLoad').onclick=load;load();};

const _v18MonthlyAccountant=renderMonthly;renderMonthly=function(){if(isAccountant())return _v18MonthlyAccountant();if(!hasPermission('monthly'))return unauthorized();$('#content').innerHTML='<div class="section"><div id="roHost" class="empty">Loading monthly summary…</div></div>';v18ReportCall('monthly_summary','','',getYear()).then(rows=>{$('#roHost').outerHTML=v18ObjTable(rows.map(r=>({...r,month:NP_MONTHS[num(r.month_no)-1]||r.month_no,total_income:num(r.fee_collection)+num(r.quick_income),net:num(r.fee_collection)+num(r.quick_income)-num(r.expense)})),[['month','Month'],['fee_collection','Fee Collection','amount','money'],['quick_income','Other Income','amount','money'],['total_income','Total Income','amount','money'],['expense','Expense','amount','money'],['net','Net','amount','money']]);}).catch(e=>{$('#roHost').textContent=e.message;});};

const _v18HeadAccountant=renderHeadwise;renderHeadwise=function(){if(isAccountant())return _v18HeadAccountant();if(!hasPermission('headwise'))return unauthorized();$('#content').innerHTML='<div class="section"><div id="roHost" class="empty">Loading head-wise report…</div></div>';v18ReportCall('headwise_collection','','',getYear()).then(rows=>{$('#roHost').outerHTML=v18ObjTable(rows,[['head','Head'],['amount','Amount','amount','money']]);}).catch(e=>{$('#roHost').textContent=e.message;});};

const _v18DayAccountant=renderDayBook;renderDayBook=function(){if(isAccountant())return _v18DayAccountant();if(!hasPermission('daybook'))return unauthorized();$('#content').innerHTML=`<div class="section"><div class="toolbar"><div class="field"><label>From</label><input id="roFrom" value="${esc(workingDate())}"></div><div class="field"><label>To</label><input id="roTo" value="${esc(workingDate())}"></div><button class="btn cyan" id="roLoad">Load Day Book</button></div><div id="roHost"></div></div>`;const load=async()=>{try{const rows=await v18ReportCall('daybook',$('#roFrom').value,$('#roTo').value,'');$('#roHost').innerHTML=v18ObjTable(rows,[['nepali_date','Date'],['entry_type','Type'],['reference_no','Reference'],['head','Head'],['details','Details'],['mode','Mode'],['income','Income','amount','money'],['expense','Expense','amount','money']]);}catch(e){$('#roHost').innerHTML=`<div class="empty">${esc(e.message)}</div>`;}};$('#roLoad').onclick=load;load();};

const _v18ReportsAccountant=renderReports;renderReports=function(){if(isAccountant())return _v18ReportsAccountant();if(!hasPermission('reports'))return unauthorized();$('#content').innerHTML=`<div class="section"><div class="toolbar"><div class="field"><label>From</label><input id="roFrom" value="${esc(workingDate())}"></div><div class="field"><label>To</label><input id="roTo" value="${esc(workingDate())}"></div><button class="btn cyan" id="roLoad">Load Summary</button></div><div id="roHost"></div></div>`;const load=async()=>{try{const d=await v18ReportCall('general_reports',$('#roFrom').value,$('#roTo').value,getYear());$('#roHost').innerHTML=`<div class="summary-strip"><div class="summary-box"><small>Fee Income</small><strong>${money(d.fee_income)}</strong></div><div class="summary-box"><small>Other Income</small><strong>${money(d.quick_income)}</strong></div><div class="summary-box"><small>Expenses</small><strong>${money(d.expenses)}</strong></div><div class="summary-box"><small>Cash Balance</small><strong>${money(d.cash_balance)}</strong></div><div class="summary-box"><small>Bank Balance</small><strong>${money(d.bank_balance)}</strong></div></div>`;}catch(e){$('#roHost').innerHTML=`<div class="empty">${esc(e.message)}</div>`;}};$('#roLoad').onclick=load;load();};

const _v18BankingAccountant=renderBanking;renderBanking=function(){if(isAccountant())return _v18BankingAccountant();if(!hasPermission('banking'))return unauthorized();$('#content').innerHTML=`<div class="section"><div class="toolbar"><div class="field"><label>From</label><input id="roFrom" value="${esc(workingDate())}"></div><div class="field"><label>To</label><input id="roTo" value="${esc(workingDate())}"></div><button class="btn cyan" id="roLoad">Load Banking Report</button></div><div id="roHost"></div></div>`;const load=async()=>{try{const d=await v18ReportCall('banking_report',$('#roFrom').value,$('#roTo').value,'');const banks=(d.banks||[]).map(b=>`<div class="summary-box"><small>${esc(b.bank_name)}</small><strong>${money(b.balance)}</strong><span>${esc(b.account_no||'')}</span></div>`).join('');$('#roHost').innerHTML=`<div class="summary-strip flexible-summary"><div class="summary-box"><small>Cash Balance</small><strong>${money(d.cash_balance)}</strong></div>${banks}</div>${v18ObjTable(d.movements||[],[['nepali_date','Date'],['entry_type','Type'],['reference_no','Reference'],['bank_in','Bank In','amount','money'],['bank_out','Bank Out','amount','money']])}`;}catch(e){$('#roHost').innerHTML=`<div class="empty">${esc(e.message)}</div>`;}};$('#roLoad').onclick=load;load();};

window.v18RefreshAll=v18RefreshAll;
/* ==================== END FINAL ONLINE OPERATIONS V18 ==================== */


/* ---------- Student Master: safe online delete ----------
   "Delete" removes the student from the active Student Master immediately.
   Existing receipts/financial history are preserved for audit safety.
   Outstanding dues do not block this action. */
async function deleteOnlineStudent(id){
  if(!isAccountant())return toast('Only Accountant can delete students.');
  const s=studentById(id);if(!s)return toast('Student not found.');
  const receiptCount=(db.receipts||[]).filter(r=>
    String(r.studentId||'')===String(s.id||'') ||
    (r.masterId&&String(r.masterId)===String(studentMasterId(s))) ||
    (r.studentUuid&&s.studentUuid&&String(r.studentUuid)===String(s.studentUuid))
  ).length;
  const due=Math.max(0,num(s.dues));
  const details=[
    `Delete ${s.name} (${s.registrationNo}) from Student Master?`,
    due>0?`Current Dues: ${money(due)}. Dues do not block deletion.`:'',
    receiptCount?`${receiptCount} saved receipt(s) will remain in financial history.`:'',
    'This removes the student from the active list.'
  ].filter(Boolean).join('\n\n');
  if(!confirm(details))return;
  try{
    const payload={
      active:false,
      archive_reason:'Deleted by Accountant',
      archived_np_date:workingDate(),
      archived_at:new Date().toISOString()
    };
    const {error}=await sb.from('students').update(payload).eq('id',s.id);
    if(error)throw error;
    db.students=(db.students||[]).filter(x=>String(x.id)!==String(s.id));
    renderStudents();
    toast('Student deleted from active Student Master.');
  }catch(error){
    console.error('Online student delete failed:',error);
    toast('Student delete failed: '+(error?.message||'Unknown error'));
  }
}
window.deleteOnlineStudent=deleteOnlineStudent;

/* ==================== V18.1 FINAL REFINEMENTS ====================
   1) Compact Class / Route checklist filters on Student Master
   2) Reliable online Bank selector in Fee Receive
   3) Fully enabled online Banking transactions
   ================================================================ */

/* ---------- 1. Compact Student filters ---------- */
function v181FilterDetails(name,label,items,labeler=x=>x){
  const body=items.length?items.map(item=>`<label class="v181-filter-option"><input type="checkbox" name="${name}" value="${esc(item)}"> <span>${esc(labeler(item))}</span></label>`).join(''):'<div class="card-note">No options available.</div>';
  return `<details class="v181-filter-details" data-filter-name="${name}"><summary><span>${esc(label)}</span><b data-filter-summary>All</b></summary><div class="v181-filter-menu">${body}</div></details>`;
}
function v181UpdateFilterSummary(name){
  const box=document.querySelector(`.v181-filter-details[data-filter-name="${name}"]`);if(!box)return;
  const checked=[...box.querySelectorAll(`input[name="${name}"]:checked`)];
  const target=box.querySelector('[data-filter-summary]');if(!target)return;
  target.textContent=checked.length?`${checked.length} selected`:'All';
}
function v181WireStudentFilters(){
  ['stuClassCheck','stuRouteCheck','stuCasteCheck'].forEach(name=>{
    $$(`input[name="${name}"]`).forEach(x=>x.onchange=()=>{v181UpdateFilterSummary(name);drawStudentList();});
    v181UpdateFilterSummary(name);
  });
}
renderStudents=function(){
  if(!isAccountant()&&!hasPermission('studentList'))return unauthorized();
  const readonly=!isAccountant(),castes=uniqueCasteList(),routes=(db.routes||[]).filter(r=>r.active!==false);
  $('#content').innerHTML=`<div class="section"><div class="section-title"><div><h3>Student Master</h3></div>${readonly?'':`<button class="btn primary" id="newStudentBtn">+ New Admission</button>`}</div>
  <div class="toolbar block-toolbar"><div class="field"><label>Academic Year</label><select id="stuYear">${yearsOptions(getYear())}</select></div><div class="field"><label>Gender</label><select id="stuGender"><option value="">All</option><option>Male</option><option>Female</option><option>Other</option></select></div><div class="field grow"><label>Search</label><input id="stuSearch" placeholder="Name / Registration / Mobile / Guardian / DOB"></div><button class="btn green" id="studentExport">Export Excel</button></div>
  <div class="v181-filter-bar">${v181FilterDetails('stuClassCheck','Class',CLASSES)}${v181FilterDetails('stuRouteCheck','Route',routes.map(r=>r.id),id=>routeById(id)?.name||id)}${castes.length?v181FilterDetails('stuCasteCheck','Caste',castes):''}<button type="button" class="btn small" id="v181ClearStudentFilters">Clear Filters</button></div>
  <div id="studentHost"></div></div>`;
  if(!readonly)$('#newStudentBtn').onclick=()=>openStudentForm();
  ['stuYear','stuGender','stuSearch'].forEach(id=>$('#'+id).oninput=drawStudentList);
  $('#studentExport').onclick=exportStudents;
  $('#v181ClearStudentFilters').onclick=()=>{$$('input[name="stuClassCheck"],input[name="stuRouteCheck"],input[name="stuCasteCheck"]').forEach(x=>x.checked=false);v181WireStudentFilters();drawStudentList();};
  v181WireStudentFilters();drawStudentList();
};

/* ---------- 2. Fee Receive: always resolve active banks from Supabase ---------- */
let v181BankRefreshPromise=null;
async function v181RefreshOnlineBanks(){
  if(!isAccountant())return [];
  if(v181BankRefreshPromise)return v181BankRefreshPromise;
  v181BankRefreshPromise=(async()=>{
    const {data,error}=await sb.from('banks').select('bank_id,bank_name,account_name,account_no,opening_balance,active,remarks').order('bank_name');
    if(error)throw error;
    db.banks=(data||[]).map(v18BankFromRow);
    return activeBanks();
  })().finally(()=>{v181BankRefreshPromise=null;});
  return v181BankRefreshPromise;
}
function v181FillBankSelect(select,selected=''){
  if(!select)return;
  const banks=activeBanks();
  select.innerHTML=`<option value="">Select Bank</option>`+banks.map(b=>`<option value="${esc(b.id)}">${esc(b.name)}${b.accountNo?` — ${esc(b.accountNo)}`:''}</option>`).join('');
  if(selected&&banks.some(b=>String(b.id)===String(selected)))select.value=selected;
}
async function v181SyncFeeBankSelect(forceReload=false){
  const select=$('#payBank'),hint=$('#payBankHint');if(!select)return;
  const amount=Math.max(0,num(paymentState?.bankReceived));
  if(amount<=0){select.disabled=true;select.value='';if(paymentState)paymentState.bankId='';if(hint)hint.textContent='Enter a Bank Received amount to activate bank selection.';return;}
  const previous=paymentState?.bankId||select.value||'';
  select.disabled=true;if(hint)hint.textContent='Loading active bank accounts…';
  try{
    if(forceReload||!activeBanks().length)await v181RefreshOnlineBanks();
    v181FillBankSelect(select,previous);
    const banks=activeBanks();
    if(!banks.length){select.disabled=true;if(hint)hint.textContent='No active bank account found. Add/activate a bank account from Banking.';return;}
    select.disabled=false;
    if(previous&&banks.some(b=>String(b.id)===String(previous))){select.value=previous;if(paymentState)paymentState.bankId=previous;}
    if(hint)hint.textContent='Select the exact bank where this amount was received.';
  }catch(e){select.disabled=true;if(hint)hint.textContent='Could not load bank accounts. Use Refresh and try again.';console.error('Bank selector load failed',e);}
}
const _v181RenderFeePaymentBase=renderFeePayment;
renderFeePayment=function(){
  _v181RenderFeePaymentBase();
  const select=$('#payBank');if(select){select.innerHTML='<option value="">Loading Banks…</option>';select.disabled=true;select.onchange=e=>paymentState.bankId=e.target.value;}
  v181RefreshOnlineBanks().then(()=>{v181FillBankSelect($('#payBank'),paymentState?.bankId||'');v181SyncFeeBankSelect(false);}).catch(e=>{console.error(e);const hint=$('#payBankHint');if(hint)hint.textContent='Bank accounts could not be loaded.';});
};
const _v181DrawPaymentCalcBase=drawPaymentCalc;
drawPaymentCalc=function(){
  _v181DrawPaymentCalcBase();
  const bankInput=$('#payBankReceived');
  if(bankInput)bankInput.addEventListener('input',()=>setTimeout(()=>v181SyncFeeBankSelect(true),0));
  v181SyncFeeBankSelect(false);
};

/* ---------- 3. Banking: enable online transaction entry ---------- */
const _v181PreviousBankingForReadonly=renderBanking;
function v181BankingBalanceCards(today){
  const bankCards=(db.banks||[]).map(b=>`<div class="bank-balance-card"><small>${esc(b.name)}</small><strong>${money(bankBalanceThrough(b.id,today))}</strong><span>${esc(b.accountNo||'')}${b.active===false?' · Inactive':''}</span></div>`).join('');
  return `<div class="bank-balance-grid"><div class="bank-balance-card cash"><small>Cash Balance</small><strong>${money(cashBalanceThrough(today))}</strong></div>${bankCards||'<div class="bank-balance-card"><small>Bank Accounts</small><strong>None</strong><span>Add a bank account to begin.</span></div>'}</div>`;
}
async function v181ReloadBankingScreen(){
  try{await v18LoadOperations();renderBanking();toast('Banking data refreshed.');}catch(e){toast('Banking refresh failed: '+(e?.message||'Unknown error'));}
}
renderBanking=function(){
  if(!isAccountant())return _v181PreviousBankingForReadonly();
  const today=workingDate(),active=activeBanks();
  $('#content').innerHTML=`${v181BankingBalanceCards(today)}
  <div class="two-col"><div class="section premium-section"><div class="section-title"><div><h3>Bank Accounts</h3></div><div><button class="btn" id="v181RefreshBanks">Refresh</button> <button class="btn primary" id="addBankBtn">+ Bank Account</button></div></div><div id="bankList"></div></div>
  <div class="section premium-section"><div class="section-title"><div><h3>Bank Transaction</h3></div></div>${active.length?'':`<div class="notice" style="margin-bottom:12px"><strong>No active bank:</strong> Add a bank account or mark an existing account Active before entering a banking transaction.</div>`}<form id="bankTxForm" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(today)}" required></div><div><label>Transaction</label><select name="type"><option value="cash_deposit">Cash → Bank Deposit</option><option value="withdrawal">Bank → Cash Withdrawal</option></select></div><div class="full"><label>Bank Account</label><select name="bankId" ${active.length?'':'disabled'}>${bankOptions()}</select></div><div><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" required></div><div><label>Deposited / Withdrawn By</label><input name="person"></div><div class="full"><label>Purpose / Heading</label><input name="purpose" placeholder="Cash deposit / Office use / Salary / etc."></div><div class="full"><label>Remarks</label><textarea name="remarks"></textarea></div><div class="full card-note" id="v181BankTxHint">Cash deposit reduces Cash Balance and increases the selected Bank. Withdrawal reduces the selected Bank and increases Cash Balance.</div><div class="full form-actions"><button class="btn primary" type="submit" ${active.length?'':'disabled'}>Save Banking Transaction</button></div></form></div></div>
  <div class="section premium-section"><div class="section-title"><div><h3>Banking Report</h3></div><button class="btn green" id="bankExport">Export Excel</button></div><div class="toolbar"><div class="field"><label>From Nepali Date</label><input id="bankFrom" value="${esc(today)}"></div><div class="field"><label>To Nepali Date</label><input id="bankTo" value="${esc(today)}"></div><button class="btn cyan" id="bankSearch">Search</button></div><div id="bankReportHost" style="margin-top:14px"></div></div>`;
  $('#addBankBtn').onclick=()=>openBankForm();
  $('#v181RefreshBanks').onclick=v181ReloadBankingScreen;
  const form=$('#bankTxForm');if(form){form.onsubmit=saveBankTransaction;const type=form.elements.type,bank=form.elements.bankId,amount=form.elements.amount,hint=$('#v181BankTxHint');const sync=()=>{const b=bankById(bank.value),a=num(amount.value);if(type.value==='withdrawal'&&b)hint.textContent=`Available in ${b.name}: ${money(bankBalanceThrough(b.id,form.elements.date.value||today))}${a>0?' · Withdrawal: '+money(a):''}`;else if(type.value==='cash_deposit')hint.textContent=`Available Cash: ${money(cashBalanceThrough(form.elements.date.value||today))}${a>0?' · Deposit: '+money(a):''}`;};type.onchange=sync;bank.onchange=sync;amount.oninput=sync;form.elements.date.oninput=sync;sync();}
  $('#bankSearch').onclick=drawBankReport;$('#bankExport').onclick=exportBankReport;drawBankList();drawBankReport();
};

saveBankTransaction=async function(e){
  e.preventDefault();const f=e.target,fd=new FormData(f),date=String(fd.get('date')||''),type=String(fd.get('type')||''),bankId=String(fd.get('bankId')||''),amount=num(fd.get('amount'));
  if(!npDateValid(date))return toast('Use Nepali date YYYY-MM-DD.');
  if(!bankId)return toast('Select the exact active bank account.');
  const bank=bankById(bankId);if(!bank||bank.active===false)return toast('Selected bank is not active. Refresh Banking and select an active bank.');
  if(amount<=0)return toast('Enter an amount greater than zero.');
  if(type==='cash_deposit'&&amount>cashBalanceThrough(date))return toast(`Deposit is higher than available Cash Balance (${money(cashBalanceThrough(date))}).`);
  if(type==='withdrawal'&&amount>bankBalanceThrough(bankId,date))return toast(`Withdrawal is higher than available ${bank.name} balance (${money(bankBalanceThrough(bankId,date))}).`);
  const btn=f.querySelector('button[type="submit"]'),old=btn?.textContent||'Save Banking Transaction';if(btn){btn.disabled=true;btn.textContent='Saving Online…';}
  try{
    const {error}=await sb.rpc('create_bank_transaction_atomic',{p_nepali_date:date,p_academic_year:yearOfDate(date),p_transaction_type:type,p_bank_id:bankId,p_amount:amount,p_person_name:fd.get('person')||null,p_purpose:fd.get('purpose')||null,p_remarks:fd.get('remarks')||null,p_reference_no:null});
    if(error)throw error;
    await v18LoadOperations();
    renderBanking();
    toast(type==='cash_deposit'?`${money(amount)} deposited to ${bank.name}.`:`${money(amount)} withdrawn from ${bank.name} to Cash.`);
  }catch(err){console.error('Online banking transaction failed',err);toast('Bank transaction NOT saved: '+(err?.message||'Unknown error'));}
  finally{if(btn){btn.disabled=false;btn.textContent=old;}}
};
window.saveBankTransaction=saveBankTransaction;
window.renderBanking=renderBanking;

/* ==================== END V18.1 FINAL REFINEMENTS ==================== */

/* ==================== V18.2 DAILY COLLECTION DUES TOTAL FIX ====================
   Receipt rows keep showing the historical Dues After value.
   The TOTAL row must NOT add every historical balance again.
   It uses only the latest receipt balance for each unique student + academic year.
*/
function v182DailyStudentKey(r){
  return [r?.studentUuid||r?.masterId||r?.studentId||r?.registrationNo||r?.studentName||'',r?.year||''].join('|');
}
function v182LatestDuesByStudent(rows){
  const latest=new Map();
  (rows||[]).forEach((r,index)=>{
    const key=v182DailyStudentKey(r);
    if(!key||key==='|')return;
    const created=String(r?.createdAt||'');
    const date=String(r?.date||'');
    const ref=String(r?.receiptNo||'');
    const order=`${date}|${created}|${String(index).padStart(8,'0')}|${ref}`;
    const prev=latest.get(key);
    if(!prev||order>=prev.order) latest.set(key,{order,balance:num(r?.balance)});
  });
  return latest;
}
function v182LatestDuesTotal(rows){
  let total=0;
  v182LatestDuesByStudent(rows).forEach(x=>{total+=num(x.balance);});
  return total;
}

drawDailyCollection=function(){
  const rows=dailyRows(),heads=dailyHeads(rows),cols=heads.map(h=>`<th class="amount">${esc(h)}</th>`).join('');
  const latestDues=v182LatestDuesTotal(rows);
  const data=rows.map(r=>`<tr><td>${r.date}</td><td>${esc(r.receiptNo)}</td><td>${esc(r.studentName)}</td><td>${esc(r.className)}</td>${heads.map(h=>`<td class="amount">${itemTotalByLabel(r,h)?money(itemTotalByLabel(r,h)):'-'}</td>`).join('')}<td class="amount">${money(r.currentTotal)}</td><td class="amount">${money(r.discount)}</td><td class="amount">${money(r.paid)}</td><td class="amount">${money(r.balance)}</td><td class="amount">${v171CashReceived(r)>0?money(v171CashReceived(r)):'-'}</td><td>${v171BankReceived(r)>0?esc(bankLabel(r.bankId)):'-'}</td><td class="amount">${v171BankReceived(r)>0?money(v171BankReceived(r)):'-'}</td></tr>`).join('');
  const total=`<tr class="total-row"><td colspan="4"><b>TOTAL</b><br><small>Dues total uses latest balance once per student.</small></td>${heads.map(h=>`<td class="amount">${money(sum(rows,r=>itemTotalByLabel(r,h)))}</td>`).join('')}<td class="amount">${money(sum(rows,r=>r.currentTotal))}</td><td class="amount">${money(sum(rows,r=>r.discount))}</td><td class="amount">${money(sum(rows,r=>r.paid))}</td><td class="amount"><b>${money(latestDues)}</b></td><td class="amount">${money(sum(rows,r=>v171CashReceived(r)))}</td><td><b>Direct Bank</b></td><td class="amount">${money(sum(rows,r=>v171BankReceived(r)))}</td></tr>`;
  $('#dailyHost').innerHTML=rows.length?`<div class="notice" style="margin-bottom:10px"><strong>Dues rule:</strong> Each receipt row shows Dues After that receipt. The TOTAL below counts only the latest Dues once for each student, so old balances are not added repeatedly.</div><div class="table-wrap cyan-table"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Student</th><th>Class</th>${cols}<th class="amount">Total Fees</th><th class="amount">Discount</th><th class="amount">Received</th><th class="amount">Dues After</th><th class="amount">Cash Received</th><th>Bank Account</th><th class="amount">Bank Received</th></tr></thead><tbody>${data}${total}</tbody></table></div>`:`<div class="empty">No fee receipts in this date range.</div>`;
};

exportDailyCollection=function(){
  const rows=dailyRows(),heads=dailyHeads(rows),latestDues=v182LatestDuesTotal(rows);
  const headers=['Date','Receipt No','Student','Class',...heads,'Total Fees','Discount','Received','Dues After','Cash Received','Bank Account','Bank Received'];
  const data=rows.map(r=>[r.date,r.receiptNo,r.studentName,r.className,...heads.map(h=>itemTotalByLabel(r,h)),r.currentTotal,r.discount,r.paid,r.balance,v171CashReceived(r),v171BankReceived(r)>0?bankLabel(r.bankId):'',v171BankReceived(r)]);
  data.push(['TOTAL (Latest Dues once per student)','','','',...heads.map(h=>sum(rows,r=>itemTotalByLabel(r,h))),sum(rows,r=>r.currentTotal),sum(rows,r=>r.discount),sum(rows,r=>r.paid),latestDues,sum(rows,r=>v171CashReceived(r)),'',sum(rows,r=>v171BankReceived(r))]);
  exportXLS('Daily_Collection.xls',headers,data,'Daily Collection / Fees Day Book');
};

const _v182RenderDailyCollection=renderDailyCollection;
renderDailyCollection=function(){
  _v182RenderDailyCollection();
  if(isAccountant()&&$('#dcSummary')){
    $('#dcSummary').onclick=()=>{
      const rows=dailyRows();
      toast(`Receipts: ${rows.length} · Collection: ${money(sum(rows,r=>r.paid))} · Latest Dues: ${money(v182LatestDuesTotal(rows))}`);
    };
  }
};
/* ==================== END V18.2 DAILY COLLECTION DUES TOTAL FIX ==================== */


/* ==================== FINAL 10 FIXES — FIX 1 + FIX 2 ====================
   FIX 1: Settings/academic-year schema compatibility.
   FIX 2: Receipt collection split is immutable; Cash→Bank is a transfer,
          never reclassified as student Bank collection and never double-counted.
========================================================================= */

/* FIX 1 — tolerate academic_years.year OR academic_years.academic_year and
   do not let one optional schema mismatch block the whole software. */
const _f10OriginalLoadSharedSettings = typeof v18LoadSharedSettings === 'function' ? v18LoadSharedSettings : null;
v18LoadSharedSettings = async function(){
  let settingsRow={}, yearRows=[], counterRows=[];

  try{
    const setRes=await sb.from('app_settings').select('*').eq('id',1).maybeSingle();
    if(setRes.error) throw setRes.error;
    settingsRow=setRes.data||{};
  }catch(e){
    console.warn('Settings row could not be loaded; keeping current/default settings.',e);
  }

  try{
    let yearRes=await sb.from('academic_years').select('*').order('year',{ascending:true});
    const msg=String(yearRes.error?.message||'');
    const code=String(yearRes.error?.code||'');
    if(yearRes.error && (code==='42703'||/column .*year.* does not exist/i.test(msg))){
      yearRes=await sb.from('academic_years').select('*').order('academic_year',{ascending:true});
    }
    if(yearRes.error) throw yearRes.error;
    yearRows=yearRes.data||[];
  }catch(e){
    console.warn('Academic years could not be loaded; keeping current year list.',e);
  }

  if(isAccountant()){
    try{
      const counterRes=await sb.from('document_counters').select('counter_key,prefix,next_number,padding').in('counter_key',['student_registration','fee_receipt','quick_receipt','expense_voucher']);
      if(counterRes.error) throw counterRes.error;
      counterRows=counterRes.data||[];
    }catch(e){
      console.warn('Document counters could not be loaded; keeping current counters.',e);
    }
  }

  const r=settingsRow||{};
  Object.assign(db.settings,{
    schoolName:r.school_name||db.settings.schoolName,
    address:r.address||db.settings.address,
    estd:r.estd||db.settings.estd,
    phone:r.phone??db.settings.phone??'',
    pan:r.pan??db.settings.pan??'',
    issuedBy:r.issued_by||db.settings.issuedBy,
    workingDate:r.working_nepali_date||db.settings.workingDate,
    cashOpeningBalance:r.cash_opening_balance==null?num(db.settings.cashOpeningBalance):num(r.cash_opening_balance),
    remindHeader:r.reminder_header||db.settings.remindHeader||'Fee Reminder',
    reminderWhatsApp:r.reminder_whatsapp??db.settings.reminderWhatsApp??'',
    reminderTemplate:r.reminder_template??db.settings.reminderTemplate??'',
    reminderOnlineNote:r.reminder_online_note??db.settings.reminderOnlineNote??'',
    admitCardTerm:r.admit_card_term||db.settings.admitCardTerm||'First Term',
    admitCardTitle:r.admit_card_title||db.settings.admitCardTitle||'ADMIT CARD',
    examCoordinatorName:r.exam_coordinator_name||db.settings.examCoordinatorName||'Exam Coordinator',
    examCoordinatorPost:r.exam_coordinator_post||db.settings.examCoordinatorPost||'Exam Coordinator',
    principalName:r.principal_name||db.settings.principalName||'Principal',
    principalPost:r.principal_post||db.settings.principalPost||'Principal',
    accountantSignName:r.accountant_sign_name||db.settings.accountantSignName||'Accountant',
    accountantSignPost:r.accountant_sign_post||db.settings.accountantSignPost||'Accountant'
  });

  const yrs=yearRows.map(x=>String(x.year??x.academic_year??'')).filter(Boolean);
  if(yrs.length) db.settings.academicYears=yrs;

  const counters=new Map(counterRows.map(x=>[x.counter_key,x]));
  const fr=counters.get('fee_receipt'),qr=counters.get('quick_receipt'),ev=counters.get('expense_voucher'),sr=counters.get('student_registration');
  if(fr){db.settings.receiptPrefix=fr.prefix||'';db.settings.nextReceiptNumber=num(fr.next_number);}
  if(qr){db.settings.quickReceiptPrefix=qr.prefix||'';db.settings.nextQuickReceiptNumber=num(qr.next_number);}
  if(ev){db.settings.expensePrefix=ev.prefix||'';db.settings.nextExpenseNumber=num(ev.next_number);}
  if(sr){db.settings.registrationPrefix=sr.prefix||'';db.settings.nextRegistrationNumber=num(sr.next_number);}

  try{
    const [logo,qrImg,sigE,sigP,sigA]=await Promise.all([
      v18SignedAsset(r.logo_path),v18SignedAsset(r.reminder_qr_path),v18SignedAsset(r.exam_coordinator_signature_path),v18SignedAsset(r.principal_signature_path),v18SignedAsset(r.accountant_signature_path)
    ]);
    if(r.logo_path!==undefined) db.settings.logoData=logo;
    if(r.reminder_qr_path!==undefined) db.settings.reminderQRData=qrImg;
    if(r.exam_coordinator_signature_path!==undefined) db.settings.examCoordinatorSignatureData=sigE;
    if(r.principal_signature_path!==undefined) db.settings.principalSignatureData=sigP;
    if(r.accountant_signature_path!==undefined) db.settings.accountantSignatureData=sigA;
    db.settings._assetPaths={
      logo:r.logo_path||db.settings._assetPaths?.logo||'',
      qr:r.reminder_qr_path||db.settings._assetPaths?.qr||'',
      sigExam:r.exam_coordinator_signature_path||db.settings._assetPaths?.sigExam||'',
      sigPrincipal:r.principal_signature_path||db.settings._assetPaths?.sigPrincipal||'',
      sigAccountant:r.accountant_signature_path||db.settings._assetPaths?.sigAccountant||''
    };
  }catch(e){
    console.warn('Optional online assets could not be loaded; text settings remain usable.',e);
  }
};

/* FIX 2 — source-of-money helpers. A fee receipt keeps its original Cash / Direct Bank
   split forever. A later Cash→Bank deposit is only a treasury movement. */
function f10ReceiptCash(r){ return Math.max(0,num(typeof v171CashReceived==='function'?v171CashReceived(r):r.cashReceived)); }
function f10ReceiptDirectBank(r){ return Math.max(0,num(typeof v171BankReceived==='function'?v171BankReceived(r):r.bankReceived)); }
function f10ReceiptTotal(r){ return f10ReceiptCash(r)+f10ReceiptDirectBank(r); }

/* Daily Collection = receipts only. Banking transfers are intentionally excluded. */
drawDailyCollection=function(){
  const rows=dailyRows(),heads=dailyHeads(rows),cols=heads.map(h=>`<th class="amount">${esc(h)}</th>`).join('');
  const latestDues=typeof v182LatestDuesTotal==='function'?v182LatestDuesTotal(rows):sum(rows,r=>r.balance);
  const data=rows.map(r=>`<tr><td>${r.date}</td><td>${esc(r.receiptNo)}</td><td>${esc(r.studentName)}</td><td>${esc(r.className)}</td>${heads.map(h=>`<td class="amount">${itemTotalByLabel(r,h)?money(itemTotalByLabel(r,h)):'-'}</td>`).join('')}<td class="amount">${money(r.currentTotal)}</td><td class="amount">${money(r.discount)}</td><td class="amount"><b>${money(f10ReceiptTotal(r))}</b></td><td class="amount">${money(r.balance)}</td><td class="amount">${f10ReceiptCash(r)>0?money(f10ReceiptCash(r)):'-'}</td><td>${f10ReceiptDirectBank(r)>0?esc(bankLabel(r.bankId)):'-'}</td><td class="amount">${f10ReceiptDirectBank(r)>0?money(f10ReceiptDirectBank(r)):'-'}</td></tr>`).join('');
  const total=`<tr class="total-row"><td colspan="4"><b>TOTAL RECEIPTS</b><br><small>Cash→Bank transfers are excluded from receipt collection.</small></td>${heads.map(h=>`<td class="amount">${money(sum(rows,r=>itemTotalByLabel(r,h)))}</td>`).join('')}<td class="amount">${money(sum(rows,r=>r.currentTotal))}</td><td class="amount">${money(sum(rows,r=>r.discount))}</td><td class="amount"><b>${money(sum(rows,r=>f10ReceiptTotal(r)))}</b></td><td class="amount"><b>${money(latestDues)}</b></td><td class="amount"><b>${money(sum(rows,r=>f10ReceiptCash(r)))}</b></td><td><b>Bank Receipt Portion</b></td><td class="amount"><b>${money(sum(rows,r=>f10ReceiptDirectBank(r)))}</b></td></tr>`;
  $('#dailyHost').innerHTML=rows.length?`<div class="notice" style="margin-bottom:10px"><strong>Collection rule:</strong> Total Received = Cash Received + Bank Received. A later Cash → Bank Deposit is only a Banking Transfer and never changes the student's receipt collection.</div><div class="table-wrap cyan-table"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Student</th><th>Class</th>${cols}<th class="amount">Total Fees</th><th class="amount">Discount</th><th class="amount">Total Received</th><th class="amount">Dues After</th><th class="amount">Cash Received</th><th>Bank Account</th><th class="amount">Bank Received</th></tr></thead><tbody>${data}${total}</tbody></table></div>`:`<div class="empty">No fee receipts in this date range.</div>`;
};

exportDailyCollection=function(){
  const rows=dailyRows(),heads=dailyHeads(rows),latestDues=typeof v182LatestDuesTotal==='function'?v182LatestDuesTotal(rows):sum(rows,r=>r.balance);
  const headers=['Date','Receipt No','Student','Class',...heads,'Total Fees','Discount','Total Received','Dues After','Cash Received','Bank Account','Bank Received'];
  const data=rows.map(r=>[r.date,r.receiptNo,r.studentName,r.className,...heads.map(h=>itemTotalByLabel(r,h)),r.currentTotal,r.discount,f10ReceiptTotal(r),r.balance,f10ReceiptCash(r),f10ReceiptDirectBank(r)>0?bankLabel(r.bankId):'',f10ReceiptDirectBank(r)]);
  data.push(['TOTAL (Transfers excluded)','','','',...heads.map(h=>sum(rows,r=>itemTotalByLabel(r,h))),sum(rows,r=>r.currentTotal),sum(rows,r=>r.discount),sum(rows,r=>f10ReceiptTotal(r)),latestDues,sum(rows,r=>f10ReceiptCash(r)),'',sum(rows,r=>f10ReceiptDirectBank(r))]);
  exportXLS('Daily_Collection.xls',headers,data,'Daily Collection / Fees Day Book');
};

/* Banking Report separates true direct-bank collection from internal cash transfer. */
function f10BankingCategory(row){
  if(row.type==='Direct Fee Receipt') return 'Student Direct Bank Collection';
  if(row.type==='Direct Quick Receipt') return 'Other Direct Bank Collection';
  if(row.type==='Cash → Bank Deposit') return 'Internal Cash Transfer';
  if(row.type==='Bank Withdrawal → Cash') return 'Internal Bank Transfer';
  if(row.type==='Bank Expense') return 'Bank Expense';
  return row.type||'Bank Movement';
}

drawBankReport=function(){
  const f=$('#bankFrom')?.value||'',t=$('#bankTo')?.value||'',rows=bankingRows(f,t),prev=addDaysToNpDate(f||workingDate(),-1);
  const directStudent=sum(rows,r=>r.type==='Direct Fee Receipt'?r.inflow:0);
  const directOther=sum(rows,r=>r.type==='Direct Quick Receipt'?r.inflow:0);
  const cashTransfer=sum(rows,r=>r.type==='Cash → Bank Deposit'?r.inflow:0);
  const withdrawals=sum(rows,r=>r.type==='Bank Withdrawal → Cash'?r.outflow:0);
  const bankExpenses=sum(rows,r=>r.type==='Bank Expense'?r.outflow:0);
  const cards=[
    `<div class="summary-box"><small>Student Direct Bank Collection</small><strong>${money(directStudent)}</strong></div>`,
    `<div class="summary-box"><small>Other Direct Bank Collection</small><strong>${money(directOther)}</strong></div>`,
    `<div class="summary-box"><small>Cash → Bank Transfer</small><strong>${money(cashTransfer)}</strong></div>`,
    `<div class="summary-box"><small>Bank Withdrawal</small><strong>${money(withdrawals)}</strong></div>`,
    `<div class="summary-box"><small>Bank Expense</small><strong>${money(bankExpenses)}</strong></div>`,
    `<div class="summary-box"><small>Opening Cash</small><strong>${money(cashBalanceThrough(prev))}</strong></div>`,
    `<div class="summary-box"><small>Cash at End</small><strong>${money(cashBalanceThrough(t||workingDate()))}</strong></div>`,
    ...db.banks.map(b=>`<div class="summary-box"><small>${esc(b.name)} Closing Balance</small><strong>${money(bankBalanceThrough(b.id,t||workingDate()))}</strong></div>`)
  ].join('');
  const body=rows.length?`<div class="notice" style="margin-bottom:10px"><strong>Important:</strong> “Student Direct Bank Collection” is money paid directly to bank on the receipt. “Cash → Bank Transfer” is only movement of cash already collected; it is not new fee income.</div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Type</th><th>Reference</th><th>Bank</th><th>Details</th><th class="amount">Bank In</th><th class="amount">Bank Out</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.date}</td><td><b>${esc(f10BankingCategory(r))}</b></td><td>${esc(r.type)}</td><td>${esc(r.ref||'')}</td><td>${esc(bankLabel(r.bankId))}</td><td>${esc(r.details||'')}</td><td class="amount stat-green">${r.inflow?money(r.inflow):'-'}</td><td class="amount stat-red">${r.outflow?money(r.outflow):'-'}</td></tr>`).join('')}<tr class="total-row"><td colspan="6"><b>TOTAL BANK MOVEMENT</b><br><small>Movement total is not the same as fee collection total.</small></td><td class="amount"><b>${money(sum(rows,r=>r.inflow))}</b></td><td class="amount"><b>${money(sum(rows,r=>r.outflow))}</b></td></tr></tbody></table></div>`:`<div class="empty">No banking transactions in this date range.</div>`;
  $('#bankReportHost').innerHTML=`<div class="summary-strip flexible-summary">${cards}</div>${body}`;
};

exportBankReport=function(){
  const f=$('#bankFrom')?.value||'',t=$('#bankTo')?.value||'',rows=bankingRows(f,t);
  const data=rows.map(r=>[r.date,f10BankingCategory(r),r.type,r.ref,bankLabel(r.bankId),r.details,r.inflow,r.outflow]);
  data.push(['TOTAL BANK MOVEMENT','','','','','',sum(rows,r=>r.inflow),sum(rows,r=>r.outflow)]);
  data.push(['NOTE','Cash → Bank Transfer is not new collection. Student Direct Bank Collection comes only from the receipt bank portion.','','','','','','']);
  exportXLS('Banking_Report.xls',['Date','Category','Type','Reference','Bank','Details','Bank In','Bank Out'],data,'Banking Report');
};

/* Re-wire Daily Collection summary after the override. */
const _f10RenderDailyCollectionBase=renderDailyCollection;
renderDailyCollection=function(){
  _f10RenderDailyCollectionBase();
  if(isAccountant()&&$('#dcSummary')){
    $('#dcSummary').onclick=()=>{
      const rows=dailyRows();
      const latestDues=typeof v182LatestDuesTotal==='function'?v182LatestDuesTotal(rows):sum(rows,r=>r.balance);
      const receiptTotal=sum(rows,r=>f10ReceiptTotal(r)),cashTotal=sum(rows,r=>f10ReceiptCash(r)),directBankTotal=sum(rows,r=>f10ReceiptDirectBank(r));
      toast(`Receipts: ${rows.length} · Total Received: ${money(receiptTotal)} · Cash Received: ${money(cashTotal)} · Bank Received: ${money(directBankTotal)} · Latest Dues: ${money(latestDues)}`);
    };
  }
};

window.drawDailyCollection=drawDailyCollection;
window.exportDailyCollection=exportDailyCollection;
window.drawBankReport=drawBankReport;
window.exportBankReport=exportBankReport;
/* ==================== END FINAL 10 FIXES — FIX 1 + FIX 2 ==================== */


/* ==================== FINAL 10 FIXES — FIX 04 MOBILE NAV ==================== */
(function(){
  function setMobileNav(open){
    document.body.classList.toggle('mobile-nav-open',!!open);
    const b=document.getElementById('mobileNavBtn');
    if(b){b.setAttribute('aria-expanded',open?'true':'false');b.textContent=open?'✕':'☰';}
  }
  function closeMobileNav(){setMobileNav(false)}
  const btn=document.getElementById('mobileNavBtn');
  const shade=document.getElementById('mobileNavShade');
  if(btn)btn.addEventListener('click',()=>setMobileNav(!document.body.classList.contains('mobile-nav-open')));
  if(shade)shade.addEventListener('click',closeMobileNav);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileNav()});
  window.addEventListener('resize',()=>{if(window.innerWidth>760)closeMobileNav()},{passive:true});

  const baseRenderSideNav=renderSideNav;
  renderSideNav=function(){
    baseRenderSideNav();
    document.querySelectorAll('#sideNav .nav-btn').forEach(b=>b.addEventListener('click',closeMobileNav));
  };

  const baseCloseModal=closeModal;
  closeModal=function(){baseCloseModal();};
  window.closeModal=closeModal;
})();
/* ================== END FINAL 10 FIXES — FIX 04 MOBILE ================== */


/* ==================== V19.3 FULL-PAGE A5/A4 PRINT OVERRIDES ==================== */
(function(){
  function fullA5ReceiptHTML(r){
    const logo=db.settings.logoData?`<img src="${db.settings.logoData}" alt="Logo">`:`<div style="font-weight:900;font-size:22px">SA</div>`;
    const cash=Math.max(0,num(typeof f10ReceiptCash==='function'?f10ReceiptCash(r):r.cashReceived));
    const bank=Math.max(0,num(typeof f10ReceiptDirectBank==='function'?f10ReceiptDirectBank(r):r.bankReceived));
    const received=cash+bank;
    const gross=num(r.netPayable||0);
    const balance=Math.max(0,num(r.balance));
    const phone=esc(db.settings.phone||'');
    const bankName=bank>0?bankLabel(r.bankId):'';
    const monthText=esc(((r.months||[]).map(i=>NP_MONTHS[i]).join(', '))||'-');
    const bodyRows=((r.items||[]).length?(r.items||[]):[{label:'Old Dues Payment',amount:num(r.oldDues)}]).map((i,idx)=>`<tr><td class="center">${idx+1}</td><td>${esc(i.label||'')}</td><td class="num">${money(num(i.amount))}</td><td></td><td></td></tr>`).join('');
    return `<div class="a5-receipt a5-bordered" id="printReceipt"><div class="receipt-head"><div class="receipt-school tight-header"><h1>${esc(db.settings.schoolName)}</h1><p>${esc(db.settings.address)}</p><p><b>Phone:</b> ${phone}</p><p><b>ESTD:</b> ${esc(db.settings.estd||'')} &nbsp; <b>PAN No.:</b> ${esc(db.settings.pan||'')}</p></div><div class="receipt-logo">${logo}</div></div><div class="receipt-title">FEE RECEIPT</div><div class="receipt-meta"><div><b>Receipt No.:</b> ${esc(r.receiptNo)}</div><div><b>Nepali Date:</b> ${esc(r.date)}</div><div><b>Registration No.:</b> ${esc(r.registrationNo)}</div><div><b>Class:</b> ${esc(r.className)}</div><div><b>Student Name:</b> ${esc(r.studentName)}</div><div><b>Parent/Guardian:</b> ${esc(r.guardian||'')}</div><div style="grid-column:1/-1"><b>Fee For Month(s):</b> ${monthText}</div></div><div class="receipt-olddues"><b>Old Dues:</b> ${num(r.oldDues)>0?money(r.oldDues):''}</div><table class="receipt-table"><thead><tr><th style="width:7%">S.N.</th><th>Particular</th><th style="width:20%">Total Amount</th><th style="width:20%">Receive Amount</th><th style="width:18%">Balance</th></tr></thead><tbody>${bodyRows}</tbody></table><table class="receipt-summary"><tr><td>Total Amount</td><td>${money(r.currentTotal)}</td></tr><tr><td>Dues</td><td>${num(r.oldDues)>0?money(r.oldDues):''}</td></tr><tr><td><b>Grand Total</b></td><td><b>${money(gross)}</b></td></tr><tr><td>Cash Received</td><td>${money(cash)}</td></tr><tr><td>Bank Received</td><td>${money(bank)}</td></tr>${bank>0?`<tr><td>Bank Account</td><td>${esc(bankName)}</td></tr>`:''}<tr><td><b>Total Received</b></td><td><b>${money(received)}</b></td></tr><tr><td>Balance</td><td>${money(balance)}</td></tr></table><div class="amount-words"><b>Amount in Words:</b> ${esc(amountInWords(received))} only.</div><div class="receipt-note">Bill is essential to get the deposit refunded.</div><div class="receipt-sign v11-sign"><div class="sign-block left issued-by-no-line">Issued by: <b>${esc(db.settings.issuedBy||r.issuedBy||'')}</b></div><div class="sign-block accountant-dotted"><span></span><div>Accountant</div></div></div><div class="receipt-foot">Phone: ${phone} · Nepali Date: ${esc(r.date)}</div></div>`;
  }
  receiptHTML=fullA5ReceiptHTML;
  window.receiptHTML=receiptHTML;

  printReceipt=function(id){
    const r=receiptById(id); if(!r) return;
    const w=window.open('','_blank','width=800,height=900');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(r.receiptNo)}</title><link rel="stylesheet" href="style.css"><style>@page{size:A5 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}.a5-receipt,.a5-receipt.a5-bordered{width:148mm!important;min-height:210mm!important;max-width:none!important;margin:0 auto!important;padding:7mm 8mm!important;box-sizing:border-box;border:1.4px solid #111!important}</style></head><body>${receiptHTML(r)}<script>setTimeout(()=>window.print(),350)<\/script></body></html>`);
    w.document.close();
  };
  window.printReceipt=printReceipt;

  if(typeof renderAdmitCard==='function'){
    const _oldRenderAdmitCard=renderAdmitCard;
    renderAdmitCard=function(){
      _oldRenderAdmitCard();
      const title=document.querySelector('#content .section-title p');
      if(title && /admit/i.test(document.querySelector('#content .section-title h3')?.textContent||'')) title.textContent='Print one full admit card on each A4 page.';
      const btn=document.getElementById('admitPrintBtn');
      if(btn) btn.textContent='Print Full A4 Admit Cards';
    };
    window.renderAdmitCard=renderAdmitCard;
  }

  printAdmitCards=function(){
    const students=selectedAdmitStudents();
    if(!students.length) return toast('Select at least one student.');
    const logo=db.settings.logoData?`<img src="${db.settings.logoData}" class="admit-logo">`:'';
    const pages=students.map(s=>`<section class="admit-page"><div class="admit-card-full"><div class="admit-top">${logo}<div class="admit-school"><div class="admit-school-name">${esc(db.settings.schoolName)}</div><div class="admit-school-sub">${esc(db.settings.address)}</div><div class="admit-term">${esc(db.settings.admitCardTerm||'First Term Exam')}</div><div class="admit-title">${esc(db.settings.admitCardTitle||'ADMIT CARD')}</div></div></div><div class="admit-body"><div class="admit-line"><span>Student Name</span><b>${esc(s.name)}</b></div><div class="admit-line"><span>Class</span><b>${esc(s.className)}</b></div><div class="admit-line"><span>Registration No.</span><b>${esc(s.registrationNo)}</b></div><div class="admit-line"><span>Guardian Name</span><b>${esc(s.guardian||s.fatherName||s.motherName||'')}</b></div><div class="admit-line"><span>Hall No.</span><b>${esc(s.admitHallNo||'........................')}</b></div></div><div class="admit-signs">${admitSignature(db.settings.examCoordinatorSignatureData,db.settings.examCoordinatorName||'Exam Coordinator',db.settings.examCoordinatorPost||'Exam Coordinator')}${admitSignature(db.settings.principalSignatureData,db.settings.principalName||'Principal',db.settings.principalPost||'Principal')}${admitSignature(db.settings.accountantSignatureData,db.settings.accountantSignName||'Accountant',db.settings.accountantSignPost||'Accountant')}</div></div></section>`).join('');
    const w=window.open('','_blank','width=1000,height=900');
    w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><style>@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;background:#fff;color:#111}.admit-page{height:281mm;page-break-after:always;display:flex}.admit-page:last-child{page-break-after:auto}.admit-card-full{width:100%;height:100%;border:2.5px solid #2d7fbd;border-radius:14px;padding:10mm;background:linear-gradient(145deg,#f4fbff,#fff 58%,#f8fbff);position:relative;box-shadow:inset 0 0 0 4px #d9eefc}.admit-top{display:flex;gap:10px;align-items:center;border-bottom:1px solid #b8ddf6;padding-bottom:7px}.admit-logo{width:62px;height:62px;object-fit:contain;flex:0 0 auto}.admit-school{text-align:center;flex:1;min-width:0}.admit-school-name{font-size:22px;font-weight:900;color:#155b92;line-height:1.15}.admit-school-sub{font-size:12px;margin-top:2px}.admit-term{display:inline-block;margin-top:6px;padding:6px 16px;background:#0b6397;color:#fff;border:1px solid #064b75;border-radius:6px;font-size:15px;line-height:1.15;font-weight:900;letter-spacing:.02em}.admit-title{margin-top:7px;font-size:24px;font-weight:900;color:#b51d1d;letter-spacing:.08em}.admit-body{font-size:17px;padding-top:16px;display:grid;gap:12px}.admit-line{display:grid;grid-template-columns:150px 1fr;align-items:end;gap:10px}.admit-line span{font-weight:800}.admit-line b{font-weight:900;border-bottom:1.5px dotted #111;min-height:24px;padding:0 6px 4px}.admit-signs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;position:absolute;left:10mm;right:10mm;bottom:10mm;text-align:center}.signature-img{display:block;margin:0 auto 4px;width:100px;height:42px;object-fit:contain}.signature-dots{height:42px;display:flex;align-items:end;justify-content:center;font-size:14px}.admit-sign-cell small{display:block;font-size:11px;line-height:1.2}.sign-name{font-weight:800;font-size:13px}</style></head><body>${pages}<script>setTimeout(()=>window.print(),350)<\/script></body></html>`);
    w.document.close();
  };
  window.printAdmitCards=printAdmitCards;

  printOutstanding=function(){
    const rows=selectedOutstandingRows();
    if(!rows.length) return toast('Select at least one student before printing reminder letters.');
    const y=$('#outYear').value, to=NP_MONTHS[num($('#outTo').value)];
    const logo=db.settings.logoData?`<img src="${db.settings.logoData}" class="reminder-logo">`:'';
    const qr=db.settings.reminderQRData?`<img src="${db.settings.reminderQRData}" class="reminder-qr" alt="Payment QR">`:'';
    const pages=rows.map(x=>`<section class="reminder-page"><div class="reminder-sheet"><div class="reminder-head">${logo}<div class="reminder-school"><div class="reminder-school-name">${esc(db.settings.schoolName)}</div><div class="reminder-address">${esc(db.settings.address)}</div><div class="reminder-title">${esc(db.settings.remindHeader||'Fee Reminder')}</div></div></div><div class="student-row"><b>Student:</b> ${esc(x.s.name)} &nbsp; <b>Class:</b> ${esc(x.s.className)} &nbsp; <b>Reg:</b> ${esc(x.s.registrationNo)}</div><div class="small-row"><b>Guardian:</b> ${esc(x.s.guardian||x.s.fatherName||x.s.motherName||'')} &nbsp; <b>Period:</b> Up to ${to}, ${y}</div><table class="slip-detail"><thead><tr><th>Particular</th><th>Months</th><th>Rate</th><th>Total</th></tr></thead><tbody>${x.grouped.map(g=>`<tr><td>${esc(g.label)}</td><td>${esc(g.months.join(', '))}</td><td>${money(g.perAmount)}</td><td>${money(g.total)}</td></tr>`).join('')}${num(x.old)>0?`<tr><td>Old Dues</td><td>-</td><td>-</td><td>${money(x.old)}</td></tr>`:''}</tbody></table><div class="grand">Grand Total: ${money(x.total)}</div><div class="message">${esc(reminderReplacement(db.settings.reminderTemplate,x))}</div><div class="bottom"><div class="online">${esc(reminderReplacement(db.settings.reminderOnlineNote,x))}${db.settings.reminderWhatsApp?`<div class="whatsapp">WhatsApp: ${esc(db.settings.reminderWhatsApp)}</div>`:''}</div>${qr}</div></div></section>`).join('');
    const w=window.open('','_blank','width=1000,height=920');
    w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><style>@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#111;background:#fff}.reminder-page{height:281mm;page-break-after:always;display:flex}.reminder-page:last-child{page-break-after:auto}.reminder-sheet{width:100%;height:100%;border:1.6px solid #333;border-radius:6px;padding:8mm;display:flex;flex-direction:column}.reminder-head{display:flex;align-items:center;gap:5mm;border-bottom:1px solid #9eb7c9;padding-bottom:3mm;margin-bottom:3mm}.reminder-logo{width:18mm;height:18mm;object-fit:contain;flex:0 0 auto}.reminder-school{min-width:0;text-align:center;flex:1}.reminder-school-name{font-size:19px;font-weight:900;color:#124d7a;line-height:1.12}.reminder-address{font-size:11px;line-height:1.15}.reminder-title{font-size:17px;font-weight:900;color:#a91c1c;margin-top:2px}.student-row{font-size:14px;margin-bottom:2mm}.small-row{font-size:13px;margin-bottom:3mm}.slip-detail{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}.slip-detail th,.slip-detail td{border:1px solid #999;padding:2.2mm;vertical-align:top;word-break:break-word}.slip-detail th:nth-child(1){width:34%}.slip-detail th:nth-child(2){width:30%}.slip-detail th:nth-child(3),.slip-detail th:nth-child(4){width:18%;text-align:right}.slip-detail td:nth-child(3),.slip-detail td:nth-child(4){text-align:right}.grand{text-align:right;font-size:18px;font-weight:900;margin-top:3mm}.message,.online{font-size:12.5px;line-height:1.35;white-space:pre-wrap}.message{margin-top:4mm}.bottom{display:flex;align-items:flex-end;justify-content:space-between;gap:5mm;margin-top:auto;padding-top:4mm}.online{flex:1}.whatsapp{font-weight:700;margin-top:2mm}.reminder-qr{width:34mm;height:34mm;object-fit:contain;border:1px solid #ddd;background:#fff;padding:1mm;flex:0 0 auto}</style></head><body>${pages}<script>setTimeout(()=>window.print(),350)<\/script></body></html>`);
    w.document.close();
  };
  window.printOutstanding=printOutstanding;
})();
/* ================== END V19.3 FULL-PAGE A5/A4 PRINT OVERRIDES ================== */

/* ==================== V19.4 CURRENT DATE + DATE-FIRST RECEIPT REGISTER + SAFE DELETE ==================== */
(function(){
  /* Nepal-local today. Anchor: 2083-01-01 BS = 2026-04-14 AD.
     Uses the app's Nepali month progression so the current 2083 working date advances daily automatically. */
  function v194NepalADToday(){
    try{
      const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kathmandu',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
      const o={};parts.forEach(p=>{if(p.type!=='literal')o[p.type]=p.value});
      return `${o.year}-${o.month}-${o.day}`;
    }catch(_){return new Date().toISOString().slice(0,10);}
  }
  function v194TodayNepali(){
    const baseAD=parseISODate('2026-04-14'), todayAD=parseISODate(v194NepalADToday());
    if(!baseAD||!todayAD)return db.settings.workingDate||'2083-01-01';
    const diff=Math.floor((todayAD-baseAD)/(24*3600*1000));
    return addDaysToNpDate('2083-01-01',diff);
  }
  window.v194TodayNepali=v194TodayNepali;
  workingDate=function(){return v194TodayNepali();};
  window.workingDate=workingDate;
  try{db.settings.workingDate=v194TodayNepali();}catch(_){/* no-op */}

  let receiptSearchActive=false;
  let receiptPage=1;
  const RECEIPT_PAGE_SIZE=100;

  receiptRegisterRows=function(){
    if(!receiptSearchActive)return [];
    const q=($('#receiptSearch')?.value||'').trim().toLowerCase();
    const f=$('#receiptFrom')?.value||'',t=$('#receiptTo')?.value||'';
    if(!f||!t)return [];
    return (db.receipts||[]).filter(r=>
      (!q||[r.receiptNo,r.studentName,r.registrationNo].some(v=>String(v||'').toLowerCase().includes(q))) &&
      r.date>=f && r.date<=t
    ).sort((a,b)=>b.date.localeCompare(a.date)||String(b.receiptNo||'').localeCompare(String(a.receiptNo||'')));
  };
  window.receiptRegisterRows=receiptRegisterRows;

  function v194ReceiptMode(r){
    const cash=Math.max(0,num(typeof f10ReceiptCash==='function'?f10ReceiptCash(r):r.cashReceived));
    const bank=Math.max(0,num(typeof f10ReceiptDirectBank==='function'?f10ReceiptDirectBank(r):r.bankReceived));
    if(cash>0&&bank>0)return `Cash + Bank${r.bankId?`<br><small>${esc(bankLabel(r.bankId))}</small>`:''}`;
    if(bank>0)return `Bank${r.bankId?`<br><small>${esc(bankLabel(r.bankId))}</small>`:''}`;
    return 'Cash';
  }

  async function v194DeleteFeeReceipt(id){
    const r=receiptById(id);if(!r)return toast('Receipt not found.');
    if(!confirm(`Delete receipt ${r.receiptNo}?\n\nIt will disappear from active reports and the student dues will be restored safely.`))return;
    try{
      const {error}=await sb.rpc('void_latest_fee_receipt_atomic',{p_receipt_id:id,p_reason:'Deleted by Accountant'});
      if(error)throw error;
      await Promise.all([v15LoadOnlineStudents(),v17LoadOnlineReceipts(),v17LoadOnlineBanks?.()]);
      receiptSearchActive=true;
      drawReceiptRegister();
      toast(`Receipt ${r.receiptNo} deleted from active accounts.`);
    }catch(e){
      const m=String(e?.message||'Unknown error');
      if(/latest active receipt/i.test(m)||/newer receipts/i.test(m)){
        toast('This is not the latest receipt for this student. Delete the newer receipt first, then delete this one.');
      }else if(/function.*void_latest_fee_receipt_atomic|does not exist/i.test(m)){
        toast('Receipt Delete database function is not installed. Run the included Receipt_Delete_SQL once in Supabase.');
      }else toast('Receipt could not be deleted: '+m);
    }
  }
  window.v194DeleteFeeReceipt=v194DeleteFeeReceipt;

  drawReceiptRegister=function(){
    const host=$('#receiptRegHost');if(!host)return;
    if(!receiptSearchActive){
      host.innerHTML='<div class="empty">Select From Date and To Date, then press Search. Receipts are not loaded into the list automatically.</div>';
      return;
    }
    const f=$('#receiptFrom')?.value||'',t=$('#receiptTo')?.value||'';
    if(!f||!t){host.innerHTML='<div class="empty">Please select both From Date and To Date.</div>';return;}
    if(!npDateValid(f)||!npDateValid(t)){host.innerHTML='<div class="empty">Use Nepali date format YYYY-MM-DD.</div>';return;}
    if(f>t){host.innerHTML='<div class="empty">From Date cannot be after To Date.</div>';return;}
    const arr=receiptRegisterRows(),pages=Math.max(1,Math.ceil(arr.length/RECEIPT_PAGE_SIZE));
    receiptPage=Math.min(Math.max(1,receiptPage),pages);
    const start=(receiptPage-1)*RECEIPT_PAGE_SIZE,shown=arr.slice(start,start+RECEIPT_PAGE_SIZE);
    if(!arr.length){host.innerHTML='<div class="empty">No receipts found for the selected date range.</div>';return;}
    const rows=shown.map(r=>{const cash=Math.max(0,num(typeof f10ReceiptCash==='function'?f10ReceiptCash(r):r.cashReceived)),bank=Math.max(0,num(typeof f10ReceiptDirectBank==='function'?f10ReceiptDirectBank(r):r.bankReceived)),total=cash+bank;return `<tr><td>${esc(r.date)}</td><td><b>${esc(r.receiptNo)}</b></td><td>${esc(r.studentName)}</td><td>${esc(r.className)}</td><td>${esc((r.months||[]).map(i=>NP_MONTHS[i]).join(', '))}</td><td class="amount">${money(cash)}</td><td class="amount">${money(bank)}</td><td class="amount"><b>${money(total)}</b></td><td class="amount">${money(r.balance)}</td><td>${v194ReceiptMode(r)}</td><td>${isAccountant()?`<button class="btn small" onclick="showReceiptById('${r.id}')">View / Reprint</button> <button class="btn small red" onclick="v194DeleteFeeReceipt('${r.id}')">Delete Receipt</button>`:'View only'}</td></tr>`}).join('');
    host.innerHTML=`<div class="summary-strip" style="margin-bottom:10px"><div class="summary-box"><small>Selected Receipts</small><strong>${arr.length}</strong></div><div class="summary-box"><small>Total Received</small><strong>${money(sum(arr,r=>(typeof f10ReceiptTotal==='function'?f10ReceiptTotal(r):num(r.paid))))}</strong></div></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Student</th><th>Class</th><th>Months</th><th class="amount">Cash</th><th class="amount">Bank</th><th class="amount">Total Received</th><th class="amount">Dues</th><th>Mode / Bank</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>${pages>1?`<div class="form-actions" style="margin-top:10px;justify-content:space-between"><button class="btn" id="receiptPrev" ${receiptPage===1?'disabled':''}>← Previous</button><span>Page <b>${receiptPage}</b> of <b>${pages}</b> · Showing ${start+1}-${Math.min(start+RECEIPT_PAGE_SIZE,arr.length)} of ${arr.length}</span><button class="btn" id="receiptNext" ${receiptPage===pages?'disabled':''}>Next →</button></div>`:''}`;
    const prev=$('#receiptPrev'),next=$('#receiptNext');
    if(prev)prev.onclick=()=>{receiptPage--;drawReceiptRegister()};
    if(next)next.onclick=()=>{receiptPage++;drawReceiptRegister()};
  };
  window.drawReceiptRegister=drawReceiptRegister;

  renderReceiptRegister=function(){
    if(!isAccountant()&&!hasPermission('receiptRegister'))return unauthorized();
    receiptSearchActive=false;receiptPage=1;
    $('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Fee Receipt Register</h3></div><button class="btn green" id="receiptExport" disabled>Export Excel</button></div><div class="toolbar"><div class="field"><label>From Nepali Date</label><input id="receiptFrom" placeholder="2083-05-28"></div><div class="field"><label>To Nepali Date</label><input id="receiptTo" placeholder="2083-05-28"></div><div class="field"><label>Receipt / Student (optional)</label><input id="receiptSearch" placeholder="Receipt No. / Name / Reg. No."></div><button class="btn cyan" id="receiptToday">Today</button><button class="btn primary" id="receiptLoad">Search</button></div><div id="receiptRegHost" style="margin-top:12px"></div></div>`;
    const load=()=>{
      const f=$('#receiptFrom').value.trim(),t=$('#receiptTo').value.trim();
      if(!f||!t)return toast('Select both From Date and To Date.');
      if(!npDateValid(f)||!npDateValid(t))return toast('Use Nepali date YYYY-MM-DD.');
      receiptSearchActive=true;receiptPage=1;$('#receiptExport').disabled=false;drawReceiptRegister();
    };
    $('#receiptLoad').onclick=load;
    $('#receiptToday').onclick=()=>{const d=workingDate();$('#receiptFrom').value=d;$('#receiptTo').value=d;load();};
    $('#receiptSearch').onkeydown=e=>{if(e.key==='Enter')load()};
    $('#receiptExport').onclick=()=>{
      if(!receiptSearchActive)return toast('Search a date range first.');
      const arr=receiptRegisterRows();
      exportXLS('Fee_Receipt_Register.xls',['Date','Receipt No','Reg No','Student','Class','Months','Cash','Bank','Total Received','Dues','Mode / Bank'],arr.map(r=>{const cash=typeof f10ReceiptCash==='function'?f10ReceiptCash(r):num(r.cashReceived),bank=typeof f10ReceiptDirectBank==='function'?f10ReceiptDirectBank(r):num(r.bankReceived);return [r.date,r.receiptNo,r.registrationNo,r.studentName,r.className,(r.months||[]).map(i=>NP_MONTHS[i]).join(', '),cash,bank,cash+bank,r.balance,(cash>0&&bank>0?'Cash + Bank':bank>0?'Bank':'Cash')+(bank>0&&r.bankId?' - '+bankLabel(r.bankId):'')]}),'Fee Receipt Register');
    };
    drawReceiptRegister();
  };
  window.renderReceiptRegister=renderReceiptRegister;
})();
/* ================== END V19.4 CURRENT DATE + DATE-FIRST RECEIPT REGISTER + SAFE DELETE ================== */

/* V19.4 compatibility: legacy Delete buttons elsewhere use the same safe online delete. */
deleteReceipt=function(id){return window.v194DeleteFeeReceipt?window.v194DeleteFeeReceipt(id):toast('Delete Receipt is not ready.');};
window.deleteReceipt=deleteReceipt;

/* ==================== V19.5 FINAL USER REVISION ====================
   1) Accountant transaction controls: View / Edit / Print / Delete.
   2) Annual Fee Statement (A5).
   3) Admit Card = 6 per A4; Reminder = 4 per A4 with cut guides.
   4) Printed school name in blue.
   5) Full A5 fee receipt with professional border; no undersized print.
   6) Receipt logo moved to the left/front like the Admit Card.
==================================================================== */
(function(){
  const V195_DELETED_BANK='__DELETED__';
  function v195BankDeleted(b){return String(b?.remarks||'').startsWith(V195_DELETED_BANK);}
  function v195VisibleBanks(){return (db.banks||[]).filter(b=>!v195BankDeleted(b));}
  window.v195BankDeleted=v195BankDeleted;

  /* ---------- Bank master: deleted banks disappear from active UI but stay in history ---------- */
  activeBanks=function(){return (db.banks||[]).filter(b=>b.active!==false&&!v195BankDeleted(b));};
  window.activeBanks=activeBanks;
  bankOptions=function(selected='',blank='Select Bank'){return `<option value="">${blank}</option>`+activeBanks().map(b=>`<option value="${b.id}" ${b.id===selected?'selected':''}>${esc(b.name)}</option>`).join('');};
  window.bankOptions=bankOptions;

  v181BankingBalanceCards=function(today){
    const bankCards=v195VisibleBanks().map(b=>`<div class="bank-balance-card"><small>${esc(b.name)}</small><strong>${money(bankBalanceThrough(b.id,today))}</strong><span>${esc(b.accountNo||'')}${b.active===false?' · Inactive':''}</span></div>`).join('');
    return `<div class="bank-balance-grid"><div class="bank-balance-card cash"><small>Cash Balance</small><strong>${money(cashBalanceThrough(today))}</strong></div>${bankCards||'<div class="bank-balance-card"><small>Bank Accounts</small><strong>None</strong><span>Add a bank account to begin.</span></div>'}</div>`;
  };
  window.v181BankingBalanceCards=v181BankingBalanceCards;

  drawBankList=function(){
    const h=$('#bankList');if(!h)return;
    const rows=v195VisibleBanks();
    h.innerHTML=rows.length?`<div class="table-wrap compact"><table><thead><tr><th>Bank</th><th>Account No.</th><th class="amount">Opening</th><th class="amount">Current</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map(b=>`<tr><td><b>${esc(b.name)}</b><br><small>${esc(b.accountName||'')}</small></td><td>${esc(b.accountNo||'')}</td><td class="amount">${money(b.openingBalance)}</td><td class="amount">${money(bankBalanceThrough(b.id,workingDate()))}</td><td>${b.active!==false?'Active':'Inactive'}</td><td><button class="btn small" onclick="openBankForm('${b.id}')">Edit</button> <button class="btn small red" onclick="v195DeleteBank('${b.id}')">Delete</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No bank accounts yet.</div>`;
  };
  window.drawBankList=drawBankList;

  async function v195DeleteBank(id){
    if(!isAccountant())return;
    const b=bankById(id);if(!b)return toast('Bank not found.');
    if(!confirm(`Delete ${b.name}?\n\nThe bank will disappear from active Bank Master. Old transaction history will remain safe.`))return;
    try{
      const {error}=await sb.rpc('delete_bank_account_safe',{p_bank_id:id});
      if(error)throw error;
      await Promise.all([v17LoadOnlineBanks(),v18LoadOperations()]);
      renderBanking();toast('Bank deleted from active Bank Master.');
    }catch(e){
      const m=String(e?.message||'Unknown error');
      toast(/delete_bank_account_safe|does not exist/i.test(m)?'Run SETUP_ONCE.sql in Supabase once, then try Delete again.':'Bank delete failed: '+m);
    }
  }
  window.v195DeleteBank=v195DeleteBank;

  /* ---------- General print helpers ---------- */
  function v195OpenPrint(title,html,page='A5 portrait',extra=''){
    const w=window.open('','_blank','width=900,height=920');if(!w)return toast('Allow pop-ups to print.');
    w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>${esc(title)}</title><style>@page{size:${page};margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111}${extra}</style></head><body>${html}<script>setTimeout(()=>window.print(),350)<\/script></body></html>`);w.document.close();
  }
  function v195BlueSchoolName(){return '#155fa0';}

  /* ---------- A5 Fee Receipt: full page, left logo, blue school name, professional frame ---------- */
  receiptHTML=function(r){
    const logo=db.settings.logoData?`<img src="${db.settings.logoData}" alt="Logo">`:`<div class="receipt-logo-fallback">SA</div>`;
    const cash=Math.max(0,num(typeof f10ReceiptCash==='function'?f10ReceiptCash(r):r.cashReceived));
    const bank=Math.max(0,num(typeof f10ReceiptDirectBank==='function'?f10ReceiptDirectBank(r):r.bankReceived));
    const received=cash+bank, gross=num(r.netPayable||r.grandTotal||0), balance=Math.max(0,num(r.balance));
    const bankName=bank>0?bankLabel(r.bankId):'', phone=esc(db.settings.phone||'');
    const itemRows=((r.items||[]).length?(r.items||[]):[{label:'Old Dues Payment',amount:num(r.oldDues)}]).map((i,idx)=>`<tr><td>${idx+1}</td><td>${esc(i.label||'')}</td><td class="num">${money(num(i.amount))}</td><td></td><td></td></tr>`).join('');
    const dense=(r.items||[]).length>12?' receipt-dense':'';
    return `<div class="v195-a5-receipt${dense}" id="printReceipt"><div class="v195-inner-frame"><div class="v195-receipt-head"><div class="v195-logo">${logo}</div><div class="v195-school"><h1>${esc(db.settings.schoolName)}</h1><p>${esc(db.settings.address)}</p><p><b>Phone:</b> ${phone} &nbsp; <b>ESTD:</b> ${esc(db.settings.estd||'')} &nbsp; <b>PAN:</b> ${esc(db.settings.pan||'')}</p></div></div><div class="v195-receipt-title">FEE RECEIPT</div><div class="v195-meta"><div><b>Receipt No.:</b> ${esc(r.receiptNo)}</div><div><b>Nepali Date:</b> ${esc(r.date)}</div><div><b>Registration No.:</b> ${esc(r.registrationNo)}</div><div><b>Class:</b> ${esc(r.className)}</div><div><b>Student Name:</b> ${esc(r.studentName)}</div><div><b>Parent/Guardian:</b> ${esc(r.guardian||'')}</div><div class="wide"><b>Fee For Month(s):</b> ${esc((r.months||[]).map(i=>NP_MONTHS[i]).join(', ')||'-')}</div></div><div class="v195-old-dues"><b>Old Dues:</b> ${num(r.oldDues)>0?money(r.oldDues):'-'}</div><table class="v195-fee-table"><thead><tr><th style="width:7%">S.N.</th><th>Particular</th><th style="width:20%">Total Amount</th><th style="width:20%">Receive Amount</th><th style="width:18%">Balance</th></tr></thead><tbody>${itemRows}</tbody></table><div class="v195-summary-wrap"><table class="v195-summary"><tr><td>Total Amount</td><td>${money(r.currentTotal)}</td></tr><tr><td>Dues</td><td>${num(r.oldDues)>0?money(r.oldDues):'-'}</td></tr><tr class="strong"><td>Grand Total</td><td>${money(gross)}</td></tr><tr><td>Cash Received</td><td>${money(cash)}</td></tr><tr><td>Bank Received</td><td>${money(bank)}</td></tr>${bank>0?`<tr><td>Bank Account</td><td>${esc(bankName)}</td></tr>`:''}<tr class="strong"><td>Total Received</td><td>${money(received)}</td></tr><tr><td>Balance</td><td>${money(balance)}</td></tr></table></div><div class="v195-words"><b>Amount in Words:</b> ${esc(amountInWords(received))} only.</div><div class="v195-refund-note">Bill is essential to get the deposit refunded.</div><div class="v195-signs"><div>Issued by: <b>${esc(db.settings.issuedBy||r.issuedBy||'')}</b></div><div class="accountant-sign"><span></span><b>Accountant</b></div></div><div class="v195-foot">Phone: ${phone} &nbsp; · &nbsp; Nepali Date: ${esc(r.date)}</div></div></div>`;
  };
  window.receiptHTML=receiptHTML;

  const V195_RECEIPT_CSS=`.v195-a5-receipt{width:148mm;min-height:210mm;padding:4.5mm;margin:0 auto;background:#fff}.v195-inner-frame{min-height:201mm;border:2px solid #155fa0;box-shadow:inset 0 0 0 1px #fff,inset 0 0 0 3px #7aa9ca;padding:5mm;position:relative;display:flex;flex-direction:column}.v195-receipt-head{display:grid;grid-template-columns:25mm 1fr 25mm;align-items:center;border-bottom:1px solid #8bb3d0;padding-bottom:2.5mm}.v195-logo{width:22mm;height:22mm;display:grid;place-items:center}.v195-logo img{max-width:21mm;max-height:21mm;object-fit:contain}.receipt-logo-fallback{font-weight:900;font-size:18px;color:#155fa0}.v195-school{text-align:center}.v195-school h1{margin:0;color:#155fa0;font-size:18px;font-weight:900;line-height:1.08;text-transform:uppercase}.v195-school p{margin:1px 0;font-size:9px}.v195-receipt-title{text-align:center;font-size:13px;font-weight:900;letter-spacing:.08em;text-decoration:underline;margin:2.5mm 0}.v195-meta{display:grid;grid-template-columns:1fr 1fr;gap:1.3mm 6mm;font-size:9.5px;line-height:1.25}.v195-meta .wide{grid-column:1/-1}.v195-meta b{display:inline-block;min-width:27mm}.v195-old-dues{font-size:9.5px;margin:2mm 0}.v195-fee-table{width:100%;border-collapse:collapse;font-size:9px}.v195-fee-table th,.v195-fee-table td{border:1px solid #333;padding:1.35mm 1.6mm}.v195-fee-table th{background:#eef5fa;text-align:center}.v195-fee-table td:first-child{text-align:center}.v195-fee-table .num{text-align:right}.v195-summary-wrap{display:flex;justify-content:flex-end}.v195-summary{width:58%;border-collapse:collapse;font-size:9.2px;margin-top:1.8mm}.v195-summary td{border:1px solid #333;padding:1.05mm 1.6mm}.v195-summary td:last-child{text-align:right;font-weight:700}.v195-summary .strong td{font-weight:900;background:#f4f8fb}.v195-words{font-size:9.2px;margin-top:2mm}.v195-refund-note{font-size:8.5px;margin-top:.8mm}.v195-signs{display:grid;grid-template-columns:1fr 1fr;gap:18mm;margin-top:auto;padding-top:8mm;font-size:9px;align-items:end}.v195-signs>div:first-child{padding-bottom:2mm}.accountant-sign{text-align:center}.accountant-sign span{display:block;border-top:1px dotted #222;margin-bottom:1mm}.v195-foot{text-align:center;font-size:7.5px;margin-top:2.5mm;color:#444}.receipt-dense .v195-fee-table{font-size:7.8px}.receipt-dense .v195-fee-table th,.receipt-dense .v195-fee-table td{padding:.8mm 1mm}.receipt-dense .v195-meta,.receipt-dense .v195-old-dues,.receipt-dense .v195-summary,.receipt-dense .v195-words{font-size:8.2px}`;

  printReceipt=function(id){const r=receiptById(id);if(!r)return;v195OpenPrint(r.receiptNo,receiptHTML(r),'A5 portrait',V195_RECEIPT_CSS);};
  window.printReceipt=printReceipt;

  /* Fee receipt edit: payment/date fields only; line items stay audit-safe. */
  function v195OpenFeeReceiptEdit(id){
    const r=receiptById(id);if(!r||!isAccountant())return;
    const cash=Math.max(0,num(f10ReceiptCash(r))),bank=Math.max(0,num(f10ReceiptDirectBank(r)));
    openModal('EDIT FEE RECEIPT',`Edit ${r.receiptNo}`,`<form id="v195FeeEdit" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(r.date)}" required></div><div><label>Discount</label><input name="discount" type="number" min="0" step="0.01" value="${num(r.discount)}"></div><div><label>Cash Received</label><input name="cash" type="number" min="0" step="0.01" value="${cash}"></div><div><label>Bank Received</label><input name="bank" type="number" min="0" step="0.01" value="${bank}"></div><div class="full"><label>Bank Account</label><select name="bankId">${bankOptions(r.bankId||'')}</select></div><div class="full"><label>Remarks</label><textarea name="remarks">${esc(r.remarks||'')}</textarea></div><div class="full card-note">Fee months and fee-head items stay unchanged. Edit recalculates the latest student dues automatically.</div><div class="full form-actions"><button type="button" class="btn" onclick="showReceiptById('${r.id}')">Back</button><button class="btn primary">Save Changes</button></div></form>`);
    const f=$('#v195FeeEdit');f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f),date=String(fd.get('date')||''),c=num(fd.get('cash')),b=num(fd.get('bank')),bankId=String(fd.get('bankId')||'');if(!npDateValid(date))return toast('Use Nepali date YYYY-MM-DD.');if(c+b<0)return;if(b>0&&!bankId)return toast('Select the bank for Bank Received.');try{const {error}=await sb.rpc('edit_latest_fee_receipt_payment_atomic',{p_receipt_id:r.id,p_nepali_date:date,p_discount:num(fd.get('discount')),p_cash_received:c,p_bank_received:b,p_bank_id:b>0?bankId:null,p_remarks:fd.get('remarks')||null});if(error)throw error;await Promise.all([v15LoadOnlineStudents(),v17LoadOnlineReceipts(),v17LoadOnlineBanks()]);closeModal();showReceiptById(r.id);toast('Fee receipt updated and dues recalculated.');}catch(err){const m=String(err?.message||'Unknown error');toast(/edit_latest_fee_receipt_payment_atomic|does not exist/i.test(m)?'Run SETUP_ONCE.sql in Supabase once, then edit again.':'Receipt edit failed: '+m);}};
  }
  window.v195OpenFeeReceiptEdit=v195OpenFeeReceiptEdit;

  showReceiptById=function(id,autoPrint=false){
    const r=receiptById(id);if(!r)return;
    openModal('FEE RECEIPT',`Receipt ${r.receiptNo}`,`<div class="no-print form-actions" style="margin-bottom:10px"><button class="btn" onclick="closeModal()">Close</button>${isAccountant()?`<button class="btn primary" onclick="printReceipt('${r.id}')">Print / Reprint A5</button> <button class="btn" onclick="v195OpenFeeReceiptEdit('${r.id}')">Edit</button> <button class="btn red" onclick="v194DeleteFeeReceipt('${r.id}')">Delete</button>`:''}</div><div class="receipt-preview"><style>${V195_RECEIPT_CSS}</style>${receiptHTML(r)}</div>`);if(autoPrint)setTimeout(()=>printReceipt(r.id),250);
  };
  window.showReceiptById=showReceiptById;

  /* Add direct action buttons to the date-filtered Fee Receipt Register. */
  const _v195BaseDrawReceiptRegister=drawReceiptRegister;
  drawReceiptRegister=function(){
    _v195BaseDrawReceiptRegister();
    if(!isAccountant())return;
    $$('#receiptRegHost tbody tr').forEach(tr=>{const no=tr.children?.[1]?.textContent?.trim();const r=(db.receipts||[]).find(x=>String(x.receiptNo)===String(no));if(!r)return;const td=tr.lastElementChild;if(td)td.innerHTML=`<button class="btn small" onclick="showReceiptById('${r.id}')">View</button> <button class="btn small" onclick="v195OpenFeeReceiptEdit('${r.id}')">Edit</button> <button class="btn small" onclick="printReceipt('${r.id}')">Print</button> <button class="btn small red" onclick="v194DeleteFeeReceipt('${r.id}')">Delete</button>`;});
  };
  window.drawReceiptRegister=drawReceiptRegister;

  /* ---------- Quick Receipt: View / Edit / Print / Delete ---------- */
  quickReceiptHTML=function(q){
    const logo=db.settings.logoData?`<img src="${db.settings.logoData}" alt="Logo">`:`<div class="receipt-logo-fallback">SA</div>`,bank=q.mode==='Bank'?bankLabel(q.bankId):'';
    return `<div class="v195-a5-receipt"><div class="v195-inner-frame"><div class="v195-receipt-head"><div class="v195-logo">${logo}</div><div class="v195-school"><h1>${esc(db.settings.schoolName)}</h1><p>${esc(db.settings.address)}</p><p><b>Phone:</b> ${esc(db.settings.phone||'')} &nbsp; <b>PAN:</b> ${esc(db.settings.pan||'')}</p></div></div><div class="v195-receipt-title">QUICK RECEIPT</div><div class="v195-meta"><div><b>Receipt No.:</b> ${esc(q.receiptNo)}</div><div><b>Nepali Date:</b> ${esc(q.date)}</div><div><b>Received From:</b> ${esc(q.receivedFrom||'-')}</div><div><b>Mode:</b> ${esc(q.mode)}${bank?` — ${esc(bank)}`:''}</div></div><table class="v195-fee-table" style="margin-top:4mm"><thead><tr><th>S.N.</th><th>Particular</th><th>Amount</th></tr></thead><tbody><tr><td>1</td><td>${esc(q.title)}${q.remarks?`<br><small>${esc(q.remarks)}</small>`:''}</td><td class="num">${money(q.amount)}</td></tr></tbody></table><div class="v195-words"><b>Amount in Words:</b> ${esc(amountInWords(q.amount))} only.</div><div class="v195-signs"><div>Issued by: <b>${esc(q.issuedBy||db.settings.issuedBy||'')}</b></div><div class="accountant-sign"><span></span><b>Accountant</b></div></div></div></div>`;
  };
  window.quickReceiptHTML=quickReceiptHTML;
  printQuickReceipt=function(id){const q=(db.quickReceipts||[]).find(x=>x.id===id);if(q)v195OpenPrint(q.receiptNo,quickReceiptHTML(q),'A5 portrait',V195_RECEIPT_CSS);};
  window.printQuickReceipt=printQuickReceipt;

  async function v195DeleteQuick(id){const q=(db.quickReceipts||[]).find(x=>x.id===id);if(!q||!confirm(`Delete quick receipt ${q.receiptNo}?`))return;try{const {error}=await sb.rpc('void_quick_receipt',{p_quick_receipt_id:id,p_reason:'Deleted by Accountant'});if(error)throw error;await v18LoadOperations();closeModal();renderPage();toast('Quick receipt deleted.');}catch(e){toast('Quick receipt delete failed: '+String(e?.message||''));}}
  window.v195DeleteQuick=v195DeleteQuick;
  function v195EditQuick(id){const q=(db.quickReceipts||[]).find(x=>x.id===id);if(!q)return;openModal('EDIT QUICK RECEIPT',q.receiptNo,`<form id="v195QuickEdit" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(q.date)}"></div><div><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" value="${num(q.amount)}"></div><div><label>Payment Mode</label><select name="mode"><option ${q.mode==='Cash'?'selected':''}>Cash</option><option ${q.mode==='Bank'?'selected':''}>Bank</option></select></div><div><label>Bank Account</label><select name="bankId">${bankOptions(q.bankId||'')}</select></div><div class="full"><label>Income Title</label><input name="title" value="${esc(q.title)}"></div><div><label>Received From</label><input name="from" value="${esc(q.receivedFrom||'')}"></div><div class="full"><label>Remarks</label><textarea name="remarks">${esc(q.remarks||'')}</textarea></div><div class="full form-actions"><button type="button" class="btn" onclick="showQuickReceipt('${q.id}')">Back</button><button class="btn primary">Save Changes</button></div></form>`);const f=$('#v195QuickEdit');f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f),mode=String(fd.get('mode')),bankId=String(fd.get('bankId')||'');if(!npDateValid(fd.get('date')))return toast('Use Nepali date YYYY-MM-DD.');if(mode==='Bank'&&!bankId)return toast('Select Bank Account.');try{const {error}=await sb.rpc('edit_quick_receipt_atomic',{p_quick_receipt_id:q.id,p_nepali_date:fd.get('date'),p_amount:num(fd.get('amount')),p_payment_mode:mode,p_bank_id:mode==='Bank'?bankId:null,p_income_title:fd.get('title'),p_received_from:fd.get('from')||null,p_remarks:fd.get('remarks')||null});if(error)throw error;await v18LoadOperations();closeModal();showQuickReceipt(q.id);toast('Quick receipt updated.');}catch(err){const m=String(err?.message||'');toast(/edit_quick_receipt_atomic|does not exist/i.test(m)?'Run SETUP_ONCE.sql in Supabase once.':'Quick receipt edit failed: '+m);}};}
  window.v195EditQuick=v195EditQuick;
  showQuickReceipt=function(id,autoPrint=false){const q=(db.quickReceipts||[]).find(x=>x.id===id);if(!q)return;openModal('QUICK RECEIPT',q.receiptNo,`<div class="no-print form-actions" style="margin-bottom:10px"><button class="btn" onclick="closeModal()">Close</button>${isAccountant()?`<button class="btn primary" onclick="printQuickReceipt('${q.id}')">Print</button> <button class="btn" onclick="v195EditQuick('${q.id}')">Edit</button> <button class="btn red" onclick="v195DeleteQuick('${q.id}')">Delete</button>`:''}</div><div class="receipt-preview"><style>${V195_RECEIPT_CSS}</style>${quickReceiptHTML(q)}</div>`);if(autoPrint)setTimeout(()=>printQuickReceipt(q.id),250);};
  window.showQuickReceipt=showQuickReceipt;
  drawQuickList=function(){const h=$('#quickList');if(!h)return;const a=[...(db.quickReceipts||[])].sort((x,y)=>y.date.localeCompare(x.date));h.innerHTML=a.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Income</th><th>From</th><th>Mode / Bank</th><th class="amount">Amount</th><th>Action</th></tr></thead><tbody>${a.map(q=>`<tr><td>${q.date}</td><td><b>${esc(q.receiptNo)}</b></td><td>${esc(q.title)}</td><td>${esc(q.receivedFrom||'')}</td><td>${esc(q.mode)}${q.mode==='Bank'?`<br><small>${esc(bankLabel(q.bankId))}</small>`:''}</td><td class="amount">${money(q.amount)}</td><td><button class="btn small" onclick="showQuickReceipt('${q.id}')">View</button> <button class="btn small" onclick="v195EditQuick('${q.id}')">Edit</button> <button class="btn small" onclick="printQuickReceipt('${q.id}')">Print</button> <button class="btn small red" onclick="v195DeleteQuick('${q.id}')">Delete</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">No online Quick Receipts.</div>`;};
  window.drawQuickList=drawQuickList;
  renderQuickRegister=function(){if(!isAccountant()&&!hasPermission('quickRegister'))return unauthorized();const a=[...(db.quickReceipts||[])].sort((x,y)=>y.date.localeCompare(x.date));$('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Quick Receipt Register</h3></div>${isAccountant()?'<button class="btn green" id="qrExportOnly">Export Excel</button>':''}</div>${a.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Income</th><th>From</th><th>Mode / Bank</th><th class="amount">Amount</th><th>Action</th></tr></thead><tbody>${a.map(q=>`<tr><td>${q.date}</td><td><b>${esc(q.receiptNo)}</b></td><td>${esc(q.title)}</td><td>${esc(q.receivedFrom||'')}</td><td>${esc(q.mode)}${q.mode==='Bank'?`<br><small>${esc(bankLabel(q.bankId))}</small>`:''}</td><td class="amount">${money(q.amount)}</td><td>${isAccountant()?`<button class="btn small" onclick="showQuickReceipt('${q.id}')">View</button> <button class="btn small" onclick="v195EditQuick('${q.id}')">Edit</button> <button class="btn small" onclick="printQuickReceipt('${q.id}')">Print</button> <button class="btn small red" onclick="v195DeleteQuick('${q.id}')">Delete</button>`:'Read only'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No Quick Receipts.</div>'}</div>`;if(isAccountant())$('#qrExportOnly').onclick=exportQuickReceipts;};
  window.renderQuickRegister=renderQuickRegister;

  /* ---------- Expenses: View / Edit / Print / Delete ---------- */
  function v195ExpenseHTML(e){const logo=db.settings.logoData?`<img src="${db.settings.logoData}" alt="Logo">`:'<div class="receipt-logo-fallback">SA</div>';return `<div class="v195-a5-receipt"><div class="v195-inner-frame"><div class="v195-receipt-head"><div class="v195-logo">${logo}</div><div class="v195-school"><h1>${esc(db.settings.schoolName)}</h1><p>${esc(db.settings.address)}</p></div></div><div class="v195-receipt-title">EXPENSE VOUCHER</div><div class="v195-meta"><div><b>Voucher No.:</b> ${esc(e.voucherNo||'')}</div><div><b>Nepali Date:</b> ${esc(e.date)}</div><div><b>Expense Head:</b> ${esc(e.head)}</div><div><b>Paid To:</b> ${esc(e.paidTo||'-')}</div><div><b>Mode:</b> ${esc(e.mode)}</div><div><b>Bank:</b> ${e.mode==='Bank'?esc(bankLabel(e.bankId)):'-'}</div></div><table class="v195-fee-table" style="margin-top:5mm"><thead><tr><th>Particular</th><th>Amount</th></tr></thead><tbody><tr><td>${esc(e.head)}${e.remarks?`<br><small>${esc(e.remarks)}</small>`:''}</td><td class="num">${money(e.amount)}</td></tr></tbody></table><div class="v195-words"><b>Amount in Words:</b> ${esc(amountInWords(e.amount))} only.</div><div class="v195-signs"><div>Entered by: <b>${esc(e.enteredBy||db.settings.issuedBy||'')}</b></div><div class="accountant-sign"><span></span><b>Accountant</b></div></div></div></div>`;}
  function v195PrintExpense(id){const e=(db.expenses||[]).find(x=>x.id===id);if(e)v195OpenPrint(e.voucherNo||'Expense',v195ExpenseHTML(e),'A5 portrait',V195_RECEIPT_CSS);}
  window.v195PrintExpense=v195PrintExpense;
  function v195ViewExpense(id){const e=(db.expenses||[]).find(x=>x.id===id);if(!e)return;openModal('EXPENSE',e.voucherNo||'Expense',`<div class="form-actions" style="margin-bottom:10px"><button class="btn" onclick="closeModal()">Close</button><button class="btn primary" onclick="v195PrintExpense('${e.id}')">Print</button><button class="btn" onclick="v195EditExpense('${e.id}')">Edit</button><button class="btn red" onclick="v195DeleteExpense('${e.id}')">Delete</button></div><div class="receipt-preview"><style>${V195_RECEIPT_CSS}</style>${v195ExpenseHTML(e)}</div>`);}
  window.v195ViewExpense=v195ViewExpense;
  function v195EditExpense(id){const e=(db.expenses||[]).find(x=>x.id===id);if(!e)return;openModal('EDIT EXPENSE',e.voucherNo||'',`<form id="v195ExpenseEdit" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(e.date)}"></div><div><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" value="${num(e.amount)}"></div><div><label>Mode</label><select name="mode"><option ${e.mode==='Cash'?'selected':''}>Cash</option><option ${e.mode==='Bank'?'selected':''}>Bank</option></select></div><div><label>Bank Account</label><select name="bankId">${bankOptions(e.bankId||'')}</select></div><div class="full"><label>Expense Head</label><input name="head" value="${esc(e.head)}"></div><div><label>Paid To</label><input name="paidTo" value="${esc(e.paidTo||'')}"></div><div class="full"><label>Remarks</label><textarea name="remarks">${esc(e.remarks||'')}</textarea></div><div class="full form-actions"><button type="button" class="btn" onclick="v195ViewExpense('${e.id}')">Back</button><button class="btn primary">Save Changes</button></div></form>`);const f=$('#v195ExpenseEdit');f.onsubmit=async ev=>{ev.preventDefault();const fd=new FormData(f),mode=String(fd.get('mode')),bankId=String(fd.get('bankId')||'');if(!npDateValid(fd.get('date')))return toast('Use Nepali date YYYY-MM-DD.');if(mode==='Bank'&&!bankId)return toast('Select Bank Account.');try{const {error}=await sb.rpc('edit_expense_atomic',{p_expense_id:e.id,p_nepali_date:fd.get('date'),p_amount:num(fd.get('amount')),p_payment_mode:mode,p_bank_id:mode==='Bank'?bankId:null,p_expense_head:fd.get('head'),p_paid_to:fd.get('paidTo')||null,p_remarks:fd.get('remarks')||null});if(error)throw error;await v18LoadOperations();closeModal();v195ViewExpense(e.id);toast('Expense updated.');}catch(err){const m=String(err?.message||'');toast(/edit_expense_atomic|does not exist/i.test(m)?'Run SETUP_ONCE.sql in Supabase once.':'Expense edit failed: '+m);}};}
  window.v195EditExpense=v195EditExpense;
  async function v195DeleteExpense(id){const e=(db.expenses||[]).find(x=>x.id===id);if(!e||!confirm(`Delete expense ${e.voucherNo||''}?`))return;try{const {error}=await sb.rpc('void_expense',{p_expense_id:id,p_reason:'Deleted by Accountant'});if(error)throw error;await v18LoadOperations();closeModal();renderPage();toast('Expense deleted.');}catch(err){toast('Expense delete failed: '+String(err?.message||''));}}
  window.v195DeleteExpense=v195DeleteExpense;
  v18DrawExpenses=function(){const h=$('#expHost');if(!h)return;const rows=[...(db.expenses||[])].sort((a,b)=>b.date.localeCompare(a.date));h.innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Voucher</th><th>Date</th><th>Head</th><th>Paid To</th><th>Mode / Bank</th><th class="amount">Amount</th><th>Action</th></tr></thead><tbody>${rows.map(e=>`<tr><td><b>${esc(e.voucherNo)}</b></td><td>${esc(e.date)}</td><td>${esc(e.head)}</td><td>${esc(e.paidTo||'')}</td><td>${esc(e.mode)}${e.mode==='Bank'?`<br><small>${esc(bankLabel(e.bankId))}</small>`:''}</td><td class="amount">${money(e.amount)}</td><td><button class="btn small" onclick="v195ViewExpense('${e.id}')">View</button> <button class="btn small" onclick="v195EditExpense('${e.id}')">Edit</button> <button class="btn small" onclick="v195PrintExpense('${e.id}')">Print</button> <button class="btn small red" onclick="v195DeleteExpense('${e.id}')">Delete</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No online expenses.</div>';};
  window.v18DrawExpenses=v18DrawExpenses;

  /* ---------- Bank transaction register: View / Edit / Print / Delete ---------- */
  function v195BankTxHTML(t){const logo=db.settings.logoData?`<img src="${db.settings.logoData}" alt="Logo">`:'<div class="receipt-logo-fallback">SA</div>';return `<div class="v195-a5-receipt"><div class="v195-inner-frame"><div class="v195-receipt-head"><div class="v195-logo">${logo}</div><div class="v195-school"><h1>${esc(db.settings.schoolName)}</h1><p>${esc(db.settings.address)}</p></div></div><div class="v195-receipt-title">BANK TRANSACTION</div><div class="v195-meta"><div><b>Nepali Date:</b> ${esc(t.date)}</div><div><b>Bank:</b> ${esc(bankLabel(t.bankId))}</div><div><b>Transaction:</b> ${t.type==='cash_deposit'?'Cash → Bank Deposit':'Bank → Cash Withdrawal'}</div><div><b>Amount:</b> ${money(t.amount)}</div><div><b>By:</b> ${esc(t.person||'-')}</div><div><b>Reference:</b> ${esc(t.ref||'-')}</div><div class="wide"><b>Purpose:</b> ${esc(t.purpose||'-')}</div><div class="wide"><b>Remarks:</b> ${esc(t.remarks||'-')}</div></div><div class="v195-signs"><div>Prepared by: <b>${esc(db.settings.issuedBy||'')}</b></div><div class="accountant-sign"><span></span><b>Accountant</b></div></div></div></div>`;}
  function v195PrintBankTx(id){const t=(db.bankTransactions||[]).find(x=>x.id===id);if(t)v195OpenPrint('Bank Transaction',v195BankTxHTML(t),'A5 portrait',V195_RECEIPT_CSS);}
  window.v195PrintBankTx=v195PrintBankTx;
  function v195ViewBankTx(id){const t=(db.bankTransactions||[]).find(x=>x.id===id);if(!t)return;openModal('BANK TRANSACTION',bankLabel(t.bankId),`<div class="form-actions" style="margin-bottom:10px"><button class="btn" onclick="closeModal()">Close</button><button class="btn primary" onclick="v195PrintBankTx('${t.id}')">Print</button><button class="btn" onclick="v195EditBankTx('${t.id}')">Edit</button><button class="btn red" onclick="v195DeleteBankTx('${t.id}')">Delete</button></div><div class="receipt-preview"><style>${V195_RECEIPT_CSS}</style>${v195BankTxHTML(t)}</div>`);}
  window.v195ViewBankTx=v195ViewBankTx;
  function v195EditBankTx(id){const t=(db.bankTransactions||[]).find(x=>x.id===id);if(!t)return;openModal('EDIT BANK TRANSACTION',bankLabel(t.bankId),`<form id="v195BankTxEdit" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(t.date)}"></div><div><label>Transaction</label><select name="type"><option value="cash_deposit" ${t.type==='cash_deposit'?'selected':''}>Cash → Bank Deposit</option><option value="withdrawal" ${t.type==='withdrawal'?'selected':''}>Bank → Cash Withdrawal</option></select></div><div class="full"><label>Bank Account</label><select name="bankId">${bankOptions(t.bankId||'')}</select></div><div><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" value="${num(t.amount)}"></div><div><label>Deposited / Withdrawn By</label><input name="person" value="${esc(t.person||'')}"></div><div class="full"><label>Purpose</label><input name="purpose" value="${esc(t.purpose||'')}"></div><div class="full"><label>Remarks</label><textarea name="remarks">${esc(t.remarks||'')}</textarea></div><div class="full form-actions"><button type="button" class="btn" onclick="v195ViewBankTx('${t.id}')">Back</button><button class="btn primary">Save Changes</button></div></form>`);const f=$('#v195BankTxEdit');f.onsubmit=async ev=>{ev.preventDefault();const fd=new FormData(f);if(!npDateValid(fd.get('date')))return toast('Use Nepali date YYYY-MM-DD.');if(!fd.get('bankId'))return toast('Select Bank Account.');try{const {error}=await sb.rpc('edit_bank_transaction_atomic',{p_bank_transaction_id:t.id,p_nepali_date:fd.get('date'),p_transaction_type:fd.get('type'),p_bank_id:fd.get('bankId'),p_amount:num(fd.get('amount')),p_person_name:fd.get('person')||null,p_purpose:fd.get('purpose')||null,p_remarks:fd.get('remarks')||null});if(error)throw error;await v18LoadOperations();closeModal();v195ViewBankTx(t.id);toast('Bank transaction updated.');}catch(err){const m=String(err?.message||'');toast(/edit_bank_transaction_atomic|does not exist/i.test(m)?'Run SETUP_ONCE.sql in Supabase once.':'Bank transaction edit failed: '+m);}};}
  window.v195EditBankTx=v195EditBankTx;
  async function v195DeleteBankTx(id){const t=(db.bankTransactions||[]).find(x=>x.id===id);if(!t||!confirm('Delete this bank transaction? Balances will recalculate automatically.'))return;try{const {error}=await sb.rpc('void_bank_transaction',{p_bank_transaction_id:id,p_reason:'Deleted by Accountant'});if(error)throw error;await v18LoadOperations();closeModal();renderBanking();toast('Bank transaction deleted.');}catch(err){toast('Bank transaction delete failed: '+String(err?.message||''));}}
  window.v195DeleteBankTx=v195DeleteBankTx;
  function v195DrawBankTxRegister(){const h=$('#v195BankTxRegister');if(!h)return;const rows=[...(db.bankTransactions||[])].sort((a,b)=>b.date.localeCompare(a.date));h.innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Bank</th><th>Person</th><th>Purpose</th><th class="amount">Amount</th><th>Action</th></tr></thead><tbody>${rows.map(t=>`<tr><td>${esc(t.date)}</td><td>${t.type==='cash_deposit'?'Cash → Bank':'Bank → Cash'}</td><td>${esc(bankLabel(t.bankId))}</td><td>${esc(t.person||'')}</td><td>${esc(t.purpose||'')}</td><td class="amount">${money(t.amount)}</td><td><button class="btn small" onclick="v195ViewBankTx('${t.id}')">View</button> <button class="btn small" onclick="v195EditBankTx('${t.id}')">Edit</button> <button class="btn small" onclick="v195PrintBankTx('${t.id}')">Print</button> <button class="btn small red" onclick="v195DeleteBankTx('${t.id}')">Delete</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No bank transactions yet.</div>';}
  window.v195DrawBankTxRegister=v195DrawBankTxRegister;

  const _v195BaseRenderBanking=renderBanking;
  renderBanking=function(){
    _v195BaseRenderBanking();
    if(!isAccountant())return;
    drawBankList();
    const report=$('#bankReportHost')?.closest('.section');
    if(report){const sec=document.createElement('div');sec.className='section premium-section';sec.innerHTML='<div class="section-title"><div><h3>Bank Transaction Register</h3></div></div><div id="v195BankTxRegister"></div>';report.parentNode.insertBefore(sec,report);v195DrawBankTxRegister();}
  };
  window.renderBanking=renderBanking;

  /* Banking summary ignores deleted bank cards, but historical rows keep their original bank name. */
  drawBankReport=function(){
    const f=$('#bankFrom')?.value||'',t=$('#bankTo')?.value||'',rows=bankingRows(f,t),prev=addDaysToNpDate(f||workingDate(),-1);
    const directStudent=sum(rows,r=>r.type==='Direct Fee Receipt'?r.inflow:0),directOther=sum(rows,r=>r.type==='Direct Quick Receipt'?r.inflow:0),cashTransfer=sum(rows,r=>r.type==='Cash → Bank Deposit'?r.inflow:0),withdrawals=sum(rows,r=>r.type==='Bank Withdrawal → Cash'?r.outflow:0),bankExpenses=sum(rows,r=>r.type==='Bank Expense'?r.outflow:0);
    const cards=[`<div class="summary-box"><small>Student Direct Bank Collection</small><strong>${money(directStudent)}</strong></div>`,`<div class="summary-box"><small>Other Direct Bank Collection</small><strong>${money(directOther)}</strong></div>`,`<div class="summary-box"><small>Cash → Bank Transfer</small><strong>${money(cashTransfer)}</strong></div>`,`<div class="summary-box"><small>Bank Withdrawal</small><strong>${money(withdrawals)}</strong></div>`,`<div class="summary-box"><small>Bank Expense</small><strong>${money(bankExpenses)}</strong></div>`,`<div class="summary-box"><small>Opening Cash</small><strong>${money(cashBalanceThrough(prev))}</strong></div>`,`<div class="summary-box"><small>Cash at End</small><strong>${money(cashBalanceThrough(t||workingDate()))}</strong></div>`,...v195VisibleBanks().map(b=>`<div class="summary-box"><small>${esc(b.name)} Closing Balance</small><strong>${money(bankBalanceThrough(b.id,t||workingDate()))}</strong></div>`)].join('');
    const body=rows.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Type</th><th>Reference</th><th>Bank</th><th>Details</th><th class="amount">Bank In</th><th class="amount">Bank Out</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.date}</td><td><b>${esc(f10BankingCategory(r))}</b></td><td>${esc(r.type)}</td><td>${esc(r.ref||'')}</td><td>${esc(bankLabel(r.bankId))}</td><td>${esc(r.details||'')}</td><td class="amount stat-green">${r.inflow?money(r.inflow):'-'}</td><td class="amount stat-red">${r.outflow?money(r.outflow):'-'}</td></tr>`).join('')}<tr class="total-row"><td colspan="6"><b>TOTAL BANK MOVEMENT</b></td><td class="amount"><b>${money(sum(rows,r=>r.inflow))}</b></td><td class="amount"><b>${money(sum(rows,r=>r.outflow))}</b></td></tr></tbody></table></div>`:'<div class="empty">No banking transactions in this date range.</div>';
    $('#bankReportHost').innerHTML=`<div class="summary-strip flexible-summary">${cards}</div>${body}`;
  };
  window.drawBankReport=drawBankReport;

  /* ---------- Annual Fee Statement: class -> student -> Old/New -> route, print A5 ---------- */
  function v195StandardMonthCharges(year,className,category,routeId,mi){
    const items=[];
    (db.feeHeads||[]).filter(h=>h.active!==false&&(h.months||[]).includes(mi)).forEach(h=>{
      const p=(db.feePlans||[]).find(p=>p.active!==false&&String(p.year)===String(year)&&p.headId===h.id&&(p.classes||[]).includes(className)&&(p.category==='All'||p.category===category));
      if(p)items.push({label:h.name,amount:num(p.amount)});
    });
    const tp=routeId?transportPlanFor(routeId,year):null;
    if(tp&&tp.active!==false&&(tp.months||[]).includes(mi))items.push({label:'Transportation Fee',amount:num(tp.amount)});
    return items;
  }
  function v195AnnualStatementData(){
    const year=$('#afsYear')?.value||getYear(),className=$('#afsClass')?.value||'',studentId=$('#afsStudent')?.value||'',category=$('#afsCategory')?.value||'New',routeId=$('#afsRoute')?.value||'',student=(db.students||[]).find(s=>s.id===studentId);
    if(!className||!student)return null;
    const months=NP_MONTHS.map((m,i)=>{const items=v195StandardMonthCharges(year,className,category,routeId,i);return {month:m,items,total:sum(items,x=>x.amount)}});
    return {year,className,student,category,routeId,route:routeById(routeId),months,total:sum(months,x=>x.total)};
  }
  function v195AnnualStatementBody(d,print=false){
    const rows=d.months.map(x=>`<tr><td><b>${esc(x.month)}</b></td><td>${x.items.length?x.items.map(i=>`${esc(i.label)} — ${money(i.amount)}`).join('<br>'):'-'}</td><td class="amount">${money(x.total)}</td></tr>`).join('');
    return `<div class="${print?'v195-afs-print':'v195-afs-preview'}"><div class="v195-afs-head"><div class="v195-afs-logo">${db.settings.logoData?`<img src="${db.settings.logoData}">`:''}</div><div><h1>${esc(db.settings.schoolName)}</h1><p>${esc(db.settings.address)}</p><h2>ANNUAL FEE STATEMENT</h2></div></div><div class="v195-afs-details"><div><b>Student:</b> ${esc(d.student.name)}</div><div><b>Class:</b> ${esc(d.className)}</div><div><b>Academic Year:</b> ${esc(d.year)}</div><div><b>Category:</b> ${esc(d.category)}</div><div><b>Route:</b> ${esc(d.route?.name||'No Transportation')}</div><div><b>Registration No.:</b> ${esc(d.student.registrationNo||'')}</div></div><div class="v195-afs-label">Statement Details</div><table class="v195-afs-table"><thead><tr><th>Month</th><th>Fee Details</th><th>Amount</th></tr></thead><tbody>${rows}<tr class="v195-afs-total"><td colspan="2">FULL YEAR TOTAL</td><td class="amount">${money(d.total)}</td></tr></tbody></table></div>`;
  }
  const V195_AFS_CSS=`.v195-afs-print{width:148mm;min-height:210mm;padding:6mm;border:2px solid #155fa0;box-shadow:inset 0 0 0 2px #d6e8f5;margin:0 auto}.v195-afs-head{display:grid;grid-template-columns:20mm minmax(0,1fr);column-gap:2mm;align-items:center;text-align:center;border-bottom:1px solid #8bb3d0;padding-bottom:2mm}.v195-afs-head>div:last-child{min-width:0}.v195-afs-logo{width:20mm;height:20mm;display:grid;place-items:center}.v195-afs-logo img{max-width:19mm;max-height:19mm;object-fit:contain}.v195-afs-head h1{margin:0;color:#155fa0;font-size:14px;font-weight:900;text-transform:uppercase;white-space:nowrap;letter-spacing:-.02em;line-height:1.12}.v195-afs-head p{margin:1px;font-size:8.5px}.v195-afs-head h2{margin:2mm 0 0;font-size:11px;letter-spacing:.06em}.v195-afs-details{display:grid;grid-template-columns:1fr 1fr;gap:1mm 4mm;font-size:8.5px;margin:2.5mm 0}.v195-afs-label{text-align:center;font-size:10px;font-weight:900;margin:1.5mm 0}.v195-afs-table{width:100%;border-collapse:collapse;font-size:7.8px}.v195-afs-table th,.v195-afs-table td{border:1px solid #555;padding:1.05mm 1.3mm;vertical-align:top}.v195-afs-table th{background:#edf5fa}.v195-afs-table th:first-child{width:17%}.v195-afs-table th:last-child{width:21%;text-align:right}.v195-afs-table .amount{text-align:right}.v195-afs-total td{font-weight:900;background:#f0f6fa;font-size:9px}.v195-afs-preview{max-width:760px;margin:auto;background:#fff;padding:18px;border:1px solid #aaa}.v195-afs-preview .v195-afs-head{display:grid;grid-template-columns:64px minmax(0,1fr);column-gap:8px}.v195-afs-preview .v195-afs-head>div:last-child{min-width:0}.v195-afs-preview .v195-afs-logo img{max-width:60px;max-height:60px}.v195-afs-preview .v195-afs-head h1{color:#155fa0;margin:0;font-size:18px;white-space:nowrap;letter-spacing:-.02em;line-height:1.12}.v195-afs-preview .v195-afs-details{display:grid;grid-template-columns:1fr 1fr;gap:6px 15px;margin:12px 0}.v195-afs-preview .v195-afs-table{width:100%;border-collapse:collapse}.v195-afs-preview .v195-afs-table th,.v195-afs-preview .v195-afs-table td{border:1px solid #aaa;padding:5px}.v195-afs-preview .amount{text-align:right}`;
  function v195DrawAnnualStatement(){const d=v195AnnualStatementData(),h=$('#afsPreview');if(!h)return;if(!d){h.innerHTML='<div class="empty">Select Class and Student to view the annual fee statement.</div>';$('#afsPrint').disabled=true;return;}h.innerHTML=`<style>${V195_AFS_CSS}</style>${v195AnnualStatementBody(d,false)}`;$('#afsPrint').disabled=false;}
  function v195PrintAnnualStatement(){const d=v195AnnualStatementData();if(!d)return toast('Select a student first.');v195OpenPrint(`${d.student.name} Annual Fee Statement`,v195AnnualStatementBody(d,true),'A5 portrait',V195_AFS_CSS);}
  window.v195PrintAnnualStatement=v195PrintAnnualStatement;
  function renderAnnualFeeStatement(){
    if(!isAccountant())return unauthorized();
    $('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Annual Fee Statement</h3></div><button class="btn primary" id="afsPrint" disabled>Print A5</button></div><div class="form-grid three"><div><label>Academic Year</label><select id="afsYear">${yearsOptions(getYear())}</select></div><div><label>Class</label><select id="afsClass">${classesOptions()}</select></div><div><label>Student</label><select id="afsStudent" disabled><option value="">Select Class First</option></select></div><div><label>Category</label><select id="afsCategory"><option>New</option><option>Old</option></select></div><div><label>Route</label><select id="afsRoute"><option value="">No Transportation</option>${(db.routes||[]).filter(r=>r.active!==false).map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div><div class="form-actions" style="align-items:end"><button class="btn cyan" id="afsView">View Statement</button></div></div><div id="afsPreview" style="margin-top:14px"><div class="empty">Select Class and Student to view the annual fee statement.</div></div></div>`;
    const refreshStudents=()=>{const y=$('#afsYear').value,c=$('#afsClass').value,sel=$('#afsStudent');const rows=(db.students||[]).filter(s=>String(s.year)===String(y)&&s.className===c&&s.active!==false).sort((a,b)=>a.name.localeCompare(b.name));sel.disabled=!c;sel.innerHTML=`<option value="">Select Student</option>`+rows.map(s=>`<option value="${s.id}">${esc(s.name)} (${esc(s.registrationNo||'')})</option>`).join('');$('#afsPreview').innerHTML='<div class="empty">Select a student to view the statement.</div>';$('#afsPrint').disabled=true;};
    $('#afsClass').onchange=refreshStudents;$('#afsYear').onchange=refreshStudents;$('#afsStudent').onchange=()=>{const s=studentById($('#afsStudent').value);if(s){$('#afsCategory').value=s.category==='Old'?'Old':'New';$('#afsRoute').value=s.routeId||'';}v195DrawAnnualStatement();};$('#afsCategory').onchange=v195DrawAnnualStatement;$('#afsRoute').onchange=v195DrawAnnualStatement;$('#afsView').onclick=v195DrawAnnualStatement;$('#afsPrint').onclick=v195PrintAnnualStatement;
  }
  window.renderAnnualFeeStatement=renderAnnualFeeStatement;

  /* ---------- Admit Card: 6 fixed cards per A4, never stretch one card to full A4 ---------- */
  printAdmitCards=function(){
    const students=selectedAdmitStudents();if(!students.length)return toast('Select at least one student.');
    const logo=db.settings.logoData?`<img src="${db.settings.logoData}" class="admit-logo">`:'';
    const card=s=>`<div class="admit-card"><div class="admit-top">${logo}<div class="admit-school"><div class="admit-school-name">${esc(db.settings.schoolName)}</div><div class="admit-school-sub">${esc(db.settings.address)}</div><div class="admit-term">${esc(db.settings.admitCardTerm||'First Term Exam')}</div><div class="admit-title">${esc(db.settings.admitCardTitle||'ADMIT CARD')}</div></div></div><div class="admit-body"><div class="admit-line"><span>Student Name:</span><b>${esc(s.name)}</b></div><div class="admit-line"><span>Class:</span><b>${esc(s.className)}</b></div><div class="admit-line"><span>Guardian:</span><b>${esc(s.guardian||s.fatherName||s.motherName||'')}</b></div><div class="admit-line"><span>Reg. No.:</span><b>${esc(s.registrationNo)}</b></div><div class="admit-line"><span>Hall No.:</span><b>${esc(s.admitHallNo||'................')}</b></div></div><div class="admit-signs">${admitSignature(db.settings.examCoordinatorSignatureData,db.settings.examCoordinatorName||'Exam Coordinator',db.settings.examCoordinatorPost||'Exam Coordinator')}${admitSignature(db.settings.principalSignatureData,db.settings.principalName||'Principal',db.settings.principalPost||'Principal')}${admitSignature(db.settings.accountantSignatureData,db.settings.accountantSignName||'Accountant',db.settings.accountantSignPost||'Accountant')}</div></div>`;
    const pages=[];for(let i=0;i<students.length;i+=6)pages.push(`<section class="admit-page">${students.slice(i,i+6).map(card).join('')}</section>`);
    const css=`@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif}.admit-page{height:287mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(3,1fr);gap:2.5mm;page-break-after:always}.admit-page:last-child{page-break-after:auto}.admit-card{border:1.7px solid #2d7fbd;border-radius:8px;padding:3mm;background:linear-gradient(145deg,#f3fbff,#fff 60%,#f8fbff);position:relative;overflow:hidden;box-shadow:inset 0 0 0 2px #d9eefc}.admit-top{display:flex;gap:4px;align-items:center;border-bottom:1px solid #b8ddf6;padding-bottom:2px}.admit-logo{width:34px;height:34px;object-fit:contain;flex:0 0 auto}.admit-school{text-align:center;flex:1;min-width:0}.admit-school-name{font-size:10.5px;font-weight:900;color:#155fa0;line-height:1.05;white-space:nowrap}.admit-school-sub{font-size:7px}.admit-term{display:inline-block;margin-top:2px;padding:2px 8px;background:#0b6397;color:#fff;border-radius:4px;font-size:8px;font-weight:900}.admit-title{margin-top:2px;font-size:10px;font-weight:900;color:#b51d1d;letter-spacing:.06em}.admit-body{font-size:8.5px;padding-top:4px;display:grid;gap:2.5px}.admit-line{display:grid;grid-template-columns:68px 1fr;align-items:end}.admit-line span{font-weight:700}.admit-line b{border-bottom:1px dotted #111;min-height:12px;padding:0 2px 1px}.admit-signs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;position:absolute;left:3mm;right:3mm;bottom:2.2mm;text-align:center}.signature-img{display:block;margin:0 auto;width:42px;height:18px;object-fit:contain}.signature-dots{height:18px;display:flex;align-items:end;justify-content:center;font-size:8px}.admit-sign-cell small{display:block;font-size:5.8px;line-height:1.05}.sign-name{font-weight:700}`;
    const w=window.open('','_blank','width=1000,height=900');w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><style>${css}</style></head><body>${pages.join('')}<script>setTimeout(()=>window.print(),350)<\/script></body></html>`);w.document.close();
  };
  window.printAdmitCards=printAdmitCards;

  /* ---------- Reminder: 4 fixed slips per A4 + center cut guides ---------- */
  printOutstanding=function(){
    const rows=selectedOutstandingRows();if(!rows.length)return toast('Select at least one student before printing reminder letters.');
    const y=$('#outYear').value,to=NP_MONTHS[num($('#outTo').value)],logo=db.settings.logoData?`<img src="${db.settings.logoData}" class="reminder-logo">`:'',qr=db.settings.reminderQRData?`<img src="${db.settings.reminderQRData}" class="reminder-qr">`:'';
    const slip=x=>`<div class="slip"><div class="reminder-head">${logo}<div class="reminder-school"><div class="reminder-school-name">${esc(db.settings.schoolName)}</div><div class="reminder-address">${esc(db.settings.address)}</div><div class="reminder-title">${esc(db.settings.remindHeader||'Fee Reminder')}</div></div></div><div class="student-row"><b>${esc(x.s.name)}</b> · ${esc(x.s.className)} · Reg: ${esc(x.s.registrationNo)}</div><div class="small-row"><b>Guardian:</b> ${esc(x.s.guardian||x.s.fatherName||x.s.motherName||'')} &nbsp; <b>Period:</b> Up to ${to}, ${y}</div><table class="slip-detail"><thead><tr><th>Particular</th><th>Months</th><th>Rate</th><th>Total</th></tr></thead><tbody>${x.grouped.map(g=>`<tr><td>${esc(g.label)}</td><td>${esc(g.months.join(', '))}</td><td>${money(g.perAmount)}</td><td>${money(g.total)}</td></tr>`).join('')}${num(x.old)>0?`<tr><td>Old Dues</td><td>-</td><td>-</td><td>${money(x.old)}</td></tr>`:''}</tbody></table><div class="grand">Grand Total: ${money(x.total)}</div><div class="message">${esc(reminderReplacement(db.settings.reminderTemplate,x))}</div><div class="bottom"><div class="online">${esc(reminderReplacement(db.settings.reminderOnlineNote,x))}${db.settings.reminderWhatsApp?`<div class="whatsapp">WhatsApp: ${esc(db.settings.reminderWhatsApp)}</div>`:''}</div>${qr}</div></div>`;
    const pages=[];for(let i=0;i<rows.length;i+=4)pages.push(`<section class="reminder-page">${rows.slice(i,i+4).map(slip).join('')}</section>`);
    const css=`@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#111}.reminder-page{height:287mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:3.5mm;position:relative;page-break-after:always}.reminder-page:last-child{page-break-after:auto}.reminder-page:before{content:"";position:absolute;top:0;bottom:0;left:50%;border-left:1px dashed #888;transform:translateX(-.5px);z-index:0}.reminder-page:after{content:"";position:absolute;left:0;right:0;top:50%;border-top:1px dashed #888;transform:translateY(-.5px);z-index:0}.slip{border:1px solid #333;border-radius:3px;padding:3mm;overflow:hidden;display:flex;flex-direction:column;background:#fff;position:relative;z-index:1}.reminder-head{display:flex;align-items:center;gap:2mm;border-bottom:1px solid #9eb7c9;padding-bottom:1mm;margin-bottom:1mm}.reminder-logo{width:10mm;height:10mm;object-fit:contain}.reminder-school{text-align:center;flex:1;min-width:0}.reminder-school-name{font-size:10.5px;font-weight:900;color:#155fa0;white-space:nowrap;line-height:1.05}.reminder-address{font-size:6.8px}.reminder-title{font-size:8.4px;font-weight:900;color:#a91c1c}.student-row{font-size:8.1px;margin-bottom:.7mm}.small-row{font-size:7px;margin-bottom:1mm}.slip-detail{width:100%;border-collapse:collapse;font-size:6.8px;table-layout:fixed}.slip-detail th,.slip-detail td{border:1px solid #aaa;padding:.7mm;vertical-align:top;word-break:break-word}.slip-detail th:nth-child(1){width:35%}.slip-detail th:nth-child(2){width:30%}.slip-detail th:nth-child(3),.slip-detail th:nth-child(4){width:17.5%;text-align:right}.slip-detail td:nth-child(3),.slip-detail td:nth-child(4){text-align:right}.grand{text-align:right;font-size:8.6px;font-weight:900;margin-top:1mm}.message,.online{font-size:6.7px;line-height:1.12;white-space:pre-wrap}.message{margin-top:1mm}.bottom{display:flex;align-items:flex-end;justify-content:space-between;gap:2mm;margin-top:auto;padding-top:.6mm}.online{flex:1}.whatsapp{font-weight:700;margin-top:.5mm}.reminder-qr{width:21mm;height:21mm;object-fit:contain;border:1px solid #ddd;background:#fff;padding:.6mm}`;
    const w=window.open('','_blank','width=1000,height=920');w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><style>${css}</style></head><body>${pages.join('')}<script>setTimeout(()=>window.print(),350)<\/script></body></html>`);w.document.close();
  };
  window.printOutstanding=printOutstanding;

  /* ---------- Navigation / page registry ---------- */
  PAGE_TITLES.annualFeeStatement='Annual Fee Statement';
  const _v195BaseNavItems=navItems;
  navItems=function(){const items=_v195BaseNavItems();if(isAccountant()&&!items.some(x=>x[0]==='annualFeeStatement')){const idx=items.findIndex(x=>x[0]==='receiptRegister');items.splice(idx>=0?idx:items.length,0,['annualFeeStatement','▧','Annual Fee Statement']);}return items;};
  window.navItems=navItems;
  renderPage=function(){renderSideNav();const title=PAGE_TITLES[session.page]||'Accounts';$('#pageTitle').textContent=title;$('#breadcrumb').textContent=`Accounts > ${title}`;const map={dashboard:renderDashboard,feePayment:renderFeePayment,quickReceipt:renderQuickReceipt,quickRegister:renderQuickRegister,students:renderStudents,studentUpdate:renderStudentUpdate,studentSearch:renderStudentSearch,annualFeeStatement:renderAnnualFeeStatement,admitCard:renderAdmitCard,receiptRegister:renderReceiptRegister,feeStructure:renderFeeStructure,dailyCollection:renderDailyCollection,outstanding:renderOutstanding,examHallPass:renderExamHallPass,expenses:renderExpenses,banking:renderBanking,daybook:renderDayBook,monthly:renderMonthly,headwise:renderHeadwise,reports:renderReports,access:renderAccess,settings:renderSettings,help:renderHelp};(map[session.page]||renderDashboard)();renderSideNav();};
  window.renderPage=renderPage;

  /* Dashboard shortcut for the new statement. */
  const _v195BaseRenderDashboard=renderDashboard;
  renderDashboard=function(){_v195BaseRenderDashboard();if(!isAccountant())return;const grid=$('.dashboard-grid');if(grid&&!grid.querySelector('[data-v195-afs]')){const wrap=document.createElement('div');wrap.setAttribute('data-v195-afs','1');wrap.innerHTML=dashboardCard('Annual Fee Statement','A5','Yearly fee estimate for parents',[['Open Statement','annualFeeStatement']],'blue');grid.appendChild(wrap.firstElementChild);}};
  window.renderDashboard=renderDashboard;
})();
/* ================== END V19.5 FINAL USER REVISION ================== */

/* V19.5: make the automatic print window after Save use the final A5 styling too. */
v17RenderSavedReceiptToWindow=function(win,r){
  if(!win)return;
  try{
    const cssHref=new URL('style.css',window.location.href).href;
    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>${esc(r.receiptNo)}</title><link rel="stylesheet" href="${cssHref}"><style>@page{size:A5 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}</style></head><body>${receiptHTML(r)}<script>setTimeout(()=>window.print(),500)<\/script></body></html>`);
    win.document.close();
  }catch(e){console.warn('Receipt print window failed:',e);}
};
window.v17RenderSavedReceiptToWindow=v17RenderSavedReceiptToWindow;


/* ==================== V19.6 UNIVERSAL TRANSACTION ACTIONS + WHATSAPP + TODAY ==================== */
(function(){
  /* Always use Nepal's current BS date for the top bar and default report/entry dates. */
  function v196SyncToday(){
    const d=(typeof v194TodayNepali==='function'?v194TodayNepali():workingDate());
    try{db.settings.workingDate=d;}catch(_){/* no-op */}
    const top=document.getElementById('workingDate');
    if(top) top.value=d;
    return d;
  }
  window.v196SyncToday=v196SyncToday;

  const _v196BaseRenderPage=renderPage;
  renderPage=function(){
    v196SyncToday();
    _v196BaseRenderPage();
    v196SyncToday();
  };
  window.renderPage=renderPage;
  v196SyncToday();
  setInterval(v196SyncToday,60000);

  /* WhatsApp helper: uses the guardian/mobile number already saved in Student Master.
     If no number is saved, Accountant can type one for this message only. */
  function v196ReceiptStudent(r){
    return (db.students||[]).find(s=>String(s.id)===String(r.studentId||''))
      ||(db.students||[]).find(s=>String(s.masterId||s.studentUuid||'')===String(r.masterId||r.studentUuid||'')&&String(s.year||'')===String(r.year||''))
      ||null;
  }
  function v196WhatsAppNumber(raw){
    let d=String(raw||'').replace(/\D/g,'');
    if(d.startsWith('00977'))d=d.slice(2);
    if(d.startsWith('977'))return d;
    if(d.length===10&&d.startsWith('9'))return '977'+d;
    if(d.length===11&&d.startsWith('0'))d=d.slice(1);
    return d;
  }
  function v196ReceiptMessage(r){
    const received=Math.max(0,num(typeof f10ReceiptTotal==='function'?f10ReceiptTotal(r):r.paid));
    const school=db.settings.schoolName||'St. Augustine Academic Foundation';
    return `${school}: ${money(received)} received from ${r.studentName} (${r.className}). Receipt ${r.receiptNo}. Remaining dues ${money(r.balance)}. Thank you.`;
  }
  function v196SendReceiptWhatsApp(id){
    const r=receiptById(id);if(!r)return toast('Receipt not found.');
    const s=v196ReceiptStudent(r);
    let raw=s?.mobileNumber||s?.phone||'';
    if(!raw) raw=prompt('Guardian WhatsApp number is not saved. Enter the number for this message:','98');
    if(!raw)return;
    const no=v196WhatsAppNumber(raw);
    if(!no||no.length<10)return toast('Enter a valid guardian mobile/WhatsApp number.');
    const url=`https://wa.me/${encodeURIComponent(no)}?text=${encodeURIComponent(v196ReceiptMessage(r))}`;
    /* Same-tab navigation avoids browser popup blocking. WhatsApp/WhatsApp Web opens
       with the receipt message pre-filled; the accountant only presses Send. */
    try{
      window.location.href=url;
    }catch(e){
      const a=document.createElement('a');
      a.href=url;a.target='_self';a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
    }
  }
  window.v196SendReceiptWhatsApp=v196SendReceiptWhatsApp;

  /* Receipt Save still opens Print first. The receipt preview that remains on screen now
     has a clear Send to WhatsApp button for the next step. */
  const _v196BaseShowReceiptById=showReceiptById;
  showReceiptById=function(id,autoPrint=false){
    _v196BaseShowReceiptById(id,autoPrint);
    if(!isAccountant())return;
    const actions=document.querySelector('#modalContent .form-actions');
    if(actions&&!actions.querySelector('.v196-whatsapp-btn')){
      const b=document.createElement('button');
      b.type='button';b.className='btn v196-whatsapp-btn';b.textContent='Send to WhatsApp';
      b.onclick=()=>v196SendReceiptWhatsApp(id);
      actions.appendChild(b);
    }
  };
  window.showReceiptById=showReceiptById;

  /* Generic action buttons used everywhere a real transaction row is shown. */
  function v196TxnActions(x){
    if(!isAccountant()||!x?.sourceType||!x?.sourceId)return '';
    const id=String(x.sourceId).replace(/'/g,'');
    if(x.sourceType==='fee')return `<span class="v196-actions"><button class="btn small" onclick="showReceiptById('${id}')">View</button><button class="btn small" onclick="v195OpenFeeReceiptEdit('${id}')">Edit</button><button class="btn small" onclick="printReceipt('${id}')">Print</button><button class="btn small red" onclick="v194DeleteFeeReceipt('${id}')">Delete</button></span>`;
    if(x.sourceType==='quick')return `<span class="v196-actions"><button class="btn small" onclick="showQuickReceipt('${id}')">View</button><button class="btn small" onclick="v195EditQuick('${id}')">Edit</button><button class="btn small" onclick="printQuickReceipt('${id}')">Print</button><button class="btn small red" onclick="v195DeleteQuick('${id}')">Delete</button></span>`;
    if(x.sourceType==='expense')return `<span class="v196-actions"><button class="btn small" onclick="v195ViewExpense('${id}')">View</button><button class="btn small" onclick="v195EditExpense('${id}')">Edit</button><button class="btn small" onclick="v195PrintExpense('${id}')">Print</button><button class="btn small red" onclick="v195DeleteExpense('${id}')">Delete</button></span>`;
    if(x.sourceType==='bank')return `<span class="v196-actions"><button class="btn small" onclick="v195ViewBankTx('${id}')">View</button><button class="btn small" onclick="v195EditBankTx('${id}')">Edit</button><button class="btn small" onclick="v195PrintBankTx('${id}')">Print</button><button class="btn small red" onclick="v195DeleteBankTx('${id}')">Delete</button></span>`;
    return '';
  }
  window.v196TxnActions=v196TxnActions;

  /* Every operational transaction carries its source id, so any detailed report can act on it. */
  allTransactions=function(){
    const out=[];
    (db.receipts||[]).forEach(r=>out.push({sourceType:'fee',sourceId:r.id,date:r.date,type:'Fee Receipt',ref:r.receiptNo,details:`${r.studentName} - ${r.className}${typeof f10ReceiptDirectBank==='function'&&f10ReceiptDirectBank(r)>0?' · '+bankLabel(r.bankId):''}`,head:'Student Fees',mode:r.mode,income:typeof f10ReceiptTotal==='function'?f10ReceiptTotal(r):num(r.paid),expense:0,transfer:0,bankId:r.bankId||''}));
    (db.quickReceipts||[]).forEach(q=>out.push({sourceType:'quick',sourceId:q.id,date:q.date,type:'Quick Receipt',ref:q.receiptNo,details:`${q.receivedFrom||q.title}${q.mode==='Bank'?' · '+bankLabel(q.bankId):''}`,head:q.title,mode:q.mode,income:num(q.amount),expense:0,transfer:0,bankId:q.bankId||''}));
    (db.expenses||[]).forEach(e=>out.push({sourceType:'expense',sourceId:e.id,date:e.date,type:'Expense',ref:e.voucherNo||'',details:`${e.paidTo||e.remarks||''}${e.mode==='Bank'?' · '+bankLabel(e.bankId):''}`,head:e.head,mode:e.mode,income:0,expense:num(e.amount),transfer:0,bankId:e.bankId||''}));
    (db.bankTransactions||[]).forEach(t=>out.push({sourceType:'bank',sourceId:t.id,date:t.date,type:t.type==='cash_deposit'?'Cash to Bank':'Bank Withdrawal',ref:t.ref||'',details:`${bankLabel(t.bankId)}${t.person?' · '+t.person:''}${t.purpose?' · '+t.purpose:''}`,head:'Banking Transfer',mode:'Transfer',income:0,expense:0,transfer:t.type==='cash_deposit'?num(t.amount):-num(t.amount),bankId:t.bankId||''}));
    return out.sort((a,b)=>a.date.localeCompare(b.date)||String(a.ref||'').localeCompare(String(b.ref||'')));
  };
  window.allTransactions=allTransactions;

  transactionTable=function(rows){
    const actionHead=isAccountant()?'<th>Action</th>':'';
    return rows.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Head</th><th>Details</th><th>Mode</th><th class="amount">Income</th><th class="amount">Expense</th>${actionHead}</tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.type)}</td><td>${esc(x.ref||'')}</td><td>${esc(x.head||'')}</td><td>${esc(x.details||'')}</td><td>${esc(x.mode||'')}</td><td class="amount stat-green">${x.income?money(x.income):'-'}</td><td class="amount stat-red">${x.expense?money(x.expense):'-'}</td>${isAccountant()?`<td>${v196TxnActions(x)}</td>`:''}</tr>`).join('')}</tbody></table></div>`:`<div class="empty">No transactions.</div>`;
  };
  window.transactionTable=transactionTable;

  quickRegisterTable=function(){
    const a=[...(db.quickReceipts||[])].sort((a,b)=>b.date.localeCompare(a.date));
    return a.length?`<div class="table-wrap compact"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Title</th><th>Mode</th><th class="amount">Amount</th>${isAccountant()?'<th>Action</th>':''}</tr></thead><tbody>${a.map(q=>`<tr><td>${esc(q.date)}</td><td>${esc(q.receiptNo)}</td><td>${esc(q.title)}</td><td>${esc(q.mode)}</td><td class="amount">${money(q.amount)}</td>${isAccountant()?`<td>${v196TxnActions({sourceType:'quick',sourceId:q.id})}</td>`:''}</tr>`).join('')}</tbody></table></div>`:`<div class="empty">No Quick Receipts.</div>`;
  };
  window.quickRegisterTable=quickRegisterTable;

  /* Fee Card: transaction actions directly beside every receipt. */
  drawStudentReport=function(){
    const s=studentById($('#searchStudent').value),y=$('#searchYear').value;if(!s){$('#studentReportHost').innerHTML='';return;}
    const receipts=(db.receipts||[]).filter(r=>r.studentId===s.id&&String(r.year)===String(y)).sort((a,b)=>a.date.localeCompare(b.date)||String(a.receiptNo).localeCompare(String(b.receiptNo)));
    const rows=receipts.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.receiptNo)}</td><td>${esc((r.months||[]).map(i=>NP_MONTHS[i]).join(', '))}</td><td>${(r.items||[]).map(i=>`${esc(i.label)}: ${money(i.amount)}`).join('<br>')}</td><td class="amount">${money(r.grandTotal)}</td><td class="amount">${money(typeof f10ReceiptTotal==='function'?f10ReceiptTotal(r):r.paid)}</td><td class="amount">${money(r.balance)}</td><td>${isAccountant()?v196TxnActions({sourceType:'fee',sourceId:r.id}):'View only'}</td></tr>`).join('');
    $('#studentReportHost').innerHTML=`<div class="summary-strip"><div class="summary-box"><small>Registration</small><strong>${esc(s.registrationNo)}</strong></div><div class="summary-box"><small>Student</small><strong>${esc(s.name)}</strong></div><div class="summary-box"><small>Class</small><strong>${esc(s.className)}</strong></div><div class="summary-box"><small>Current Dues</small><strong class="stat-red">${money(s.dues)}</strong></div><div class="summary-box"><small>Route</small><strong>${esc(routeById(s.routeId)?.name||'-')}</strong></div></div>${isAccountant()?`<div class="section"><div class="section-title"><div><h3>Personal Fee Overrides</h3></div><button class="btn primary" onclick="openOverrideForm('${s.id}','${y}')">+ Add Override</button></div>${overrideTable(s.id,y)}</div>`:''}<div class="section"><div class="section-title"><div><h3>Transaction History</h3></div></div>${receipts.length?`<div class="table-wrap"><table><thead><tr><th>Nepali Date</th><th>Receipt No.</th><th>Fee Months</th><th>Fee Details</th><th class="amount">Grand Total</th><th class="amount">Received</th><th class="amount">Dues After</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="empty">No transactions for this student.</div>`}</div><div class="section"><div class="section-title"><div><h3>Month-wise Ledger</h3></div></div>${ledgerTable(s,y)}</div>`;
  };
  window.drawStudentReport=drawStudentReport;

  /* Daily Collection: same View/Edit/Print/Delete buttons, no searching in another module. */
  drawDailyCollection=function(){
    const rows=dailyRows(),heads=dailyHeads(rows),cols=heads.map(h=>`<th class="amount">${esc(h)}</th>`).join('');
    const latestDues=typeof v182LatestDuesTotal==='function'?v182LatestDuesTotal(rows):sum(rows,r=>r.balance);
    const data=rows.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.receiptNo)}</td><td>${esc(r.studentName)}</td><td>${esc(r.className)}</td>${heads.map(h=>`<td class="amount">${itemTotalByLabel(r,h)?money(itemTotalByLabel(r,h)):'-'}</td>`).join('')}<td class="amount">${money(r.currentTotal)}</td><td class="amount">${money(r.discount)}</td><td class="amount"><b>${money(f10ReceiptTotal(r))}</b></td><td class="amount">${money(r.balance)}</td><td class="amount">${f10ReceiptCash(r)>0?money(f10ReceiptCash(r)):'-'}</td><td>${f10ReceiptDirectBank(r)>0?esc(bankLabel(r.bankId)):'-'}</td><td class="amount">${f10ReceiptDirectBank(r)>0?money(f10ReceiptDirectBank(r)):'-'}</td>${isAccountant()?`<td>${v196TxnActions({sourceType:'fee',sourceId:r.id})}</td>`:''}</tr>`).join('');
    const total=`<tr class="total-row"><td colspan="4"><b>TOTAL RECEIPTS</b></td>${heads.map(h=>`<td class="amount">${money(sum(rows,r=>itemTotalByLabel(r,h)))}</td>`).join('')}<td class="amount">${money(sum(rows,r=>r.currentTotal))}</td><td class="amount">${money(sum(rows,r=>r.discount))}</td><td class="amount"><b>${money(sum(rows,r=>f10ReceiptTotal(r)))}</b></td><td class="amount"><b>${money(latestDues)}</b></td><td class="amount"><b>${money(sum(rows,r=>f10ReceiptCash(r)))}</b></td><td><b>Bank Receipt</b></td><td class="amount"><b>${money(sum(rows,r=>f10ReceiptDirectBank(r)))}</b></td>${isAccountant()?'<td></td>':''}</tr>`;
    $('#dailyHost').innerHTML=rows.length?`<div class="table-wrap cyan-table"><table><thead><tr><th>Date</th><th>Receipt No.</th><th>Student</th><th>Class</th>${cols}<th class="amount">Total Fees</th><th class="amount">Discount</th><th class="amount">Total Received</th><th class="amount">Dues After</th><th class="amount">Cash Received</th><th>Bank Account</th><th class="amount">Bank Received</th>${isAccountant()?'<th>Action</th>':''}</tr></thead><tbody>${data}${total}</tbody></table></div>`:`<div class="empty">No fee receipts in this date range.</div>`;
  };
  window.drawDailyCollection=drawDailyCollection;

  /* General Day Book: action column on every underlying receipt/expense/bank movement. */
  drawDayBook=function(){
    const rows=dayRows(),inc=sum(rows,x=>x.income),exp=sum(rows,x=>x.expense),net=inc-exp,deposits=sum(rows,x=>Math.max(0,num(x.transfer))),t=$('#dayTo')?.value||workingDate(),remaining=cashBalanceThrough(t),bankMap=dayBookBankSummary(rows);
    const bankText=Object.entries(bankMap).length?Object.entries(bankMap).map(([id,v])=>`${esc(bankLabel(id))}: <b>${money(v)}</b>`).join(' &nbsp; · &nbsp; '):'<span class="muted">No Cash → Bank transfer</span>';
    const body=rows.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Head</th><th>Details</th><th>Mode</th><th class="amount">Income</th><th class="amount">Expense</th><th class="amount">Bank Transfer</th><th class="amount">Remaining Cash</th>${isAccountant()?'<th>Action</th>':''}</tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.type)}</td><td>${esc(x.ref||'')}</td><td>${esc(x.head||'')}</td><td>${esc(x.details||'')}</td><td>${esc(x.mode||'')}</td><td class="amount stat-green">${x.income?money(x.income):'-'}</td><td class="amount stat-red">${x.expense?money(x.expense):'-'}</td><td class="amount">${num(x.transfer)>0?money(x.transfer):(num(x.transfer)<0?'Bank → Cash '+money(Math.abs(x.transfer)):'-')}</td><td class="amount">${money(cashBalanceThrough(x.date))}</td>${isAccountant()?`<td>${v196TxnActions(x)}</td>`:''}</tr>`).join('')}<tr class="total-row"><td colspan="6"><b>TOTAL / NET ${money(net)}</b></td><td class="amount"><b>${money(inc)}</b></td><td class="amount"><b>${money(exp)}</b></td><td class="amount"><b>${money(deposits)}</b></td><td class="amount"><b>${money(remaining)}</b></td>${isAccountant()?'<td></td>':''}</tr></tbody></table></div>`:'<div class="empty">No transactions in this date range.</div>';
    $('#dayHost').innerHTML=`<div class="summary-strip flexible-summary"><div class="summary-box"><small>Income</small><strong class="stat-green">${money(inc)}</strong></div><div class="summary-box"><small>Expense</small><strong class="stat-red">${money(exp)}</strong></div><div class="summary-box"><small>Net Amount</small><strong>${money(net)}</strong></div><div class="summary-box"><small>Transfer to Bank</small><strong>${money(deposits)}</strong></div><div class="summary-box"><small>Remaining Cash</small><strong class="stat-green">${money(remaining)}</strong></div></div><div class="bank-transfer-summary"><b>Bank Transfer Breakdown:</b> ${bankText}</div>${body}`;
  };
  window.drawDayBook=drawDayBook;

  /* Banking report rows retain their actual source ids so the row itself can be managed. */
  bankingRows=function(from='',to=''){
    const rows=[],ok=d=>(!from||d>=from)&&(!to||d<=to);
    (db.receipts||[]).filter(r=>ok(r.date)&&f10ReceiptDirectBank(r)>0).forEach(r=>rows.push({sourceType:'fee',sourceId:r.id,date:r.date,type:'Direct Fee Receipt',ref:r.receiptNo,bankId:r.bankId,details:`${r.studentName} - ${r.className}${f10ReceiptCash(r)>0?' · Split payment':''}`,inflow:f10ReceiptDirectBank(r),outflow:0,cashIn:0,cashOut:0}));
    (db.quickReceipts||[]).filter(q=>ok(q.date)&&q.mode==='Bank').forEach(q=>rows.push({sourceType:'quick',sourceId:q.id,date:q.date,type:'Direct Quick Receipt',ref:q.receiptNo,bankId:q.bankId,details:q.title,inflow:num(q.amount),outflow:0,cashIn:0,cashOut:0}));
    (db.expenses||[]).filter(e=>ok(e.date)&&e.mode==='Bank').forEach(e=>rows.push({sourceType:'expense',sourceId:e.id,date:e.date,type:'Bank Expense',ref:e.voucherNo||'',bankId:e.bankId,details:`${e.head}${e.paidTo?' - '+e.paidTo:''}`,inflow:0,outflow:num(e.amount),cashIn:0,cashOut:0}));
    (db.bankTransactions||[]).filter(t=>ok(t.date)).forEach(t=>rows.push({sourceType:'bank',sourceId:t.id,date:t.date,type:t.type==='cash_deposit'?'Cash → Bank Deposit':'Bank Withdrawal → Cash',ref:t.ref||'',bankId:t.bankId,details:[t.person,t.purpose,t.remarks].filter(Boolean).join(' · '),inflow:t.type==='cash_deposit'?num(t.amount):0,outflow:t.type==='withdrawal'?num(t.amount):0,cashIn:t.type==='withdrawal'?num(t.amount):0,cashOut:t.type==='cash_deposit'?num(t.amount):0}));
    return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
  };
  window.bankingRows=bankingRows;

  drawBankReport=function(){
    const f=$('#bankFrom')?.value||'',t=$('#bankTo')?.value||'',rows=bankingRows(f,t),prev=addDaysToNpDate(f||workingDate(),-1);
    const directStudent=sum(rows,r=>r.type==='Direct Fee Receipt'?r.inflow:0),directOther=sum(rows,r=>r.type==='Direct Quick Receipt'?r.inflow:0),cashTransfer=sum(rows,r=>r.type==='Cash → Bank Deposit'?r.inflow:0),withdrawals=sum(rows,r=>r.type==='Bank Withdrawal → Cash'?r.outflow:0),bankExpenses=sum(rows,r=>r.type==='Bank Expense'?r.outflow:0);
    const visibleBanks=(db.banks||[]).filter(b=>!(typeof window.v195BankDeleted==='function'&&window.v195BankDeleted(b)));
    const cards=[`<div class="summary-box"><small>Student Direct Bank Collection</small><strong>${money(directStudent)}</strong></div>`,`<div class="summary-box"><small>Other Direct Bank Collection</small><strong>${money(directOther)}</strong></div>`,`<div class="summary-box"><small>Cash → Bank Transfer</small><strong>${money(cashTransfer)}</strong></div>`,`<div class="summary-box"><small>Bank Withdrawal</small><strong>${money(withdrawals)}</strong></div>`,`<div class="summary-box"><small>Bank Expense</small><strong>${money(bankExpenses)}</strong></div>`,`<div class="summary-box"><small>Opening Cash</small><strong>${money(cashBalanceThrough(prev))}</strong></div>`,`<div class="summary-box"><small>Cash at End</small><strong>${money(cashBalanceThrough(t||workingDate()))}</strong></div>`,...visibleBanks.map(b=>`<div class="summary-box"><small>${esc(b.name)} Closing Balance</small><strong>${money(bankBalanceThrough(b.id,t||workingDate()))}</strong></div>`)].join('');
    const body=rows.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Type</th><th>Reference</th><th>Bank</th><th>Details</th><th class="amount">Bank In</th><th class="amount">Bank Out</th>${isAccountant()?'<th>Action</th>':''}</tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.date)}</td><td><b>${esc(f10BankingCategory(r))}</b></td><td>${esc(r.type)}</td><td>${esc(r.ref||'')}</td><td>${esc(bankLabel(r.bankId))}</td><td>${esc(r.details||'')}</td><td class="amount stat-green">${r.inflow?money(r.inflow):'-'}</td><td class="amount stat-red">${r.outflow?money(r.outflow):'-'}</td>${isAccountant()?`<td>${v196TxnActions(r)}</td>`:''}</tr>`).join('')}<tr class="total-row"><td colspan="6"><b>TOTAL BANK MOVEMENT</b></td><td class="amount"><b>${money(sum(rows,r=>r.inflow))}</b></td><td class="amount"><b>${money(sum(rows,r=>r.outflow))}</b></td>${isAccountant()?'<td></td>':''}</tr></tbody></table></div>`:'<div class="empty">No banking transactions in this date range.</div>';
    $('#bankReportHost').innerHTML=`<div class="summary-strip flexible-summary">${cards}</div>${body}`;
  };
  window.drawBankReport=drawBankReport;

  /* Fee receipt delete now refreshes whichever detailed page the Accountant used. The SQL
     in v19.6 recalculates later receipts, so an older receipt can also be removed safely. */
  window.v194DeleteFeeReceipt=async function(id){
    const r=receiptById(id);if(!r)return toast('Receipt not found.');
    if(!confirm(`Delete receipt ${r.receiptNo}?\n\nStudent dues and all later receipt balances will be recalculated automatically.`))return;
    try{
      const {error}=await sb.rpc('void_latest_fee_receipt_atomic',{p_receipt_id:id,p_reason:'Deleted by Accountant'});if(error)throw error;
      await Promise.all([v15LoadOnlineStudents(),v17LoadOnlineReceipts(),v17LoadOnlineBanks?.()]);
      closeModal();
      if(document.getElementById('receiptRegHost'))drawReceiptRegister();else renderPage();
      toast(`Receipt ${r.receiptNo} deleted and accounts recalculated.`);
    }catch(e){
      const m=String(e?.message||'Unknown error');
      toast(/void_latest_fee_receipt_atomic|does not exist/i.test(m)?'Run the updated SETUP_ONCE.sql in Supabase once.':'Receipt could not be deleted: '+m);
    }
  };
  deleteReceipt=function(id){return window.v194DeleteFeeReceipt(id);};
  window.deleteReceipt=deleteReceipt;

  /* Bank transaction delete should return to the page where the Accountant clicked it. */
  window.v195DeleteBankTx=async function(id){
    const t=(db.bankTransactions||[]).find(x=>x.id===id);if(!t||!confirm('Delete this bank transaction? Balances will recalculate automatically.'))return;
    try{const {error}=await sb.rpc('void_bank_transaction',{p_bank_transaction_id:id,p_reason:'Deleted by Accountant'});if(error)throw error;await v18LoadOperations();closeModal();renderPage();toast('Bank transaction deleted.');}
    catch(err){toast('Bank transaction delete failed: '+String(err?.message||''));}
  };
})();
/* ================== END V19.6 UNIVERSAL TRANSACTION ACTIONS + WHATSAPP + TODAY ================== */

/* V19.7: WhatsApp receipt sharing uses same-tab wa.me navigation to avoid popup blockers. */

/* ==================== V19.8 WHATSAPP ADMISSION MOBILE + MANUAL FALLBACK ==================== */
(function(){
  function v198ReceiptStudent(r){
    const students=db.students||[];
    return students.find(s=>String(s.id||'')===String(r.studentId||''))
      || students.find(s=>String(s.studentUuid||s.masterId||'')===String(r.studentUuid||r.masterId||'') && (!r.year || String(s.year||'')===String(r.year||'')))
      || students.find(s=>String(s.registrationNo||'').trim()===String(r.registrationNo||'').trim() && (!r.year || String(s.year||'')===String(r.year||'')))
      || students.find(s=>String(s.name||'').trim().toLowerCase()===String(r.studentName||'').trim().toLowerCase() && String(s.className||'')===String(r.className||''))
      || null;
  }
  function v198WhatsAppNumber(raw){
    let d=String(raw||'').replace(/\D/g,'');
    if(d.startsWith('00977')) d=d.slice(2);
    if(d.startsWith('977')) return d;
    if(d.length===11 && d.startsWith('0')) d=d.slice(1);
    if(d.length===10 && d.startsWith('9')) return '977'+d;
    return d;
  }
  function v198ReceiptMessage(r){
    const received=Math.max(0,num(typeof f10ReceiptTotal==='function'?f10ReceiptTotal(r):r.paid));
    const school=db.settings.schoolName||'St. Augustine Academic Foundation';
    return `${school}: ${money(received)} received from ${r.studentName} (${r.className}). Receipt ${r.receiptNo}. Remaining dues ${money(r.balance)}. Thank you.`;
  }
  function v198OpenWhatsApp(no,r){
    const url=`https://wa.me/${encodeURIComponent(no)}?text=${encodeURIComponent(v198ReceiptMessage(r))}`;
    window.location.href=url;
  }
  function v198ManualNumber(r){
    openModal('WHATSAPP','Guardian Mobile Number',`<form id="v198WaNumberForm" class="form-grid"><div class="full"><label>WhatsApp / Mobile Number</label><input id="v198WaNumber" inputmode="numeric" autocomplete="tel" placeholder="98XXXXXXXX" required></div><div class="full card-note">Admission मा mobile number नभएकाले यो receipt का लागि नम्बर आफैं टाइप गर्नुहोस्। Nepal को 10-digit mobile number राखे पुग्छ; 977 system ले आफैं थप्छ।</div><div class="full form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" type="submit">Open WhatsApp</button></div></form>`);
    setTimeout(()=>document.getElementById('v198WaNumber')?.focus(),50);
    const form=document.getElementById('v198WaNumberForm');
    if(form) form.onsubmit=e=>{
      e.preventDefault();
      const raw=document.getElementById('v198WaNumber')?.value||'';
      const no=v198WhatsAppNumber(raw);
      if(!no || no.length<10) return toast('Enter a valid mobile / WhatsApp number.');
      closeModal();
      v198OpenWhatsApp(no,r);
    };
  }
  window.v196SendReceiptWhatsApp=function(id){
    const r=receiptById(id); if(!r) return toast('Receipt not found.');
    const s=v198ReceiptStudent(r);
    const saved=s?.mobileNumber||s?.phone||'';
    if(saved){
      const no=v198WhatsAppNumber(saved);
      if(no && no.length>=10) return v198OpenWhatsApp(no,r);
    }
    v198ManualNumber(r);
  };
})();
/* ================== END V19.8 WHATSAPP ADMISSION MOBILE + MANUAL FALLBACK ================== */

/* ==================== V19.9 FINAL LIVE CHECK — FEE CARD + PRINT LABELS ==================== */
(function(){
  /* Fee Card uses recordKey in the Student selector. Earlier universal-action code
     looked that value up as a database row id, which made the detail area blank.
     Resolve by recordKey first and match receipt history by stable student identity. */
  function v199ReceiptBelongsToStudent(r,s,year){
    if(!r||!s||String(r.year||'')!==String(year||''))return false;
    const ids=new Set((typeof linkedStudentIds==='function'?linkedStudentIds(s):[s.id]).map(String));
    const master=String(typeof studentMasterId==='function'?studentMasterId(s):(s.studentUuid||s.masterId||''));
    const reg=String(s.registrationNo||'').trim();
    return ids.has(String(r.studentId||''))
      ||(master && String(r.studentUuid||r.masterId||'')===master)
      ||(reg && String(r.registrationNo||'').trim()===reg);
  }

  drawStudentReport=function(){
    const key=$('#searchStudent')?.value||'';
    const s=(typeof studentByRecordKey==='function'?studentByRecordKey(key):null)||studentById(key);
    const y=String($('#searchYear')?.value||'');
    const host=$('#studentReportHost');
    if(!host)return;
    if(!s){host.innerHTML='<div class="empty">Select a student to view Fee Card details.</div>';return;}

    const receipts=(db.receipts||[])
      .filter(r=>v199ReceiptBelongsToStudent(r,s,y))
      .sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.receiptNo||'').localeCompare(String(b.receiptNo||'')));

    const rows=receipts.map(r=>{
      const months=esc((r.months||[]).map(i=>NP_MONTHS[i]).join(', ')||'-');
      const items=(r.items||[]).length?(r.items||[]).map(i=>`${esc(i.label||'Fee')}: ${money(i.amount)}`).join('<br>'):'-';
      const received=typeof f10ReceiptTotal==='function'?f10ReceiptTotal(r):num(r.paid);
      return `<tr><td>${esc(r.date||'')}</td><td><b>${esc(r.receiptNo||'')}</b></td><td>${months}</td><td>${items}</td><td class="amount">${money(r.grandTotal||r.netPayable)}</td><td class="amount">${money(r.discount)}</td><td class="amount"><b>${money(received)}</b></td><td class="amount">${money(r.balance)}</td><td>${isAccountant()?v196TxnActions({sourceType:'fee',sourceId:r.id}):'View only'}</td></tr>`;
    }).join('');

    const mobile=s.mobileNumber||s.phone||'-';
    const category=s.category||'-';
    const route=routeById(s.routeId)?.name||'No Transportation';
    const opening=num(s.openingDues);
    host.innerHTML=`
      <div class="summary-strip flexible-summary">
        <div class="summary-box"><small>Registration</small><strong>${esc(s.registrationNo||'-')}</strong></div>
        <div class="summary-box"><small>Student</small><strong>${esc(s.name||'-')}</strong></div>
        <div class="summary-box"><small>Class</small><strong>${esc(s.className||'-')}</strong></div>
        <div class="summary-box"><small>Category</small><strong>${esc(category)}</strong></div>
        <div class="summary-box"><small>Guardian</small><strong>${esc(s.guardian||s.fatherName||s.motherName||'-')}</strong></div>
        <div class="summary-box"><small>Mobile</small><strong>${esc(mobile)}</strong></div>
        <div class="summary-box"><small>Route</small><strong>${esc(route)}</strong></div>
        <div class="summary-box"><small>Opening Dues</small><strong>${money(opening)}</strong></div>
        <div class="summary-box"><small>Current Dues</small><strong class="stat-red">${money(s.dues)}</strong></div>
      </div>
      ${isAccountant()?`<div class="section premium-section"><div class="section-title"><div><h3>Scholarship / Personal Fee Adjustment</h3></div><button class="btn primary" onclick="openScholarshipMatrix('${s.id}','${y}')">Open Scholarship Matrix</button></div></div>`:''}
      <div class="section premium-section"><div class="section-title"><div><h3>Transaction History</h3></div></div>
        ${receipts.length?`<div class="table-wrap"><table><thead><tr><th>Nepali Date</th><th>Receipt No.</th><th>Fee Months</th><th>Fee Details</th><th class="amount">Grand Total</th><th class="amount">Discount</th><th class="amount">Received</th><th class="amount">Dues After</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty">No fee receipts for this student in the selected academic year.</div>'}
      </div>
      <div class="section premium-section"><div class="section-title"><div><h3>Month-wise Fee Card Details</h3></div></div>${ledgerTable(s,y)}</div>`;
  };
  window.drawStudentReport=drawStudentReport;

  /* The actual print functions already use fixed grids: Admit 2 x 3 = 6/A4,
     Reminder 2 x 2 = 4/A4. Correct the screen wording that an older patch changed. */
  const _v199RenderAdmitCard=renderAdmitCard;
  renderAdmitCard=function(){
    _v199RenderAdmitCard();
    const section=$('#content .section-title');
    const p=section?.querySelector('p');
    if(p)p.textContent='Select students and print 6 fixed-size Admit Cards on each A4 page.';
    const btn=$('#admitPrintBtn');
    if(btn)btn.textContent='Print Admit Cards — 6 / A4';
  };
  window.renderAdmitCard=renderAdmitCard;

  const _v199RenderOutstanding=renderOutstanding;
  renderOutstanding=function(){
    _v199RenderOutstanding();
    const btn=$('#outPrint');
    if(btn)btn.textContent='Print Selected — 4 Slips / A4';
  };
  window.renderOutstanding=renderOutstanding;
})();
/* ================== END V19.9 FINAL LIVE CHECK ================== */

/* ==================== V19.10 FINAL PRINT POLISH ==================== */
(function(){
  function v1910Issuer(){
    const v=String(db?.settings?.issuedBy||'').trim();
    return (!v || /^accountant$/i.test(v)) ? 'SAGAR' : v;
  }
  function v1910OneLineSchool(html, cls='v195-school'){
    return String(html||'').replace(
      new RegExp(`<div class="${cls}"><h1(?:[^>]*)>`),
      `<div class="${cls}"><h1 style="white-space:nowrap!important;font-size:15px!important;letter-spacing:-.25px!important;line-height:1.05!important">`
    );
  }

  /* Receipt: keep the school name on one line and default Issued by to SAGAR.
     The Settings > Issued By field can still override SAGAR later. */
  const _v1910ReceiptHTML=receiptHTML;
  receiptHTML=function(r){
    let html=v1910OneLineSchool(_v1910ReceiptHTML(r));
    html=html.replace(/Issued by:\s*<b>.*?<\/b>/i,`Issued by: <b>${esc(v1910Issuer())}</b>`);
    return html;
  };
  window.receiptHTML=receiptHTML;

  /* Keep Quick Receipt school name single-line too. */
  const _v1910QuickReceiptHTML=quickReceiptHTML;
  quickReceiptHTML=function(q){
    let html=v1910OneLineSchool(_v1910QuickReceiptHTML(q));
    html=html.replace(/Issued by:\s*<b>.*?<\/b>/i,`Issued by: <b>${esc(v1910Issuer())}</b>`);
    return html;
  };
  window.quickReceiptHTML=quickReceiptHTML;

  function v1910FeeCardStudent(key){
    return (typeof studentByRecordKey==='function'?studentByRecordKey(key):null)||studentById(key);
  }

  window.v1910PrintFeeCardA5=function(key,year){
    const s=v1910FeeCardStudent(key);
    const y=String(year||'');
    if(!s||!y)return toast('Select Academic Year and Student first.');
    const logo=db.settings.logoData?`<img src="${db.settings.logoData}" alt="Logo">`:`<div class="fc-logo-fallback">SA</div>`;
    let annual=0,processed=0,open=0;
    const rows=NP_MONTHS.map((m,i)=>{
      const items=monthCharges(s,y,i)||[];
      const total=sum(items,x=>x.amount);annual+=total;
      const closed=isMonthClosed(s,y,i);if(closed)processed+=total;else open+=total;
      const details=items.length?items.map(x=>`${esc(x.label||'Fee')} — ${money(x.amount)}`).join(' · '):'-';
      return `<tr><td><b>${esc(m)}</b></td><td class="status ${closed?'paid':'due'}">${closed?'PAID / PROCESSED':'DUE / OPEN'}</td><td>${details}</td><td class="num">${money(total)}</td></tr>`;
    }).join('');
    const html=`<div class="fc-a5"><div class="fc-frame"><div class="fc-head"><div class="fc-logo">${logo}</div><div class="fc-school"><h1>${esc(db.settings.schoolName)}</h1><p>${esc(db.settings.address||'')}</p><h2>FEE CARD</h2></div><div></div></div><div class="fc-meta"><div><b>Student:</b> ${esc(s.name||'-')}</div><div><b>Class:</b> ${esc(s.className||'-')}</div><div><b>Registration:</b> ${esc(s.registrationNo||'-')}</div><div><b>Academic Year:</b> ${esc(y)}</div><div><b>Guardian:</b> ${esc(s.guardian||s.fatherName||s.motherName||'-')}</div><div><b>Mobile:</b> ${esc(s.mobileNumber||s.phone||'-')}</div></div><table class="fc-table"><thead><tr><th>Month</th><th>Status</th><th>Fee Details</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="fc-totals"><div><span>Yearly Fee Total</span><b>${money(annual)}</b></div><div><span>Processed Fee</span><b>${money(processed)}</b></div><div><span>Open Fee</span><b>${money(open)}</b></div><div class="current"><span>Current Dues</span><b>${money(s.dues)}</b></div></div><div class="fc-foot">Printed on Nepali Date: ${esc(typeof v196SyncToday==='function'?v196SyncToday():workingDate())}</div></div></div>`;
    const css=`@page{size:A5 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111}.fc-a5{width:148mm;height:210mm;padding:4mm;margin:0 auto;background:#fff}.fc-frame{height:202mm;border:2px solid #155fa0;box-shadow:inset 0 0 0 2px #d6e8f5;padding:4.5mm;display:flex;flex-direction:column;overflow:hidden}.fc-head{display:grid;grid-template-columns:20mm 1fr 20mm;align-items:center;border-bottom:1px solid #8bb3d0;padding-bottom:2mm}.fc-logo{width:18mm;height:18mm;display:grid;place-items:center}.fc-logo img{max-width:17mm;max-height:17mm;object-fit:contain}.fc-logo-fallback{font-weight:900;font-size:16px;color:#155fa0}.fc-school{text-align:center;min-width:0}.fc-school h1{margin:0;color:#155fa0;font-size:14px;font-weight:900;text-transform:uppercase;white-space:nowrap;letter-spacing:-.25px;line-height:1.05}.fc-school p{margin:1px 0;font-size:7.8px}.fc-school h2{margin:1.5mm 0 0;font-size:10.5px;letter-spacing:.08em}.fc-meta{display:grid;grid-template-columns:1fr 1fr;gap:.8mm 4mm;font-size:7.8px;margin:2mm 0}.fc-table{width:100%;border-collapse:collapse;font-size:6.7px;table-layout:fixed}.fc-table th,.fc-table td{border:1px solid #777;padding:.65mm .8mm;vertical-align:top;line-height:1.15}.fc-table th{background:#edf5fa;font-size:6.9px}.fc-table th:nth-child(1){width:16%}.fc-table th:nth-child(2){width:19%}.fc-table th:nth-child(4){width:17%;text-align:right}.fc-table .num{text-align:right;white-space:nowrap}.fc-table .status{text-align:center;font-weight:900;font-size:6.1px}.fc-table .paid{color:#0b6b35}.fc-table .due{color:#a31919}.fc-totals{margin-top:2mm;margin-left:auto;width:62%;font-size:7.4px;border-top:1px solid #777}.fc-totals>div{display:flex;justify-content:space-between;gap:8px;padding:.65mm 1mm;border-bottom:1px solid #bbb}.fc-totals .current{font-size:8px;background:#f2f7fb}.fc-foot{margin-top:auto;text-align:center;font-size:6.5px;color:#555;padding-top:1.5mm}`;
    const w=window.open('','_blank','width=780,height=900');
    if(!w)return toast('Allow print window for A5 Fee Card.');
    w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>${esc(s.name)} Fee Card</title><style>${css}</style></head><body>${html}<script>setTimeout(()=>window.print(),350)<\/script></body></html>`);
    w.document.close();
  };

  /* Add the A5 print button exactly beside Month-wise Fee Card Details. */
  const _v1910DrawStudentReport=drawStudentReport;
  drawStudentReport=function(){
    _v1910DrawStudentReport();
    const key=$('#searchStudent')?.value||'',year=$('#searchYear')?.value||'';
    if(!key||!year)return;
    const heading=[...document.querySelectorAll('#studentReportHost .section-title h3')].find(h=>h.textContent.trim()==='Month-wise Fee Card Details');
    const title=heading?.closest('.section-title');
    if(title&&!title.querySelector('.v1910-feecard-print')){
      const b=document.createElement('button');
      b.className='btn primary v1910-feecard-print';
      b.textContent='Print A5 Fee Card';
      b.onclick=()=>window.v1910PrintFeeCardA5(key,year);
      title.appendChild(b);
    }
  };
  window.drawStudentReport=drawStudentReport;
})();
/* ================== END V19.10 FINAL PRINT POLISH ================== */


/* ==================== V19.11 QUICK RECEIPT + EXPENSE RELIABILITY PATCH ====================
   - Marks Entry integration is intentionally untouched.
   - Always stores a readable title/head even when a master head is selected.
   - Requires either a master head or a custom title/head.
   - Keeps online RPC save, active-bank validation, and existing View/Edit/Print/Delete actions.
=========================================================================================== */
(function(){
  function v1911SelectedLabel(select){
    const opt=select?.options?.[select.selectedIndex];
    return String(opt?.textContent||'').trim();
  }
  function v1911RpcRow(data){return Array.isArray(data)?(data[0]||{}):(data||{});}

  renderQuickReceipt=function(){
    if(!isAccountant())return unauthorized();
    const heads=(db.incomeHeads||[]).filter(x=>x.active!==false);
    $('#content').innerHTML=`<div class="two-col"><div class="section premium-section"><div class="section-title"><div><h3>Quick Receipt</h3><p>Use for rent, donation, extra income and other non-student receipts.</p></div><div class="next-number"><small>Receipt No.</small><b>Auto Generated</b></div></div><form id="quickForm" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(workingDate())}" placeholder="2083-06-01" required></div><div><label>Payment Mode</label><select name="mode"><option>Cash</option><option>Bank</option></select></div><div><label>Income Head</label><select name="incomeHeadId"><option value="">Custom / Other</option>${heads.map(h=>`<option value="${h.id}">${esc(h.name)}</option>`).join('')}</select></div><div><label>Custom Title</label><input name="title" placeholder="Required only for Custom / Other"></div><div><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" required></div><div><label>Received From</label><input name="receivedFrom" placeholder="Optional"></div><div class="full"><label>Bank Account</label><select name="bankId" disabled>${bankOptions()}</select></div><div class="full"><label>Remarks</label><textarea name="remarks"></textarea></div><div class="full info" style="margin:0">Choose an Income Head, or enter a Custom Title. For Bank mode, select the bank account.</div><div class="full form-actions"><button class="btn primary big" type="submit">Save & Print Quick Receipt</button></div></form></div><div class="section premium-section"><div class="section-title"><div><h3>Quick Receipt Register</h3><p>Saved online and included in school income reports.</p></div><button class="btn green" id="quickExport">Export Excel</button></div><div id="quickList"></div></div></div>`;
    const f=$('#quickForm'),mode=f.elements.mode,bank=f.elements.bankId,head=f.elements.incomeHeadId,title=f.elements.title;
    mode.onchange=()=>v18ToggleBank(mode,bank);
    head.onchange=()=>{title.placeholder=head.value?'Optional note / alternate title':'Required for Custom / Other';};
    f.onsubmit=saveQuickReceipt;
    $('#quickExport').onclick=exportQuickReceipts;
    drawQuickList();
  };
  window.renderQuickReceipt=renderQuickReceipt;

  saveQuickReceipt=async function(e){
    e.preventDefault();
    const f=e.target,fd=new FormData(f),date=String(fd.get('date')||''),mode=String(fd.get('mode')||'Cash'),amount=num(fd.get('amount'));
    const headId=String(fd.get('incomeHeadId')||''),customTitle=String(fd.get('title')||'').trim();
    const headName=headId?v1911SelectedLabel(f.elements.incomeHeadId):'';
    const incomeTitle=customTitle||headName;
    if(!npDateValid(date))return toast('Use Nepali date YYYY-MM-DD.');
    if(amount<=0)return toast('Enter an amount.');
    if(!incomeTitle)return toast('Select an Income Head or enter a Custom Title.');
    if(mode==='Bank'&&!fd.get('bankId'))return toast('Select Bank Account.');
    const btn=f.querySelector('button[type="submit"]'),old=btn.textContent;btn.disabled=true;btn.textContent='Saving…';
    try{
      const {data,error}=await sb.rpc('create_quick_receipt_atomic',{
        p_nepali_date:date,p_academic_year:yearOfDate(date),p_amount:amount,p_payment_mode:mode,
        p_income_head_id:headId||null,p_income_title:incomeTitle,p_received_from:fd.get('receivedFrom')||null,
        p_bank_id:mode==='Bank'?(fd.get('bankId')||null):null,p_remarks:fd.get('remarks')||null,p_issued_by:db.settings.issuedBy||null
      });
      if(error)throw error;
      await v18LoadOperations();
      const saved=v1911RpcRow(data);
      const q=(db.quickReceipts||[]).find(x=>x.id===saved.quick_receipt_id)
        ||(db.quickReceipts||[]).find(x=>x.receiptNo===saved.receipt_no)
        ||(db.quickReceipts||[]).find(x=>x.date===date&&num(x.amount)===amount&&String(x.title||'')===incomeTitle);
      renderQuickReceipt();
      if(q)showQuickReceipt(q.id,true);
      toast('Online Quick Receipt saved.');
    }catch(err){
      console.error('Quick Receipt save error',err);
      const m=String(err?.message||'Unknown error');
      toast('Quick Receipt NOT saved: '+m);
    }finally{btn.disabled=false;btn.textContent=old;}
  };
  window.saveQuickReceipt=saveQuickReceipt;

  renderExpenses=function(){
    if(!isAccountant())return unauthorized();
    const heads=(db.expenseHeads||[]).filter(x=>x.active!==false);
    $('#content').innerHTML=`<div class="two-col"><div class="section premium-section"><div class="section-title"><div><h3>Expense Entry</h3><p>Record school expenses with Cash or Bank payment.</p></div><div class="next-number"><small>Voucher No.</small><b>Auto Generated</b></div></div><form id="expForm" class="form-grid"><div><label>Nepali Date</label><input name="date" value="${esc(workingDate())}" required></div><div><label>Mode</label><select name="mode"><option>Cash</option><option>Bank</option></select></div><div><label>Expense Head</label><select name="expenseHeadId"><option value="">Custom / Other</option>${heads.map(h=>`<option value="${h.id}">${esc(h.name)}</option>`).join('')}</select></div><div><label>Custom Head</label><input name="head" placeholder="Required only for Custom / Other"></div><div><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" required></div><div><label>Paid To</label><input name="paidTo" placeholder="Person / Supplier"></div><div class="full"><label>Bank Account</label><select name="bankId" disabled>${bankOptions()}</select></div><div class="full"><label>Remarks</label><textarea name="remarks"></textarea></div><div class="full info" style="margin:0">Choose an Expense Head, or enter a Custom Head. Bank mode requires a bank account.</div><div class="full form-actions"><button class="btn primary big" type="submit">Save Expense</button></div></form></div><div class="section premium-section"><div class="section-title"><div><h3>Expense Register</h3><p>View, edit, print or delete saved expenses.</p></div><button class="btn green" id="expExport">Export Excel</button></div><div id="expHost"></div></div></div>`;
    const f=$('#expForm'),mode=f.elements.mode,bank=f.elements.bankId,head=f.elements.expenseHeadId,custom=f.elements.head;
    mode.onchange=()=>v18ToggleBank(mode,bank);
    head.onchange=()=>{custom.placeholder=head.value?'Optional note / alternate head':'Required for Custom / Other';};
    f.onsubmit=v18SaveExpense;
    $('#expExport').onclick=()=>exportXLS('Expenses.xls',['Voucher No','Date','Head','Paid To','Mode','Bank','Amount','Remarks'],(db.expenses||[]).map(x=>[x.voucherNo,x.date,x.head,x.paidTo,x.mode,x.mode==='Bank'?bankLabel(x.bankId):'',x.amount,x.remarks]),'Expense Register');
    v18DrawExpenses();
  };
  window.renderExpenses=renderExpenses;

  v18SaveExpense=async function(e){
    e.preventDefault();
    const f=e.target,fd=new FormData(f),date=String(fd.get('date')||''),mode=String(fd.get('mode')||'Cash'),amount=num(fd.get('amount'));
    const headId=String(fd.get('expenseHeadId')||''),customHead=String(fd.get('head')||'').trim();
    const masterHead=headId?v1911SelectedLabel(f.elements.expenseHeadId):'';
    const expenseHead=customHead||masterHead;
    if(!npDateValid(date))return toast('Use Nepali date YYYY-MM-DD.');
    if(amount<=0)return toast('Enter an amount.');
    if(!expenseHead)return toast('Select an Expense Head or enter a Custom Head.');
    if(mode==='Bank'&&!fd.get('bankId'))return toast('Select Bank Account.');
    const btn=f.querySelector('button[type="submit"]'),old=btn.textContent;btn.disabled=true;btn.textContent='Saving…';
    try{
      const {error}=await sb.rpc('create_expense_atomic',{
        p_nepali_date:date,p_academic_year:yearOfDate(date),p_amount:amount,p_payment_mode:mode,
        p_expense_head_id:headId||null,p_expense_head:expenseHead,p_paid_to:fd.get('paidTo')||null,
        p_bank_id:mode==='Bank'?(fd.get('bankId')||null):null,p_remarks:fd.get('remarks')||null,p_entered_by:db.settings.issuedBy||null
      });
      if(error)throw error;
      await v18LoadOperations();renderExpenses();toast('Online Expense saved.');
    }catch(err){
      console.error('Expense save error',err);
      toast('Expense NOT saved: '+String(err?.message||'Unknown error'));
    }finally{btn.disabled=false;btn.textContent=old;}
  };
  window.v18SaveExpense=v18SaveExpense;
})();
/* ================== END V19.11 QUICK/EXPENSE PATCH ================== */


/* ==================== V19.12 FAST-CLICK / STALE-RENDER SAFETY ====================
   Purpose: prevent detached-page render callbacks from touching DOM nodes that no
   longer exist when the user changes modules quickly. Marks Entry is untouched.
=============================================================================== */
(function(){
  let navEpoch=0;
  let lastNavAt=0;

  function isDetachedUiError(err){
    const m=String(err?.message||err||'');
    return /Cannot (?:set|read) propert(?:y|ies) of null/i.test(m)
      || /Cannot (?:set|read) propert(?:y|ies) of undefined/i.test(m);
  }

  /* Count every real module change. Any asynchronous result started on an older
     module is considered stale and must not repaint the new module. */
  if(typeof navigate==='function'){
    const baseNavigate=navigate;
    navigate=function(page){
      if(String(page||'')!==String(session?.page||'')){
        navEpoch+=1;
        lastNavAt=Date.now();
      }
      return baseNavigate.apply(this,arguments);
    };
    window.navigate=navigate;
  }

  /* MD/CEO report calls are asynchronous. If the user has already changed page,
     keep the stale promise pending so its old .then/.catch UI code never runs. */
  if(typeof v18ReportCall==='function'){
    const baseReportCall=v18ReportCall;
    v18ReportCall=async function(){
      const startEpoch=navEpoch;
      const startPage=String(session?.page||'');
      try{
        const data=await baseReportCall.apply(this,arguments);
        if(startEpoch!==navEpoch || startPage!==String(session?.page||'')){
          return await new Promise(()=>{});
        }
        return data;
      }catch(err){
        if(startEpoch!==navEpoch || startPage!==String(session?.page||'')){
          return await new Promise(()=>{});
        }
        throw err;
      }
    };
    window.v18ReportCall=v18ReportCall;
  }

  function wrapUiFunction(name,page,selectors){
    const original=window[name];
    if(typeof original!=='function' || original.__saFastClickGuard)return;
    selectors=Array.isArray(selectors)?selectors:[];
    const wrapped=function(){
      if(page && String(session?.page||'')!==String(page))return;
      for(const selector of selectors){
        if(!document.querySelector(selector))return;
      }
      try{
        return original.apply(this,arguments);
      }catch(err){
        const pageGone=page && String(session?.page||'')!==String(page);
        const hostGone=selectors.some(selector=>!document.querySelector(selector));
        if(isDetachedUiError(err) && (pageGone||hostGone)){
          console.debug('[V19.12] Ignored stale UI render:',name);
          return;
        }
        throw err;
      }
    };
    wrapped.__saFastClickGuard=true;
    wrapped.__saFastClickOriginal=original;
    window[name]=wrapped;
  }

  /* Guard page renderers too. This stops an old async save/delete callback from
     forcing its former page back over the page the user has already opened. */
  [
    ['renderDashboard','dashboard'],
    ['renderFeePayment','feePayment'],
    ['renderQuickReceipt','quickReceipt'],
    ['renderQuickRegister','quickRegister'],
    ['renderStudents','students'],
    ['renderStudentUpdate','studentUpdate'],
    ['renderStudentSearch','studentSearch'],
    ['renderAdmitCard','admitCard'],
    ['renderReceiptRegister','receiptRegister'],
    ['renderFeeStructure','feeStructure'],
    ['renderDailyCollection','dailyCollection'],
    ['renderOutstanding','outstanding'],
    ['renderExamHallPass','examHallPass'],
    ['renderExpenses','expenses'],
    ['renderBanking','banking'],
    ['renderDayBook','daybook'],
    ['renderMonthly','monthly'],
    ['renderHeadwise','headwise'],
    ['renderReports','reports'],
    ['renderAccess','access'],
    ['renderSettings','settings'],
    ['renderHelp','help']
  ].forEach(([name,page])=>wrapUiFunction(name,page,['#content']));

  /* Guard the final draw/refresh functions that write into page-specific hosts. */
  [
    ['drawStudentList','students',['#studentHost']],
    ['drawStudentReport','studentSearch',['#studentReportHost','#searchStudent','#searchYear']],
    ['fillPayStudents','feePayment',['#payYear','#payClass','#payStudent','#payHost']],
    ['drawPayPanel','feePayment',['#payStudent','#payYear','#payHost']],
    ['drawPaymentCalc','feePayment',['#payCalc']],
    ['drawReceiptRegister','receiptRegister',['#receiptRegHost']],
    ['drawQuickList','quickReceipt',['#quickList']],
    ['drawDailyCollection','dailyCollection',['#dailyHost']],
    ['drawOutstanding','outstanding',['#outHost']],
    ['drawHallPass','examHallPass',['#hallHost']],
    ['drawExpenses','expenses',['#expHost']],
    ['v18DrawExpenses','expenses',['#expHost']],
    ['drawDayBook','daybook',['#dayHost']],
    ['drawReports','reports',['#reportHost']],
    ['drawBankReport','banking',['#bankReportHost']],
    ['drawBankList','banking',['#bankList']],
    ['v195DrawBankTxRegister','banking',['#v195BankTxRegister']],
    ['drawAdmitList','admitCard',['#admitHost']],
    ['drawStudentUpdate','studentUpdate',['#studentUpdateHost']],
    ['drawRoutes','feeStructure',['#routeHost']],
    ['drawTransportPlans','feeStructure',['#transportPlanHost']],
    ['drawFeeHeads','feeStructure',['#headHost']],
    ['drawFeePlans','feeStructure',['#planHost']]
  ].forEach(([name,page,selectors])=>wrapUiFunction(name,page,selectors));

  /* Last-resort browser-level protection for a stale callback from an older patch.
     It only suppresses the exact detached-null UI error immediately after navigation;
     genuine errors on the current page are still allowed through. */
  window.addEventListener('error',function(ev){
    if(Date.now()-lastNavAt>1800)return;
    if(!isDetachedUiError(ev.error))return;
    console.debug('[V19.12] Suppressed detached-page UI error:',ev.error?.message||'');
    ev.preventDefault();
  },true);
})();
/* ================== END V19.12 FAST-CLICK / STALE-RENDER SAFETY ================== */
