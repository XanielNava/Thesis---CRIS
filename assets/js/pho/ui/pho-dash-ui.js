/* ==========================================================================
   CRIS PHO MODULE — DASHBOARD UI CONTROLLER (pho-dash-ui.js)
   Handles PHO KPI Cards, Live Exposure & Mortality Trend Chart, Pending
   Human Rabies Mortality Review Queue & Verification Modal, and Calendar.
   ========================================================================== */

import {
    watchPhoAuthProfile,
    fetchIloiloPopulationTotal,
    fetchLegacySurveillanceRows,
    subscribeToLivePhoPatients,
    resolvePhoMortalityReview,
    fetchPhoCalendarMonthEvents,
    fetchPhoCalendarDateDescription,
    savePhoCalendarEvent,
    signOutPhoDashboard
} from '../db/pho-dash-db.js';

let currentDate = new Date();
let selectedDate = '';
let temporaryModalYear = currentDate.getFullYear();

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fullMonths = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
];
const localEvents = new Map();

let trendChartInstance = null;
let cachedLegacyRecords = [];
let cachedLiveRecords = [];
let pendingReviewsList = [];
let currentPhoOfficerName = 'PHO Surveillance Officer';
const availableSurveillanceYears = new Set();

const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));

/* ==========================================================================
   1. AUTH PROFILE UI
   ========================================================================== */

function initAuthWatcher() {
    watchPhoAuthProfile((profile) => {
        const topProfileName = document.getElementById('topProfileName');
        const topProfileRole = document.getElementById('topProfileRole');
        const welcomeGreeting = document.getElementById('welcomeGreeting');
        const topProfileIcon = document.getElementById('topProfileIcon');

        if (!profile) {
            if (topProfileName) topProfileName.textContent = 'Authorized User';
            if (topProfileRole) topProfileRole.textContent = 'PHO Staff';
            if (welcomeGreeting) welcomeGreeting.textContent = 'Hello, Authorized Personnel';
            return;
        }

        currentPhoOfficerName = profile.displayName;
        if (topProfileName) topProfileName.textContent = profile.displayName;
        if (topProfileRole) topProfileRole.textContent = profile.role;
        if (welcomeGreeting) welcomeGreeting.textContent = `Hello, ${profile.displayName}`;

        if (topProfileIcon) {
            const initials = profile.displayName
                .split(' ')
                .map((n) => n[0])
                .filter(Boolean)
                .slice(0, 2)
                .join('')
                .toUpperCase();

            topProfileIcon.textContent = initials || 'P';
            topProfileIcon.style.display = 'flex';
            topProfileIcon.style.alignItems = 'center';
            topProfileIcon.style.justifyContent = 'center';
            topProfileIcon.style.fontWeight = '700';
            topProfileIcon.style.color = '#412110';
            topProfileIcon.style.fontSize = '12px';
        }
    });
}

/* ==========================================================================
   2. PENDING MORTALITY REVIEW BANNER & PHO VERIFICATION MODAL
   ========================================================================== */

function renderMortalityReviewAlert() {
    const banner = document.getElementById('phoMortalityAlertBanner');
    const countSpan = document.getElementById('phoPendingMortalityCount');
    const summarySpan = document.getElementById('phoPendingMortalitySummary');

    if (!banner) return;

    if (pendingReviewsList.length === 0) {
        banner.hidden = true;
        banner.style.display = 'none';
        return;
    }

    banner.hidden = false;
    banner.style.display = 'flex';
    if (countSpan) countSpan.textContent = String(pendingReviewsList.length);
    const first = pendingReviewsList[0];
    if (summarySpan) {
        summarySpan.textContent = `${first.patientName} (${first.facilityAcronym}) — CIF: ${first.cifRefNo}`;
    }
}

function openMortalityReviewModal() {
    const modal = document.getElementById('phoMortalityReviewModal');
    const listContainer = document.getElementById('phoMortalityReviewList');
    if (!modal || !listContainer) return;

    if (pendingReviewsList.length === 0) {
        listContainer.innerHTML = `<p style="color:#64748b; text-align:center; padding:18px;">No pending suspect rabies deaths awaiting review.</p>`;
    } else {
        listContainer.innerHTML = pendingReviewsList
            .map(
                (item) => `
                <div style="border:1px solid #fecaca; background:#fff5f5; border-left:4px solid #dc2626; border-radius:10px; padding:14px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
                        <strong style="color:#991b1b; font-size:14px;">${esc(item.patientName)} (${esc(item.itrNo)})</strong>
                        <span style="background:#fee2e2; color:#991b1b; font-size:11px; font-weight:700; padding:3px 8px; border-radius:999px;">${esc(item.facilityAcronym)}</span>
                    </div>
                    <div style="font-size:12.5px; color:#412110; line-height:1.5;">
                        <div><strong>Age / Sex:</strong> ${esc(item.age)} yrs / ${esc(item.sex)} &bull; <strong>Residence:</strong> Brgy. ${esc(item.barangay)}, ${esc(item.municipality)}</div>
                        <div><strong>Exposure:</strong> ${esc(item.animalType)} (${esc(item.classification)}) &bull; <strong>Date of Death:</strong> ${esc(item.deathDate)}</div>
                        <div><strong>Hospital / RHU:</strong> ${esc(item.reportingHospital)} &bull; <strong>PIDSR CIF / Death Cert No.:</strong> ${esc(item.cifRefNo)}</div>
                        <div style="font-size:11.5px; color:#7e8b9b;">Flagged by: ${esc(item.flaggedByAbtc)}</div>
                    </div>
                    <div style="margin-top:10px;">
                        <input type="text" id="phoNotes_${esc(item.docId)}" placeholder="PHO verification remarks / RITM lab result (optional)" style="width:100%; padding:8px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:12.5px; margin-bottom:8px;">
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button type="button" data-verify-action="Confirmed" data-doc-id="${esc(item.docId)}" style="background:#dc2626; color:#fff; border:none; padding:7px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">
                                <i class="fa-solid fa-check-circle"></i> Confirm Human Rabies Death &amp; Alert PVO
                            </button>
                            <button type="button" data-verify-action="Dismissed" data-doc-id="${esc(item.docId)}" style="background:#475569; color:#fff; border:none; padding:7px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">
                                <i class="fa-solid fa-ban"></i> Mark Non-Rabies Death
                            </button>
                        </div>
                    </div>
                </div>
            `
            )
            .join('');
    }

    modal.style.display = 'flex';
}

function wireMortalityReviewModal() {
    const modal = document.getElementById('phoMortalityReviewModal');
    document
        .getElementById('btnOpenPhoMortalityReview')
        ?.addEventListener('click', openMortalityReviewModal);
    document
        .getElementById('btnClosePhoMortalityModal')
        ?.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });

    document
        .getElementById('phoMortalityReviewList')
        ?.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-verify-action]');
            if (!btn) return;

            const decision = btn.dataset.verifyAction;
            const docId = btn.dataset.docId;
            const record = pendingReviewsList.find((r) => r.docId === docId);
            if (!record) return;

            const notesInput = document.getElementById(`phoNotes_${docId}`);
            const notes = notesInput ? notesInput.value.trim() : '';

            const confirmMsg =
                decision === 'Confirmed'
                    ? `Confirm ${record.patientName} as an official Human Rabies Death?\n\nThis will update provincial mortality statistics and alert PVO for animal trace-back in Brgy. ${record.barangay}, ${record.municipality}.`
                    : `Clear the suspect rabies flag for ${record.patientName} and mark as Non-Rabies Death?`;

            if (!confirm(confirmMsg)) return;

            btn.disabled = true;
            try {
                await resolvePhoMortalityReview({
                    patientDocId: docId,
                    patientRecord: record,
                    decision,
                    phoOfficerName: currentPhoOfficerName,
                    verificationNotes: notes
                });
                alert(
                    decision === 'Confirmed'
                        ? 'Human Rabies Death officially confirmed and PVO outbreak alert dispatched.'
                        : 'Suspect rabies flag cleared.'
                );
                if (modal && pendingReviewsList.length <= 1) {
                    modal.style.display = 'none';
                }
            } catch (err) {
                alert('Verification update failed: ' + err.message);
                btn.disabled = false;
            }
        });
}

/* ==========================================================================
   3. KPI METRICS & TREND CHART
   ========================================================================== */

function rebuildYearsAndRefresh() {
    availableSurveillanceYears.clear();
    const allRecords = [...cachedLegacyRecords, ...cachedLiveRecords];
    allRecords.forEach((r) => {
        if (r.year) availableSurveillanceYears.add(Number(r.year));
    });

    populateFilters();
    updateDashboardWithFilters();
}

function populateFilters() {
    const yearSelect = document.getElementById('dashYearFilter');
    const monthSelect = document.getElementById('dashMonthFilter');
    const currentRealYear = new Date().getFullYear();

    const prevYear = yearSelect ? yearSelect.value : 'All';
    const prevMonth = monthSelect ? monthSelect.value : 'current';

    if (yearSelect) {
        yearSelect.innerHTML = '';

        const optAll = document.createElement('option');
        optAll.value = 'All';
        optAll.textContent = 'All Years';
        yearSelect.appendChild(optAll);

        const optCurrent = document.createElement('option');
        optCurrent.value = 'current_year';
        optCurrent.textContent = `Current Year (${currentRealYear})`;
        yearSelect.appendChild(optCurrent);

        const sortedYears = Array.from(availableSurveillanceYears).sort((a, b) => b - a);
        sortedYears.forEach((yr) => {
            if (yr !== currentRealYear) {
                const opt = document.createElement('option');
                opt.value = String(yr);
                opt.textContent = `${yr}`;
                yearSelect.appendChild(opt);
            }
        });

        if (prevYear) yearSelect.value = prevYear;
        yearSelect.onchange = updateDashboardWithFilters;
    }

    if (monthSelect) {
        if (!monthSelect.dataset.initialized) {
            monthSelect.innerHTML = `
                <option value="All">All Months</option>
                <option value="current">Current Month</option>
                <option value="0">January</option>
                <option value="1">February</option>
                <option value="2">March</option>
                <option value="3">April</option>
                <option value="4">May</option>
                <option value="5">June</option>
                <option value="6">July</option>
                <option value="7">August</option>
                <option value="8">September</option>
                <option value="9">October</option>
                <option value="10">November</option>
                <option value="11">December</option>
            `;
            monthSelect.value = prevMonth || 'current';
            monthSelect.dataset.initialized = 'true';
        }
        monthSelect.onchange = updateDashboardWithFilters;
    }
}

function updateDashboardWithFilters() {
    const yearSelect = document.getElementById('dashYearFilter');
    const monthSelect = document.getElementById('dashMonthFilter');

    const selectedYear = yearSelect ? yearSelect.value : 'All';
    const selectedMonth = monthSelect ? monthSelect.value : 'current';

    const deathsEl = document.getElementById('humanRabiesCases');
    const pepRateEl = document.getElementById('pepCompletionRate');
    const pepRatioBadge = document.getElementById('pepRatioBadge');

    const monthlyPatientsCountEl = document.getElementById('monthlyPatientsCount');
    const monthlyPatientsBadge = document.getElementById('monthlyPatientsBadge');
    const monthlyPatientsTitle = document.getElementById('monthlyPatientsTitle');

    const now = new Date();
    const currentRealYear = now.getFullYear();
    const currentRealMonth = now.getMonth();

    let targetYear = null;
    if (selectedYear === 'current_year') {
        targetYear = currentRealYear;
    } else if (selectedYear !== 'All') {
        targetYear = Number(selectedYear);
    }

    let targetMonth = null;
    if (selectedMonth === 'current') {
        targetMonth = currentRealMonth;
    } else if (selectedMonth !== 'All') {
        targetMonth = Number(selectedMonth);
    }

    let matchedRecords = [...cachedLegacyRecords, ...cachedLiveRecords];
    if (targetYear !== null) {
        matchedRecords = matchedRecords.filter((r) => r.year === targetYear);
    }

    const monthlyBites = new Array(12).fill(0);
    const monthlyVaccinated = new Array(12).fill(0);
    const monthlyMortality = new Array(12).fill(0);

    let totalBites = 0;
    let totalVaccinated = 0;
    let totalDeaths = 0;
    let totalCompletedPEP = 0;
    let focusedPeriodPatients = 0;

    matchedRecords.forEach((r) => {
        if (r.month !== null && r.month >= 0 && r.month < 12) {
            monthlyBites[r.month] += r.biteCases;
            monthlyVaccinated[r.month] += r.vaccinated;
            monthlyMortality[r.month] += r.deaths;
        }

        const monthMatches = targetMonth === null || r.month === targetMonth;

        if (monthMatches) {
            totalBites += r.biteCases;
            totalVaccinated += r.vaccinated;
            totalDeaths += r.deaths;
            totalCompletedPEP += r.completedPEP;
        }

        if (r.month === (targetMonth !== null ? targetMonth : currentRealMonth)) {
            focusedPeriodPatients += r.biteCases;
        }
    });

    const displayMonthIdx = targetMonth !== null ? targetMonth : currentRealMonth;
    const displayYearLabel = targetYear !== null ? targetYear : currentRealYear;

    if (monthlyPatientsCountEl) {
        monthlyPatientsCountEl.textContent = focusedPeriodPatients.toLocaleString();
    }
    if (monthlyPatientsBadge) {
        monthlyPatientsBadge.textContent = `${shortMonths[displayMonthIdx]} ${displayYearLabel}`;
    }
    if (monthlyPatientsTitle) {
        monthlyPatientsTitle.textContent = `${fullMonths[displayMonthIdx]} Patients`;
    }

    if (deathsEl) deathsEl.textContent = totalDeaths.toLocaleString();

    if (pepRateEl) {
        if (totalBites > 0) {
            const completionPct = ((totalCompletedPEP / totalBites) * 100).toFixed(1);
            pepRateEl.textContent = `${completionPct}%`;
            if (pepRatioBadge) {
                pepRatioBadge.textContent = `${totalCompletedPEP.toLocaleString()} of ${totalBites.toLocaleString()} Completed`;
            }
        } else {
            pepRateEl.textContent = '0.0%';
            if (pepRatioBadge) pepRatioBadge.textContent = '0 of 0 Completed';
        }
    }

    if (trendChartInstance) {
        trendChartInstance.data.datasets[0].data = monthlyBites;
        trendChartInstance.data.datasets[1].data = monthlyVaccinated;
        trendChartInstance.data.datasets[2].data = monthlyMortality;

        const maxVal = Math.max(...monthlyBites, ...monthlyVaccinated, ...monthlyMortality);
        trendChartInstance.options.scales.y.max = maxVal > 0 ? undefined : 10;
        trendChartInstance.update();
    }
}

function initChart() {
    const canvas = document.getElementById('incidentTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: shortMonths,
            datasets: [
                {
                    label: 'Animal Bite Cases',
                    data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    borderColor: '#F88F22',
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    tension: 0,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Vaccinated Patients (TCV)',
                    data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    borderColor: '#EA6113',
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    tension: 0,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Mortality',
                    data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    borderColor: '#d32f2f',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#111625',
                    padding: 10,
                    cornerRadius: 8,
                    titleFont: { family: 'Lato', size: 12, weight: 'bold' },
                    bodyFont: { family: 'Lato', size: 11 },
                    displayColors: true,
                    callbacks: {
                        afterBody(tooltipItems) {
                            const bites =
                                tooltipItems.find((t) => t.dataset.label === 'Animal Bite Cases')
                                    ?.raw || 0;
                            const vaccinated =
                                tooltipItems.find(
                                    (t) => t.dataset.label === 'Vaccinated Patients (TCV)'
                                )?.raw || 0;
                            if (bites > 0) {
                                const coverage = ((vaccinated / bites) * 100).toFixed(1);
                                return `\nVaccine Coverage: ${coverage}%`;
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 10,
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: { stepSize: 2, font: { family: 'Lato', size: 11 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Lato', size: 11 } }
                }
            }
        }
    });

    document.getElementById('chartMetricFilter')?.addEventListener('change', (e) => {
        const val = e.target.value;
        trendChartInstance.data.datasets.forEach((dataset, index) => {
            dataset.hidden = val === 'all' ? false : String(index) !== val;
        });
        trendChartInstance.update();
    });
}

/* ==========================================================================
   4. CALENDAR ENGINE
   ========================================================================== */

async function renderCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    const monthYear = document.getElementById('monthYear');
    if (!calendarGrid) return;

    calendarGrid.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (monthYear) {
        monthYear.textContent = currentDate.toLocaleString('default', {
            month: 'long',
            year: 'numeric'
        });
    }

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-date empty';
        calendarGrid.appendChild(empty);
    }

    const startMonthStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endMonthStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`;
    const eventsSet = await fetchPhoCalendarMonthEvents(startMonthStr, endMonthStr);

    const today = new Date();

    for (let day = 1; day <= lastDate; day++) {
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

        if (selectedDate === dateKeyString) dateCell.classList.add('selected');
        if (eventsSet.has(dateKeyString) || localEvents.has(dateKeyString)) {
            dateCell.classList.add('has-event');
        }

        dateCell.addEventListener('click', async () => {
            document
                .querySelectorAll('.calendar-date')
                .forEach((d) => d.classList.remove('selected'));
            dateCell.classList.add('selected');
            selectedDate = dateKeyString;

            const selectedDateEl = document.getElementById('selectedDate');
            if (selectedDateEl) {
                selectedDateEl.textContent = new Date(year, month, day).toLocaleDateString(
                    'en-US',
                    {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                    }
                );
            }

            const targetDateObj = new Date(year, month, day);
            const currentDateObj = new Date();
            currentDateObj.setHours(0, 0, 0, 0);

            const eventInput = document.getElementById('eventInput');
            const saveEventBtn = document.getElementById('saveEventBtn');
            const isPastDate = targetDateObj < currentDateObj;

            if (eventInput && saveEventBtn) {
                if (isPastDate) {
                    eventInput.placeholder =
                        '🔒 Past date. Viewing announcement in read-only mode.';
                    eventInput.disabled = true;
                    saveEventBtn.disabled = true;
                } else {
                    eventInput.placeholder = 'Type here for announcements and reminders';
                    eventInput.disabled = false;
                    saveEventBtn.disabled = false;
                }
                eventInput.value = localEvents.get(selectedDate) || '';
            }

            try {
                const desc = await fetchPhoCalendarDateDescription(selectedDate);
                if (desc && eventInput) {
                    eventInput.value = desc;
                } else if (isPastDate && eventInput) {
                    eventInput.placeholder =
                        '🔒 No announcements were recorded for this date.';
                }
            } catch (err) {
                // Ignore
            }
        });

        calendarGrid.appendChild(dateCell);
    }
}

function setupCalendarControls() {
    const prevBtn = document.getElementById('prevMonth');
    const nextBtn = document.getElementById('nextMonth');
    const calendarTitleContainer = document.getElementById('calendarTitleContainer');
    const calendarModal = document.getElementById('calendarModal');
    const modalPrevYear = document.getElementById('modalPrevYear');
    const modalNextYear = document.getElementById('modalNextYear');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const saveEventBtn = document.getElementById('saveEventBtn');

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
        calendarTitleContainer.onclick = () => {
            temporaryModalYear = currentDate.getFullYear();
            renderModalMonths();
            calendarModal.classList.remove('hidden');
        };
    }

    if (closeModalBtn && calendarModal) {
        closeModalBtn.onclick = () => calendarModal.classList.add('hidden');
    }

    if (modalPrevYear) {
        modalPrevYear.onclick = () => {
            temporaryModalYear--;
            renderModalMonths();
        };
    }

    if (modalNextYear) {
        modalNextYear.onclick = () => {
            temporaryModalYear++;
            renderModalMonths();
        };
    }

    if (saveEventBtn) {
        saveEventBtn.onclick = async () => {
            const eventInput = document.getElementById('eventInput');
            const text = eventInput ? eventInput.value : '';

            if (!selectedDate) {
                alert('Please select a date first.');
                return;
            }

            localEvents.set(selectedDate, text);

            try {
                await savePhoCalendarEvent(selectedDate, text);
                alert('Announcement saved successfully!');
                renderCalendar();
            } catch (error) {
                alert('Saved locally (Cloud connection offline): ' + error.message);
                renderCalendar();
            }
        };
    }
}

function renderModalMonths() {
    const modalYearDisplay = document.getElementById('modalYearDisplay');
    const modalMonthsGrid = document.getElementById('modalMonthsGrid');
    const calendarModal = document.getElementById('calendarModal');

    if (modalYearDisplay) modalYearDisplay.textContent = temporaryModalYear;
    if (!modalMonthsGrid) return;

    modalMonthsGrid.innerHTML = '';

    shortMonths.forEach((m, idx) => {
        const btn = document.createElement('button');
        btn.classList.add('modal-month-btn');
        if (
            currentDate.getFullYear() === temporaryModalYear &&
            currentDate.getMonth() === idx
        ) {
            btn.classList.add('active');
        }
        btn.textContent = m;
        btn.onclick = () => {
            currentDate.setFullYear(temporaryModalYear);
            currentDate.setMonth(idx);
            renderCalendar();
            if (calendarModal) calendarModal.classList.add('hidden');
        };
        modalMonthsGrid.appendChild(btn);
    });
}

/* ==========================================================================
   5. LOGOUT & BOOTSTRAP
   ========================================================================== */

document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (confirm('Are you sure you want to log out?')) {
        try {
            await signOutPhoDashboard();
        } catch (err) {
            console.warn('Logout error:', err);
        }
        localStorage.removeItem('userUid');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userDesignation');
        localStorage.removeItem('userStatus');
        window.location.href = 'pho-login.html';
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    initAuthWatcher();
    setupCalendarControls();
    wireMortalityReviewModal();
    renderMortalityReviewAlert();
    renderCalendar();
    initChart();

    const popElem = document.getElementById('humanPopulation');
    if (popElem) {
        const popTotal = await fetchIloiloPopulationTotal();
        popElem.textContent = popTotal > 0 ? popTotal.toLocaleString() : '0';
    }

    cachedLegacyRecords = await fetchLegacySurveillanceRows();
    rebuildYearsAndRefresh();

    subscribeToLivePhoPatients(({ liveMetricsRows, pendingMortalityReviews }) => {
        cachedLiveRecords = liveMetricsRows;
        pendingReviewsList = pendingMortalityReviews;
        rebuildYearsAndRefresh();
        renderMortalityReviewAlert();
    });
});