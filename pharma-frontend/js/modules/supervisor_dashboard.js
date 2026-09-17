import API_BASE_URL from '../config/config.js';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const charts = {};
const colors = {purple:'#7c3aed',green:'#16a34a',amber:'#f59e0b',red:'#dc2626',orange:'#f97316',blue:'#3b82f6'};
const healthColors = {'Healthy Stock':colors.green,'Low Stock':colors.amber,'Out of Stock':colors.red,'Expiring Soon':colors.orange,'Expired':'#991b1b'};

function localDate(date=new Date()){const offset=date.getTimezoneOffset();return new Date(date.getTime()-offset*60000).toISOString().slice(0,10);}
function presetDates(preset){const today=new Date(`${localDate()}T12:00:00`);let start=new Date(today);if(preset==='last_7_days')start.setDate(today.getDate()-6);else if(preset==='last_30_days')start.setDate(today.getDate()-29);else if(preset==='this_month')start=new Date(today.getFullYear(),today.getMonth(),1,12);return{start:localDate(start),end:localDate(today)};}
function setDates(preset){if(preset==='custom')return;const dates=presetDates(preset);$('#startDate').value=dates.start;$('#endDate').value=dates.end;}
function chart(id,config){charts[id]?.destroy();charts[id]=new Chart(document.getElementById(id),config);}
function commonOptions(extra={}){return{responsive:true,maintainAspectRatio:false,animation:{duration:450},plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:8,padding:14,font:{family:'Inter',size:10}}},tooltip:{padding:10}},scales:extra.scales,...extra};}
function emptyPlugin(message='No records for this period'){return{id:`empty-${message}`,afterDraw(instance){const values=instance.data.datasets.flatMap(dataset=>dataset.data||[]);if(values.some(Number))return;const{ctx,chartArea}=instance;ctx.save();ctx.fillStyle='#94a3b8';ctx.font='12px Inter';ctx.textAlign='center';ctx.fillText(message,(chartArea.left+chartArea.right)/2,(chartArea.top+chartArea.bottom)/2);ctx.restore();}};}

function render(data){
    const health=data.inventory_health||[];
    const healthMap=Object.fromEntries(health.map(item=>[item.label,Number(item.count)]));
    $('#healthTotal').textContent=health.reduce((sum,item)=>sum+Number(item.count),0);
    chart('healthChart',{type:'doughnut',data:{labels:health.map(item=>item.label),datasets:[{data:health.map(item=>item.count),backgroundColor:health.map(item=>healthColors[item.label]),borderWidth:3,borderColor:'#fff',hoverOffset:4}]},options:commonOptions({cutout:'68%',plugins:{legend:{display:false}}}),plugins:[emptyPlugin()]});
    $('#healthCounts').innerHTML=health.map(item=>`<div class="health-count"><span><i class="health-dot" style="background:${healthColors[item.label]}"></i>${escapeHtml(item.label.replace(' Stock',''))}</span><strong>${Number(item.count)}</strong></div>`).join('');
    $('#summaryLow').textContent=healthMap['Low Stock']||0;$('#summaryOut').textContent=healthMap['Out of Stock']||0;$('#summaryExpiring').textContent=healthMap['Expiring Soon']||0;

    const distribution=data.stock_distribution||[];
    chart('distributionChart',{type:'bar',data:{labels:distribution.map(item=>item.category),datasets:[{label:'Shelf Stock',data:distribution.map(item=>item.shelf),backgroundColor:colors.purple,borderRadius:5},{label:'Storage Stock',data:distribution.map(item=>item.storage),backgroundColor:colors.blue,borderRadius:5},{label:'Total On Hand',data:distribution.map(item=>item.on_hand),backgroundColor:'#c4b5fd',borderRadius:5}]},options:commonOptions({scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{precision:0}}}}),plugins:[emptyPlugin()]});

    const movement=data.inventory_movement||[];
    chart('movementChart',{type:'line',data:{labels:movement.map(item=>item.label),datasets:[{label:'Stock Received',data:movement.map(item=>item.received),borderColor:colors.green,backgroundColor:'rgba(22,163,74,.12)',fill:true,tension:.32,pointRadius:2},{label:'Stock Sold / Released',data:movement.map(item=>item.released),borderColor:colors.purple,backgroundColor:'rgba(124,58,237,.1)',fill:true,tension:.32,pointRadius:2}]},options:commonOptions({interaction:{mode:'index',intersect:false},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:9}},y:{beginAtZero:true,ticks:{precision:0}}}}),plugins:[emptyPlugin()]});

    const fast=data.fast_moving_products||[];
    chart('fastMovingChart',{type:'bar',data:{labels:fast.map(item=>item.product_name),datasets:[{label:'Quantity sold / released',data:fast.map(item=>item.quantity_moved),backgroundColor:colors.purple,borderRadius:6,barThickness:16}]},options:commonOptions({indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>{const item=fast[items[0]?.dataIndex];return[item?.product_name,item?.brand_name,item?.specification].filter(Boolean).join(' · ');},label:context=>`${context.raw} sold / released · ${fast[context.dataIndex]?.on_hand||0} on hand`}}},scales:{x:{beginAtZero:true,ticks:{precision:0}},y:{grid:{display:false},ticks:{autoSkip:false}}}}),plugins:[emptyPlugin()]});
    $('#fastMovingDetails').innerHTML=fast.length?fast.map(item=>`<div class="fast-moving-row"><strong title="${escapeHtml([item.product_name,item.brand_name,item.specification].filter(Boolean).join(' · '))}">${escapeHtml([item.product_name,item.brand_name,item.specification].filter(Boolean).join(' · '))}</strong><span>${item.quantity_moved} sold · ${item.on_hand} on hand</span></div>`).join(''):'<div class="fast-moving-row"><span>No product movement in this period.</span></div>';

    const expiry=data.expiry_risk||[];
    chart('expiryChart',{type:'bar',data:{labels:expiry.map(item=>item.label),datasets:[{label:'Batch quantity',data:expiry.map(item=>item.quantity),backgroundColor:['#991b1b',colors.red,colors.orange,colors.amber,colors.green],borderRadius:6,barThickness:20}]},options:commonOptions({indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{precision:0}},y:{grid:{display:false}}}}),plugins:[emptyPlugin()]});

    const statuses=data.pr_status||[];
    const statusColors=[colors.purple,colors.green,colors.amber,colors.red];
    const statusMax=Math.max(1,...statuses.map(item=>Number(item.count)));
    $('#approvalActivity').innerHTML=statuses.map((item,index)=>`<div class="activity-row"><span class="activity-label">${escapeHtml(item.status.replace(' Supervisor Approval',''))}</span><div class="activity-track"><span style="width:${Math.round(Number(item.count)/statusMax*100)}%;background:${statusColors[index]}"></span></div><strong class="activity-count">${Number(item.count)}</strong></div>`).join('');
    $('#summaryPending').textContent=Number(statuses.find(item=>item.status==='Pending Supervisor Approval')?.count||0);

    const attention=data.inventory_attention||[];
    $('#attentionRows').innerHTML=attention.length?attention.map(row=>`<tr><td class="product-cell"><strong>${escapeHtml(row.product_name)}</strong><span>${escapeHtml(row.brand_name)}</span></td><td>${escapeHtml(row.specification||'—')}</td><td>${row.shelf}</td><td>${row.storage}</td><td><strong>${row.on_hand}</strong></td><td><span class="issue issue-${row.issue.toLowerCase().replaceAll(' ','-')}">${escapeHtml(row.issue)}</span></td></tr>`).join(''):'<tr class="empty-row"><td colspan="6">No products currently require attention.</td></tr>';

    const pending=data.pending_purchase_requests||[];
    $('#pendingRows').innerHTML=pending.length?pending.map(row=>`<tr><td><strong>${escapeHtml(row.pr_number)}</strong></td><td>${escapeHtml(row.requested_by)}</td><td>${row.items}</td><td>${escapeHtml(String(row.submitted_at||row.request_date).slice(0,16))}</td><td><span class="risk-badge risk-${String(row.stock_risk).toLowerCase().replaceAll(' ','-')}">${escapeHtml(row.stock_risk)}</span></td><td><a class="review-link" href="supervisor_approval.html?pr_id=${encodeURIComponent(row.pr_id)}">Review</a></td></tr>`).join(''):'<tr class="empty-row"><td colspan="6">No requests require your decision in this period.</td></tr>';
}

async function loadDashboard(){
    const preset=$('#periodPreset').value;const params=new URLSearchParams({preset});
    if(preset==='custom'){params.set('start_date',$('#startDate').value);params.set('end_date',$('#endDate').value);}
    $('#dashboardContent').classList.add('is-loading');$('#dashboardContent').setAttribute('aria-busy','true');$('#dashboardLoading').classList.remove('d-none');$('#dashboardError').classList.add('d-none');
    try{const response=await fetch(`${API_BASE_URL}/dashboard/get_supervisor_dashboard.php?${params}`,{credentials:'include',cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok||data.status!=='success')throw new Error(data.message||'Unable to load dashboard.');$('#startDate').value=data.period.start_date;$('#endDate').value=data.period.end_date;render(data);$('#filterStatus').textContent=`Showing ${data.period.start_date} to ${data.period.end_date}`;}
    catch(error){$('#dashboardError').textContent=error.message;$('#dashboardError').classList.remove('d-none');}
    finally{$('#dashboardContent').classList.remove('is-loading');$('#dashboardContent').setAttribute('aria-busy','false');$('#dashboardLoading').classList.add('d-none');}
}

$('#periodPreset').addEventListener('change',event=>{setDates(event.target.value);const custom=event.target.value==='custom';$('#startDate').disabled=!custom;$('#endDate').disabled=!custom;});
$('#overviewFilter').addEventListener('submit',event=>{event.preventDefault();if($('#startDate').value>$('#endDate').value){$('#dashboardError').textContent='Start date cannot be after end date.';$('#dashboardError').classList.remove('d-none');return;}loadDashboard();});
$('#resetFilter').addEventListener('click',()=>{$('#periodPreset').value='last_30_days';setDates('last_30_days');$('#startDate').disabled=true;$('#endDate').disabled=true;loadDashboard();});
$('#themeToggle')?.addEventListener('click',()=>{const dark=document.body.classList.toggle('dark-mode');document.documentElement.dataset.bsTheme=dark?'dark':'light';localStorage.setItem('drpTheme',dark?'dark':'light');Object.values(charts).forEach(instance=>instance.update());});
setDates('last_30_days');$('#startDate').disabled=true;$('#endDate').disabled=true;loadDashboard();
