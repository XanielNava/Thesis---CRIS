// ==============================================================================
// pho-dash.js - PHO Dashboard Controller (Dynamic Legacy & Date Filtration)
// ==============================================================================

import { auth, db } from '../firebase/firebase-config.js';
import { 
    collection, 
    doc, 
    getDoc,
    getDocs, 
    query, 
    where, 
    setDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

// Global Calendar State
let currentDate = new Date();
let selectedDate = ""; 
let temporaryModalYear = currentDate.getFullYear();
const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const localEvents = new Map();

// Global Chart & Cache State
let trendChartInstance = null;
let cachedLegacyRecords = [];
let availableSurveillanceYears = new Set();

// ================= DYNAMIC AUTH & USER PROFILE LOADER =================
function initAuthWatcher() {
    try {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                await loadUserProfile(user);
            } else {
                setDefaultProfileUI();
            }
        });
    } catch (err) {
        setDefaultProfileUI();
    }
}

function setDefaultProfileUI() {
    const topProfileName = document.getElementById("topProfileName");
    const topProfileRole = document.getElementById("topProfileRole");
    const welcomeGreeting = document.getElementById("welcomeGreeting");
    if (topProfileName) topProfileName.textContent = "Authorized User";
    if (topProfileRole) topProfileRole.textContent = "Staff";
    if (welcomeGreeting) welcomeGreeting.textContent = "Hello, Authorized Personnel";
}

async function loadUserProfile(user) {
    const topProfileName = document.getElementById("topProfileName");
    const topProfileRole = document.getElementById("topProfileRole");
    const welcomeGreeting = document.getElementById("welcomeGreeting");
    const topProfileIcon = document.getElementById("topProfileIcon");

    try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        let displayName = user.displayName || "";
        let role = "Administrator";

        if (userDocSnap && userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const fullNameParts = [
                userData.firstName,
                userData.middleName ? `${userData.middleName[0]}.` : "",
                userData.lastName,
                userData.suffix
            ].filter(Boolean);

            if (fullNameParts.length > 0) {
                displayName = fullNameParts.join(" ");
            }
            role = userData.position || userData.designation || userData.role || role;
        }

        if (!displayName) {
            displayName = user.email ? user.email.split('@')[0] : "Authorized Personnel";
        }

        if (topProfileName) topProfileName.textContent = displayName;
        if (topProfileRole) topProfileRole.textContent = role;
        if (welcomeGreeting) welcomeGreeting.textContent = `Hello, ${displayName}`;

        if (topProfileIcon) {
            const initials = displayName
                .split(" ")
                .map(n => n[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase();
            
            topProfileIcon.textContent = initials || "U";
            topProfileIcon.style.display = "flex";
            topProfileIcon.style.alignItems = "center";
            topProfileIcon.style.justifyContent = "center";
            topProfileIcon.style.fontWeight = "700";
            topProfileIcon.style.color = "#412110";
            topProfileIcon.style.fontSize = "12px";
        }
    } catch (err) {
        setDefaultProfileUI();
    }
}

// ================= CORE CALENDAR ENGINE =================
async function renderCalendar() {
    const calendarGrid = document.getElementById("calendarGrid");
    const monthYear = document.getElementById("monthYear");
    if (!calendarGrid) return;
    
    calendarGrid.innerHTML = "";

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (monthYear) {
        monthYear.textContent = currentDate.toLocaleString("default", {
            month: "long",
            year: "numeric"
        });
    }

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement("div");
        empty.className = "calendar-date empty";
        calendarGrid.appendChild(empty);
    }

    const startMonthStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endMonthStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`;
    
    const eventsSet = new Set();

    try {
        const monthEventsQuery = query(
            collection(db, "calendar-events"),
            where("date", ">=", startMonthStr),
            where("date", "<=", endMonthStr)
        );
        const monthSnap = await getDocs(monthEventsQuery);
        if (monthSnap) {
            monthSnap.forEach(docSnap => {
                const d = docSnap.data();
                if (d.description && d.description.trim() !== "") {
                    eventsSet.add(d.date);
                }
            });
        }
    } catch (err) {
        // Fallback
    }

    const today = new Date();

    for (let day = 1; day <= lastDate; day++) {
        const dateCell = document.createElement("div");
        dateCell.classList.add("calendar-date");
        dateCell.textContent = day;

        const monthString = String(month + 1).padStart(2, '0');
        const dayString = String(day).padStart(2, '0');
        const dateKeyString = `${year}-${monthString}-${dayString}`;

        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            dateCell.classList.add("today");
        }

        if (selectedDate === dateKeyString) dateCell.classList.add("selected");
        if (eventsSet.has(dateKeyString) || localEvents.has(dateKeyString)) {
            dateCell.classList.add("has-event");
        }

        dateCell.addEventListener("click", async function() {
            document.querySelectorAll(".calendar-date").forEach(d => d.classList.remove("selected"));
            dateCell.classList.add("selected");
            selectedDate = dateKeyString;

            const selectedDateEl = document.getElementById("selectedDate");
            if (selectedDateEl) {
                selectedDateEl.textContent = new Date(year, month, day).toLocaleDateString("en-US", {
                    weekday: "long", month: "long", day: "numeric", year: "numeric"
                });
            }

            const targetDateObj = new Date(year, month, day);
            const currentDateObj = new Date();
            currentDateObj.setHours(0, 0, 0, 0);

            const eventInput = document.getElementById("eventInput");
            const saveEventBtn = document.getElementById("saveEventBtn");
            const isPastDate = targetDateObj < currentDateObj;

            if (eventInput && saveEventBtn) {
                if (isPastDate) {
                    eventInput.placeholder = "🔒 Past date. Viewing announcement in read-only mode.";
                    eventInput.disabled = true;
                    saveEventBtn.disabled = true;
                } else {
                    eventInput.placeholder = "Type here for announcements and reminders";
                    eventInput.disabled = false;
                    saveEventBtn.disabled = false;
                }
                eventInput.value = localEvents.get(selectedDate) || ""; 
            }

            try {
                const q = query(collection(db, "calendar-events"), where("date", "==", selectedDate));
                const querySnapshot = await getDocs(q);
                
                let hasData = false;
                if (querySnapshot) {
                    querySnapshot.forEach((docSnap) => {
                        if (eventInput) eventInput.value = docSnap.data().description || "";
                        hasData = true;
                    });
                }

                if (isPastDate && !hasData && eventInput) {
                    eventInput.placeholder = "🔒 No announcements were recorded for this date.";
                }
            } catch (error) {
                // Ignore
            }
        });

        calendarGrid.appendChild(dateCell);
    }
}

function setupCalendarControls() {
    const prevBtn = document.getElementById("prevMonth");
    const nextBtn = document.getElementById("nextMonth");
    const calendarTitleContainer = document.getElementById("calendarTitleContainer");
    const calendarModal = document.getElementById("calendarModal");
    const modalPrevYear = document.getElementById("modalPrevYear");
    const modalNextYear = document.getElementById("modalNextYear");
    const closeModalBtn = document.getElementById("closeModalBtn");
    const saveEventBtn = document.getElementById("saveEventBtn");

    if (prevBtn) {
        prevBtn.onclick = function() {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        };
    }

    if (nextBtn) {
        nextBtn.onclick = function() {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        };
    }

    if (calendarTitleContainer && calendarModal) {
        calendarTitleContainer.onclick = function() {
            temporaryModalYear = currentDate.getFullYear();
            renderModalMonths();
            calendarModal.classList.remove("hidden");
        };
    }

    if (closeModalBtn && calendarModal) {
        closeModalBtn.onclick = function() {
            calendarModal.classList.add("hidden");
        };
    }

    if (modalPrevYear) {
        modalPrevYear.onclick = function() {
            temporaryModalYear--;
            renderModalMonths();
        };
    }

    if (modalNextYear) {
        modalNextYear.onclick = function() {
            temporaryModalYear++;
            renderModalMonths();
        };
    }

    if (saveEventBtn) {
        saveEventBtn.onclick = async function() {
            const eventInput = document.getElementById("eventInput");
            const text = eventInput ? eventInput.value : "";

            if (selectedDate === "") {
                alert("Please select a date first.");
                return;
            }

            localEvents.set(selectedDate, text);

            try {
                const docRef = doc(db, "calendar-events", selectedDate);
                await setDoc(docRef, {
                    category: "Announcement",
                    created: new Date(),
                    date: selectedDate,
                    description: text,
                    title: text.split('\n')[0] || "New Announcement"
                }, { merge: true });
                alert("Announcement saved successfully!");
                renderCalendar();
            } catch (error) {
                alert("Saved locally (Cloud connection offline): " + error.message);
                renderCalendar();
            }
        };
    }
}

function renderModalMonths() {
    const modalYearDisplay = document.getElementById("modalYearDisplay");
    const modalMonthsGrid = document.getElementById("modalMonthsGrid");
    const calendarModal = document.getElementById("calendarModal");

    if (modalYearDisplay) modalYearDisplay.textContent = temporaryModalYear;
    if (!modalMonthsGrid) return;

    modalMonthsGrid.innerHTML = "";

    shortMonths.forEach((m, idx) => {
        const btn = document.createElement("button");
        btn.classList.add("modal-month-btn");
        if (currentDate.getFullYear() === temporaryModalYear && currentDate.getMonth() === idx) {
            btn.classList.add("active");
        }
        btn.textContent = m;
        btn.onclick = function() {
            currentDate.setFullYear(temporaryModalYear);
            currentDate.setMonth(idx);
            renderCalendar();
            if (calendarModal) calendarModal.classList.add("hidden");
        };
        modalMonthsGrid.appendChild(btn);
    });
}

// ================= STATS & FIRESTORE DATA LOADERS =================
async function loadHumanPopulation() {
    const popElem = document.getElementById('humanPopulation');
    if (!popElem) return;

    try {
        const querySnapshot = await getDocs(collection(db, "pho-database", "main", "population-data"));
        let municipalTotal = 0;
        let iloiloSummaryTotal = 0;

        if (querySnapshot && !querySnapshot.empty) {
            querySnapshot.forEach((docSnap) => {
                const docIdUpper = docSnap.id.trim().toUpperCase();
                const data = docSnap.data();
                const rawVal = data.totalPopulation ?? data.population ?? data.count ?? data.iloiloPopulation ?? data.value ?? 0;
                const cleanVal = typeof rawVal === 'string' ? Number(rawVal.replace(/,/g, '')) : Number(rawVal || 0);

                if (docIdUpper === "ILOILO" || docIdUpper === "ILOILO_TOTAL") {
                    iloiloSummaryTotal = cleanVal;
                } else {
                    municipalTotal += cleanVal;
                }
            });
        }

        const finalPopulation = iloiloSummaryTotal > 0 ? iloiloSummaryTotal : municipalTotal;
        popElem.textContent = finalPopulation > 0 ? finalPopulation.toLocaleString() : "0";
    } catch (error) {
        popElem.textContent = "0";
    }
}

// ================= DATE & LEGACY PARSING HELPER =================
function extractDateDetails(data) {
    let year = null;
    let month = null; // 0 to 11

    // 1. Direct Year/Month numbers
    if (data.year && !isNaN(Number(data.year))) {
        year = Number(data.year);
    }
    if (data.month !== undefined && data.month !== null && !isNaN(Number(data.month))) {
        const m = Number(data.month);
        month = m >= 1 && m <= 12 ? m - 1 : (m >= 0 && m <= 11 ? m : null);
    }

    // 2. Timestamp or Date string inspection
    const rawDate = data.date || data.createdAt || data.reportDate || data.timestamp;
    if (rawDate) {
        if (typeof rawDate.toDate === 'function') {
            const dt = rawDate.toDate();
            if (!year) year = dt.getFullYear();
            if (month === null) month = dt.getMonth();
        } else {
            const dt = new Date(rawDate);
            if (!isNaN(dt.getTime())) {
                if (!year) year = dt.getFullYear();
                if (month === null) month = dt.getMonth();
            }
        }
    }

    // 3. Fallback to rawData inspect
    if ((!year || month === null) && data.rawData && Array.isArray(data.rawData)) {
        for (let i = 0; i < data.rawData.length; i++) {
            const item = String(data.rawData[i]).trim();
            
            // Year match (e.g., 2020-2035)
            if (!year && /^(20\d\d)$/.test(item)) {
                year = Number(item);
            }
            // Month match by string name
            if (month === null) {
                const mIdx = shortMonths.findIndex(sm => sm.toLowerCase() === item.substring(0, 3).toLowerCase());
                if (mIdx !== -1) {
                    month = mIdx;
                }
            }
        }
    }

    return { year, month };
}

// ================= SURVEILLANCE & METRICS REFRESH =================
async function fetchAllSurveillanceRecords() {
    try {
        let snap = null;
        try {
            snap = await getDocs(collection(db, "pho-database", "main", "legacy-summary"));
            if (!snap || snap.empty) {
                snap = await getDocs(collection(db, "pho_rabies_cases"));
            }
        } catch (dbErr) {
            // Offline / Error Handled
        }

        cachedLegacyRecords = [];
        availableSurveillanceYears.clear();

        if (snap && !snap.empty) {
            snap.forEach(docSnap => {
                const data = docSnap.data();
                
                // Skip empty spreadsheet artifact headers
                const rawName = (data.rawData && data.rawData[0]) || data.abtc || data.facilityName || "";
                if (typeof rawName === 'string' && (rawName.toLowerCase().includes("facility") || rawName.toLowerCase().includes("abtc / health"))) {
                    return;
                }

                const { year, month } = extractDateDetails(data);
                if (year) availableSurveillanceYears.add(year);

                if (data.rawData && Array.isArray(data.rawData)) {
                    const row = data.rawData;
                    const is24Col = row.length >= 17;
                    
                    const biteCases = is24Col ? (Number(row[16]) || (Number(row[1]) + Number(row[2])) || 0) : (Number(row[1]) || 0);
                    const vaccinated = is24Col ? (Number(row[13]) || 0) : (Number(row[4]) || 0);
                    const deaths = is24Col ? (Number(row[12]) || 0) : (Number(row[2]) || 0);
                    const compII = is24Col ? (Number(row[17]) || 0) : 0;
                    const compIII = is24Col ? (Number(row[18]) || 0) : 0;

                    cachedLegacyRecords.push({
                        year,
                        month,
                        biteCases,
                        vaccinated,
                        deaths,
                        completedPEP: compII + compIII
                    });
                } else {
                    cachedLegacyRecords.push({
                        year,
                        month,
                        biteCases: Number(data.total || data.totalCases || data.biteCases || 0),
                        vaccinated: Number(data.tcv || data.petTcv || data.vaccinated || 0),
                        deaths: Number(data.hr || data.humanDeaths || 0),
                        completedPEP: Number(data.remarksCompII || 0) + Number(data.remarksCompIII || 0)
                    });
                }
            });
        }

        populateFilters();
        updateDashboardWithFilters();

    } catch (err) {
        console.error("❌ Error initializing dataset:", err);
    }
}

function populateFilters() {
    const yearSelect = document.getElementById("dashYearFilter");
    const monthSelect = document.getElementById("dashMonthFilter");
    const currentRealYear = new Date().getFullYear();

    if (yearSelect) {
        yearSelect.innerHTML = "";

        // Standard Default Options
        const optAll = document.createElement("option");
        optAll.value = "All";
        optAll.textContent = "All Years";
        yearSelect.appendChild(optAll);

        const optCurrent = document.createElement("option");
        optCurrent.value = "current_year";
        optCurrent.textContent = `Current Year (${currentRealYear})`;
        yearSelect.appendChild(optCurrent);

        // Populate dynamically scanned years from uploaded legacy records
        const sortedYears = Array.from(availableSurveillanceYears).sort((a, b) => b - a);
        sortedYears.forEach(yr => {
            if (yr !== currentRealYear) {
                const opt = document.createElement("option");
                opt.value = yr;
                opt.textContent = `${yr}`;
                yearSelect.appendChild(opt);
            }
        });

        yearSelect.onchange = updateDashboardWithFilters;
    }

    if (monthSelect) {
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
        monthSelect.onchange = updateDashboardWithFilters;
    }
}

function updateDashboardWithFilters() {
    const yearSelect = document.getElementById("dashYearFilter");
    const monthSelect = document.getElementById("dashMonthFilter");

    const selectedYear = yearSelect ? yearSelect.value : "All";
    const selectedMonth = monthSelect ? monthSelect.value : "current";

    updateDashboardData(selectedYear, selectedMonth);
}

async function updateDashboardData(selectedYear, selectedMonth) {
    const deathsEl = document.getElementById("humanRabiesCases");
    const pepRateEl = document.getElementById("pepCompletionRate");
    const pepRatioBadge = document.getElementById("pepRatioBadge");

    const monthlyPatientsCountEl = document.getElementById("monthlyPatientsCount");
    const monthlyPatientsBadge = document.getElementById("monthlyPatientsBadge");
    const monthlyPatientsTitle = document.getElementById("monthlyPatientsTitle");

    const now = new Date();
    const currentRealYear = now.getFullYear();
    const currentRealMonth = now.getMonth();

    // Resolve target year filter
    let targetYear = null;
    if (selectedYear === "current_year") {
        targetYear = currentRealYear;
    } else if (selectedYear !== "All") {
        targetYear = Number(selectedYear);
    }

    // Resolve target month filter
    let targetMonth = null;
    if (selectedMonth === "current") {
        targetMonth = currentRealMonth;
    } else if (selectedMonth !== "All") {
        targetMonth = Number(selectedMonth);
    }

    // Filter Cached Records
    let matchedRecords = cachedLegacyRecords;

    if (targetYear !== null) {
        matchedRecords = matchedRecords.filter(r => r.year === targetYear);
    }

    // Prepare Trend Chart Monthly Buckets
    const monthlyBites = new Array(12).fill(0);
    const monthlyVaccinated = new Array(12).fill(0);
    const monthlyMortality = new Array(12).fill(0);

    let totalBites = 0;
    let totalVaccinated = 0;
    let totalDeaths = 0;
    let totalCompletedPEP = 0;
    let focusedPeriodPatients = 0;

    matchedRecords.forEach(r => {
        // Distribute to monthly array if month is known
        if (r.month !== null && r.month >= 0 && r.month < 12) {
            monthlyBites[r.month] += r.biteCases;
            monthlyVaccinated[r.month] += r.vaccinated;
            monthlyMortality[r.month] += r.deaths;
        }

        // Check if record matches selected month filter for KPI calculations
        const monthMatches = targetMonth === null || r.month === targetMonth;

        if (monthMatches) {
            totalBites += r.biteCases;
            totalVaccinated += r.vaccinated;
            totalDeaths += r.deaths;
            totalCompletedPEP += r.completedPEP;
        }

        // Track Patient Consultations for the active month card
        if (r.month === (targetMonth !== null ? targetMonth : currentRealMonth)) {
            focusedPeriodPatients += r.biteCases;
        }
    });

    // 1. Update Monthly Patients KPI Card
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

    // 2. Update Deaths & PEP KPIs
    if (deathsEl) deathsEl.textContent = totalDeaths.toLocaleString();

    if (pepRateEl) {
        if (totalBites > 0) {
            const completionPct = ((totalCompletedPEP / totalBites) * 100).toFixed(1);
            pepRateEl.textContent = `${completionPct}%`;
            if (pepRatioBadge) pepRatioBadge.textContent = `${totalCompletedPEP.toLocaleString()} of ${totalBites.toLocaleString()} Completed`;
        } else {
            pepRateEl.textContent = "0.0%";
            if (pepRatioBadge) pepRatioBadge.textContent = "0 of 0 Completed";
        }
    }

    // 3. Update Trend Chart
    if (trendChartInstance) {
        trendChartInstance.data.datasets[0].data = monthlyBites;
        trendChartInstance.data.datasets[1].data = monthlyVaccinated;
        trendChartInstance.data.datasets[2].data = monthlyMortality;

        const maxVal = Math.max(...monthlyBites, ...monthlyVaccinated, ...monthlyMortality);
        trendChartInstance.options.scales.y.max = maxVal > 0 ? undefined : 10;
        trendChartInstance.update();
    }
}

// ================= CHART INITIALIZATION =================
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
            interaction: {
                mode: 'index',
                intersect: false
            },
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
                        afterBody: function(tooltipItems) {
                            const bites = tooltipItems.find(t => t.dataset.label === 'Animal Bite Cases')?.raw || 0;
                            const vaccinated = tooltipItems.find(t => t.dataset.label === 'Vaccinated Patients (TCV)')?.raw || 0;
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
                    ticks: { 
                        stepSize: 2,
                        font: { family: 'Lato', size: 11 } 
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Lato', size: 11 } }
                }
            }
        }
    });

    const metricFilter = document.getElementById("chartMetricFilter");
    if (metricFilter) {
        metricFilter.addEventListener("change", (e) => {
            const val = e.target.value;
            trendChartInstance.data.datasets.forEach((dataset, index) => {
                if (val === "all") {
                    dataset.hidden = false;
                } else {
                    dataset.hidden = String(index) !== val;
                }
            });
            trendChartInstance.update();
        });
    }
}

// ================= LIFECYCLE ATTACHMENT =================
document.addEventListener("DOMContentLoaded", function() {
    initAuthWatcher();
    setupCalendarControls();
    renderCalendar();
    initChart();

    loadHumanPopulation();
    fetchAllSurveillanceRecords();
});