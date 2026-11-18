(function () {
    'use strict';

    /* ======================================================================
       1. REFERENCE DATA (sample data, in-memory only)
       ====================================================================== */

    const INCIDENTS = [
        { id: 'BRGY-2026-041', barangay: 'Barangay Central', biteType: 'Stray Dog Bite',       animalStatus: 'Under Quarantine',  status: 'pending' },
        { id: 'BRGY-2026-040', barangay: 'Barangay Zone 3',  biteType: 'Domestic Cat Scratch', animalStatus: 'Observed Healthy',  status: 'verified' },
        { id: 'BRGY-2026-039', barangay: 'Barangay Central', biteType: 'Stray Dog Bite',       animalStatus: 'Unknown (Escaped)', status: 'pending' }
    ];

    const PHO_DRAFTS = [
        { title: 'August 2026 Epidemiological Report', status: 'Ready for review' }
    ];

    const NOTICES = [
        {
            type: 'warning',
            icon: 'fa-paper-plane',
            title: 'Monthly PHO Submission',
            text: 'August epidemiological report draft is ready for review and PHO transmission.'
        },
        {
            type: 'info',
            icon: 'fa-user-shield',
            title: 'BHW Surveillance Sync',
            text: '3 barangays submitted updated stray population surveillance logs today.'
        },
        {
            type: 'neutral',
            icon: 'fa-syringe',
            title: 'Local ABTC Vaccine Status',
            text: '24 PEP vials remaining in municipal storage. Requisition advised.'
        }
    ];

    const STATUS = {
        pending:  { label: 'Pending Review', badge: 'badge-pending-verify', icon: 'fa-hourglass-half' },
        verified: { label: 'Verified',       badge: 'badge-verified-lgu',   icon: 'fa-circle-check' },
        flagged:  { label: 'Flagged Risk',   badge: 'badge-flagged-risk',   icon: 'fa-triangle-exclamation' }
    };

    // Confirmation text and resulting status for each row action
    const ACTIONS = {
        verify: {
            title: 'Verify incident report',
            button: 'Verify Report',
            buttonClass: 'btn-modal',
            message: (i) => `Confirm that ${i.id} is a valid incident and mark it as verified?`,
            nextStatus: 'verified'
        },
        flag: {
            title: 'Flag as high-risk threat',
            button: 'Flag Report',
            buttonClass: 'btn-modal btn-modal-danger',
            message: (i) => `Flag ${i.id} as a high-risk threat for immediate follow-up?`,
            nextStatus: 'flagged'
        }
    };

    /* ======================================================================
       2. STATE
       ====================================================================== */

    const state = {
        search: '',
        statusFilter: '',
        pendingAction: null   // { id, nextStatus } while the confirm dialog is open
    };

    /* ======================================================================
       3. HELPERS
       ====================================================================== */

    const $ = (id) => document.getElementById(id);

    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const pad2 = (n) => String(n).padStart(2, '0');

    const findIncident = (id) => INCIDENTS.find((i) => i.id === id);

    /* ======================================================================
       4. SIDEBAR AND FEEDBACK
       ====================================================================== */

    function initSidebar() {
        const sidebar = $('sidebar');
        const toggle = $('sidebarToggle');

        const apply = (collapsed) => {
            sidebar.classList.toggle('collapsed', collapsed);
            toggle.setAttribute('aria-expanded', String(!collapsed));
        };

        apply(localStorage.getItem('sidebarCollapsed') === 'true');

        toggle.addEventListener('click', () => {
            const collapsed = !sidebar.classList.contains('collapsed');
            apply(collapsed);
            localStorage.setItem('sidebarCollapsed', String(collapsed));
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
       5. MODALS
       ====================================================================== */

    function openModal(el) {
        el.classList.add('open');
        el.setAttribute('aria-hidden', 'false');
    }

    function closeModal(el) {
        if (!el) return;
        el.classList.remove('open');
        el.setAttribute('aria-hidden', 'true');
        if (el.id === 'confirmModal') state.pendingAction = null;
    }

    /* ======================================================================
       6. SUMMARY METRICS
       ====================================================================== */

    function renderMetrics() {
        const pending = INCIDENTS.filter((i) => i.status === 'pending').length;
        const barangays = new Set(INCIDENTS.map((i) => i.barangay)).size;
        const quarantined = INCIDENTS.filter((i) => i.animalStatus === 'Under Quarantine').length;

        $('pendingIntakeCount').textContent = pad2(pending);
        $('intakeSubtitle').textContent = `${pending} awaiting verification`;
        $('totalBarangaysCount').textContent = pad2(barangays);
        $('quarantineAnimalsCount').textContent = pad2(quarantined);
        $('phoDraftCount').textContent = pad2(PHO_DRAFTS.length);
    }

    /* ======================================================================
       7. CLUSTER ALERT
       Shown when one barangay has two or more pending reports.
       ====================================================================== */

    function renderClusterAlert() {
        const banner = $('clusterAlert');
        const counts = {};

        INCIDENTS
            .filter((i) => i.status === 'pending')
            .forEach((i) => { counts[i.barangay] = (counts[i.barangay] || 0) + 1; });

        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

        if (!top || top[1] < 2) {
            banner.hidden = true;
            return;
        }

        banner.hidden = false;
        $('clusterAlertTitle').textContent = `Cluster Alert \u2014 ${top[0]}`;
        $('clusterAlertText').textContent = `${top[1]} unverified bite incidents reported in this barangay.`;
    }

    /* ======================================================================
       8. INCIDENT TABLE (FILTERING AND RENDERING)
       ====================================================================== */

    function visibleIncidents() {
        const q = state.search.toLowerCase();

        return INCIDENTS.filter((i) => {
            const matchesStatus = !state.statusFilter || i.status === state.statusFilter;
            const haystack = [i.id, i.barangay, i.biteType, i.animalStatus, STATUS[i.status].label]
                .join(' ').toLowerCase();
            const matchesSearch = !q || haystack.includes(q);
            return matchesStatus && matchesSearch;
        });
    }

    function actionButtons(i) {
        if (i.status === 'pending') {
            return `
                <button type="button" class="btn-lgu-action btn-lgu-verify" data-action="verify" data-id="${esc(i.id)}">
                    <i class="fa-solid fa-check"></i> Verify
                </button>
                <button type="button" class="btn-lgu-action btn-lgu-flag" data-action="flag" data-id="${esc(i.id)}">
                    <i class="fa-solid fa-flag"></i> Flag
                </button>`;
        }
        return `
            <button type="button" class="btn-lgu-action btn-lgu-view" data-action="details" data-id="${esc(i.id)}">
                <i class="fa-solid fa-eye"></i> Details
            </button>`;
    }

    function rowHTML(i) {
        const s = STATUS[i.status];
        return `
            <tr>
                <td><strong>${esc(i.id)}</strong></td>
                <td>${esc(i.barangay)}</td>
                <td>${esc(i.biteType)}</td>
                <td>${esc(i.animalStatus)}</td>
                <td><span class="badge-lgu ${s.badge}"><i class="fa-solid ${s.icon}"></i> ${esc(s.label)}</span></td>
                <td class="text-center"><div class="action-group-btn">${actionButtons(i)}</div></td>
            </tr>`;
    }

    function renderTable() {
        const rows = visibleIncidents();

        $('lguIntakeTableBody').innerHTML = rows.map(rowHTML).join('');
        $('intakeEmpty').hidden = rows.length > 0;
        $('intakeCount').textContent = `Showing ${rows.length} of ${INCIDENTS.length} report(s)`;
    }

    function renderAll() {
        renderMetrics();
        renderClusterAlert();
        renderTable();
    }

    /* ======================================================================
       9. INCIDENT ACTIONS (VERIFY, FLAG, DETAILS)
       ====================================================================== */

    function requestAction(action, id) {
        const incident = findIncident(id);
        const config = ACTIONS[action];
        if (!incident || !config) return;

        state.pendingAction = { id, nextStatus: config.nextStatus };

        $('confirmTitle').textContent = config.title;
        $('confirmMessage').textContent = config.message(incident);

        const confirmBtn = $('confirmActionBtn');
        confirmBtn.textContent = config.button;
        confirmBtn.className = config.buttonClass;

        openModal($('confirmModal'));
        $('confirmCancelBtn').focus();
    }

    function applyPendingAction() {
        const pending = state.pendingAction;
        closeModal($('confirmModal'));
        if (!pending) return;

        const incident = findIncident(pending.id);
        if (!incident) return;

        incident.status = pending.nextStatus;
        renderAll();
        showToast(`${incident.id} marked as ${STATUS[incident.status].label}.`);
    }

    function showDetails(id) {
        const i = findIncident(id);
        if (!i) return;

        $('detailId').textContent = i.id;
        $('detailBarangay').textContent = i.barangay;
        $('detailBiteType').textContent = i.biteType;
        $('detailAnimalStatus').textContent = i.animalStatus;
        $('detailStatus').textContent = STATUS[i.status].label;

        openModal($('detailsModal'));
    }

    /* ======================================================================
       10. NOTICES
       ====================================================================== */

    function renderNotices() {
        $('noticeList').innerHTML = NOTICES.map((n) => `
            <div class="notice-item ${esc(n.type)}">
                <strong><i class="fa-solid ${esc(n.icon)}"></i> ${esc(n.title)}</strong>
                <p>${esc(n.text)}</p>
            </div>`).join('');
    }

    /* ======================================================================
       11. EXPORT (CSV)
       Exports the rows currently shown in the table (search and filter applied).
       ====================================================================== */

    function exportCsv() {
        const rows = visibleIncidents();
        if (!rows.length) {
            showToast('There are no records to export.');
            return;
        }

        const header = ['Report ID', 'Barangay', 'Incident / Bite Type', 'Animal Status', 'Status'];
        const lines = [header, ...rows.map((i) => [
            i.id, i.barangay, i.biteType, i.animalStatus, STATUS[i.status].label
        ])].map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));

        const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `LGU_Intake_Log_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);

        showToast(`Exported ${rows.length} report(s).`);
    }

    /* ======================================================================
       12. EVENT WIRING
       ====================================================================== */

    function bindEvents() {
        // Search and status filter
        $('intakeSearchInput').addEventListener('input', (e) => {
            state.search = e.target.value.trim();
            renderTable();
        });

        $('statusFilterSelect').addEventListener('change', (e) => {
            state.statusFilter = e.target.value;
            renderTable();
        });

        $('exportIntakeLogBtn').addEventListener('click', exportCsv);

        // Row actions (event delegation on the table body)
        $('lguIntakeTableBody').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const { action, id } = btn.dataset;
            if (action === 'details') {
                showDetails(id);
            } else {
                requestAction(action, id);
            }
        });

        // Confirm dialog
        $('confirmActionBtn').addEventListener('click', applyPendingAction);

        // Logout
        $('logout-btn').addEventListener('click', () => openModal($('logoutModal')));
        $('logoutConfirm').addEventListener('click', () => {
            window.location.href = 'lgu-login.html';
        });

        // Close buttons (any dialog)
        document.querySelectorAll('[data-close]').forEach((btn) => {
            btn.addEventListener('click', () => {
                closeModal(btn.closest('.modal-overlay, .logout-modal'));
            });
        });

        // Clicking the backdrop closes the dialog
        ['confirmModal', 'detailsModal', 'logoutModal'].forEach((id) => {
            const overlay = $(id);
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeModal(overlay);
            });
        });

        // Escape closes any open dialog
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            document.querySelectorAll('.modal-overlay.open, .logout-modal.open')
                .forEach((el) => closeModal(el));
        });
    }

    /* ======================================================================
       13. INITIALIZATION
       ====================================================================== */

    document.addEventListener('DOMContentLoaded', () => {
        initSidebar();
        renderNotices();
        bindEvents();
        renderAll();
    });
})();