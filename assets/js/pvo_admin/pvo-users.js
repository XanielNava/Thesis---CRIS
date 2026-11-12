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