/* ==========================================================================
   AUDIT LOGS — PHO ADMIN PAGE CONTROLLER (audits.js)
   Renders and filters live administrative audit logs from Firestore
   ========================================================================== */

import { fetchAuditLogsFromDb, logoutAdmin } from '../db/audits-db.js';

(function () {
    'use strict';

    /* ======================================================================
       1. MODAL ELEMENTS & HELPERS
       ====================================================================== */

    const logoutModal = document.getElementById('logoutModal');

    const $ = (selector) => document.querySelector(selector);

    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    function openModal(el) {
        if (!el) return;
        el.classList.add('open');
        el.style.display = 'flex';
        el.setAttribute('aria-hidden', 'false');
    }

    function closeModal(el) {
        if (!el) return;
        el.classList.remove('open');
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
    }

    /* ======================================================================
       2. LIVE DATA STATE & RENDERING
       ====================================================================== */

    let auditRecords = [];

    const tableBody = document.getElementById('auditTableBody');
    const emptyState = document.getElementById('auditEmpty');
    const searchInput = document.getElementById('auditSearch');
    const actionFilter = document.getElementById('auditActionFilter');

    async function loadAuditLogs() {
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px;">Loading audit logs from database...</td></tr>`;
        }

        try {
            auditRecords = await fetchAuditLogsFromDb();
            renderAudit();
        } catch (error) {
            console.error("Audit log load error:", error);
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center; padding: 24px;">Failed to load audit logs: ${esc(error.message)}</td></tr>`;
            }
        }
    }

    function renderAudit() {
        if (!Array.isArray(auditRecords)) auditRecords = [];

        const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const selectedAction = actionFilter ? actionFilter.value : '';

        const rows = auditRecords.filter((a) => {
            const matchesAction = !selectedAction || a.action.toLowerCase() === selectedAction.toLowerCase();
            const matchesQuery = !q || [a.action, a.affected, a.performedBy, a.details].join(' ').toLowerCase().includes(q);
            return matchesAction && matchesQuery;
        });

        if (!tableBody) return;

        if (rows.length === 0) {
            tableBody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        tableBody.innerHTML = rows.map((a) => `
            <tr>
                <td class="mono">${esc(a.timestamp)}</td>
                <td><strong>${esc(a.action)}</strong></td>
                <td>${esc(a.affected)}</td>
                <td>${esc(a.performedBy)}</td>
                <td class="muted">${esc(a.details)}</td>
            </tr>`).join('');
    }

    /* ======================================================================
       3. EVENTS & LOGOUT
       ====================================================================== */

    document.addEventListener('click', function (e) {
        // Open logout confirmation
        if (e.target.closest('#logoutBtn')) {
            openModal(logoutModal);
            return;
        }

        // Confirm logout
        if (e.target.closest('#logoutConfirm')) {
            logoutAdmin().then(() => {
                localStorage.clear();
                window.location.href = '../pho/pho-login.html';
            }).catch(() => {
                window.location.href = '../pho/pho-login.html';
            });
            return;
        }

        // Close buttons inside logout modal
        const closeBtn = e.target.closest('[data-close]');
        if (closeBtn) {
            closeModal(logoutModal);
            return;
        }

        // Click on backdrop closes modal
        if (e.target === logoutModal) {
            closeModal(logoutModal);
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && logoutModal && logoutModal.classList.contains('open')) {
            closeModal(logoutModal);
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', renderAudit);
    }

    if (actionFilter) {
        actionFilter.addEventListener('change', renderAudit);
    }

    /* ======================================================================
       4. INITIALIZATION
       ====================================================================== */

    loadAuditLogs();
})();