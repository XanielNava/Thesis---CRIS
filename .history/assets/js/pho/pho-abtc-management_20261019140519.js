(function () {
    'use strict';

    /* =====================================================================
       PART 1 — SIDEBAR ANIMATION & STATE (matches the Universal Master Sidebar)
       ===================================================================== */

    const SIDEBAR_KEY = 'sidebarCollapsed'; // same key as the master sidebar
    const sidebar = document.getElementById('sidebar');
    const layout = document.getElementById('appLayout');
    const sidebarToggle = document.getElementById('sidebarToggle');

    function applySidebarState(collapsed) {
        sidebar.classList.toggle('collapsed', collapsed);
        layout.classList.toggle('sidebar-collapsed', collapsed); // syncs main content layout
        sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    }

    function readStoredState() {
        try {
            return localStorage.getItem(SIDEBAR_KEY) === 'true';
        } catch (e) {
            return false;
        }
    }

    function storeState(collapsed) {
        try {
            localStorage.setItem(SIDEBAR_KEY, String(collapsed));
        } catch (e) { /* storage unavailable — state is simply not persisted */ }
    }

    sidebarToggle.addEventListener('click', function () {
        const collapsed = !sidebar.classList.contains('collapsed');
        applySidebarState(collapsed);
        storeState(collapsed);
    });

    /* =====================================================================
       PART 2 — DASHBOARD DATA (frontend demonstration only; not persisted)
       ===================================================================== */

    const ROLES = ['Super Admin', 'Admin', 'Facility Manager', 'Viewer'];
    const CURRENT_ADMIN = 'Alex Morgan (Super Admin)';

    let facilities = [
        { id: 'ABTC-001', name: 'Sample Central ABTC',   district: 'District 1', email: 'central@example.com',   phone: '0900-000-0001', status: 'Active',    registered: '2026-01-15' },
        { id: 'ABTC-002', name: 'Sample Riverside ABTC', district: 'District 2', email: 'riverside@example.com', phone: '0900-000-0002', status: 'Pending',   registered: '2026-10-14' },
        { id: 'ABTC-003', name: 'Sample Northgate ABTC', district: 'District 3', email: 'northgate@example.com', phone: '0900-000-0003', status: 'Suspended', registered: '2026-03-02' },
        { id: 'ABTC-004', name: 'Sample Coastal ABTC',   district: 'District 4', email: 'coastal@example.com',   phone: '0900-000-0004', status: 'Inactive',  registered: '2026-05-20' },
        { id: 'ABTC-005', name: 'Sample Hillside ABTC',  district: 'District 5', email: 'hillside@example.com',  phone: '0900-000-0005', status: 'Pending',   registered: '2026-10-17' }
    ];

    let users = [
        { id: 'U-001', name: 'Alex Morgan', email: 'admin@example.com',  role: 'Super Admin',      status: 'Active',   lastLogin: '2026-10-19 08:12' },
        { id: 'U-002', name: 'Jamie Reyes', email: 'jamie@example.com',  role: 'Admin',            status: 'Active',   lastLogin: '2026-10-18 17:40' },
        { id: 'U-003', name: 'Sam Lee',     email: 'sam@example.com',    role: 'Facility Manager', status: 'Active',   lastLogin: '2026-10-16 09:05' },
        { id: 'U-004', name: 'Taylor Cruz', email: 'taylor@example.com', role: 'Viewer',           status: 'Inactive', lastLogin: '2026-08-30 11:22' }
    ];

    let complaints = [
        { id: 'C-101', user: 'Sam Lee',     module: 'Animal Registry', description: 'Animal records do not save when the vaccination date is left blank.', submitted: '2026-10-15', status: 'Open' },
        { id: 'C-102', user: 'Jamie Reyes', module: 'Heatmap',         description: 'Map markers do not refresh after a new case is saved.',              submitted: '2026-10-12', status: 'In Progress' },
        { id: 'C-103', user: 'Taylor Cruz', module: 'Login',           description: 'Password reset email arrives several hours late.',                    submitted: '2026-10-08', status: 'Resolved' }
    ];

    let audit = [
        { id: 'A-005', timestamp: '2026-10-17 15:20', action: 'Facility Updated',  affected: 'Sample Hillside ABTC (ABTC-005)', performedBy: CURRENT_ADMIN, details: 'Facility information updated' },
        { id: 'A-004', timestamp: '2026-10-16 10:02', action: 'Role Changed',      affected: 'Sam Lee (U-003)',                 performedBy: CURRENT_ADMIN, details: 'Admin → Facility Manager' },
        { id: 'A-003', timestamp: '2026-10-14 09:44', action: 'Facility Suspended', affected: 'Sample Northgate ABTC (ABTC-003)', performedBy: CURRENT_ADMIN, details: 'Status changed from Active to Suspended' },
        { id: 'A-002', timestamp: '2026-10-10 13:31', action: 'Account Created',   affected: 'Taylor Cruz (U-004)',             performedBy: CURRENT_ADMIN, details: 'Role assigned: Viewer' },
        { id: 'A-001', timestamp: '2026-01-15 08:00', action: 'Facility Approved', affected: 'Sample Central ABTC (ABTC-001)',  performedBy: CURRENT_ADMIN, details: 'Status changed from Pending to Active' }
    ];

    /* =====================================================================
       PART 3 — HELPERS
       ===================================================================== */

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const slug = (text) => String(text).toLowerCase().replace(/\s+/g, '-');

    const badge = (text, extraClass = '') =>
        `<span class="badge badge-${slug(text)} ${extraClass}">${esc(text)}</span>`;

    const nowStamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

    const nextId = (list, prefix) => {
        const max = list.reduce((m, x) => Math.max(m, parseInt(x.id.split('-')[1], 10) || 0), 0);
        return `${prefix}-${String(max + 1).padStart(3, '0')}`;
    };

    const findById = (list, id) => list.find((x) => x.id === id);
    const activeSuperAdmins = () => users.filter((u) => u.role === 'Super Admin' && u.status === 'Active').length;

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

    const toastEl = $('#toast');
    let toastTimer = null;
    function toast(message) {
        toastEl.textContent = message;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
    }

    /* =====================================================================
       PART 4 — RENDERING
       ===================================================================== */

    function renderStats() {
        const countWhere = (list, fn) => list.filter(fn).length;
        $('#statTotalFacilities').textContent = facilities.length;
        $('#statActiveUsers').textContent = countWhere(users, (u) => u.status === 'Active');
        $('#statActiveFacilities').textContent = countWhere(facilities, (f) => f.status === 'Active');
        $('#statPending').textContent = countWhere(facilities, (f) => f.status === 'Pending');
        $('#statSuspended').textContent = countWhere(facilities, (f) => f.status === 'Suspended' || f.status === 'Inactive');
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

    function renderUsers() {
        const q = $('#userSearch').value.trim().toLowerCase();
        const role = $('#userRoleFilter').value;

        const rows = users.filter((u) =>
            (!role || u.role === role) &&
            (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
        );

        $('#userTableBody').innerHTML = rows.map((u) => {
            const id = esc(u.id);
            const roleOptions = ROLES.map((r) =>
                `<option value="${esc(r)}" ${r === u.role ? 'selected' : ''}>${esc(r)}</option>`).join('');
            const isActive = u.status === 'Active';

            return `
                <tr>
                    <td><strong>${esc(u.name)}</strong></td>
                    <td>${esc(u.email)}</td>
                    <td>
                        <select class="inline-select" data-role-select data-id="${id}" aria-label="Role for ${esc(u.name)}">
                            ${roleOptions}
                        </select>
                    </td>
                    <td>${badge(u.status)}</td>
                    <td class="muted">${esc(u.lastLogin)}</td>
                    <td>
                        <div class="actions">
                            <button class="btn btn-ghost btn-sm" data-action="edit-user" data-id="${id}">Edit</button>
                            <button class="btn ${isActive ? 'btn-warn' : 'btn-success'} btn-sm" data-action="toggle-user" data-id="${id}">
                                ${isActive ? 'Deactivate' : 'Activate'}
                            </button>
                        </div>
                    </td>
                </tr>`;
        }).join('');

        $('#userEmpty').classList.toggle('hidden', rows.length > 0);
    }

    function renderComplaints() {
        const status = $('#complaintStatusFilter').value;
        const rows = complaints.filter((c) => !status || c.status === status);
        const statusOptions = ['Open', 'In Progress', 'Resolved', 'Closed'];

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
                        ${statusOptions.map((s) => `<option value="${esc(s)}" ${s === c.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}
                    </select>
                </td>
            </tr>`).join('');

        $('#complaintEmpty').classList.toggle('hidden', rows.length > 0);
    }

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

    function renderAll() {
        renderStats();
        renderOverviewLists();
        renderFacilities();
        renderUsers();
        renderComplaints();
        renderAudit();
    }

    /* =====================================================================
       PART 5 — BUSINESS ACTIONS (frontend demo logic)
       ===================================================================== */

    function setFacilityStatus(facility, next) {
        if (facility.status === next) return;
        const prev = facility.status;
        facility.status = next;

        const action =
            next === 'Suspended'  ? 'Facility Suspended' :
            next === 'Inactive'   ? 'Facility Deactivated' :
            prev === 'Pending'    ? 'Facility Approved' :
                                    'Facility Activated';

        logAudit(action, `${facility.name} (${facility.id})`, `Status changed from ${prev} to ${next}`);
    }

    function setUserStatus(user, next) {
        if (user.status === next) return;
        user.status = next;
        logAudit(
            next === 'Active' ? 'Account Activated' : 'Account Deactivated',
            `${user.name} (${user.id})`,
            `Account ${next === 'Active' ? 'activated' : 'deactivated'}`
        );
    }

    function changeUserRole(user, nextRole) {
        if (user.role === nextRole) return;

        const isLastActiveSuperAdmin =
            user.role === 'Super Admin' && user.status === 'Active' && activeSuperAdmins() <= 1;

        if (isLastActiveSuperAdmin && nextRole !== 'Super Admin') {
            toast('At least one active Super Admin is required.');
            renderUsers();
            return;
        }

        const prev = user.role;
        user.role = nextRole;
        logAudit('Role Changed', `${user.name} (${user.id})`, `${prev} → ${nextRole}`);
        toast(`Role updated to ${nextRole}.`);
        renderAll();
    }

    function setComplaintStatus(complaint, nextStatus) {
        if (complaint.status === nextStatus) return;
        complaint.status = nextStatus;
        logAudit('Complaint Status Updated', `${complaint.id} (${complaint.module})`, `Status set to ${nextStatus}`);
        toast(`Complaint ${complaint.id} marked as ${nextStatus}.`);
        renderAll();
    }

    /* =====================================================================
       PART 6 — MODALS
       ===================================================================== */

    const userModal = $('#userModal');
    const facilityModal = $('#facilityModal');
    const logoutModal = $('#logoutModal');
    const userForm = $('#userForm');
    const facilityForm = $('#facilityForm');

    function openModal(el) {
        el.classList.add('open');
        el.setAttribute('aria-hidden', 'false');
    }

    function closeModal(el) {
        if (!el) return;
        el.classList.remove('open');
        el.setAttribute('aria-hidden', 'true');
    }

    function openUserModal(id) {
        const u = id ? findById(users, id) : null;
        $('#userModalTitle').textContent = u ? 'Edit account' : 'Create authorized account';
        $('#userId').value = u ? u.id : '';
        $('#userName').value = u ? u.name : '';
        $('#userEmail').value = u ? u.email : '';
        $('#userRole').value = u ? u.role : 'Viewer';
        $('#userStatus').value = u ? u.status : 'Active';
        openModal(userModal);
        $('#userName').focus();
    }

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

    userForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const id = $('#userId').value;
        const name = $('#userName').value.trim();
        const email = $('#userEmail').value.trim().toLowerCase();
        const role = $('#userRole').value;
        const status = $('#userStatus').value;

        if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
            toast('Please enter a valid name and email address.');
            return;
        }
        if (users.some((u) => u.email.toLowerCase() === email && u.id !== id)) {
            toast('An account with this email already exists.');
            return;
        }

        if (id) {
            const u = findById(users, id);
            const prevRole = u.role;
            const prevStatus = u.status;

            const removingLastSuperAdmin =
                u.role === 'Super Admin' && u.status === 'Active' &&
                (role !== 'Super Admin' || status !== 'Active') &&
                activeSuperAdmins() <= 1;

            if (removingLastSuperAdmin) {
                toast('At least one active Super Admin is required.');
                return;
            }

            Object.assign(u, { name, email, role, status });
            logAudit('Account Updated', `${name} (${u.id})`, 'Account information updated');
            if (prevRole !== role) logAudit('Role Changed', `${name} (${u.id})`, `${prevRole} → ${role}`);
            if (prevStatus !== status) {
                logAudit(status === 'Active' ? 'Account Activated' : 'Account Deactivated', `${name} (${u.id})`, `Account ${status.toLowerCase()}`);
            }
            toast('Account updated.');
        } else {
            const newUser = { id: nextId(users, 'U'), name, email, role, status, lastLogin: 'Never' };
            users.push(newUser);
            logAudit('Account Created', `${name} (${newUser.id})`, `Role assigned: ${role}`);
            toast('Account created.');
        }

        closeModal(userModal);
        renderAll();
    });

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
        renderAll();
    });

    /* =====================================================================
       PART 7 — EVENT DELEGATION (tables, overview, sidebar navigation, modals)
       ===================================================================== */

    const SECTION_IDS = ['overview', 'facilities', 'users', 'complaints', 'audit', 'settings'];

    function showSection(id) {
        if (!SECTION_IDS.includes(id)) id = 'overview';

        $$('.dash-section').forEach((s) => s.classList.toggle('active', s.id === id));
        $$('.sidebar .nav-item[data-section]').forEach((a) => a.classList.toggle('active', a.dataset.section === id));

        const section = document.getElementById(id);
        $('#pageTitle').textContent = section.dataset.title;
        $('#pageSubtitle').textContent = section.dataset.subtitle;

        history.replaceState(null, '', '#' + id);
        $('#mainContent').scrollTop = 0;
    }

    document.addEventListener('click', function (e) {
        // Section navigation (sidebar + inline links)
        const sectionLink = e.target.closest('[data-section]');
        if (sectionLink) {
            e.preventDefault();
            showSection(sectionLink.dataset.section);
            return;
        }

        // Modal close buttons
        const closeBtn = e.target.closest('[data-close]');
        if (closeBtn) {
            closeModal(closeBtn.closest('.modal-overlay, .logout-modal'));
            return;
        }

        // Click on backdrop closes modal
        if (e.target.classList.contains('modal-overlay') || e.target === logoutModal) {
            closeModal(e.target);
            return;
        }

        // Logout flow
        if (e.target.closest('#logoutBtn')) {
            openModal(logoutModal);
            return;
        }
        if (e.target.closest('#logoutConfirm')) {
            window.location.href = 'admin-login.html'; // adjust to your login page
            return;
        }

        // Add account
        if (e.target.closest('#addUserBtn')) {
            openUserModal();
            return;
        }

        // Row-level actions
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const { action, id } = btn.dataset;

        switch (action) {
            case 'approve-facility': {
                const f = findById(facilities, id);
                if (f) { setFacilityStatus(f, 'Active'); toast(`${f.name} approved.`); }
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
                return; // modal already opened; no table re-render needed
            case 'edit-user':
                openUserModal(id);
                return;
            case 'toggle-user': {
                const u = findById(users, id);
                if (!u) break;
                const isLastSuperAdmin = u.role === 'Super Admin' && u.status === 'Active' && activeSuperAdmins() <= 1;
                if (isLastSuperAdmin) {
                    toast('At least one active Super Admin is required.');
                    break;
                }
                const next = u.status === 'Active' ? 'Inactive' : 'Active';
                setUserStatus(u, next);
                toast(`${u.name} ${next === 'Active' ? 'activated' : 'deactivated'}.`);
                break;
            }
        }

        renderAll();
    });

    document.addEventListener('change', function (e) {
        if (e.target.matches('[data-role-select]')) {
            const u = findById(users, e.target.dataset.id);
            if (u) changeUserRole(u, e.target.value);
            else renderUsers();
        }

        if (e.target.matches('[data-complaint-select]')) {
            const c = findById(complaints, e.target.dataset.id);
            if (c) setComplaintStatus(c, e.target.value);
        }
    });

    document.getElementById('settingsForm').addEventListener('submit', function (e) {
        e.preventDefault();
        logAudit('Settings Updated', 'System configuration', 'General and reference data settings saved');
        toast('Settings saved (frontend demo — not persisted).');
        renderAll();
    });

    document.getElementById('settingsForm').addEventListener('reset', function () {
        setTimeout(() => toast('Settings reset to last saved values.'), 0);
    });

    // Live filtering
    function bind(ids, handler) {
        ids.forEach((id) => {
            const el = document.getElementById(id);
            el.addEventListener('input', handler);
            el.addEventListener('change', handler);
        });
    }

    bind(['facilitySearch', 'facilityStatusFilter'], renderFacilities);
    bind(['userSearch', 'userRoleFilter'], renderUsers);
    bind(['complaintStatusFilter'], renderComplaints);
    bind(['auditSearch', 'auditActionFilter'], renderAudit);

    // Escape closes any open modal
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            $$('.modal-overlay.open, .logout-modal.open').forEach(closeModal);
        }
    });

    window.addEventListener('hashchange', function () {
        showSection(location.hash.slice(1));
    });

    /* =====================================================================
       PART 8 — INITIALIZATION
       ===================================================================== */

    applySidebarState(readStoredState());
    renderAll();
    showSection(location.hash.slice(1));
})();