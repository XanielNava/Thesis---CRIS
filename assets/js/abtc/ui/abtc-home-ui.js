/* ==========================================================================
   CRIS ABTC MODULE — HOME DASHBOARD UI CONTROLLER (abtc-home-ui.js)
   Handles Header & Metrics Rendering, Today's Vaccination Queue Table,
   Interactive Facility Calendar & Announcements Widget, and Change PIN Modal.
   ========================================================================== */

import {
    resolveHomeFacilitySession,
    fetchFacilityBranding,
    fetchAggregatedHomeMetrics,
    subscribeToTodaySchedule,
    subscribeToVaccineInventoryCount,
    subscribeToFacilityAnnouncements,
    updateStaffSecurityPin
} from '../db/abtc-home-db.js';

const $ = (id) => document.getElementById(id);

const facilityTitleDisplay = $('facilityTitleDisplay');
const profileInfoText = $('profileInfoText');
const totalPatientsCount = $('totalPatientsCount');
const dosesTodayCount = $('dosesTodayCount');
const categoryThreeCount = $('categoryThreeCount');
const vialStockCount = $('vialStockCount');
const todayDateBadge = $('todayDateBadge');
const todayScheduleTableBody = $('todayScheduleTableBody');
const changePinBtn = $('changePinBtn');

let currentFacilityId = sessionStorage.getItem('activeFacilityId') || null;
let unsubSchedule = null;
let unsubInventory = null;
let unsubAnnouncements = null;

// Calendar & Announcements state
const now = new Date();
const formattedToday = now.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
});
const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
const todayISODate = localDate.toISOString().split('T')[0];

let viewYear = now.getFullYear();
let viewMonth = now.getMonth();
let selectedDateISO = todayISODate;
let announcementsByDate = {};

if (todayDateBadge) todayDateBadge.textContent = formattedToday;

const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));

function toISODateString(year, monthZeroIndexed, day) {
    const m = String(monthZeroIndexed + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
}

function formatLongDate(isoStr) {
    const [y, m, d] = isoStr.split('-').map(Number);
    if (!y || !m || !d) return isoStr;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
}

/* ==========================================================================
   1. DASHBOARD INITIALIZATION & REAL-TIME SUBSCRIPTIONS
   ========================================================================== */

async function initDashboard(facilityId) {
    currentFacilityId = facilityId;

    const activeName = sessionStorage.getItem('activePersonnelName') || 'Duty Personnel';
    const activeRole = sessionStorage.getItem('activeDesignation') || 'Nurse';

    if (profileInfoText) {
        profileInfoText.innerHTML = `<strong>${esc(activeName)}</strong><br><span>${esc(activeRole)}</span>`;
    }

    const isOwnerOrAdmin =
        activeRole.toLowerCase().includes('owner') ||
        (activeRole.toLowerCase() === 'admin' && !sessionStorage.getItem('activeStaffUid'));

    if (changePinBtn) {
        changePinBtn.style.display = isOwnerOrAdmin ? 'none' : 'inline-flex';
    }

    const branding = await fetchFacilityBranding(currentFacilityId);
    if (facilityTitleDisplay) {
        facilityTitleDisplay.textContent = branding.facilityAcronym
            ? `${branding.facilityName} (${branding.facilityAcronym})`
            : branding.facilityName;
    }

    if (!currentFacilityId) return;

    const metrics = await fetchAggregatedHomeMetrics(currentFacilityId);
    if (totalPatientsCount) totalPatientsCount.textContent = metrics.totalPatients;
    if (categoryThreeCount) categoryThreeCount.textContent = metrics.categoryThreeCount;

    if (unsubSchedule) unsubSchedule();
    unsubSchedule = subscribeToTodaySchedule(
        currentFacilityId,
        todayISODate,
        (todayDosesList) => {
            if (dosesTodayCount) dosesTodayCount.textContent = todayDosesList.length;
            renderTodayScheduleTable(todayDosesList);
        }
    );

    if (unsubInventory) unsubInventory();
    unsubInventory = subscribeToVaccineInventoryCount(currentFacilityId, (totalVials) => {
        if (vialStockCount) vialStockCount.textContent = totalVials;
    });

    if (unsubAnnouncements) unsubAnnouncements();
    unsubAnnouncements = subscribeToFacilityAnnouncements(currentFacilityId, (byDateMap) => {
        announcementsByDate = byDateMap;
        renderFacilityCalendar();
        renderSelectedDateAnnouncements();
    });
}

/* ==========================================================================
   2. TODAY'S VACCINATION SCHEDULE TABLE
   ========================================================================== */

function renderTodayScheduleTable(dosesList) {
    if (!todayScheduleTableBody) return;

    if (dosesList.length === 0) {
        todayScheduleTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">
                    <i class="fa-solid fa-circle-check" style="color: var(--success); margin-right: 6px;"></i>
                    No patients scheduled for follow-up PEP doses today.
                </td>
            </tr>`;
        return;
    }

    todayScheduleTableBody.innerHTML = dosesList
        .map((item) => {
            const isCompleted = item.status === 'Completed';
            return `
            <tr>
                <td><strong>${esc(item.itrNo)}</strong></td>
                <td>${esc(item.patientName)}</td>
                <td><span class="dose-tag">${esc(item.targetDoseLabel)}</span></td>
                <td>${esc(item.contactNo)}</td>
                <td><span class="status-badge ${isCompleted ? 'completed' : 'pending'}">${esc(item.status)}</span></td>
                <td>${
                    isCompleted
                        ? `<button class="btn-sm secondary" disabled>Completed</button>`
                        : `<button class="btn-sm primary btn-administer-now" data-id="${esc(item.docId)}">Administer</button>`
                }</td>
            </tr>`;
        })
        .join('');

    todayScheduleTableBody.querySelectorAll('.btn-administer-now').forEach((btn) => {
        btn.addEventListener('click', () => {
            window.location.href = `abtc-calendar.html?patientId=${encodeURIComponent(
                btn.getAttribute('data-id')
            )}`;
        });
    });
}

/* ==========================================================================
   3. FACILITY CALENDAR & ADMIN ANNOUNCEMENTS WIDGET
   ========================================================================== */

function renderFacilityCalendar() {
    const monthLabelEl = $('homeCalMonthLabel');
    const daysGridEl = $('homeCalDaysGrid');
    if (!monthLabelEl || !daysGridEl) return;

    const monthDate = new Date(viewYear, viewMonth, 1);
    monthLabelEl.textContent = monthDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });

    const firstWeekday = monthDate.getDay();
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();

    let cellsHtml = '';
    for (let i = 0; i < firstWeekday; i++) {
        cellsHtml += `<span class="home-cal-empty"></span>`;
    }

    for (let day = 1; day <= totalDays; day++) {
        const iso = toISODateString(viewYear, viewMonth, day);
        const isToday = iso === todayISODate;
        const isSelected = iso === selectedDateISO;
        const hasAnnouncement =
            Array.isArray(announcementsByDate[iso]) && announcementsByDate[iso].length > 0;

        const classes = [
            'home-cal-day',
            isToday ? 'today' : '',
            isSelected ? 'selected' : '',
            hasAnnouncement ? 'has-note' : ''
        ]
            .filter(Boolean)
            .join(' ');

        cellsHtml += `<button type="button" class="${classes}" data-date="${iso}">${day}</button>`;
    }

    daysGridEl.innerHTML = cellsHtml;
}

function renderSelectedDateAnnouncements() {
    const dateLabelEl = $('homeSelectedDateLabel');
    const listEl = $('homeDateAnnouncementsList');
    if (!dateLabelEl || !listEl) return;

    dateLabelEl.textContent = formatLongDate(selectedDateISO);

    const items = announcementsByDate[selectedDateISO] || [];
    if (items.length === 0) {
        listEl.innerHTML = `
            <div class="notice-item empty-notice">
                <p>No announcements or reminders posted for this date.</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = items
        .map(
            (note) => `
            <div class="notice-item warning">
                <strong><i class="fa-solid fa-bullhorn"></i> ${esc(note.createdBy)}</strong>
                <p>${esc(note.message)}</p>
            </div>
        `
        )
        .join('');
}

function wireCalendarControls() {
    $('homeCalPrevBtn')?.addEventListener('click', () => {
        viewMonth--;
        if (viewMonth < 0) {
            viewMonth = 11;
            viewYear--;
        }
        renderFacilityCalendar();
    });

    $('homeCalNextBtn')?.addEventListener('click', () => {
        viewMonth++;
        if (viewMonth > 11) {
            viewMonth = 0;
            viewYear++;
        }
        renderFacilityCalendar();
    });

    $('homeCalDaysGrid')?.addEventListener('click', (e) => {
        const dayBtn = e.target.closest('button[data-date]');
        if (!dayBtn) return;
        selectedDateISO = dayBtn.dataset.date;
        renderFacilityCalendar();
        renderSelectedDateAnnouncements();
    });
}

/* ==========================================================================
   4. CHANGE PIN MODAL & UNIFIED SHOW PIN CONTROLLER
   ========================================================================== */

const changePinModal = $('changePinModal');
const closePinModalBtn = $('closePinModalBtn');
const cancelPinBtn = $('cancelPinBtn');
const changePinForm = $('changePinForm');
const showPinsCheckbox = $('showPinsCheckbox');

function toggleAllPinVisibility(shouldShow) {
    document.querySelectorAll('.pin-field').forEach((input) => {
        input.type = shouldShow ? 'text' : 'password';
    });
}

showPinsCheckbox?.addEventListener('change', (e) => {
    toggleAllPinVisibility(e.target.checked);
});

function resetPinModalState() {
    changePinForm?.reset();
    if (showPinsCheckbox) showPinsCheckbox.checked = false;
    toggleAllPinVisibility(false);
}

changePinBtn?.addEventListener('click', () => {
    resetPinModalState();
    changePinModal?.classList.add('open', 'active');
    $('currentPinInput')?.focus();
});

function closePinModal() {
    changePinModal?.classList.remove('open', 'active');
    resetPinModalState();
}

closePinModalBtn?.addEventListener('click', closePinModal);
cancelPinBtn?.addEventListener('click', closePinModal);

changePinForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPinVal = $('currentPinInput').value.trim();
    const newPinVal = $('newPinInput').value.trim();
    const confirmPinVal = $('confirmPinInput').value.trim();

    if (newPinVal.length !== 4 || isNaN(newPinVal)) {
        return alert('New PIN must be exactly 4 numeric digits.');
    }

    if (newPinVal !== confirmPinVal) {
        return alert('New PIN and Confirm PIN do not match.');
    }

    const savePinBtn = $('savePinBtn');
    savePinBtn.disabled = true;
    savePinBtn.textContent = 'Updating...';

    try {
        await updateStaffSecurityPin({
            facilityId: currentFacilityId,
            personnelName: sessionStorage.getItem('activePersonnelName') || '',
            currentPin: currentPinVal,
            newPin: newPinVal
        });

        alert('Security PIN successfully updated!');
        closePinModal();
    } catch (error) {
        console.error('PIN update error:', error);
        alert('Failed to update PIN: ' + error.message);
    } finally {
        savePinBtn.disabled = false;
        savePinBtn.textContent = 'Update PIN';
    }
});

/* ==========================================================================
   5. BOOTSTRAP
   ========================================================================== */

wireCalendarControls();
renderFacilityCalendar();
renderSelectedDateAnnouncements();

resolveHomeFacilitySession((facilityId) => {
    initDashboard(facilityId);
});