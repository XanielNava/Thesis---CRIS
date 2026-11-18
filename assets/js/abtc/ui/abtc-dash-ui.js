/* ==========================================================================
   CRIS ABTC MODULE — ADMIN DASHBOARD UI CONTROLLER (abtc-dash-ui.js)
   Handles Header & Metrics Rendering, Interactive Calendar + Month/Year Jump
   Modal, Facility-Scoped Announcement Editor, and Logout.
   ========================================================================== */

import {
    resolveAdminFacilitySession,
    fetchAdminFacilityBranding,
    fetchAdminAggregatedCounts,
    subscribeToAdminTodayScheduled,
    subscribeToAdminVialStock,
    subscribeToAdminFacilityAnnouncements,
    saveFacilityAnnouncement,
    signOutAdminSession
} from '../db/abtc-dash-db.js';

let activeFacilityId = sessionStorage.getItem('activeFacilityId') || null;
let activeFacilityAcronym =
    sessionStorage.getItem('activeFacilityAcronym') ||
    sessionStorage.getItem('activeFacilityCode') ||
    'ABTC';
let activeStaffMember = sessionStorage.getItem('activePersonnelName') || null;
const userRole =
    sessionStorage.getItem('activeDesignation') ||
    localStorage.getItem('activeDesignation') ||
    'Owner';

let unsubToday = null;
let unsubVials = null;
let unsubAnnouncements = null;
let facilityAnnouncementsMap = {};

const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));

/* ==========================================================================
   1. SESSION, HEADER & METRICS
   ========================================================================== */

async function initDashboardSession(facilityId) {
    if (!userRole) {
        window.location.href = 'abtc-profiles.html';
        return;
    }

    activeFacilityId = facilityId;

    const branding = await fetchAdminFacilityBranding(activeFacilityId);
    activeFacilityAcronym = branding.facilityAcronym;
    activeStaffMember = activeStaffMember || branding.staffName;

    if (branding.logoData) {
        const sidebarLogo = document.getElementById('sidebarLogoPreview');
        if (sidebarLogo) sidebarLogo.src = branding.logoData;
    }

    renderUserAndFacilityHeader(
        branding.displayFacilityName,
        activeStaffMember || 'Administrator',
        userRole
    );

    if (!activeFacilityId) return;

    const patientsCounterEl = document.getElementById('totalPatientsCount');
    const catThreeCounterEl = document.getElementById('categoryThreeCount');
    const scheduledTodayEl = document.getElementById('scheduledTodayCount');
    const pepVialsEl = document.getElementById('pepVialsCount');

    const counts = await fetchAdminAggregatedCounts(activeFacilityId);
    if (patientsCounterEl) {
        patientsCounterEl.innerText = String(counts.totalPatients).padStart(2, '0');
    }
    if (catThreeCounterEl) {
        catThreeCounterEl.innerText = String(counts.categoryThreeCount).padStart(2, '0');
    }

    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const todayISODate = localDate.toISOString().split('T')[0];

    if (unsubToday) unsubToday();
    unsubToday = subscribeToAdminTodayScheduled(
        activeFacilityId,
        todayISODate,
        (scheduledTodayCount) => {
            if (scheduledTodayEl) {
                scheduledTodayEl.innerText = String(scheduledTodayCount).padStart(2, '0');
            }
        }
    );

    if (unsubVials) unsubVials();
    unsubVials = subscribeToAdminVialStock(activeFacilityId, (totalVials) => {
        if (pepVialsEl) {
            pepVialsEl.innerText = String(totalVials).padStart(2, '0');
        }
    });

    if (unsubAnnouncements) unsubAnnouncements();
    unsubAnnouncements = subscribeToAdminFacilityAnnouncements(
        activeFacilityId,
        (announcementsByDate) => {
            facilityAnnouncementsMap = announcementsByDate;
            renderCalendar();
            if (selectedDateKey) {
                syncAnnouncementBoxForDate(selectedDateKey);
            }
        }
    );
}

function renderUserAndFacilityHeader(facilityName, displayName, role) {
    const titleElement = document.getElementById('dashboardTitle');
    if (titleElement) {
        titleElement.innerText = `${facilityName.toUpperCase()} DASHBOARD`;
    }

    const mappedRoleTitle =
        role === 'Owner' ? 'Administrator / Owner' : 'Nurse Duty Personnel';
    updateProfileUI(displayName, mappedRoleTitle);
}

function updateProfileUI(name, role) {
    const profileContainer = document.getElementById('profileInfoText');
    const welcomeBar = document.getElementById('welcomeBarText');

    if (profileContainer) {
        profileContainer.innerHTML = `<strong>${esc(name)}</strong><br><span>${esc(role)}</span>`;
    }
    if (welcomeBar) {
        const cleanFirstName = name.split(' ')[0];
        welcomeBar.innerHTML = `<div class="avatar-circle"><i class="fa-solid fa-user"></i></div>Welcome back, ${esc(cleanFirstName)}`;
    }
}

/* ==========================================================================
   2. CRIS DYNAMIC INTERACTIVE CALENDAR & ANNOUNCEMENTS ENGINE
   ========================================================================== */

let currentDate = new Date();
let selectedDateKey = '';
let temporaryModalYear = currentDate.getFullYear();
let modalViewState = 'months';

const shortMonths = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
];

function syncAnnouncementBoxForDate(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    if (!year || !month || !day) return;

    const complianceBox = document.querySelector('.compliance-box');
    if (complianceBox) complianceBox.classList.add('active');

    const selectedDateLabel = document.getElementById('selectedDate');
    if (selectedDateLabel) {
        selectedDateLabel.textContent = new Date(year, month - 1, day).toLocaleDateString(
            'en-US',
            {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            }
        );
    }

    const targetDateObj = new Date(year, month - 1, day);
    const currentDateObj = new Date();
    currentDateObj.setHours(0, 0, 0, 0);

    const eventInput = document.getElementById('eventInput');
    const saveEventBtn = document.getElementById('saveEventBtn');
    const isPastDate = targetDateObj < currentDateObj;

    const existingNote = facilityAnnouncementsMap[dateKey];
    const existingText = existingNote ? existingNote.message : '';

    if (isPastDate) {
        if (eventInput) {
            eventInput.placeholder = existingText
                ? '🔒 Past date. Viewing announcement in read-only mode.'
                : '🔒 No announcements were recorded for this date.';
            eventInput.disabled = true;
            eventInput.value = existingText;
        }
        if (saveEventBtn) saveEventBtn.disabled = true;
        if (complianceBox) complianceBox.classList.add('past-disabled');
    } else {
        if (eventInput) {
            eventInput.placeholder = 'Type here for announcements and reminders';
            eventInput.disabled = false;
            eventInput.value = existingText;
        }
        if (saveEventBtn) saveEventBtn.disabled = false;
        if (complianceBox) complianceBox.classList.remove('past-disabled');
    }
}

function renderCalendar() {
    const monthYear = document.getElementById('monthYear');
    const calendarGrid = document.getElementById('calendarGrid');

    if (!calendarGrid || !monthYear) return;

    calendarGrid.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthYear.textContent = currentDate.toLocaleString('default', {
        month: 'long',
        year: 'numeric'
    });

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.classList.add('calendar-date', 'empty');
        calendarGrid.appendChild(empty);
    }

    const today = new Date();

    for (let day = 1; day <= totalDaysInMonth(year, month); day++) {
        const dateCell = document.createElement('div');
        dateCell.classList.add('calendar-date');
        dateCell.textContent = day;

        const monthString = String(month + 1).padStart(2, '0');
        const dayString = String(day).padStart(2, '0');
        const dateKeyString = `${year}-${monthString}-${dayString}`;

        if (
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear()
        ) {
            dateCell.classList.add('today');
        }

        if (selectedDateKey === dateKeyString) {
            dateCell.classList.add('selected');
        }

        const note = facilityAnnouncementsMap[dateKeyString];
        if (note && note.message && note.message.trim() !== '') {
            dateCell.classList.add('has-event');
        }

        dateCell.addEventListener('click', () => {
            document
                .querySelectorAll('.calendar-date')
                .forEach((d) => d.classList.remove('selected'));
            dateCell.classList.add('selected');

            selectedDateKey = dateKeyString;
            syncAnnouncementBoxForDate(dateKeyString);
        });

        calendarGrid.appendChild(dateCell);
    }

    function totalDaysInMonth() {
        return lastDate;
    }
}

function renderModalContent() {
    const modalYearDisplay = document.getElementById('modalYearDisplay');
    const modalMonthsGrid = document.getElementById('modalMonthsGrid');

    if (!modalYearDisplay || !modalMonthsGrid) return;

    if (modalViewState === 'months') {
        modalYearDisplay.textContent = temporaryModalYear;
        modalMonthsGrid.classList.remove('years-view');
        renderModalMonths();
    } else {
        const startYear = temporaryModalYear - (temporaryModalYear % 12);
        modalYearDisplay.textContent = `${startYear} - ${startYear + 11}`;
        modalMonthsGrid.classList.add('years-view');
        renderModalYears(startYear);
    }
}

function renderModalMonths() {
    const modalMonthsGrid = document.getElementById('modalMonthsGrid');
    if (!modalMonthsGrid) return;

    modalMonthsGrid.innerHTML = '';
    const activeMonth = currentDate.getMonth();
    const activeYear = currentDate.getFullYear();

    shortMonths.forEach((monthName, index) => {
        const monthBtn = document.createElement('button');
        monthBtn.classList.add('modal-month-btn');
        monthBtn.textContent = monthName;

        if (index === activeMonth && temporaryModalYear === activeYear) {
            monthBtn.classList.add('active');
        }

        monthBtn.onclick = () => {
            currentDate.setFullYear(temporaryModalYear);
            currentDate.setMonth(index);
            renderCalendar();

            const calendarModal = document.getElementById('calendarModal');
            if (calendarModal) calendarModal.classList.add('hidden');
        };

        modalMonthsGrid.appendChild(monthBtn);
    });
}

function renderModalYears(startYear) {
    const modalMonthsGrid = document.getElementById('modalMonthsGrid');
    if (!modalMonthsGrid) return;

    modalMonthsGrid.innerHTML = '';
    const activeYear = currentDate.getFullYear();

    for (let i = 0; i < 12; i++) {
        const targetYear = startYear + i;
        const yearBtn = document.createElement('button');
        yearBtn.classList.add('modal-month-btn');
        yearBtn.textContent = targetYear;

        if (targetYear === activeYear) {
            yearBtn.classList.add('active');
        }

        yearBtn.onclick = () => {
            temporaryModalYear = targetYear;
            currentDate.setFullYear(targetYear);
            renderCalendar();

            modalViewState = 'months';
            renderModalContent();
        };

        modalMonthsGrid.appendChild(yearBtn);
    }
}

/* ==========================================================================
   3. DOM INITIALIZATION & EVENT LISTENERS
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    const prevBtn = document.getElementById('prevMonth');
    const nextBtn = document.getElementById('nextMonth');
    const calendarTitleContainer = document.getElementById('calendarTitleContainer');
    const calendarModal = document.getElementById('calendarModal');
    const modalYearDisplay = document.getElementById('modalYearDisplay');
    const modalPrevYear = document.getElementById('modalPrevYear');
    const modalNextYear = document.getElementById('modalNextYear');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const saveEventBtn = document.getElementById('saveEventBtn');
    const logoutBtn = document.getElementById('logout-btn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (confirm('Are you sure you want to log out?')) {
                try {
                    await signOutAdminSession();
                    sessionStorage.clear();
                    localStorage.removeItem('activeDesignation');
                    localStorage.removeItem('activePersonnelName');
                    window.location.href = 'abtc-login.html';
                } catch (err) {
                    console.error('Sign-out failure:', err);
                }
            }
        });
    }

    if (prevBtn) {
        prevBtn.onclick = () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        };
    }

    if (nextBtn) {
        nextBtn.onclick = () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        };
    }

    if (calendarTitleContainer && calendarModal) {
        calendarTitleContainer.onclick = (e) => {
            if (calendarModal.contains(e.target) && e.target !== calendarTitleContainer) return;

            modalViewState = 'months';
            temporaryModalYear = currentDate.getFullYear();
            renderModalContent();
            calendarModal.classList.remove('hidden');
        };
    }

    if (modalYearDisplay) {
        modalYearDisplay.onclick = () => {
            modalViewState = modalViewState === 'months' ? 'years' : 'months';
            renderModalContent();
        };
    }

    if (modalPrevYear) {
        modalPrevYear.onclick = () => {
            if (modalViewState === 'months') {
                temporaryModalYear--;
            } else {
                temporaryModalYear -= 12;
            }
            renderModalContent();
        };
    }

    if (modalNextYear) {
        modalNextYear.onclick = () => {
            if (modalViewState === 'months') {
                temporaryModalYear++;
            } else {
                temporaryModalYear += 12;
            }
            renderModalContent();
        };
    }

    if (closeModalBtn && calendarModal) {
        closeModalBtn.onclick = () => {
            calendarModal.classList.add('hidden');
        };
    }

    window.addEventListener('click', (event) => {
        if (calendarModal && calendarTitleContainer) {
            if (
                !calendarModal.contains(event.target) &&
                !calendarTitleContainer.contains(event.target)
            ) {
                calendarModal.classList.add('hidden');
            }
        }
    });

    if (saveEventBtn) {
        saveEventBtn.addEventListener('click', async () => {
            const eventInput = document.getElementById('eventInput');
            const text = eventInput ? eventInput.value : '';

            if (!selectedDateKey) {
                alert('Please select a date first.');
                return;
            }

            saveEventBtn.disabled = true;
            const prevLabel = saveEventBtn.textContent;
            saveEventBtn.textContent = 'Saving...';

            try {
                await saveFacilityAnnouncement({
                    facilityId: activeFacilityId,
                    facilityAcronym: activeFacilityAcronym,
                    dateKey: selectedDateKey,
                    message: text,
                    createdBy: activeStaffMember || 'Administrator'
                });

                alert('Announcement saved successfully!');
            } catch (error) {
                console.error('Database execution failed:', error);
                alert('Error saving announcement: ' + error.message);
            } finally {
                saveEventBtn.disabled = false;
                saveEventBtn.textContent = prevLabel;
            }
        });
    }

    renderCalendar();
});

resolveAdminFacilitySession((facilityId) => {
    initDashboardSession(facilityId);
});