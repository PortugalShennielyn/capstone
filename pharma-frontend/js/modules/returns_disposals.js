import PharmaUtils from '../utils.js';

const API=window.location.port?'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1':'../pharma-api/v1';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const peso=value=>`₱${Number(value||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const date=value=>value?new Date(String(value).replace(' ','T')).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
const closed=new Set(['Replaced','Credited','Disposed']);
const total=record=>Number(record.shelf_qty||0)+Number(record.storage_qty||0);
const value=record=>total(record)*Number(record.unit_cost||0);
const unit=record=>total(record)===1?String(record.base_unit||'unit'):String(record.base_unit||'unit').replace(/s$/i,'')+'s';
const identity=record=>[record.brand_name,record.generic_name||record.product_name].map(v=>String(v||'').trim()).filter((v,i,a)=>v&&(!i||v.toLowerCase()!==a[0].toLowerCase())).join(' · ')||record.product_name||'Product';
const daysWaiting=record=>Math.max(0,Math.floor((Date.now()-new Date(String(record.updated_at).replace(' ','T')).getTime())/86400000));
const statusClass=record=>record.status==='Disposed'?'disposed':record.status==='Disposal scheduled'?'scheduled':record.status==='Quarantined'?'quarantined':record.status==='Pending pickup'?'pending':record.status.startsWith('Awaiting')?'awaiting':'replaced';
let cases=[],caseType='All',filter='Open',selectedId='';

function counts(){
    const scope=cases.filter(record=>caseType==='All'||record.case_type===caseType);
    return {
        Open:scope.filter(record=>!closed.has(record.status)).length,
        'Pending pickup':scope.filter(record=>record.status==='Pending pickup').length,
        'Awaiting supplier':scope.filter(record=>record.status.startsWith('Awaiting')).length,
        Quarantined:scope.filter(record=>record.status==='Quarantined').length,
        'Disposal scheduled':scope.filter(record=>record.status==='Disposal scheduled').length,
        Closed:scope.filter(record=>closed.has(record.status)).length
    };
}
function matches(record){
    if(caseType!=='All'&&record.case_type!==caseType)return false;
    if(filter==='Open'&&closed.has(record.status))return false;
    if(filter==='Closed'&&!closed.has(record.status))return false;
    if(filter==='Awaiting supplier'&&!record.status.startsWith('Awaiting'))return false;
    if(!['Open','Closed','Awaiting supplier'].includes(filter)&&record.status!==filter)return false;
    const query=$('caseSearch').value.trim().toLowerCase();
    return !query||[record.case_number,identity(record),record.supplier_name,record.reason,record.batch_number].join(' ').toLowerCase().includes(query);
}
function render(){
    const open=cases.filter(record=>!closed.has(record.status));
    $('caseHeadline').textContent=`${open.length} open ${open.length===1?'case':'cases'}`;
    $('openCaseValue').textContent=peso(open.reduce((sum,record)=>sum+value(record),0));
    const overdue=cases.filter(record=>record.status==='Awaiting replacement'&&daysWaiting(record)>14);
    $('overdueNotice').hidden=!overdue.length;$('overdueCount').textContent=String(overdue.length);
    const c=counts();
    $('caseStatusChips').innerHTML=Object.entries(c).map(([name,count])=>`<button type="button" class="resolution-chip ${name===filter?'active':''}" data-status-filter="${esc(name)}">${esc(name)} <span>${count}</span></button>`).join('');
    const shown=cases.filter(matches).sort((a,b)=>{
        const aLate=a.status==='Awaiting replacement'&&daysWaiting(a)>14,bLate=b.status==='Awaiting replacement'&&daysWaiting(b)>14;
        return Number(bLate)-Number(aLate)||String(b.updated_at).localeCompare(String(a.updated_at));
    });
    $('casesTable').querySelector('tbody').innerHTML=shown.length?shown.map(record=>`<tr><td><button class="resolution-case-link" data-case-id="${esc(record.case_id)}"><i class="fa-solid ${record.case_type==='Return'?'fa-arrow-rotate-left':'fa-trash-can'}" aria-hidden="true"></i>${esc(record.case_number)}</button></td><td><strong>${esc(identity(record))}</strong><small>${esc(record.case_type==='Return'?record.supplier_name||'Supplier not recorded':record.disposal_method||'Disposal')}</small></td><td><strong>${total(record)} ${esc(unit(record))}</strong></td><td>${esc(peso(value(record)))}</td><td><span class="resolution-status ${statusClass(record)}">${esc(record.status)}</span>${record.status==='Awaiting replacement'&&daysWaiting(record)>14?`<small>${daysWaiting(record)} days waiting</small>`:''}</td><td>${esc(date(record.updated_at))}</td><td><button class="resolution-case-link" data-case-id="${esc(record.case_id)}" aria-label="Open ${esc(record.case_number)}"><i class="fa-solid fa-chevron-right"></i></button></td></tr>`).join(''):'<tr><td colspan="7" class="resolution-empty">No cases match this view.</td></tr>';
}
function stages(record){
    if(record.case_type==='Return')return ['Pending pickup',record.expected_resolution==='Credit'?'Awaiting credit':'Awaiting replacement',record.expected_resolution==='Credit'?'Credited':'Replaced'];
    return ['Quarantined','Disposal scheduled','Disposed'];
}
function pair(label,text){return `<div><dt>${esc(label)}</dt><dd>${esc(text??'—')}</dd></div>`;}
function actionMarkup(record){
    const current=record.status;
    if(current==='Pending pickup')return `<form data-case-action="pickup"><h3>Has the supplier picked this up?</h3><p>Hand over ${total(record)} ${esc(unit(record))} to ${esc(record.supplier_name||'the supplier')} and record their return slip.</p><label>Return slip / RA no. <small>(optional)</small><input name="reference_number" maxlength="100" placeholder="e.g. RA-2026-001"></label><button class="resolution-primary-btn" type="submit">Mark as picked up</button></form>`;
    if(current==='Awaiting replacement')return `<form data-case-action="replacement"><h3>Record replacement received</h3><p>Received stock is added to storage as a new batch.</p><div class="resolution-two-col"><label>Qty received<input name="quantity" type="number" min="1" max="${Math.max(1,total(record)-Number(record.received_qty||0))}" value="${Math.max(1,total(record)-Number(record.received_qty||0))}" required></label><label>New batch no.<input name="batch_number" maxlength="50" placeholder="From supplier label" required></label></div><label>New expiry date ${String(record.category_name).toLowerCase()==='medicine'?'*':'(if applicable)'}<input name="expiry_date" type="date" ${String(record.category_name).toLowerCase()==='medicine'?'required':''}></label><button class="resolution-primary-btn" type="submit">Receive replacement</button></form>`;
    if(current==='Awaiting credit')return `<form data-case-action="credit"><h3>Record supplier credit</h3><p>Enter the supplier's credit memo and actual credit amount.</p><div class="resolution-two-col"><label>Credit memo no.<input name="reference_number" maxlength="100" required></label><label>Credit amount<input name="amount" type="number" min="0" step="0.01" value="${value(record).toFixed(2)}" required></label></div><button class="resolution-primary-btn" type="submit">Record credit</button></form>`;
    if(current==='Quarantined')return `<form data-case-action="schedule"><h3>Schedule disposal</h3><p>Keep the quarantined stock out of POS until it is destroyed.</p><div class="resolution-two-col"><label>Disposal date<input name="scheduled_date" type="date" min="${new Date().toISOString().slice(0,10)}" value="${esc(record.scheduled_date||'')}" required></label><label>Witness<input name="witness" maxlength="100" value="${esc(record.witness||'')}"></label></div><label>Method<input name="disposal_method" maxlength="120" value="${esc(record.disposal_method||'')}" ${record.disposal_method?'readonly':''} required></label><button class="resolution-primary-btn" type="submit">Schedule disposal</button></form>`;
    if(current==='Disposal scheduled')return `<form data-case-action="dispose"><h3>Confirm the stock was destroyed</h3><p>This writes off the reserved stock and closes the case.</p><div class="resolution-two-col"><label>Manifest / certificate no. <small>(optional)</small><input name="reference_number" maxlength="100"></label><label>Witness<input name="witness" maxlength="100" value="${esc(record.witness||'')}"></label></div><button class="resolution-primary-btn" type="submit">Mark as disposed</button></form>`;
    return `<h3>Case completed</h3><p>This case was closed on ${esc(date(record.closed_at))}.</p>`;
}
function renderDrawer(){
    const record=cases.find(item=>String(item.case_id)===String(selectedId));if(!record)return;
    $('caseDrawerTitle').textContent=record.case_number;
    $('caseDrawerStatus').textContent=record.status;$('caseDrawerStatus').className=`resolution-status ${statusClass(record)}`;
    $('caseDrawerSubtitle').textContent=`${record.case_type} · ${identity(record)}`;
    $('caseDrawerQty').textContent=`${total(record)} ${unit(record)}`;
    $('caseDrawerValue').textContent=`${peso(value(record))} at cost · Batch ${record.batch_number}`;
    const steps=stages(record),current=steps.indexOf(record.status);
    $('caseProgress').innerHTML=steps.map((step,index)=>`<li class="${index<current?'done':index===current?'current':''}">${esc(step)}<small>${esc(date((record.events||[]).find(event=>event.status===step)?.created_at))}</small></li>`).join('');
    const late=record.status==='Awaiting replacement'&&daysWaiting(record)>14;
    $('caseOverdueHint').hidden=!late;$('caseOverdueHint').textContent=late?`Waiting ${daysWaiting(record)} days since pickup. Follow up with ${record.supplier_name||'the supplier'}.`:'';
    $('caseNextStep').innerHTML=actionMarkup(record);
    $('caseDetails').innerHTML=[pair('Supplier',record.supplier_name||'—'),pair('Reason',record.reason),pair('Expecting',record.case_type==='Return'?record.expected_resolution==='Credit'?'Credit memo':'Replacement stock':'—'),pair('Method',record.disposal_method),pair('Disposal date',record.scheduled_date?date(record.scheduled_date):'—'),pair('Witness',record.witness||'—'),pair('Reference',record.reference_number||'—'),pair('Note',record.note||'—')].join('');
    $('caseActivity').innerHTML=(record.events||[]).map(event=>`<li><strong>${esc(event.status)}</strong> ${esc(event.description)}<small>${esc(date(event.created_at))} · ${esc(event.actor_name)}</small></li>`).join('')||'<li>No activity recorded.</li>';
}
function openDrawer(caseId){selectedId=caseId;renderDrawer();$('caseDrawer').classList.add('is-open');$('caseDrawer').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';history.replaceState(null,'',`?case=${encodeURIComponent(caseId)}`);}
function closeDrawer(){$('caseDrawer').classList.remove('is-open');$('caseDrawer').setAttribute('aria-hidden','true');document.body.style.overflow='';selectedId='';history.replaceState(null,'',location.pathname);}
async function load(){
    try{
        const data=await PharmaUtils.safeFetch(`${API}/inventory/get_expiry_cases.php?t=${Date.now()}`,{credentials:'include'});
        cases=Array.isArray(data.data)?data.data:[];render();
        const queryId=new URLSearchParams(location.search).get('case');if(queryId&&cases.some(item=>item.case_id===queryId))openDrawer(queryId);
        else if(selectedId)renderDrawer();
    }catch(error){$('casesTable').querySelector('tbody').innerHTML=`<tr><td colspan="7" class="resolution-empty">${esc(error.message||'Unable to load cases.')}</td></tr>`;}
}
async function submitAction(event){
    const form=event.target.closest('[data-case-action]');if(!form)return;event.preventDefault();
    if(!form.reportValidity())return;
    const action=form.dataset.caseAction;const inputs=Object.fromEntries(new FormData(form).entries());
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
        await PharmaUtils.safeFetch(`${API}/inventory/advance_expiry_case.php`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({case_id:selectedId,action,...inputs})});
        window.localStorage.setItem('drpInventoryExpiryChanged',String(Date.now()));
        await load();PharmaUtils.toast.success('Case updated.');
    }catch(error){PharmaUtils.toast.error(error.message);button.disabled=false;}
}

document.querySelectorAll('[data-case-type]').forEach(button=>button.addEventListener('click',()=>{caseType=button.dataset.caseType;filter='Open';document.querySelectorAll('[data-case-type]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-selected',item===button?'true':'false');});render();}));
$('caseStatusChips').addEventListener('click',event=>{const button=event.target.closest('[data-status-filter]');if(button){filter=button.dataset.statusFilter;render();}});
$('caseSearch').addEventListener('input',render);
$('casesTable').addEventListener('click',event=>{const button=event.target.closest('[data-case-id]');if(button)openDrawer(button.dataset.caseId);});
$('caseDrawer').addEventListener('click',event=>{if(event.target.closest('[data-close-case]'))closeDrawer();});
$('caseNextStep').addEventListener('submit',submitAction);
$('showOverdueButton').addEventListener('click',()=>{caseType='Return';filter='Awaiting supplier';document.querySelectorAll('[data-case-type]').forEach(item=>item.classList.toggle('active',item.dataset.caseType===caseType));render();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('caseDrawer').classList.contains('is-open'))closeDrawer();});
$('currentDate').textContent=new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
if(localStorage.getItem('drpTheme')==='dark'||localStorage.getItem('theme')==='dark')document.body.classList.add('dark-mode');
load();
