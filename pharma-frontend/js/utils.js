/**
 * PharmaUtils - Global Notification & Modal Error Handling Layer
 * Preserves the original UX using SweetAlert2 and Toastr.
 */
const PharmaUtils = {

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
        try {
            const response = await fetch(url, options);

            // Try to read the response as text first to capture raw PHP formatting errors
            const rawText = await response.text();
            let data;

            try {
                data = JSON.parse(rawText);
            } catch (jsonErr) {
                throw new Error("Server returned an invalid non-JSON response.");
            }

            if (!response.ok || data.status === 'error') {
                throw new Error(data.message || `HTTP Error! Status: ${response.status}`);
            }

            return data;

        } catch (error) {
            // Forward the error to be explicitly caught by your operational pages
            throw error;
        }
    }
};

// Make it accessible across your other vanilla JS module files
export default PharmaUtils;
