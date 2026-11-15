/* ==========================================================================
   PVO ACCOUNT MANAGEMENT — UI CONTROLLER (pvo-users-ui.js)
   Manages PVO and LGU personnel review, approvals, rejections, and audit logs
   ========================================================================== */

import { auth } from '../../firebase/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
    fetchCurrentAdminProfile,
    fetchManagedAccounts,
    fetchRecentPvoAuditLogs,
    approveManagedAccount,
    rejectManagedAccount
} from '../db/pvo-users-db.js';

let currentAdmin = null;
let usersList = [];
let auditList = [];
let currentPendingFilter = 'ALL'; // 'ALL' | 'PVO' | 'LGU'
let activeReviewAccount = null;
let toastTimer = null;

/* ==========================================================================
   1. HELPERS
   ========================================================================== */

const $ = (id) => document.getElementById(id);

const setText = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
};

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function showToast(message) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ==========================================================================
   2. RENDERING
   ========================================================================== */

function renderAdminHeader() {
    if (!currentAdmin) return;
    const fullName = currentAdmin.fullName || currentAdmin.email || 'System Administrator';
    const role = currentAdmin.designation || 'Administrator';
    const initials = fullName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('') || 'AD';

    setText('adminName', fullName);
    setText('adminRole', role);
    setText('adminAvatar', initials);
}

function renderStats() {
    const activePvo = usersList.filter((u) => u.scope === 'PVO' && u.status === 'Active').length;
    const activeLgu = usersList.filter((u) => u.scope === 'LGU' && u.status === 'Active').length;
    const pendingAll = usersList.filter((u) => u.status === 'Pending').length;

    setText('statActivePvoUsers', activePvo);
    setText('statActiveLguUsers', activeLgu);
    setText('statActiveUsers', activePvo + activeLgu);
    setText('statPending', pendingAll);
}

function renderPending() {
    const list = $('pendingList');
    if (!list) return;

    const pending = usersList.filter((u) => {
        if (u.status !== 'Pending') return false;
        if (currentPendingFilter === 'ALL') return true;
        return u.scope === currentPendingFilter;
    });

    if (!pending.length) {
        const scopeText = currentPendingFilter === 'ALL' ? 'PVO or LGU' : currentPendingFilter;
        list.innerHTML = `<li><span class="muted">No pending ${esc(scopeText)} personnel approvals.</span></li>`;
        return;
    }

    list.innerHTML = pending.map((u) => {
        const badgeClass = u.scope === 'LGU' ? 'scope-badge scope-lgu' : 'scope-badge scope-pvo';
        const badgeLabel = u.scope === 'LGU' && u.municipality !== 'N/A'
            ? `LGU · ${u.municipality}`
            : 'PVO';

        return `
            <li>
                <div class="li-main">
                    <strong>
                        <span class="${badgeClass}">${esc(badgeLabel)}</span>
                        ${esc(u.name)}
                    </strong>
                    <small>${esc(u.role)} · ${esc(u.email)} · Registered ${esc(u.registered)}</small>
                </div>
                <div class="pending-actions">
                    <button
                        type="button"
                        class="btn btn-review btn-sm"
                        data-action="review"
                        data-id="${esc(u.id)}"
                        data-scope="${esc(u.scope)}"
                    >
                        Review
                    </button>
                    <button
                        type="button"
                        class="btn btn-success btn-sm"
                        data-action="approve"
                        data-id="${esc(u.id)}"
                        data-scope="${esc(u.scope)}"
                    >
                        Approve
                    </button>
                </div>
            </li>`;
    }).join('');
}

function renderActivity() {
    const list = $('recentActivity');
    if (!list) return;

    list.innerHTML = auditList.length
        ? auditList.slice(0, 5).map((a) => `
            <li>
                <div class="li-main">
                    <strong>${esc(a.action)}</strong>
                    <small>${esc(a.affected)} · ${esc(a.performedBy)}</small>
                </div>
                <small>${esc(a.timestamp)}</small>
            </li>`).join('')
        : '<li><span class="muted">No recent administrative activity recorded.</span></li>';
}

function renderAll() {
    renderAdminHeader();
    renderStats();
    renderPending();
    renderActivity();
}

/* ==========================================================================
   3. REVIEW MODAL LOGIC
   ========================================================================== */

function openReviewModal(userId, scope) {
    const user = usersList.find((u) => u.id === userId && (!scope || u.scope === scope));
    if (!user) return;

    activeReviewAccount = user;

    const badge = $('reviewScopeBadge');
    if (badge) {
        badge.className = user.scope === 'LGU' ? 'scope-badge scope-lgu' : 'scope-badge scope-pvo';
        badge.textContent = user.scope === 'LGU' ? `LGU (${user.municipality})` : 'PVO Personnel';
    }

    setText('revFullName', user.name);
    setText('revEmail', user.email);
    setText('revRole', user.role);
    setText('revScope', user.scope === 'LGU' ? 'Municipal LGU Account' : 'Provincial Veterinary Office (PVO)');
    setText('revDistrict', user.district);
    setText('revMunicipality', user.municipality);
    setText('revContact', user.contactNumber);
    setText('revDob', user.dateOfBirth);
    setText('revAddress', user.addressText);
    setText('revRegistered', user.registered);
    setText('revStatus', user.status);

    const reasonInput = $('revRejectReason');
    if (reasonInput) reasonInput.value = '';

    const modal = $('accountReviewModal');
    if (modal) {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    }
}

function closeReviewModal() {
    activeReviewAccount = null;
    const modal = $('accountReviewModal');
    if (modal) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }
}

/* ==========================================================================
   4. ACTIONS & DATA LOADING
   ========================================================================== */

async function loadDashboardData() {
    try {
        const [users, audits] = await Promise.all([
            fetchManagedAccounts(),
            fetchRecentPvoAuditLogs(5)
        ]);
        usersList = users;
        auditList = audits;
        renderAll();
    } catch (err) {
        console.error('Failed to load managed accounts data:', err);
        showToast('Error loading PVO & LGU personnel records.');
    }
}

async function handleApproveUser(userId, scope, btnEl) {
    const user = usersList.find((u) => u.id === userId && (!scope || u.scope === scope));
    if (!user || user.status !== 'Pending') return;

    if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = 'Approving...';
    }

    try {
        await approveManagedAccount(user, currentAdmin);
        showToast(`${user.scope} account for ${user.name} approved.`);
        closeReviewModal();
        await loadDashboardData();
    } catch (err) {
        console.error('Error approving account:', err);
        showToast('Failed to approve account.');
    } finally {
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.textContent = btnEl.id === 'modalApproveBtn' ? 'Approve Account' : 'Approve';
        }
    }
}

async function handleRejectUser(btnEl) {
    if (!activeReviewAccount) return;

    const reasonInput = $('revRejectReason');
    const reason = reasonInput?.value.trim() || '';

    if (!reason) {
        showToast('Please enter a reason before rejecting the account.');
        reasonInput?.focus();
        return;
    }

    if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = 'Rejecting...';
    }

    try {
        await rejectManagedAccount(activeReviewAccount, reason, currentAdmin);
        showToast(`${activeReviewAccount.scope} account for ${activeReviewAccount.name} rejected.`);
        closeReviewModal();
        await loadDashboardData();
    } catch (err) {
        console.error('Error rejecting account:', err);
        showToast('Failed to reject account.');
    } finally {
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.textContent = 'Reject Account';
        }
    }
}

/* ==========================================================================
   5. EVENTS & INITIALIZATION
   ========================================================================== */

function bindEvents() {
    const pendingList = $('pendingList');
    if (pendingList) {
        pendingList.addEventListener('click', (e) => {
            const reviewBtn = e.target.closest('[data-action="review"]');
            if (reviewBtn) {
                openReviewModal(reviewBtn.dataset.id, reviewBtn.dataset.scope);
                return;
            }

            const approveBtn = e.target.closest('[data-action="approve"]');
            if (approveBtn) {
                handleApproveUser(approveBtn.dataset.id, approveBtn.dataset.scope, approveBtn);
            }
        });
    }

    const filterTabs = $('pendingFilterTabs');
    if (filterTabs) {
        filterTabs.addEventListener('click', (e) => {
            const tab = e.target.closest('.filter-tab');
            if (!tab) return;

            currentPendingFilter = tab.dataset.filter || 'ALL';
            filterTabs.querySelectorAll('.filter-tab').forEach((b) => b.classList.remove('active'));
            tab.classList.add('active');
            renderPending();
        });
    }

    // Modal controls
    $('closeReviewModalBtn')?.addEventListener('click', closeReviewModal);
    $('modalCancelBtn')?.addEventListener('click', closeReviewModal);

    const modalOverlay = $('accountReviewModal');
    modalOverlay?.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeReviewModal();
    });

    $('modalApproveBtn')?.addEventListener('click', (e) => {
        if (activeReviewAccount) {
            handleApproveUser(activeReviewAccount.id, activeReviewAccount.scope, e.currentTarget);
        }
    });

    $('modalRejectBtn')?.addEventListener('click', (e) => {
        handleRejectUser(e.currentTarget);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bindEvents();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentAdmin = await fetchCurrentAdminProfile(user.uid);
        }
        await loadDashboardData();
    });
});