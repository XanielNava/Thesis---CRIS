// ==========================================================================
// sidebar.js - Universal SaaS Sidebar Controller for PHO & ABTC Modules
// ==========================================================================

(function () {
    'use strict';

    const SIDEBAR_KEY = 'sidebarCollapsed';
    const PRE_COLLAPSED_CLASS = 'sidebar-pre-collapsed';
    const READY_CLASS = 'sidebar-ready';

    function initUniversalSidebar() {
        const sidebar = document.getElementById('sidebar');
        const sidebarToggle = document.getElementById('sidebarToggle');
        const layoutWrapper = document.getElementById('appLayout') || document.querySelector('.container, .app-container');

        if (!sidebar || !sidebarToggle) return;

        function readState() {
            try {
                return localStorage.getItem(SIDEBAR_KEY) === 'true';
            } catch (e) {
                return false;
            }
        }

        function storeState(isCollapsed) {
            try {
                localStorage.setItem(SIDEBAR_KEY, String(isCollapsed));
            } catch (e) { /* storage unavailable */ }
        }

        function applyState(isCollapsed) {
            sidebar.classList.toggle('collapsed', isCollapsed);

            if (layoutWrapper) {
                layoutWrapper.classList.toggle('sidebar-collapsed', isCollapsed);
                layoutWrapper.classList.toggle('collapsed', isCollapsed);
            }

            sidebarToggle.setAttribute('aria-expanded', String(!isCollapsed));
        }

        // 1. Initial state restoration (the pre-collapse class keeps this paint animation-free)
        applyState(readState());

        // 2. Release the load-time locks after the first paint.
        //    Until `sidebar-ready` exists, the CSS blocks sidebar/layout transitions, so nothing
        //    can animate while the page settles (this works even on pages that lack the inline
        //    pre-collapse script). The pre-collapse class is dropped too, otherwise it would keep
        //    `transition: none` on the whole page and kill the collapse animation.
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                document.documentElement.classList.remove(PRE_COLLAPSED_CLASS);
                document.documentElement.classList.add(READY_CLASS);
            });
        });

        // 3. Toggle click handler
        sidebarToggle.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            const nextState = !sidebar.classList.contains('collapsed');

            applyState(nextState);
            storeState(nextState);
        });

        // 4. Back/forward cache restores the old DOM; re-sync with the saved state
        window.addEventListener('pageshow', function (e) {
            if (e.persisted) applyState(readState());
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUniversalSidebar);
    } else {
        initUniversalSidebar();
    }
})();