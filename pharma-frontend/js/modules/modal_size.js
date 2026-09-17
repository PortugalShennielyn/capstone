const SIZE_VARIANTS = {
    small: { width: 520, height: 360, minWidth: 360, minHeight: 220, maxWidthRatio: 0.92, maxHeightRatio: 0.88 },
    medium: { width: 820, height: 560, minWidth: 520, minHeight: 360, maxWidthRatio: 0.94, maxHeightRatio: 0.9 },
    large: { width: 1180, height: 720, minWidth: 680, minHeight: 460, maxWidthRatio: 0.95, maxHeightRatio: 0.92 },
    xlarge: { width: 1450, height: 850, minWidth: 760, minHeight: 520, maxWidthRatio: 0.96, maxHeightRatio: 0.94 }
};

const managedModals = new Map();

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function viewportLimits(config) {
    const workspace = window.DrpModalWorkspace;
    const area = workspace.bounds(window.innerWidth <= 820 ? 12 : 16);
    const margin = area.gap;
    const maxWidth = Math.max(
        Math.min(config.minWidth, area.width),
        Math.min(area.width, Math.floor(area.width * config.maxWidthRatio))
    );
    const maxHeight = Math.max(
        Math.min(config.minHeight, area.height),
        Math.min(area.height, Math.floor(area.height * config.maxHeightRatio))
    );

    return {
        margin,
        minWidth: Math.min(config.minWidth, maxWidth),
        minHeight: Math.min(config.minHeight, maxHeight),
        maxWidth,
        maxHeight,
        area
    };
}

function modalParts(modalId) {
    const modal = document.getElementById(modalId);
    const dialog = modal?.querySelector('.modal-dialog') || null;
    const content = modal?.querySelector('.modal-content') || null;
    return { modal, dialog, content };
}

function setModalRect(state, nextRect = {}) {
    const { modal, dialog } = state;
    if (!modal || !dialog) return;

    const current = dialog.getBoundingClientRect();
    const limits = viewportLimits(state.config);
    const width = clamp(nextRect.width ?? current.width, limits.minWidth, limits.maxWidth);
    const height = clamp(nextRect.height ?? current.height, limits.minHeight, limits.maxHeight);
    const constrained = window.DrpModalWorkspace.constrain({
        left: nextRect.left ?? current.left,
        top: nextRect.top ?? current.top,
        width,
        height
    }, limits.margin);
    const { left, top } = constrained;

    modal.classList.add('drp-modal-managed', 'drp-modal-positioned');
    modal.dataset.drpManagedSize = 'true';
    modal.style.setProperty('--drp-modal-left', `${left}px`);
    modal.style.setProperty('--drp-modal-top', `${top}px`);
    modal.style.setProperty('--drp-modal-current-width', `${width}px`);
    modal.style.setProperty('--drp-modal-current-height', `${height}px`);
    state.config.onResize?.({ width, height, modal, dialog });
}

function defaultRect(state) {
    const limits = viewportLimits(state.config);
    const width = clamp(state.config.width, limits.minWidth, limits.maxWidth);
    const height = clamp(state.config.height, limits.minHeight, limits.maxHeight);

    return window.DrpModalWorkspace.center({ width, height }, limits.margin);
}

function resetModal(state) {
    const { modal, dialog } = state;
    if (!modal || !dialog) return;

    dialog.querySelector('.modal-body')?.scrollTo?.({ top: 0, left: 0 });
    dialog.querySelectorAll('.table-responsive, .batch-table-wrapper').forEach((scroller) => {
        scroller.scrollTo?.({ top: 0, left: 0 });
    });
    setModalRect(state, defaultRect(state));
}

function pointerAllowed(event) {
    return event.pointerType !== 'mouse' || event.button === 0;
}

function attachDrag(state) {
    const header = state.modal.querySelector('.modal-header');
    if (!header || state.config.draggable === false) return;

    header.addEventListener('pointerdown', (event) => {
        if (!pointerAllowed(event)) return;
        if (state.isResizing) return;
        if (event.target.closest('button, input, select, textarea, a, [data-bs-dismiss]')) return;

        event.preventDefault();
        state.isDragging = true;
        const startX = event.clientX;
        const startY = event.clientY;
        const start = state.dialog.getBoundingClientRect();
        header.setPointerCapture?.(event.pointerId);

        const move = (moveEvent) => {
            if (!state.isDragging) return;
            setModalRect(state, {
                left: start.left + moveEvent.clientX - startX,
                top: start.top + moveEvent.clientY - startY,
                width: start.width,
                height: start.height
            });
        };

        const stop = () => {
            state.isDragging = false;
            header.releasePointerCapture?.(event.pointerId);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
            window.removeEventListener('pointercancel', stop);
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop, { once: true });
        window.addEventListener('pointercancel', stop, { once: true });
    });
}

function ensureHandle(state, direction) {
    const className = direction === 'both' ? 'drp-modal-resize-handle' : 'drp-modal-edge-handle';
    let handle = state.content.querySelector(`[data-drp-resize-handle="${direction}"]`);
    if (handle) return handle;

    handle = document.createElement('button');
    handle.type = 'button';
    handle.className = className;
    handle.dataset.drpResizeHandle = direction;
    handle.dataset.direction = direction;
    handle.setAttribute('aria-label', direction === 'both' ? 'Resize modal' : `Resize modal ${direction}`);
    state.content.appendChild(handle);
    return handle;
}

function attachResizeHandle(state, direction) {
    const handle = ensureHandle(state, direction);

    handle.addEventListener('pointerdown', (event) => {
        if (!pointerAllowed(event)) return;
        if (state.isDragging) return;

        event.preventDefault();
        state.isResizing = true;
        document.body.style.userSelect = 'none';
        handle.classList.add('is-resizing');
        handle.setPointerCapture?.(event.pointerId);

        const startX = event.clientX;
        const startY = event.clientY;
        const start = state.dialog.getBoundingClientRect();
        let frame = null;
        let pendingEvent = null;

        const applyResize = () => {
            if (!pendingEvent) return;
            const moveEvent = pendingEvent;
            pendingEvent = null;
            const resizeWidth = direction === 'both' || direction === 'right';
            const resizeHeight = direction === 'both' || direction === 'bottom';
            setModalRect(state, {
                left: start.left,
                top: start.top,
                width: resizeWidth ? start.width + moveEvent.clientX - startX : start.width,
                height: resizeHeight ? start.height + moveEvent.clientY - startY : start.height
            });
            frame = null;
        };

        const move = (moveEvent) => {
            pendingEvent = moveEvent;
            if (!frame) frame = window.requestAnimationFrame(applyResize);
        };

        const stop = () => {
            state.isResizing = false;
            document.body.style.userSelect = '';
            handle.classList.remove('is-resizing');
            handle.releasePointerCapture?.(event.pointerId);
            if (frame) window.cancelAnimationFrame(frame);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
            window.removeEventListener('pointercancel', stop);
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop, { once: true });
        window.addEventListener('pointercancel', stop, { once: true });
    });
}

function attachResizeObserver(state) {
    if (!window.ResizeObserver) return;

    state.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const width = entry.contentRect.width;
        const layout = width >= 1150 ? 'wide' : (width >= 850 ? 'medium' : 'stacked');
        state.modal.dataset.modalLayout = layout;
        state.config.onResize?.({ width, height: entry.contentRect.height, modal: state.modal, dialog: state.dialog, layout });
    });
    state.resizeObserver.observe(state.content);
}

export function configureResizableModal(modalId, options = {}) {
    const { modal, dialog, content } = modalParts(modalId);
    if (!modal || !dialog || !content) return null;
    if (managedModals.has(modalId)) return managedModals.get(modalId);

    const variant = SIZE_VARIANTS[options.variant || 'medium'] || SIZE_VARIANTS.medium;
    const config = { ...variant, ...options };
    const state = { modal, dialog, content, config, isDragging: false, isResizing: false, resizeObserver: null };
    managedModals.set(modalId, state);

    modal.dataset.drpManagedSize = 'true';
    modal.classList.add('drp-modal-managed');
    dialog.classList.add(`modal-size-${options.variant || 'medium'}`);
    dialog.style.setProperty('--drp-modal-width', `${config.width}px`);
    dialog.style.setProperty('--drp-modal-max-width', `${config.width}px`);
    dialog.style.setProperty('--drp-modal-min-width', `${config.minWidth}px`);
    content.style.setProperty('--drp-modal-min-height', `${config.minHeight}px`);

    attachDrag(state);
    if (config.resizable !== false) {
        attachResizeHandle(state, 'both');
    }
    attachResizeObserver(state);

    modal.addEventListener('show.bs.modal', () => resetModal(state));
    modal.addEventListener('shown.bs.modal', () => resetModal(state));
    modal.addEventListener('hidden.bs.modal', () => {
        modal.classList.remove('drp-modal-positioned');
        modal.dataset.modalLayout = '';
        state.config.onClose?.({ modal, dialog });
    });
    window.addEventListener('resize', () => {
        if (modal.classList.contains('show')) setModalRect(state);
    });

    return state;
}

export function resetResizableModal(modalId) {
    const state = managedModals.get(modalId);
    if (state) resetModal(state);
}
