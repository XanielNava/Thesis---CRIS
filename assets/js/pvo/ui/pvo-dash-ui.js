/* ==========================================================================
   CRIS PVO MODULE — DASHBOARD UI CONTROLLER (pvo-dash-ui.js)
   Handles PVO KPI Cards (including Human Population), PHO Outbreak Alert
   Banner, Surveillance Chart, Incident Logs, Epidemiological Summary, & Calendar.
   ========================================================================== */

import { auth } from '../../firebase/firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

import {
    fetchCurrentOfficerProfile,
    fetchPvoHumanPopulationTotal,
    fetchPvoSurveillanceMetrics,
    subscribeToLivePvoPatients,
    subscribeToPvoOutbreakAlerts,
    acknowledgePvoOutbreakAlert,
    fetchRecentSurveillanceLogs,
    fetchCalendarEventsForMonth,
    getCalendarEvent,
    saveCalendarEvent,
    signOutPvoSession
} from '../db/pvo-dash-db.js';

let surveillanceChart = null;
let legacyCaseRecords = [];
let liveCaseRecords = [];
let cachedCaseRecords = [];
let legacyLogsCache = [];
let liveLogsCache = [];
let activeOutbreakAlerts = [];
let currentPvoOfficerName = 'PVO Surveillance Officer';
const availableSurveillanceYears = new Set();

let currentDate = new Date();
let selectedDateStr = '';
const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));

document.addEventListener('DOMContentLoaded', () => {
    initAuthWatcher();
    initSurveillanceChart();
    initCalendarSystem();
    wireOutbreakAlertBanner();
    wireLogoutButton();
    loadHumanPopulationCard();
    loadDashboardMetrics();
    loadSurveillanceLogsTable();
});

function initAuthWatcher() {
    onAuthStateChanged(auth, async (user) => {
        const topProfileName = document.getElementById('topProfileName');
        const welcomeGreeting = document.getElementById('welcomeGreeting');

        if (!user) {
            if (topProfileName) topProfileName.textContent = 'Authorized Officer';
            if (welcomeGreeting) welcomeGreeting.textContent = 'Hello, Authorized Personnel';
            return;
        }

        const data = await fetchCurrentOfficerProfile(user.uid);
        let displayName = user.displayName || '';
        if (data) {
            const parts = [
                data.firstName,
                data.middleName ? `${data.middleName[0]}.` : '',
                data.lastName,
                data.suffix
            ].filter(Boolean);
            if (parts.length > 0) displayName = parts.join(' ');
        }
        if (!displayName) displayName = user.email ? user.email.split('@')[0] : 'Officer';

        currentPvoOfficerName = displayName;
        if (topProfileName) topProfileName.textContent = displayName;
        if (welcomeGreeting) welcomeGreeting.textContent = `Hello, ${displayName}`;
    });
}

async function loadHumanPopulationCard() {
    const popElem = document.getElementById('humanPopulation');
    if (!popElem) return;

    const totalPop = await fetchPvoHumanPopulationTotal();
    popElem.textContent = totalPop > 0 ? totalPop.toLocaleString() : '0';
}

async function loadDashboardMetrics() {
    try {
        legacyCaseRecords = await fetchPvoSurveillanceMetrics();
        rebuildMergedMetrics();

        subscribeToLivePvoPatients(({ liveMetrics, liveIncidents }) => {
            liveCaseRecords = liveMetrics;
            liveLogsCache = liveIncidents;
            rebuildMergedMetrics();
            renderCombinedSurveillanceLogs();
        });

        subscribeToPvoOutbreakAlerts((alerts) => {
            activeOutbreakAlerts = alerts;
            renderOutbreakAlertBanner();
        });
    } catch (err) {
        console.error('Dashboard metric load error:', err);
    }
}

function rebuildMergedMetrics() {
    cachedCaseRecords = [...legacyCaseRecords, ...liveCaseRecords];
    availableSurveillanceYears.clear();

    cachedCaseRecords.forEach((r) => {
        if (r.year) availableSurveillanceYears.add(Number(r.year));
    });

    populateFilters();
    updateStatistics();
    updateChartData();
}

function populateFilters() {
    const yearFilter = document.getElementById('yearFilter');
    if (!yearFilter) return;

    const prevVal = yearFilter.value;
    yearFilter.innerHTML = '<option value="all">All Years</option>';
    const sortedYears = Array.from(availableSurveillanceYears).sort((a, b) => b - a);
    sortedYears.forEach((yr) => {
        const opt = document.createElement('option');
        opt.value = String(yr);
        opt.textContent = String(yr);
        yearFilter.appendChild(opt);
    });

    if (prevVal && (prevVal === 'all' || sortedYears.map(String).includes(prevVal))) {
        yearFilter.value = prevVal;
    } else {
        yearFilter.value = 'all';
    }

    yearFilter.onchange = () => {
        updateStatistics();
        updateChartData();
    };
    const monthFilter = document.getElementById('monthFilter');
    if (monthFilter) {
        monthFilter.onchange = () => {
            updateStatistics();
            updateChartData();
        };
    }
}

function updateStatistics() {
    const yearFilter = document.getElementById('yearFilter');
    const monthFilter = document.getElementById('monthFilter');
    const selectedYear = yearFilter ? yearFilter.value : 'all';
    const selectedMonth = monthFilter ? monthFilter.value : 'all';

    let filtered = cachedCaseRecords;
    if (selectedYear !== 'all') {
        filtered = filtered.filter((item) => String(item.year) === String(selectedYear));
    }
    if (selectedMonth !== 'all') {
        filtered = filtered.filter((item) => item.month === parseInt(selectedMonth, 10));
    }

    let totalBites = 0;
    let totalVaccinated = 0;
    let totalConfirmed = 0;
    let totalObserved = 0;

    filtered.forEach((record) => {
        totalBites += record.bites;
        totalVaccinated += record.vaccinations;
        totalConfirmed += record.confirmed;
        totalObserved += record.observed || 0;
    });

    const totalBiteElem = document.getElementById('totalBiteCases');
    const confirmedElem = document.getElementById('confirmedRabiesCases');
    const coverageElem = document.getElementById('vaccinationCoverage');
    const observedElem = document.getElementById('animalsObserved');

    if (totalBiteElem) totalBiteElem.textContent = totalBites.toLocaleString();
    if (confirmedElem) confirmedElem.textContent = totalConfirmed.toLocaleString();
    if (coverageElem) {
        const coverageRate = totalBites > 0 ? ((totalVaccinated / totalBites) * 100).toFixed(0) : 0;
        coverageElem.textContent = `${coverageRate}%`;
    }
    if (observedElem) {
        observedElem.textContent = totalObserved.toLocaleString();
    }
}

/* ==========================================================================
   PHO-CONFIRMED HUMAN RABIES OUTBREAK ALERT BANNER
   ========================================================================== */

function renderOutbreakAlertBanner() {
    const banner = document.getElementById('pvoOutbreakAlertBanner');
    const countEl = document.getElementById('pvoOutbreakAlertCount');
    const detailsEl = document.getElementById('pvoOutbreakAlertDetails');
    const ackBtn = document.getElementById('btnAcknowledgePvoAlert');

    if (!banner) return;

    if (activeOutbreakAlerts.length === 0) {
        banner.style.display = 'none';
        return;
    }

    banner.style.display = 'flex';
    if (countEl) countEl.textContent = String(activeOutbreakAlerts.length);
    const latest = activeOutbreakAlerts[0];
    if (detailsEl) {
        detailsEl.textContent = `PHO-Confirmed Rabies Fatality in Brgy. ${latest.barangay || 'N/A'}, ${latest.municipality || 'Iloilo'} (${latest.animalType || 'Animal'} exposure • CIF: ${latest.cifRefNo || 'N/A'}) — Initiate trace-back & ring vaccination.`;
    }
    if (ackBtn) {
        ackBtn.dataset.alertId = latest.id;
    }
}

function wireOutbreakAlertBanner() {
    document
        .getElementById('btnAcknowledgePvoAlert')
        ?.addEventListener('click', async (e) => {
            const alertId = e.currentTarget.dataset.alertId;
            if (!alertId) return;
            if (
                !confirm(
                    'Acknowledge this PHO Rabies Outbreak Alert and log dispatch of PVO field trace-back team?'
                )
            ) {
                return;
            }
            try {
                await acknowledgePvoOutbreakAlert(alertId, currentPvoOfficerName);
                alert('Alert acknowledged. Field response logged.');
            } catch (err) {
                alert('Failed to acknowledge alert: ' + err.message);
            }
        });
}

/* ==========================================================================
   CHART & SURVEILLANCE LOGS
   ========================================================================== */

function initSurveillanceChart() {
    const ctx = document.getElementById('pvoSurveillanceChart')?.getContext('2d');
    if (!ctx || typeof Chart === 'undefined') return;

    surveillanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: shortMonths,
            datasets: [
                {
                    label: 'Animal Bite Cases',
                    data: new Array(12).fill(0),
                    borderColor: '#e65100',
                    backgroundColor: 'rgba(230, 81, 0, 0.08)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4,
                    pointBackgroundColor: '#e65100'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, grid: { color: '#f0f0f0' } }
            }
        }
    });

    document.getElementById('chartMetricSelect')?.addEventListener('change', updateChartData);
}

function updateChartData() {
    if (!surveillanceChart) return;
    const yearFilter = document.getElementById('yearFilter');
    const metricSelect = document.getElementById('chartMetricSelect');
    const selectedYear = yearFilter ? yearFilter.value : 'all';
    const selectedMetric = metricSelect ? metricSelect.value : 'bites';

    let filtered = cachedCaseRecords;
    if (selectedYear !== 'all') {
        filtered = filtered.filter((item) => String(item.year) === String(selectedYear));
    }

    const monthlyAggregation = new Array(12).fill(0);
    filtered.forEach((record) => {
        if (record.month !== null && record.month >= 0 && record.month < 12) {
            if (selectedMetric === 'vaccinations') {
                monthlyAggregation[record.month] += record.vaccinations;
            } else if (selectedMetric === 'confirmed') {
                monthlyAggregation[record.month] += record.confirmed;
            } else {
                monthlyAggregation[record.month] += record.bites;
            }
        }
    });

    surveillanceChart.data.datasets[0].data = monthlyAggregation;
    surveillanceChart.update();
}

async function loadSurveillanceLogsTable() {
    try {
        legacyLogsCache = await fetchRecentSurveillanceLogs(10);
        renderCombinedSurveillanceLogs();
    } catch (err) {
        console.error('Log error:', err);
    }
}

function renderCombinedSurveillanceLogs() {
    const tableBody = document.querySelector('.surveillance-table tbody, #incidentLogTableBody');
    if (!tableBody) return;

    const combined = [...liveLogsCache, ...legacyLogsCache].slice(0, 10);
    if (!combined.length) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; color: #7E8B9B;">No recent bite surveillance incidents reported.</td></tr>`;
        return;
    }

    tableBody.innerHTML = combined
        .map(
            (data) => `
            <tr>
                <td>${esc(data.incidentDate || '—')}</td>
                <td>${esc(data.municipality || '—')}</td>
                <td>${esc(data.animalSpecies || 'Unknown')}</td>
                <td><span class="badge badge-cat2">${esc(data.exposureCategory || 'Category II')}</span></td>
                <td><span class="badge badge-cleared">${esc(data.status || 'Under Observation')}</span></td>
            </tr>
        `
        )
        .join('');
}

/* ==========================================================================
   CALENDAR & LOGOUT
   ========================================================================== */

function initCalendarSystem() {
    renderCalendar();
    document.getElementById('prevMonth')?.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('nextMonth')?.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });
    document.getElementById('saveEventBtn')?.addEventListener('click', async () => {
        const text = document.getElementById('eventInput')?.value.trim() || '';
        if (!selectedDateStr) return;
        await saveCalendarEvent(selectedDateStr, text);
        alert('Announcement saved successfully!');
        renderCalendar();
    });
}

async function renderCalendar() {
    const monthYear = document.getElementById('monthYear');
    const calendarGrid = document.getElementById('calendarGrid');
    if (!monthYear || !calendarGrid) return;

    calendarGrid.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthYear.textContent = currentDate.toLocaleString('default', {
        month: 'long',
        year: 'numeric'
    });
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`;
    const activeEvents = await fetchCalendarEventsForMonth(startStr, endStr);

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.classList.add('calendar-date', 'empty');
        calendarGrid.appendChild(empty);
    }

    for (let day = 1; day <= lastDate; day++) {
        const dateCell = document.createElement('div');
        dateCell.classList.add('calendar-date');
        dateCell.textContent = day;
        const formattedStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (activeEvents.has(formattedStr)) dateCell.classList.add('has-event');

        dateCell.addEventListener('click', async () => {
            document
                .querySelectorAll('.calendar-date')
                .forEach((d) => d.classList.remove('selected'));
            dateCell.classList.add('selected');
            selectedDateStr = formattedStr;

            const selectedLabel = document.getElementById('selectedDate');
            if (selectedLabel) {
                selectedLabel.textContent = new Date(year, month, day).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                });
            }

            const input = document.getElementById('eventInput');
            if (input) input.value = await getCalendarEvent(formattedStr);
        });
        calendarGrid.appendChild(dateCell);
    }
}

function wireLogoutButton() {
    document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (confirm('Are you sure you want to log out?')) {
            try {
                await signOutPvoSession();
            } catch (err) {
                console.warn('Logout warning:', err);
            }
            ['userUid', 'userEmail', 'userRole', 'userDesignation', 'userStatus'].forEach((k) =>
                localStorage.removeItem(k)
            );
            window.location.href = 'pvo-login.html';
        }
    });
}