import PharmaUtils from '../utils.js';
import { createLiveSync, publishDataUpdate } from './live_data.js?v=1';
import { cleanProductSpecificationText, formatProductIdentityParts, inventoryMedicineSpecificationParts, isPrescriptionProduct } from './product_specification.js?v=11';
import { primaryAccessRole } from './rbac.js?v=6';

const API_BASE_URL = window.location.port ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1' : '../pharma-api/v1';
const SEP = PharmaUtils.productIdentitySeparator || ' • ';
let shelfRows = [];
let shelfLoaded = false;
let sellableCandidates = [];
let savedSellingOptions = new Map();
let originalSellableSetup = '';
let unitBarcodesSupported = false;

function enforceShelfNaturalTable(){
    const table=document.getElementById('shelfInventoryTable');
    if(!table)return;
    table.dataset.tableEnhance='false';
    const wrapper=table.closest('.table-wrap');
    if(wrapper){
        wrapper.classList.remove('data-table-wrapper');
        wrapper.style.height='auto';
        wrapper.style.maxHeight='none';
        wrapper.style.overflowY='visible';
        wrapper.style.overflowX='hidden';
    }
    let style=document.getElementById('shelf-natural-table-override');
    if(!style){
        style=document.createElement('style');
        style.id='shelf-natural-table-override';
        document.head.appendChild(style);
    }
    style.textContent='.table-wrap:has(#shelfInventoryTable),.table-wrap.data-table-wrapper:has(#shelfInventoryTable){height:auto!important;max-height:none!important;overflow-y:visible!important;overflow-x:hidden!important}.table-wrap:has(#shelfInventoryTable)>#shelfInventoryTable{width:100%!important;min-width:0!important;table-layout:fixed!important}.table-wrap:has(#shelfInventoryTable) #shelfInventoryTable .table-actions{display:flex!important;flex-wrap:nowrap!important;gap:3px!important;justify-content:center!important}.table-wrap:has(#shelfInventoryTable) #shelfInventoryTable .table-actions .btn{width:24px!important;height:24px!important;min-width:24px!important;min-height:24px!important;padding:0!important;border-radius:6px!important;font-size:10px!important}.table-wrap:has(#shelfInventoryTable) #shelfInventoryTable .table-actions .btn i{font-size:10px!important}';
}

const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const text = value => String(value ?? '').trim();
const cleanNumber = value => text(value) && Number.isFinite(Number(value)) ? String(Number(value)) : text(value);
const measurement = (value,unit) => cleanNumber(value) ? `${cleanNumber(value)}${text(unit) ? ` ${text(unit)}` : ''}` : '';
const pretty = value => text(value) && !/\d/.test(text(value)) && text(value) === text(value).toLowerCase() ? text(value)[0].toUpperCase()+text(value).slice(1) : text(value);
function unique(parts){const seen=new Set();return parts.map(pretty).filter(part=>{const key=part.toLowerCase();if(!part||seen.has(key))return false;seen.add(key);return true;});}
function isMedicineRow(row){return text(row?.category_name).toLowerCase()==='medicine';}
function productIdentity(row){const parts=formatProductIdentityParts(row);const generic=text(row?.generic_name);const product=text(row?.product_name);return isMedicineRow(row)&&generic?generic:(parts.productName||product||generic||'');}
function productGeneric(row){return text(row?.generic_name)||'';}
function rxBadge(row){return isPrescriptionProduct({medicine_classification_badge:row?.medicine_classification_badge,medicine_classification:row?.medicine_classification,...row})?'<span class="shelf-rx-badge" title="Prescription medicine">Rx</span>':'';}
function productCell(row){const primary=productIdentity(row);const secondary=!isMedicineRow(row)?formatProductIdentityParts(row).genericName:'';return primary?`<span class="shelf-product-identity"><strong>${esc(primary)}</strong>${rxBadge(row)}</span>${secondary?`<small class="d-block text-muted shelf-generic-name">${esc(secondary)}</small>`:''}`:'<span class="text-muted">—</span>';}
function unitLabel(value,quantity=1){const raw=text(value)||'Unit';const normalized=raw.toLowerCase().replaceAll('.','');const singular=['pc','pcs','piece','pieces','each'].includes(normalized)?'Piece':raw.split(/\s+/).map(word=>word?word[0].toUpperCase()+word.slice(1).toLowerCase():'').join(' ');if(Number(quantity)===1||/s$/i.test(singular))return singular;if(/(?:x|z|ch|sh)$/i.test(singular))return `${singular}es`;return `${singular}s`;}
function specification(product){
    const cleanSpec=cleanProductSpecificationText(product.normalized_specification);
    if(text(cleanSpec)){const inventoryUnit=unitLabel(product.inventory_unit_name||product.inventory_unit_symbol);return unique(text(cleanSpec).split(/\s*•\s*/).map(part=>{const content=part.match(/^(\d+(?:\.\d+)?)\s*(?:pc|pcs|piece|pieces)$/i);return content&&!/^pieces?$/i.test(inventoryUnit)?`${content[1]} Pieces per ${inventoryUnit}`:part;})).join(SEP);}
    const category=text(product.category_name).toLowerCase(); let parts=[];
    if(category==='medicine') parts=[measurement(product.strength_value,product.strength_unit)||product.strength,measurement(product.net_content_value,product.net_content_unit),product.dosage_form];
    else if(category==='medical supply'||category==='medical supplies') parts=[product.medical_variant,product.medical_size,product.material,product.sterile_status];
    else { const weight=measurement(product.net_weight,product.unit); parts=[product.variant,weight?'':product.size,weight]; }
    return unique(parts.filter(text)).join(SEP)||'No specification available';
}
function specificationCell(product){
    const parts=inventoryMedicineSpecificationParts(product);
    if(!parts)return `<span class="shelf-specification-text">${esc(specification(product))}</span>`;
    const form=parts.dosageForm.toLowerCase();
    const icon=/powder/.test(form)?'fa-solid fa-flask':/suspension|syrup|solution|drops|liquid/.test(form)?'fa-solid fa-droplet':/supplement|vitamin/.test(form)?'fa-solid fa-leaf':/capsule/.test(form)?'fa-solid fa-capsules':'fa-regular fa-circle-dot';
    return `<span class="shelf-catalog-specification">${parts.dosageForm?`<span class="shelf-specification-form"><i class="${icon}" aria-hidden="true"></i>${esc(parts.dosageForm)}</span>`:''}${parts.strength?`<strong class="shelf-specification-strength">${esc(parts.strength)}</strong>`:''}${parts.details?`<span class="shelf-specification-details">${esc(parts.details)}</span>`:''}</span>`;
}
function formatDate(value){if(!value)return '-';const date=new Date(`${value}T00:00:00`);return Number.isNaN(date.getTime())?'-':date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function expiryBadge(row){const status=text(row.expiry_status)||'N/A';const cls=status==='Safe'?'status-safe':status==='Expiring Soon'?'status-soon':status==='Expired'?'status-expired':'status-na';return `<span class="status-pill ${cls}">${esc(status)}</span><small class="d-block mt-1 text-muted">${esc(formatDate(row.nearest_expiry_date))}</small>`;}
function statusPill(status){const value=text(status)||'N/A';const cls=value==='Safe'?'status-safe':value==='Expiring Soon'?'status-soon':value==='Expired'?'status-expired':'status-na';return `<span class="status-pill ${cls}">${esc(value)}</span>`;}
function currentRole(){return primaryAccessRole(window.__drpSession||{});}
function canManageShelfPricing(){return ['super_admin','admin'].includes(currentRole());}
function detailPair(label,value){return `<div class="product-details-pair"><dt>${esc(label)}</dt><dd>${value}</dd></div>`;}
function openShelfDetails(productId){
    const row=shelfRows.find(item=>String(item.product_id)===String(productId));
    if(!row)return;
    const generic=text(row.generic_name)||'—';
    const name=productGeneric(row)||text(row.product_name)||productIdentity(row)||'Product';
    const genericDetail=generic!=='—'&&generic.toLowerCase()!==name.toLowerCase()?detailPair('Generic Name',esc(generic)):'';
    const unit=unitLabel(row.inventory_unit_name||row.inventory_unit_symbol||'unit',Number(row.shelf_quantity));
    const nearest=`${esc(row.expiry_status||'—')}${row.nearest_expiry_date?` • ${esc(formatDate(row.nearest_expiry_date))}`:''}`;
    document.getElementById('shelfDetailsModalTitle').textContent='Shelf Details';
    document.getElementById('shelfDetailsIdentityLine').innerHTML=`<strong>${esc(name)}</strong>${genericDetail?`<span>${esc(generic)}</span>`:''}`;
    const batches=Array.isArray(row.batches)?row.batches:[];
    document.getElementById('shelfDetailsContent').innerHTML=`<section class="product-details-section"><dl class="product-details-list">${detailPair('Brand',esc(row.brand_name||'—'))}${detailPair('Product Name',esc(name))}${genericDetail}${detailPair('Specification',esc(specification(row)))}${detailPair('Product Type',esc(row.type_name||'—'))}${detailPair('Rx / OTC Tag',rxBadge(row)||'<span class="text-muted">—</span>')}${detailPair('Total Shelf Qty',`${esc(row.shelf_quantity)} ${esc(unit)}`)}${detailPair('Nearest Expiry',nearest)}</dl></section><section class="product-details-section"><h6>Shelf Batches</h6><div class="shelf-batch-table"><div class="shelf-batch-row shelf-batch-head"><span>Batch/Lot No.</span><span>Expiry Date</span><span>Shelf Qty Remaining</span><span>Expiry Status</span></div>${batches.map(batch=>`<div class="shelf-batch-row"><span class="shelf-batch-cell shelf-batch-value" title="${esc(batch.batch_number||batch.batch_id||'')}">${esc(formatBatchText(batch.display_batch_number||'Not recorded'))}</span><span class="shelf-batch-cell">${esc(formatDate(batch.expiry_date))}</span><span class="shelf-batch-cell">${esc(batch.shelf_quantity)}</span><span class="shelf-batch-cell">${statusPill(batch.expiry_status)}</span></div>`).join('')||'<div class="shelf-batch-row"><span class="shelf-batch-cell">No shelf batches found.</span><span></span><span></span><span></span></div>'}</div></section>`;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('shelfDetailsModal')).show();
}

function filteredRows(){const query=text(document.getElementById('shelfSearch')?.value).toLowerCase();const type=text(document.getElementById('shelfTypeFilter')?.value);const status=text(document.getElementById('shelfStatusFilter')?.value);return shelfRows.filter(row=>(!query||[row.brand_name,productIdentity(row),row.generic_name,row.barcode,row.type_name,row.medicine_classification,specification(row)].join(' ').toLowerCase().includes(query))&&(!type||row.type_name===type)&&(!status||row.pos_status===status));}
function formatBatchText(value){const raw=text(value)||'Not recorded';return raw.split('-').map((part,index,parts)=>`${part}${index<parts.length-1?'-':''}`).join('\n');}
function batchBadges(row){const batches=Array.isArray(row.batches)?row.batches:[];const visible=batches.slice(0,3);if(!visible.length)return `<span class="shelf-batch-value" title="${esc(row.batch_display||'Not recorded')}">${esc(formatBatchText(row.batch_display||'Not recorded'))}</span>`;const more=batches.length-visible.length;return `<div class="shelf-batch-list">${visible.map(batch=>`<span class="shelf-batch-value" title="${esc(batch.batch_number||batch.batch_id||'')}">${esc(formatBatchText(batch.display_batch_number||'Not recorded'))}</span>`).join('')}${more>0?`<span class="shelf-batch-more">+${esc(more)} more</span>`:''}</div>`;}
function render(){enforceShelfNaturalTable();const body=document.querySelector('#shelfInventoryTable tbody');const rows=filteredRows();if(!rows.length){body.innerHTML='<tr><td colspan="9" class="empty-row">No transferred Shelf stock matches the current filters.</td></tr>';enforceShelfNaturalTable();return;}body.innerHTML=rows.map(row=>{const rawUnit=row.inventory_unit_name||row.inventory_unit_symbol||'unit';const unit=unitLabel(rawUnit,Number(row.shelf_quantity));const priceUnit=unitLabel(rawUnit);const inactive=row.product_status!=='Active';const price=row.selling_price===null||row.selling_price===undefined?'—':`${Number(row.selling_unit_count)>1?'From ':''}₱${Number(row.selling_price).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;const sellingSetupButton=canManageShelfPricing()?`<button class="btn btn-outline-primary selling-setup-btn" title="Sellable Units &amp; Prices" aria-label="Sellable Units and Prices" data-product-id="${esc(row.product_id)}"><i class="fa-solid fa-tags"></i></button>`:'';return `<tr data-product-id="${esc(row.product_id)}" class="shelf-details-row" tabindex="0" role="button" aria-label="View details for ${esc(productIdentity(row)||'product')}"><td><strong>${esc(row.brand_name||'N/A')}</strong></td><td>${productCell(row)}</td><td>${specificationCell(row)}</td><td>${batchBadges(row)}</td><td><span class="qty-number">${esc(row.shelf_quantity)}</span><small class="d-block text-muted">${esc(unit)}</small></td><td><span class="selling-price">${esc(price)}</span><small class="d-block text-muted">${Number(row.selling_unit_count)>1?'Select a selling unit':`per ${esc(priceUnit)}`}</small></td><td>${expiryBadge(row)}</td><td><span class="status-pill ${row.pos_status==='Available'?'is-available':'is-unavailable'}">${esc(row.pos_status)}</span></td><td><div class="table-actions">${sellingSetupButton}<button class="btn btn-outline-secondary return-storage-btn" title="Return to Storage" data-product-id="${esc(row.product_id)}" ${inactive?'disabled':''}><i class="fa-solid fa-arrow-rotate-left"></i></button></div></td></tr>`;}).join('');enforceShelfNaturalTable();}

async function loadShelf(){try{const data=await PharmaUtils.safeFetch(`${API_BASE_URL}/inventory/get_shelf_inventory.php?t=${Date.now()}`,{credentials:'include'});const nextRows=data.data||[];if(shelfLoaded&&JSON.stringify(nextRows)===JSON.stringify(shelfRows))return;shelfRows=nextRows;shelfLoaded=true;refreshOpenSellingAvailability();const types=[...new Set(shelfRows.map(row=>text(row.type_name)).filter(Boolean))].sort();const select=document.getElementById('shelfTypeFilter');const current=select.value;select.innerHTML='<option value="">All Product Types</option>'+types.map(type=>`<option value="${esc(type)}">${esc(type)}</option>`).join('');select.value=current;render();}catch(error){PharmaUtils.toast.error(error.message);document.querySelector('#shelfInventoryTable tbody').innerHTML='<tr><td colspan="9" class="empty-row">Unable to load Shelf Inventory.</td></tr>';}}

function formatPeso(value){return `₱${Number(value).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;}
function sellingAvailabilityMarkup(unit,baseUnit,base,stock){
    const available=Math.max(0,Math.floor(Math.max(0,stock)/Math.max(1,base)));
    return available>0
        ?`<span>${available} in stock</span>`
        :`<span>Requires ${base} ${esc(unitLabel(baseUnit,base))}</span>`;
}
function refreshOpenSellingAvailability(){
    const drawer=document.getElementById('sellingSetupModal');
    if(!drawer?.classList.contains('is-open'))return;
    const product=shelfRows.find(item=>String(item.product_id)===document.getElementById('sellingSetupProductId').value);
    if(!product)return;
    const unit=product.inventory_unit_name||product.inventory_unit_symbol||'unit';
    const stock=Math.max(0,Number(product.usable_shelf_quantity||0));
    document.getElementById('sellingSetupShelfQuantity').textContent=`${Number(product.shelf_quantity||0)} ${unitLabel(unit,Number(product.shelf_quantity||0))}`;
    document.getElementById('sellingSetupUsableExpiry').textContent=product.nearest_usable_expiry_date?formatDate(product.nearest_usable_expiry_date):'No usable shelf stock';
    document.querySelectorAll('.selling-option-row').forEach(row=>{
        const base=Math.max(1,Number(row.dataset.baseQuantity||1));
        row.dataset.stock=String(stock);
        const availability=row.querySelector('.selling-option-availability');
        availability.classList.toggle('is-unavailable',Math.floor(stock/base)<1);
        availability.innerHTML=sellingAvailabilityMarkup(row.dataset.unitName,row.dataset.baseUnit,base,stock);
    });
}
function optionMarkup(option={}){
    const base=Math.max(1,Number(option.base_quantity||1));
    const baseUnitName=unitLabel(option.base_unit||'unit',1);
    const baseUnitAmount=unitLabel(option.base_unit||'unit',base);
    const unit=unitLabel(option.unit||'Unit',1);
    const price=Number(option.selling_price??0);
    if(!Number.isFinite(price)||price<0)throw new Error('Selling Setup returned an invalid selling price.');
    const stock=Math.max(0,Number(option.shelf_base_quantity||0));
    const cost=Number(option.cost_per_base_unit);
    const hasCost=Number.isFinite(cost)&&cost>0;
    const conversion=base===1?'Base unit':`${base} ${baseUnitAmount}`;
    const availability=sellingAvailabilityMarkup(option.unit||'Unit',option.base_unit||'unit',base,stock);
    const inputId=`sellingPrice-${String(option.selling_option_id||`${option.unit}-${base}`).replace(/[^a-zA-Z0-9_-]/g,'-')}`;
    const barcodeId=`sellingBarcode-${String(option.selling_option_id||`${option.unit}-${base}`).replace(/[^a-zA-Z0-9_-]/g,'-')}`;
    const detailsId=`sellingDetails-${String(option.selling_option_id||`${option.unit}-${base}`).replace(/[^a-zA-Z0-9_-]/g,'-')}`;
    return `<article class="selling-option-row" data-option-id="${esc(option.selling_option_id||'')}" data-unit-name="${esc(option.unit||'')}" data-base-quantity="${base}" data-base-unit="${esc(option.base_unit||'unit')}" data-stock="${stock}" data-cost-per-base="${hasCost?cost:''}">
      <div class="selling-option-main">
       <div class="selling-unit-heading"><div class="selling-unit-name"><strong>${esc(unit)}</strong><span class="selling-default-badge" ${Number(option.is_default)===1?'':'hidden'}><i class="fa-solid fa-star" aria-hidden="true"></i> Default</span></div><small class="selling-unit-conversion">${esc(conversion)} <span aria-hidden="true">·</span> <span class="selling-option-availability ${Math.floor(stock/base)>0?'':'is-unavailable'}">${availability}</span></small></div>
       <div class="selling-option-price-wrap"><label class="selling-option-price-label visually-hidden" for="${esc(inputId)}">Selling price for ${esc(unit)}</label><div class="input-group"><span class="input-group-text selling-option-price-prefix">₱</span><input class="form-control selling-option-price selling-option-price-input" id="${esc(inputId)}" type="text" inputmode="decimal" autocomplete="off" maxlength="14" pattern="\\d+(?:\\.\\d{1,2})?" required value="${price.toFixed(2)}" aria-label="Selling price for ${esc(unit)}"></div><small class="selling-unit-equivalent" aria-live="polite"></small></div>
       <button class="selling-option-expand" type="button" data-toggle-sellable aria-expanded="false" aria-controls="${esc(detailsId)}" aria-label="Show ${esc(unit)} details"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
      </div>
      <div class="selling-option-summary"><span>Margin <strong data-margin>—</strong></span><span>Profit <strong data-profit>—</strong></span><span class="selling-option-savings" data-savings hidden></span></div>
      <div class="selling-option-details" id="${esc(detailsId)}" hidden>
       <div class="selling-cost-grid"><div><span>Cost / ${esc(baseUnitName.toLowerCase())}</span><strong data-cost-per-base>${hasCost?esc(formatPeso(cost)):'—'}</strong></div><div><span>Unit cost</span><strong data-unit-cost>—</strong></div><div><span>Selling / ${esc(baseUnitName.toLowerCase())}</span><strong data-selling-per-base>—</strong></div></div>
       <div class="selling-option-barcode-wrap"><label class="selling-option-barcode-label" for="${esc(barcodeId)}">Unit barcode <span>(optional)</span></label><div class="selling-barcode-control"><i class="fa-solid fa-barcode" aria-hidden="true"></i><input class="form-control selling-option-barcode" id="${esc(barcodeId)}" type="text" maxlength="100" autocomplete="off" value="${esc(option.barcode||'')}" placeholder="Scan or type ${esc(unit.toLowerCase())} barcode" ${unitBarcodesSupported?'':'disabled'}></div><small>${unitBarcodesSupported?`Scanning this adds one ${esc(unit.toLowerCase())} straight to the cart.`:'Unit barcode setup requires the selling-option barcode migration.'}</small></div>
       <div class="sellable-unit-actions"><label class="sellable-unit-default"><input type="radio" name="defaultSellableUnit" class="sellable-default-radio" ${Number(option.is_default)===1?'checked':''}><i class="fa-${Number(option.is_default)===1?'solid':'regular'} fa-star" aria-hidden="true"></i><span>${Number(option.is_default)===1?'Default POS unit':'Make default POS unit'}</span></label><button class="sellable-unit-remove" type="button" data-remove-sellable-unit><i class="fa-regular fa-trash-can" aria-hidden="true"></i> Remove from POS</button></div>
       <p class="selling-option-warning is-below-cost" data-below-cost-warning hidden></p>
      </div>
     </article>`;
}
function addOption(option={}){document.getElementById('sellingOptionsRows').insertAdjacentHTML('beforeend',optionMarkup(option));}
function currentSellableSetup(){return JSON.stringify([...document.querySelectorAll('#sellingOptionsRows .selling-option-row')].map(row=>[row.dataset.unitName,Number(row.dataset.baseQuantity),row.querySelector('.selling-option-price').value.trim(),row.querySelector('.selling-option-barcode').value.trim(),row.querySelector('.sellable-default-radio').checked]));}
function sellableUnitKey(value){
    const key=text(value).toLowerCase().replace(/\.$/,'');
    if(['pc','pcs','pieces','each'].includes(key))return 'piece';
    if(key==='boxes')return 'box';
    if(['tablets','capsules','bottles','packs','packets'].includes(key))return key.slice(0,-1);
    return key;
}
function renderSellableUnitPicker(){
    const select=document.getElementById('sellableUnitSelect');
    const chosen=new Set([...document.querySelectorAll('#sellingOptionsRows .selling-option-row')].map(row=>sellableUnitKey(row.dataset.unitName)));
    const current=select.value;
    select.innerHTML='<option value="">Select unit type...</option>'+sellableCandidates.filter(candidate=>!chosen.has(sellableUnitKey(candidate.unit))).map(candidate=>`<option value="${esc(candidate.unit)}">${esc(unitLabel(candidate.unit))} — ${Number(candidate.base_quantity)} ${esc(unitLabel(document.getElementById('sellingSetupBaseUnit').textContent,Number(candidate.base_quantity)))}</option>`).join('');
    select.value=[...select.options].some(option=>option.value===current)?current:'';
    document.getElementById('addSellableUnitButton').disabled=!select.value;
}
function addSelectedSellableUnit(){
    const select=document.getElementById('sellableUnitSelect');
    const candidate=sellableCandidates.find(item=>item.unit===select.value);
    if(!candidate)return;
    const saved=savedSellingOptions.get(sellableUnitKey(candidate.unit))||{};
    const savedPrice=Number(saved.base_quantity)===Number(candidate.base_quantity)?saved.selling_price:0;
    const hasDefault=Boolean(document.querySelector('#sellingOptionsRows .sellable-default-radio:checked'));
    const baseUnit=document.getElementById('sellingSetupBaseUnit').textContent;
    const product=shelfRows.find(item=>String(item.product_id)===document.getElementById('sellingSetupProductId').value);
    addOption({...candidate,...saved,unit:candidate.unit,base_quantity:Number(candidate.base_quantity),base_unit:baseUnit,selling_price:savedPrice??0,is_default:hasDefault?0:1,shelf_base_quantity:Number(product?.usable_shelf_quantity||0),cost_per_base_unit:Number(document.getElementById('sellingOptionsRows').dataset.costPerBase||0)});
    renderSellableUnitPicker();
    refreshSellingPriceHints();
    document.querySelector('#sellingOptionsRows .selling-option-row:last-child .selling-option-price')?.focus();
}
function closeSellingSetup(){const drawer=document.getElementById('sellingSetupModal');drawer.classList.remove('is-open');drawer.setAttribute('aria-hidden','true');document.body.style.overflow='';document.getElementById('sellingSetupChangeNote').textContent='No changes yet';document.getElementById('sellingPriceComparisonWarning').hidden=true;document.getElementById('saveSellingSetupButton').disabled=true;}
function parseSellingPrice(input){const value=input.value.trim();if(!/^\d+(?:\.\d{1,2})?$/.test(value)){input.setCustomValidity('Enter a price using numbers with no more than two decimal places.');input.setAttribute('aria-invalid','true');return null;}const price=Number(value);if(!Number.isFinite(price)||price<=0){input.setCustomValidity('Enter a selling price above zero before enabling this unit in POS.');input.setAttribute('aria-invalid','true');return null;}input.setCustomValidity('');input.removeAttribute('aria-invalid');return price;}
function refreshSellingPriceHints(){
    const rows=[...document.querySelectorAll('.selling-option-row')];
    const individualRow=rows.find(row=>Number(row.dataset.baseQuantity)===1)||rows.reduce((smallest,row)=>Number(row.dataset.baseQuantity)<Number(smallest.dataset.baseQuantity)?row:smallest,rows[0]);
    const individualPrice=individualRow?parseSellingPrice(individualRow.querySelector('.selling-option-price')):null;
    const comparisonWarnings=[];
    let allPricesValid=true;
    rows.forEach(row=>{
        const input=row.querySelector('.selling-option-price');
        const price=parseSellingPrice(input);
        const base=Math.max(1,Number(row.dataset.baseQuantity||1));
        const baseUnit=unitLabel(row.dataset.baseUnit||'unit',1);
        const cost=Number(row.dataset.costPerBase);
        const isDefault=row.querySelector('.sellable-default-radio').checked;
        row.querySelector('.selling-default-badge').hidden=!isDefault;
        const defaultLabel=row.querySelector('.sellable-unit-default');
        defaultLabel.querySelector('span').textContent=isDefault?'Default POS unit':'Make default POS unit';
        defaultLabel.querySelector('i').className=`fa-${isDefault?'solid':'regular'} fa-star`;
        const equivalent=row.querySelector('.selling-unit-equivalent');
        const warning=row.querySelector('[data-below-cost-warning]');
        const savings=row.querySelector('[data-savings]');
        if(price===null){
            allPricesValid=false;equivalent.textContent='Enter a valid price';
            row.querySelector('[data-margin]').textContent='—';row.querySelector('[data-profit]').textContent='—';
            row.querySelector('[data-unit-cost]').textContent=cost>0?formatPeso(cost*base):'—';
            row.querySelector('[data-selling-per-base]').textContent='—';
            warning.hidden=true;savings.hidden=true;
            return;
        }
        equivalent.textContent=base>1?`${formatPeso(price/base)} / ${baseUnit.toLowerCase()}`:'';
        row.querySelector('[data-unit-cost]').textContent=cost>0?formatPeso(cost*base):'—';
        row.querySelector('[data-selling-per-base]').textContent=formatPeso(price/base);
        const profit=price-cost*base;
        const margin=price>0&&cost>0?profit/price*100:null;
        const marginNode=row.querySelector('[data-margin]');
        marginNode.textContent=margin===null?'—':`${margin.toFixed(1)}%`;
        marginNode.classList.toggle('is-low',margin!==null&&margin<30);
        row.querySelector('[data-profit]').textContent=cost>0?formatPeso(profit):'—';
        warning.textContent=cost>0&&profit<0?'Selling price is below purchase cost.':'';
        warning.hidden=warning.textContent==='';
        const savingsPercent=base>1&&individualPrice>0?(1-price/(individualPrice*base))*100:0;
        savings.hidden=savingsPercent<=0;
        savings.textContent=savingsPercent>0?`Customer saves ${Math.round(savingsPercent)}% vs ${unitLabel(individualRow.dataset.unitName,1)}`:'';
        if(individualPrice!==null&&individualPrice>0&&price/base<individualPrice*0.5&&base>1){
            comparisonWarnings.push(`${unitLabel(row.dataset.unitName,1)} pricing is significantly lower than the individual ${baseUnit} price.`);
        }
    });
    const note=document.getElementById('sellingSetupChangeNote');
    const barcodes=new Set();
    let barcodesValid=true;
    rows.forEach(row=>{
        const input=row.querySelector('.selling-option-barcode');
        const barcode=input.value.trim().toLowerCase();
        const duplicate=barcode!==''&&barcodes.has(barcode);
        input.setCustomValidity(duplicate?'Each sellable unit needs a different barcode.':'');
        input.toggleAttribute('aria-invalid',duplicate);
        if(duplicate)barcodesValid=false;
        if(barcode!=='')barcodes.add(barcode);
    });
    const changed=currentSellableSetup()!==originalSellableSetup;
    const hasDefault=rows.some(row=>row.querySelector('.sellable-default-radio').checked);
    const product=shelfRows.find(item=>String(item.product_id)===document.getElementById('sellingSetupProductId').value);
    const defaultUnit=rows.find(row=>row.querySelector('.sellable-default-radio').checked)?.dataset.unitName||'';
    document.getElementById('sellingProductBarcodeHint').textContent=product?.barcode
        ? rows.length>1
            ? `Scanning product barcode ${product.barcode} opens the sellable unit selector. Add a unit barcode above to scan a unit directly.`
            : `Scanning product barcode ${product.barcode} adds one ${unitLabel(defaultUnit||product.inventory_unit_name).toLowerCase()}. Add a unit barcode above to scan another unit directly.`
        : 'Add a barcode to a sellable unit to scan that unit directly.';
    note.textContent=!rows.length?'Select a sellable unit':!changed?'✓ Saved':!barcodesValid?'Use a different barcode for each unit':allPricesValid&&hasDefault?'Unsaved changes':'Set a price and default unit';
    document.getElementById('saveSellingSetupButton').disabled=!rows.length||!changed||!allPricesValid||!barcodesValid||!hasDefault;
    document.getElementById('discardSellingSetupButton').disabled=!changed;
    const comparison=document.getElementById('sellingPriceComparisonWarning');
    comparison.textContent=comparisonWarnings.length?`⚠ ${comparisonWarnings.join(' ')}`:'';
    comparison.hidden=comparisonWarnings.length===0;
}
async function openSelling(productId){
    if(!canManageShelfPricing()){PharmaUtils.toast.error('Only Admin can edit product selling prices.');return;}
    const row=shelfRows.find(item=>String(item.product_id)===String(productId));
    const data=await PharmaUtils.safeFetch(`${API_BASE_URL}/inventory/get_selling_options.php?product_id=${encodeURIComponent(productId)}&t=${Date.now()}`,{credentials:'include'});
    unitBarcodesSupported=Boolean(data.supports_unit_barcode);
    const unit=(data.base_unit&&data.base_unit.unit_name)||(data.base_unit&&data.base_unit.unit_symbol)||'Unit';
    const options=data.options||[];
    const optionsByUnit=new Map();
    options.forEach(option=>{const key=sellableUnitKey(option.unit);if(!optionsByUnit.has(key))optionsByUnit.set(key,option);});
    const shelfQty=Number(row&&row.shelf_quantity!=null?row.shelf_quantity:(data.shelf_base_quantity||0));
    const usableShelf=Number(row&&row.usable_shelf_quantity!=null?row.usable_shelf_quantity:(data.shelf_usable_base_quantity!=null?data.shelf_usable_base_quantity:(data.shelf_base_quantity||0)));
    const costPerBase=Number(data.cost_per_base_unit);
    const candidates=data.candidate_units&&data.candidate_units.length?data.candidate_units:[{unit,base_quantity:1}];
    sellableCandidates=candidates;
    savedSellingOptions=optionsByUnit;
    document.getElementById('sellingSetupProductId').value=productId;
    document.getElementById('sellingSetupProductName').textContent=productIdentity(row)||'Product';
    document.getElementById('sellingSetupCategory').textContent=(row&&row.category_name)||'Product';
    document.getElementById('sellingSetupCategoryUnits').textContent=`${(row&&row.category_name)||'Product'} units`;
    document.getElementById('sellingSetupCostSummary').textContent=Number.isFinite(costPerBase)&&costPerBase>0?`Cost ${formatPeso(costPerBase)} / ${unitLabel(unit).toLowerCase()}`:'Cost unavailable';
    document.getElementById('sellingSetupBrand').textContent=(row&&row.brand_name)||'—';
    document.getElementById('sellingSetupGeneric').textContent=productGeneric(row)||'—';
    document.getElementById('sellingSetupSpecification').textContent=specification(row);
    document.getElementById('sellingSetupType').textContent=(row&&row.type_name)||'—';
    document.getElementById('sellingSetupBaseUnit').textContent=unitLabel(unit);
    document.getElementById('sellingSetupShelfQuantity').textContent=`${shelfQty} ${unitLabel(unit,shelfQty)}`;
    document.getElementById('sellingSetupUsableExpiry').textContent=row&&row.nearest_usable_expiry_date?formatDate(row.nearest_usable_expiry_date):'No usable shelf stock';
    document.getElementById('sellingSetupSubtitle').textContent=[row?.brand_name,specification(row)].filter(Boolean).join(' · ')||'Product identity and specification';
    document.getElementById('sellingSetupRx').classList.toggle('is-visible',Boolean(row&&rxBadge(row)));
    const container=document.getElementById('sellingOptionsRows');
    container.innerHTML='';
    container.dataset.costPerBase=Number.isFinite(costPerBase)&&costPerBase>0?String(costPerBase):'';
    candidates.forEach(candidate=>{
        const saved=optionsByUnit.get(sellableUnitKey(candidate.unit))||{};
        if(Number(saved.is_active)!==1||Number(saved.pos_enabled)!==1||Number(saved.base_quantity)!==Number(candidate.base_quantity))return;
        const base=Number(candidate.base_quantity||1);
        addOption({...candidate,...saved,unit:candidate.unit,base_quantity:base,base_unit:unit,selling_price:saved.selling_price,shelf_base_quantity:usableShelf,cost_per_base_unit:costPerBase});
    });
    if(!container.querySelector('.sellable-default-radio:checked')){
        const first=container.querySelector('.sellable-default-radio');
        if(first)first.checked=true;
    }
    const enabledCount=container.querySelectorAll('.selling-option-row').length;
    const defaultUnit=container.querySelector('.sellable-default-radio:checked')?.closest('.selling-option-row')?.dataset.unitName||unit;
    document.getElementById('sellingProductBarcodeHint').textContent=row?.barcode
        ? enabledCount>1
            ? `Scanning product barcode ${row.barcode} opens the sellable unit selector. Add a unit barcode above to scan a unit directly.`
            : `Scanning product barcode ${row.barcode} adds one ${unitLabel(defaultUnit).toLowerCase()}. Add a unit barcode above to scan another unit directly.`
        : 'Add a barcode to a sellable unit to scan that unit directly.';
    const unsupported=options.filter(option=>Number(option.is_active)===1&&Number(option.pos_enabled)===1&&!candidates.some(candidate=>sellableUnitKey(candidate.unit)===sellableUnitKey(option.unit)&&Number(candidate.base_quantity)===Number(option.base_quantity)));
    const warning=document.getElementById('sellingUnsupportedUnitWarning');
    warning.textContent=unsupported.length?`${unsupported.map(option=>unitLabel(option.unit)).join(', ')} cannot be suggested from this product's saved package and pack content. Saving this setup will remove ${unsupported.length===1?'it':'them'} from POS.`:'';
    warning.hidden=!unsupported.length;
    originalSellableSetup=unsupported.length?`unsupported:${currentSellableSetup()}`:currentSellableSetup();
    renderSellableUnitPicker();
    refreshSellingPriceHints();
    const drawer=document.getElementById('sellingSetupModal');
    drawer.classList.add('is-open');drawer.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';document.querySelector('.selling-setup-close').focus();
}
async function saveSelling(event){
    event.preventDefault();
    if(!canManageShelfPricing()){PharmaUtils.toast.error('Only Admin can edit product selling prices.');return;}
    const button=document.getElementById('saveSellingSetupButton');
    refreshSellingPriceHints();
    if(button.disabled)return;
    const rows=[...document.querySelectorAll('.selling-option-row')];
    const options=rows.map(row=>{
        const price=parseSellingPrice(row.querySelector('.selling-option-price'));
        return {selling_option_id:row.dataset.optionId||'',unit:row.dataset.unitName,base_quantity:Number(row.dataset.baseQuantity),selling_price:price,barcode:row.querySelector('.selling-option-barcode').value.trim(),pos_enabled:1,is_active:1,is_default:row.querySelector('.sellable-default-radio').checked?1:0};
    });
    if(options.some(option=>option.selling_price===null)){refreshSellingPriceHints();return;}
    button.disabled=true;
    try{
        const productId=document.getElementById('sellingSetupProductId').value;
        const data=await PharmaUtils.safeFetch(`${API_BASE_URL}/inventory/save_selling_options.php`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:productId,options})});
        closeSellingSetup();PharmaUtils.toast.success(data.message);shelfLoaded=false;await loadShelf();publishDataUpdate('product-updated',{productId});
    }catch(error){PharmaUtils.toast.error(error.message);refreshSellingPriceHints();}
    finally{if(document.getElementById('sellingSetupModal').classList.contains('is-open'))refreshSellingPriceHints();else button.disabled=true;}
}
async function returnToStorage(productId){const row=shelfRows.find(item=>String(item.product_id)===String(productId));if(!row)return;const displayUnit=row.inventory_unit_symbol||row.inventory_unit_name||'unit';const transferUnit=row.inventory_unit_name||displayUnit;const result=await Swal.fire({title:'Return stock to Storage',html:`<p class="mb-2">${esc(productIdentity(row)||'Product')}</p><small>Available: ${Number(row.shelf_quantity)} ${esc(displayUnit)}</small>`,input:'number',inputLabel:`Quantity (${displayUnit})`,inputAttributes:{min:'1',max:String(row.shelf_quantity),step:'1'},showCancelButton:true,confirmButtonText:'Return to Storage',confirmButtonColor:'#4f46e5',preConfirm:value=>{const quantity=Number(value);if(!Number.isInteger(quantity)||quantity<1||quantity>Number(row.shelf_quantity)){Swal.showValidationMessage('Enter a valid whole quantity within Shelf availability.');return false;}return quantity;}});if(!result.isConfirmed)return;try{const data=await PharmaUtils.safeFetch(`${API_BASE_URL}/inventory/transfer_stock.php`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:productId,movement_type:'SHELF_TO_STORAGE',quantity:result.value,unit:transferUnit,request_id:globalThis.crypto?.randomUUID?.()||''})});PharmaUtils.toast.success(data.message);shelfLoaded=false;await loadShelf();publishDataUpdate('storage-updated',{productId});publishDataUpdate('shelf-updated',{productId});}catch(error){PharmaUtils.toast.error(error.message);}}

['shelfSearch','shelfTypeFilter','shelfStatusFilter'].forEach(id=>document.getElementById(id)?.addEventListener(id==='shelfSearch'?'input':'change',render));const shelfTable=document.getElementById('shelfInventoryTable');
shelfTable?.addEventListener('click',event=>{
    if(event.target.closest('button,a,input,select,textarea,label'))return;
    const row=event.target.closest('tr[data-product-id]');
    if(row&&shelfTable.contains(row))openShelfDetails(row.dataset.productId);
});
shelfTable?.addEventListener('keydown',event=>{
    if(event.target.matches('tr[data-product-id]')&&(event.key==='Enter'||event.key===' ')){
        event.preventDefault();
        openShelfDetails(event.target.dataset.productId);
    }
});document.getElementById('shelfInventoryTable')?.addEventListener('click',event=>{const selling=event.target.closest('.selling-setup-btn');const returning=event.target.closest('.return-storage-btn');if(selling&&canManageShelfPricing())openSelling(selling.dataset.productId).catch(error=>PharmaUtils.toast.error(error.message));if(returning)returnToStorage(returning.dataset.productId);});document.getElementById('sellingSetupForm')?.addEventListener('submit',saveSelling);document.getElementById('sellableUnitSelect')?.addEventListener('change',event=>{document.getElementById('addSellableUnitButton').disabled=!event.target.value;});document.getElementById('addSellableUnitButton')?.addEventListener('click',addSelectedSellableUnit);document.getElementById('sellingOptionsRows')?.addEventListener('click',event=>{const remove=event.target.closest('[data-remove-sellable-unit]');if(!remove)return;remove.closest('.selling-option-row')?.remove();if(!document.querySelector('#sellingOptionsRows .sellable-default-radio:checked')){const first=document.querySelector('#sellingOptionsRows .sellable-default-radio');if(first)first.checked=true;}renderSellableUnitPicker();refreshSellingPriceHints();});document.getElementById('sellingOptionsRows')?.addEventListener('change',event=>{if(event.target.matches('.sellable-default-radio'))refreshSellingPriceHints();});document.getElementById('sellingOptionsRows')?.addEventListener('input',event=>{if(event.target.matches('.selling-option-price, .selling-option-barcode'))refreshSellingPriceHints();});document.getElementById('sellingOptionsRows')?.addEventListener('blur',event=>{if(!event.target.matches('.selling-option-price'))return;const price=parseSellingPrice(event.target);if(price!==null)event.target.value=price.toFixed(2);refreshSellingPriceHints();},true);document.getElementById('sellingSetupModal')?.addEventListener('click',event=>{if(event.target.closest('[data-close-selling-setup]'))closeSellingSetup();});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.getElementById('sellingSetupModal')?.classList.contains('is-open'))closeSellingSetup();});if(localStorage.getItem('theme')==='dark')document.body.classList.add('dark-mode');enforceShelfNaturalTable();window.addEventListener('navbar:ready',enforceShelfNaturalTable);window.addEventListener('load',enforceShelfNaturalTable);window.addEventListener('pharma:session-ready',loadShelf);setTimeout(()=>{enforceShelfNaturalTable();if(!shelfLoaded)loadShelf();},500);createLiveSync({interval:2000,events:['shelf-updated','storage-updated','payment-completed','product-updated','po-received'],sync:loadShelf});
document.getElementById('sellingOptionsRows')?.addEventListener('click',event=>{
    const toggle=event.target.closest('[data-toggle-sellable]');
    if(!toggle)return;
    const details=toggle.closest('.selling-option-row')?.querySelector('.selling-option-details');
    if(!details)return;
    details.hidden=!details.hidden;
    toggle.setAttribute('aria-expanded',String(!details.hidden));
    toggle.setAttribute('aria-label',`${details.hidden?'Show':'Hide'} ${unitLabel(toggle.closest('.selling-option-row').dataset.unitName)} details`);
});
document.getElementById('discardSellingSetupButton')?.addEventListener('click',()=>{
    const productId=document.getElementById('sellingSetupProductId').value;
    if(productId)openSelling(productId).catch(error=>PharmaUtils.toast.error(error.message));
});
