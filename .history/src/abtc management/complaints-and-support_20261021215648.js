/* ==========================================================================
   COMPLAINTS & SUPPORT — page script
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

    const slug = (text) => String(text).toLowerCase().replace(/\s+/g, '-');

    const badge = (text) => `<span class="badge badge-${slug(text)}">${esc(text)}</span>`;

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
    const STATUS_OPTIONS = ['Open', 'In Progress', 'Resolved', 'Closed'];

    const complaints = [
        { id: 'C-101', user: 'Sam Lee',     module: 'Animal Registry', description: 'Animal records do not save when the vaccination date is left blank.', submitted: '2026-10-15', status: 'Open' },
        { id: 'C-102', user: 'Jamie Reyes', module: 'Heatmap',         description: 'Map markers do not refresh after a new case is saved.',              submitted: '2026-10-12', status: 'In Progress' },
        { id: 'C-103', user: 'Taylor Cruz', module: 'Login',           description: 'Password reset email arrives several hours late.',                    submitted: '2026-10-08', status: 'Resolved' }
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

    function setComplaintStatus(complaint, nextStatus) {
        if (complaint.status === nextStatus) return;

        complaint.status = nextStatus;
        logAudit('Complaint Status Updated', `${complaint.id} (${complaint.module})`, `Status set to ${nextStatus}`);
        toast(`Complaint ${complaint.id} marked as ${nextStatus}.`);
    }

    /* ======================================================================
       5. RENDERING
       ====================================================================== */

    function renderComplaints() {
        const status = $('#complaintStatusFilter').value;
        const rows = complaints.filter((c) => !status || c.status === status);

        $('#complaintTableBody').innerHTML = rows.map((c) => `
            <tr>
                <td class="mono">${esc(c.id)}</td>
                <td>${esc(c.user)}</td>
                <td>${esc(c.module)}</td>
                <td class="wrap">${esc(c.description)}</td>
                <td>${esc(c.submitted)}</td>
                <td>${badge(c.status)}</td>
                <td>
                    <select class="inline-select" data-complaint-select data-id="${esc(c.id)}" aria-label="Status for ${esc(c.id)}">
                        ${STATUS_OPTIONS.map((s) => `<option value="${esc(s)}" ${s === c.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}
                    </select>
                </td>
            </tr>`).join('');

        $('#complaintEmpty').classList.toggle('hidden', rows.length > 0);
    }

    /* ======================================================================
       6. EVENTS
       ====================================================================== */

    // Status change from the table
    document.addEventListener('change', function (e) {
        if (!e.target.matches('[data-complaint-select]')) return;

        const complaint = findById(complaints, e.target.dataset.id);
        if (complaint) {
            setComplaintStatus(complaint, e.target.value);
        }
        renderComplaints();
    });

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

    $('#complaintStatusFilter').addEventListener('change', renderComplaints);

    /* ======================================================================
       7. INITIALIZATION
       ====================================================================== */

    applySidebarState(readSidebarState());
    renderComplaints();
})();