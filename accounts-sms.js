/* ST AUGUSTINE Accounts SMS — additive module. No accounting writes. */
(function(){
'use strict';
const E = x => esc(x);
const mt = n => String(Math.max(0,Number(n)||0).toLocaleString('en-IN',{maximumFractionDigits:2}));
const gsm = s => /^[\x20-\x7E\n\r]*$/.test(s) && !/[\[\]{}\\^~|]/.test(s);
function feeMessage(x,y,m){
 const s=x.s, name=String(s.name||'').trim(),amount=mt(x.total),cls=s.className;
 const endings=[
  `Dear Parent, a fee of Rs. ${amount} is pending for ${name} (${cls}) till ${m} ${y}. Kindly arrange payment. Thank you. ST. AUGUSTINE`,
  `Dear Parent, Rs. ${amount} is pending for ${name} (${cls}) till ${m} ${y}. Kindly pay when convenient. ST. AUGUSTINE`,
  `Dear Parent, Rs. ${amount} is due for ${name} (${cls}) till ${m} ${y}. Please arrange payment. ST. AUGUSTINE`,
  `Fee reminder: ${name} (${cls}), Rs. ${amount} due till ${m} ${y}. Kindly pay. ST. AUGUSTINE`
 ];
 return endings.find(t=>t.length<=155&&gsm(t))||'';
}
function phone(s){return String(s.mobileNumber||s.phone||'').trim();}
function validMobile(p){return /^(?:\+977|977)?9[678]\d{8}$/.test(p.replace(/[\s-]/g,''));}
function buttonInit(){
 if(!document.querySelector('#sideNav'))return;
 const n=document.querySelector('#sideNav');
 if(!isAccountant())return;
 for(const [page,label] of [['smsReminder','SMS Reminder Send'],['smsReceived','Fee Received SMS'],['smsHistory','SMS History']]){
  if(n.querySelector(`[data-page="${page}"]`))continue;
  const b=document.createElement('button');b.className='nav-btn';b.dataset.page=page;b.innerHTML=`<span class="nav-icon">✉</span>${label}`;b.onclick=()=>navigate(page);n.append(b);
 }
}
const originalNav=renderSideNav;
renderSideNav=function(){originalNav();buttonInit();};window.renderSideNav=renderSideNav;
const originalNavigate=navigate;
navigate=function(page){if(['smsReminder','smsReceived','smsHistory'].includes(page)){
 if(!isAccountant()){toast('Only Accountant may access SMS accounts tools.');return;}
 session.page=page;renderPage();return;
 }return originalNavigate(page);};window.navigate=navigate;
const originalRender=renderPage;
renderPage=function(){
 if(['smsReminder','smsReceived','smsHistory'].includes(session.page)){
  if(!isAccountant())return unauthorized();
  const title={smsReminder:'Reminder Bill Send',smsReceived:'Fee Received SMS',smsHistory:'SMS History'}[session.page];
  document.querySelector('#pageTitle').textContent=title;document.querySelector('#breadcrumb').textContent='Accounts > '+title;
  if(session.page==='smsReminder')renderSmsReminder();else if(session.page==='smsReceived')renderSmsReceived();else renderSmsHistory();
  renderSideNav();return;
 }
 return originalRender();
};window.renderPage=renderPage;
async function refreshData(){await Promise.all([v15LoadOnlineStudents(),v16LoadOnlineFeeSetup(),v17LoadOnlineOverrides(),v17LoadOnlineReceipts()]);}
function renderSmsReminder(){
 document.querySelector('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Reminder Bill Send</h3><p>Amounts are read from the SAME unpaid-fee calculation used for printable Reminder Letters. No automatic sending.</p></div></div><div class="toolbar"><div class="field"><label>Academic Year</label><select id="outYear">${yearsOptions(getYear())}</select></div><div class="field"><label>Class</label><select id="smsClass">${classesOptions()}</select></div><div class="field"><label>From Month</label><select id="outFrom">${NP_MONTHS.map((m,i)=>`<option value="${i}">${m}</option>`).join('')}</select></div><div class="field"><label>Up to Month</label><select id="outTo">${NP_MONTHS.map((m,i)=>`<option value="${i}">${m}</option>`).join('')}</select></div><button class="btn cyan" id="smsLoad">Load Students</button></div><div style="display:none" id="smsClassCheckHost"></div><div id="smsList" style="margin-top:14px"><div class="empty">Select class and month, then Load Students.</div></div><div id="smsPreview"></div></div>`;
 const sc=document.querySelector('#smsClass');
 sc.onchange=()=>{document.querySelector('#smsList').innerHTML='<div class="empty">Click Load Students to refresh the current fees.</div>';document.querySelector('#smsPreview').innerHTML='';};
 document.querySelector('#smsLoad').onclick=async()=>{
  if(!sc.value)return toast('Select a class first.');
  if(Number(document.querySelector('#outFrom').value)>Number(document.querySelector('#outTo').value))return toast('From month cannot be after Up To month.');
  const load=document.querySelector('#smsLoad');load.disabled=true;load.textContent='Loading...';
  try{
   await refreshData();
   const host=document.querySelector('#smsClassCheckHost');host.innerHTML=`<input type="checkbox" name="outClassCheck" value="${E(sc.value)}" checked>`;
   drawSmsRows();
  }catch(e){document.querySelector('#smsList').innerHTML=`<div class="empty">Could not load current online data: ${E(e.message)}</div>`;}
  finally{load.disabled=false;load.textContent='Load Students';}
 };
 for(const id of ['outYear','outFrom','outTo'])document.querySelector('#'+id).onchange=()=>{document.querySelector('#smsList').innerHTML='<div class="empty">Filters changed. Reload students to recalculate.</div>';document.querySelector('#smsPreview').innerHTML='';};
}
let currentSmsRows=[];
function drawSmsRows(){
 const year=document.querySelector('#outYear').value,month=NP_MONTHS[Number(document.querySelector('#outTo').value)];
 currentSmsRows=outstandingRows().filter(x=>x.total>0);
 const selected=currentSmsRows.filter(x=>validMobile(phone(x.s))&&feeMessage(x,year,month));
 document.querySelector('#smsList').innerHTML=`<div class="sms-action-bar"><label><input id="smsAll" type="checkbox"> Select All</label><span>${currentSmsRows.length} outstanding students; ${selected.length} ready to send</span><button class="btn primary" id="smsPreviewButton">Preview Selected SMS</button></div><div class="table-wrap"><table><thead><tr><th>Tick</th><th>Student Name</th><th>Parent / Guardian</th><th>Mobile</th><th>Reminder Total Pending</th><th>Status</th></tr></thead><tbody>${currentSmsRows.map(x=>{const p=phone(x.s),valid=validMobile(p),msg=feeMessage(x,year,month),ok=valid&&!!msg;return `<tr><td><input type="checkbox" class="smsTick" value="${E(x.s.id)}"></td><td>${E(x.s.name)}<br><small>${E(x.s.className)}</small></td><td>${E(x.s.guardian||x.s.fatherName||x.s.motherName||'—')}</td><td>${E(p||'Not available')}</td><td class="amount">${money(x.total)}</td><td>${ok?'Ready':!valid?'Invalid/missing mobile':'Message over 155 characters'}</td></tr>`;}).join('')}</tbody></table></div>`;
 document.querySelector('#smsAll').onchange=e=>document.querySelectorAll('.smsTick').forEach(c=>c.checked=e.target.checked);
 document.querySelector('#smsPreviewButton').onclick=previewSms;
}
function previewSms(){
 const ids=new Set([...document.querySelectorAll('.smsTick:checked')].map(x=>x.value));
 const year=document.querySelector('#outYear').value,month=NP_MONTHS[Number(document.querySelector('#outTo').value)];
 const rows=currentSmsRows.filter(x=>ids.has(String(x.s.id)));
 if(!rows.length)return toast('Tick at least one student.');
 const blocked=rows.filter(x=>!validMobile(phone(x.s))||!feeMessage(x,year,month));
 if(blocked.length){toast(`${blocked.length} selected student(s) have missing/invalid mobile or SMS text over 155 characters. Correct those records before sending.`);return;}
 const plans=rows.map(x=>({studentId:x.s.id,academicYear:year,fromMonth:Number(document.querySelector('#outFrom').value),toMonth:Number(document.querySelector('#outTo').value),amount:x.total,preview:feeMessage(x,year,month)}));
 document.querySelector('#smsPreview').innerHTML=`<div class="section sms-preview"><h3>Confirm Reminder Messages (${plans.length})</h3><p>Confirm the exact amount from printed Reminder Bill. SMS charges apply. Recheck the mobile numbers.</p>${rows.map((r,i)=>`<div class="sms-message"><b>${E(r.s.name)} — ${E(phone(r.s))}</b><p>${E(plans[i].preview)}</p><small>${plans[i].preview.length} / 155 characters</small></div>`).join('')}<button class="btn primary" id="smsConfirm">Confirm & Send ${plans.length} SMS</button><div id="smsResult"></div></div>`;
 document.querySelector('#smsConfirm').onclick=async()=>{
  if(!confirm(`Send ${plans.length} paid SMS messages to parent mobile numbers?`))return;
  const btn=document.querySelector('#smsConfirm');btn.disabled=true;btn.textContent='Sending...';
  let ok=0,fail=0;const report=[];
  for(const p of plans){try{const {data,error}=await sb.functions.invoke('accounts-sms',{body:{action:'reminder',...p}});if(error)throw error;if(!data?.ok)throw Error(data?.error||'SMS rejected');ok++;report.push({id:p.studentId,status:'accepted'});}catch(e){fail++;report.push({id:p.studentId,status:String(e.message||'Error')});}}
  document.querySelector('#smsResult').innerHTML=`<div class="info">Provider accepted: ${ok}. Failed/uncertain: ${fail}. Review SMS History; do not blindly resend uncertain messages.</div>`;
  btn.textContent='Send attempted';
 };
}
function renderSmsReceived(){
 const receipts=(db.receipts||[]).filter(r=>r.status!=='void'&&r.status!=='cancelled').slice().reverse();
 document.querySelector('#content').innerHTML=`<div class="section premium-section"><div class="section-title"><div><h3>Fee Received SMS</h3><p>Manual confirmation only. Receipt data is read from the saved Supabase receipt by the secure server function.</p></div><button class="btn cyan" id="smsRefreshReceipts">Refresh Online Receipts</button></div><div class="table-wrap"><table><thead><tr><th>Date / Receipt</th><th>Student</th><th>Amount Received</th><th>SMS</th></tr></thead><tbody>${receipts.slice(0,150).map(r=>`<tr><td>${E(r.date)}<br>${E(r.receiptNo)}</td><td>${E(r.studentName)}<br>${E(r.className)}</td><td class="amount">${money(r.paid)}</td><td><button class="btn small smsReceiptSend" data-id="${E(r.id)}">Review & Send</button></td></tr>`).join('')}</tbody></table></div>${receipts.length>150?'<p>Showing latest 150 receipts.</p>':''}<div id="smsReceiptMessage"></div></div>`;
 document.querySelector('#smsRefreshReceipts').onclick=async()=>{try{await Promise.all([v15LoadOnlineStudents(),v17LoadOnlineReceipts()]);renderSmsReceived();}catch(e){toast(e.message)}};
 document.querySelectorAll('.smsReceiptSend').forEach(b=>b.onclick=async()=>{
  const r=receipts.find(x=>String(x.id)===b.dataset.id);if(!r)return;
  const s=db.students.find(x=>x.id===r.studentId||x.studentUuid===r.studentUuid),p=s?phone(s):'';
  const message=`Dear Parent, we received Rs. ${mt(r.paid)} for ${r.studentName} (${r.className}). Receipt: ${r.receiptNo}. Thank you. ST. AUGUSTINE`;
  document.querySelector('#smsReceiptMessage').innerHTML=`<div class="sms-preview"><h4>${E(r.receiptNo)} — ${E(r.studentName)}</h4><p>Parent mobile: ${E(p||'Will be resolved online')}</p><div class="sms-message">${E(message)} (${message.length} chars)</div><button id="smsReceiptConfirm" class="btn primary" ${!gsm(message)||message.length>155?'disabled':''}>Confirm & Send Receipt SMS</button></div>`;
  document.querySelector('#smsReceiptConfirm').onclick=async()=>{
    if(!confirm('Send paid fee-received confirmation SMS?'))return;
    const btn=document.querySelector('#smsReceiptConfirm');btn.disabled=true;
    try{const {data,error}=await sb.functions.invoke('accounts-sms',{body:{action:'received',receiptId:r.id}});if(error)throw error;if(!data?.ok)throw Error(data?.error||'Rejected');toast('Receipt SMS accepted by provider.');}
    catch(e){toast('Receipt SMS failed/uncertain: '+e.message);}
  };
 });
}
async function renderSmsHistory(){
 document.querySelector('#content').innerHTML='<div class="section"><h3>Accounts SMS History</h3><div id="smsHistoryHost">Loading...</div></div>';
 try{const {data,error}=await sb.functions.invoke('accounts-sms',{body:{action:'history'}});if(error)throw error;if(!data?.ok)throw Error(data?.error||'Unavailable');
  document.querySelector('#smsHistoryHost').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Student</th><th>Mobile</th><th>Status</th><th>Message</th></tr></thead><tbody>${(data.rows||[]).map(r=>`<tr><td>${E(r.created_at)}</td><td>${E(r.message_type)}</td><td>${E(r.student_name)}</td><td>${E(r.mobile_masked)}</td><td>${E(r.status)}</td><td>${E(r.message)}</td></tr>`).join('')}</tbody></table></div>`;
 }catch(e){document.querySelector('#smsHistoryHost').textContent='History unavailable: '+e.message;}
}
})();
