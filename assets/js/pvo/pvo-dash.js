// ==========================================================================
// PVO DASHBOARD CORE LOGIC & DYNAMIC ANALYTICS MODULE
// ==========================================================================

import { auth, db } from '../firebase/firebase-config.js';
import { 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    setDoc, 
    query, 
    where, 
    orderBy, 
    limit 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

// Global Dashboard State
let surveillanceChart = null;
let cachedCaseRecords = [];
let availableSurveillanceYears = new Set();

// Calendar State
let currentDate = new Date();
let selectedDateStr = "";
let selectedYearModal = currentDate.getFullYear();
const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

document.addEventListener("DOMContentLoaded", () => {
    initAuthWatcher();
    initSurveillanceChart();
    initCalendarSystem();
    loadDashboardData();
    loadRecentIncidentLog();
});

/* --------------------------------------------------------------------------
   1. USER PROFILE & AUTHENTICATION
   -------------------------------------------------------------------------- */
function initAuthWatcher() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await loadUserProfile(user);
        } else {
            setFallbackProfileUI();
        }
    });
}

function setFallbackProfileUI() {
    const topProfileName = document.getElementById("topProfileName");
    const welcomeGreeting = document.getElementById("welcomeGreeting");
    if (topProfileName) topProfileName.textContent = "Authorized Officer";
    if (welcomeGreeting) welcomeGreeting.textContent = "Hello, Authorized Personnel";
}

async function loadUserProfile(user) {
    const topProfileName = document.getElementById("topProfileName");
    const welcomeGreeting = document.getElementById("welcomeGreeting");

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        let displayName = user.displayName || "";

        if (userDoc.exists()) {
            const data = userDoc.data();
            const fullNameParts = [
                data.firstName,
                data.middleName ? `${data.middleName[0]}.` : "",
                data.lastName,
                data.suffix
            ].filter(Boolean);

            if (fullNameParts.length > 0) {
                displayName = fullNameParts.join(" ");
            }
        }

        if (!displayName) {
            displayName = user.email ? user.email.split("@")[0] : "Officer";
        }

        if (topProfileName) topProfileName.textContent = displayName;
        if (welcomeGreeting) welcomeGreeting.textContent = `Hello, ${displayName}`;
    } catch (err) {
        setFallbackProfileUI();
    }
}

/* --------------------------------------------------------------------------
   2. DYNAMIC FIRESTORE METRICS & CHART AGGREGATION
   -------------------------------------------------------------------------- */
async function loadDashboardData() {
    try {
        // Query surveillance records from Firestore
        let snapshot = await getDocs(collection(db, "pho-database", "main", "legacy-summary"));
        if (snapshot.empty) {
            snapshot = await getDocs(collection(db, "pho_rabies_cases"));
        }

        cachedCaseRecords = [];
        availableSurveillanceYears.clear();

        if (!snapshot.empty) {
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const recordYear = parseRecordYear(data);
                const recordMonth = parseRecordMonth(data);

                if (recordYear) availableSurveillanceYears.add(recordYear);

                let bites = 0;
                let vaccinations = 0;
                let confirmed = 0;

                if (data.rawData && Array.isArray(data.rawData)) {
                    const row = data.rawData;
                    const is24Col = row.length >= 17;
                    bites = is24Col ? (Number(row[16]) || 0) : (Number(row[1]) || 0);
                    vaccinations = is24Col ? (Number(row[13]) || 0) : (Number(row[4]) || 0);
                    confirmed = is24Col ? (Number(row[12]) || 0) : (Number(row[2]) || 0);
                } else {
                    bites = Number(data.total || data.totalCases || data.biteCases || 0);
                    vaccinations = Number(data.tcv || data.petTcv || data.vaccinated || 0);
                    confirmed = Number(data.hr || data.humanDeaths || data.confirmed || 0);
                }

                cachedCaseRecords.push({
                    year: recordYear,
                    month: recordMonth,
                    bites,
                    vaccinations,
                    confirmed
                });
            });
        }

        populateFilters();
        updateStatistics();
    } catch (err) {
        console.error("Failed to load PVO dashboard surveillance data:", err);
    }
}

function parseRecordYear(data) {
    if (data.year && !isNaN(Number(data.year))) return Number(data.year);
    if (data.date) {
        const dt = data.date.toDate ? data.date.toDate() : new Date(data.date);
        if (!isNaN(dt.getFullYear())) return dt.getFullYear();
    }
    return null;
}

function parseRecordMonth(data) {
    if (data.month !== undefined && data.month !== null && !isNaN(Number(data.month))) {
        const m = Number(data.month);
        return m >= 1 && m <= 12 ? m - 1 : (m >= 0 && m <= 11 ? m : null);
    }
    if (data.date) {
        const dt = data.date.toDate ? data.date.toDate() : new Date(data.date);
        if (!isNaN(dt.getMonth())) return dt.getMonth();
    }
    return null;
}

function populateFilters() {
    const yearFilter = document.getElementById("yearFilter");
    if (!yearFilter) return;

    const currentSelection = yearFilter.value;
    yearFilter.innerHTML = '<option value="all">All Years</option>';

    const sortedYears = Array.from(availableSurveillanceYears).sort((a, b) => b - a);
    sortedYears.forEach((yr) => {
        const opt = document.createElement("option");
        opt.value = yr;
        opt.textContent = yr;
        yearFilter.appendChild(opt);
    });

    if (currentSelection && (sortedYears.includes(Number(currentSelection)) || currentSelection === "all")) {
        yearFilter.value = currentSelection;
    } else if (sortedYears.length > 0) {
        yearFilter.value = sortedYears[0];
    }

    yearFilter.onchange = () => {
        updateStatistics();
        updateChartData();
    };

    const monthFilter = document.getElementById("monthFilter");
    if (monthFilter) {
        monthFilter.onchange = () => {
            updateStatistics();
            updateChartData();
        };
    }
}

function updateStatistics() {
    const yearFilter = document.getElementById("yearFilter");
    const monthFilter = document.getElementById("monthFilter");

    const selectedYear = yearFilter ? yearFilter.value : "all";
    const selectedMonth = monthFilter ? monthFilter.value : "all";

    let filtered = cachedCaseRecords;

    if (selectedYear !== "all") {
        filtered = filtered.filter(item => String(item.year) === String(selectedYear));
    }

    if (selectedMonth !== "all") {
        filtered = filtered.filter(item => item.month === parseInt(selectedMonth));
    }

    let totalBites = 0;
    let totalVaccinated = 0;
    let totalConfirmed = 0;

    filtered.forEach(record => {
        totalBites += record.bites;
        totalVaccinated += record.vaccinations;
        totalConfirmed += record.confirmed;
    });

    const totalBiteElem = document.getElementById("totalBiteCases");
    const confirmedElem = document.getElementById("confirmedRabiesCases");
    const coverageElem = document.getElementById("vaccinationCoverage");
    const observedElem = document.getElementById("animalsObserved");

    if (totalBiteElem) totalBiteElem.textContent = totalBites.toLocaleString();
    if (confirmedElem) confirmedElem.textContent = totalConfirmed.toLocaleString();

    if (coverageElem) {
        const coverageRate = totalBites > 0 ? ((totalVaccinated / totalBites) * 100).toFixed(0) : 0;
        coverageElem.textContent = `${coverageRate}%`;
    }

    // Animals under active observation count
    if (observedElem) {
        observedElem.textContent = filtered.filter(r => r.bites > 0).length.toLocaleString();
    }
}

/* --------------------------------------------------------------------------
   3. CHART.JS ANALYTICS ENGINE
   -------------------------------------------------------------------------- */
function initSurveillanceChart() {
    const ctx = document.getElementById("pvoSurveillanceChart")?.getContext("2d");
    if (!ctx || typeof Chart === "undefined") return;

    surveillanceChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: shortMonths,
            datasets: [{
                label: "Animal Bite Cases",
                data: new Array(12).fill(0),
                borderColor: "#e65100",
                backgroundColor: "rgba(230, 81, 0, 0.08)",
                borderWidth: 3,
                fill: true,
                tension: 0.35,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: "#e65100"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#0b132b",
                    titleFont: { family: "Lato", size: 13, weight: "bold" },
                    bodyFont: { family: "Lato", size: 12 },
                    padding: 10,
                    cornerRadius: 8
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { family: "Lato", size: 11 } }
                },
                y: {
                    border: { dash: [4, 4] },
                    grid: { color: "#f0f0f0" },
                    ticks: { font: { family: "Lato", size: 11 } },
                    beginAtZero: true
                }
            }
        }
    });

    const metricSelect = document.getElementById("chartMetricSelect");
    if (metricSelect) {
        metricSelect.addEventListener("change", updateChartData);
    }
}

function updateChartData() {
    if (!surveillanceChart) return;

    const yearFilter = document.getElementById("yearFilter");
    const metricSelect = document.getElementById("chartMetricSelect");

    const selectedYear = yearFilter ? yearFilter.value : "all";
    const selectedMetric = metricSelect ? metricSelect.value : "bites";

    let filtered = cachedCaseRecords;
    if (selectedYear !== "all") {
        filtered = filtered.filter(item => String(item.year) === String(selectedYear));
    }

    const monthlyAggregation = new Array(12).fill(0);

    filtered.forEach(record => {
        if (record.month !== null && record.month >= 0 && record.month < 12) {
            if (selectedMetric === "vaccinations") {
                monthlyAggregation[record.month] += record.vaccinations;
            } else if (selectedMetric === "confirmed") {
                monthlyAggregation[record.month] += record.confirmed;
            } else {
                monthlyAggregation[record.month] += record.bites;
            }
        }
    });

    let color = "#e65100";
    let bg = "rgba(230, 81, 0, 0.08)";
    let label = "Animal Bite Cases";

    if (selectedMetric === "vaccinations") {
        color = "#2e7d32";
        bg = "rgba(46, 125, 50, 0.08)";
        label = "Vaccinations Administered";
    } else if (selectedMetric === "confirmed") {
        color = "#d84315";
        bg = "rgba(216, 67, 21, 0.08)";
        label = "Confirmed Rabies Cases";
    }

    surveillanceChart.data.datasets[0].label = label;
    surveillanceChart.data.datasets[0].data = monthlyAggregation;
    surveillanceChart.data.datasets[0].borderColor = color;
    surveillanceChart.data.datasets[0].backgroundColor = bg;
    surveillanceChart.data.datasets[0].pointBackgroundColor = color;
    surveillanceChart.update();
}

/* --------------------------------------------------------------------------
   4. DYNAMIC SURVEILLANCE & INCIDENT LOG TABLE
   -------------------------------------------------------------------------- */
async function loadRecentIncidentLog() {
    const tableBody = document.querySelector(".surveillance-table tbody, #incidentLogTableBody");
    if (!tableBody) return;

    try {
        const q = query(
            collection(db, "patient-database"), 
            orderBy("submittedAt", "desc"), 
            limit(10)
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; padding: 20px; color: #7E8B9B;">
                        No recent bite surveillance incidents reported.
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = "";
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const dateStr = formatTimestamp(data.submittedAt || data.incident?.date);
            const location = data.incident?.municipality || data.cityMunicipality || "—";
            const vector = `${data.animal?.type || data.animalType || "Animal"} (${data.animal?.ownership || "Unknown"})`;
            const exposure = data.exposure?.type || data.exposureType || "Category II";
            const status = data.status || "Under Observation";

            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${dateStr}</td>
                <td>${location}</td>
                <td>${vector}</td>
                <td><span class="badge ${getCategoryBadgeClass(exposure)}">${exposure}</span></td>
                <td><span class="badge ${getStatusBadgeClass(status)}">${status}</span></td>
            `;
            tableBody.appendChild(row);
        });
    } catch (err) {
        console.error("Failed loading recent surveillance incidents:", err);
    }
}

function formatTimestamp(timestamp) {
    if (!timestamp) return "—";
    const dt = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getCategoryBadgeClass(category) {
    const lower = String(category).toLowerCase();
    if (lower.includes("iii") || lower.includes("3")) return "badge-cat3";
    if (lower.includes("ii") || lower.includes("2")) return "badge-cat2";
    return "badge-cat1";
}

function getStatusBadgeClass(status) {
    const lower = String(status).toLowerCase();
    if (lower.includes("risk") || lower.includes("high")) return "badge-risk";
    if (lower.includes("quarantine")) return "badge-quarantine";
    return "badge-cleared";
}

/* --------------------------------------------------------------------------
   5. FIRESTORE PERSISTENT CALENDAR & ANNOUNCEMENT SYSTEM
   -------------------------------------------------------------------------- */
function initCalendarSystem() {
    renderCalendar();

    document.getElementById("prevMonth")?.addEventListener("click", () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById("nextMonth")?.addEventListener("click", () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });

    const titleContainer = document.getElementById("calendarTitleContainer");
    const calendarModal = document.getElementById("calendarModal");
    const closeModalBtn = document.getElementById("closeModalBtn");

    if (titleContainer && calendarModal) {
        titleContainer.addEventListener("click", () => {
            selectedYearModal = currentDate.getFullYear();
            updateModalYearDisplay();
            renderModalMonths();
            calendarModal.classList.remove("hidden");
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener("click", () => {
            calendarModal.classList.add("hidden");
        });
    }

    document.getElementById("modalPrevYear")?.addEventListener("click", () => {
        selectedYearModal--;
        updateModalYearDisplay();
    });

    document.getElementById("modalNextYear")?.addEventListener("click", () => {
        selectedYearModal++;
        updateModalYearDisplay();
    });

    document.getElementById("saveEventBtn")?.addEventListener("click", saveAnnouncementToFirestore);
}

async function renderCalendar() {
    const monthYear = document.getElementById("monthYear");
    const calendarGrid = document.getElementById("calendarGrid");
    if (!monthYear || !calendarGrid) return;

    calendarGrid.innerHTML = "";

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthYear.textContent = currentDate.toLocaleString("default", {
        month: "long",
        year: "numeric"
    });

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    // Query active month announcements from Firestore
    const startStr = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`;
    const activeEvents = new Set();

    try {
        const q = query(
            collection(db, "calendar-events"),
            where("date", ">=", startStr),
            where("date", "<=", endStr)
        );
        const snap = await getDocs(q);
        snap.forEach(docSnap => activeEvents.add(docSnap.data().date));
    } catch (e) {
        // Continue gracefully if offline
    }

    // Leading empty cells
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement("div");
        empty.classList.add("calendar-date", "empty");
        calendarGrid.appendChild(empty);
    }

    // Calendar days
    for (let day = 1; day <= lastDate; day++) {
        const dateCell = document.createElement("div");
        dateCell.classList.add("calendar-date");
        dateCell.textContent = day;

        const thisDate = new Date(year, month, day);
        const formattedStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            dateCell.classList.add("today");
        }

        if (thisDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
            dateCell.classList.add("past");
        }

        if (activeEvents.has(formattedStr)) {
            dateCell.classList.add("has-event");
        }

        dateCell.addEventListener("click", () => handleDateClick(dateCell, year, month, day, formattedStr));
        calendarGrid.appendChild(dateCell);
    }
}

async function handleDateClick(cell, year, month, day, dateStr) {
    document.querySelectorAll(".calendar-date").forEach(d => d.classList.remove("selected"));
    cell.classList.add("selected");

    selectedDateStr = dateStr;

    const displayDate = new Date(year, month, day);
    const selectedDateHeader = document.getElementById("selectedDate");
    const eventInput = document.getElementById("eventInput");
    const saveBtn = document.getElementById("saveEventBtn");

    if (selectedDateHeader) {
        selectedDateHeader.textContent = displayDate.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        });
    }

    if (eventInput) {
        eventInput.value = "Loading announcement...";
        eventInput.disabled = true;
    }

    try {
        const eventDoc = await getDoc(doc(db, "calendar-events", dateStr));
        if (eventInput) {
            eventInput.value = eventDoc.exists() ? (eventDoc.data().description || "") : "";
            eventInput.disabled = false;
        }
    } catch (err) {
        if (eventInput) {
            eventInput.value = "";
            eventInput.disabled = false;
        }
    }

    if (saveBtn) saveBtn.disabled = false;
}

async function saveAnnouncementToFirestore() {
    const eventInput = document.getElementById("eventInput");
    const saveBtn = document.getElementById("saveEventBtn");

    if (!selectedDateStr) {
        alert("Please select a date from the calendar first.");
        return;
    }

    const text = eventInput ? eventInput.value.trim() : "";

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";
    }

    try {
        await setDoc(doc(db, "calendar-events", selectedDateStr), {
            category: "PVO Announcement",
            date: selectedDateStr,
            description: text,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        alert(text === "" ? "Announcement cleared." : "PVO Announcement saved successfully!");
        renderCalendar();
    } catch (err) {
        alert("Failed to save announcement: " + err.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Event";
        }
    }
}

function updateModalYearDisplay() {
    const modalYearDisplay = document.getElementById("modalYearDisplay");
    if (modalYearDisplay) modalYearDisplay.textContent = selectedYearModal;
}

function renderModalMonths() {
    const monthsGrid = document.getElementById("modalMonthsGrid");
    if (!monthsGrid) return;

    monthsGrid.innerHTML = "";
    shortMonths.forEach((m, idx) => {
        const mCell = document.createElement("div");
        mCell.classList.add("month-cell");
        if (idx === currentDate.getMonth() && selectedYearModal === currentDate.getFullYear()) {
            mCell.classList.add("active");
        }
        mCell.textContent = m;
        mCell.addEventListener("click", () => {
            currentDate.setFullYear(selectedYearModal);
            currentDate.setMonth(idx);
            renderCalendar();
            document.getElementById("calendarModal")?.classList.add("hidden");
        });
        monthsGrid.appendChild(mCell);
    });
}