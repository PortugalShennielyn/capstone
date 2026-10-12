import API_BASE_URL from '../config/config.js';
import { ensurePageTabSession as verifySession } from './auth_guard.js?v=21';
import { createLiveSync } from './live_data.js?v=1';

const categories={sales:'Sales',inventory:'Inventory',expiry:'Expiry & Batch',purchases:'Purchasing',supplier:'Supplier & Receiving',staff:'Cashier & Audit',products:'Product Performance',overview:'Overview'};
const categoryIcons={sales:'fa-chart-line',inventory:'fa-cubes-stacked',expiry:'fa-calendar-days',purchases:'fa-cart-shopping',supplier:'fa-truck',staff:'fa-shield-halved',products:'fa-box',overview:'fa-gauge'};
const reportViews={
    overview:['Management Overview'],
    sales:['Sales Summary','Product Sales','Category Sales','Cashier Sales'],
    inventory:['Inventory Overview'],
    purchases:['PR / PO Summary','Purchase History','Invoice & Payment'],
    supplier:['Supplier Performance','Delivery / Receiving','Returns & Damage','Supplier Credits'],
    expiry:['Expiring Products','Expired / Wastage','Batch Traceability'],
    products:['Product Performance Summary'],
    staff:['Shift Reports','Transaction History','Audit Activity']
};
const groupOptions={
    sales:[['day','Day'],['week','Week'],['month','Month'],['product','Product'],['brand','Brand'],['category','Category'],['product_type','Product Type'],['cashier','Cashier'],['sales_clerk','Sales Clerk'],['payment_method','Payment Method']]
};
const visibility={
    overview:['view','dates'],sales:['view','group','dates','primary-category','type','product','brand','cashier','clerk','payment'],
    inventory:['view','primary-category','primary-stock','type','product','brand','secondary-supplier'],
    purchases:['view','dates','primary-supplier','po'],expiry:['view','primary-expiry','primary-supplier','secondary-category','type','product','brand'],
    supplier:['view','dates','primary-supplier'],products:['view','dates','primary-category','type','product','brand'],staff:['view','dates','cashier','clerk']
};
const filterLabels={start_date:'From',end_date:'To',category_id:'Category',type_id:'Product type',product_id:'Product',brand:'Brand',supplier_id:'Supplier',cashier_id:'Cashier',sales_clerk_id:'Sales clerk',payment_method:'Payment',po_status:'PO status',stock_status:'Stock status',rx_filter:'Rx / OTC',expiry_days:'Expiry range',group_by:'Group by'};
const tones={
    purple:'#7c3aed',blue:'#2563eb',teal:'#0f9f92',indigo:'#4f46e5',green:'#16a34a',amber:'#d97706',red:'#dc2626',gray:'#64748b',
    sales:'#5b4cf0',inventory:'#0f9f92',purchases:'#4f46e5',expiry:'#dc2626'
};
const statusColors={Healthy:'green',Completed:'green',Delivered:'green',Paid:'green','Fully Paid':'green',Accepted:'green','Low Stock':'amber','Expiring Soon':'amber',Draft:'gray',Pending:'amber','Partially Paid':'amber','Not Yet Payable':'gray','Out of Stock':'red',Expired:'red',Critical:'red',Cancelled:'red','Negative Stock — Data Issue':'red','High Stock / Low Sales':'red','Slow Moving':'amber','No Sales':'gray','Fast Moving':'green',Steady:'teal',Arrived:'indigo',Watch:'amber','Waiting for cashier':'amber','Waiting for a cashier':'amber','Accepted by cashier':'indigo','Waiting for payment':'indigo','Processing payment':'teal','Payment in progress':'teal','Not sent yet':'gray',Rejected:'red',Other:'gray'};
const money=new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}),number=new Intl.NumberFormat('en-PH');
const qs=s=>document.querySelector(s),qsa=s=>[...document.querySelectorAll(s)];
const state={category:'sales',page:1,data:null,controller:null,charts:new Map(),options:null,searchTimer:null,defaultStart:'',defaultEnd:'',sort:'',direction:'desc',explicitDates:false,needsInitialFilterReload:false,productMode:'quantity',initialPeriodSet:false,period:'30',roleConfigured:false,comparisonMode:'previous',tableController:null};
const viewDescriptions={
    'Sales Summary':'Gross to net sales, transactions and basket size.',
    'Product Sales':'Best-selling products, with Rx and OTC classification.',
    'Category Sales':'Quantity, sales and share by product category.',
    'Cashier Sales':'Sales and cancellations attributed to each cashier.',
    'Staff Sales':'Completed sales grouped by the staff account assigned to each sale.',
    'Payment and Discount':'Sales totals grouped by payment method with recorded discounts, VAT, and refunds.',
    'Current Inventory':'Storage, Shelf and On Hand by product.',
    'Inventory Overview':'Current stock, movement, reorder needs and valuation in one view.',
    'Stock Movement':'Receiving, transfers, sales and adjustments.',
    'Low / Out of Stock':'Products at or below the reorder level.',
    'Fast / Slow Moving':'Movement class from units sold and current stock.',
    'Inventory Valuation':'How much money is tied up in stock.',
    'Expiring Products':'Batches grouped by time to expiry, earliest first (FEFO).',
    'Expired / Wastage':'Value lost to expiry and where the stock is now.',
    'Batch Traceability':'Supplier → PO → Receiving → Storage → Shelf → POS.',
    'PR / PO Summary':'Every purchase order with its PR, status and payment.',
    'Purchase History':'Line-level purchases by supplier and product.',
    'Invoice & Payment':'Supplier invoices, what is paid and what is still owed.',
    'Supplier Performance':'Delivery completeness, issues and lead time.',
    'Delivery / Receiving':'Inspected deliveries: ordered vs received vs accepted.',
    'Returns & Damage':'Discrepancies found at receiving and how they were resolved.',
    'Supplier Credits':'Credits earned from discrepancies and where they were applied.',
    'Shift Reports':'Cash sales and transaction activity by cashier and day.',
    'Transaction History':'Every receipt with cashier, payment and status.',
    'Audit Activity':'Who did what, where and when.'
};
const groupDescriptions={sales:['Sales reports','What is selling and how much revenue it brings in.'],inventory:['Inventory reports','Storage and Shelf health, movement and value.'],expiry:['Expiry & Batch reports','Expiry exposure, wastage and batch history.'],purchases:['Purchasing reports','PR → PO activity, purchases and payables.'],supplier:['Supplier & Receiving reports','What happened after each PO arrived.'],products:['Product reports','See how products perform over time.'],staff:['Cashier & Audit reports','Shift activity and accountability.'],overview:['Overview reports','A summary of pharmacy operations.']};
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const format=(v,type)=>type==='currency'?money.format(Number(v||0)):type==='percent'?`${number.format(Number(v||0))}%`:type==='text'?String(v??''):number.format(Number(v||0));

function initialQuery(){
    const query=new URLSearchParams(location.search);if(categories[query.get('category')])state.category=query.get('category');
    if((reportViews[state.category]||[]).length<=1)qs('.report-layout').classList.add('inventory-expanded');
    if(['previous','year','none'].includes(query.get('comparison_mode')))state.comparisonMode=query.get('comparison_mode');
    qs('#reportComparisonMode').value=state.comparisonMode;
    if(state.category==='expiry'&&!query.has('expiry_days'))qs('[name="expiry_days"]').value='365';
    state.explicitDates=query.has('start_date')||query.has('end_date');
    if(state.explicitDates)state.period='custom';
    const form=qs('#reportFilters'),staticFields=new Set(['start_date','end_date','expiry_days','rx_filter']);
    ['report_view','group_by','start_date','end_date','category_id','type_id','product_id','brand','supplier_id','cashier_id','sales_clerk_id','payment_method','po_status','stock_status','rx_filter','expiry_days','payment_state'].forEach(key=>{if(query.has(key)){const field=form.elements[key];if(field){if(staticFields.has(key)||field.type==='hidden')field.value=query.get(key);else{field.dataset.initial=query.get(key);state.needsInitialFilterReload=true;}}}});
    if(state.category==='inventory'){
        reportViews.inventory=['Inventory Overview'];
        form.elements.report_view.dataset.initial='Inventory Overview';
        if((reportViews[state.category]||[]).length<=1)qs('.report-layout').classList.add('inventory-expanded');
    }
    if(!state.explicitDates){const today=reportToday('Asia/Manila');form.elements.start_date.value=shiftDate(today,-29);form.elements.end_date.value=today;state.initialPeriodSet=true;}
}
function reportToday(timezone){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone||'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));return `${value.year}-${value.month}-${value.day}`;
}
function reportTimezoneLabel(timezone){return timezone==='Asia/Manila'?'Philippine Time · Cagayan de Oro City':timezone||'Philippine Time';}
function shiftDate(date,days){const [year,month,day]=date.split('-').map(Number),value=new Date(Date.UTC(year,month-1,day+days));return value.toISOString().slice(0,10);}
function setPeriodSelection(period){
    state.period=period;
    qs('.report-presets').querySelectorAll('button[data-period]').forEach(button=>{const active=button.dataset.period===period;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    setFilterExpanded(period==='custom');
    const view=qs('[name="report_view"]')?.value||'',inventorySnapshot=state.category==='inventory'&&!['Inventory Overview','Stock Movement','Fast / Slow Moving'].includes(view);
    const periodLabel=qs('#reportPeriodLabel');if(periodLabel)periodLabel.textContent=inventorySnapshot?'Live inventory snapshot':({custom:'Custom date range',month:'This month',today:'Today',yesterday:'Yesterday','7':'Last 7 days','30':'Last 30 days'}[period]||`Last ${period} days`);
}
function setPrintTimestamp(){
    const timezone=state.data?.system?.timezone||'Asia/Manila';
    qs('#reportPrintGenerated').textContent=new Intl.DateTimeFormat('en-PH',{timeZone:timezone,year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date());
}
function renderTabs(available=Object.keys(categories)){
    qs('#reportTabs').innerHTML=available.map(key=>`<button class="report-tab ${key===state.category?'active':''}" type="button" data-category="${key}" aria-current="${key===state.category?'page':'false'}"><i class="fa-solid ${categoryIcons[key]||'fa-chart-simple'}" aria-hidden="true"></i><span>${esc(categories[key])}</span></button>`).join('');
}
function renderViewMenu(){
    const selected=qs('[name="report_view"]').value,[heading,description]=groupDescriptions[state.category]||groupDescriptions.sales;
    qs('#reportGroupTitle').textContent=heading;qs('#reportGroupDescription').textContent=description;
    qs('#reportViewMenu').innerHTML=(reportViews[state.category]||[]).map(view=>`<button class="report-view-item ${view===selected?'active':''}" type="button" data-view="${esc(view)}"><strong>${esc(view)}</strong><small>${esc(viewDescriptions[view]||'Analyze current pharmacy records.')}</small></button>`).join('');
    qs('#reportViewTitle').textContent=selected;qs('#reportViewDescription').textContent=viewDescriptions[selected]||description;
    qs('#reportViewIcon').innerHTML=`<i class="fa-solid ${categoryIcons[state.category]||'fa-chart-simple'}"></i>`;
    renderQuickViewSwitch(selected);
    qs('.report-search').hidden=!['Product Sales','Cashier Sales','Current Inventory','Inventory Overview','Stock Movement','Low / Out of Stock','Fast / Slow Moving','Inventory Valuation','Expiring Products','Expired / Wastage','Batch Traceability','PR / PO Summary','Purchase History','Invoice & Payment'].includes(selected);
    qs('#reportSearch').placeholder=selected==='Batch Traceability'?'Search batch number or product':selected==='PR / PO Summary'?'Search PO or PR number':state.category==='purchases'?'Search PO, PR or supplier':'Search product or batch';
}
function renderQuickViewSwitch(selected){
    const views=reportViews[state.category]||[];
    let select=qs('#quickReportView');
    if(views.length<=1){if(select)select.hidden=true;return;}
    if(!select){select=document.createElement('select');select.id='quickReportView';select.className='form-select form-select-sm';select.setAttribute('aria-label','Report view');qs('.report-heading-actions').prepend(select);}
    select.hidden=false;
    const markup=views.map(view=>`<option ${view===selected?'selected':''}>${esc(view)}</option>`).join('');
    if(select.innerHTML!==markup)select.innerHTML=markup;
}
function setSelect(select,items,placeholder){
    const previous=select.dataset.initial??select.value;delete select.dataset.initial;
    select.innerHTML=`<option value="">${esc(placeholder)}</option>`+items.map(item=>{const obj=typeof item==='object'?item:{id:item,name:item};return `<option value="${esc(obj.id)}">${esc(obj.name)}</option>`;}).join('');
    if([...select.options].some(o=>o.value===previous))select.value=previous;
    select.disabled=items.length===0;select.title=items.length?'':'No valid options for the current selection';
}
function populateBaseOptions(filters){
    state.options=filters;
    setSelect(qs('[name="category_id"]'),filters.categories,'All categories');
    setSelect(qs('[name="secondary_category_id"]'),filters.categories,'All categories');
    setSelect(qs('[name="supplier_id"]'),filters.suppliers,'All suppliers');
    setSelect(qs('[name="secondary_supplier_id"]'),filters.suppliers,'All suppliers');
    setSelect(qs('[name="cashier_id"]'),filters.cashiers,'All cashiers');
    setSelect(qs('[name="sales_clerk_id"]'),filters.sales_clerks,'All sales clerks');
    setSelect(qs('[name="payment_method"]'),filters.payment_methods.map(x=>({id:x,name:x.toUpperCase()})),'All methods');
    setSelect(qs('[name="po_status"]'),filters.po_statuses,'All statuses');
    setSelect(qs('[name="stock_status"]'),filters.stock_statuses.map(x=>({id:x,name:x==='negative'?'Negative — data issue':x.replace(/\b\w/g,c=>c.toUpperCase())})),'All stock');
    const requestedProduct=filters.products.find(x=>x.id===qs('[name="product_id"]').dataset.initial);
    if(requestedProduct){qs('[name="category_id"]').value=qs('[name="secondary_category_id"]').value=requestedProduct.category_id;qs('[name="type_id"]').dataset.initial=requestedProduct.type_id;qs('[name="brand"]').dataset.initial=requestedProduct.brand;}
    syncDependentOptions(false);
}
function activeCategory(){return qs('[name="category_id"]').closest('[data-filter]').hidden?qs('[name="secondary_category_id"]').value:qs('[name="category_id"]').value;}
function activeSupplier(){return qs('[name="supplier_id"]').closest('[data-filter]').hidden?qs('[name="secondary_supplier_id"]').value:qs('[name="supplier_id"]').value;}
function syncMirrors(){
    const cat=activeCategory(),supplier=activeSupplier();qs('[name="category_id"]').value=cat;qs('[name="secondary_category_id"]').value=cat;qs('[name="supplier_id"]').value=supplier;qs('[name="secondary_supplier_id"]').value=supplier;
}
function syncDependentOptions(clearInvalid=true){
    if(!state.options)return;syncMirrors();
    const form=qs('#reportFilters'),category=form.elements.category_id.value,type=form.elements.type_id.dataset.initial??form.elements.type_id.value,brand=form.elements.brand.dataset.initial??form.elements.brand.value;
    const validTypes=state.options.types.filter(x=>!category||x.category_id===category);
    const validProducts=state.options.products.filter(x=>(!category||x.category_id===category)&&(!type||x.type_id===type)&&(!brand||x.brand===brand));
    const validBrands=[...new Set(state.options.products.filter(x=>(!category||x.category_id===category)&&(!type||x.type_id===type)).map(x=>x.brand).filter(Boolean))].sort();
    const oldType=form.elements.type_id.dataset.initial??form.elements.type_id.value,oldProduct=form.elements.product_id.dataset.initial??form.elements.product_id.value,oldBrand=form.elements.brand.dataset.initial??form.elements.brand.value;
    form.elements.type_id.dataset.initial=oldType;form.elements.product_id.dataset.initial=oldProduct;form.elements.brand.dataset.initial=oldBrand;
    setSelect(form.elements.type_id,validTypes,'All types');setSelect(form.elements.product_id,validProducts,'All products');setSelect(form.elements.brand,validBrands,'All brands');
    if(clearInvalid){if(oldType&&!validTypes.some(x=>x.id===oldType))form.elements.type_id.value='';if(oldProduct&&!validProducts.some(x=>x.id===oldProduct))form.elements.product_id.value='';if(oldBrand&&!validBrands.includes(oldBrand))form.elements.brand.value='';}
}
function updateVisibleFilters(){
    const view=qs('[name="report_view"]'),previous=view.dataset.initial||view.value;view.innerHTML=reportViews[state.category].map(x=>`<option>${x}</option>`).join('');if(reportViews[state.category].includes(previous))view.value=previous;delete view.dataset.initial;
    qs('.report-layout').classList.toggle('inventory-expanded',(reportViews[state.category]||[]).length<=1);
    const inventoryView=view.value;
    const salesFields={
        'Sales Summary':['view','dates'],
        'Product Sales':['view','dates','primary-category','rx'],
        'Category Sales':['view','dates'],
        'Cashier Sales':['view','dates','cashier'],
        'Staff Sales':['view','dates'],
        'Payment and Discount':['view','dates','payment']
    };
    const inventoryFields={
        'Inventory Overview':['view','dates','primary-category','primary-stock','product','brand','secondary-supplier'],
        'Current Inventory':['view','primary-category','primary-stock','product','secondary-supplier'],
        'Stock Movement':['view','dates','primary-category','product'],
        'Low / Out of Stock':['view','primary-category','product'],
        'Fast / Slow Moving':['view','dates','primary-category','product','brand'],
        'Inventory Valuation':['view','primary-category','product','secondary-supplier']
    };
    const visible=new Set(state.category==='inventory'&&inventoryFields[inventoryView]?inventoryFields[inventoryView]:state.category==='sales'&&salesFields[view.value]?salesFields[view.value]:visibility[state.category]||[]);
    qsa('[data-filter]').forEach(el=>el.hidden=!visible.has(el.dataset.filter));
    const dateRange=qs('[name="start_date"]').closest('[data-filter]');dateRange.hidden=!visible.has('dates')||state.period!=='custom';
    const moreFiltersButton=qs('#moreFiltersToggle'),secondaryFilters=qs('#secondaryFilters');
    const hasSecondaryFilters=qsa('#secondaryFilters [data-filter]').some(field=>!field.hidden);
    moreFiltersButton.hidden=state.category==='overview'||!hasSecondaryFilters;
    if(!hasSecondaryFilters){secondaryFilters.hidden=true;moreFiltersButton.setAttribute('aria-expanded','false');moreFiltersButton.lastElementChild.className='fa-solid fa-chevron-down';}
    const group=qs('[name="group_by"]'),options=groupOptions[state.category]||[];group.innerHTML=options.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');const initial=group.dataset.initial;if(initial&&options.some(x=>x[0]===initial))group.value=initial;delete group.dataset.initial;
    syncDependentOptions(false);renderViewMenu();
}
function buildParams(overrides={}){
    syncMirrors();const params=new URLSearchParams({category:state.category,layout:'reference',page:String(state.page),page_size:'10',comparison_mode:state.comparisonMode});
    new FormData(qs('#reportFilters')).forEach((value,key)=>{if(!key.startsWith('secondary_')&&String(value)!=='')params.set(key,value);});
    const search=qs('#reportSearch').value.trim();if(search)params.set('search',search);if(state.sort){params.set('sort',state.sort);params.set('direction',state.direction);}
    Object.entries(overrides).forEach(([k,v])=>params.set(k,String(v)));return params;
}
async function loadTablePage(page){
    const pagination=state.data?.pagination;if(!pagination||page<1||page>pagination.pages)return;
    const loadedPage=pagination.page;state.page=page;state.tableController?.abort();
    const controller=new AbortController();state.tableController=controller;
    qs('#previousPage').disabled=true;qs('#nextPage').disabled=true;
    try{
        const response=await fetch(`${API_BASE_URL}/reports/get_report.php?${buildParams({page})}`,{credentials:'include',cache:'no-store',signal:controller.signal});
        const data=await response.json();
        if(!response.ok||data.status!=='success')throw new Error(data.message||'Unable to load these records.');
        if(state.tableController!==controller)return;
        state.data={...state.data,rows:data.rows,pagination:data.pagination};
        renderTable(state.data);syncUrl();
    }catch(error){
        if(error.name==='AbortError'||state.tableController!==controller)return;
        state.page=loadedPage;
        renderTable(state.data);
        qs('#pageSummary').textContent=`Could not load that page: ${error.message}`;
    }finally{if(state.tableController===controller)state.tableController=null;}
}
async function loadReport({silent=false}={}){
    state.tableController?.abort();state.tableController=null;state.controller?.abort();
    const form=qs('#reportFilters'),startDate=form.elements.start_date.value,endDate=form.elements.end_date.value;
    if(startDate&&endDate&&startDate>endDate){state.controller=null;if(!silent){qs('#reportLoading').classList.add('d-none');qs('#reportContent').classList.add('d-none');qs('#reportError').textContent='Start date cannot be after end date.';qs('#reportError').classList.remove('d-none');}return;}
    state.controller=new AbortController();if(!silent||!state.data)destroyCharts();if(!silent||!state.data){qs('#reportContent').classList.add('d-none');qs('#reportError').classList.add('d-none');qs('#reportLoading').classList.remove('d-none');}
    try{const response=await fetch(`${API_BASE_URL}/reports/get_report.php?${buildParams()}`,{credentials:'include',cache:'no-store',signal:state.controller.signal});const data=await response.json();if(response.status===403&&data.access?.available_categories?.length){state.category=data.access.available_categories[0];state.page=1;updateVisibleFilters();return loadReport();}if(!response.ok||data.status!=='success')throw new Error(data.message||'Unable to generate this report.');
        if(!state.initialPeriodSet&&!state.explicitDates){state.initialPeriodSet=true;const today=reportToday(data.system.timezone);qs('[name="start_date"]').value=shiftDate(today,-29);qs('[name="end_date"]').value=today;return loadReport();}
        state.initialPeriodSet=true;if(silent&&state.data)destroyCharts();state.data=data;if(data.access?.supervisor){categories.overview='Inventory Overview';categories.purchases='Purchase Requests';reportViews.overview=['Inventory Overview'];reportViews.purchases=['Purchase Request Summary'];visibility.purchases=['view','dates'];}
        if(!state.roleConfigured){state.roleConfigured=true;const previousView=qs('[name="report_view"]').value;if(data.access.management||data.access.supervisor){reportViews.inventory=['Inventory Overview'];}else{reportViews.sales=['Sales Summary','Product Sales','Staff Sales','Payment and Discount'];reportViews.inventory=['Inventory Overview'];reportViews.staff=['Staff Performance Summary'];}updateVisibleFilters();if(qs('[name="report_view"]').value!==previousView)return loadReport();}
        if(!state.options){populateBaseOptions(data.filters||{});if(state.needsInitialFilterReload){state.needsInitialFilterReload=false;return loadReport();}}if(!data.access.available_categories.includes(state.category)){state.category=data.access.available_categories[0];updateVisibleFilters();return loadReport();}renderTabs(data.access.available_categories);renderReport(data);syncUrl();}
    catch(error){if(error.name==='AbortError')return;if(silent&&state.data){console.warn('Could not refresh reports with the latest sales.',error);return;}qs('#reportLoading').classList.add('d-none');qs('#reportError').classList.remove('d-none');qs('#reportError').textContent=error.message;}
}
function syncUrl(){
    const params=buildParams();if(!state.explicitDates&&params.get('start_date')===state.defaultStart)params.delete('start_date');if(!state.explicitDates&&params.get('end_date')===state.defaultEnd)params.delete('end_date');
    if(params.get('expiry_days')==='30'&&state.category!=='expiry')params.delete('expiry_days');if(params.get('group_by')==='day')params.delete('group_by');if(params.get('comparison_mode')==='previous')params.delete('comparison_mode');params.delete('report_view');params.delete('page_size');if(params.get('page')==='1')params.delete('page');
    params.set('category',state.category);if(qs('[name="report_view"]').value!==reportViews[state.category]?.[0])params.set('report_view',qs('[name="report_view"]').value);params.delete('layout');history.replaceState(null,'',`${location.pathname}?${params}`);
}
function comparisonRangeLabel(data){
    const range=data?.comparison_period;if(!range?.start||!range?.end)return '';
    const start=reportDate(range.start,{month:'short',day:'numeric',...(range.start.slice(0,4)===range.end.slice(0,4)?{}:{year:'numeric'})});
    const end=reportDate(range.end,{month:'short',day:'numeric',year:'numeric'});
    return `${start}–${end}`;
}
function salesComparisonBadge(card){
    const comparison=card.comparison;
    if(comparison?.state==='disabled'||!comparison||comparison.state==='unavailable'||comparison.state==='no_activity')return '';
    if(comparison?.state==='no_prior_snapshot'||comparison?.state==='tracking_started'){const baseline=comparison.snapshot_date?reportDate(comparison.snapshot_date,{month:'short',day:'numeric',year:'numeric'}):'today';return `<small class="summary-change is-baseline" title="Daily inventory history starts ${esc(baseline)}. A percentage will appear when the comparison period includes a saved inventory snapshot.">Tracking since: ${esc(baseline)}</small>`;}
    if(comparison.is_new||comparison.state==='new')return `<small class="summary-change is-good" aria-label="This metric was zero in the previous period and is present now">↗ New</small>`;
    const change=Number(comparison.percent),direction=change>0?'up':change<0?'down':'flat';
    const arrow=change>0?'↗':change<0?'↘':'→';
    return `<small class="summary-change is-${direction}" aria-label="${Math.abs(change).toFixed(1)} percent ${direction} from the previous period">${arrow} ${Math.abs(change).toFixed(1)}%</small>`;
}
function reportContextBadge(card,data){
    if(card.comparison)return salesComparisonBadge(card);
    const view=qs('[name="report_view"]').value;
    const snapshotOverviewMetrics=['Inventory Cost','Cost at Risk','Total On Hand','Shelf Stock','Storage Stock','Low-Stock Products','Out-of-Stock Products'];
    if(card.report_context){const snapshot=card.report_context==='snapshot',hasValue=card.value!==null&&card.value!==undefined;if(!(snapshot&&hasValue))return '';return `<small class="summary-change is-snapshot" title="Current inventory value. Daily inventory history is now being saved for future period comparisons.">Live snapshot</small>`;}
    const liveSnapshot=(state.category==='inventory'&&!['Stock Movement','Fast / Slow Moving'].includes(view))||state.category==='expiry'||(state.category==='overview'&&snapshotOverviewMetrics.includes(card.title));
    return liveSnapshot?`<small class="summary-change is-snapshot" title="This measure is a current inventory snapshot; historical snapshots are not stored.">Live snapshot</small>`:'';
}
function comparisonPeriodNote(data){const range=comparisonRangeLabel(data);return range?`<span class="summary-period-note">vs ${esc(range)}</span>`:'';}
function selectedPeriodNote(data){
    if(!data?.comparison_period&&data?.comparison_mode!=='none')return '';
    const range=qs('#reportDateRange')?.textContent?.trim();
    return range?`<span class="summary-period-current">selected ${esc(range)}</span>`:'';
}
function cardComparisonPeriodNote(card,data){return state.category==='inventory'&&card.report_context==='snapshot'?'':comparisonPeriodNote(data);}
function cardSelectedPeriodNote(card,data){return state.category==='inventory'&&card.report_context==='snapshot'?'':selectedPeriodNote(data);}
function reportAccountScope(data){
    const access=data?.access||{},view=qs('[name="report_view"]')?.value||'';
    if(access.management)return 'All accounts';
    if(access.supervisor)return 'Your supervisor records';
    if((access.sales_clerk&&state.category==='products')||(access.cashier&&view==='Product Sales'))return 'All accounts';
    if(access.cashier||access.sales_clerk)return 'Your completed payments';
    return 'All accounts';
}
function reportPrintMetaNode(id,label){
    const section=qs('.report-print-metadata');if(!section)return null;
    let node=qs(`#${id}`);if(!node){const line=document.createElement('p');line.className='report-print-extra';line.append(`${label}: `);node=document.createElement('span');node.id=id;line.append(node);section.append(line);}
    return node;
}
function updateReportFreshness(data,generated){
    let line=qs('#reportFreshness');
    if(!line){line=document.createElement('p');line.id='reportFreshness';line.className='report-freshness';qs('#reportGenerated').insertAdjacentElement('afterend',line);}
    const timestamp=generated.toLocaleString('en-PH',{timeZone:data.system.timezone,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
    line.textContent=`Updated ${timestamp} · ${reportTimezoneLabel(data.system.timezone)} · ${reportAccountScope(data)}`;
}
function updateReportPrintContext(data){
    const filters=qsa('#filterChips .filter-chip').map(chip=>chip.textContent.trim().replace(/\s*×$/,'')).filter(Boolean).join('; ')||'Default filters';
    const printedFilters=reportPrintMetaNode('reportPrintFilters','Applied filters');
    const printedScope=reportPrintMetaNode('reportPrintScope','Account scope');
    if(printedFilters)printedFilters.textContent=filters;
    if(printedScope)printedScope.textContent=reportAccountScope(data);
    const printedComparison=reportPrintMetaNode('reportPrintComparison','Comparison');
    if(printedComparison){const range=comparisonRangeLabel(data);printedComparison.parentElement.hidden=state.comparisonMode!=='none'&&!range;printedComparison.textContent=state.comparisonMode==='none'?'Off':range||'Unavailable';}
}
function updateDateRangeExtras(data){
    const view=qs('[name="report_view"]').value,categoryHasDate=['sales','purchases','supplier','products','staff','overview'].includes(state.category)||(state.category==='inventory'&&['Inventory Overview','Stock Movement','Fast / Slow Moving'].includes(view));
    const compareEligible=categoryHasDate&&!(data.access?.supervisor&&state.category==='overview');
    qs('#comparisonControl').hidden=!compareEligible;
    qs('#reportComparisonMode').value=state.comparisonMode;
    qs('#monthControl').hidden=!categoryHasDate;
    if(!categoryHasDate)return;
    const select=qs('#reportMonthShortcut'),today=reportToday(data.system.timezone),currentMonth=today.slice(0,7),months=[];
    let [year,month]=currentMonth.split('-').map(Number);
    for(let i=0;i<=120;i++){
        const key=`${year}-${String(month).padStart(2,'0')}`,date=new Date(`${key}-01T00:00:00`);
        months.push(`<option value="${key}">${new Intl.DateTimeFormat('en-PH',{month:'long',year:'numeric'}).format(date)}</option>`);
        month--;if(month<1){month=12;year--;}
    }
    select.innerHTML='<option value="">Choose month…</option>'+months.join('');
    const start=qs('[name="start_date"]').value,end=qs('[name="end_date"]').value;
    const fullMonth=start&&end&&start.slice(0,7)===end.slice(0,7)&&start.endsWith('-01')&&Number(end.slice(8,10))===new Date(Number(end.slice(0,4)),Number(end.slice(5,7)),0).getDate();
    select.value=fullMonth?start.slice(0,7):'';
}
function renderComparisonLegend(data){
    const target=qs('#reportComparisonLegend');
    const show=Boolean(data.comparison_period)&&state.comparisonMode!=='none';
    target.hidden=!show;
    target.textContent=show?'Comparison: percentages compare the selected range with the period shown. “New” means the previous value was zero.':'';
}
function renderDataQualityNotice(data){
    const target=qs('#reportQualityNotice'),profit=(data.summary||[]).find(card=>['Gross Profit','Estimated Gross Profit'].includes(card.title));
    if(state.category!=='sales'){target.hidden=true;target.textContent='';target.className='report-quality-notice';return;}
    const notices=['Sales totals include completed, paid transactions in this account scope and selected date range. Cancelled, unpaid, and incomplete orders are excluded.'];
    let level='info';
    if(profit&&String(profit.value).toLowerCase()==='incomplete history'){
        level='warning';notices.push('Gross profit is incomplete because some sold units do not have enough recorded batch-cost history.');
    }else if(profit?.title==='Estimated Gross Profit'){
        level='warning';notices.push('Estimated gross profit uses recorded costs where available and estimates costs for items with missing batch history.');
    }
    target.hidden=false;target.className=`report-quality-notice is-${level}`;target.textContent=notices.join(' ');
}
function reportContextLabel(){
    const view=qs('[name="report_view"]').value;
    const liveSnapshot=(state.category==='inventory'&&!['Stock Movement','Fast / Slow Moving'].includes(view))||state.category==='expiry';
    if(view==='Inventory Overview')return `current snapshot and ${qs('#reportDateRange')?.textContent?.trim()||'selected period'}`;
    if(liveSnapshot)return `as of ${qs('#reportToday')?.textContent||'today'}`;
    const range=qs('#reportDateRange')?.textContent?.trim();
    return range?`for ${range}`:'for the selected period';
}
function isFinancialHighlight(card){return ['Total VAT Collected','Gross Profit','Estimated Gross Profit'].includes(String(card?.title||''));}
function financialCardDescription(card){
    const title=String(card?.title||'');
    if(title==='Net Sales')return 'Completed paid sales after discounts, less recorded refunds.';
    if(title==='Total VAT Collected')return 'VAT recorded on completed paid sales, less recorded refunds.';
    if(title==='Estimated Gross Profit')return 'Sales excluding VAT, less recorded costs and estimated costs for items with missing batch history.';
    if(title==='Gross Profit')return 'Completed sales excluding VAT, less recorded batch costs.';
    return '';
}
function orderFinancialCards(cards, salesSummary=false){
    const priority=salesSummary
        ? {'Gross Sales':0,'Total VAT Collected':1,'Gross Profit':2,'Estimated Gross Profit':2,'Net Sales':3}
        : {'Net Sales':0,'Total VAT Collected':1,'Gross Profit':2,'Estimated Gross Profit':2};
    return [...(cards||[])].map((card,index)=>({card,index})).sort((a,b)=>{
        const aRank=priority[a.card?.title],bRank=priority[b.card?.title];
        if(aRank===undefined&&bRank===undefined)return a.index-b.index;
        if(aRank===undefined)return 1;
        if(bRank===undefined)return -1;
        return aRank-bRank||a.index-b.index;
    }).map(item=>item.card);
}
function salesTrendIndicator(data,card){
    const chart=(data.charts||[]).find(item=>['daily-net-sales','sales-trend'].includes(item.id));
    const series=Array.isArray(data.trend_series)?data.trend_series:(chart?.rows||[]);
    const seriesKey={'Gross Sales':'gross_sales','Total VAT Collected':'vat','Gross Profit':'gross_profit','Estimated Gross Profit':'gross_profit'}[card?.title]||'value';
    const seriesLabel=card?.title==='Gross Sales'?'Gross sales':card?.title==='Total VAT Collected'?'VAT collected':/profit/i.test(card?.title||'')?'Gross profit':'Sales';
    const rows=series.map(row=>({...row,value:seriesKey==='value'?row.value:row[seriesKey]})).filter(row=>row.value!==null&&row.value!==undefined&&Number.isFinite(Number(row.value))&&(seriesKey==='gross_profit'||Number(row.value)>=0)&&row.raw_date);
    const ordered=[...rows].sort((a,b)=>String(a.raw_date).localeCompare(String(b.raw_date)));
    const periodComparison=ordered.length===0&&card.comparison?.previous_value!==undefined&&card.comparison?.previous_value!==null;
    const values=periodComparison?[Number(card.comparison.previous_value),Number(card.value)]:ordered.map(row=>Number(row.value));
    if(!values.length)return '';
    const width=180,height=38,pad=3,min=Math.min(0,...values),max=Math.max(...values),span=max-min||1;
    const points=values.length===1?`${width/2-12},${height/2} ${width/2+12},${height/2}`:values.map((value,index)=>`${pad+index*(width-2*pad)/Math.max(1,values.length-1)},${height-pad-(value-min)*(height-2*pad)/span}`).join(' ');
    const description=periodComparison?`${seriesLabel} compared with the previous period`:`Daily ${seriesLabel.toLowerCase()} trend for the selected period`;
    return `<div class="summary-trend-indicator financial-trend-indicator" role="img" aria-label="${description}"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" /></svg></div>`;
}
function reportSummaryChart(data){
    const charts=data.charts||[];
    return charts.find(item=>Array.isArray(item.rows)&&item.rows.length>0)||charts.find(item=>Array.isArray(item.rows));
}
function reportSummaryCaption(data){
    const chart=reportSummaryChart(data);
    return chart?.title||`${qs('[name="report_view"]').value||'Report'} summary for the selected filters`;
}
function reportSummaryIndicator(data){
    const chart=reportSummaryChart(data);
    const values=(chart?.rows||[]).map(row=>Number(row.value??(Number(row.paid||0)+Number(row.outstanding||0)))).filter(value=>Number.isFinite(value)&&value>=0);
    const title=chart?.title||'Current report data';
    if(!values.length)return `<div class="summary-trend-indicator is-empty" role="img" aria-label="No indicator data for the selected filters"><small>No indicator data</small></div>`;
    const width=180,height=38,pad=3,min=Math.min(0,...values),max=Math.max(...values),span=max-min||1;
    const points=values.length===1?`${width/2-12},${height/2} ${width/2+12},${height/2}`:values.map((value,index)=>`${pad+index*(width-2*pad)/Math.max(1,values.length-1)},${height-pad-(value-min)*(height-2*pad)/span}`).join(' ');
    return `<div class="summary-trend-indicator" role="img" aria-label="Indicator for ${esc(title)}"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" /></svg></div>`;
}
function renderSummaryCards(data){
    const target=qs('#summaryCards'),view=qs('[name="report_view"]').value,
        salesSummary=state.category==='sales'&&view==='Sales Summary'&&(data.comparison_period||data.comparison_mode==='none'),
        purchaseSummary=state.category==='purchases'&&view==='PR / PO Summary'&&data.purchase_order_count!==undefined;
    target.classList.toggle('sales-summary',Boolean(salesSummary));
    target.classList.toggle('purchase-summary',Boolean(purchaseSummary));
    target.classList.toggle('inventory-overview-summary',state.category==='inventory'&&view==='Inventory Overview');
    if(purchaseSummary){
        target.innerHTML=(data.summary||[]).map((card,index)=>`<article class="summary-card purchase-metric ${index===0?'purchase-metric-primary':''}"><span>${esc(card.title)}</span><strong>${esc(format(card.value,card.format))}</strong><div class="summary-context">${reportContextBadge(card,data)}${index===0?comparisonPeriodNote(data):''}${index===0&&!data.comparison_period?`<span class="summary-context-range">${esc(reportContextLabel())}</span>`:''}</div>${index===0?`<p class="summary-explanation">${esc(reportSummaryCaption(data))}</p>${reportSummaryIndicator(data)}<small class="purchase-order-count">${number.format(data.purchase_order_count)} purchase order${data.purchase_order_count===1?'':'s'}</small>`:''}</article>`).join('');
        return;
    }
    if(!salesSummary){const inventoryOverview=state.category==='inventory'&&view==='Inventory Overview',inventoryPriority={'On Hand Units':0,'Storage':1,'Total Inventory Cost':2},cards=inventoryOverview?[...(data.summary||[])].sort((a,b)=>(inventoryPriority[a.title]??Number.MAX_SAFE_INTEGER)-(inventoryPriority[b.title]??Number.MAX_SAFE_INTEGER)):orderFinancialCards(data.summary);target.innerHTML=cards.map((card,index)=>{const inventoryHighlight=inventoryOverview&&['Storage','Total Inventory Cost'].includes(card.title),inventoryFeatured=inventoryOverview&&['On Hand Units','Storage','Total Inventory Cost'].includes(card.title),inventoryDescription=card.title==='Storage'?'Units currently kept in Storage rather than on the Shelf.':card.title==='Total Inventory Cost'?'Recorded cost of active, unexpired stock currently on hand.':'';return `<article class="summary-card tone-${esc(card.tone||'purple')} ${index===0?'report-primary-metric':''} ${isFinancialHighlight(card)||inventoryHighlight?'report-highlight-metric':''} ${inventoryFeatured?'inventory-featured-metric':''}" ${card.tooltip?`title="${esc(card.tooltip)}"`:''}><div class="summary-icon"><i class="fa-solid ${esc(card.icon||'fa-chart-simple')}" aria-hidden="true"></i></div><span>${esc(card.title)}</span><strong>${esc(format(card.value,card.format))}</strong><div class="summary-context">${reportContextBadge(card,data)}${index===0?cardComparisonPeriodNote(card,data):''}${index===0&&!data.comparison_period?`<span class="summary-context-range">${esc(reportContextLabel())}</span>`:''}</div>${inventoryHighlight?`<p class="financial-metric-description">${esc(inventoryDescription)}</p>`:''}${isFinancialHighlight(card)?`<p class="financial-metric-description">${esc(financialCardDescription(card))}</p>${salesTrendIndicator(data,card)}`:''}${index===0&&!isFinancialHighlight(card)?`<p class="summary-explanation">${esc(reportSummaryCaption(data))}</p>${reportSummaryIndicator(data)}`:''}</article>`;}).join('');return;}
    const rangeStart=new Date(`${data.system.date_range.start}T00:00:00`),rangeEnd=new Date(`${data.system.date_range.end}T00:00:00`),period=data.comparison_period||{days:Math.max(1,Math.round((rangeEnd-rangeStart)/86400000)+1)};
    target.innerHTML=orderFinancialCards(data.summary,true).map((card,index)=>`<article class="summary-card sales-metric ${index===0?'sales-metric-primary':''} ${isFinancialHighlight(card)?'sales-metric-highlight':''} ${card.title==='Net Sales'?'sales-metric-net':''}" ${card.tooltip?`title="${esc(card.tooltip)}"`:''}><span>${esc(card.title)}</span><strong>${esc(format(card.value,card.format))}</strong><div class="summary-comparison">${salesComparisonBadge(card)}${index===0?comparisonPeriodNote(data):''}</div>${isFinancialHighlight(card)||card.title==='Net Sales'?`<p class="financial-metric-description">${esc(financialCardDescription(card))}</p>${isFinancialHighlight(card)?salesTrendIndicator(data,card):''}`:''}${index===0?`${salesTrendIndicator(data,card)}<p class="summary-explanation">${card.title==='Gross Sales'?'Sales before discounts': 'Completed sales after discounts and refunds'} over ${period.days} day${period.days===1?'':'s'}</p>`:''}</article>`).join('');
}
function renderReport(data){
    qs('#reportLoading').classList.add('d-none');qs('#reportContent').classList.remove('d-none');
    qs('#summaryCards').hidden=false;qs('#reportCharts').hidden=false;
    qs('.report-layout').classList.toggle('inventory-expanded',(reportViews[state.category]||[]).length<=1);
    qs('#reportContent').classList.toggle('is-overview',state.category==='overview');
    state.defaultStart=data.system.date_range.start;state.defaultEnd=data.system.date_range.end;const form=qs('#reportFilters');if(!form.elements.start_date.value)form.elements.start_date.value=state.defaultStart;if(!form.elements.end_date.value)form.elements.end_date.value=state.defaultEnd;
    const generated=new Date(data.system.generated_at);qs('#reportGenerated').textContent=`Generated ${generated.toLocaleString('en-PH',{timeZone:data.system.timezone,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} · ${reportTimezoneLabel(data.system.timezone)} · ${data.system.generated_by}`;updateReportFreshness(data,generated);
    qs('#reportToday').textContent=generated.toLocaleDateString('en-PH',{timeZone:data.system.timezone,weekday:'short',year:'numeric',month:'short',day:'numeric'});
    const rangeStart=data.system.date_range.start,rangeEnd=data.system.date_range.end;
    qs('#reportDateRange').textContent=`${reportDate(rangeStart,{month:'short',day:'numeric',...(rangeStart.slice(0,4)===rangeEnd.slice(0,4)?{}:{year:'numeric'})})} – ${reportDate(rangeEnd,{month:'short',day:'numeric',year:'numeric'})}`;
    updateDateRangeExtras(data);

    qs('#reportPeriodLabel').textContent=state.category==='inventory'&&qs('[name="report_view"]').value==='Inventory Overview'?'Live inventory + selected period':state.category==='inventory'&&qs('[name="report_view"]').value!=='Stock Movement'&&qs('[name="report_view"]').value!=='Fast / Slow Moving'?'Live inventory snapshot':state.period==='custom'?'Custom date range':state.period==='month'?'This month':state.period==='today'?'Today':state.period==='yesterday'?'Yesterday':`Last ${state.period} days`;
    setPeriodSelection(state.period);
    renderViewMenu();const scopeLabel=reportAccountScope(data),viewLabel=viewDescriptions[qs('[name="report_view"]').value]||qs('#reportViewDescription').textContent;qs('#reportViewDescription').textContent=scopeLabel?`${viewLabel} ${scopeLabel}.`:viewLabel;renderReferenceControls();
    const categoryName=(qs('#reportGroupTitle').textContent || 'Pharmacy').replace(/\s+reports?$/i,'');
    qs('#reportPrintTitle').textContent=state.category==='overview'?(data.access?.supervisor?'INVENTORY OVERVIEW REPORT':'OVERALL PHARMACY REPORT'):`${categoryName} Report`.toUpperCase();
    qs('#reportPrintCategory').textContent=state.category==='overview'?(data.access?.supervisor?'Inventory supervisor summary':'Pharmacy operations summary'):qs('#reportViewTitle').textContent || 'Report details';
    const startDate=new Date(`${rangeStart}T00:00:00`),endDate=new Date(`${rangeEnd}T00:00:00`);
    const startLabel=reportDate(rangeStart,{month:'long',day:'numeric'}),endLabel=reportDate(rangeEnd,{month:'long',day:'numeric',year:'numeric'});
    const periodLabel=startDate.getFullYear()===endDate.getFullYear()&&startDate.getMonth()===endDate.getMonth()?`${new Intl.DateTimeFormat('en-PH',{month:'long'}).format(startDate)} ${startDate.getDate()}–${endDate.getDate()}, ${endDate.getFullYear()}`:startDate.getFullYear()===endDate.getFullYear()?`${startLabel}–${endLabel}`:`${reportDate(rangeStart,{month:'long',day:'numeric',year:'numeric'})}–${endLabel}`;
    qs('#reportPrintPeriod').textContent=periodLabel;
    qs('#reportPrintGenerated').textContent=generated.toLocaleString('en-PH',{timeZone:data.system.timezone,year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'});
    qs('#reportPrintPreparedBy').textContent=data.system.generated_by || '';
    const printAddress=qs('#reportPrintAddress');if(printAddress){printAddress.textContent='Capistrano corner Cruz Taal Street, Barangay 08, Cagayan de Oro City';printAddress.hidden=false;}
    renderSummaryCards(data);
    renderComparisonLegend(data);renderDataQualityNotice(data);
    renderCharts(data.charts||[]);renderRanking(data);renderInsights(data);
    qs('.report-visuals').classList.toggle('inventory-overview-grid',state.category==='inventory'&&form.elements.report_view.value==='Inventory Overview');
    if(state.category==='purchases'&&form.elements.report_view.value==='PR / PO Summary'){
        qs('#reportCharts .chart-card h2')?.insertAdjacentHTML('afterend',`<small class="chart-date-caption">${esc(qs('#reportDateRange').textContent)}</small>`);
    }
    if(state.category==='overview'){const attention=qs('#reportInsights .attention-card');if(attention){qs('#reportCharts').appendChild(attention);qs('#reportCharts').classList.remove('single-chart');}}
    renderOverview(data.overview_previews);renderOverviewPrint(data);renderTableInsights(data.table_insights||[],data);renderTable(data);qs('.report-table-card').hidden=state.category==='overview'||form.elements.report_view.value==='Batch Traceability';renderNotes(data.notes||[]);renderFilterChips();updateReportPrintContext(data);
    if(form.elements.report_view.value==='Batch Traceability')renderBatchTrace(data.trace);
}
function renderRanking(data){
    const target=qs('#reportRanking'),view=qs('[name="report_view"]').value,chart=(data.charts||[]).find(item=>Array.isArray(item.rows)&&item.rows.length);
    if(state.category==='purchases'&&view==='PR / PO Summary'){
        const orders=data.top_purchase_orders||[],max=Math.max(1,...orders.map(order=>Number(order.value)||0));
        target.hidden=false;
        target.innerHTML=`<div class="ranking-heading"><h2>Highest purchase orders</h2><p>Within the current filters</p></div><div class="ranking-list">${orders.length?orders.map(order=>`<div class="ranking-item"><div><span>${esc(order.label)}</span><strong>${esc(money.format(Number(order.value)||0))}</strong></div><div class="ranking-track"><span style="width:${100*(Number(order.value)||0)/max}%"></span></div></div>`).join(''):'<p class="ranking-empty">No purchase orders in this period.</p>'}</div>`;
        return;
    }
    if(!chart||chart.id==='daily-net-sales'||state.category==='products'||view==='Batch Traceability'||state.category==='overview'){target.hidden=true;target.innerHTML='';return;}
    const salesRanking=state.category==='sales',productRanking=state.category==='products',topTwentyInventory=state.category==='inventory'&&view==='Inventory Overview',staffRanking=state.category==='staff',supplierRanking=state.category==='supplier',dailyNetSales=chart.id==='daily-net-sales',rowLimit=dailyNetSales?chart.rows.length:salesRanking||productRanking||topTwentyInventory?20:staffRanking?10:5;
    const ranked=chart.rows.map(row=>({...row,rankValue:Number(row.value??(Number(row.paid||0)+Number(row.outstanding||0)))})).filter(row=>row.rankValue>0);
    const rows=(dailyNetSales?ranked.sort((a,b)=>String(a.raw_date||a.label).localeCompare(String(b.raw_date||b.label))):ranked.sort((a,b)=>b.rankValue-a.rankValue)).slice(0,rowLimit);
    if(!rows.length){target.hidden=true;target.innerHTML='';return;}
    const currency=/sales|cost|value|revenue|paid|payable|purchase/i.test(chart.title),metric=currency?value=>money.format(value):value=>number.format(value);
    const staffTitles={'Shift Reports':'Peak collection days','Transaction History':'Highest sales days','Audit Activity':'Busiest modules','Staff Performance Summary':'Highest sales'};
    const rankingTitle=salesRanking&&view==='Product Sales'?'Products with sales':topTwentyInventory?'Products on hand':productRanking?chart.title:dailyNetSales?'Daily net sales':salesRanking?chart.title:staffRanking?(staffTitles[view]||chart.title):supplierRanking?`Top 5 by ${chart.title.toLowerCase()}`:chart.title;
    const rankingNote=dailyNetSales?'Completed payments for each day in the selected dates.':'Within the current filters';
    target.hidden=false;target.innerHTML=`<div class="ranking-heading"><div><h2>${esc(rankingTitle)}</h2><p>${esc(rankingNote)}</p></div></div><div class="ranking-chart-box" style="height:${dailyNetSales?270:Math.max(160,rows.length*(salesRanking||productRanking||topTwentyInventory?32:44))}px"><canvas id="reportRankingChart" role="img" aria-label="${esc(rankingTitle)}"></canvas></div>`;
    if(typeof Chart==='undefined')return;
    const values=rows.map(row=>row.rankValue),labels=dailyNetSales?rows.map(row=>reportDate(row.raw_date||row.label,{month:'short',day:'numeric'})):rows.map(row=>row.label),colors=semanticChartColors(rows,chart.tone);
    const lineFill=context=>{const area=context.chart.chartArea;if(!area)return 'rgba(91,76,240,.14)';const gradient=context.chart.ctx.createLinearGradient(0,area.top,0,area.bottom);gradient.addColorStop(0,'rgba(91,76,240,.25)');gradient.addColorStop(1,'rgba(91,76,240,.015)');return gradient;};
    const dataset=dailyNetSales
        ?{label:'Net sales',data:values,backgroundColor:lineFill,borderColor:tones.sales,borderWidth:3,fill:true,tension:.35,pointRadius:4,pointHoverRadius:7,pointBackgroundColor:'#fff',pointBorderColor:tones.sales,pointBorderWidth:2}
        :{label:chart.title,data:values,backgroundColor:colors,borderRadius:7,borderSkipped:false,maxBarThickness:28};
    const chartOptions=dailyNetSales
        ?{type:'line',data:{labels,datasets:[dataset]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},animation:{duration:160},plugins:{legend:{display:false},tooltip:{displayColors:false,callbacks:{label:context=>`Net sales: ${metric(context.raw)}`}}},scales:{x:{grid:{display:false},ticks:{autoSkip:true,maxRotation:0}},y:{beginAtZero:true,grid:{color:'rgba(148,163,184,.16)'},ticks:{callback:value=>metric(value)}}}}}
        :{type:'bar',data:{labels,datasets:[dataset]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:{duration:160},plugins:{legend:{display:false},tooltip:{callbacks:{label:context=>metric(context.raw)}}},scales:{x:{beginAtZero:true,grid:{color:'rgba(148,163,184,.16)'},ticks:{callback:value=>currency?money.format(value):number.format(value)}},y:{grid:{display:false},ticks:{autoSkip:false}}}}};
    const instance=new Chart(qs('#reportRankingChart'),chartOptions);
    state.charts.set(`ranking:${chart.id}`,instance);
}
function renderReferenceControls(){
    const special=Boolean(state.data?.access?.management)&&['sales','inventory','expiry','purchases','supplier','staff'].includes(state.category),view=qs('[name="report_view"]').value,card=qs('.report-filter-card');
    const snapshot=(state.category==='inventory'&&!['Inventory Overview','Stock Movement','Fast / Slow Moving'].includes(view))||(state.category==='expiry'&&view!=='Expired / Wastage');
    card.classList.toggle('reference-filters',special);card.classList.toggle('snapshot-filters',snapshot);
    card.classList.toggle('purchase-filters',special&&state.category==='purchases'&&view==='PR / PO Summary');
    let target=qs('#referenceQuickFilters');if(!target){target=document.createElement('div');target.id='referenceQuickFilters';card.appendChild(target);}
    target.hidden=!special;if(!special){if(qs('#referenceQuickMeta'))qs('#referenceQuickMeta').hidden=true;if(qs('#referenceSnapshotLabel'))qs('#referenceSnapshotLabel').hidden=true;qs('#reportGenerated').hidden=false;return;}
    let meta=qs('#referenceQuickMeta');if(!meta){meta=document.createElement('div');meta.id='referenceQuickMeta';card.appendChild(meta);}
    meta.hidden=false;meta.textContent=`${number.format(state.data?.pagination?.total||0)} records`;
    let snapshotLabel=qs('#referenceSnapshotLabel');if(!snapshotLabel){snapshotLabel=document.createElement('div');snapshotLabel.id='referenceSnapshotLabel';card.appendChild(snapshotLabel);}
    snapshotLabel.hidden=!snapshot;snapshotLabel.innerHTML=`<i class="fa-solid fa-circle"></i> Live snapshot as of ${esc(qs('#reportToday').textContent)}`;
    const suppliers=state.options?.suppliers||[],supplier=qs('[name="supplier_id"]').value,
        supplierOptions=`<option value="">All suppliers</option>`+suppliers.map(x=>`<option value="${esc(x.id)}" ${x.id===supplier?'selected':''}>${esc(x.name)}</option>`).join('');
    const categoriesOptions=`<option value="">All categories</option>`+(state.options?.categories||[]).map(x=>`<option value="${esc(x.id)}" ${x.id===qs('[name="category_id"]').value?'selected':''}>${esc(x.name)}</option>`).join('');
    const stockOptions=`<option value="">All stock statuses</option>`+(state.options?.stock_statuses||[]).filter(x=>x!=='negative').map(x=>`<option value="${esc(x)}" ${x===qs('[name="stock_status"]').value?'selected':''}>${esc(x==='healthy'?'In Stock':x==='low'?'Low Stock':'Out of Stock')}</option>`).join('');
    const cashierOptions=`<option value="">All cashiers</option>`+(state.options?.cashiers||[]).map(x=>`<option value="${esc(x.id)}" ${x.id===qs('[name="cashier_id"]').value?'selected':''}>${esc(x.name)}</option>`).join('');
    const select=(id,options)=>`<select id="${id}" class="form-select form-select-sm" aria-label="${id.replace('quick','')} filter">${options}</select>`;
    let controls='';
    if(state.category==='sales')controls=view==='Product Sales'?select('quickCategory',categoriesOptions):view==='Cashier Sales'?select('quickCashier',cashierOptions):'';
    if(state.category==='inventory')controls=select('quickCategory',categoriesOptions)+(view==='Current Inventory'||view==='Inventory Valuation'||view==='Inventory Overview'?select('quickSupplier',supplierOptions):'')+(view==='Current Inventory'||view==='Low / Out of Stock'||view==='Inventory Overview'?select('quickStock',stockOptions):'');
    if(view==='Expiring Products')controls=select('quickExpiry',`<option value="365" ${qs('[name="expiry_days"]').value==='365'?'selected':''}>All windows</option><option value="30" ${qs('[name="expiry_days"]').value==='30'?'selected':''}>Within 30 days</option><option value="90" ${qs('[name="expiry_days"]').value==='90'?'selected':''}>Within 90 days</option><option value="180" ${qs('[name="expiry_days"]').value==='180'?'selected':''}>Within 6 months</option>`);
    if(view==='Expired / Wastage')controls=select('quickSupplier',supplierOptions);
    if(view==='Batch Traceability')controls='<button type="button" class="btn btn-purple" id="quickTrace">Trace batch</button>';
    if(state.category==='purchases'){
        const invoice=view==='Invoice & Payment',summary=view==='PR / PO Summary';
        const selectedStatus=qs('[name="po_status"]').value,selectedPayment=qs('[name="payment_state"]').value;
        const statuses=`<option value="">All status</option>`+(state.options?.po_statuses||[]).map(x=>`<option value="${esc(x.id??x)}" ${String(x.id??x).toLowerCase()===selectedStatus.toLowerCase()?'selected':''}>${esc(x.name??x)}</option>`).join('');
        const payments=invoice?[['Paid','Paid'],['Unpaid','Unpaid'],['Partially Paid','Partially paid']]:[['paid','Paid'],['unpaid','Unpaid'],['partial','Partial']];
        const paymentOptions=`<option value="">All payment</option>`+payments.map(([value,label])=>`<option value="${value}" ${value.toLowerCase()===selectedPayment.toLowerCase()?'selected':''}>${label}</option>`).join('');
        controls=(invoice?'':select('quickStatus',statuses))+(invoice||summary?select('quickPayment',paymentOptions):'')+select('quickSupplier',supplierOptions);
    }
    if(state.category==='supplier')controls=select('quickSupplier',supplierOptions);
    if(state.category==='staff')controls=select('quickCashier',cashierOptions);
    target.innerHTML=controls;
    qs('.report-search').hidden=view==='Sales Summary'||view==='Category Sales';
    qs('#reportGenerated').hidden=special;
}
function renderBatchTrace(trace){
    const target=qs('#reportInsights');qs('#summaryCards').hidden=true;qs('#reportCharts').hidden=true;
    if(!trace){target.innerHTML='<div class="trace-card empty-trace">Search a batch number or product to view its history.</div>';return;}
    const b=trace.batch,total=Number(b.received_qty)||0,storage=Number(b.storage_qty)||0,shelf=Number(b.shelf_qty)||0,
        returned=Number(b.returned_qty)||0,damaged=Number(b.damaged_qty)||0,sold=Math.max(0,total-storage-shelf-returned-damaged),
        pieces=[['Sold',sold,'#5b4cf0'],['On Shelf',shelf,'#0d9488'],['In Storage',storage,'#1d2333'],['Returned',returned,'#f59e0b'],['Damaged',damaged,'#dc2626']];
    target.innerHTML=`<article class="trace-card"><div class="trace-heading"><div><small>${esc(b.batch_reference)}</small><h2>${esc(b.product_name)}</h2><span>${esc(b.supplier)}</span></div><div>Expiry ${esc(b.expiry_date||'Not set')}</div></div><div class="trace-flow"><div><span>Supplier</span><strong>${esc(b.supplier)}</strong></div><div><span>Purchase order</span><strong>${esc(b.po_number)}</strong></div><div><span>Receiving</span><strong>${number.format(total)} received</strong><small>${esc(b.received_date)}</small></div><div><span>Storage</span><strong>${number.format(storage)} left</strong></div><div><span>Shelf</span><strong>${number.format(shelf)} left</strong></div><div><span>POS</span><strong>${number.format(sold)} sold*</strong></div></div><h3>Where the ${number.format(total)} units went</h3><div class="trace-bar">${pieces.filter(([,v])=>v>0).map(([,v,c])=>`<span style="width:${Math.max(0,100*v/Math.max(1,total))}%;background:${c}"></span>`).join('')}</div><div class="trace-legend">${pieces.map(([label,value,color])=>`<span><i style="background:${color}"></i>${label} <strong>${number.format(value)}</strong></span>`).join('')}</div><p class="trace-caveat">*Sold is estimated from received units less current stock, returns and damage.</p></article><article class="trace-card trace-history"><h3>History</h3>${trace.history.map(item=>`<div class="trace-event"><time>${esc(reportDate(item.date))}</time><div><strong>${esc(item.event)}</strong><p>${esc(item.detail)}</p></div><b>${number.format(item.quantity)}</b></div>`).join('')}</article>`;
}
function destroyCharts(){state.charts.forEach(chart=>chart.destroy());state.charts.clear();}
function semanticChartColors(rows,tone){if(tone==='category')return rows.map((_,i)=>['#5b4cf0','#0d9488','#f59e0b','#0284c7','#94a3b8'][i%5]);if(tone==='status'||tone==='expiry')return rows.map(r=>tones[statusColors[r.label]||(/expired|critical/i.test(r.label)?'red':/soon|days/i.test(r.label)?'amber':'green')]);const base=tones[tone]||tones.blue;return rows.map((_,i)=>i===0?base:`${base}${Math.max(55,210-i*28).toString(16).padStart(2,'0')}`);}
function reportDate(value,options={month:'short',day:'numeric'}){
    const match=String(value??'').match(/^(\d{4})-(\d{2})-(\d{2})/);if(!match)return String(value??'');
    return new Intl.DateTimeFormat('en-PH',options).format(new Date(Number(match[1]),Number(match[2])-1,Number(match[3])));
}
function orderStatusSentence(rows){
    const clause={'Waiting for payment':n=>`${n} ${n===1?'order is':'orders are'} still waiting for payment`,'Payment in progress':n=>`${n} ${n===1?'order is':'orders are'} in the middle of payment`,'Paid':n=>`${n} ${n===1?'order is':'orders are'} already paid`,'Waiting for a cashier':n=>`${n} ${n===1?'order is':'orders are'} waiting for a cashier`,'Not sent yet':n=>`${n} ${n===1?'order has':'orders have'} not been sent yet`,'Cancelled':n=>`${n} ${n===1?'order was':'orders were'} cancelled`,'Rejected':n=>`${n} ${n===1?'order was':'orders were'} rejected`};
    const parts=rows.map(row=>{const n=Number(row.value);return clause[row.label]?clause[row.label](n):`${number.format(n)} ${row.label}`;});
    if(parts.length<2)return `${parts[0]||'No orders in this period'}.`;
    return `${parts.slice(0,-1).join(', ')}, and ${parts.at(-1)}.`;
}
function mergedProductRows(charts){
    const quantity=charts.find(chart=>chart.id==='top-qty'),revenue=charts.find(chart=>chart.id==='top-revenue');
    if(!quantity||!revenue)return [];
    const rows=new Map();
    (quantity.rows||[]).forEach(row=>{const value=Number(row.value)||0;if(value>0)rows.set(row.label,{label:row.label,quantity:value,revenue:0});});
    (revenue.rows||[]).forEach(row=>{const value=Number(row.value)||0;if(value<=0)return;const entry=rows.get(row.label)||{label:row.label,quantity:0,revenue:0};entry.revenue=value;rows.set(row.label,entry);});
    return [...rows.values()].filter(row=>row.quantity>0||row.revenue>0);
}
function drawProductReportChart(){
    const card=qs('#productModeChart')?.closest('.chart-card');
    if(!card)return;
    const mode=state.productMode==='revenue'?'revenue':'quantity',currency=mode==='revenue';
    const rows=[...(state.productRows||[])].sort((a,b)=>b[mode]-a[mode]).filter(row=>row[mode]>0).slice(0,20);
    card.querySelectorAll('[data-product-mode]').forEach(button=>{const active=button.dataset.productMode===mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    const context=card.querySelector('.product-chart-context');if(context)context.textContent=currency?'Ranked by net sales':'Ranked by units sold';
    const summary=card.querySelector('.chart-summary');
    const existing=state.charts.get('product-mode');if(existing){existing.destroy();state.charts.delete('product-mode');}
    if(!rows.length){if(summary)summary.textContent='No completed sales for the selected period.';return;}
    const top=rows[0],topQty=Number(top.quantity)||0;
    if(summary)summary.textContent=`${top.label} is highest at ${currency?money.format(top.revenue):`${number.format(topQty)} ${topQty===1?'unit':'units'}`}.`;
    const canvas=qs('#productModeChart'),box=canvas.closest('.chart-box');
    if(box)box.style.height=`${Math.min(280,Math.max(180,rows.length*46))}px`;
    const instance=new Chart(canvas,{type:'bar',data:{labels:rows.map(row=>row.label),datasets:[{label:currency?'Net sales':'Units sold',data:rows.map(row=>row[mode]),backgroundColor:currency?tones.sales:tones.inventory,borderRadius:7,borderSkipped:false,maxBarThickness:28}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:{duration:160},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>{const row=rows[ctx.dataIndex],qty=Number(row.quantity)||0;return currency?`${money.format(row.revenue)} net sales · ${number.format(qty)} ${qty===1?'unit':'units'} sold`:`${number.format(qty)} ${qty===1?'unit':'units'} sold · ${money.format(row.revenue)} net sales`;}}}},scales:{x:{beginAtZero:true,grid:{color:'rgba(148,163,184,.16)'},ticks:{callback:value=>currency?money.format(value):number.format(value)}},y:{grid:{display:false},ticks:{autoSkip:false}}}}});
    state.charts.set('product-mode',instance);
}
function renderCharts(charts){
    // ✅ FIX: guard against undefined/non-array
    charts = Array.isArray(charts) ? charts : [];
    const productRows=state.category==='products'?mergedProductRows(charts):[];
    const combineProducts=productRows.length>0;
    state.productRows=combineProducts?productRows:[];
    const source=combineProducts?charts.filter(chart=>chart.id!=='top-qty'&&chart.id!=='top-revenue'):charts;
    const useful=source.filter(chart=>chart && (chart.id==='my-order-status'||(chart.rows||[]).some(r=>Number(r.value)>0||Number(r.paid)>0||Number(r.outstanding)>0)||chart.href)).filter(chart=>!(chart.id==='daily-net-sales'&&(chart.rows||[]).filter(r=>Number(r.value)>0).length<2));
    const paired=state.category==='sales'&&qs('[name="report_view"]')?.value==='Sales Summary'&&useful.length>1;
    const target=qs('#reportCharts');target.classList.toggle('single-chart',useful.length===1);target.classList.toggle('chart-pair',paired);
    target.innerHTML=useful.map((chart,index)=>{const positive=(chart.rows||[]).filter(r=>Number(r.value)>0),singleDayTotal=chart.id==='daily-net-sales'&&chart.type==='line'&&positive.length<2,heading=`<div class="panel-heading"><div class="chart-heading-copy"><h2>${esc(singleDayTotal?'Net sales':chart.title)}</h2>${chart.caption?`<p class="chart-caption">${esc(chart.caption)}</p>`:''}</div>${chart.href?`<a class="report-link" href="${esc(chart.href)}">${esc(chart.link_label||'View Report')} <i class="fa-solid fa-arrow-right"></i></a>`:''}</div>`;if(chart.type==='stacked-bar'){const max=Math.max(1,...chart.rows.map(r=>Number(r.paid||0)+Number(r.outstanding||0)));return `<article class="chart-card">${heading}<div class="payment-chart-legend"><span><i></i>Paid</span><span><i></i>Outstanding</span></div><div class="payment-chart">${chart.rows.map(r=>`<div class="payment-chart-row"><span>${esc(r.label)}</span><div class="payment-chart-track"><i style="width:${100*Number(r.paid||0)/max}%"></i><b style="width:${100*Number(r.outstanding||0)/max}%"></b></div></div>`).join('')}</div></article>`;}if(positive.length===0)return `<article class="chart-card compact-insight tone-${esc(chart.tone||'gray')}">${heading}<div class="compact-empty">No records in the selected period.</div></article>`;const onePointLine=chart.type==='line'&&!(state.category==='inventory'&&qs('[name="report_view"]')?.value==='Inventory Overview')&&positive.length<2;if(onePointLine||(positive.length===1&&chart.type!=='bar'&&chart.type!=='line')||(chart.type==='doughnut'&&positive.length<2)){const row=positive[0],currency=/sales|cost|revenue|payable|value/i.test(chart.title),when=reportDate(row.raw_date||row.label,{month:'long',day:'numeric',year:'numeric'}),amount=format(row.value,currency?'currency':'number'),dated=onePointLine&&(row.raw_date||/^\d{4}-\d{2}-\d{2}/.test(String(row.label))),singleSummary=onePointLine?'':(chart.overview_trend?`Net sales were ${money.format(row.value)} on ${when}, from ${number.format(row.secondary)} completed transaction${Number(row.secondary)===1?'':'s'}.`:'Only one meaningful category is available, so a compact summary replaces the chart.');return `<article class="chart-card compact-insight tone-${esc(chart.tone||'gray')}">${heading}<div class="ranked-insight"><span>${esc(dated?when:row.label)}</span><strong>${esc(amount)}</strong></div>${singleSummary?`<p class="chart-summary">${esc(singleSummary)}</p>`:''}</article>`;}const chartHeight=paired?200:chart.id==='my-sold-products'?Math.max(320,(chart.rows||[]).length*32):chart.id==='my-order-status'?Math.max(168,positive.length*72):chart.orientation==='horizontal'?Math.max(270,positive.length*36):270;return `<article class="chart-card">${heading}<div class="chart-box" style="height:${chartHeight}px"><canvas id="reportChart${index}" role="img" aria-label="${esc(chart.title)}"></canvas></div><p class="chart-summary" id="chartSummary${index}"></p></article>`;}).join('');
    useful.forEach((chart,index)=>{
        const positive=(chart.rows||[]).filter(row=>Number(row.value)>0);
        if(chart.type==='stacked-bar'||positive.length===0||!qs(`#reportChart${index}`)||typeof Chart==='undefined')return;
        const inventoryOverview=state.category==='inventory'&&qs('[name="report_view"]').value==='Inventory Overview',singleDay=chart.type==='line'&&!inventoryOverview&&positive.length<2,line=(chart.type==='line'||inventoryOverview)&&!singleDay,plotRows=chart.id==='my-sold-products'?(chart.rows||[]):(line?chart.rows:positive),values=plotRows.map(row=>Number(row.value)),rawLabels=plotRows.map(row=>row.label),labels=chart.overview_trend||singleDay?rawLabels.map(label=>reportDate(label,{month:'short',day:'numeric'})):rawLabels,currency=/sales|cost|revenue|payable|value/i.test(chart.title),horizontal=!inventoryOverview&&chart.orientation==='horizontal',chartType=line?'line':singleDay?'bar':chart.type;
        const colors=semanticChartColors(plotRows,chart.tone),seriesColor=inventoryOverview?tones.inventory:(colors[0]||tones.sales),lineFill=context=>{const area=context.chart.chartArea,fillTop=inventoryOverview?'rgba(15,159,146,.24)':'rgba(91,76,240,.25)',fillBottom=inventoryOverview?'rgba(15,159,146,.015)':'rgba(91,76,240,.015)';if(!area)return inventoryOverview?'rgba(15,159,146,.14)':'rgba(91,76,240,.14)';const gradient=context.chart.ctx.createLinearGradient(0,area.top,0,area.bottom);gradient.addColorStop(0,fillTop);gradient.addColorStop(1,fillBottom);return gradient;},dataset={label:chart.title,data:values,backgroundColor:line?lineFill:colors,borderColor:line?seriesColor:colors,borderWidth:line?3:1,borderRadius:chartType==='bar'?5:0,borderSkipped:false,maxBarThickness:chartType==='bar'?34:undefined};
        if(line)Object.assign(dataset,{fill:true,tension:.35,pointRadius:4,pointHoverRadius:7,pointBackgroundColor:'#fff',pointBorderColor:seriesColor,pointBorderWidth:2,pointHoverBackgroundColor:seriesColor,pointHoverBorderColor:'#fff',pointHoverBorderWidth:2});
        const chartHeight=!paired&&chart.type==='line'&&plotRows.length>12?Math.max(320,Math.min(520,plotRows.length*24)):undefined;
        const canvasCard=qs(`#reportChart${index}`)?.closest('.chart-box');if(canvasCard&&chartHeight)canvasCard.style.height=`${chartHeight}px`;
        const instance=new Chart(qs(`#reportChart${index}`),{type:chartType,data:{labels,datasets:[dataset]},options:{responsive:true,maintainAspectRatio:false,indexAxis:horizontal?'y':'x',interaction:line?{mode:'index',intersect:false}:undefined,animation:{duration:350},plugins:{legend:{display:chartType==='doughnut',position:'bottom'},tooltip:{backgroundColor:line?'#201a52':undefined,titleColor:line?'#ddd6fe':undefined,bodyColor:line?'#fff':undefined,padding:line?12:undefined,cornerRadius:line?10:undefined,displayColors:line?false:undefined,callbacks:{title:items=>chart.overview_trend?reportDate(plotRows[items[0].dataIndex].raw_date||rawLabels[items[0].dataIndex],{month:'long',day:'numeric',year:'numeric'}):items[0].label,label:ctx=>{const row=plotRows[ctx.dataIndex],metric=/net sales/i.test(chart.title)?'Net sales':chart.title,lines=[`${metric}: ${currency?money.format(ctx.raw):number.format(ctx.raw)}`];if(row.secondary!==undefined)lines.push(`Completed transactions: ${number.format(row.secondary)}`);return lines;}}}},scales:chartType==='doughnut'?{}:{x:{beginAtZero:horizontal,grid:{display:line?false:!horizontal},ticks:{autoSkip:line,callback:function(value){if(horizontal)return currency?money.format(value):number.format(value);return this.getLabelForValue(value);}}},y:{beginAtZero:line||!horizontal,grid:{display:line},ticks:{callback:function(value){if(line)return currency?money.format(value):number.format(value);if(!horizontal&&currency)return money.format(value);return this.getLabelForValue(value);}}}}}});
        if(chart.id==='my-order-status'&&instance.options.scales?.x){instance.options.scales.x.ticks.precision=0;instance.options.scales.x.ticks.stepSize=1;instance.options.plugins.tooltip.callbacks.label=ctx=>`${number.format(ctx.raw)} ${Number(ctx.raw)===1?'order':'orders'}`;instance.update();}
        if(chart.id==='my-sold-products'&&instance.options.scales?.y){instance.options.scales.y.ticks.autoSkip=false;instance.update();}
        state.charts.set(chart.id,instance);const max=Math.max(...positive.map(row=>Number(row.value))),maxIndex=positive.findIndex(row=>Number(row.value)===max),label=positive[maxIndex].label;qs(`#chartSummary${index}`).textContent=chart.id==='my-sold-products'?`${label} has the highest sales at ${money.format(max)}. This list shows ${number.format((chart.rows||[]).length)} products.`:chart.id==='my-order-status'?orderStatusSentence(positive):chart.overview_trend?`Highest net sales were ${money.format(max)} on ${reportDate(positive[maxIndex].raw_date||label,{month:'long',day:'numeric',year:'numeric'})}.`:`${label} is highest at ${currency?money.format(max):number.format(max)}.`;
    });
    if(!combineProducts)return;
    const mode=state.productMode==='revenue'?'revenue':'quantity';
    target.insertAdjacentHTML('afterbegin',`<article class="chart-card"><div class="panel-heading"><div class="chart-heading-copy"><h2>Products</h2></div><div class="mini-toggle" role="group" aria-label="Rank products"><button class="${mode==='quantity'?'active':''}" type="button" data-product-mode="quantity" aria-pressed="${mode==='quantity'}">By Quantity</button><button class="${mode==='revenue'?'active':''}" type="button" data-product-mode="revenue" aria-pressed="${mode==='revenue'}">By Revenue</button></div></div><p class="product-chart-context">${mode==='revenue'?'Ranked by net sales':'Ranked by units sold'}</p><div class="chart-box" style="height:200px"><canvas id="productModeChart" role="img" aria-label="Products ranked by the selected measure"></canvas></div><p class="chart-summary"></p></article>`);
    target.classList.toggle('single-chart',useful.length===0);target.classList.remove('chart-pair');
    drawProductReportChart();
}
function renderInsights(data){
    const cards=[];
    (data.insights||[]).forEach(insight=>cards.push(`<article class="insight-card tone-${esc(insight.tone||'gray')}"><h2>${esc(insight.title)}</h2>${(insight.rows||[]).map(r=>`<div class="insight-row"><span>${esc(r.label)} <small>${r.secondary?`${number.format(r.secondary)} transaction${Number(r.secondary)===1?'':'s'}`:''}</small></span><strong>${esc(format(r.value,insight.format))}</strong></div>`).join('')}</article>`));
    (data.actions||[]).forEach(action=>cards.push(`<article class="insight-card tone-${esc(action.tone||'blue')}"><h2>${esc(action.title)}</h2><p class="insight-action-description">${esc(action.description)}</p><a class="insight-action-link" href="${esc(action.href)}">${esc(action.label)} <i class="fa-solid fa-arrow-right"></i></a></article>`));
    if(data.attention)cards.push(`<article class="attention-card"><h2><i class="fa-solid fa-triangle-exclamation"></i> Pharmacy Attention</h2>${data.attention.map(x=>{const label=Number(x.value)===1?x.singular:x.plural;return `<a class="attention-row tone-${esc(x.tone)}" href="${esc(x.href)}"><i class="attention-icon fa-solid ${esc(x.icon)}"></i><span>${esc(label)}</span><strong>${esc(format(x.value,x.format))}</strong><i class="fa-solid fa-arrow-right"></i></a>`;}).join('')}</article>`);
    qs('#reportInsights').innerHTML=cards.join('');
    tuckInsightsUnderCompactChart();
}
function tuckInsightsUnderCompactChart(){
    const charts=qs('#reportCharts'),insights=qs('#reportInsights');
    if(!charts||!insights)return;
    const compact=charts.querySelector(':scope > .chart-card.compact-insight');
    if(!(charts.classList.contains('chart-pair')&&compact&&insights.children.length)){insights.hidden=!insights.children.length;return;}
    const stack=document.createElement('div');
    stack.className='chart-stack';
    compact.replaceWith(stack);
    stack.append(compact,...insights.children);
    insights.hidden=true;
}
function overviewPanelHeading(title,href,label){return `<div class="panel-heading"><h2>${esc(title)}</h2><a class="report-link" href="${esc(href)}">${esc(label)} <i class="fa-solid fa-arrow-right"></i></a></div>`;}
function overviewChart(id,type,labels,values,colors,{horizontal=false,label='Records',tooltip,valueFormatter,showValueLabels=false}={}){
    if(typeof Chart==='undefined')return;
    const canvas=qs(`#${id}`);if(!canvas)return;
    const doughnut=type==='doughnut',valueLabelPlugin=showValueLabels?{id:`${id}-value-labels`,afterDatasetsDraw(instance){const ctx=instance.ctx,meta=instance.getDatasetMeta(0),dataset=instance.data.datasets[0];ctx.save();ctx.font='600 10px Inter, sans-serif';ctx.textBaseline='middle';meta.data.forEach((bar,index)=>{const text=valueFormatter?valueFormatter(dataset.data[index]):number.format(dataset.data[index]),width=ctx.measureText(text).width,inside=bar.x+width+10>instance.chartArea.right;ctx.fillStyle=inside?'#fff':'#334155';ctx.textAlign=inside?'right':'left';ctx.fillText(text,inside?Math.max(instance.chartArea.left+width+4,bar.x-6):bar.x+6,bar.y);});ctx.restore();}}:null,chart=new Chart(canvas,{type,data:{labels,datasets:[{label,data:values,backgroundColor:colors,borderColor:doughnut?'#fff':colors,borderWidth:doughnut?2:1,borderRadius:doughnut?0:5,borderSkipped:false,maxBarThickness:30}]},plugins:valueLabelPlugin?[valueLabelPlugin]:[],options:{responsive:true,maintainAspectRatio:false,indexAxis:horizontal?'y':'x',animation:{duration:180},plugins:{legend:{display:doughnut,position:'bottom',labels:{usePointStyle:true,boxWidth:8,padding:12,font:{size:10}}},tooltip:{callbacks:{label:ctx=>tooltip?tooltip(ctx):`${ctx.label}: ${number.format(ctx.raw)}`}}},scales:doughnut?{}:{x:{beginAtZero:true,grid:{display:!horizontal},ticks:{precision:0,font:{size:10},callback:value=>valueFormatter?valueFormatter(value):horizontal?number.format(value):value}},y:{beginAtZero:!horizontal,grid:{display:false},ticks:{autoSkip:false,font:{size:10}}}}}});
    state.charts.set(`overview-${id}`,chart);
}
function overviewStaffPanel(title,rows,tone,href,id){
    const content=rows.length?`<div class="overview-chart-box staff-overview-chart" style="height:${Math.max(150,rows.length*38)}px"><canvas id="${id}" role="img" aria-label="${esc(`${title}: completed transactions by staff member`)}"></canvas></div><p class="visual-summary">Bars compare completed transaction counts. Hover for net sales.</p>`:'<div class="compact-empty">No completed staff activity in the selected period.</div>';
    return `<article class="overview-panel tone-${tone}">${overviewPanelHeading(title,href,'View Staff Performance')}${content}</article>`;
}
function renderOverview(previews){
    const target=qs('#overviewGrid');
    // ✅ FIX: guard against undefined / array / missing keys
    const hasPreviews = previews
        && typeof previews === 'object'
        && !Array.isArray(previews)
        && previews.top_products
        && previews.inventory_health
        && previews.expiry_risk
        && previews.purchase_status
        && previews.staff_activity;
    target.hidden = !hasPreviews;
    if(!hasPreviews){target.innerHTML='';return;}
    state.charts.forEach((chart,key)=>{if(String(key).startsWith('overview-')){chart.destroy();state.charts.delete(key);}});
    const products=previews.top_products.rows||[],inventory=previews.inventory_health,expiry=previews.expiry_risk,purchase=previews.purchase_status,staff=previews.staff_activity;
    const productMode=state.productMode,productField=productMode==='revenue'?'net_revenue':'quantity_sold',sortedProducts=[...products].sort((a,b)=>Number(b[productField])-Number(a[productField])).slice(0,5);
    const healthRows=[['Healthy',inventory.healthy,'green'],['Low Stock',inventory.low_stock,'amber'],['Out of Stock',inventory.out_of_stock,'red'],['Data Issues',inventory.data_issues,'dark-red']];
    const expiryTones={'Expired':'red','Within 7 days':'red-orange','Within 30 days':'amber','Within 60 days':'yellow'},expiryRows=(expiry.chart_rows||[]).map(row=>({...row,tone:expiryTones[row.label]||'amber'}));
    const poTones={'Draft':'gray','Pending':'amber','Arrived':'teal','Delivered':'green','Cancelled':'red'},statusRows=Object.entries(purchase.statuses).map(([label,value])=>({label,value,tone:poTones[label]||'gray'})),poRows=statusRows.filter(row=>Number(row.value)>0);
    target.innerHTML=`
      <article class="overview-panel tone-sales">${overviewPanelHeading('Top 5 Products',previews.top_products.href,'View all products')}<div class="mini-toggle" role="group" aria-label="Rank products"><button class="${productMode==='quantity'?'active':''}" type="button" data-product-mode="quantity" aria-pressed="${productMode==='quantity'}">By Quantity</button><button class="${productMode==='revenue'?'active':''}" type="button" data-product-mode="revenue" aria-pressed="${productMode==='revenue'}">By Revenue</button></div><p class="product-chart-context">Ranked by ${productMode==='revenue'?'net sales':'units sold'} · ${esc(reportDate(state.data?.system?.date_range?.start||state.defaultStart,{month:'short',day:'numeric'}))} – ${esc(reportDate(state.data?.system?.date_range?.end||state.defaultEnd,{month:'short',day:'numeric',year:'numeric'}))}</p>${sortedProducts.length?'<div class="overview-chart-box product-overview-chart"><canvas id="overviewTopProducts" role="img" aria-label="Top products ranked by selected measure, with values shown on each bar"></canvas></div>':'<div class="compact-empty">No completed sales for the selected period, so there are no products to rank.</div>'}<p class="visual-summary">Bar-end labels show ${productMode==='revenue'?'net sales in pesos':'units sold'}; hover for both measures.</p></article>
      <article class="overview-panel tone-inventory">${overviewPanelHeading('Inventory Health',inventory.href,'View Inventory Report')}<p class="current-label"><i class="fa-solid fa-circle"></i> Current active stock</p>${Number(inventory.total_products)>0?'<div class="overview-chart-box doughnut-overview-chart"><canvas id="overviewInventoryHealth" role="img" aria-label="Active products by stock health"></canvas></div>':'<div class="compact-empty">No active products to chart.</div>'}<p class="visual-summary">${number.format(inventory.healthy)} of ${number.format(inventory.total_products)} active products are healthy.</p><div class="mini-metrics"><div><span>Total On Hand</span><strong>${number.format(inventory.total_on_hand)}</strong></div><div><span>Shelf Stock</span><strong>${number.format(inventory.shelf_stock)}</strong></div><div><span>Storage Stock</span><strong>${number.format(inventory.storage_stock)}</strong></div></div></article>
      <article class="overview-panel tone-expiry">${overviewPanelHeading('Expiry Risk',expiry.href,'View Expiry Report')}<p class="current-label"><i class="fa-solid fa-circle"></i> Current active batches</p>${expiry.expired+expiry.within_30===0?`<div class="compact-empty success"><i class="fa-solid fa-circle-check"></i><strong>No immediate expiry risk.</strong><span>No active batches expire within the next 30 days.</span></div>`:'<div class="overview-chart-box expiry-overview-chart"><canvas id="overviewExpiryRisk" role="img" aria-label="Active batches by expiry window"></canvas></div><p class="visual-summary">Bars compare active batch counts in each window; hover for units and cost at risk.</p>'}<div class="mini-metrics two"><div><span>Quantity at Risk</span><strong>${number.format(expiry.quantity_at_risk)}</strong></div><div><span>Cost at Risk</span><strong>${money.format(expiry.cost_at_risk)}</strong></div></div></article>
      <article class="overview-panel tone-purchases">${overviewPanelHeading('Purchase Order Status',purchase.href,'View Purchase Report')}${poRows.length?'<div class="overview-chart-box doughnut-overview-chart"><canvas id="overviewPurchaseStatus" role="img" aria-label="Purchase orders by status"></canvas></div><p class="visual-summary">Doughnut segments show purchase orders in each status.</p>':'<div class="compact-empty">No purchase orders in the selected period.</div>'}<div class="mini-metrics"><div><span>Awaiting Inspection</span><strong>${number.format(purchase.arrived_awaiting_inspection)}</strong></div><div><span>Open Commitments</span><strong>${money.format(purchase.open_commitments)}</strong></div><div><span>Outstanding Payables</span><strong>${money.format(purchase.outstanding_payable)}</strong></div></div></article>
      ${overviewStaffPanel('Cashier Activity',staff.cashiers||[],'indigo',staff.href,'overviewCashierActivity')}
      ${overviewStaffPanel('Sales Clerk Activity',staff.sales_clerks||[],'teal',staff.href,'overviewClerkActivity')}
      <div class="staff-supporting-metrics"><div><span>Active cashiers</span><strong>${number.format(staff.active_cashiers)}</strong></div><div><span>Active sales clerks</span><strong>${number.format(staff.active_sales_clerks)}</strong></div><div><span>Completed transactions</span><strong>${number.format(staff.completed_transactions)}</strong></div><div><span>Average transaction</span><strong>${money.format(staff.average_transaction)}</strong></div></div>`;
    const palette={green:'#16a34a',amber:'#d97706',red:'#dc2626','dark-red':'#991b1b','red-orange':'#ea580c',yellow:'#ca8a04',gray:'#64748b',teal:'#0d9488',indigo:'#4f46e5',purple:'#5b4cf0',blue:'#2563eb'};
    if(sortedProducts.length){const labels=sortedProducts.map(row=>`${row.brand_name?`${row.brand_name} — `:''}${row.product_name}`),values=sortedProducts.map(row=>Number(row[productField])||0);overviewChart('overviewTopProducts','bar',labels,values,labels.map(()=>palette.blue),{horizontal:true,label:productMode==='revenue'?'Net sales':'Units sold',valueFormatter:productMode==='revenue'?value=>money.format(value):value=>`${number.format(value)} ${Number(value)===1?'unit':'units'}`,showValueLabels:true,tooltip:ctx=>{const row=sortedProducts[ctx.dataIndex];const qty=Number(row.quantity_sold)||0;return `${productMode==='revenue'?money.format(row.net_revenue):`${number.format(qty)} ${qty===1?'unit':'units'} sold`} · ${money.format(row.net_revenue)} net sales`;}});}
    overviewChart('overviewInventoryHealth','doughnut',healthRows.map(row=>row[0]),healthRows.map(row=>Number(row[1])||0),healthRows.map(row=>palette[row[2]]),{label:'Products',tooltip:ctx=>`${ctx.label}: ${number.format(ctx.raw)} products`});
    if(expiry.expired+expiry.within_30>0){const riskRows=expiryRows.filter(row=>Number(row.batch_count)>0);overviewChart('overviewExpiryRisk','bar',riskRows.map(row=>row.label),riskRows.map(row=>Number(row.batch_count)||0),riskRows.map(row=>palette[row.tone]),{horizontal:true,label:'Active batches',tooltip:ctx=>{const row=riskRows[ctx.dataIndex];return `${row.label}: ${number.format(row.batch_count)} batches · ${number.format(row.quantity_at_risk)} units · ${money.format(row.cost_at_risk)}`;}});}
    if(poRows.length)overviewChart('overviewPurchaseStatus','doughnut',poRows.map(row=>row.label),poRows.map(row=>Number(row.value)||0),poRows.map(row=>palette[row.tone]),{label:'Purchase orders',tooltip:ctx=>`${ctx.label}: ${number.format(ctx.raw)} purchase orders`});
    const renderStaff=(id,rows,color)=>{if(!rows.length)return;const labels=rows.map(row=>row.name),values=rows.map(row=>Number(row.transactions)||0);overviewChart(id,'bar',labels,values,labels.map(()=>color),{horizontal:true,label:'Completed transactions',tooltip:ctx=>{const row=rows[ctx.dataIndex];return `${number.format(row.transactions)} transactions · ${money.format(row.net_sales)} net sales`;}});};
    renderStaff('overviewCashierActivity',staff.cashiers||[],'#4f46e5');renderStaff('overviewClerkActivity',staff.sales_clerks||[],'#0d9488');
}
function refreshOverviewProductChart(){
    const previews=state.data?.overview_previews,panel=qs('#overviewGrid .overview-panel.tone-sales');
    if(!previews?.top_products||!panel)return;
    const productMode=state.productMode,productField=productMode==='revenue'?'net_revenue':'quantity_sold',products=previews.top_products.rows||[],sortedProducts=[...products].sort((a,b)=>Number(b[productField])-Number(a[productField])).slice(0,5);
    panel.querySelectorAll('[data-product-mode]').forEach(button=>{const active=button.dataset.productMode===productMode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    const context=panel.querySelector('.product-chart-context');if(context)context.textContent=`Ranked by ${productMode==='revenue'?'net sales':'units sold'} · ${reportDate(state.data?.system?.date_range?.start||state.defaultStart,{month:'short',day:'numeric'})} – ${reportDate(state.data?.system?.date_range?.end||state.defaultEnd,{month:'short',day:'numeric',year:'numeric'})}`;
    const summary=panel.querySelector('.visual-summary');if(summary)summary.textContent=`Bar-end labels show ${productMode==='revenue'?'net sales in pesos':'units sold'}; hover for both measures.`;
    const existing=state.charts.get('overview-overviewTopProducts');if(existing){existing.destroy();state.charts.delete('overview-overviewTopProducts');}
    if(!sortedProducts.length)return;
    const labels=sortedProducts.map(row=>`${row.brand_name?`${row.brand_name} — `:''}${row.product_name}`),values=sortedProducts.map(row=>Number(row[productField])||0);
    overviewChart('overviewTopProducts','bar',labels,values,labels.map(()=>'#2563eb'),{horizontal:true,label:productMode==='revenue'?'Net sales':'Units sold',valueFormatter:productMode==='revenue'?value=>money.format(value):value=>`${number.format(value)} ${Number(value)===1?'unit':'units'}`,showValueLabels:true,tooltip:ctx=>{const row=sortedProducts[ctx.dataIndex];const qty=Number(row.quantity_sold)||0;return `${productMode==='revenue'?money.format(row.net_revenue):`${number.format(qty)} ${qty===1?'unit':'units'} sold`} · ${money.format(row.net_revenue)} net sales`;}});
    if(state.data)renderOverviewPrint(state.data);
}
function overviewPrintTable(headers,rows,numericColumns=[]){
    const head=headers.map((label,index)=>`<th class="${numericColumns.includes(index)?'numeric':''}">${esc(label)}</th>`).join('');
    const body=rows.length?rows.map(row=>`<tr>${row.map((value,index)=>`<td class="${numericColumns.includes(index)?'numeric':''}">${esc(value)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}" class="overview-print-empty">No records for the selected period.</td></tr>`;
    return `<table class="overview-print-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
function renderOverviewPrint(data){
    const target=qs('#overviewPrintLayout'),previews=data.overview_previews||{},inventory=previews.inventory_health,expiry=previews.expiry_risk,purchase=previews.purchase_status,staff=previews.staff_activity,products=previews.top_products;
    const hasFullOverview=Boolean(inventory&&expiry&&purchase&&staff&&products);
    const summary=(data.summary||[]).map(card=>`<div class="overview-print-metric"><span>${esc(card.title)}</span><strong>${esc(format(card.value,card.format))}</strong></div>`).join('');
    const sections=[`<section class="overview-print-section"><h3>Executive Summary</h3><div class="overview-print-metric-grid">${summary||'<p class="overview-print-empty">No summary data is available.</p>'}</div></section>`];
    if(hasFullOverview){
        const sortedProducts=[...(products.rows||[])].sort((a,b)=>Number(b[state.productMode==='revenue'?'net_revenue':'quantity_sold'])-Number(a[state.productMode==='revenue'?'net_revenue':'quantity_sold']));
        const productRows=sortedProducts.slice(0,5).map((row,index)=>[String(index+1),`${row.brand_name?`${row.brand_name} — `:''}${row.product_name}${row.specification?`\n${row.specification}`:''}`,number.format(row.quantity_sold),money.format(Number(row.net_revenue)||0)]);
        sections.push(`<section class="overview-print-section"><h3>Pharmacy Attention</h3>${overviewPrintTable(['No.','Indicator','Count / Amount'],(data.attention||[]).map((row,index)=>[String(index+1),Number(row.value)===1?row.singular:row.plural,format(row.value,row.format)]),[2])}</section>`);
        sections.push(`<section class="overview-print-section"><h3>Top 5 Products</h3>${overviewPrintTable(['Rank','Product Name / Description','Quantity Sold','Sales Amount'],productRows,[0,2,3])}</section>`);
        sections.push(`<section class="overview-print-section"><h3>Inventory Health</h3>${overviewPrintTable(['Metric','Products'],[['Active products',number.format(inventory.total_products)],['Healthy',number.format(inventory.healthy)],['Low stock',number.format(inventory.low_stock)],['Out of stock',number.format(inventory.out_of_stock)],['Data issues',number.format(inventory.data_issues)]],[1])}${overviewPrintTable(['Stock Quantity','Units'],[['Total on hand',number.format(inventory.total_on_hand)],['Shelf stock',number.format(inventory.shelf_stock)],['Storage stock',number.format(inventory.storage_stock)]],[1])}</section>`);
        const expiryRows=(expiry.chart_rows||[]).map(row=>[row.label,number.format(row.batch_count),number.format(row.quantity_at_risk),money.format(Number(row.cost_at_risk)||0)]);
        sections.push(`<section class="overview-print-section"><h3>Expiry Risk</h3><p class="overview-print-caption">${number.format(expiry.active_batches||0)} active batches with recorded expiry dates and remaining stock</p>${overviewPrintTable(['Expiry Window','Batches','Quantity at Risk','Cost at Risk'],expiryRows,[1,2,3])}${overviewPrintTable(['Summary','Value'],[['Total quantity at risk (within 60 days)',number.format(expiry.quantity_at_risk)],['Total cost at risk (within 60 days)',money.format(Number(expiry.cost_at_risk)||0)]],[1])}</section>`);
        const statusNames=['Draft','Pending','Arrived','Delivered','Cancelled'];
        sections.push(`<section class="overview-print-section"><h3>Purchase Order Status</h3>${overviewPrintTable(['Status','Purchase Orders'],statusNames.map(name=>[name,number.format(purchase.statuses?.[name]||0)]),[1])}${overviewPrintTable(['Purchase Metric','Value'],[['Awaiting inspection',number.format(purchase.arrived_awaiting_inspection)],['Open commitments',money.format(Number(purchase.open_commitments)||0)],['Outstanding payables',money.format(Number(purchase.outstanding_payable)||0)]],[1])}</section>`);
        const activityRows=rows=>(rows||[]).map((row,index)=>[String(index+1),row.name,number.format(row.transactions),money.format(Number(row.net_sales)||0)]);
        sections.push(`<section class="overview-print-section"><h3>Cashier Activity</h3>${overviewPrintTable(['Rank','Cashier Name','Completed Transactions','Net Sales'],activityRows(staff.cashiers),[0,2,3])}</section>`);
        sections.push(`<section class="overview-print-section"><h3>Sales Clerk Activity</h3>${overviewPrintTable(['Rank','Sales Clerk Name','Completed Transactions','Net Sales'],activityRows(staff.sales_clerks),[0,2,3])}</section>`);
        sections.push(`<section class="overview-print-section"><h3>Activity Summary</h3>${overviewPrintTable(['Active Cashiers','Active Sales Clerks','Completed Transactions','Average Transaction'],[[number.format(staff.active_cashiers),number.format(staff.active_sales_clerks),number.format(staff.completed_transactions),money.format(Number(staff.average_transaction)||0)]],[0,1,2,3])}</section>`);
    }
    const notes=(data.notes||[]).map(note=>`<li>${esc(note)}</li>`).join('');
    target.innerHTML=`${sections.join('')}${notes?`<section class="overview-print-notes"><h3>Notes</h3><ul>${notes}</ul></section>`:''}`;
}
function renderTableInsights(insights,data={}){
    const tables=insights.map(insight=>`<article class="table-insight-card ${insight.title==='Monthly sales totals'?'monthly-sales-totals':''}"><h2>${esc(insight.title)}</h2><div class="report-table-scroll"><table class="report-table compact"><thead><tr>${Object.values(insight.columns).map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${insight.rows.map(row=>`<tr>${Object.keys(insight.columns).map(key=>`<td class="${(insight.currency_columns||[]).includes(key)||(insight.numeric_columns||[]).includes(key)?'numeric':''}">${esc((insight.currency_columns||[]).includes(key)?money.format(Number(row[key]||0)):row[key]??'—')}</td>`).join('')}</tr>`).join('')||`<tr class="empty-table"><td colspan="${Object.keys(insight.columns).length}">No completed supplier deliveries in this period.</td></tr>`}</tbody></table></div></article>`).join('');
    let reconciliation='';
    if(state.category==='sales'&&qs('[name="report_view"]').value==='Sales Summary'&&data.reconciliation?.rows?.length){
        reconciliation=`<article class="table-insight-card sales-reconciliation"><h2>Sales reconciliation</h2><p>Gross-to-net totals for the selected dates and account scope.</p><div class="report-table-scroll"><table class="report-table compact"><thead><tr><th>Sales component</th><th class="numeric">Amount</th></tr></thead><tbody>${data.reconciliation.rows.map(row=>`<tr><td>${esc(row.label)}</td><td class="numeric">${esc(money.format(Number(row.value)||0))}</td></tr>`).join('')}</tbody></table></div><small>${esc(data.reconciliation.note||'')}</small></article>`;
    }
    qs('#tableInsights').innerHTML=reconciliation+tables;
}
function statusClass(value){return statusColors[String(value)]||(/paid|healthy|complete|accept/i.test(value)?'green':/cancel|expired|out of stock|data issue/i.test(value)?'red':/pending|partial|low|damage|slow/i.test(value)?'amber':'gray');}
function cellHtml(key,value,row){
    if(value===null||value==='')return key==='tracked_gross_profit'?'<span class="cell-text" title="Sales from this purchase order do not have complete batch-cost tracking yet.">Not tracked</span>':'—';
    const text=String(value);if(/status|performance/i.test(key))return `<span class="status-chip ${statusClass(text)}">${esc(text)}</span>`;
    if(state.data.currency_columns.includes(key))return esc(money.format(Number(value||0)));if(key==='sell_through_rate'||key==='share')return `${esc(text)}%`;if(/date|activity/.test(key))return esc(text.replace(' ',' · '));
    return `<span class="cell-text" title="${esc(text)}">${esc(text)}</span>`;
}
function renderTable(data){
    let columns=Object.entries(data.columns||{});if(!data.access.management&&data.access.cashier)columns=columns.filter(([key])=>key!=='sales_clerk');
    qs('#reportTableHead').closest('table').classList.toggle('product-sales-detail-table',state.category==='sales'&&qs('[name="report_view"]').value==='Product Sales');
    qs('#tableTitle').textContent='Detailed records';qs('#reportTableHead').innerHTML=`<tr>${columns.map(([key,label])=>`<th class="${data.numeric_columns.includes(key)||data.currency_columns.includes(key)?'numeric':''}"><button class="sort-button" type="button" data-sort="${esc(key)}">${esc(label)}${state.sort===key?` <i class="fa-solid fa-sort-${state.direction==='asc'?'up':'down'}"></i>`:''}</button></th>`).join('')}</tr>`;
    qs('#reportTableBody').innerHTML=data.rows?.length?data.rows.map((row,index)=>`<tr class="report-detail-row" data-row-index="${index}" tabindex="0" aria-label="Open details for ${esc(String(row[columns[0]?.[0]]??'record'))}">${columns.map(([key])=>`<td class="${data.numeric_columns.includes(key)||data.currency_columns.includes(key)?'numeric':''}">${cellHtml(key,row[key],row)}</td>`).join('')}</tr>`).join(''):`<tr class="empty-table"><td colspan="${columns.length}">${esc(data.empty_message||'No records were found for the selected filters.')}</td></tr>`;
    window.PharmacySearchHighlight?.apply(qs('#reportTableBody'),qs('#reportSearch')?.value||'');
    const p=data.pagination;qs('#resultCount').textContent=`${number.format(p.total)} result${p.total===1?'':'s'}`;qs('#pageSummary').textContent=`Showing ${p.total?number.format((p.page-1)*p.page_size+1):0}–${number.format(Math.min(p.page*p.page_size,p.total))} of ${number.format(p.total)} · Page ${p.page} of ${p.pages}`;qs('#previousPage').disabled=p.page<=1;qs('#nextPage').disabled=p.page>=p.pages;
}
function openRecordDetail(index){
    const data=state.data,rows=data?.rows||[],row=rows[index];if(!row)return;state.detailIndex=index;
    const columns=Object.entries(data.columns||{}),first=columns[0]?.[0],title=String(row.product_name||row.po_number||row.supplier_name||row.staff_name||row[first]||'Record details');
    qs('#reportDetailView').textContent=qs('[name="report_view"]').value;
    qs('#reportDetailTitle').textContent=title;
    qs('#reportDetailFields').innerHTML=columns.map(([key,label])=>`<div><dt>${esc(label)}</dt><dd>${cellHtml(key,row[key],row)}</dd></div>`).join('');
    qs('#reportDetailPosition').textContent=`${index+1} of ${rows.length} on this page`;
    qs('#reportDetailPrevious').disabled=index<=0;qs('#reportDetailNext').disabled=index>=rows.length-1;
    const dialog=qs('#reportDetail');if(!dialog.open)dialog.showModal();
}
function renderNotes(notes){qs('#formulaNotes').innerHTML=notes.length?`<details class="formula-notes-details"><summary><i class="fa-solid fa-circle-info"></i> Calculation notes</summary><ul>${notes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`:'';}
function displayValue(key,value){
    const select=qs(`[name="${key}"]`);if(select?.selectedOptions[0])return select.selectedOptions[0].textContent;
    if(key==='expiry_days')return `Within ${value} days`;return value;
}
function renderFilterChips(){
    syncMirrors();const chips=[];new FormData(qs('#reportFilters')).forEach((value,key)=>{if(!value||key.startsWith('secondary_')||key==='report_view')return;if((key==='start_date'&&value===state.defaultStart)||(key==='end_date'&&value===state.defaultEnd)||(key==='expiry_days'&&value==='30'&&state.category!=='expiry')||(key==='group_by'&&value==='day'))return;chips.push({key,label:`${filterLabels[key]||key}: ${displayValue(key,value)}`});});
    qs('#filterChips').innerHTML=chips.map(x=>`<button type="button" class="filter-chip" data-remove-filter="${esc(x.key)}">${esc(x.label)} <i class="fa-solid fa-xmark"></i></button>`).join('');qs('#activeFilterCount').textContent=chips.length?`${chips.length} active filter${chips.length===1?'':'s'}`:'Default period';
}
function resetFilters(){const form=qs('#reportFilters');form.reset();qsa('#reportFilters select').forEach(x=>{x.dataset.initial='';});const today=reportToday(state.data?.system?.timezone);form.elements.start_date.value=shiftDate(today,-29);form.elements.end_date.value=today;form.elements.expiry_days.value='30';qs('#reportSearch').value='';state.page=1;state.sort='';state.direction='desc';state.explicitDates=false;state.period='30';populateBaseOptions(state.options);updateVisibleFilters();loadReport();}
function setFilterExpanded(expanded){const form=qs('#reportFilters'),button=qs('#filterCollapse');form.classList.toggle('is-collapsed',!expanded);button.setAttribute('aria-expanded',String(expanded));button.querySelector('span').textContent=expanded?'Hide filters':'Show filters';button.querySelector('i').className=`fa-solid fa-chevron-${expanded?'up':'down'}`;}
function clearCategoryFilters(){
    const form=qs('#reportFilters');['category_id','secondary_category_id','type_id','product_id','brand','supplier_id','secondary_supplier_id','cashier_id','sales_clerk_id','payment_method','po_status','stock_status','rx_filter','payment_state'].forEach(key=>{if(form.elements[key])form.elements[key].value='';});
    form.elements.expiry_days.value='30';state.sort='';state.direction='desc';syncDependentOptions(true);
}
function csvCell(value){let text=String(value??'');if(/^[=+\-@]/.test(text))text=`'${text}`;return `"${text.replace(/"/g,'""')}"`;}
async function exportCsv(){
    if(!state.data)return;const button=qs('#reportExport');button.disabled=true;
    try{const first=state.data,exportParams=buildParams({page:1,page_size:100}),firstResponse=await fetch(`${API_BASE_URL}/reports/get_report.php?${exportParams}`,{credentials:'include',cache:'no-store'}),firstPayload=await firstResponse.json();if(!firstResponse.ok)throw new Error(firstPayload.message||'Export failed.');const rows=[...firstPayload.rows];for(let page=2;page<=firstPayload.pagination.pages;page++){const response=await fetch(`${API_BASE_URL}/reports/get_report.php?${buildParams({page,page_size:100})}`,{credentials:'include',cache:'no-store'});const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Export failed.');rows.push(...payload.rows);}
        const columns=Object.entries(first.columns),applied=qsa('.filter-chip').map(x=>x.textContent.trim().replace(/\s*×$/,'')).join('; ')||'Default period';
        const compare=first.comparison_mode==='none'?'Off':first.comparison_period?`${first.comparison_period.start} to ${first.comparison_period.end}`:'Not available for this report';
        const lines=[[first.system.pharmacy_name],[`${qs('[name=report_view]').value} Report`],[`Date range: ${first.system.date_range.start} to ${first.system.date_range.end}`],[`Comparison period: ${compare}`],[`Account scope: ${reportAccountScope(first)}`],[`Applied filters: ${applied}`],[`Generated: ${first.system.generated_at}`],[`Generated by: ${first.system.generated_by}`],[],['Summary'],...first.summary.map(x=>[x.title,format(x.value,x.format)]),[],columns.map(([,label])=>label)];
        if(first.reconciliation?.rows?.length){lines.push([],['Sales reconciliation'],['Sales component','Amount'],...first.reconciliation.rows.map(row=>[row.label,money.format(Number(row.value)||0)]),[first.reconciliation.note||'']);}
        for(const insight of first.table_insights||[]){lines.push([], [insight.title], Object.values(insight.columns), ...insight.rows.map(row=>Object.keys(insight.columns).map(key=>(insight.currency_columns||[]).includes(key)?money.format(Number(row[key])||0):row[key]??'')));}
        rows.forEach(row=>lines.push(columns.map(([key])=>row[key]??'')));const blob=new Blob(['\uFEFF'+lines.map(line=>line.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`${state.category}-report-${first.system.date_range.end}.csv`;document.body.appendChild(link);link.click();const url=link.href;link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){alert(error.message);}finally{button.disabled=false;}
}
function renderFinder(){
    const query=qs('#reportFinderInput').value.trim().toLowerCase(),available=state.data?.access?.management?['sales','inventory','expiry','purchases','supplier','staff']:(state.data?.access?.available_categories||['sales','inventory','expiry','purchases','supplier','staff']);
    const matches=available.flatMap(category=>(reportViews[category]||[]).map(view=>({category,view}))).filter(item=>!query||`${item.view} ${categories[item.category]} ${viewDescriptions[item.view]||''}`.toLowerCase().includes(query));
    qs('#reportFinderResults').innerHTML=matches.map(item=>`<button type="button" data-find-category="${item.category}" data-find-view="${esc(item.view)}"><i class="fa-solid ${categoryIcons[item.category]||'fa-chart-simple'}"></i><span><strong>${esc(item.view)}</strong><small>${esc(viewDescriptions[item.view]||'Analyze current pharmacy records.')}</small></span><em>${esc(categories[item.category])}</em></button>`).join('')||'<p class="finder-empty">No matching reports</p>';
}
function openFinder(){const dialog=qs('#reportFinder');qs('#reportFinderInput').value='';renderFinder();dialog.showModal();qs('#reportFinderInput').focus();}

qs('#reportTabs').addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(!button)return;clearCategoryFilters();state.category=button.dataset.category;if(state.category==='expiry')qs('[name="expiry_days"]').value='365';state.page=1;renderTabs(state.data?.access?.available_categories);updateVisibleFilters();loadReport();});
qs('#reportFinderButton').addEventListener('click',openFinder);qs('#reportFinderClose').addEventListener('click',()=>qs('#reportFinder').close());qs('#reportFinderInput').addEventListener('input',renderFinder);
qs('#reportFinderResults').addEventListener('click',event=>{const button=event.target.closest('[data-find-view]');if(!button)return;qs('#reportFinder').close();clearCategoryFilters();state.category=button.dataset.findCategory;if(state.category==='expiry')qs('[name="expiry_days"]').value='365';state.page=1;renderTabs(state.data?.access?.available_categories);updateVisibleFilters();qs('[name="report_view"]').value=button.dataset.findView;qs('[name="report_view"]').dispatchEvent(new Event('change'));});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(!qs('#reportFinder').open)openFinder();}if(event.key==='Escape'&&qs('#reportDetail').open)qs('#reportDetail').close();});
qs('#reportTableBody').addEventListener('click',event=>{const row=event.target.closest('[data-row-index]');if(row)openRecordDetail(Number(row.dataset.rowIndex));});
qs('#reportTableBody').addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key))return;const row=event.target.closest('[data-row-index]');if(row){event.preventDefault();openRecordDetail(Number(row.dataset.rowIndex));}});
qs('#reportDetailClose').addEventListener('click',()=>qs('#reportDetail').close());qs('#reportDetail').addEventListener('click',event=>{if(event.target===event.currentTarget)event.currentTarget.close();});qs('#reportDetailPrevious').addEventListener('click',()=>openRecordDetail(state.detailIndex-1));qs('#reportDetailNext').addEventListener('click',()=>openRecordDetail(state.detailIndex+1));
qs('#reportFilters').addEventListener('submit',event=>{event.preventDefault();state.page=1;state.explicitDates=true;state.period='custom';loadReport();});
qs('#clearFilters').addEventListener('click',resetFilters);qs('#reportRefresh').addEventListener('click',loadReport);qs('#reportPrint').addEventListener('click',()=>{setPrintTimestamp();window.print();});qs('#reportPdf').addEventListener('click',()=>{setPrintTimestamp();window.print();});window.addEventListener('beforeprint',setPrintTimestamp);qs('#reportExport').addEventListener('click',exportCsv);
qs('#reportViewMenu').addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(!button)return;qs('#reportSearch').value='';qs('[name="report_view"]').value=button.dataset.view;setFilterExpanded(['expiry','purchases'].includes(state.category)?false:button.dataset.view!=='Sales Summary');qs('[name="report_view"]').dispatchEvent(new Event('change'));renderViewMenu();});
qs('.report-heading-actions').addEventListener('change',event=>{if(event.target.id!=='quickReportView')return;qs('#reportSearch').value='';qs('[name="report_view"]').value=event.target.value;setFilterExpanded(['expiry','purchases'].includes(state.category)?false:event.target.value!=='Sales Summary');qs('[name="report_view"]').dispatchEvent(new Event('change'));});
qs('.report-presets').addEventListener('click',event=>{const button=event.target.closest('[data-period]');if(!button)return;const period=button.dataset.period;if(period==='custom'){setPeriodSelection('custom');state.explicitDates=true;updateVisibleFilters();return;}const today=reportToday(state.data?.system?.timezone),end=period==='yesterday'?shiftDate(today,-1):today,start=period==='month'?`${today.slice(0,7)}-01`:period==='7'?shiftDate(end,-6):period==='30'?shiftDate(end,-29):end;qs('[name="start_date"]').value=start;qs('[name="end_date"]').value=end;setPeriodSelection(period);state.explicitDates=true;state.page=1;updateVisibleFilters();loadReport();});
qs('#reportComparisonMode').addEventListener('change',event=>{state.comparisonMode=event.target.value;state.page=1;loadReport();});
qs('#reportMonthShortcut').addEventListener('change',event=>{const value=event.target.value;if(!/^\d{4}-\d{2}$/.test(value))return;const [year,month]=value.split('-').map(Number),lastDay=new Date(year,month,0).getDate();qs('[name="start_date"]').value=`${year}-${String(month).padStart(2,'0')}-01`;qs('[name="end_date"]').value=`${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;state.period='custom';state.explicitDates=true;state.page=1;setPeriodSelection('custom');updateVisibleFilters();loadReport();});
qsa('#reportFilters [name="start_date"],#reportFilters [name="end_date"]').forEach(input=>input.addEventListener('change',()=>{qs('#reportMonthShortcut').value='';}));
qs('#previousPage').addEventListener('click',()=>loadTablePage(state.page-1));qs('#nextPage').addEventListener('click',()=>loadTablePage(state.page+1));
qs('#reportSearch').addEventListener('input',()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>{state.page=1;loadReport();},350);});
qs('#reportTableHead').addEventListener('click',event=>{const button=event.target.closest('[data-sort]');if(!button)return;state.direction=state.sort===button.dataset.sort&&state.direction==='asc'?'desc':'asc';state.sort=button.dataset.sort;state.page=1;loadReport();});
qs('#moreFiltersToggle').addEventListener('click',event=>{const panel=qs('#secondaryFilters'),expanded=panel.hidden;panel.hidden=!expanded;event.currentTarget.setAttribute('aria-expanded',String(expanded));event.currentTarget.lastElementChild.className=`fa-solid fa-chevron-${expanded?'up':'down'}`;});
qs('#filterChips').addEventListener('click',event=>{const chip=event.target.closest('[data-remove-filter]');if(!chip)return;const field=qs(`[name="${chip.dataset.removeFilter}"]`);if(field){field.value='';if(field.name==='category_id')qs('[name=secondary_category_id]').value='';if(field.name==='supplier_id')qs('[name=secondary_supplier_id]').value='';syncDependentOptions(true);}state.page=1;loadReport();});
qs('#overviewGrid').addEventListener('click',event=>{const button=event.target.closest('[data-product-mode]');if(!button||!state.data?.overview_previews||button.dataset.productMode===state.productMode)return;state.productMode=button.dataset.productMode;refreshOverviewProductChart();});
qs('#reportCharts').addEventListener('click',event=>{const button=event.target.closest('[data-product-mode]');if(!button||!state.productRows?.length||button.dataset.productMode===state.productMode)return;state.productMode=button.dataset.productMode;drawProductReportChart();});
['category_id','secondary_category_id','type_id','brand'].forEach(name=>qs(`[name="${name}"]`).addEventListener('change',event=>{if(name.includes('category')){qs('[name=category_id]').value=event.target.value;qs('[name=secondary_category_id]').value=event.target.value;}syncDependentOptions(true);}));
qs('[name="product_id"]').addEventListener('change',event=>{const product=state.options?.products.find(x=>x.id===event.target.value);if(!product)return;qs('[name=category_id]').value=qs('[name=secondary_category_id]').value=product.category_id;qs('[name=type_id]').value=product.type_id;qs('[name=brand]').value=product.brand;syncDependentOptions(false);qs('[name=product_id]').value=product.id;});
['supplier_id','secondary_supplier_id'].forEach(name=>qs(`[name="${name}"]`).addEventListener('change',event=>{qs('[name=supplier_id]').value=qs('[name=secondary_supplier_id]').value=event.target.value;}));
qs('[name="report_view"]').addEventListener('change',event=>{const form=qs('#reportFilters'),map={'Product Sales':'product','Category Sales':'category','Cashier Sales':'cashier','Staff Sales':state.data?.access?.cashier?'cashier':'sales_clerk','Payment and Discount':'payment_method'};if(state.category==='sales')form.elements.group_by.value=map[event.target.value]||'day';if(event.target.value==='Expiring Products')form.elements.expiry_days.value='365';if(state.category==='purchases'){if(event.target.value==='PR / PO Summary'&&form.elements.payment_state.value==='Partially Paid')form.elements.payment_state.value='partial';else if(event.target.value==='Invoice & Payment'&&form.elements.payment_state.value==='partial')form.elements.payment_state.value='Partially Paid';if(event.target.value==='Invoice & Payment')form.elements.po_status.value='';if(event.target.value==='Purchase History')form.elements.payment_state.value='';}state.page=1;updateVisibleFilters();renderViewMenu();loadReport();});
qs('.report-filter-card').addEventListener('change',event=>{const id=event.target.id;if(id==='quickExpiry')qs('[name="expiry_days"]').value=event.target.value;else if(id==='quickSupplier')qs('[name="supplier_id"]').value=qs('[name="secondary_supplier_id"]').value=event.target.value;else if(id==='quickCategory')qs('[name="category_id"]').value=qs('[name="secondary_category_id"]').value=event.target.value;else if(id==='quickStock')qs('[name="stock_status"]').value=event.target.value;else if(id==='quickCashier')qs('[name="cashier_id"]').value=event.target.value;else if(id==='quickStatus')qs('[name="po_status"]').value=event.target.value;else if(id==='quickPayment')qs('[name="payment_state"]').value=event.target.value;else return;state.page=1;loadReport();});
qs('.report-filter-card').addEventListener('click',event=>{if(event.target.closest('#quickTrace'))loadReport();});
qs('#filterCollapse').addEventListener('click',()=>setFilterExpanded(qs('#reportFilters').classList.contains('is-collapsed')));
window.addEventListener('storage',event=>{if(event.key==='pharmacy-user-list-updated'&&state.data?.access?.management&&['sales','staff'].includes(state.category))loadReport();});

createLiveSync({interval:30000,events:['payment-completed'],sync:()=>loadReport({silent:true})});

await verifySession();initialQuery();renderTabs();updateVisibleFilters();if(state.category==='overview')clearCategoryFilters();
if(matchMedia('(max-width:991.98px)').matches){qs('#reportFilters').classList.add('is-collapsed');qs('#filterCollapse').setAttribute('aria-expanded','false');qs('#filterCollapse span').textContent='Show filters';qs('#filterCollapse i').className='fa-solid fa-chevron-down';}
await loadReport();
