/* ==========================================================================
   CRIS LGU MODULE — SETTINGS UI CONTROLLER (lgu-settings-ui.js)
   ========================================================================== */

import { auth } from '../../firebase/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
    buildLguOrgId,
    fetchLguOfficerProfile,
    fetchMunicipalitySettings,
    saveMunicipalitySettings,
    updateMunicipalityBarangays,
    updateLguOfficerProfile,
    changeLguOfficerPassword
} from '../db/lgu-settings-db.js';

let currentOfficer = null;
let currentMuniSettings = null;
let barangaysList = [];
let toastTimer = null;

/* ==========================================================================
   1. HELPERS
   ========================================================================== */

const $ = (id) => document.getElementById(id);

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function showToast(message) {
    let toast = $('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function getActiveMunicipality() {
    const rawMuni = currentOfficer?.municipality
        || currentOfficer?.address?.municipality
        || localStorage.getItem('userMunicipality')
        || $('lguName')?.value
        || 'Iloilo';
    return rawMuni.replace(/^Municipality of\s+/i, '').trim() || 'Iloilo';
}

function getActiveDistrict() {
    return currentOfficer?.district
        || currentOfficer?.address?.district
        || localStorage.getItem('userDistrict')
        || $('lguDistrict')?.value
        || '';
}

/* ==========================================================================
   2. UI RENDERING
   ========================================================================== */

function populateAllSettingsFields() {
    const municipality = getActiveMunicipality();
    const district = getActiveDistrict();
    const orgId = currentOfficer?.organizationId || buildLguOrgId(municipality);
    const fullName = currentOfficer?.fullName || localStorage.getItem('userFullName') || 'LGU Duty Officer';
    const designation = currentOfficer?.designation || localStorage.getItem('userDesignation') || 'LGU Administrator';

    // 1. Top Header Banner Profile Pill
    if ($('headerUserName')) {
        $('headerUserName').textContent = fullName;
    } else {
        const fallbackHeaderStrong = document.querySelector('.user-profile-top .profile-info strong');
        if (fallbackHeaderStrong) fallbackHeaderStrong.textContent = fullName;
    }

    if ($('headerUserRole')) {
        $('headerUserRole').textContent = `${designation} · ${municipality}`;
    } else {
        const fallbackHeaderSpan = document.querySelector('.user-profile-top .profile-info span');
        if (fallbackHeaderSpan) fallbackHeaderSpan.textContent = `${designation} · ${municipality}`;
    }

    // 2. LGU Municipality Profile Card
    if ($('lguDistrict')) $('lguDistrict').value = district;
    if ($('lguName')) $('lguName').value = `Municipality of ${municipality}`;
    if ($('lguCode')) $('lguCode').value = orgId;
    if ($('lguAgriculturist')) $('lguAgriculturist').value = currentMuniSettings?.agriculturist || '';
    if ($('lguHealthOfficer')) $('lguHealthOfficer').value = currentMuniSettings?.healthOfficer || '';
    if ($('lguContact')) {
        $('lguContact').value = currentMuniSettings?.contactNumber || currentOfficer?.contactNumber || '';
    }
    if ($('lguOfficeAddress')) $('lguOfficeAddress').value = currentMuniSettings?.officeAddress || '';

    // 3. Officer Personal Account Card
    if ($('userFirstName')) $('userFirstName').value = currentOfficer?.firstName || '';
    if ($('userLastName')) $('userLastName').value = currentOfficer?.lastName || '';
    if ($('userMiddleInitial')) $('userMiddleInitial').value = currentOfficer?.middleInitial || '';
    if ($('userSuffix')) $('userSuffix').value = currentOfficer?.suffix || '';
    if ($('userDesignation')) $('userDesignation').value = designation;
    if ($('userPhone')) $('userPhone').value = currentOfficer?.contactNumber || '';
    if ($('userEmail')) $('userEmail').value = currentOfficer?.email || localStorage.getItem('userEmail') || '';
}

function renderBarangayList() {
    const container = $('barangayListContainer') || document.querySelector('.brgy-jurisdiction-list');
    const badge = $('brgyCountBadge');
    if (!container) return;

    if (badge) {
        badge.textContent = `${barangaysList.length} ${barangaysList.length === 1 ? 'Barangay' : 'Barangays'}`;
    }

    if (!barangaysList.length) {
        container.innerHTML = `<div class="brgy-empty-state">No barangays registered under this LGU yet. Add monitored barangays above.</div>`;
        return;
    }

    container.innerHTML = barangaysList.map((b, index) => {
        const isActive = b.status === 'Active Reporting';
        const pillClass = isActive ? 'badge-lgu badge-verified-lgu' : 'badge-lgu badge-pending-verify';

        return `
            <div class="brgy-item-row">
                <div class="brgy-item-info">
                    <i class="fa-solid fa-location-dot"></i>
                    <strong>${esc(b.name)}</strong>
                </div>
                <div class="brgy-item-actions">
                    <button
                        type="button"
                        class="${pillClass}"
                        data-action="toggle-status"
                        data-index="${index}"
                        title="Click to toggle reporting status"
                    >
                        ${esc(b.status)}
                    </button>
                    <button
                        type="button"
                        class="btn-brgy-remove"
                        data-action="remove-brgy"
                        data-index="${index}"
                        title="Remove Barangay"
                    >
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/* ==========================================================================
   3. FORM & BUTTON HANDLERS
   ========================================================================== */

async function handleSaveMunicipality(e) {
    if (e) e.preventDefault();

    const btn = $('saveLguBtn');
    const originalHTML = btn ? btn.innerHTML : '';
    const municipality = getActiveMunicipality();
    const district = getActiveDistrict();

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        }

        const updated = await saveMunicipalitySettings({
            municipality,
            district,
            agriculturist: $('lguAgriculturist')?.value || '',
            healthOfficer: $('lguHealthOfficer')?.value || '',
            contactNumber: $('lguContact')?.value || '',
            officeAddress: $('lguOfficeAddress')?.value || ''
        }, currentOfficer);

        currentMuniSettings = { ...currentMuniSettings, ...updated };
        showToast('LGU Municipality profile saved.');
    } catch (err) {
        console.error('Failed to save LGU Municipality profile:', err);
        showToast('Error saving municipality settings.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML || '<i class="fa-solid fa-floppy-disk"></i> Save Municipality Details';
        }
    }
}

async function handleAddBarangay(e) {
    e.preventDefault();

    const nameInput = $('newBarangayInput');
    const statusSelect = $('newBarangayStatus');
    const rawName = nameInput?.value.trim() || '';
    const status = statusSelect?.value || 'Active Reporting';

    if (!rawName) return;

    const formattedName = /^barangay\b|^brgy\.?\b/i.test(rawName) ? rawName : `Barangay ${rawName}`;

    if (barangaysList.some((b) => b.name.toLowerCase() === formattedName.toLowerCase())) {
        showToast('This barangay is already listed.');
        return;
    }

    const updated = [...barangaysList, { name: formattedName, status }];
    const municipality = getActiveMunicipality();
    const district = getActiveDistrict();

    try {
        await updateMunicipalityBarangays(municipality, district, updated, currentOfficer);
        barangaysList = updated;
        renderBarangayList();
        if (nameInput) nameInput.value = '';
        showToast(`${formattedName} added to monitored jurisdictions.`);
    } catch (err) {
        console.error('Error adding barangay:', err);
        showToast('Failed to add barangay.');
    }
}

async function handleBarangayListClick(e) {
    const toggleBtn = e.target.closest('[data-action="toggle-status"]');
    const removeBtn = e.target.closest('[data-action="remove-brgy"]');
    if (!toggleBtn && !removeBtn) return;

    const index = Number((toggleBtn || removeBtn).dataset.index);
    if (Number.isNaN(index) || !barangaysList[index]) return;

    const updated = [...barangaysList];
    if (toggleBtn) {
        updated[index] = {
            ...updated[index],
            status: updated[index].status === 'Active Reporting' ? 'Sync Pending' : 'Active Reporting'
        };
    } else if (removeBtn) {
        updated.splice(index, 1);
    }

    try {
        await updateMunicipalityBarangays(getActiveMunicipality(), getActiveDistrict(), updated, currentOfficer);
        barangaysList = updated;
        renderBarangayList();
        showToast(removeBtn ? 'Barangay removed.' : 'Barangay status updated.');
    } catch (err) {
        console.error('Error updating barangay jurisdiction:', err);
        showToast('Failed to update barangay.');
    }
}

async function handleSavePersonalProfile(e) {
    e.preventDefault();
    const uid = currentOfficer?.id || auth.currentUser?.uid || localStorage.getItem('userUid');
    if (!uid) {
        showToast('Unable to identify logged-in officer.');
        return;
    }

    const btn = $('savePersonalBtn');
    const originalHTML = btn ? btn.innerHTML : '';

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
        }

        const updated = await updateLguOfficerProfile(uid, {
            firstName: $('userFirstName')?.value || '',
            lastName: $('userLastName')?.value || '',
            middleInitial: $('userMiddleInitial')?.value || '',
            suffix: $('userSuffix')?.value || '',
            contactNumber: $('userPhone')?.value || ''
        });

        currentOfficer = { ...currentOfficer, ...updated };
        populateAllSettingsFields();
        showToast('Personal officer details updated.');
    } catch (err) {
        console.error('Error updating personal profile:', err);
        showToast('Failed to update personal info.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML || '<i class="fa-solid fa-user-check"></i> Update Personal Info';
        }
    }
}

async function handleChangePassword(e) {
    e.preventDefault();

    const currentPass = $('currentPassword')?.value || '';
    const newPass = $('newPassword')?.value || '';
    const confirmPass = $('confirmNewPassword')?.value || '';
    const btn = $('savePasswordBtn');
    const originalHTML = btn ? btn.innerHTML : '';

    if (newPass.length < 6) {
        showToast('New password must be at least 6 characters.');
        return;
    }

    if (newPass !== confirmPass) {
        showToast('New passwords do not match.');
        return;
    }

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
        }

        await changeLguOfficerPassword(currentPass, newPass);
        e.target.reset();
        showToast('Password updated successfully.');
    } catch (err) {
        console.error('Password change error:', err);
        const msg = err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential'
            ? 'Current password is incorrect.'
            : (err?.message || 'Failed to update password.');
        showToast(msg);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML || '<i class="fa-solid fa-key"></i> Update Password';
        }
    }
}

/* ==========================================================================
   4. BIND EVENTS & INITIALIZE
   ========================================================================== */

function bindEvents() {
    const lguForm = $('lguProfileForm');
    if (lguForm) {
        lguForm.addEventListener('submit', handleSaveMunicipality);
    } else {
        $('saveLguBtn')?.addEventListener('click', handleSaveMunicipality);
    }

    $('addBarangayForm')?.addEventListener('submit', handleAddBarangay);

    const brgyContainer = $('barangayListContainer') || document.querySelector('.brgy-jurisdiction-list');
    brgyContainer?.addEventListener('click', handleBarangayListClick);

    $('personalProfileForm')?.addEventListener('submit', handleSavePersonalProfile);
    $('passwordChangeForm')?.addEventListener('submit', handleChangePassword);
}

async function loadSettingsSession(uid) {
    try {
        if (uid) {
            currentOfficer = await fetchLguOfficerProfile(uid);
        }

        const municipality = getActiveMunicipality();
        const district = getActiveDistrict();

        currentMuniSettings = await fetchMunicipalitySettings(municipality, district);
        barangaysList = Array.isArray(currentMuniSettings?.barangays)
            ? currentMuniSettings.barangays
            : [];

        populateAllSettingsFields();
        renderBarangayList();
    } catch (err) {
        console.error('Error loading LGU Settings:', err);
        showToast('Failed to load LGU settings.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    bindEvents();

    onAuthStateChanged(auth, async (user) => {
        const uid = user?.uid || localStorage.getItem('userUid');
        if (!uid) {
            window.location.href = 'lgu-login.html';
            return;
        }
        await loadSettingsSession(uid);
    });
});