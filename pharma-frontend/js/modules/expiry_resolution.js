import PharmaUtils from '../utils.js';

const API = window.location.port ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1' : '../pharma-api/v1';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const peso = value => `₱${Number(value||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtDate = value => value ? new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Not recorded';
const plural = (unit,qty) => qty===1?unit:(/s$/i.test(unit)?unit:`${unit}s`);
const unit = row => String(row.inventory_unit_name || row.inventory_unit_symbol || 'unit').trim();
const status = row => String(row.expiry_status||'Not Recorded');
const isRx = row => Number(row.is_rx)===1 || /prescription\s*\(?rx\)?|\brx\b/i.test(String(row.normalized_specification||''));
const identity = row => [row.brand_name,row.generic_name||row.product_name].map(v=>String(v||'').trim()).filter((v,i,a)=>v&&(!i||v.toLowerCase()!==a[0].toLowerCase())).join(' · ') || row.product_name || 'Product';
const spec = row => String(row.normalized_specification||[row.strength,row.dosage_form,row.package_type,row.variant].filter(Boolean).join(' · ')).replace(/Prescription\s*\(Rx\)/gi,'').replace(/\s*[•·]\s*Rx\b/gi,'').trim();
const closed = new Set(['Replaced','Credited','Disposed']);
let rows=[],cases=[],suppliers=[],tab='expired',selected=null;

function openCases(){return cases.filter(item=>!closed.has(item.status));}
function currentCase(row){return openCases().find(item=>String(item.batch_id)===String(row.batch_id));}
function populateReturnSuppliers(preferredId=''){
    const select=$('returnSupplier');
    select.innerHTML='<option value="">Select supplier</option>'+suppliers.map(supplier=>`<option value="${esc(supplier.supplier_id)}">${esc(supplier.supplier_name)}</option>`).join('');
    if(suppliers.some(supplier=>String(supplier.supplier_id)===String(preferredId)))select.value=String(preferredId);
}
function countFor(which){return rows.filter(row=>matchTab(row,which)).length;}
function matchTab(row,which){
    const linked=Boolean(currentCase(row));
    if(which==='expired')return !linked && status(row).startsWith('Expired') && Number(row.available_quantity)>0;
    if(which==='soon')return !linked && status(row)==='Expiring Soon' && Number(row.available_quantity)>0;
    if(which==='cases')return linked;
    return true;
}
function statusMarkup(row,linked){
    if(linked)return `<span class="resolution-status ${/Disposal|Quarantined/.test(linked.status)?'quarantined':'awaiting'}">${esc(linked.status)}</span>`;
    const s=status(row);
    return `<span class="resolution-status ${s.startsWith('Expired')?'expired':s==='Expiring Soon'?'soon':''}">${esc(s.startsWith('Expired')?'Expired':s)}</span>`;
}
function render(){
    const active=openCases();
    const expired=rows.filter(row=>status(row).startsWith('Expired')&&Number(row.available_quantity)>0&&!currentCase(row));
    const soon=rows.filter(row=>status(row)==='Expiring Soon'&&Number(row.available_quantity)>0&&!currentCase(row));
    $('expiryHeadline').textContent=`${expired.length} expired ${expired.length===1?'batch':'batches'} still in stock`;
    $('expiredCost').textContent=peso(expired.reduce((sum,row)=>sum+Number(row.available_quantity||0)*Number(row.unit_cost||0),0));
    $('expiringCount').textContent=`· ${soon.length} more expiring soon`;
    $('openCaseCount').textContent=`${active.length} open`;
    for(const [which,label] of [['expired','Expired'],['soon','Expiring soon'],['cases','Being returned or disposed'],['all','All batches']]){
        const option=$('expiryFilter').querySelector(`option[value="${which}"]`);
        if(option)option.textContent=`${label} (${countFor(which)})`;
    }
    $('expiryFilter').value=tab;
    const query=$('expirySearch').value.trim().toLowerCase();
    const visible=rows.filter(row=>matchTab(row,tab)&&(!query||[identity(row),row.batch_number,row.po_number,spec(row),row.supplier_name].join(' ').toLowerCase().includes(query)));
    $('expiryTable').querySelector('tbody').innerHTML=visible.length?visible.map(row=>{
        const linked=currentCase(row),s=status(row),qty=Number(row.available_quantity||0),shelf=Number(row.shelf_qty||0),storage=Number(row.storage_qty||0),days=Number(row.days_until_expiry);
        const label=linked?`<a class="resolution-action-btn" href="returns_disposals.html?case=${encodeURIComponent(linked.case_id)}">View case</a>`:qty>0&&(s.startsWith('Expired')||s==='Expiring Soon')?`<button type="button" class="resolution-action-btn ${s.startsWith('Expired')?'danger':''}" data-pullout="${esc(row.batch_id)}">${s.startsWith('Expired')?'Pull out':'Return to supplier'}</button>`:'<span class="text-muted">—</span>';
        return `<tr><td><strong>${esc(identity(row))}${isRx(row)?'<span class="resolution-rx">Rx</span>':''}</strong><small>${esc(spec(row))}</small></td><td><div class="resolution-batch" title="${esc(row.batch_number||row.batch_id)}">${esc(row.batch_number||row.batch_id)}</div><small>${esc(row.po_number||'—')}</small></td><td><strong>${qty} ${esc(plural(unit(row),qty))}</strong><small>${shelf} shelf · ${storage} storage</small></td><td><strong>${esc(fmtDate(row.expiry_date))}</strong><small class="${days<0?'text-danger':''}">${row.days_until_expiry==null?'—':days<0?`${Math.abs(days)} days overdue`:`${days} days left`}</small></td><td>${statusMarkup(row,linked)}</td><td>${label}</td></tr>`;
    }).join(''):'<tr><td colspan="6" class="resolution-empty">No batches match this view.</td></tr>';
}
async function load(){
    try{
        const [expiry,caseData]=await Promise.all([
            PharmaUtils.safeFetch(`${API}/inventory/get_expiry_monitoring.php?t=${Date.now()}`,{credentials:'include'}),
            PharmaUtils.safeFetch(`${API}/inventory/get_expiry_cases.php?t=${Date.now()}`,{credentials:'include'})
        ]);
        rows=Array.isArray(expiry.data)?expiry.data:[];cases=Array.isArray(caseData.data)?caseData.data:[];
        render();
    }catch(error){$('expiryTable').querySelector('tbody').innerHTML=`<tr><td colspan="6" class="resolution-empty">${esc(error.message||'Unable to load batches.')}</td></tr>`;}
    try{
        const supplierData=await PharmaUtils.safeFetch(`${API}/suppliers/get_suppliers.php?t=${Date.now()}`,{credentials:'include'});
        suppliers=Array.isArray(supplierData.suppliers)?supplierData.suppliers:[];
        if(selected){
            populateReturnSuppliers($('returnSupplier').value||selected.supplier_id||'');
            document.querySelector('input[name="caseType"][value="Return"]').disabled=suppliers.length===0;
            $('returnChoiceText').textContent=suppliers.length?'Select the supplier accepting this return':'No active suppliers are available';
        }
    }catch(error){
        suppliers=[];
        if(selected){
            document.querySelector('input[name="caseType"][value="Return"]').disabled=true;
            $('returnChoiceText').textContent='Supplier list could not be loaded; refresh and try again';
        }
        PharmaUtils.toast.error(`Unable to load suppliers for returns: ${error.message||'Please try again.'}`);
    }
}
function updateChoice(){
    if(!selected)return;
    const type=document.querySelector('input[name="caseType"]:checked')?.value||'Return';
    $('returnFields').hidden=type!=='Return';$('disposalFields').hidden=type!=='Disposal';
    $('returnSupplier').required=type==='Return';
    $('returnReason').required=type==='Return';
    $('disposalReason').required=type==='Disposal';
    $('disposalMethod').required=type==='Disposal';
    $('disposalDate').required=type==='Disposal';
    $('disposalWitness').required=type==='Disposal'&&isRx(selected);
    updateDisposalCustomFields();
    $('expiredReturnWarning').hidden=type!=='Return'||!status(selected).startsWith('Expired');
    $('createCaseButton').textContent=type==='Return'?'Create return':'Create disposal';
    updateTotal();
}
function updateTotal(){
    if(!selected)return;
    const shelf=Number($('pulloutShelfQty').value||0),storage=Number($('pulloutStorageQty').value||0),total=shelf+storage;
    const qtyInvalid=!Number.isInteger(shelf)||!Number.isInteger(storage)||total<=0||shelf<0||storage<0||shelf>Number(selected.shelf_qty||0)||storage>Number(selected.storage_qty||0);
    $('pulloutStorageQty').setCustomValidity(total<=0?'Enter at least one unit to continue.':'');
    $('pulloutTotalQty').textContent=`${total} ${plural(unit(selected),total)}`;
    $('pulloutTotalValue').textContent=`${peso(total*Number(selected.unit_cost||0))} ${document.querySelector('input[name="caseType"]:checked')?.value==='Disposal'?'to write off':'to recover'}`;
    $('createCaseButton').disabled=qtyInvalid;
}
function updateDisposalCustomFields(){
    const isDisposal=document.querySelector('input[name="caseType"]:checked')?.value==='Disposal';
    const customReason=isDisposal&&$('disposalReason').value==='Other';
    const customMethod=isDisposal&&$('disposalMethod').value==='Other';
    $('disposalReasonOther').hidden=!customReason;
    $('disposalReasonOther').required=customReason;
    $('disposalMethodOther').hidden=!customMethod;
    $('disposalMethodOther').required=customMethod;
}
function openDrawer(batchId){
    selected=rows.find(row=>String(row.batch_id)===String(batchId));if(!selected)return;
    $('pulloutForm').reset();$('pulloutBatchId').value=selected.batch_id;
    $('pulloutTitle').textContent=identity(selected);
    const days=Number(selected.days_until_expiry);
    $('pulloutBadge').textContent=days<0?`Expired ${Math.abs(days)}d ago`:`${days}d left`;
    $('pulloutBadge').className=`resolution-status ${days<0?'expired':'soon'}`;
    $('pulloutSubtitle').textContent=`Batch ${selected.batch_number||selected.batch_id} · Exp. ${fmtDate(selected.expiry_date)}`;
    $('shelfLimit').textContent=`${selected.shelf_qty} ${plural(unit(selected),Number(selected.shelf_qty))}`;
    $('storageLimit').textContent=`${selected.storage_qty} ${plural(unit(selected),Number(selected.storage_qty))}`;
    $('pulloutShelfQty').value=String(selected.shelf_qty||0);$('pulloutShelfQty').max=String(selected.shelf_qty||0);
    $('pulloutShelfQty').disabled=Number(selected.shelf_qty||0)===0;
    $('pulloutStorageQty').value=String(selected.storage_qty||0);$('pulloutStorageQty').max=String(selected.storage_qty||0);
    populateReturnSuppliers(selected.supplier_id||'');
    $('returnReason').value=days<0?'Expired':'Near expiry';
    $('returnChoiceText').textContent=suppliers.length?'Select the supplier accepting this return':'No active suppliers are available';
    const returnRadio=document.querySelector('input[name="caseType"][value="Return"]');
    returnRadio.disabled=suppliers.length===0;
    document.querySelector(`input[name="caseType"][value="${days<0||suppliers.length===0?'Disposal':'Return'}"]`).checked=true;
    $('rxWitnessHint').hidden=!isRx(selected);$('witnessRequired').textContent=isRx(selected)?'*':'';
    $('disposalDate').min=new Date().toISOString().slice(0,10);
    $('disposalDate').value=new Date().toISOString().slice(0,10);
    updateChoice();$('pulloutDrawer').classList.add('is-open');$('pulloutDrawer').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
}
function closeDrawer(){$('pulloutDrawer').classList.remove('is-open');$('pulloutDrawer').setAttribute('aria-hidden','true');document.body.style.overflow='';selected=null;}
async function createCase(event){
    event.preventDefault();if(!selected)return;
    updateDisposalCustomFields();
    if(!$('pulloutForm').reportValidity())return;
    const type=document.querySelector('input[name="caseType"]:checked')?.value;
    const payload={batch_id:selected.batch_id,case_type:type,shelf_qty:Number($('pulloutShelfQty').value),storage_qty:Number($('pulloutStorageQty').value),supplier_id:type==='Return'?$('returnSupplier').value:'',reason:type==='Return'?$('returnReason').value:$('disposalReason').value,reason_other:type==='Disposal'?$('disposalReasonOther').value.trim():'',expected_resolution:type==='Return'?document.querySelector('input[name="expectedResolution"]:checked')?.value:'',disposal_method:$('disposalMethod').value,disposal_method_other:type==='Disposal'?$('disposalMethodOther').value.trim():'',scheduled_date:$('disposalDate').value,witness:$('disposalWitness').value.trim(),note:$('pulloutNote').value.trim()};
    const button=$('createCaseButton');button.disabled=true;
    try{
        const result=await PharmaUtils.safeFetch(`${API}/inventory/create_expiry_case.php`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        closeDrawer();window.localStorage.setItem('drpInventoryExpiryChanged',String(Date.now()));
        window.location.href=`returns_disposals.html?case=${encodeURIComponent(result.case_id)}`;
    }catch(error){PharmaUtils.toast.error(error.message);updateTotal();}
}

$('expiryFilter').addEventListener('change',()=>{tab=$('expiryFilter').value;render();});
$('expirySearch').addEventListener('input',render);
$('expiryTable').addEventListener('click',event=>{const button=event.target.closest('[data-pullout]');if(button)openDrawer(button.dataset.pullout);});
$('pulloutDrawer').addEventListener('click',event=>{if(event.target.closest('[data-close-pullout]'))closeDrawer();});
document.querySelectorAll('input[name="caseType"]').forEach(input=>input.addEventListener('change',updateChoice));
['disposalReason','disposalMethod'].forEach(id=>$(id).addEventListener('change',updateDisposalCustomFields));
['pulloutShelfQty','pulloutStorageQty'].forEach(id=>$(id).addEventListener('input',updateTotal));
$('pulloutForm').addEventListener('submit',createCase);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('pulloutDrawer').classList.contains('is-open'))closeDrawer();});
$('currentDate').textContent=new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
if(localStorage.getItem('drpTheme')==='dark'||localStorage.getItem('theme')==='dark')document.body.classList.add('dark-mode');
load();
