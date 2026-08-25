const CHANNEL_NAME = 'pharmacy-data-updates';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

export function publishDataUpdate(type, detail = {}) {
    const message = { type, detail, at: Date.now() };
    channel?.postMessage(message);
    window.dispatchEvent(new CustomEvent('pharmacy:data-update', { detail: message }));
}

export function createLiveSync({ interval = 5000, events = [], sync }) {
    if (typeof sync !== 'function') throw new TypeError('Live sync requires a sync callback.');
    const accepted = new Set(events);
    let stopped = false;
    let running = false;
    let timer = 0;

    const schedule = () => {
        window.clearTimeout(timer);
        if (!stopped) timer = window.setTimeout(() => run('poll'), interval);
    };

    const run = async (reason = 'manual') => {
        if (stopped || running) return;
        if (reason === 'poll' && document.visibilityState === 'hidden') {
            schedule();
            return;
        }
        running = true;
        try { await sync({ reason }); }
        catch (error) { console.warn('Background data sync failed.', error); }
        finally { running = false; schedule(); }
    };

    const receive = (message) => {
        const type = message?.data?.type || message?.detail?.type;
        if (!accepted.size || accepted.has(type)) run('event');
    };
    const visible = () => { if (document.visibilityState === 'visible') run('visible'); };

    channel?.addEventListener('message', receive);
    window.addEventListener('pharmacy:data-update', receive);
    document.addEventListener('visibilitychange', visible);
    schedule();

    return {
        sync: () => run('manual'),
        publish: publishDataUpdate,
        stop() {
            stopped = true;
            window.clearTimeout(timer);
            channel?.removeEventListener('message', receive);
            window.removeEventListener('pharmacy:data-update', receive);
            document.removeEventListener('visibilitychange', visible);
        }
    };
}
