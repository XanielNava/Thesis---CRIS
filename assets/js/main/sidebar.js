(function () {
    'use strict';

    /* ==========================================================================
       1. ZERO-FLICKER SIDEBAR COLLAPSE ENGINE
       ========================================================================== */
    function initSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggle = document.getElementById('sidebarToggle');
        const layout = document.getElementById('appLayout') || document.querySelector('.container');
        if (!sidebar || !toggle) return;

        const applyState = (collapsed) => {
            sidebar.classList.toggle('collapsed', collapsed);
            if (layout) layout.classList.toggle('sidebar-collapsed', collapsed);
            toggle.setAttribute('aria-expanded', String(!collapsed));
        };

        // Apply saved collapse state immediately
        applyState(localStorage.getItem('sidebarCollapsed') === 'true');

        // Unlock CSS transitions on <html> after initial paint settles
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.documentElement.classList.add('sidebar-ready');
                document.documentElement.classList.remove('sidebar-pre-collapsed');
            });
        });

        toggle.addEventListener('click', () => {
            const willCollapse = !sidebar.classList.contains('collapsed');
            applyState(willCollapse);
            localStorage.setItem('sidebarCollapsed', String(willCollapse));

            // Allow Leaflet maps / Chart.js canvases to recalculate dimensions after transition
            setTimeout(() => window.dispatchEvent(new Event('resize')), 310);
        });
    }

    /* ==========================================================================
       2. UNIFIED LOGOUT MODAL ENGINE
       ========================================================================== */
    function resolveLoginRedirect() {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('/pho/')) return 'pho-login.html';
        if (path.includes('/abtc/')) return 'abtc-login.html';
        return 'pvo-login.html';
    }

    function ensureLogoutModalDOM() {
        if (document.getElementById('logoutConfirmModal')) return;

        const modalHTML = `
            <div id="logoutConfirmModal" role="alertdialog" aria-modal="true" aria-hidden="true">
                <div class="logout-modal-box">
                    <div class="confirm-body">
                        <div class="logout-icon-bubble">
                            <i class="fa-solid fa-arrow-right-from-bracket"></i>
                        </div>
                        <h2>Sign Out of CRIS?</h2>
                        <p>Are you sure you want to end your current session? You will need to log in again to access the provincial ledger.</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn-modal btn-cancel" id="cancelLogoutBtn">Cancel</button>
                        <button type="button" class="btn-modal btn-danger-solid" id="confirmLogoutBtn">
                            <i class="fa-solid fa-arrow-right-from-bracket"></i> Yes, Sign Out
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    function initLogoutFlow() {
        ensureLogoutModalDOM();

        const logoutBtn = document.getElementById('logout-btn');
        const modal = document.getElementById('logoutConfirmModal');
        const cancelBtn = document.getElementById('cancelLogoutBtn');
        const confirmBtn = document.getElementById('confirmLogoutBtn');

        if (!logoutBtn || !modal) return;

        const openModal = () => {
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            cancelBtn?.focus();
        };

        const closeModal = () => {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        };

        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openModal();
        });

        cancelBtn?.addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                closeModal();
            }
        });

        confirmBtn?.addEventListener('click', async () => {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing out...';

            try {
                const { auth } = await import('../firebase/firebase-config.js');
                const { signOut } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
                await signOut(auth);
            } catch (err) {
                console.warn('Firebase signout skipped or failed:', err);
            } finally {
                sessionStorage.clear();
                window.location.href = resolveLoginRedirect();
            }
        });
    }

    /* ==========================================================================
       3. DOM INITIALIZATION
       ========================================================================== */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initSidebar();
            initLogoutFlow();
        });
    } else {
        initSidebar();
        initLogoutFlow();
    }
})();