/* ==========================================================================
   AUDIT LOGS — page script
   Self-contained: no shared files are required.

   Sections:
     1. Sidebar (TRANSITIONAL — replace when the master sidebar is finalized)
     2. Helpers
     3. Sample data (in-memory only; nothing is persisted)
     4. Rendering
     5. Events
     6. Initialization
   ========================================================================== */
(function () {
    'use strict';

    /* ======================================================================
       1. SIDEBAR (TRANSITIONAL)
       Collapse/expand behavior matches sidebar-master.css. The state uses the
       same localStorage key as the master sidebar, so the preference carries
       across pages. Remove or replace this section when the sidebar is final.
       ====================================================================== */

    const SIDEBAR_KEY = 'sidebarCollapsed';

    const sidebar = document.getElementById('sidebar');
    const appLayout = document.getElementById('appLayout');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const logoutModal = document.getElementById('logoutModal');
    const logoutConfirm = document.getElementById('logoutConfirm');

    function readSidebarState() {
        try {
            return localStorage.getItem(SIDEBAR_KEY) === 'true';
        } catch (e) {
            return false;
        }
    }

    function storeSidebarState(collapsed) {
        try {
            localStorage.setItem(SIDEBAR_KEY, String(collapsed));
        } catch (e) { /* storage unavailable: state is not persisted */ }
    }

    function applySidebarState(collapsed) {
        sidebar.classList.toggle('collapsed', collapsed);
        appLayout.classList.toggle('sidebar-collapsed', collapsed);
        sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    }

    sidebarToggle.addEventListener('click', function () {
        const collapsed = !sidebar.classList.contains('collapsed');
        applySidebarState(collapsed);
        storeSidebarState(collapsed);
    });

    /* ======================================================================
       2. HELPERS
       ====================================================================== */

    const $ = (selector) => document.querySelector(selector);

    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    function openModal(el) {
        el.classList.add('open');
        el.setAttribute('aria-hidden', 'false');
    }

    function closeModal(el) {
        if (!el) return;
        el.classList.remove('open');
        el.setAttribute('aria-hidden', 'true');
    }

    /* ======================================================================
       3. SAMPLE DATA (in-memory only)
       ====================================================================== */

    const CURRENT_ADMIN = 'Alex Morgan (Super Admin)';

    const audit = [
        { id: 'A-005', timestamp: '2026-10-17 15:20', action: 'Facility Updated',   affected: 'Sample Hillside ABTC (ABTC-005)',  performedBy: CURRENT_ADMIN, details: 'Facility information updated' },
        { id: 'A-004', timestamp: '2026-10-16 10:02', action: 'Role Changed',       affected: 'Sam Lee (U-003)',                  performedBy: CURRENT_ADMIN, details: 'Admin → Facility Manager' },
        { id: 'A-003', timestamp: '2026-10-14 09:44', action: 'Facility Suspended', affected: 'Sample Northgate ABTC (ABTC-003)', performedBy: CURRENT_ADMIN, details: 'Status changed from Active to Suspended' },
        { id: 'A-002', timestamp: '2026-10-10 13:31', action: 'Account Created',    affected: 'Taylor Cruz (U-004)',              performedBy: CURRENT_ADMIN, details: 'Role assigned: Viewer' },
        { id: 'A-001', timestamp: '2026-01-15 08:00', action: 'Facility Approved',  affected: 'Sample Central ABTC (ABTC-001)',   performedBy: CURRENT_ADMIN, details: 'Status changed from Pending to Active' }
    ];

    /* ======================================================================
       4. RENDERING
       ====================================================================== */

    function renderAudit() {
        const q = $('#auditSearch').value.trim().toLowerCase();
        const action = $('#auditActionFilter').value;

        const rows = audit.filter((a) =>
            (!action || a.action === action) &&
            (!q || [a.action, a.affected, a.performedBy, a.details].join(' ').toLowerCase().includes(q))
        );

        $('#auditTableBody').innerHTML = rows.map((a) => `
            <tr>
                <td class="mono">${esc(a.timestamp)}</td>
                <td><strong>${esc(a.action)}</strong></td>
                <td>${esc(a.affected)}</td>
                <td>${esc(a.performedBy)}</td>
                <td class="muted">${esc(a.details)}</td>
            </tr>`).join('');

        $('#auditEmpty').classList.toggle('hidden', rows.length > 0);
    }

    /* ======================================================================
       5. EVENTS
       ====================================================================== */

    document.addEventListener('click', function (e) {
        // Open logout confirmation
        if (e.target.closest('#logoutBtn')) {
            openModal(logoutModal);
            return;
        }

        // Confirm logout
        if (e.target.closest('#logoutConfirm')) {
            window.location.href = 'admin-login.html'; // adjust to your login page
            return;
        }

        // Close buttons inside the logout modal
        const closeBtn = e.target.closest('[data-close]');
        if (closeBtn) {
            closeModal(closeBtn.closest('.logout-modal'));
            return;
        }

        // Click on the backdrop closes the logout modal
        if (e.target === logoutModal) {
            closeModal(logoutModal);
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && logoutModal.classList.contains('open')) {
            closeModal(logoutModal);
        }
    });

    ['auditSearch', 'auditActionFilter'].forEach((id) => {
        const el = document.getElementById(id);
        el.addEventListener('input', renderAudit);
        el.addEventListener('change', renderAudit);
    });

    /* ======================================================================
       6. INITIALIZATION
       ====================================================================== */

    applySidebarState(readSidebarState());
    renderAudit();
})();