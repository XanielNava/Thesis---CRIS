// ==========================================================================
// sidebar.js - Universal SaaS Sidebar Controller for PHO & ABTC Modules
// ==========================================================================

(function () {
    'use strict';

    const SIDEBAR_KEY = 'sidebarCollapsed';

    function initUniversalSidebar() {
        const sidebar = document.getElementById('sidebar');
        const sidebarToggle = document.getElementById('sidebarToggle');
        // Support both PHO layout (#appLayout) and ABTC layout (.container)
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
            } catch (e) { /* Storage unavailable */ }
        }

        function applyState(isCollapsed) {
            // 1. Toggle class on sidebar
            sidebar.classList.toggle('collapsed', isCollapsed);
            
            // 2. Clear or set the pre-collapse HTML lock so CSS does not override
            if (isCollapsed) {
                document.documentElement.classList.add('sidebar-pre-collapsed');
            } else {
                document.documentElement.classList.remove('sidebar-pre-collapsed');
            }

            // 3. Toggle both classes on the main layout wrapper
            if (layoutWrapper) {
                layoutWrapper.classList.toggle('sidebar-collapsed', isCollapsed);
                layoutWrapper.classList.toggle('collapsed', isCollapsed);
            }

            sidebarToggle.setAttribute('aria-expanded', String(!isCollapsed));
        }

        // Initial State Restoration
        applyState(readState());

        // Toggle Click Handler
        sidebarToggle.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            const isCurrentlyCollapsed = sidebar.classList.contains('collapsed') || 
                                         document.documentElement.classList.contains('sidebar-pre-collapsed');
            
            const nextState = !isCurrentlyCollapsed;
            applyState(nextState);
            storeState(nextState);
        });
    }

    // Initialize as soon as DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUniversalSidebar);
    } else {
        initUniversalSidebar();
    }
})();