
/* ==========================================================================
   USER MANAGEMENT — page script
   Self-contained: no shared files are required.

   Sections:
     1. Sidebar (TRANSITIONAL — replace when the master sidebar is finalized)
     2. Helpers
     3. Sample data (in-memory only; nothing is persisted)
     4. Actions and business rules
     5. Rendering
     6. Modal (create / edit account)
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

    const CURRENT_ADMIN = 'Alex Morgan (Super Admin)';
    const ROLES = ['Super Admin', 'Admin', 'Facility Manager', 'Viewer'];

    const users = [
        { id: 'U-001', name: 'Alex Morgan', email: 'admin@example.com',  role: 'Super Admin',      status: 'Active',   lastLogin: '2026-10-19 08:12' },
        { id: 'U-002', name: 'Jamie Reyes', email: 'jamie@example.com',  role: 'Admin',            status: 'Active',   lastLogin: '2026-10-18 17:40' },
        { id: 'U-003', name: 'Sam Lee',     email: 'sam@example.com',    role: 'Facility Manager', status: 'Active',   lastLogin: '2026-10-16 09:05' },
        { id: 'U-004', name: 'Taylor Cruz', email: 'taylor@example.com', role: 'Viewer',           status: 'Inactive', lastLogin: '2026-08-30 11:22' }
    ];

    const audit = [
        { id: 'A-005', timestamp: '2026-10-17 15:20', action: 'Facility Updated',   affected: 'Sample Hillside ABTC (ABTC-005)',  performedBy: CURRENT_ADMIN, details: 'Facility information updated' },
        { id: 'A-004', timestamp: '2026-10-16 10:02', action: 'Role Changed',       affected: 'Sam Lee (U-003)',                  performedBy: CURRENT_ADMIN, details: 'Admin → Facility Manager' },
        { id: 'A-003', timestamp: '2026-10-14 09:44', action: 'Facility Suspended', affected: 'Sample Northgate ABTC (ABTC-003)', performedBy: CURRENT_ADMIN, details: 'Status changed from Active to Suspended' },
        { id: 'A-002', timestamp: '2026-10-10 13:31', action: 'Account Created',    affected: 'Taylor Cruz (U-004)',              performedBy: CURRENT_ADMIN, details: 'Role assigned: Viewer' },
        { id: 'A-001', timestamp: '2026-01-15 08:00', action: 'Facility Approved',  affected: 'Sample Central ABTC (ABTC-001)',   performedBy: CURRENT_ADMIN, details: 'Status changed from Pending to Active' }
    ];

    /* ======================================================================
       4. ACTIONS AND BUSINESS RULES
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

    function activeSuperAdmins() {
        return users.filter((u) => u.role === 'Super Admin' && u.status === 'Active').length;
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
        renderUsers();
    }

    /* ======================================================================
       5. RENDERING
       ====================================================================== */

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

    /* ======================================================================
       6. MODAL (create / edit account)
       ====================================================================== */

    const userModal = document.getElementById('userModal');
    const userForm = document.getElementById('userForm');

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
                logAudit(
                    status === 'Active' ? 'Account Activated' : 'Account Deactivated',
                    `${name} (${u.id})`,
                    `Account ${status.toLowerCase()}`
                );
            }
            toast('Account updated.');
        } else {
            const newUser = { id: nextId(users, 'U'), name, email, role, status, lastLogin: 'Never' };
            users.push(newUser);
            logAudit('Account Created', `${name} (${newUser.id})`, `Role assigned: ${role}`);
            toast('Account created.');
        }

        closeModal(userModal);
        renderUsers();
    });

    /* ======================================================================
       7. EVENTS
       ====================================================================== */

    function handleRowAction(action, id) {
        switch (action) {
            case 'edit-user':
                openUserModal(id);
                return;
            case 'toggle-user': {
                const u = findById(users, id);
                if (!u) break;

                const isLastSuperAdmin =
                    u.role === 'Super Admin' && u.status === 'Active' && activeSuperAdmins() <= 1;
                if (isLastSuperAdmin) {
                    toast('At least one active Super Admin is required.');
                    break;
                }

                const next = u.status === 'Active' ? 'Inactive' : 'Active';
                setUserStatus(u, next);
                toast(`${u.name} ${next === 'Active' ? 'activated' : 'deactivated'}.`);
                break;
            }
            default:
                return;
        }

        renderUsers();
    }

    document.addEventListener('click', function (e) {
        // Add account
        if (e.target.closest('#addUserBtn')) {
            openUserModal();
            return;
        }

        // Row-level actions
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

    // Role changes from the table
    document.addEventListener('change', function (e) {
        if (!e.target.matches('[data-role-select]')) return;

        const u = findById(users, e.target.dataset.id);
        if (u) {
            changeUserRole(u, e.target.value);
        } else {
            renderUsers();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('.modal-overlay.open, .logout-modal.open').forEach(closeModal);
    });

    ['userSearch', 'userRoleFilter'].forEach((id) => {
        const el = document.getElementById(id);
        el.addEventListener('input', renderUsers);
        el.addEventListener('change', renderUsers);
    });

    /* ======================================================================
       8. INITIALIZATION
       ====================================================================== */

    applySidebarState(readSidebarState());
    renderUsers();
})();