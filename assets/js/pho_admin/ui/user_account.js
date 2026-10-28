/* ==========================================================================
   USER MANAGEMENT — page script
   UI Component (Wired to user-db.js)
   ========================================================================== */

import { 
    fetchUsersFromDb, 
    createUserInDb, 
    updateUserInDb, 
    setUserStatusInDb, 
    setUserRoleInDb, 
    listenToAuth, 
    performLogout 
} from '../db/user_account-db.js';

(function () {
    'use strict';

    /* ======================================================================
       1. SIDEBAR
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
        } catch (e) { /* storage unavailable */ }
    }

    function applySidebarState(collapsed) {
        if (!sidebar || !appLayout) return;
        sidebar.classList.toggle('collapsed', collapsed);
        appLayout.classList.toggle('sidebar-collapsed', collapsed);
        if (sidebarToggle) {
            sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
        }
    }

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function () {
            const collapsed = !sidebar.classList.contains('collapsed');
            applySidebarState(collapsed);
            storeSidebarState(collapsed);
        });
    }

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
        el.setAttribute('aria-hidden', 'false');
    }

    function closeModal(el) {
        if (!el) return;
        el.classList.remove('open');
        el.setAttribute('aria-hidden', 'true');
    }

    /* ======================================================================
       3. LIVE DATA STATE (Hardcoded sample arrays removed)
       ====================================================================== */

    const ROLES = ['Super Admin', 'Admin', 'Facility Manager', 'Viewer'];
    let users = [];

    async function loadData() {
        const tbody = $('#userTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">Loading accounts...</td></tr>`;
        }

        try {
            users = await fetchUsersFromDb();
            renderUsers();
        } catch (err) {
            console.error("Failed to fetch users:", err);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Failed to load accounts: ${esc(err.message)}</td></tr>`;
            }
        }
    }

    /* ======================================================================
       4. ACTIONS AND BUSINESS RULES
       ====================================================================== */

    function activeSuperAdmins() {
        return users.filter((u) => u.role === 'Super Admin' && u.status === 'Active').length;
    }

    async function changeUserRole(user, nextRole) {
        if (user.role === nextRole) return;

        const isLastActiveSuperAdmin =
            user.role === 'Super Admin' && user.status === 'Active' && activeSuperAdmins() <= 1;

        if (isLastActiveSuperAdmin && nextRole !== 'Super Admin') {
            toast('At least one active Super Admin is required.');
            renderUsers();
            return;
        }

        const prev = user.role;
        try {
            await setUserRoleInDb(user.id, user.name, prev, nextRole);
            user.role = nextRole;
            toast(`Role updated to ${nextRole}.`);
            renderUsers();
        } catch (err) {
            toast('Failed to update role.');
            renderUsers();
        }
    }

    async function toggleUserStatusAction(user) {
        const isLastSuperAdmin =
            user.role === 'Super Admin' && user.status === 'Active' && activeSuperAdmins() <= 1;

        if (isLastSuperAdmin) {
            toast('At least one active Super Admin is required.');
            return;
        }

        const next = user.status === 'Active' ? 'Inactive' : 'Active';
        try {
            await setUserStatusInDb(user.id, user.name, next);
            user.status = next;
            toast(`${user.name} ${next === 'Active' ? 'activated' : 'deactivated'}.`);
            renderUsers();
        } catch (err) {
            toast('Failed to change status.');
        }
    }

    /* ======================================================================
       5. RENDERING
       ====================================================================== */

    function renderUsers() {
        if (!Array.isArray(users)) users = [];

        const q = $('#userSearch')?.value.trim().toLowerCase() || '';
        const role = $('#userRoleFilter')?.value || '';

        const rows = users.filter((u) =>
            (!role || u.role === role) &&
            (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
        );

        const tbody = $('#userTableBody');
        const emptyState = $('#userEmpty');

        if (!tbody) return;

        if (rows.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        tbody.innerHTML = rows.map((u) => {
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

        if (u) {
            $('#userEmail').disabled = true; // Email shouldn't be altered for existing accounts
        } else {
            $('#userEmail').disabled = false;
        }

        openModal(userModal);
        $('#userName').focus();
    }

    if (userForm) {
        userForm.addEventListener('submit', async function (e) {
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

            if (!id && users.some((u) => u.email.toLowerCase() === email)) {
                toast('An account with this email already exists.');
                return;
            }

            const submitBtn = userForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = "Saving...";
            }

            try {
                if (id) {
                    const u = findById(users, id);
                    const removingLastSuperAdmin =
                        u.role === 'Super Admin' && u.status === 'Active' &&
                        (role !== 'Super Admin' || status !== 'Active') &&
                        activeSuperAdmins() <= 1;

                    if (removingLastSuperAdmin) {
                        toast('At least one active Super Admin is required.');
                        return;
                    }

                    await updateUserInDb(id, { name, role, status });
                    toast('Account updated.');
                } else {
                    await createUserInDb({ name, email, role, status });
                    toast('Account created. Default password: Password123!');
                }

                closeModal(userModal);
                await loadData();

            } catch (err) {
                console.error("Save error:", err);
                toast(err.message || 'Operation failed.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = "Save Account";
                }
            }
        });
    }

    /* ======================================================================
       7. EVENTS
       ====================================================================== */

    function handleRowAction(action, id) {
        const u = findById(users, id);
        switch (action) {
            case 'edit-user':
                openUserModal(id);
                return;
            case 'toggle-user':
                if (u) toggleUserStatusAction(u);
                break;
            default:
                return;
        }
    }

    document.addEventListener('click', async function (e) {
        if (e.target.closest('#addUserBtn')) {
            openUserModal();
            return;
        }

        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
            handleRowAction(actionBtn.dataset.action, actionBtn.dataset.id);
            return;
        }

        if (e.target.closest('#logoutBtn')) {
            openModal(logoutModal);
            return;
        }

        if (e.target.closest('#logoutConfirm')) {
            try {
                await performLogout();
                localStorage.clear();
                window.location.href = '../pho/pho-login.html';
            } catch (err) {
                window.location.href = '../pho/pho-login.html';
            }
            return;
        }

        const closeBtn = e.target.closest('[data-close]');
        if (closeBtn) {
            closeModal(closeBtn.closest('.modal-overlay, .logout-modal'));
            return;
        }

        if (e.target.classList.contains('modal-overlay') || e.target === logoutModal) {
            closeModal(e.target);
        }
    });

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
        if (el) {
            el.addEventListener('input', renderUsers);
            el.addEventListener('change', renderUsers);
        }
    });

    /* ======================================================================
       8. INITIALIZATION
       ====================================================================== */

    listenToAuth((user) => {
        if (!user) {
            window.location.href = '../pho/pho-login.html';
            return;
        }
        applySidebarState(readSidebarState());
        loadData();
    });
})();