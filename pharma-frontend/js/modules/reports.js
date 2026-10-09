import API_BASE_URL from '../config/config.js';
import { ensurePageTabSession as verifySession } from './auth_guard.js?v=21';

const categories={sales:'Sales',inventory:'Inventory',expiry:'Expiry & Batch',purchases:'Purchasing',supplier:'Supplier & Receiving',staff:'Cashier & Audit',products:'Product Performance',overview:'Overview'};
const categoryIcons={sales:'fa-chart-line',inventory:'fa-cubes-stacked',expiry:'fa-calendar-clock',purchases:'fa-cart-shopping',supplier:'fa-truck',staff:'fa-shield-halved',products:'fa-box',overview:'fa-gauge'};
const reportViews={
    overview:['Management Overview'],
    sales:['Sales Summary','Product Sales','Category Sales','Cashier Sales'],
    inventory:['Current Inventory','Stock Movement','Low / Out of Stock','Fast / Slow Moving','Inventory Valuation'],
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
const statusColors={Healthy:'green',Completed:'green',Delivered:'green',Paid:'green','Fully Paid':'green',Accepted:'green','Low Stock':'amber','Expiring Soon':'amber',Draft:'gray',Pending:'amber','Partially Paid':'amber','Not Yet Payable':'gray','Out of Stock':'red',Expired:'red',Critical:'red',Cancelled:'red','Negative Stock — Data Issue':'red','High Stock / Low Sales':'red','Slow Moving':'amber','No Sales':'gray','Fast Moving':'green',Steady:'teal',Arrived:'indigo',Watch:'amber'};
const money=new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}),number=new Intl.NumberFormat('en-PH');
const qs=s=>document.querySelector(s),qsa=s=>[...document.querySelectorAll(s)];
const state={category:'sales',page:1,data:null,controller:null,charts:new Map(),options:null,searchTimer:null,defaultStart:'',defaultEnd:'',sort:'',direction:'desc',explicitDates:false,needsInitialFilterReload:false,productMode:'quantity',initialPeriodSet:false,period:'30',roleConfigured:false};
const viewDescriptions={
    'Sales Summary':'Gross to net sales, transactions and basket size.',
    'Product Sales':'Best-selling products, with Rx and OTC classification.',
    'Category Sales':'Quantity, sales and share by product category.',
    'Cashier Sales':'Sales and cancellations attributed to each cashier.',
    'Current Inventory':'Storage, Shelf and On Hand by product.',
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
    if(state.category==='expiry'&&!query.has('expiry_days'))qs('[name="expiry_days"]').value='365';
    state.explicitDates=query.has('start_date')||query.has('end_date');
    if(state.explicitDates)state.period='custom';
    const form=qs('#reportFilters'),staticFields=new Set(['start_date','end_date','expiry_days','rx_filter']);
    ['report_view','group_by','start_date','end_date','category_id','type_id','product_id','brand','supplier_id','cashier_id','sales_clerk_id','payment_method','po_status','stock_status','rx_filter','expiry_days','payment_state'].forEach(key=>{if(query.has(key)){const field=form.elements[key];if(field){if(staticFields.has(key)||field.type==='hidden')field.value=query.get(key);else{field.dataset.initial=query.get(key);state.needsInitialFilterReload=true;}}}});
}
function reportToday(timezone){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone||'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));return `${value.year}-${value.month}-${value.day}`;
}
function shiftDate(date,days){const [year,month,day]=date.split('-').map(Number),value=new Date(Date.UTC(year,month-1,day+days));return value.toISOString().slice(0,10);}
function renderTabs(available=Object.keys(categories)){
    if(state.data?.access.management)available=['sales','inventory','expiry','purchases','supplier','staff'];
    else if(!state.data)available=['sales','inventory','expiry','purchases','supplier','staff'];
    qs('#reportTabs').innerHTML=available.map(key=>`<button class="report-tab ${key===state.category?'active':''}" type="button" data-category="${key}" aria-current="${key===state.category?'page':'false'}"><i class="fa-solid ${categoryIcons[key]||'fa-chart-simple'}" aria-hidden="true"></i><span>${esc(categories[key])}</span><b class="report-tab-count">${(reportViews[key]||[]).length}</b></button>`).join('');
}
function renderViewMenu(){
    const selected=qs('[name="report_view"]').value,[heading,description]=groupDescriptions[state.category]||groupDescriptions.sales;
    qs('#reportGroupTitle').textContent=heading;qs('#reportGroupDescription').textContent=description;
    qs('#reportViewMenu').innerHTML=(reportViews[state.category]||[]).map(view=>`<button class="report-view-item ${view===selected?'active':''}" type="button" data-view="${esc(view)}"><strong>${esc(view)}</strong><small>${esc(viewDescriptions[view]||'Analyze current pharmacy records.')}</small></button>`).join('');
    qs('#reportViewTitle').textContent=selected;qs('#reportViewDescription').textContent=viewDescriptions[selected]||description;
    qs('#reportViewIcon').innerHTML=`<i class="fa-solid ${categoryIcons[state.category]||'fa-chart-simple'}"></i>`;
    qs('.report-search').hidden=!['Product Sales','Cashier Sales','Current Inventory','Stock Movement','Low / Out of Stock','Fast / Slow Moving','Inventory Valuation','Expiring Products','Expired / Wastage','Batch Traceability','PR / PO Summary','Purchase History','Invoice & Payment'].includes(selected);
    qs('#reportSearch').placeholder=selected==='Batch Traceability'?'Search batch number or product':selected==='PR / PO Summary'?'Search PO or PR number':state.category==='purchases'?'Search PO, PR or supplier':'Search product or batch';
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
    const inventoryView=view.value;
    const salesFields={
        'Sales Summary':['view','dates'],
        'Product Sales':['view','dates','primary-category','rx'],
        'Category Sales':['view','dates'],
        'Cashier Sales':['view','dates','cashier']
    };
    const inventoryFields={
        'Current Inventory':['view','primary-category','primary-stock','product','secondary-supplier'],
        'Stock Movement':['view','dates','primary-category','product'],
        'Low / Out of Stock':['view','primary-category','product'],
        'Fast / Slow Moving':['view','dates','primary-category','product','brand'],
        'Inventory Valuation':['view','primary-category','product','secondary-supplier']
    };
    const visible=new Set(state.category==='inventory'&&inventoryFields[inventoryView]?inventoryFields[inventoryView]:state.category==='sales'&&salesFields[view.value]?salesFields[view.value]:visibility[state.category]||[]);
    qsa('[data-filter]').forEach(el=>el.hidden=!visible.has(el.dataset.filter));
    qs('#moreFiltersToggle').hidden=state.category==='overview';if(state.category==='overview')qs('#secondaryFilters').hidden=true;
    const group=qs('[name="group_by"]'),options=groupOptions[state.category]||[];group.innerHTML=options.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');const initial=group.dataset.initial;if(initial&&options.some(x=>x[0]===initial))group.value=initial;delete group.dataset.initial;
    syncDependentOptions(false);renderViewMenu();
}
function buildParams(overrides={}){
    syncMirrors();const params=new URLSearchParams({category:state.category,layout:'reference',page:String(state.page),page_size:'10'});
    new FormData(qs('#reportFilters')).forEach((value,key)=>{if(!key.startsWith('secondary_')&&String(value)!=='')params.set(key,value);});
    const search=qs('#reportSearch').value.trim();if(search)params.set('search',search);if(state.sort){params.set('sort',state.sort);params.set('direction',state.direction);}
    Object.entries(overrides).forEach(([k,v])=>params.set(k,String(v)));return params;
}
async function loadReport(){
    state.controller?.abort();state.controller=new AbortController();destroyCharts();qs('#reportContent').classList.add('d-none');qs('#reportError').classList.add('d-none');qs('#reportLoading').classList.remove('d-none');
    try{const response=await fetch(`${API_BASE_URL}/reports/get_report.php?${buildParams()}`,{credentials:'include',cache:'no-store',signal:state.controller.signal});const data=await response.json();if(response.status===403&&data.access?.available_categories?.length){state.category=data.access.available_categories[0];state.page=1;updateVisibleFilters();return loadReport();}if(!response.ok||data.status!=='success')throw new Error(data.message||'Unable to generate this report.');
        if(!state.initialPeriodSet&&!state.explicitDates){state.initialPeriodSet=true;const today=reportToday(data.system.timezone);qs('[name="start_date"]').value=shiftDate(today,-29);qs('[name="end_date"]').value=today;return loadReport();}
        state.initialPeriodSet=true;state.data=data;if(data.access?.supervisor){categories.overview='Inventory Overview';categories.purchases='Purchase Requests';reportViews.overview=['Inventory Overview'];reportViews.purchases=['Purchase Request Summary'];visibility.purchases=['view','dates'];}
        if(!state.roleConfigured){state.roleConfigured=true;if(!data.access.management){reportViews.sales=['Sales Summary','Product Sales','Staff Sales','Payment and Discount'];reportViews.inventory=['Inventory Summary','Stock Health'];reportViews.staff=['Staff Performance Summary'];}updateVisibleFilters();}
        if(!state.options){populateBaseOptions(data.filters||{});if(state.needsInitialFilterReload){state.needsInitialFilterReload=false;return loadReport();}}if(!data.access.available_categories.includes(state.category)){state.category=data.access.available_categories[0];updateVisibleFilters();return loadReport();}renderTabs(data.access.available_categories);renderReport(data);syncUrl();}
    catch(error){if(error.name==='AbortError')return;qs('#reportLoading').classList.add('d-none');qs('#reportError').classList.remove('d-none');qs('#reportError').textContent=error.message;}
}
function syncUrl(){
    const params=buildParams();if(!state.explicitDates&&params.get('start_date')===state.defaultStart)params.delete('start_date');if(!state.explicitDates&&params.get('end_date')===state.defaultEnd)params.delete('end_date');
    if(params.get('expiry_days')==='30'&&state.category!=='expiry')params.delete('expiry_days');if(params.get('group_by')==='day')params.delete('group_by');params.delete('report_view');params.delete('page_size');if(params.get('page')==='1')params.delete('page');
    params.set('category',state.category);if(qs('[name="report_view"]').value!==reportViews[state.category]?.[0])params.set('report_view',qs('[name="report_view"]').value);params.delete('layout');history.replaceState(null,'',`${location.pathname}?${params}`);
}
function salesComparisonBadge(card){
    const comparison=card.comparison;
    if(!comparison)return `<small class="summary-change is-neutral">${Number(card.value)>0?'New this period':'No prior data'}</small>`;
    const change=Number(comparison.percent),direction=change>0?'up':change<0?'down':'flat';
    const arrow=change>0?'↗':change<0?'↘':'→';
    return `<small class="summary-change is-${direction}" aria-label="${Math.abs(change).toFixed(1)} percent ${direction} from the previous period">${arrow} ${Math.abs(change).toFixed(1)}%</small>`;
}
function metricSparkline(rows,label='Daily net sales trend'){
    const values=(rows||[]).map(row=>Number(row.value)||0);
    if(!values.length)return '';
    const max=Math.max(1,...values),width=220,height=68;
    const points=values.map((value,index)=>[values.length===1?width/2:index*width/(values.length-1),height-6-(value/max)*(height-16)]);
    const line=points.map(([x,y],index)=>`${index?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const area=`${line} L${points.at(-1)[0].toFixed(1)} ${height} L${points[0][0].toFixed(1)} ${height} Z`;
    return `<svg class="summary-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><path class="sparkline-fill" d="${area}"></path><path class="sparkline-line" d="${line}"></path></svg>`;
}
function renderSummaryCards(data){
    const target=qs('#summaryCards'),view=qs('[name="report_view"]').value,
        salesSummary=state.category==='sales'&&view==='Sales Summary'&&data.comparison_period,
        purchaseSummary=state.category==='purchases'&&view==='PR / PO Summary'&&data.purchase_order_count!==undefined;
    target.classList.toggle('sales-summary',Boolean(salesSummary));
    target.classList.toggle('purchase-summary',Boolean(purchaseSummary));
    if(purchaseSummary){
        const sparkline=metricSparkline(data.purchase_trend,'Purchase order totals by day');
        target.innerHTML=(data.summary||[]).map((card,index)=>`<article class="summary-card purchase-metric ${index===0?'purchase-metric-primary':''}"><span>${esc(card.title)}</span><strong>${esc(format(card.value,card.format))}</strong>${index===0?`<small class="purchase-order-count">${number.format(data.purchase_order_count)} purchase order${data.purchase_order_count===1?'':'s'}</small>${sparkline}`:''}</article>`).join('');
        return;
    }
    if(!salesSummary){target.innerHTML=(data.summary||[]).map(card=>`<article class="summary-card tone-${esc(card.tone||'purple')}" ${card.tooltip?`title="${esc(card.tooltip)}"`:''}><div class="summary-icon"><i class="fa-solid ${esc(card.icon||'fa-chart-simple')}"></i></div><span>${esc(card.title)}</span><strong>${esc(format(card.value,card.format))}</strong></article>`).join('');return;}
    const period=data.comparison_period,previousRange=`${reportDate(period.start,{month:'short',day:'numeric'})} – ${reportDate(period.end,{month:'short',day:'numeric',year:'numeric'})}`;
    const sparkline=metricSparkline(data.charts?.find(chart=>chart.id==='daily-net-sales')?.rows);
    target.innerHTML=(data.summary||[]).map((card,index)=>`<article class="summary-card sales-metric ${index===0?'sales-metric-primary':''}" ${card.tooltip?`title="${esc(card.tooltip)}"`:''}><span>${esc(card.title)}</span><strong>${esc(format(card.value,card.format))}</strong><div class="summary-comparison">${salesComparisonBadge(card)}${index===0?`<span>vs ${esc(previousRange)}</span>`:''}</div>${index===0?`<p class="summary-explanation">Completed sales after discounts and refunds over ${period.days} day${period.days===1?'':'s'}</p>${sparkline}`:''}</article>`).join('');
}
function renderReport(data){
    qs('#reportLoading').classList.add('d-none');qs('#reportContent').classList.remove('d-none');
    qs('#summaryCards').hidden=false;qs('#reportCharts').hidden=false;
    qs('#reportContent').classList.toggle('is-overview',state.category==='overview');
    state.defaultStart=data.system.date_range.start;state.defaultEnd=data.system.date_range.end;const form=qs('#reportFilters');if(!form.elements.start_date.value)form.elements.start_date.value=state.defaultStart;if(!form.elements.end_date.value)form.elements.end_date.value=state.defaultEnd;
    const generated=new Date(data.system.generated_at);qs('#reportGenerated').textContent=`Generated ${generated.toLocaleString('en-PH',{timeZone:data.system.timezone,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} · ${data.system.timezone} · ${data.system.generated_by}`;
    qs('#reportToday').textContent=generated.toLocaleDateString('en-PH',{timeZone:data.system.timezone,weekday:'short',year:'numeric',month:'short',day:'numeric'});
    const rangeStart=data.system.date_range.start,rangeEnd=data.system.date_range.end;
    qs('#reportDateRange').textContent=`${reportDate(rangeStart,{month:'short',day:'numeric',...(rangeStart.slice(0,4)===rangeEnd.slice(0,4)?{}:{year:'numeric'})})} – ${reportDate(rangeEnd,{month:'short',day:'numeric',year:'numeric'})}`;
    qs('#reportPeriodLabel').textContent=state.category==='inventory'&&qs('[name="report_view"]').value!=='Stock Movement'&&qs('[name="report_view"]').value!=='Fast / Slow Moving'?'Live inventory snapshot':state.period==='custom'?'Custom date range':state.period==='month'?'This month':state.period==='today'?'Today':state.period==='yesterday'?'Yesterday':`Last ${state.period} days`;
    qs('.report-presets').querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.period===state.period));
    renderViewMenu();renderReferenceControls();
    renderSummaryCards(data);
    renderCharts(data.charts||[]);renderRanking(data);renderInsights(data);
    if(state.category==='purchases'&&form.elements.report_view.value==='PR / PO Summary'){
        qs('#reportCharts .chart-card h2')?.insertAdjacentHTML('afterend',`<small class="chart-date-caption">${esc(qs('#reportDateRange').textContent)}</small>`);
    }
    if(state.category==='overview'){const attention=qs('#reportInsights .attention-card');if(attention){qs('#reportCharts').appendChild(attention);qs('#reportCharts').classList.remove('single-chart');}}
    renderOverview(data.overview_previews);renderTableInsights(data.table_insights||[]);renderTable(data);qs('.report-table-card').hidden=state.category==='overview'||form.elements.report_view.value==='Batch Traceability';renderNotes(data.notes||[]);renderFilterChips();
    if(form.elements.report_view.value==='Batch Traceability')renderBatchTrace(data.trace);
}
function renderRanking(data){
    const target=qs('#reportRanking'),view=qs('[name="report_view"]').value,chart=(data.charts||[]).find(item=>Array.isArray(item.rows)&&item.rows.length);
    if(state.category==='purchases'&&view==='PR / PO Summary'){
        const orders=data.top_purchase_orders||[],max=Math.max(1,...orders.map(order=>Number(order.value)||0));
        target.hidden=false;
        target.innerHTML=`<div class="ranking-heading"><h2>Top 5 by total</h2><p>Within the current filters</p></div><div class="ranking-list">${orders.length?orders.map(order=>`<div class="ranking-item"><div><span>${esc(order.label)}</span><strong>${esc(money.format(Number(order.value)||0))}</strong></div><div class="ranking-track"><span style="width:${100*(Number(order.value)||0)/max}%"></span></div></div>`).join(''):'<p class="ranking-empty">No purchase orders in this period.</p>'}</div>`;
        return;
    }
    if(!chart||view==='Batch Traceability'||state.category==='overview'){target.hidden=true;target.innerHTML='';return;}
    const rows=chart.rows.map(row=>({...row,rankValue:Number(row.value??(Number(row.paid||0)+Number(row.outstanding||0)))})).filter(row=>row.rankValue>0).sort((a,b)=>b.rankValue-a.rankValue).slice(0,5);
    if(!rows.length){target.hidden=true;target.innerHTML='';return;}
    const currency=/sales|cost|value|revenue|paid|payable|purchase/i.test(chart.title),metric=currency?value=>money.format(value):value=>number.format(value);
    target.hidden=false;target.innerHTML=`<div class="ranking-heading"><div><h2>Top ${rows.length} by ${esc(chart.title.toLowerCase())}</h2><p>Within the current filters</p></div></div><div class="ranking-chart-box" style="height:${Math.max(160,rows.length*44)}px"><canvas id="reportRankingChart" role="img" aria-label="Top ${rows.length} by ${esc(chart.title)}"></canvas></div>`;
    if(typeof Chart==='undefined')return;
    const values=rows.map(row=>row.rankValue),labels=rows.map(row=>row.label),colors=semanticChartColors(rows,chart.tone);
    const instance=new Chart(qs('#reportRankingChart'),{type:'bar',data:{labels,datasets:[{label:chart.title,data:values,backgroundColor:colors,borderRadius:7,borderSkipped:false,maxBarThickness:28}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:{duration:160},plugins:{legend:{display:false},tooltip:{callbacks:{label:context=>metric(context.raw)}}},scales:{x:{beginAtZero:true,grid:{color:'rgba(148,163,184,.16)'},ticks:{callback:value=>currency?money.format(value):number.format(value)}},y:{grid:{display:false},ticks:{autoSkip:false}}}}});
    state.charts.set(`ranking:${chart.id}`,instance);
}
function renderReferenceControls(){
    const special=Boolean(state.data?.access?.management)&&['sales','inventory','expiry','purchases','supplier','staff'].includes(state.category),view=qs('[name="report_view"]').value,card=qs('.report-filter-card');
    const snapshot=(state.category==='inventory'&&!['Stock Movement','Fast / Slow Moving'].includes(view))||(state.category==='expiry'&&view!=='Expired / Wastage');
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
    if(state.category==='inventory')controls=select('quickCategory',categoriesOptions)+(view==='Current Inventory'||view==='Inventory Valuation'?select('quickSupplier',supplierOptions):'')+(view==='Current Inventory'||view==='Low / Out of Stock'?select('quickStock',stockOptions):'');
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
function renderCharts(charts){
    // ✅ FIX: guard against undefined/non-array
    charts = Array.isArray(charts) ? charts : [];
    const useful=charts.filter(chart=>chart && ((chart.rows||[]).some(r=>Number(r.value)>0||Number(r.paid)>0||Number(r.outstanding)>0)||chart.href));
    const target=qs('#reportCharts');target.classList.toggle('single-chart',useful.length===1);
    target.innerHTML=useful.map((chart,index)=>{const positive=(chart.rows||[]).filter(r=>Number(r.value)>0),heading=`<div class="panel-heading"><h2>${esc(chart.title)}</h2>${chart.href?`<a class="report-link" href="${esc(chart.href)}">${esc(chart.link_label||'View Report')} <i class="fa-solid fa-arrow-right"></i></a>`:''}</div>`;if(chart.type==='stacked-bar'){const max=Math.max(1,...chart.rows.map(r=>Number(r.paid||0)+Number(r.outstanding||0)));return `<article class="chart-card">${heading}<div class="payment-chart-legend"><span><i></i>Paid</span><span><i></i>Outstanding</span></div><div class="payment-chart">${chart.rows.map(r=>`<div class="payment-chart-row"><span>${esc(r.label)}</span><div class="payment-chart-track"><i style="width:${100*Number(r.paid||0)/max}%"></i><b style="width:${100*Number(r.outstanding||0)/max}%"></b></div></div>`).join('')}</div></article>`;}if(positive.length===0)return `<article class="chart-card compact-insight tone-${esc(chart.tone||'gray')}">${heading}<div class="compact-empty">No records in the selected period.</div></article>`;if((positive.length===1&&chart.type!=='bar'&&chart.type!=='line')||chart.type==='doughnut'&&positive.length<2){const row=positive[0],singleSummary=chart.overview_trend?`Net sales were ${money.format(row.value)} on ${reportDate(row.raw_date||row.label,{month:'long',day:'numeric',year:'numeric'})}, from ${number.format(row.secondary)} completed transaction${Number(row.secondary)===1?'':'s'}.`:'Only one meaningful category is available, so a compact summary replaces the chart.';return `<article class="chart-card compact-insight tone-${esc(chart.tone||'gray')}">${heading}<div class="ranked-insight"><span>${esc(row.label)}</span><strong>${esc(format(row.value,/sales|cost|revenue|payable/i.test(chart.title)?'currency':'number'))}</strong></div><p class="chart-summary">${esc(singleSummary)}</p></article>`;}return `<article class="chart-card">${heading}<div class="chart-box"><canvas id="reportChart${index}" role="img" aria-label="${esc(chart.title)}"></canvas></div><p class="chart-summary" id="chartSummary${index}"></p></article>`;}).join('');
    useful.forEach((chart,index)=>{const positive=(chart.rows||[]).filter(r=>Number(r.value)>0);if(chart.type==='stacked-bar'||positive.length===0||!qs(`#reportChart${index}`)||typeof Chart==='undefined')return;const values=positive.map(r=>Number(r.value)),rawLabels=positive.map(r=>r.label),labels=chart.overview_trend?rawLabels.map(label=>reportDate(label)):rawLabels,currency=/sales|cost|revenue|payable|value/i.test(chart.title),horizontal=chart.orientation==='horizontal',chartType=chart.type==='line'?'bar':chart.type;
        const colors=semanticChartColors(positive,chart.tone);const instance=new Chart(qs(`#reportChart${index}`),{type:chartType,data:{labels,datasets:[{label:chart.title,data:values,backgroundColor:colors,borderColor:colors,borderWidth:1,borderRadius:chartType==='bar'?5:0,borderSkipped:false,maxBarThickness:chartType==='bar'?34:undefined}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:horizontal?'y':'x',animation:{duration:160},plugins:{legend:{display:chartType==='doughnut',position:'bottom'},tooltip:{callbacks:{title:items=>chart.overview_trend?reportDate(positive[items[0].dataIndex].raw_date||rawLabels[items[0].dataIndex],{month:'long',day:'numeric',year:'numeric'}):items[0].label,label:ctx=>{const row=positive[ctx.dataIndex],metric=/net sales/i.test(chart.title)?'Net sales':chart.title,lines=[`${metric}: ${currency?money.format(ctx.raw):number.format(ctx.raw)}`];if(row.secondary!==undefined)lines.push(`Completed transactions: ${number.format(row.secondary)}`);return lines;}}}},scales:chartType==='doughnut'?{}:{x:{beginAtZero:horizontal,grid:{display:!horizontal},ticks:{callback:function(value){if(horizontal)return currency?money.format(value):number.format(value);return this.getLabelForValue(value);}}},y:{beginAtZero:!horizontal,grid:{display:false},ticks:{callback:function(value){if(!horizontal&&currency)return money.format(value);return this.getLabelForValue(value);}}}}}});state.charts.set(chart.id,instance);const max=Math.max(...values),maxIndex=values.indexOf(max),label=rawLabels[maxIndex],summary=chart.overview_trend?`Highest net sales were ${money.format(max)} on ${reportDate(positive[maxIndex].raw_date||label,{month:'long',day:'numeric',year:'numeric'})}.`:`${label} is highest at ${currency?money.format(max):number.format(max)}.`;qs(`#chartSummary${index}`).textContent=summary;});
}
function renderInsights(data){
    const cards=[];
    (data.insights||[]).forEach(insight=>cards.push(`<article class="insight-card tone-${esc(insight.tone||'gray')}"><h2>${esc(insight.title)}</h2>${(insight.rows||[]).map(r=>`<div class="insight-row"><span>${esc(r.label)} <small>${r.secondary?`${number.format(r.secondary)} transaction${Number(r.secondary)===1?'':'s'}`:''}</small></span><strong>${esc(format(r.value,insight.format))}</strong></div>`).join('')}</article>`));
    if(data.attention)cards.push(`<article class="attention-card"><h2><i class="fa-solid fa-triangle-exclamation"></i> Pharmacy Attention</h2>${data.attention.map(x=>{const label=Number(x.value)===1?x.singular:x.plural;return `<a class="attention-row tone-${esc(x.tone)}" href="${esc(x.href)}"><i class="attention-icon fa-solid ${esc(x.icon)}"></i><span>${esc(label)}</span><strong>${esc(format(x.value,x.format))}</strong><i class="fa-solid fa-arrow-right"></i></a>`;}).join('')}</article>`);
    qs('#reportInsights').innerHTML=cards.join('');
}
function overviewPanelHeading(title,href,label){return `<div class="panel-heading"><h2>${esc(title)}</h2><a class="report-link" href="${esc(href)}">${esc(label)} <i class="fa-solid fa-arrow-right"></i></a></div>`;}
function compactBars(rows,{value='value',tone='blue',currency=false,tooltip,summaryLabel='items'}={}){
    const visible=rows.filter(row=>Number(row[value])>0),max=Math.max(1,...visible.map(row=>Number(row[value])));
    if(!visible.length)return '';
    return `<div class="compact-bars" role="img" aria-label="${esc(`${visible.length} ${summaryLabel}`)}">${visible.map(row=>{const amount=Number(row[value]),width=100*amount/max;return `<div class="compact-bar-row tone-${esc(row.tone||tone)}" title="${esc(tooltip?tooltip(row):`${row.label}: ${amount}`)}"><div class="compact-bar-label"><span>${esc(row.label)}</span><strong>${esc(currency?money.format(amount):number.format(amount))}</strong></div><div class="compact-bar-track"><span style="width:${width}%"></span></div></div>`;}).join('')}</div>`;
}
function staffActivityPanel(title,rows,tone,href){
    const max=Math.max(1,...rows.map(row=>Number(row.transactions)));
    const content=rows.length?`<div class="staff-bars" role="img" aria-label="${esc(`${title}, top ${rows.length}`)}">${rows.map((row,index)=>`<div class="staff-rank tone-${tone}" title="${esc(`${row.name}: ${number.format(row.transactions)} completed transaction${Number(row.transactions)===1?'':'s'}, ${money.format(row.net_sales)} net sales`)}"><b>${index+1}</b><div><div class="staff-rank-label"><span>${esc(row.name)}</span><strong>${number.format(row.transactions)}</strong></div><div class="compact-bar-track"><span style="width:${100*Number(row.transactions)/max}%"></span></div><small>${money.format(row.net_sales)} net sales</small></div></div>`).join('')}</div><p class="visual-summary">${esc(rows[0].name)} leads with ${number.format(rows[0].transactions)} completed transaction${Number(rows[0].transactions)===1?'':'s'}.</p>`:'<div class="compact-empty">No completed staff activity in the selected period.</div>';
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
    const products=previews.top_products.rows||[],inventory=previews.inventory_health,expiry=previews.expiry_risk,purchase=previews.purchase_status,staff=previews.staff_activity;
    const productMode=state.productMode,productField=productMode==='revenue'?'net_revenue':'quantity_sold',sortedProducts=[...products].sort((a,b)=>Number(b[productField])-Number(a[productField])),productMax=Math.max(1,...sortedProducts.map(row=>Number(row[productField])));
    const productRows=sortedProducts.length?sortedProducts.map((row,index)=>{const primary=productMode==='revenue'?money.format(row.net_revenue):`${number.format(row.quantity_sold)} sold`,secondary=productMode==='revenue'?`${number.format(row.quantity_sold)} sold`:money.format(row.net_revenue);return `<div class="product-rank" data-product-rank><b>${index+1}</b><div class="product-rank-detail"><strong>${esc(row.brand_name)} — ${esc(row.product_name)}</strong><small title="${esc(row.specification||'')}">${esc(row.specification||'No specification recorded')}</small><div class="compact-bar-track tone-sales"><span style="width:${100*Number(row[productField])/productMax}%"></span></div></div><span><strong>${esc(primary)}</strong><small>${esc(secondary)}</small></span></div>`;}).join(''):'<div class="compact-empty">No completed product sales in the selected period.</div>';
    const healthRows=[['Healthy',inventory.healthy,'green'],['Low Stock',inventory.low_stock,'amber'],['Out of Stock',inventory.out_of_stock,'red'],['Data Issues',inventory.data_issues,'dark-red']],healthTotal=Math.max(1,inventory.total_products);
    const expiryTones={'Expired':'red','Within 7 days':'red-orange','Within 30 days':'amber','Within 60 days':'yellow'},expiryRows=(expiry.chart_rows||[]).map(row=>({...row,tone:expiryTones[row.label]||'amber'}));
const poTones={'Draft':'gray','Pending':'amber','Arrived':'teal','Delivered':'green','Cancelled':'red'},statusRows=Object.entries(purchase.statuses).map(([label,value])=>({label,value,tone:poTones[label]||'gray'}));
    const poBars=compactBars(statusRows,{tooltip:row=>`${row.label}: ${number.format(row.value)} unique purchase order${Number(row.value)===1?'':'s'}`,summaryLabel:'purchase order statuses'});
    const expiryBars=compactBars(expiryRows,{value:'quantity_at_risk',tooltip:row=>`${row.label}: ${number.format(row.batch_count)} active batch${Number(row.batch_count)===1?'':'es'}, ${number.format(row.quantity_at_risk)} units, ${money.format(row.cost_at_risk)} at risk`,summaryLabel:'expiry-risk windows'});
    target.innerHTML=`
      <article class="overview-panel tone-sales">${overviewPanelHeading('Top 5 Products',previews.top_products.href,'View Product Performance')}<div class="mini-toggle" role="group" aria-label="Rank products"><button class="${productMode==='quantity'?'active':''}" type="button" data-product-mode="quantity" aria-pressed="${productMode==='quantity'}">By Quantity</button><button class="${productMode==='revenue'?'active':''}" type="button" data-product-mode="revenue" aria-pressed="${productMode==='revenue'}">By Revenue</button></div><div id="overviewProducts">${productRows}</div><p class="visual-summary">${sortedProducts.length?`${esc(sortedProducts[0].brand_name)} — ${esc(sortedProducts[0].product_name)} ranks first by ${productMode}.`:'No ranked products for this period.'}</p></article>
      <article class="overview-panel tone-inventory">${overviewPanelHeading('Inventory Health',inventory.href,'View Inventory Report')}<p class="current-label"><i class="fa-solid fa-circle"></i> Current active stock</p><div class="segmented-bar" role="img" aria-label="Stock health across ${number.format(inventory.total_products)} active products">${healthRows.filter(([,value])=>Number(value)>0).map(([label,value,tone])=>{const percent=100*value/healthTotal;return `<span class="segment tone-${tone}" style="width:${percent}%" title="${esc(`${label}: ${number.format(value)} unique products, ${percent.toFixed(1)}% of active products`)}">${percent>=10?`<b>${number.format(value)}</b>`:''}</span>`;}).join('')}</div><div class="status-summary">${healthRows.map(([label,value,tone])=>`<div><i class="status-dot tone-${tone}"></i><span>${esc(label)}</span><strong>${number.format(value)}</strong></div>`).join('')}</div><p class="visual-summary">${number.format(inventory.healthy)} of ${number.format(inventory.total_products)} active products are healthy.</p><div class="mini-metrics"><div><span>Total On Hand</span><strong>${number.format(inventory.total_on_hand)}</strong></div><div><span>Shelf Stock</span><strong>${number.format(inventory.shelf_stock)}</strong></div><div><span>Storage Stock</span><strong>${number.format(inventory.storage_stock)}</strong></div></div></article>
      <article class="overview-panel tone-expiry">${overviewPanelHeading('Expiry Risk',expiry.href,'View Expiry Report')}<p class="current-label"><i class="fa-solid fa-circle"></i> Current active batches</p>${expiry.expired+expiry.within_30===0?`<div class="compact-empty success"><i class="fa-solid fa-circle-check"></i><strong>No immediate expiry risk.</strong><span>No active batches expire within the next 30 days.</span></div>`:`${expiryBars}<p class="visual-summary">${number.format(expiryRows.reduce((sum,row)=>sum+Number(row.batch_count),0))} active at-risk batches are shown in non-overlapping windows.</p>`}<div class="mini-metrics two"><div><span>Quantity at Risk</span><strong>${number.format(expiry.quantity_at_risk)}</strong></div><div><span>Cost at Risk</span><strong>${money.format(expiry.cost_at_risk)}</strong></div></div></article>
      <article class="overview-panel tone-purchases">${overviewPanelHeading('Purchase Order Status',purchase.href,'View Purchase Report')}${poBars||'<div class="compact-empty">No purchase orders to chart.</div>'}<div class="po-status-legend">${statusRows.map(row=>`<span><i class="status-dot tone-${row.tone}"></i>${esc(row.label)} <b>${number.format(row.value)}</b></span>`).join('')}</div><p class="visual-summary">${statusRows.filter(row=>Number(row.value)>0).length} non-zero purchase order statuses are charted.</p><div class="mini-metrics"><div><span>Awaiting Inspection</span><strong>${number.format(purchase.arrived_awaiting_inspection)}</strong></div><div><span>Open Commitments</span><strong>${money.format(purchase.open_commitments)}</strong></div><div><span>Outstanding Payables</span><strong>${money.format(purchase.outstanding_payable)}</strong></div></div></article>
      ${staffActivityPanel('Cashier Activity',staff.cashiers||[],'indigo',staff.href)}
      ${staffActivityPanel('Sales Clerk Activity',staff.sales_clerks||[],'teal',staff.href)}
      <div class="staff-supporting-metrics"><div><span>Active cashiers</span><strong>${number.format(staff.active_cashiers)}</strong></div><div><span>Active sales clerks</span><strong>${number.format(staff.active_sales_clerks)}</strong></div><div><span>Completed transactions</span><strong>${number.format(staff.completed_transactions)}</strong></div><div><span>Average transaction</span><strong>${money.format(staff.average_transaction)}</strong></div></div>`;
}
function renderTableInsights(insights){qs('#tableInsights').innerHTML=insights.map(insight=>`<article class="table-insight-card"><h2>${esc(insight.title)}</h2><div class="report-table-scroll"><table class="report-table compact"><thead><tr>${Object.values(insight.columns).map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${insight.rows.map(row=>`<tr>${Object.keys(insight.columns).map(key=>`<td class="${(insight.currency_columns||[]).includes(key)||(insight.numeric_columns||[]).includes(key)?'numeric':''}">${esc((insight.currency_columns||[]).includes(key)?money.format(Number(row[key]||0)):row[key]??'—')}</td>`).join('')}</tr>`).join('')||`<tr class="empty-table"><td colspan="${Object.keys(insight.columns).length}">No completed supplier deliveries in this period.</td></tr>`}</tbody></table></div></article>`).join('');}
function statusClass(value){return statusColors[String(value)]||(/paid|healthy|complete|accept/i.test(value)?'green':/cancel|expired|out of stock|data issue/i.test(value)?'red':/pending|partial|low|damage|slow/i.test(value)?'amber':'gray');}
function cellHtml(key,value,row){
    const text=value===null||value===''?'—':String(value);if(/status|performance/i.test(key))return `<span class="status-chip ${statusClass(text)}">${esc(text)}</span>`;
    if(state.data.currency_columns.includes(key))return esc(money.format(Number(value||0)));if(key==='sell_through_rate'||key==='share')return `${esc(text)}%`;if(/date|activity/.test(key))return esc(text.replace(' ',' · '));
    return `<span class="cell-text" title="${esc(text)}">${esc(text)}</span>`;
}
function renderTable(data){
    let columns=Object.entries(data.columns||{});if(!data.access.management&&data.access.cashier)columns=columns.filter(([key])=>key!=='sales_clerk');
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
function renderNotes(notes){qs('#formulaNotes').innerHTML=notes.length?`<h2><i class="fa-solid fa-circle-info"></i> Calculation notes</h2><ul>${notes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'';}
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
    try{const first=state.data,rows=[...first.rows];for(let page=2;page<=first.pagination.pages;page++){const response=await fetch(`${API_BASE_URL}/reports/get_report.php?${buildParams({page,page_size:100})}`,{credentials:'include',cache:'no-store'});const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Export failed.');rows.push(...payload.rows);}
        const columns=Object.entries(first.columns),applied=qsa('.filter-chip').map(x=>x.textContent.trim().replace(/\s*×$/,'')).join('; ')||'Default period';
        const lines=[[first.system.pharmacy_name],[`${qs('[name=report_view]').value} Report`],[`Date range: ${first.system.date_range.start} to ${first.system.date_range.end}`],[`Applied filters: ${applied}`],[`Generated: ${first.system.generated_at}`],[`Generated by: ${first.system.generated_by}`],[],['Summary'],...first.summary.map(x=>[x.title,format(x.value,x.format)]),[],columns.map(([,label])=>label)];
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
qs('#reportDetailClose').addEventListener('click',()=>qs('#reportDetail').close());qs('#reportDetailPrevious').addEventListener('click',()=>openRecordDetail(state.detailIndex-1));qs('#reportDetailNext').addEventListener('click',()=>openRecordDetail(state.detailIndex+1));
qs('#reportFilters').addEventListener('submit',event=>{event.preventDefault();state.page=1;state.explicitDates=true;state.period='custom';loadReport();});
qs('#clearFilters').addEventListener('click',resetFilters);qs('#reportRefresh').addEventListener('click',loadReport);qs('#reportPrint').addEventListener('click',()=>window.print());qs('#reportPdf').addEventListener('click',()=>window.print());qs('#reportExport').addEventListener('click',exportCsv);
qs('#reportViewMenu').addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(!button)return;qs('#reportSearch').value='';qs('[name="report_view"]').value=button.dataset.view;setFilterExpanded(['expiry','purchases'].includes(state.category)?false:button.dataset.view!=='Sales Summary');qs('[name="report_view"]').dispatchEvent(new Event('change'));renderViewMenu();});
qs('.report-presets').addEventListener('click',event=>{const button=event.target.closest('[data-period]');if(!button)return;const period=button.dataset.period;if(period==='custom'){qs('[name="start_date"]').closest('[data-filter]').hidden=false;qs('#reportFilters').classList.remove('is-collapsed');qs('[name="start_date"]').focus();state.period='custom';return;}const today=reportToday(state.data?.system?.timezone),end=period==='yesterday'?shiftDate(today,-1):today,start=period==='month'?`${today.slice(0,7)}-01`:period==='7'?shiftDate(end,-6):period==='30'?shiftDate(end,-29):end;qs('[name="start_date"]').value=start;qs('[name="end_date"]').value=end;state.period=period;state.explicitDates=true;state.page=1;qs('.report-presets').querySelectorAll('button').forEach(item=>item.classList.toggle('active',item===button));loadReport();});
qs('#previousPage').addEventListener('click',()=>{state.page--;loadReport();});qs('#nextPage').addEventListener('click',()=>{state.page++;loadReport();});
qs('#reportSearch').addEventListener('input',()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>{state.page=1;loadReport();},350);});
qs('#reportTableHead').addEventListener('click',event=>{const button=event.target.closest('[data-sort]');if(!button)return;state.direction=state.sort===button.dataset.sort&&state.direction==='asc'?'desc':'asc';state.sort=button.dataset.sort;state.page=1;loadReport();});
qs('#moreFiltersToggle').addEventListener('click',event=>{const panel=qs('#secondaryFilters'),expanded=panel.hidden;panel.hidden=!expanded;event.currentTarget.setAttribute('aria-expanded',String(expanded));event.currentTarget.lastElementChild.className=`fa-solid fa-chevron-${expanded?'up':'down'}`;});
qs('#filterChips').addEventListener('click',event=>{const chip=event.target.closest('[data-remove-filter]');if(!chip)return;const field=qs(`[name="${chip.dataset.removeFilter}"]`);if(field){field.value='';if(field.name==='category_id')qs('[name=secondary_category_id]').value='';if(field.name==='supplier_id')qs('[name=secondary_supplier_id]').value='';syncDependentOptions(true);}state.page=1;loadReport();});
qs('#overviewGrid').addEventListener('click',event=>{const button=event.target.closest('[data-product-mode]');if(!button||!state.data?.overview_previews)return;state.productMode=button.dataset.productMode;renderOverview(state.data.overview_previews);});
['category_id','secondary_category_id','type_id','brand'].forEach(name=>qs(`[name="${name}"]`).addEventListener('change',event=>{if(name.includes('category')){qs('[name=category_id]').value=event.target.value;qs('[name=secondary_category_id]').value=event.target.value;}syncDependentOptions(true);}));
qs('[name="product_id"]').addEventListener('change',event=>{const product=state.options?.products.find(x=>x.id===event.target.value);if(!product)return;qs('[name=category_id]').value=qs('[name=secondary_category_id]').value=product.category_id;qs('[name=type_id]').value=product.type_id;qs('[name=brand]').value=product.brand;syncDependentOptions(false);qs('[name=product_id]').value=product.id;});
['supplier_id','secondary_supplier_id'].forEach(name=>qs(`[name="${name}"]`).addEventListener('change',event=>{qs('[name=supplier_id]').value=qs('[name=secondary_supplier_id]').value=event.target.value;}));
qs('[name="report_view"]').addEventListener('change',event=>{const form=qs('#reportFilters'),map={'Product Sales':'product','Category Sales':'category','Cashier Sales':'cashier','Staff Sales':'cashier','Payment and Discount':'payment_method'};if(state.category==='sales')form.elements.group_by.value=map[event.target.value]||'day';if(event.target.value==='Expiring Products')form.elements.expiry_days.value='365';if(state.category==='purchases'){if(event.target.value==='PR / PO Summary'&&form.elements.payment_state.value==='Partially Paid')form.elements.payment_state.value='partial';else if(event.target.value==='Invoice & Payment'&&form.elements.payment_state.value==='partial')form.elements.payment_state.value='Partially Paid';if(event.target.value==='Invoice & Payment')form.elements.po_status.value='';if(event.target.value==='Purchase History')form.elements.payment_state.value='';}state.page=1;updateVisibleFilters();renderViewMenu();loadReport();});
qs('.report-filter-card').addEventListener('change',event=>{const id=event.target.id;if(id==='quickExpiry')qs('[name="expiry_days"]').value=event.target.value;else if(id==='quickSupplier')qs('[name="supplier_id"]').value=qs('[name="secondary_supplier_id"]').value=event.target.value;else if(id==='quickCategory')qs('[name="category_id"]').value=qs('[name="secondary_category_id"]').value=event.target.value;else if(id==='quickStock')qs('[name="stock_status"]').value=event.target.value;else if(id==='quickCashier')qs('[name="cashier_id"]').value=event.target.value;else if(id==='quickStatus')qs('[name="po_status"]').value=event.target.value;else if(id==='quickPayment')qs('[name="payment_state"]').value=event.target.value;else return;state.page=1;loadReport();});
qs('.report-filter-card').addEventListener('click',event=>{if(event.target.closest('#quickTrace'))loadReport();});
qs('#filterCollapse').addEventListener('click',()=>setFilterExpanded(qs('#reportFilters').classList.contains('is-collapsed')));

await verifySession();initialQuery();renderTabs();updateVisibleFilters();if(state.category==='overview')clearCategoryFilters();
if(matchMedia('(max-width:991.98px)').matches){qs('#reportFilters').classList.add('is-collapsed');qs('#filterCollapse').setAttribute('aria-expanded','false');qs('#filterCollapse span').textContent='Show filters';qs('#filterCollapse i').className='fa-solid fa-chevron-down';}
await loadReport();
