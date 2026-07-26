import { db, doc, setDoc, query, where, collection, getDocs } from "./pho-dash-firebase.js";

if (typeof ChartDataLabels !== 'undefined' && typeof Chart !== 'undefined') {
    Chart.register(ChartDataLabels);
}

let currentDate = new Date();
let selectedDate = "";
let mixedChart = null;

document.addEventListener("DOMContentLoaded", async () => {
    renderCalendar();
    setupCalendarListeners();
    await fetchDashboardStatistics();
});

/**
 * FETCHES DASHBOARD METRICS FROM FIRESTORE
 * Updates Human Population, Bite Cases, and Human Rabies Deaths cards.
 */
async function fetchDashboardStatistics() {
    try {
        // 1. Fetch Human Population Card
        const popSnap = await getDocs(collection(db, "pho_population_data"));
        let totalPop = 0;

        popSnap.forEach((docSnap) => {
            const data = docSnap.data();
            if (docSnap.id === "ILOILO_TOTAL") {
                totalPop = Number(data.totalPopulation) || totalPop;
            } else if (data.totalPopulation) {
                totalPop += Number(data.totalPopulation) || 0;
            }
        });

        const popElem = document.getElementById("animalPopulation");
        if (popElem) popElem.textContent = (totalPop || 2082616).toLocaleString();

        // 2. Fetch Rabies Cases & Human Rabies Deaths
        const casesSnap = await getDocs(collection(db, "pho_rabies_cases"));
        let totalBites = 0;
        let totalDeaths = 0;
        const yearlyMap = {};

        casesSnap.forEach((docSnap) => {
            const d = docSnap.data();
            const yr = d.year || new Date().getFullYear();
            const bites = Number(d.totalCases ?? d.biteCases ?? 0);
            const deaths = Number(d.humanDeaths ?? d.deaths ?? 0);
            const abtc = Number(d.abtcCount ?? 0);

            totalBites += bites;
            totalDeaths += deaths;

            if (!yearlyMap[yr]) yearlyMap[yr] = { bites: 0, deaths: 0, abtc: 0 };
            yearlyMap[yr].bites += bites;
            yearlyMap[yr].deaths += deaths;
            yearlyMap[yr].abtc += abtc;
        });

        const biteElem = document.getElementById("animalBiteCases");
        const deathElem = document.getElementById("humanRabiesDeaths");
        if (biteElem) biteElem.textContent = totalBites.toLocaleString();
        if (deathElem) deathElem.textContent = totalDeaths.toLocaleString();

        // Check local override or map from Firestore
        const savedData = localStorage.getItem('cris_dashboard_data');
        if (savedData) {
            try {
                renderDashboardChart(JSON.parse(savedData));
                return;
            } catch (e) { /* Fallback to Firestore */ }
        }

        const sortedYears = Object.keys(yearlyMap).sort();
        renderDashboardChart({
            labels: sortedYears.length ? sortedYears : [2020, 2021, 2022, 2023, 2024, 2025],
            animalBites: sortedYears.map(y => yearlyMap[y].bites),
            abtcCases: sortedYears.map(y => yearlyMap[y].abtc),
            rabiesDeaths: sortedYears.map(y => yearlyMap[y].deaths)
        });

    } catch (err) {
        console.error("Dashboard Stats Fetch Error:", err);
    }
}

/**
 * CHART RENDERING WITH OVERLAP FIXES
 */
export function renderDashboardChart(data = {}) {
    const canvas = document.getElementById('statisticsLineChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (mixedChart) mixedChart.destroy();

    const labels = data.labels?.length ? data.labels : [2020, 2021, 2022, 2023, 2024, 2025];
    const animalBites = data.animalBites?.length ? data.animalBites : [34692, 40183, 46308, 72805, 70405, 69562];
    const abtcCases = data.abtcCases?.length ? data.abtcCases : [19, 19, 23, 28, 32, 33];
    const rabiesDeaths = data.rabiesDeaths?.length ? data.rabiesDeaths : [7, 12, 4, 5, 5, 1];

    mixedChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'No. of Animal Bites',
                    data: animalBites,
                    backgroundColor: 'rgba(94, 162, 40, 0.85)',
                    borderColor: '#396317',
                    borderWidth: 1,
                    yAxisID: 'yLeft',
                    order: 3,
                    datalabels: {
                        align: 'end',
                        anchor: 'end',
                        offset: 4,
                        color: '#002B7F',
                        font: { weight: 'bold', size: 11 },
                        formatter: (val) => val ? Number(val).toLocaleString() : ''
                    }
                },
                {
                    type: 'line',
                    label: 'No. of ABTCs',
                    data: abtcCases,
                    borderColor: '#1e1c78',
                    backgroundColor: '#1e1c78',
                    borderWidth: 2.5,
                    tension: 0.2,
                    yAxisID: 'yRight',
                    order: 1,
                    datalabels: {
                        align: 'top',
                        anchor: 'end',
                        offset: 4,
                        color: '#1e1c78',
                        font: { weight: 'bold', size: 11 }
                    }
                },
                {
                    type: 'line',
                    label: 'No. of Human Rabies Deaths',
                    data: rabiesDeaths,
                    borderColor: '#d91d1c',
                    backgroundColor: '#d91d1c',
                    borderWidth: 2,
                    tension: 0.2,
                    yAxisID: 'yRight',
                    order: 2,
                    datalabels: {
                        align: 'bottom',
                        anchor: 'start',
                        offset: 6,
                        color: '#d91d1c',
                        font: { weight: 'bold', size: 11 }
                    }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 30, right: 20, left: 10, bottom: 10 } // Prevents top label clipping
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Total Annual Animal Bite Cases & Metrics',
                    color: '#b21817',
                    font: { size: 16, weight: 'bold' }
                },
                legend: { position: 'top' }
            },
            scales: {
                x: { grid: { display: false } },
                yLeft: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    grace: '15%', // Gives headspace above the highest bar
                    ticks: { callback: (val) => val.toLocaleString() }
                },
                yRight: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    grace: '20%',
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

/**
 * CALENDAR RENDER & ANNOUNCEMENT PERSISTENCE ENGINE
 */
function renderCalendar() {
    const grid = document.getElementById("calendarGrid");
    if (!grid) return;
    grid.innerHTML = "";

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthYear = document.getElementById("monthYear");
    if (monthYear) {
        monthYear.textContent = currentDate.toLocaleString("default", { month: "long", year: "numeric" });
    }

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement("div");
        empty.className = "calendar-date empty";
        grid.appendChild(empty);
    }

    const today = new Date();

    for (let day = 1; day <= lastDate; day++) {
        const dateCell = document.createElement("div");
        dateCell.className = "calendar-date";
        dateCell.textContent = day;

        const monthStr = String(month + 1).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');
        const dateKey = `${year}-${monthStr}-${dayStr}`;

        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            dateCell.classList.add("today");
        }
        if (selectedDate === dateKey) {
            dateCell.classList.add("selected");
        }

        checkAndMarkEvent(dateKey, dateCell);

        dateCell.addEventListener("click", () => handleDateClick(year, month, day, dateKey, dateCell));
        grid.appendChild(dateCell);
    }
}

async function handleDateClick(year, month, day, dateKey, dateCell) {
    document.querySelectorAll(".calendar-date").forEach(c => c.classList.remove("selected"));
    dateCell.classList.add("selected");
    selectedDate = dateKey;

    const complianceBox = document.querySelector(".compliance-box");
    if (complianceBox) complianceBox.classList.add("active");

    const dateDisplay = document.getElementById("selectedDate");
    if (dateDisplay) {
        dateDisplay.textContent = new Date(year, month, day).toLocaleDateString("en-US", {
            weekday: "long", month: "long", day: "numeric", year: "numeric"
        });
    }

    const eventInput = document.getElementById("eventInput");
    const saveBtn = document.getElementById("saveEventBtn");
    if (eventInput) eventInput.value = "";

    // Fetch saved announcement for this date from Firestore
    try {
        const q = query(collection(db, "calendar-events"), where("date", "==", dateKey));
        const snap = await getDocs(q);
        if (!snap.empty && eventInput) {
            snap.forEach(docSnap => {
                eventInput.value = docSnap.data().description || "";
            });
        }
    } catch (err) {
        console.error("Error loading event:", err);
    }
}

async function checkAndMarkEvent(dateKey, cellElement) {
    try {
        const q = query(collection(db, "calendar-events"), where("date", "==", dateKey));
        const snap = await getDocs(q);
        if (!snap.empty) {
            snap.forEach(docSnap => {
                if (docSnap.data().description?.trim()) {
                    cellElement.classList.add("has-event");
                }
            });
        }
    } catch (e) { /* Silent indicator fail */ }
}

function setupCalendarListeners() {
    const saveBtn = document.getElementById("saveEventBtn");
    if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
            const input = document.getElementById("eventInput");
            const text = input ? input.value.trim() : "";

            if (!selectedDate) return alert("Please select a date on the calendar first.");

            try {
                // Persistent ID using the selected YYYY-MM-DD date key
                const docRef = doc(db, "calendar-events", selectedDate);
                await setDoc(docRef, {
                    date: selectedDate,
                    description: text,
                    title: text.split('\n')[0] || "Mass Announcement",
                    updatedAt: new Date()
                }, { merge: true });

                alert("Announcement saved and persisted!");
                renderCalendar();
            } catch (err) {
                console.error("Failed to persist announcement:", err);
                alert("Save failed: " + err.message);
            }
        });
    }

    document.getElementById("prevMonth")?.addEventListener("click", () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById("nextMonth")?.addEventListener("click", () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });
}