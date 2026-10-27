
/* ==========================================================================
   FACILITY MANAGEMENT — page script
   Self-contained: no shared files are required.

   Sections:
     1. Sidebar (TRANSITIONAL — replace when the master sidebar is finalized)
     2. Helpers
     3. Sample data (in-memory only; nothing is persisted)
     4. Actions
     5. Rendering
     6. Modal (edit facility)
     7. Events
     8. Initialization
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

    // const CURRENT_ADMIN = 'Alex Morgan (Super Admin)';

    // const facilities = [
    //     { id: 'ABTC-001', name: 'Sample Central ABTC',   district: 'District 1', email: 'central@example.com',   phone: '0900-000-0001', status: 'Active',    registered: '2026-01-15' },
    //     { id: 'ABTC-002', name: 'Sample Riverside ABTC', district: 'District 2', email: 'riverside@example.com', phone: '0900-000-0002', status: 'Pending',   registered: '2026-10-14' },
    //     { id: 'ABTC-003', name: 'Sample Northgate ABTC', district: 'District 3', email: 'northgate@example.com', phone: '0900-000-0003', status: 'Suspended', registered: '2026-03-02' },
    //     { id: 'ABTC-004', name: 'Sample Coastal ABTC',   district: 'District 4', email: 'coastal@example.com',   phone: '0900-000-0004', status: 'Inactive',  registered: '2026-05-20' },
    //     { id: 'ABTC-005', name: 'Sample Hillside ABTC',  district: 'District 5', email: 'hillside@example.com',  phone: '0900-000-0005', status: 'Pending',   registered: '2026-10-17' }
    // ];

    // const audit = [
    //     { id: 'A-005', timestamp: '2026-10-17 15:20', action: 'Facility Updated',   affected: 'Sample Hillside ABTC (ABTC-005)',  performedBy: CURRENT_ADMIN, details: 'Facility information updated' },
    //     { id: 'A-004', timestamp: '2026-10-16 10:02', action: 'Role Changed',       affected: 'Sam Lee (U-003)',                  performedBy: CURRENT_ADMIN, details: 'Admin → Facility Manager' },
    //     { id: 'A-003', timestamp: '2026-10-14 09:44', action: 'Facility Suspended', affected: 'Sample Northgate ABTC (ABTC-003)', performedBy: CURRENT_ADMIN, details: 'Status changed from Active to Suspended' },
    //     { id: 'A-002', timestamp: '2026-10-10 13:31', action: 'Account Created',    affected: 'Taylor Cruz (U-004)',              performedBy: CURRENT_ADMIN, details: 'Role assigned: Viewer' },
    //     { id: 'A-001', timestamp: '2026-01-15 08:00', action: 'Facility Approved',  affected: 'Sample Central ABTC (ABTC-001)',   performedBy: CURRENT_ADMIN, details: 'Status changed from Pending to Active' }
    // ];

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

    function renderFacilities() {
        const q = $('#facilitySearch').value.trim().toLowerCase();
        const status = $('#facilityStatusFilter').value;

        const rows = facilities.filter((f) =>
            (!status || f.status === status) &&
            (!q || [f.id, f.name, f.district].some((v) => v.toLowerCase().includes(q)))
        );

        $('#facilityTableBody').innerHTML = rows.map((f) => {
            const id = esc(f.id);
            let buttons = `<button class="btn btn-ghost btn-sm" data-action="edit-facility" data-id="${id}">Edit</button>`;

            if (f.status === 'Pending') {
                buttons += `<button class="btn btn-success btn-sm" data-action="approve-facility" data-id="${id}">Approve</button>`;
            } else {
                buttons += `<button class="btn btn-ghost btn-sm" data-action="toggle-facility" data-id="${id}">${f.status === 'Active' ? 'Deactivate' : 'Activate'}</button>`;
                if (f.status !== 'Suspended') {
                    buttons += `<button class="btn btn-warn btn-sm" data-action="suspend-facility" data-id="${id}">Suspend</button>`;
                }
            }

            return `
                <tr>
                    <td class="mono">${id}</td>
                    <td><strong>${esc(f.name)}</strong></td>
                    <td>${esc(f.district)}</td>
                    <td>${esc(f.email)}<br><span class="muted">${esc(f.phone)}</span></td>
                    <td>${esc(f.registered)}</td>
                    <td>${badge(f.status)}</td>
                    <td><div class="actions">${buttons}</div></td>
                </tr>`;
        }).join('');

        $('#facilityEmpty').classList.toggle('hidden', rows.length > 0);
    }

    /* ======================================================================
       6. MODAL (edit facility)
       ====================================================================== */

    const facilityModal = document.getElementById('facilityModal');
    const facilityForm = document.getElementById('facilityForm');

    function openFacilityModal(id) {
        const f = findById(facilities, id);
        if (!f) return;

        $('#facilityModalTitle').textContent = `Edit ${f.id}`;
        $('#facilityId').value = f.id;
        $('#facName').value = f.name;
        $('#facDistrict').value = f.district;
        $('#facEmail').value = f.email;
        $('#facPhone').value = f.phone;
        $('#facStatus').value = f.status;

        openModal(facilityModal);
        $('#facName').focus();
    }

    facilityForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const f = findById(facilities, $('#facilityId').value);
        if (!f) return;

        const name = $('#facName').value.trim();
        if (!name) {
            toast('Facility name is required.');
            return;
        }

        Object.assign(f, {
            name,
            district: $('#facDistrict').value.trim(),
            email: $('#facEmail').value.trim(),
            phone: $('#facPhone').value.trim()
        });

        logAudit('Facility Updated', `${f.name} (${f.id})`, 'Facility information updated');
        setFacilityStatus(f, $('#facStatus').value);

        closeModal(facilityModal);
        toast('Facility updated.');
        renderFacilities();
    });

    /* ======================================================================
       7. EVENTS
       ====================================================================== */

    function handleRowAction(action, id) {
        switch (action) {
            case 'approve-facility': {
                const f = findById(facilities, id);
                if (f) {
                    setFacilityStatus(f, 'Active');
                    toast(`${f.name} approved.`);
                }
                break;
            }
            case 'toggle-facility': {
                const f = findById(facilities, id);
                if (f) {
                    const next = f.status === 'Active' ? 'Inactive' : 'Active';
                    setFacilityStatus(f, next);
                    toast(`${f.name} ${next === 'Active' ? 'activated' : 'deactivated'}.`);
                }
                break;
            }
            case 'suspend-facility': {
                const f = findById(facilities, id);
                if (f && window.confirm(`Suspend ${f.name}?`)) {
                    setFacilityStatus(f, 'Suspended');
                    toast(`${f.name} suspended.`);
                }
                break;
            }
            case 'edit-facility':
                openFacilityModal(id);
                return;
            default:
                return;
        }

        renderFacilities();
    }

    document.addEventListener('click', function (e) {
        // Row-level actions in the facilities table
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
            handleRowAction(actionBtn.dataset.action, actionBtn.dataset.id);
            return;
        }

        // Open logout confirmation
        if (e.target.closest('#logoutBtn')) {
            openModal(logoutModal);
            return;
        }

        // Confirm logout
        if (e.target.closest('#logoutConfirm')) {
            window.location.href = '../../../src/pho/pho-login.html'; // adjust to your login page
            return;
        }

        // Close buttons inside any modal
        const closeBtn = e.target.closest('[data-close]');
        if (closeBtn) {
            closeModal(closeBtn.closest('.modal-overlay, .logout-modal'));
            return;
        }

        // Click on a backdrop closes that modal
        if (e.target.classList.contains('modal-overlay') || e.target === logoutModal) {
            closeModal(e.target);
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('.modal-overlay.open, .logout-modal.open').forEach(closeModal);
    });

    ['facilitySearch', 'facilityStatusFilter'].forEach((id) => {
        const el = document.getElementById(id);
        el.addEventListener('input', renderFacilities);
        el.addEventListener('change', renderFacilities);
    });

    /* ======================================================================
       8. INITIALIZATION
       ====================================================================== */

    applySidebarState(readSidebarState());
    renderFacilities();
})();