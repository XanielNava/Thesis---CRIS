/* ==========================================================================
   PVO ADMIN DASHBOARD — page script (matches admin_dash_560284.html)

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

    // PVO personnel accounts. Status: 'Active', 'Pending', or 'Inactive'.
    const users = [
        { id: 'U-001', name: 'Alex Morgan',        role: 'Provincial Veterinarian', status: 'Active',   registered: '2026-01-15' },
        { id: 'U-002', name: 'Jamie Reyes',        role: 'Veterinary Technician',   status: 'Active',   registered: '2026-02-10' },
        { id: 'U-003', name: 'Sam Lee',            role: 'Data Encoder',            status: 'Active',   registered: '2026-03-04' },
        { id: 'U-004', name: 'Taylor Cruz',        role: 'Field Officer',           status: 'Inactive', registered: '2026-05-20' },
        { id: 'U-005', name: 'Morgan Villanueva',  role: 'Field Officer',           status: 'Pending',  registered: '2026-10-14' },
        { id: 'U-006', name: 'Riley Santos',       role: 'Data Encoder',            status: 'Pending',  registered: '2026-10-17' }
    ];

    const audit = [
        { id: 'A-005', timestamp: '2026-10-17 15:20', action: 'Account Created',   affected: 'Riley Santos (U-006)',  performedBy: CURRENT_ADMIN, details: 'Role assigned: Data Encoder' },
        { id: 'A-004', timestamp: '2026-10-16 10:02', action: 'Role Changed',      affected: 'Sam Lee (U-003)',       performedBy: CURRENT_ADMIN, details: 'Field Officer → Data Encoder' },
        { id: 'A-003', timestamp: '2026-10-14 09:44', action: 'Account Deactivated', affected: 'Taylor Cruz (U-004)', performedBy: CURRENT_ADMIN, details: 'Status changed from Active to Inactive' },
        { id: 'A-002', timestamp: '2026-10-10 13:31', action: 'Account Created',   affected: 'Morgan Villanueva (U-005)', performedBy: CURRENT_ADMIN, details: 'Role assigned: Field Officer' },
        { id: 'A-001', timestamp: '2026-01-15 08:00', action: 'Account Approved',  affected: 'Alex Morgan (U-001)',   performedBy: CURRENT_ADMIN, details: 'Status changed from Pending to Active' }
    ];

    /* ======================================================================
       2. HELPERS
       ====================================================================== */

    const $ = (id) => document.getElementById(id);

    const setText = (id, value) => {
        const el = $(id);
        if (el) el.textContent = value;
    };

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
        if (!el) return;
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
    }

    /* ======================================================================
       3. ACTIONS
       ====================================================================== */

    function approveUser(userId) {
        const user = users.find((u) => u.id === userId);
        if (!user || user.status !== 'Pending') return;

        user.status = 'Active';
        logAudit(
            'Account Approved',
            `${user.name} (${user.id})`,
            'Status changed from Pending to Active'
        );
        showToast(`${user.name} approved.`);
        renderAll();
    }

    /* ======================================================================
       4. RENDERING
       ====================================================================== */

    function renderStats() {
        const activeAccounts = users.filter((u) => u.status === 'Active').length;
        const pending = users.filter((u) => u.status === 'Pending').length;

        setText('statActiveUsers', activeAccounts);
        setText('statPending', pending);
    }

    function renderPending() {
        const list = $('pendingList');
        if (!list) return;

        const pending = users.filter((u) => u.status === 'Pending');

        list.innerHTML = pending.length
            ? pending.map((u) => `
                <li>
                    <div class="li-main">
                        <strong>${esc(u.name)}</strong>
                        <small>${esc(u.role)} · Registered ${esc(u.registered)}</small>
                    </div>
                    <button type="button" class="btn btn-success btn-sm" data-action="approve" data-id="${esc(u.id)}">Approve</button>
                </li>`).join('')
            : '<li><span class="muted">No pending PVO personnel approvals.</span></li>';
    }

    function renderActivity() {
        const list = $('recentActivity');
        if (!list) return;

        list.innerHTML = audit.slice(0, 5).map((a) => `
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
        if (!modal) return;
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeLogout() {
        const modal = $('logoutModal');
        if (!modal) return;
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }

    /* ======================================================================
       6. EVENTS
       ====================================================================== */

    function bindEvents() {
        // Approve buttons in the pending list
        const pendingList = $('pendingList');
        if (pendingList) {
            pendingList.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action="approve"]');
                if (btn) approveUser(btn.dataset.id);
            });
        }

        // Logout dialog
        const logoutBtn = $('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', openLogout);

        const logoutConfirm = $('logoutConfirm');
        if (logoutConfirm) {
            logoutConfirm.addEventListener('click', () => {
                window.location.href = 'pvo-login.html';
            });
        }

        document.querySelectorAll('[data-close]').forEach((btn) => {
            btn.addEventListener('click', closeLogout);
        });

        const logoutModal = $('logoutModal');
        if (logoutModal) {
            logoutModal.addEventListener('click', (e) => {
                if (e.target === logoutModal) closeLogout();
            });
        }

        document.addEventListener('keydown', (e) => {
            const modal = $('logoutModal');
            if (e.key === 'Escape' && modal && modal.classList.contains('open')) {
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