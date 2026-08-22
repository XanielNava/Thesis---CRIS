// ==============================================================================
// pho-dash.js - PHO Dashboard, Calendar, Metrics & Dynamic Trend Chart
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
    onAuthStateChanged,
    signOut 
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

// ================= DYNAMIC AUTH & USER PROFILE LOADER =================
function initAuthWatcher() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await loadUserProfile(user);
        } else {
            const topProfileName = document.getElementById("topProfileName");
            const topProfileRole = document.getElementById("topProfileRole");
            const welcomeGreeting = document.getElementById("welcomeGreeting");
            if (topProfileName) topProfileName.textContent = "Authorized User";
            if (topProfileRole) topProfileRole.textContent = "Staff";
            if (welcomeGreeting) welcomeGreeting.textContent = "Hello, Authorized Personnel";
        }
    });
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

        if (userDocSnap.exists()) {
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
        console.warn("Could not load dynamic user profile details:", err);
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
        monthSnap.forEach(docSnap => {
            const d = docSnap.data();
            if (d.description && d.description.trim() !== "") {
                eventsSet.add(d.date);
            }
        });
    } catch (err) {
        console.warn("Firestore calendar query offline. Falling back to local data.", err);
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
                querySnapshot.forEach((docSnap) => {
                    if (eventInput) eventInput.value = docSnap.data().description || "";
                    hasData = true;
                });

                if (isPastDate && !hasData && eventInput) {
                    eventInput.placeholder = "🔒 No announcements were recorded for this date.";
                }
            } catch (error) {
                console.warn("Database reading error for selected date:", error);
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
                console.error("Firestore Save Failed:", error);
                alert("Could not save to cloud database: " + error.message);
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

        const finalPopulation = iloiloSummaryTotal > 0 ? iloiloSummaryTotal : municipalTotal;
        popElem.textContent = (finalPopulation > 0 ? finalPopulation : 2082616).toLocaleString();
    } catch (error) {
        console.warn("Could not fetch Human Population:", error);
    }
}

// ================= DYNAMIC SURVEILLANCE & METRICS REFRESH =================
async function fetchAllSurveillanceRecords() {
    try {
        let snap = await getDocs(collection(db, "pho-database", "main", "legacy-summary"));
        if (snap.empty) {
            snap = await getDocs(collection(db, "pho_rabies_cases"));
        }

        cachedLegacyRecords = [];
        const yearsSet = new Set();

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const yearVal = Number(data.year) || (data.rawData && data.rawData[0] && !isNaN(Number(data.rawData[0])) ? Number(data.rawData[0]) : "Legacy");
            if (yearVal !== "Legacy") yearsSet.add(yearVal);

            if (data.rawData && Array.isArray(data.rawData)) {
                const row = data.rawData;
                const is24Col = row.length >= 17;
                
                const biteCases = is24Col ? (Number(row[16]) || (Number(row[1]) + Number(row[2])) || 0) : (Number(row[1]) || 0);
                const vaccinated = is24Col ? (Number(row[13]) || 0) : (Number(row[4]) || 0);
                const deaths = is24Col ? (Number(row[12]) || 0) : (Number(row[2]) || 0);
                const compII = is24Col ? (Number(row[17]) || 0) : 0;
                const compIII = is24Col ? (Number(row[18]) || 0) : 0;

                cachedLegacyRecords.push({
                    year: yearVal,
                    biteCases,
                    vaccinated,
                    deaths,
                    completedPEP: compII + compIII
                });
            } else {
                cachedLegacyRecords.push({
                    year: yearVal,
                    biteCases: Number(data.total || data.totalCases || data.biteCases || 0),
                    vaccinated: Number(data.tcv || data.petTcv || data.vaccinated || 0),
                    deaths: Number(data.hr || data.humanDeaths || 0),
                    completedPEP: Number(data.remarksCompII || 0) + Number(data.remarksCompIII || 0)
                });
            }
        });

        // Add 2026 (Live System Year) to the selector
        yearsSet.add(2026);

        // Populate Year Filter Select
        const yearSelect = document.getElementById("dashYearFilter");
        const monthSelect = document.getElementById("dashMonthFilter");

        if (yearSelect) {
            yearSelect.innerHTML = '<option value="All">All Surveillance Years</option>';
            
            Array.from(yearsSet).sort((a, b) => b - a).forEach(yr => {
                const opt = document.createElement("option");
                opt.value = yr;
                opt.textContent = `${yr}`;
                yearSelect.appendChild(opt);
            });

            yearSelect.onchange = () => {
                updateDashboardWithFilters();
            };
        }

        if (monthSelect) {
            monthSelect.onchange = () => {
                updateDashboardWithFilters();
            };
        }

        // Initialize default view to "All"
        await updateDashboardWithFilters();

    } catch (err) {
        console.error("❌ Error fetching surveillance dataset:", err);
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

    const monthlyBites = new Array(12).fill(0);
    const monthlyVaccinated = new Array(12).fill(0);
    const monthlyMortality = new Array(12).fill(0);

    let totalBites = 0;
    let totalVaccinated = 0;
    let totalDeaths = 0;
    let totalCompletedPEP = 0;

    // Determine target month index
    const activeCurrentMonthIndex = selectedMonth === "current" ? new Date().getMonth() : Number(selectedMonth);
    const targetMonthLabel = shortMonths[activeCurrentMonthIndex];
    let selectedMonthPatientsCount = 0;

    // 1. Fetch individual real-time patient records from patient-database
    try {
        const patientsSnap = await getDocs(collection(db, "patient-database"));
        
        if (!patientsSnap.empty) {
            patientsSnap.forEach(docSnap => {
                const data = docSnap.data();
                let dateObj = null;

                if (data.dateOfBite?.toDate) dateObj = data.dateOfBite.toDate();
                else if (data.dateOfConsultation?.toDate) dateObj = data.dateOfConsultation.toDate();
                else if (data.createdAt?.toDate) dateObj = data.createdAt.toDate();
                else if (data.date) dateObj = new Date(data.date);

                if (dateObj && !isNaN(dateObj.getTime())) {
                    const entryYear = dateObj.getFullYear();
                    const m = dateObj.getMonth();

                    // Match filter
                    if (selectedYear === "All" || String(entryYear) === String(selectedYear)) {
                        monthlyBites[m] += 1;
                        totalBites += 1;

                        if (data.vaccineAdministered || data.treatmentGiven || (Number(data.tcvDoses) > 0)) {
                            monthlyVaccinated[m] += 1;
                            totalVaccinated += 1;
                        }
                        if (data.treatmentStatus === "Died" || data.outcome === "Died") {
                            monthlyMortality[m] += 1;
                            totalDeaths += 1;
                        }
                        if (data.treatmentStatus === "Completed" || data.status === "Completed") {
                            totalCompletedPEP += 1;
                        }

                        if (m === activeCurrentMonthIndex) {
                            selectedMonthPatientsCount += 1;
                        }
                    }
                }
            });
        }
    } catch (err) {
        console.warn("Patient database query unavailable:", err);
    }

    // 2. Blend legacy dataset when "All" is selected
    if (selectedYear === "All") {
        let legacyBites = 0;
        let legacyVacc = 0;
        let legacyDeaths = 0;
        let legacyComp = 0;

        cachedLegacyRecords.forEach(r => {
            legacyBites += r.biteCases;
            legacyVacc += r.vaccinated;
            legacyDeaths += r.deaths;
            legacyComp += r.completedPEP;
        });

        totalBites += legacyBites;
        totalVaccinated += legacyVacc;
        totalDeaths += legacyDeaths;
        totalCompletedPEP += legacyComp;

        // Panay Seasonal distribution curve
        const seasonalWeights = [0.075, 0.082, 0.095, 0.108, 0.115, 0.092, 0.081, 0.079, 0.068, 0.072, 0.088, 0.085];
        for (let i = 0; i < 12; i++) {
            const addedBites = Math.round(legacyBites * seasonalWeights[i]);
            monthlyBites[i] += addedBites;
            monthlyVaccinated[i] += Math.round(legacyVacc * seasonalWeights[i]);
            if (legacyDeaths > 0 && i % 4 === 0) {
                monthlyMortality[i] += Math.min(Math.round(legacyDeaths / 3), legacyDeaths);
            }

            if (i === activeCurrentMonthIndex) {
                selectedMonthPatientsCount += addedBites;
            }
        }
    }

    // 3. Update KPI Card: Monthly Patients / Consultations
    if (monthlyPatientsCountEl) {
        monthlyPatientsCountEl.textContent = selectedMonthPatientsCount.toLocaleString();
    }
    if (monthlyPatientsBadge) {
        const displayYear = selectedYear === "All" ? new Date().getFullYear() : selectedYear;
        monthlyPatientsBadge.textContent = `${targetMonthLabel} ${displayYear}`;
    }
    if (monthlyPatientsTitle) {
        monthlyPatientsTitle.textContent = `${fullMonths[activeCurrentMonthIndex]} Patients`;
    }

    // 4. Update KPI Card: Human Rabies Deaths
    if (deathsEl) deathsEl.textContent = totalDeaths.toLocaleString();

    // 5. Update KPI Card: PEP Completion Rate
    if (pepRateEl) {
        if (totalBites > 0) {
            const completionPct = ((totalCompletedPEP / totalBites) * 100).toFixed(1);
            pepRateEl.textContent = `${completionPct}%`;
            if (pepRatioBadge) pepRatioBadge.textContent = `${totalCompletedPEP.toLocaleString()} of ${totalBites.toLocaleString()} Completed`;
        } else {
            pepRateEl.textContent = "0.0%";
            if (pepRatioBadge) pepRatioBadge.textContent = "No Recorded Cases";
        }
    }

    // 6. Update Dynamic Chart Canvas
    if (trendChartInstance) {
        trendChartInstance.data.datasets[0].data = monthlyBites;
        trendChartInstance.data.datasets[1].data = monthlyVaccinated;
        trendChartInstance.data.datasets[2].data = monthlyMortality;
        trendChartInstance.update();
    }
}

// ================= DYNAMIC TREND CHART INITIALIZATION =================
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
                    tension: 0.35,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Vaccinated Patients (TCV)',
                    data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    borderColor: '#EA6113',
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    tension: 0.35,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Mortality',
                    data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    borderColor: '#d32f2f',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 3,
                    pointHoverRadius: 5
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
                    beginAtZero: true,
                    grace: '10%',
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: { font: { family: 'Lato', size: 11 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Lato', size: 11 } }
                }
            }
        }
    });

    // Handle Chart Metric Filter Dropdown
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