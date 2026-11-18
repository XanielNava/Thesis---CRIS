/* ==========================================================================
   COMPLAINTS & SUPPORT — PHO ADMIN PAGE CONTROLLER (complaints.js)
   Live Firestore connection with table filtering & interactive status changes
   ========================================================================== */

import { fetchComplaintsFromDb, updateComplaintStatusInDb, logoutAdmin } from '../db/complaints-db.js';

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

    const slug = (text) => String(text).toLowerCase().replace(/\s+/g, '-');

    const badge = (text) => `<span class="badge badge-${slug(text)}">${esc(text)}</span>`;

    const toastEl = document.getElementById('toast');
    let toastTimer = null;

    function toast(message) {
        if (!toastEl) return;
        toastEl.textContent = message;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
    }

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
       2. DATA STATE & RENDERING
       ====================================================================== */

    const STATUS_OPTIONS = ['Open', 'In Progress', 'Resolved', 'Closed'];
    let complaints = [];

    const tableBody = document.getElementById('complaintTableBody');
    const emptyState = document.getElementById('complaintEmpty');
    const statusFilter = document.getElementById('complaintStatusFilter');
    const searchInput = document.getElementById('complaintSearch');

    async function loadComplaints() {
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px;">Loading complaints from database...</td></tr>`;
        }

        try {
            complaints = await fetchComplaintsFromDb();
            renderComplaints();
        } catch (error) {
            console.error("Failed to load complaints:", error);
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="7" style="color: red; text-align: center; padding: 24px;">Failed to load complaints: ${esc(error.message)}</td></tr>`;
            }
        }
    }

    function renderComplaints() {
        if (!Array.isArray(complaints)) complaints = [];

        const selectedStatus = statusFilter ? statusFilter.value : '';
        const q = searchInput ? searchInput.value.trim().toLowerCase() : '';

        const rows = complaints.filter((c) => {
            const matchesStatus = !selectedStatus || c.status.toLowerCase() === selectedStatus.toLowerCase();
            const matchesQuery = !q || [c.id, c.user, c.userEmail, c.module, c.description].join(' ').toLowerCase().includes(q);
            return matchesStatus && matchesQuery;
        });

        if (!tableBody) return;

        if (rows.length === 0) {
            tableBody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        tableBody.innerHTML = rows.map((c) => `
            <tr>
                <td class="mono"><code>${esc(c.id.substring(0, 8))}...</code></td>
                <td>
                    <strong>${esc(c.user)}</strong>
                    ${c.userEmail ? `<small style="display:block; color:#64748b;">${esc(c.userEmail)}</small>` : ''}
                </td>
                <td><span class="tag-module">${esc(c.module)}</span></td>
                <td class="wrap">${esc(c.description)}</td>
                <td>${esc(c.submitted)}</td>
                <td>${badge(c.status)}</td>
                <td>
                    <select class="inline-select" data-complaint-select data-id="${esc(c.id)}" data-module="${esc(c.module)}" aria-label="Status for ${esc(c.id)}">
                        ${STATUS_OPTIONS.map((s) => `<option value="${esc(s)}" ${s.toLowerCase() === c.status.toLowerCase() ? 'selected' : ''}>${esc(s)}</option>`).join('')}
                    </select>
                </td>
            </tr>`).join('');
    }

    /* ======================================================================
       3. ACTIONS & STATUS UPDATE
       ====================================================================== */

    async function handleStatusChange(dropdown) {
        const id = dropdown.dataset.id;
        const moduleName = dropdown.dataset.module;
        const nextStatus = dropdown.value;

        dropdown.disabled = true;

        try {
            await updateComplaintStatusInDb(id, moduleName, nextStatus);
            toast(`Complaint marked as ${nextStatus}.`);

            // Update in-memory item
            const item = complaints.find(c => c.id === id);
            if (item) item.status = nextStatus;

            renderComplaints();
        } catch (error) {
            console.error("Status update error:", error);
            alert("Failed to update status: " + error.message);
            dropdown.disabled = false;
        }
    }

    /* ======================================================================
       4. EVENTS
       ====================================================================== */

    // Status dropdown change in table
    document.addEventListener('change', function (e) {
        const dropdown = e.target.closest('[data-complaint-select]');
        if (dropdown) {
            handleStatusChange(dropdown);
        }
    });

    // Logout
    document.addEventListener('click', function (e) {
        if (e.target.closest('#logoutBtn')) {
            openModal(logoutModal);
            return;
        }

        if (e.target.closest('#logoutConfirm')) {
            logoutAdmin().then(() => {
                localStorage.clear();
                window.location.href = '../pho/pho-login.html';
            }).catch(() => {
                window.location.href = '../pho/pho-login.html';
            });
            return;
        }

        const closeBtn = e.target.closest('[data-close]');
        if (closeBtn) {
            closeModal(logoutModal);
            return;
        }

        if (e.target === logoutModal) {
            closeModal(logoutModal);
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && logoutModal && logoutModal.classList.contains('open')) {
            closeModal(logoutModal);
        }
    });

    if (statusFilter) {
        statusFilter.addEventListener('change', renderComplaints);
    }

    if (searchInput) {
        searchInput.addEventListener('input', renderComplaints);
    }

    /* ======================================================================
       5. INITIALIZATION
       ====================================================================== */

    loadComplaints();
})();