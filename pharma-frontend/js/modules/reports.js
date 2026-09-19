import API_BASE_URL from '../config/config.js';
import { ensurePageTabSession as verifySession } from './auth_guard.js?v=21';

const categories={overview:'Overview',sales:'Sales',inventory:'Inventory',purchases:'Purchases',expiry:'Expiry',products:'Product Performance',staff:'Staff Performance'};
const reportViews={
    overview:['Management Overview'],
    sales:['Sales Summary','Product Sales','Staff Sales','Payment and Discount'],
    inventory:['Inventory Summary','Stock Health'],
    purchases:['Purchase Summary','Supplier Performance','Payment Status'],
    expiry:['Expiry Risk Summary'],
    products:['Product Performance Summary'],
    staff:['Staff Performance Summary']
};
const groupOptions={
    sales:[['day','Day'],['week','Week'],['month','Month'],['product','Product'],['brand','Brand'],['category','Category'],['product_type','Product Type'],['cashier','Cashier'],['sales_clerk','Sales Clerk'],['payment_method','Payment Method']]
};
const visibility={
    overview:['view','dates'],sales:['view','group','dates','primary-category','type','product','brand','cashier','clerk','payment'],
    inventory:['view','primary-category','primary-stock','type','product','brand','secondary-supplier'],
    purchases:['view','dates','primary-supplier','po'],expiry:['view','primary-expiry','primary-supplier','secondary-category','type','product','brand'],
    products:['view','dates','primary-category','type','product','brand'],staff:['view','dates','cashier','clerk']
};
const filterLabels={start_date:'From',end_date:'To',category_id:'Category',type_id:'Product type',product_id:'Product',brand:'Brand',supplier_id:'Supplier',cashier_id:'Cashier',sales_clerk_id:'Sales clerk',payment_method:'Payment',po_status:'PO status',stock_status:'Stock status',expiry_days:'Expiry range',group_by:'Group by'};
const tones={
    purple:'#7c3aed',blue:'#2563eb',teal:'#0f9f92',indigo:'#4f46e5',green:'#16a34a',amber:'#d97706',red:'#dc2626',gray:'#64748b',
    sales:'#2563eb',inventory:'#0f9f92',purchases:'#4f46e5',expiry:'#dc2626'
};
const statusColors={Healthy:'green',Completed:'green',Delivered:'green',Paid:'green','Fully Paid':'green',Accepted:'green','Low Stock':'amber','Expiring Soon':'amber',Draft:'gray',Pending:'amber','Partially Paid':'amber','Not Yet Payable':'gray','Out of Stock':'red',Expired:'red',Critical:'red',Cancelled:'red','Negative Stock — Data Issue':'red','High Stock / Low Sales':'red','Slow Moving':'amber','No Sales':'gray','Fast Moving':'green',Steady:'teal',Arrived:'indigo',Watch:'amber'};
const money=new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}),number=new Intl.NumberFormat('en-PH');
const qs=s=>document.querySelector(s),qsa=s=>[...document.querySelectorAll(s)];
const state={category:'overview',page:1,data:null,controller:null,charts:new Map(),options:null,searchTimer:null,defaultStart:'',defaultEnd:'',sort:'',direction:'desc',explicitDates:false,needsInitialFilterReload:false,productMode:'quantity'};
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const format=(v,type)=>type==='currency'?money.format(Number(v||0)):number.format(Number(v||0));

function initialQuery(){
    const query=new URLSearchParams(location.search);if(categories[query.get('category')])state.category=query.get('category');
    state.explicitDates=query.has('start_date')||query.has('end_date');
    const form=qs('#reportFilters'),staticFields=new Set(['start_date','end_date','expiry_days']);
    ['report_view','group_by','start_date','end_date','category_id','type_id','product_id','brand','supplier_id','cashier_id','sales_clerk_id','payment_method','po_status','stock_status','expiry_days','payment_state'].forEach(key=>{if(query.has(key)){const field=form.elements[key];if(field){if(staticFields.has(key)||field.type==='hidden')field.value=query.get(key);else{field.dataset.initial=query.get(key);state.needsInitialFilterReload=true;}}}});
}
function renderTabs(available=Object.keys(categories)){qs('#reportTabs').innerHTML=available.map(key=>`<button class="report-tab ${key===state.category?'active':''}" type="button" data-category="${key}">${categories[key]}</button>`).join('');}
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
    const visible=new Set(visibility[state.category]||[]);
    qsa('[data-filter]').forEach(el=>el.hidden=!visible.has(el.dataset.filter));
    qs('#moreFiltersToggle').hidden=state.category==='overview';if(state.category==='overview')qs('#secondaryFilters').hidden=true;
    const view=qs('[name="report_view"]'),previous=view.dataset.initial||view.value;view.innerHTML=reportViews[state.category].map(x=>`<option>${x}</option>`).join('');if(reportViews[state.category].includes(previous))view.value=previous;delete view.dataset.initial;
    const group=qs('[name="group_by"]'),options=groupOptions[state.category]||[];group.innerHTML=options.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');const initial=group.dataset.initial;if(initial&&options.some(x=>x[0]===initial))group.value=initial;delete group.dataset.initial;
    syncDependentOptions(false);
}
function buildParams(overrides={}){
    syncMirrors();const params=new URLSearchParams({category:state.category,page:String(state.page),page_size:'20'});
    new FormData(qs('#reportFilters')).forEach((value,key)=>{if(!key.startsWith('secondary_')&&String(value)!=='')params.set(key,value);});
    const search=qs('#reportSearch').value.trim();if(search)params.set('search',search);if(state.sort){params.set('sort',state.sort);params.set('direction',state.direction);}
    Object.entries(overrides).forEach(([k,v])=>params.set(k,String(v)));return params;
}
async function loadReport(){
    state.controller?.abort();state.controller=new AbortController();destroyCharts();qs('#reportContent').classList.add('d-none');qs('#reportError').classList.add('d-none');qs('#reportLoading').classList.remove('d-none');
    try{const response=await fetch(`${API_BASE_URL}/reports/get_report.php?${buildParams()}`,{credentials:'include',cache:'no-store',signal:state.controller.signal});const data=await response.json();if(response.status===403&&data.access?.available_categories?.length){state.category=data.access.available_categories[0];state.page=1;return loadReport();}if(!response.ok||data.status!=='success')throw new Error(data.message||'Unable to generate this report.');
        state.data=data;if(data.access?.supervisor){categories.overview='Inventory Overview';categories.purchases='Purchase Requests';reportViews.overview=['Inventory Overview'];reportViews.purchases=['Purchase Request Summary'];visibility.purchases=['view','dates'];}
<<<<<<< HEAD
        if(!state.options){populateBaseOptions(data.filters||{});if(state.needsInitialFilterReload){state.needsInitialFilterReload=false;return loadReport();}}if(!data.access.available_categories.includes(state.category)){state.category=data.access.available_categories[0];return loadReport();}renderTabs(data.access.available_categories);
        try {
            renderReport(data);
        } catch (renderError) {
            console.error('Report render error', renderError);
            qs('#reportError').classList.remove('d-none');
            qs('#reportError').textContent = 'Failed to render report: ' + (renderError.message || String(renderError));
            qs('#reportLoading').classList.add('d-none');
            return;
        }
        syncUrl();}
=======
        if(!state.options){populateBaseOptions(data.filters||{});if(state.needsInitialFilterReload){state.needsInitialFilterReload=false;return loadReport();}}if(!data.access.available_categories.includes(state.category)){state.category=data.access.available_categories[0];return loadReport();}renderTabs(data.access.available_categories);renderReport(data);syncUrl();}
>>>>>>> 2ed0554fe1db566e6833390b8a9bc5cd726661b2
    catch(error){if(error.name==='AbortError')return;qs('#reportLoading').classList.add('d-none');qs('#reportError').classList.remove('d-none');qs('#reportError').textContent=error.message;}
}
function syncUrl(){
    const params=buildParams();if(!state.explicitDates&&params.get('start_date')===state.defaultStart)params.delete('start_date');if(!state.explicitDates&&params.get('end_date')===state.defaultEnd)params.delete('end_date');
    if(params.get('expiry_days')==='30')params.delete('expiry_days');if(params.get('group_by')==='day')params.delete('group_by');params.delete('report_view');params.delete('page_size');if(params.get('page')==='1')params.delete('page');
    history.replaceState(null,'',`${location.pathname}?${params}`);
}
function renderReport(data){
<<<<<<< HEAD
    // Defensive defaults: ensure the report renderer never attempts to read .rows from undefined
    data = data || {};
    data.system = data.system || { date_range: { start: '', end: '' }, generated_at: new Date().toISOString(), timezone: 'UTC', generated_by: '' };
    data.summary = data.summary || [];
    data.charts = data.charts || [];
    data.overview_previews = data.overview_previews || {};
    data.overview_previews.top_products = data.overview_previews.top_products || { rows: [], href: '' };
    data.overview_previews.inventory_health = data.overview_previews.inventory_health || { healthy: 0, total_products: 0, low_stock: 0, out_of_stock: 0, data_issues: 0, total_on_hand: 0, shelf_stock: 0, storage_stock: 0, href: '' };
    data.overview_previews.expiry_risk = data.overview_previews.expiry_risk || { chart_rows: [], href: '' };
    data.overview_previews.purchase_status = data.overview_previews.purchase_status || { statuses: {}, href: '' };
    data.overview_previews.purchase_status.statuses = data.overview_previews.purchase_status.statuses || {};
    data.overview_previews.staff_activity = data.overview_previews.staff_activity || { rows: [], href: '' };
    data.overview_previews.staff_activity.rows = data.overview_previews.staff_activity.rows || [];
    data.insights = Array.isArray(data.insights) ? data.insights : [];
    data.insights.forEach(insight => {
        insight.rows = Array.isArray(insight.rows) ? insight.rows : [];
    });
    data.table_insights = Array.isArray(data.table_insights) ? data.table_insights : [];
    data.table_insights.forEach(insight => {
        insight.columns = insight.columns || {};
        insight.rows = Array.isArray(insight.rows) ? insight.rows : [];
    });
    data.charts = data.charts.filter(chart => chart && typeof chart === 'object').map(chart => ({
        ...chart,
        rows: Array.isArray(chart.rows) ? chart.rows : []
    }));
    data.table_insights = data.table_insights || [];
    data.notes = data.notes || [];

=======
>>>>>>> 2ed0554fe1db566e6833390b8a9bc5cd726661b2
    qs('#reportLoading').classList.add('d-none');qs('#reportContent').classList.remove('d-none');
    qs('#reportContent').classList.toggle('is-overview',state.category==='overview');
    state.defaultStart=data.system.date_range.start;state.defaultEnd=data.system.date_range.end;const form=qs('#reportFilters');if(!form.elements.start_date.value)form.elements.start_date.value=state.defaultStart;if(!form.elements.end_date.value)form.elements.end_date.value=state.defaultEnd;
    const generated=new Date(data.system.generated_at);qs('#reportGenerated').textContent=`Generated ${generated.toLocaleString('en-PH',{timeZone:data.system.timezone,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} · ${data.system.timezone} · ${data.system.generated_by}`;
    qs('#summaryCards').innerHTML=(data.summary||[]).map(card=>`<article class="summary-card tone-${esc(card.tone||'purple')}" ${card.tooltip?`title="${esc(card.tooltip)}"`:''}><div class="summary-icon"><i class="fa-solid ${esc(card.icon||'fa-chart-simple')}"></i></div><span>${esc(card.title)}</span><strong>${esc(format(card.value,card.format))}</strong></article>`).join('');
    renderCharts(data.charts||[]);renderInsights(data);
    if(state.category==='overview'){const attention=qs('#reportInsights .attention-card');if(attention){qs('#reportCharts').appendChild(attention);qs('#reportCharts').classList.remove('single-chart');}}
    renderOverview(data.overview_previews);renderTableInsights(data.table_insights||[]);renderTable(data);qs('.report-table-card').hidden=state.category==='overview';renderNotes(data.notes||[]);renderFilterChips();
}
function destroyCharts(){state.charts.forEach(chart=>chart.destroy());state.charts.clear();}
function semanticChartColors(rows,tone){if(tone==='status'||tone==='expiry')return rows.map(r=>tones[statusColors[r.label]||(/expired|critical/i.test(r.label)?'red':/soon|days/i.test(r.label)?'amber':'green')]);const base=tones[tone]||tones.blue;return rows.map((_,i)=>i===0?base:`${base}${Math.max(55,210-i*28).toString(16).padStart(2,'0')}`);}
function reportDate(value,options={month:'short',day:'numeric'}){
    const match=String(value??'').match(/^(\d{4})-(\d{2})-(\d{2})/);if(!match)return String(value??'');
    return new Intl.DateTimeFormat('en-PH',options).format(new Date(Number(match[1]),Number(match[2])-1,Number(match[3])));
}
function renderCharts(charts){
    const useful=charts.filter(chart=>(chart.rows||[]).some(r=>Number(r.value)>0)||chart.href);const target=qs('#reportCharts');target.classList.toggle('single-chart',useful.length===1);
    target.innerHTML=useful.map((chart,index)=>{const positive=chart.rows.filter(r=>Number(r.value)>0),heading=`<div class="panel-heading"><h2>${esc(chart.title)}</h2>${chart.href?`<a class="report-link" href="${esc(chart.href)}">${esc(chart.link_label||'View Report')} <i class="fa-solid fa-arrow-right"></i></a>`:''}</div>`;if(positive.length===0)return `<article class="chart-card compact-insight tone-${esc(chart.tone||'gray')}">${heading}<div class="compact-empty">No completed sales in the selected period.</div></article>`;if(positive.length===1||chart.type==='doughnut'&&positive.length<2){const row=positive[0],singleSummary=chart.overview_trend?`Net sales were ${money.format(row.value)} on ${reportDate(row.raw_date||row.label,{month:'long',day:'numeric',year:'numeric'})}, from ${number.format(row.secondary)} completed transaction${Number(row.secondary)===1?'':'s'}.`:'Only one meaningful category is available, so a compact summary replaces the chart.';return `<article class="chart-card compact-insight tone-${esc(chart.tone||'gray')}">${heading}<div class="ranked-insight"><span>${esc(row.label)}</span><strong>${esc(format(row.value,/sales|cost|revenue|payable/i.test(chart.title)?'currency':'number'))}</strong></div><p class="chart-summary">${esc(singleSummary)}</p></article>`;}return `<article class="chart-card">${heading}<div class="chart-box"><canvas id="reportChart${index}" role="img" aria-label="${esc(chart.title)}"></canvas></div><p class="chart-summary" id="chartSummary${index}"></p></article>`;}).join('');
    useful.forEach((chart,index)=>{const positive=chart.rows.filter(r=>Number(r.value)>0);if(positive.length<2||!qs(`#reportChart${index}`)||typeof Chart==='undefined')return;const values=positive.map(r=>Number(r.value)),rawLabels=positive.map(r=>r.label),labels=chart.overview_trend?rawLabels.map(label=>reportDate(label)):rawLabels,currency=/sales|cost|revenue|payable|value/i.test(chart.title),horizontal=chart.orientation==='horizontal';
        const colors=semanticChartColors(positive,chart.tone);const instance=new Chart(qs(`#reportChart${index}`),{type:chart.type,data:{labels,datasets:[{label:chart.title,data:values,backgroundColor:chart.type==='line'?`${tones.blue}22`:colors,borderColor:chart.type==='line'?tones.blue:colors,borderWidth:chart.type==='line'?2:1,tension:.25,fill:chart.type==='line',pointRadius:3,pointHoverRadius:5}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:horizontal?'y':'x',animation:{duration:160},plugins:{legend:{display:chart.type==='doughnut',position:'bottom'},tooltip:{callbacks:{title:items=>chart.overview_trend?reportDate(positive[items[0].dataIndex].raw_date||rawLabels[items[0].dataIndex],{month:'long',day:'numeric',year:'numeric'}):items[0].label,label:ctx=>{const row=positive[ctx.dataIndex],metric=/net sales/i.test(chart.title)?'Net sales':chart.title,lines=[`${metric}: ${currency?money.format(ctx.raw):number.format(ctx.raw)}`];if(row.secondary!==undefined)lines.push(`Completed transactions: ${number.format(row.secondary)}`);return lines;}}}},scales:chart.type==='doughnut'?{}:{x:{beginAtZero:horizontal,grid:{display:!horizontal},ticks:{callback:function(value){if(horizontal)return currency?money.format(value):number.format(value);return this.getLabelForValue(value);}}},y:{beginAtZero:!horizontal,grid:{display:false},ticks:{callback:function(value){if(!horizontal&&currency)return money.format(value);return this.getLabelForValue(value);}}}}}});state.charts.set(chart.id,instance);const max=Math.max(...values),maxIndex=values.indexOf(max),label=rawLabels[maxIndex],summary=chart.overview_trend?`Highest net sales were ${money.format(max)} on ${reportDate(positive[maxIndex].raw_date||label,{month:'long',day:'numeric',year:'numeric'})}.`:`${label} is highest at ${currency?money.format(max):number.format(max)}.`;qs(`#chartSummary${index}`).textContent=summary;});
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
<<<<<<< HEAD
    previews = previews || {};
    previews.top_products = previews.top_products || { rows: [], href: '' };
    previews.top_products.rows = Array.isArray(previews.top_products.rows) ? previews.top_products.rows : [];
    previews.inventory_health = previews.inventory_health || {};
    previews.expiry_risk = previews.expiry_risk || { chart_rows: [] };
    previews.expiry_risk.chart_rows = Array.isArray(previews.expiry_risk.chart_rows) ? previews.expiry_risk.chart_rows : [];
    previews.purchase_status = previews.purchase_status || { statuses: {} };
    previews.purchase_status.statuses = previews.purchase_status.statuses || {};
    previews.staff_activity = previews.staff_activity || {};
    previews.staff_activity.cashiers = Array.isArray(previews.staff_activity.cashiers) ? previews.staff_activity.cashiers : [];
    previews.staff_activity.sales_clerks = Array.isArray(previews.staff_activity.sales_clerks) ? previews.staff_activity.sales_clerks : [];
=======
>>>>>>> 2ed0554fe1db566e6833390b8a9bc5cd726661b2
    const target=qs('#overviewGrid');target.hidden=!previews;if(!previews){target.innerHTML='';return;}
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
    if(state.data.currency_columns.includes(key))return esc(money.format(Number(value||0)));if(key==='sell_through_rate')return `${esc(text)}%`;if(/date|activity/.test(key))return esc(text.replace(' ',' · '));
    return `<span class="cell-text" title="${esc(text)}">${esc(text)}</span>`;
}
function renderTable(data){
    let columns=Object.entries(data.columns||{});if(!data.access.management&&data.access.cashier)columns=columns.filter(([key])=>key!=='sales_clerk');
    qs('#tableTitle').textContent=`${categories[state.category]} details`;qs('#reportTableHead').innerHTML=`<tr>${columns.map(([key,label])=>`<th class="${data.numeric_columns.includes(key)||data.currency_columns.includes(key)?'numeric':''}"><button class="sort-button" type="button" data-sort="${esc(key)}">${esc(label)}${state.sort===key?` <i class="fa-solid fa-sort-${state.direction==='asc'?'up':'down'}"></i>`:''}</button></th>`).join('')}</tr>`;
    qs('#reportTableBody').innerHTML=data.rows?.length?data.rows.map(row=>`<tr>${columns.map(([key])=>`<td class="${data.numeric_columns.includes(key)||data.currency_columns.includes(key)?'numeric':''}">${cellHtml(key,row[key],row)}</td>`).join('')}</tr>`).join(''):`<tr class="empty-table"><td colspan="${columns.length}">${esc(data.empty_message||'No records were found for the selected filters.')}</td></tr>`;
    window.PharmacySearchHighlight?.apply(qs('#reportTableBody'),qs('#reportSearch')?.value||'');
    const p=data.pagination;qs('#resultCount').textContent=`${number.format(p.total)} result${p.total===1?'':'s'}`;qs('#pageSummary').textContent=`Page ${p.page} of ${p.pages}`;qs('#previousPage').disabled=p.page<=1;qs('#nextPage').disabled=p.page>=p.pages;
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
function resetFilters(){const form=qs('#reportFilters');form.reset();qsa('#reportFilters select').forEach(x=>{x.dataset.initial='';});form.elements.start_date.value=state.defaultStart;form.elements.end_date.value=state.defaultEnd;form.elements.expiry_days.value='30';qs('#reportSearch').value='';state.page=1;state.sort='';state.direction='desc';state.explicitDates=false;populateBaseOptions(state.options);updateVisibleFilters();loadReport();}
function clearCategoryFilters(){
    const form=qs('#reportFilters');['category_id','secondary_category_id','type_id','product_id','brand','supplier_id','secondary_supplier_id','cashier_id','sales_clerk_id','payment_method','po_status','stock_status','payment_state'].forEach(key=>{if(form.elements[key])form.elements[key].value='';});
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

qs('#reportTabs').addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(!button)return;clearCategoryFilters();state.category=button.dataset.category;state.page=1;renderTabs(state.data?.access?.available_categories);updateVisibleFilters();loadReport();});
qs('#reportFilters').addEventListener('submit',event=>{event.preventDefault();state.page=1;state.explicitDates=true;loadReport();});
qs('#clearFilters').addEventListener('click',resetFilters);qs('#reportRefresh').addEventListener('click',loadReport);qs('#reportPrint').addEventListener('click',()=>window.print());qs('#reportExport').addEventListener('click',exportCsv);
qs('#previousPage').addEventListener('click',()=>{state.page--;loadReport();});qs('#nextPage').addEventListener('click',()=>{state.page++;loadReport();});
qs('#reportSearch').addEventListener('input',()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>{state.page=1;loadReport();},350);});
qs('#reportTableHead').addEventListener('click',event=>{const button=event.target.closest('[data-sort]');if(!button)return;state.direction=state.sort===button.dataset.sort&&state.direction==='asc'?'desc':'asc';state.sort=button.dataset.sort;state.page=1;loadReport();});
qs('#moreFiltersToggle').addEventListener('click',event=>{const panel=qs('#secondaryFilters'),expanded=panel.hidden;panel.hidden=!expanded;event.currentTarget.setAttribute('aria-expanded',String(expanded));event.currentTarget.lastElementChild.className=`fa-solid fa-chevron-${expanded?'up':'down'}`;});
qs('#filterChips').addEventListener('click',event=>{const chip=event.target.closest('[data-remove-filter]');if(!chip)return;const field=qs(`[name="${chip.dataset.removeFilter}"]`);if(field){field.value='';if(field.name==='category_id')qs('[name=secondary_category_id]').value='';if(field.name==='supplier_id')qs('[name=secondary_supplier_id]').value='';syncDependentOptions(true);}state.page=1;loadReport();});
qs('#overviewGrid').addEventListener('click',event=>{const button=event.target.closest('[data-product-mode]');if(!button||!state.data?.overview_previews)return;state.productMode=button.dataset.productMode;renderOverview(state.data.overview_previews);});
['category_id','secondary_category_id','type_id','brand'].forEach(name=>qs(`[name="${name}"]`).addEventListener('change',event=>{if(name.includes('category')){qs('[name=category_id]').value=event.target.value;qs('[name=secondary_category_id]').value=event.target.value;}syncDependentOptions(true);}));
qs('[name="product_id"]').addEventListener('change',event=>{const product=state.options?.products.find(x=>x.id===event.target.value);if(!product)return;qs('[name=category_id]').value=qs('[name=secondary_category_id]').value=product.category_id;qs('[name=type_id]').value=product.type_id;qs('[name=brand]').value=product.brand;syncDependentOptions(false);qs('[name=product_id]').value=product.id;});
['supplier_id','secondary_supplier_id'].forEach(name=>qs(`[name="${name}"]`).addEventListener('change',event=>{qs('[name=supplier_id]').value=qs('[name=secondary_supplier_id]').value=event.target.value;}));
qs('[name="report_view"]').addEventListener('change',event=>{const form=qs('#reportFilters'),map={'Product Sales':'product','Staff Sales':'cashier','Payment and Discount':'payment_method'};if(state.category==='sales')form.elements.group_by.value=map[event.target.value]||'day';state.page=1;loadReport();});
qs('#filterCollapse').addEventListener('click',event=>{const form=qs('#reportFilters');form.classList.toggle('is-collapsed');const expanded=!form.classList.contains('is-collapsed');event.currentTarget.setAttribute('aria-expanded',String(expanded));event.currentTarget.querySelector('span').textContent=expanded?'Hide filters':'Show filters';event.currentTarget.querySelector('i').className=`fa-solid fa-chevron-${expanded?'up':'down'}`;});

await verifySession();initialQuery();renderTabs();updateVisibleFilters();if(state.category==='overview')clearCategoryFilters();
if(matchMedia('(max-width:991.98px)').matches){qs('#reportFilters').classList.add('is-collapsed');qs('#filterCollapse').setAttribute('aria-expanded','false');qs('#filterCollapse span').textContent='Show filters';qs('#filterCollapse i').className='fa-solid fa-chevron-down';}
await loadReport();
