import API_BASE_URL from '../config/config.js';
import { renderPurchaseOrderDocument } from './purchase_order_document.js?v=7';

const params = new URLSearchParams(location.search);
if (params.get('embed') === '1') document.body.classList.add('embed');

async function loadOrder() {
    const poId = String(params.get('po_id') || '').trim();
    if (!poId) throw new Error('A purchase order reference is required.');
    let order = null;
    if (params.get('embed') === '1' && window.parent !== window) {
        try {
            order = window.parent.__purchaseOrderPreviewCache?.get(poId) || null;
            window.parent.__purchaseOrderPreviewCache?.delete(poId);
        } catch (_) {
            order = null;
        }
    }
    if (!order) {
        const token = sessionStorage.getItem('pharma_tab_token') || '';
        const response = await fetch(`${API_BASE_URL}/purchase_orders/get_purchase_order.php?po_id=${encodeURIComponent(poId)}&t=${Date.now()}`, { credentials:'include', cache:'no-store', headers:token ? { 'X-Tab-Token':token } : {} });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.status !== 'success') throw new Error(payload.message || 'Unable to load this purchase order.');
        order = payload.purchase_order;
    }
    const container = document.getElementById('purchaseOrder');
    container.hidden = false;
    const result = renderPurchaseOrderDocument(order, container);
    document.getElementById('loading').hidden = true;
    document.title = `${order.po_number || 'Purchase Order'} | Doc R Pharmacy`;
    if (params.get('embed') === '1' && window.parent !== window) window.parent.postMessage({ type:'drp:purchase-order-preview-ready', height:result.height }, window.location.origin);
    if (params.get('print') === '1') window.setTimeout(() => window.print(), 250);
}

document.getElementById('printPo').addEventListener('click', () => window.print());
loadOrder().catch(error => {
    const loading = document.getElementById('loading');
    loading.className = 'error';
    loading.textContent = error.message || 'Unable to load this purchase order.';
});
