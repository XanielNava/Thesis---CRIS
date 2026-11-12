/* ==========================================================================
   PVO ABTC MANAGEMENT — ADMIN DASHBOARD SCRIPT

   Sections
     1. Reference data (sample, in-memory only)
     2. Helpers
     3. Actions
     4. Rendering
     5. Logout dialog
     6. Events
     7. Initialization

   The sidebar is handled by sidebar.js (shared), so this file does not
   touch the sidebar.
   ========================================================================== */
(function () {
    'use strict';

    /* ======================================================================
       1. REFERENCE DATA
       ====================================================================== */

    const CURRENT_ADMIN = 'System Administrator (Super Admin)';

    const facilities = [
        { id: 'ABTC-001', name: 'Pavia Municipal ABTC',     municipality: 'Pavia',          status: 'Active',    registered: '2026-01-15' },
        { id: 'ABTC-002', name: 'Oton Municipal ABTC',      municipality: 'Oton',           status: 'Pending',   registered: '2026-10-14' },
        { id: 'ABTC-003', name: 'Santa Barbara ABTC',       municipality: 'Santa Barbara',  status: 'Suspended', registered: '2026-03-02' },
        { id: 'ABTC-004', name: 'Tigbauan Satellite ABTC',  municipality: 'Tigbauan',       status: 'Inactive',  registered: '2026-05-20' },
        { id: 'ABTC-005', name: 'Leganes Municipal ABTC',   municipality: 'Leganes',        status: 'Pending',   registered: '2026-10-17' }
    ];

    const users = [
        { id: 'U-001', name: 'Alex Morgan',  role: 'Provincial Veterinarian', status: 'Active' },
        { id: 'U-002', name: 'Jamie Reyes',  role: 'Veterinary Technician',   status: 'Active' },
        { id: 'U-003', name: 'Sam Lee',      role: 'Data Encoder',            status: 'Active' },
        { id: 'U-004', name: 'Taylor Cruz',  role: 'Field Officer',           status: 'Inactive' }
    ];

    const audit = [
        { id: 'A-005', timestamp: '2026-10-17 15:20', action: 'Facility Updated',   affected: 'Leganes Municipal ABTC (ABTC-005)', performedBy: CURRENT_ADMIN, details: 'Facility information updated' },
        { id: 'A-004', timestamp: '2026-10-16 10:02', action: 'Role Changed',       affected: 'Sam Lee (U-003)',                   performedBy: CURRENT_ADMIN, details: 'Field Officer → Data Encoder' },
        { id: 'A-003', timestamp: '2026-10-14 09:44', action: 'Facility Suspended', affected: 'Santa Barbara ABTC (ABTC-003)',     performedBy: CURRENT_ADMIN, details: 'Status changed from Active to Suspended' },
        { id: 'A-002', timestamp: '2026-10-10 13:31', action: 'Account Created',    affected: 'Taylor Cruz (U-004)',               performedBy: CURRENT_ADMIN, details: 'Role assigned: Field Officer' },
        { id: 'A-001', timestamp: '2026-01-15 08:00', action: 'Facility Approved',  affected: 'Pavia Municipal ABTC (ABTC-001)',   performedBy: CURRENT_ADMIN, details: 'Status changed from Pending to Active' }
    ];

    /* ======================================================================
       2. HELPERS
       ====================================================================== */

    const $ = (id) => document.getElementById(id);

    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const nowStamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

    function nextAuditId() {
        const max = audit.reduce((m, a) => {
            const n = parseInt(a.id.split('-')[1], 10);
            return Number.isNaN(n) ? m : Math.max(m, n);
        }, 0);
        return `A-${String(max + 1).padStart(3, '0')}`;
    }

    function logAudit(action, affected, details) {
        audit.unshift({
            id: nextAuditId(),
            timestamp: nowStamp(),
            action,
            affected,
            performedBy: CURRENT_ADMIN,
            details
        });
    }

    let toastTimer = null;

    function showToast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
    }

    /* ======================================================================
       3. ACTIONS
       ====================================================================== */

    function approveFacility(facilityId) {
        const facility = facilities.find((f) => f.id === facilityId);
        if (!facility || facility.status !== 'Pending') return;

        facility.status = 'Active';
        logAudit(
            'Facility Approved',
            `${facility.name} (${facility.id})`,
            'Status changed from Pending to Active'
        );
        showToast(`${facility.name} approved.`);
        renderAll();
    }

    /* ======================================================================
       4. RENDERING
       ====================================================================== */

    function renderStats() {
        const activeUsers = users.filter((u) => u.status === 'Active').length;
        const activeFacilities = facilities.filter((f) => f.status === 'Active').length;
        const pending = facilities.filter((f) => f.status === 'Pending').length;
        const deactivated = facilities.filter((f) => f.status === 'Suspended' || f.status === 'Inactive').length;

        $('statTotalFacilities').textContent = facilities.length;
        $('statActiveUsers').textContent = activeUsers;
        $('statActiveFacilities').textContent = activeFacilities;
        $('statPending').textContent = pending;
        $('statSuspended').textContent = deactivated;
    }

    function renderPending() {
        const pending = facilities.filter((f) => f.status === 'Pending');
        const list = $('pendingList');

        list.innerHTML = pending.length
            ? pending.map((f) => `
                <li>
                    <div class="li-main">
                        <strong>${esc(f.name)}</strong>
                        <small>${esc(f.municipality)} · Registered ${esc(f.registered)}</small>
                    </div>
                    <button type="button" class="btn btn-success btn-sm" data-action="approve" data-id="${esc(f.id)}">Approve</button>
                </li>`).join('')
            : '<li><span class="muted">No pending ABTC approvals.</span></li>';
    }

    function renderActivity() {
        $('recentActivity').innerHTML = audit.slice(0, 5).map((a) => `
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
        renderPending();
        renderActivity();
    }

    /* ======================================================================
       5. LOGOUT DIALOG
       ====================================================================== */

    function openLogout() {
        const modal = $('logoutModal');
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeLogout() {
        const modal = $('logoutModal');
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }

    /* ======================================================================
       6. EVENTS
       ====================================================================== */

    function bindEvents() {
        // Approve buttons in the pending list
        $('pendingList').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="approve"]');
            if (btn) approveFacility(btn.dataset.id);
        });

        // Logout dialog
        $('logoutBtn').addEventListener('click', openLogout);
        $('logoutConfirm').addEventListener('click', () => {
            window.location.href = 'pvo-login.html';
        });

        document.querySelectorAll('[data-close]').forEach((btn) => {
            btn.addEventListener('click', closeLogout);
        });

        $('logoutModal').addEventListener('click', (e) => {
            if (e.target === $('logoutModal')) closeLogout();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && $('logoutModal').classList.contains('open')) {
                closeLogout();
            }
        });
    }

    /* ======================================================================
       7. INITIALIZATION
       ====================================================================== */

    document.addEventListener('DOMContentLoaded', () => {
        bindEvents();
        renderAll();
    });
})();