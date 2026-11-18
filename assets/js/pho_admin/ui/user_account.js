/* ==========================================================================
   USER MANAGEMENT — PHO ADMIN PAGE CONTROLLER (user_account.js)
   UI Component (Wired to user_account-db.js)
   ========================================================================== */

import { 
    listenToPhoUsers,
    approveUserInDb,
    rejectUserInDb,
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
       1. HELPERS & TOAST
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
       2. LIVE DATA STATE & ROLE DEFINITIONS
       ====================================================================== */

    const ROLES = ['Administrator', 'Health Officer', 'Facilitating Nurse'];
    let allUsers = [];

    function activeAdminsCount() {
        return allUsers.filter((u) => u.role === 'Administrator' && u.status === 'Active').length;
    }

    /* ======================================================================
       3. ACTIONS AND BUSINESS RULES
       ====================================================================== */

    async function changeUserRole(user, nextRole) {
        if (user.role === nextRole) return;

        const isLastAdmin =
            user.role === 'Administrator' && user.status === 'Active' && activeAdminsCount() <= 1;

        if (isLastAdmin && nextRole !== 'Administrator') {
            toast('At least one active Administrator is required.');
            renderDashboard();
            return;
        }

        const prev = user.role;
        try {
            await setUserRoleInDb(user.id, user.name, prev, nextRole);
            user.role = nextRole;
            toast(`Role updated to ${nextRole}.`);
            renderDashboard();
        } catch (err) {
            toast('Failed to update role.');
            renderDashboard();
        }
    }

    async function toggleUserStatusAction(user) {
        const isLastAdmin =
            user.role === 'Administrator' && user.status === 'Active' && activeAdminsCount() <= 1;

        if (isLastAdmin) {
            toast('At least one active Administrator is required.');
            return;
        }

        const next = user.status === 'Active' ? 'Inactive' : 'Active';
        try {
            await setUserStatusInDb(user.id, user.name, next);
            user.status = next;
            toast(`${user.name} ${next === 'Active' ? 'activated' : 'deactivated'}.`);
            renderDashboard();
        } catch (err) {
            toast('Failed to change status.');
        }
    }

    /* ======================================================================
       4. RENDERING (PENDING QUEUE & DIRECTORY)
       ====================================================================== */

    function renderDashboard() {
        renderPendingQueue();
        renderAuthorizedUsers();
    }

    /**
     * Render Pending Self-Registration Requests
     */
    function renderPendingQueue() {
        const pendingTbody = $('#pendingTableBody');
        const pendingBadge = $('#pendingBadgeCount');
        const pendingEmpty = $('#pendingEmpty');

        if (!pendingTbody) return;

        const pendingUsers = allUsers.filter(u => u.status === 'Pending');

        if (pendingBadge) {
            pendingBadge.textContent = `${pendingUsers.length} Pending`;
            pendingBadge.style.display = pendingUsers.length > 0 ? 'inline-block' : 'none';
        }

        if (pendingUsers.length === 0) {
            pendingTbody.innerHTML = '';
            if (pendingEmpty) pendingEmpty.classList.remove('hidden');
            return;
        }

        if (pendingEmpty) pendingEmpty.classList.add('hidden');

        pendingTbody.innerHTML = pendingUsers.map(u => `
            <tr>
                <td>
                    <strong>${esc(u.name)}</strong><br>
                    <small class="muted">${esc(u.email)}</small>
                </td>
                <td>
                    ${esc(u.contactNumber)}<br>
                    <small class="muted">${esc(u.address?.cityMunicipality || 'Iloilo')}</small>
                </td>
                <td><span class="badge badge-role">${esc(u.role)}</span></td>
                <td><strong>${esc(u.verification.prcLicenseNumber)}</strong></td>
                <td><span class="mono">${esc(u.verification.employeeIdNumber)}</span></td>
                <td>
                    <div class="actions">
                        <button class="btn btn-ghost btn-sm" data-action="view-user" data-id="${esc(u.id)}"><i class="fa-solid fa-eye"></i> View</button>
                        <button class="btn btn-success btn-sm" data-action="approve-pending" data-id="${esc(u.id)}">Approve</button>
                        <button class="btn btn-danger btn-sm" data-action="reject-pending" data-id="${esc(u.id)}">Reject</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Render Active and Inactive Authorized Directory
     */
    function renderAuthorizedUsers() {
        const q = $('#userSearch')?.value.trim().toLowerCase() || '';
        const role = $('#userRoleFilter')?.value || '';

        const activeList = allUsers.filter(u => u.status === 'Active' || u.status === 'Inactive');

        const rows = activeList.filter((u) =>
            (!role || u.role === role) &&
            (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.verification.employeeIdNumber.toLowerCase().includes(q))
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
                    <td>
                        <strong>${esc(u.name)}</strong><br>
                        <small class="muted">${esc(u.email)}</small>
                    </td>
                    <td>
                        <select class="inline-select" data-role-select data-id="${id}" aria-label="Role for ${esc(u.name)}">
                            ${roleOptions}
                        </select>
                    </td>
                    <td>
                        <span class="mono">ID: ${esc(u.verification.employeeIdNumber)}</span><br>
                        <small class="muted">Med Lic: ${esc(u.verification.prcLicenseNumber)}</small>
                    </td>
                    <td>${badge(u.status)}</td>
                    <td class="muted">${esc(u.createdAt)}</td>
                    <td>
                        <div class="actions">
                            <button class="btn btn-ghost btn-sm" data-action="view-user" data-id="${id}"><i class="fa-solid fa-eye"></i> View</button>
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
       5. VIEW ACCOUNT MODAL (INSPECT PROFILE DATA)
       ====================================================================== */

    const viewUserModal = document.getElementById('viewUserModal');

    function openViewModal(id) {
        const u = findById(allUsers, id);
        if (!u) return;

        const raw = u.raw || {};

        // Banner Headers
        $('#viewFullName').textContent = u.name;
        $('#viewEmail').textContent = u.email;

        const roleBadge = $('#viewRoleBadge');
        if (roleBadge) {
            roleBadge.textContent = u.role;
            roleBadge.className = 'badge badge-role';
        }

        const statusBadge = $('#viewStatusBadge');
        if (statusBadge) {
            statusBadge.textContent = u.status;
            statusBadge.className = `badge badge-${slug(u.status)}`;
        }

        // Professional Verification
        $('#viewMedicalLicense').textContent = u.verification.prcLicenseNumber || 'N/A';
        $('#viewEmployeeId').textContent = u.verification.employeeIdNumber || 'N/A';
        
        const isVerified = u.verification.isVerified;
        $('#viewVerifiedState').innerHTML = isVerified 
            ? `<span class="tag-success"><i class="fa-solid fa-circle-check"></i> Verified</span>` 
            : `<span class="tag-warning"><i class="fa-solid fa-clock"></i> Unverified / Pending</span>`;

        $('#viewVerifiedBy').textContent = u.verification.verifiedBy 
            ? `${u.verification.verifiedBy} (${u.verification.verifiedAt ? u.verification.verifiedAt.slice(0, 10) : ''})` 
            : 'Pending Admin Verification';

        // Contact & Station
        $('#viewContact').textContent = u.contactNumber || 'N/A';
        $('#viewDob').textContent = raw.dateOfBirth || 'N/A';

        const addr = u.address || {};
        const fullAddr = [addr.street, addr.barangay, addr.cityMunicipality, addr.province]
            .filter(Boolean)
            .join(', ');
        $('#viewAddress').textContent = fullAddr || 'Iloilo Province';

        // Governance
        $('#viewDateRegistered').textContent = u.createdAt || 'N/A';

        // Dynamic footer actions for pending requests
        const actionsContainer = $('#viewModalActions');
        if (actionsContainer) {
            if (u.status === 'Pending') {
                actionsContainer.innerHTML = `
                    <button type="button" class="btn btn-ghost" data-close>Close</button>
                    <button type="button" class="btn btn-danger" id="viewRejectBtn" data-id="${esc(u.id)}">Reject Request</button>
                    <button type="button" class="btn btn-success" id="viewApproveBtn" data-id="${esc(u.id)}" data-role="${esc(u.role)}">Approve &amp; Activate</button>
                `;

                document.getElementById('viewApproveBtn')?.addEventListener('click', async () => {
                    closeModal(viewUserModal);
                    handleRowAction('approve-pending', u.id);
                });

                document.getElementById('viewRejectBtn')?.addEventListener('click', async () => {
                    closeModal(viewUserModal);
                    handleRowAction('reject-pending', u.id);
                });
            } else {
                actionsContainer.innerHTML = `<button type="button" class="btn btn-ghost" data-close>Close</button>`;
            }
        }

        openModal(viewUserModal);
    }

    /* ======================================================================
       6. CREATE / EDIT ACCOUNT MODAL
       ====================================================================== */

    const userModal = document.getElementById('userModal');
    const userForm = document.getElementById('userForm');

    function openUserModal(id) {
        const u = id ? findById(allUsers, id) : null;

        $('#userModalTitle').textContent = u ? 'Edit account' : 'Create authorized account';
        $('#userId').value = u ? u.id : '';
        $('#userName').value = u ? u.name : '';
        $('#userEmail').value = u ? u.email : '';
        $('#userMedicalLicense').value = u ? (u.verification.prcLicenseNumber !== 'N/A' ? u.verification.prcLicenseNumber : '') : '';
        $('#userEmployeeId').value = u ? (u.verification.employeeIdNumber !== 'N/A' ? u.verification.employeeIdNumber : '') : '';
        $('#userRole').value = u ? u.role : 'Facilitating Nurse';
        $('#userStatus').value = u ? u.status : 'Active';

        if (u) {
            $('#userEmail').disabled = true;
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
            const medicalLicense = $('#userMedicalLicense').value.trim() || 'N/A';
            const employeeId = $('#userEmployeeId').value.trim();
            const role = $('#userRole').value;
            const status = $('#userStatus').value;

            if (!name || !/^\S+@\S+\.\S+$/.test(email) || !employeeId) {
                toast('Please complete all required fields.');
                return;
            }

            if (!id && allUsers.some((u) => u.email.toLowerCase() === email)) {
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
                    const u = findById(allUsers, id);
                    const removingLastAdmin =
                        u.role === 'Administrator' && u.status === 'Active' &&
                        (role !== 'Administrator' || status !== 'Active') &&
                        activeAdminsCount() <= 1;

                    if (removingLastAdmin) {
                        toast('At least one active Administrator is required.');
                        return;
                    }

                    await updateUserInDb(id, { name, role, status, medicalLicense, employeeId });
                    toast('Account updated successfully.');
                } else {
                    await createUserInDb({ name, email, role, status, medicalLicense, employeeId });
                    toast('Account created. Default password: Password123!');
                }

                closeModal(userModal);

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
       7. ROW & MODAL EVENT LISTENERS
       ====================================================================== */

    async function handleRowAction(action, id) {
        const u = findById(allUsers, id);
        if (!u) return;

        switch (action) {
            case 'view-user':
                openViewModal(id);
                break;

            case 'approve-pending':
                if (confirm(`Approve registration for ${u.name} as ${u.role}?`)) {
                    try {
                        await approveUserInDb(u.id, u.name, u.role);
                        toast(`Account approved for ${u.name}.`);
                    } catch (err) {
                        toast('Failed to approve registration.');
                    }
                }
                break;

            case 'reject-pending':
                if (confirm(`Reject registration request for ${u.name}?`)) {
                    try {
                        await rejectUserInDb(u.id, u.name);
                        toast(`Registration rejected.`);
                    } catch (err) {
                        toast('Failed to reject registration.');
                    }
                }
                break;

            case 'edit-user':
                openUserModal(id);
                break;

            case 'toggle-user':
                toggleUserStatusAction(u);
                break;
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

        const u = findById(allUsers, e.target.dataset.id);
        if (u) {
            changeUserRole(u, e.target.value);
        } else {
            renderDashboard();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('.modal-overlay.open, .logout-modal.open').forEach(closeModal);
    });

    ['userSearch', 'userRoleFilter'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', renderDashboard);
            el.addEventListener('change', renderDashboard);
        }
    });

    /* ======================================================================
       8. AUTH INITIALIZATION & REALTIME SUBSCRIBER
       ====================================================================== */

    listenToAuth((user) => {
        if (!user) {
            window.location.href = '../pho/pho-login.html';
            return;
        }

        // Real-time subscription to 'pho-users'
        listenToPhoUsers((users) => {
            allUsers = users;
            renderDashboard();
        });
    });
})();