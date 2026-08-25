/**
 * PharmaUtils - Global Notification & Modal Error Handling Layer
 * Preserves the original UX using SweetAlert2 and Toastr.
 */
const PharmaUtils = {

    productIdentitySeparator: ' \u2022 ',

    normalizeDisplayText(value) {
        const text = String(value ?? '').trim();
        if (!text || ['n/a', 'null', 'undefined', 'none'].includes(text.toLowerCase())) {
            return '';
        }

        return text
            .replace(/\u00c3\u00a2\u00e2\u201a\u00ac\u00c2\u00a2|\u00e2\u20ac\u00a2|&bull;|&#8226;/g, this.productIdentitySeparator.trim())
            .replace(/(\d+(?:\.\d+)?)\s+%/g, '$1%')
            .replace(/\s+/g, ' ')
            .trim();
    },

    formatProductIdentity(parts) {
        const seen = new Set();
        return parts
            .map((part) => this.normalizeDisplayText(part))
            .filter((part) => {
                if (!part) return false;
                const key = part.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .join(this.productIdentitySeparator);
    },

    // 1. Lightweight Toast Notifications (Perfect for rapid feedback like logins/theme toggles)
    toast: {
        success(message) {
            if (typeof toastr !== 'undefined') {
                toastr.success(message);
            } else {
                console.log("Success: " + message);
            }
        },
        error(message) {
            if (typeof toastr !== 'undefined') {
                toastr.error(message);
            } else {
                console.error("Error: " + message);
            }
        }
    },

    // 2. Heavy Workflow Popups (Blocking SweetAlert2 Modals that appear above the UI)
    modal: {
        // Standard blocking success modal with a purple confirm button
        success(title, message) {
            return Swal.fire({
                icon: 'success',
                title: title || 'Success',
                text: message,
                confirmButtonColor: '#8A2BE2' // Matching your purple accent color
            });
        },

        // This is your exact Modal Error Handling Feature requested for Clerk/Cashier flows
        error(title, message) {
            return Swal.fire({
                icon: 'error',
                title: title || 'Error encountered',
                text: message,
                confirmButtonColor: '#dc3545', // Red confirm button for errors
                allowOutsideClick: true
            });
        },

        // Loading Modal (Prevents users from clicking things twice while an API runs)
        loading(message) {
            Swal.fire({
                title: message || 'Processing...',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
        },

        // Close any active SweetAlert modal cleanly
        close() {
            Swal.close();
        },

        // Confirmation dialog (Perfect for "Send to Cashier" or "Void Sale")
        async confirm(title, text, confirmText = 'Yes, proceed') {
            const result = await Swal.fire({
                icon: 'question',
                title: title,
                text: text,
                showCancelButton: true,
                confirmButtonColor: '#8A2BE2',
                cancelButtonColor: '#6c757d',
                confirmButtonText: confirmText
            });
            return result.isConfirmed;
        }
    },

    // 3. Smart API Fetch Wrapper (Automatically handles loading states and parses JSON errors)
    async safeFetch(url, options = {}) {
        const method = String(options.method || 'GET').toUpperCase();
        const shouldRetry = method === 'GET' && options.retryGet !== false;
        const attempts = shouldRetry ? 2 : 1;
        let lastError;
        const fetchOptions = { ...options };
        delete fetchOptions.retryGet;
        const tabToken = sessionStorage.getItem('pharma_tab_token') || '';
        const headers = new Headers(options.headers || {});
        if (tabToken && !headers.has('X-Tab-Token')) {
            headers.set('X-Tab-Token', tabToken);
        }

        for (let attempt = 0; attempt < attempts; attempt++) {
            const controller = !options.signal ? new AbortController() : null;
            const timeout = controller ? setTimeout(() => controller.abort(), 10000) : null;
            const requestUrl = shouldRetry && attempt > 0
                ? `${url}${url.includes('?') ? '&' : '?'}_retry=${Date.now()}`
                : url;

            try {
                const response = await fetch(requestUrl, {
                    ...fetchOptions,
                    headers,
                    cache: shouldRetry ? 'no-store' : options.cache,
                    signal: options.signal || controller.signal
                });

                // Try to read the response as text first to capture raw PHP formatting errors
                const rawText = await response.text();
                let data;

                try {
                    data = JSON.parse(rawText);
                } catch (jsonErr) {
                    throw new Error("Server returned an invalid non-JSON response.");
                }

                if (!response.ok || data.status === 'error') {
                    const error = new Error(data.message || `HTTP Error! Status: ${response.status}`);
                    error.status = response.status;
                    error.isAuthError = response.status === 401;
                    error.isAuthorizationError = response.status === 403;
                    error.isHttpResponse = true;
                    throw error;
                }

                return data;

            } catch (error) {
                lastError = error.name === 'AbortError'
                    ? new Error('Request timed out. Please refresh and try again.')
                    : error;

                // Retrying a completed 4xx/5xx response only duplicates the same
                // failing action. Retries are reserved for transport failures.
                if (error.isHttpResponse) throw lastError;

                if (attempt === attempts - 1) {
                    // Forward the error to be explicitly caught by your operational pages
                    throw lastError;
                }
            } finally {
                if (timeout) clearTimeout(timeout);
            }
        }

        throw lastError;
    }
};

// Make it accessible across your other vanilla JS module files
export default PharmaUtils;
