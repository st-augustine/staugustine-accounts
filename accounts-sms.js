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
 for(const [page,label] of [['smsReminder','SMS Reminder Send'],['smsHistory','SMS History']]){
  if(n.querySelector(`[data-page="${page}"]`))continue;
  const b=document.createElement('button');b.className='nav-btn';b.dataset.page=page;b.innerHTML=`<span class="nav-icon">✉</span>${label}`;b.onclick=()=>navigate(page);n.append(b);
 }
}
const originalNav=renderSideNav;
renderSideNav=function(){originalNav();buttonInit();};window.renderSideNav=renderSideNav;
const originalNavigate=navigate;
navigate=function(page){if(['smsReminder','smsHistory'].includes(page)){
 if(!isAccountant()){toast('Only Accountant may access SMS accounts tools.');return;}
 session.page=page;renderPage();return;
 }return originalNavigate(page);};window.navigate=navigate;
const originalRender=renderPage;
renderPage=function(){
 if(['smsReminder','smsHistory'].includes(session.page)){
  if(!isAccountant())return unauthorized();
  const title={smsReminder:'Reminder Bill Send',smsReceived:'Fee Received SMS',smsHistory:'SMS History'}[session.page];
  document.querySelector('#pageTitle').textContent=title;document.querySelector('#breadcrumb').textContent='Accounts > '+title;
  if(session.page==='smsReminder')renderSmsReminder();else renderSmsHistory();
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

/* V46: Receipt SMS without browser-native prompt (which may be blocked after printing).
   Read the saved receipt/student on the server BEFORE sending. Never re-save receipt.
   Missing number is entered in a dedicated in-page dialog; the existing secured
   'received' action saves the number and sends once, subject to server switch.
*/
const saPendingReceipts=new Set();
function saNormalizePhone(v){return String(v||'').replace(/[\s-]/g,'').replace(/^(?:\+977|977)/,'');}
function saValidPhone(v){return /^9[678]\d{8}$/.test(saNormalizePhone(v));}
async function saInvokeAction(body){
 const {data,error}=await sb.functions.invoke('accounts-sms',{body});
 if(error){
  let reason='';
  try{reason=String((await error.context?.json())?.error||'');}catch(_e){}
  return {ok:false,reason:reason||String(error.message||'SMS server unavailable')};
 }
 return data?.ok?{ok:true,data}:{ok:false,reason:String(data?.error||'Request rejected')};
}
function saNotify(message){
 toast(message);
 let banner=document.querySelector('#saReceiptSmsStatus');
 if(!banner){banner=document.createElement('div');banner.id='saReceiptSmsStatus';banner.setAttribute('role','status');banner.style.cssText='position:fixed;bottom:16px;left:16px;z-index:1400;background:#153c55;color:white;border-radius:9px;padding:12px 15px;max-width:min(550px,calc(100vw - 32px));box-shadow:0 8px 30px #0005;font:14px Arial';document.body.appendChild(banner);}
 banner.textContent=message;
}
function saOpenMobileDialog(receiptId,label){
 return new Promise(resolve=>{
  document.querySelector('#saSmsMobileOverlay')?.remove();
  const overlay=document.createElement('div');overlay.id='saSmsMobileOverlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.68);padding:18px';
  overlay.innerHTML=`<div role="dialog" aria-modal="true" aria-labelledby="saSmsMobileTitle" style="width:min(480px,100%);background:#fff;color:#172b3e;border-radius:12px;padding:23px;box-shadow:0 12px 40px #0006;font:15px Arial"><h3 id="saSmsMobileTitle" style="margin:0 0 8px">Parent Mobile Number Required</h3><p style="line-height:1.5;margin:8px 0">Receipt <b>${E(label||receiptId)}</b> has been saved. Enter the parent mobile number. It will be saved in Student Details and SMS will be attempted only if enabled.</p><form id="saSmsMobileForm"><label for="saSmsMobileInput" style="display:block;font-weight:700;margin:12px 0 5px">Nepal Mobile Number</label><input id="saSmsMobileInput" type="tel" inputmode="numeric" autocomplete="tel" maxlength="16" placeholder="98XXXXXXXX" required style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #8899aa;border-radius:6px"><p id="saSmsMobileError" role="alert" style="color:#a11;min-height:18px;font-size:13px"></p><div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" id="saSmsMobileCancel" class="btn">Not Now</button><button type="submit" id="saSmsMobileSave" class="btn primary">Save Mobile &amp; Send SMS</button></div></form></div>`;
  document.body.appendChild(overlay);
  const input=overlay.querySelector('#saSmsMobileInput'),form=overlay.querySelector('#saSmsMobileForm');
  const end=v=>{overlay.remove();resolve(v)};
  overlay.querySelector('#saSmsMobileCancel').onclick=()=>end(null);
  form.onsubmit=e=>{e.preventDefault();const value=saNormalizePhone(input.value);if(!saValidPhone(value)){overlay.querySelector('#saSmsMobileError').textContent='Please enter a valid 10-digit Nepal mobile number.';input.focus();return;}end(value);};
  input.focus();
 });
}
window.saSmsReceiptSaved=async function(receiptId){
 const id=String(receiptId||'').trim();
 if(!id||!isAccountant()||saPendingReceipts.has(id))return;
 saPendingReceipts.add(id);
 try{
  // Authorized read-only lookup after receipt atomic save; independent of browser cache.
  const status=await saInvokeAction({action:'received_mobile_status',receiptId:id});
  if(!status.ok){saNotify('Receipt saved. Could not check parent mobile: '+status.reason);return;}
  let mobileValue='';
  if(!status.data.hasMobile){
   mobileValue=await saOpenMobileDialog(id,status.data.receiptNo||id);
   if(mobileValue===null){saNotify('Receipt saved. Mobile entry postponed; SMS not sent.');return;}
  }
  const sent=await saInvokeAction({action:'received',receiptId:id,...(mobileValue?{newMobile:mobileValue}:{})});
  if(mobileValue && (sent.ok || /SMS sending is disabled by Admin/i.test(sent.reason))){
   try{await v15LoadOnlineStudents();}catch(e){console.warn('Refresh student mobile failed',e);}
  }
  if(sent.ok)saNotify('Receipt saved. SMS accepted by provider.');
  else if(/SMS sending is disabled by Admin/i.test(sent.reason))saNotify('Receipt saved. '+(mobileValue?'Mobile saved. ':'')+'SMS is disabled by Admin.');
  else if(/Already attempted/i.test(sent.reason))saNotify('Receipt saved. SMS already attempted. Check SMS History.');
  else saNotify('Receipt saved. SMS not confirmed: '+sent.reason+' — check SMS History before retrying.');
 }catch(e){console.warn('Fee receipt SMS error',e);saNotify('Receipt saved. SMS status could not be verified; check SMS History.');}
 finally{saPendingReceipts.delete(id);}
};

})();
