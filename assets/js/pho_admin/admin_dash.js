/* ==========================================================================
   SYSTEM OVERVIEW (DASHBOARD) — page script
   Self-contained: no shared files are required.

   Sections:
     1. Sidebar (TRANSITIONAL — replace when the master sidebar is finalized)
     2. Helpers
     3. Sample data (in-memory only; nothing is persisted)
     4. Actions
     5. Rendering
     6. Events
     7. Initialization
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
    const logoutBtn = document.getElementById('logoutBtn');
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

    const findById = (list, id) => list.find((item) => item.id === id);

    const nowStamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

    function nextId(list, prefix) {
        const max = list.reduce((m, x) => Math.max(m, parseInt(x.id.split('-')[1], 10) || 0), 0);
        return `${prefix}-${String(max + 1).padStart(3, '0')}`;
    }

    const toastEl = document.getElementById('toast');
    let toastTimer = null;

    function toast(message) {
        toastEl.textContent = message;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
    }

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

    const facilities = [
        { id: 'ABTC-001', name: 'Sample Central ABTC',   district: 'District 1', status: 'Active',    registered: '2026-01-15' },
        { id: 'ABTC-002', name: 'Sample Riverside ABTC', district: 'District 2', status: 'Pending',   registered: '2026-10-14' },
        { id: 'ABTC-003', name: 'Sample Northgate ABTC', district: 'District 3', status: 'Suspended', registered: '2026-03-02' },
        { id: 'ABTC-004', name: 'Sample Coastal ABTC',   district: 'District 4', status: 'Inactive',  registered: '2026-05-20' },
        { id: 'ABTC-005', name: 'Sample Hillside ABTC',  district: 'District 5', status: 'Pending',   registered: '2026-10-17' }
    ];

    const users = [
        { id: 'U-001', name: 'Alex Morgan', status: 'Active' },
        { id: 'U-002', name: 'Jamie Reyes', status: 'Active' },
        { id: 'U-003', name: 'Sam Lee',     status: 'Active' },
        { id: 'U-004', name: 'Taylor Cruz', status: 'Inactive' }
    ];

    const audit = [
        { id: 'A-005', timestamp: '2026-10-17 15:20', action: 'Facility Updated',   affected: 'Sample Hillside ABTC (ABTC-005)',  performedBy: CURRENT_ADMIN, details: 'Facility information updated' },
        { id: 'A-004', timestamp: '2026-10-16 10:02', action: 'Role Changed',       affected: 'Sam Lee (U-003)',                  performedBy: CURRENT_ADMIN, details: 'Admin → Facility Manager' },
        { id: 'A-003', timestamp: '2026-10-14 09:44', action: 'Facility Suspended', affected: 'Sample Northgate ABTC (ABTC-003)', performedBy: CURRENT_ADMIN, details: 'Status changed from Active to Suspended' },
        { id: 'A-002', timestamp: '2026-10-10 13:31', action: 'Account Created',    affected: 'Taylor Cruz (U-004)',              performedBy: CURRENT_ADMIN, details: 'Role assigned: Viewer' },
        { id: 'A-001', timestamp: '2026-01-15 08:00', action: 'Facility Approved',  affected: 'Sample Central ABTC (ABTC-001)',   performedBy: CURRENT_ADMIN, details: 'Status changed from Pending to Active' }
    ];

    /* ======================================================================
       4. ACTIONS
       ====================================================================== */

    function logAudit(action, affected, details) {
        audit.unshift({
            id: nextId(audit, 'A'),
            timestamp: nowStamp(),
            action,
            affected,
            performedBy: CURRENT_ADMIN,
            details
        });
    }

    function setFacilityStatus(facility, next) {
        if (facility.status === next) return;

        const prev = facility.status;
        facility.status = next;

        const action =
            next === 'Suspended' ? 'Facility Suspended' :
            next === 'Inactive'  ? 'Facility Deactivated' :
            prev === 'Pending'   ? 'Facility Approved' :
                                   'Facility Activated';

        logAudit(action, `${facility.name} (${facility.id})`, `Status changed from ${prev} to ${next}`);
    }

    /* ======================================================================
       5. RENDERING
       ====================================================================== */

    function renderStats() {
        const count = (list, fn) => list.filter(fn).length;

        $('#statTotalFacilities').textContent = facilities.length;
        $('#statActiveUsers').textContent = count(users, (u) => u.status === 'Active');
        $('#statActiveFacilities').textContent = count(facilities, (f) => f.status === 'Active');
        $('#statPending').textContent = count(facilities, (f) => f.status === 'Pending');
        $('#statSuspended').textContent = count(facilities, (f) => f.status === 'Suspended' || f.status === 'Inactive');
    }

    function renderOverviewLists() {
        const pending = facilities.filter((f) => f.status === 'Pending');

        $('#pendingList').innerHTML = pending.length
            ? pending.map((f) => `
                <li>
                    <div class="li-main">
                        <strong>${esc(f.name)}</strong>
                        <small>${esc(f.district)} · Registered ${esc(f.registered)}</small>
                    </div>
                    <button class="btn btn-success btn-sm" data-action="approve-facility" data-id="${esc(f.id)}">Approve</button>
                </li>`).join('')
            : '<li><span class="muted">No pending approvals.</span></li>';

        $('#recentActivity').innerHTML = audit.slice(0, 5).map((a) => `
            <li>
                <div class="li-main">
                    <strong>${esc(a.action)}</strong>
                    <small>${esc(a.affected)} · ${esc(a.performedBy)}</small>
                </div>
                <small>${esc(a.timestamp)}</small>
            </li>`).join('');
    }

    function renderAll() {
        renderStats();
        renderOverviewLists();
    }

    /* ======================================================================
       6. EVENTS
       ====================================================================== */

    document.addEventListener('click', function (e) {
        // Approve a pending facility from the overview list
        const approveBtn = e.target.closest('[data-action="approve-facility"]');
        if (approveBtn) {
            const facility = findById(facilities, approveBtn.dataset.id);
            if (facility) {
                setFacilityStatus(facility, 'Active');
                toast(`${facility.name} approved.`);
                renderAll();
            }
            return;
        }

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

    /* ======================================================================
       7. INITIALIZATION
       ====================================================================== */

    applySidebarState(readSidebarState());
    renderAll();
})();