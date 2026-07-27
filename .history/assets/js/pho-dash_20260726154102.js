// ================= INTERFACE & DATABASE DATA COUPLING =================
import { db, doc, setDoc, query, where, collection, getDocs, addDoc } from "../../settings/js/settings-firebase.js";

// ================= CORE CALENDAR ENGINE STATE =================
const monthYear = document.getElementById("monthYear");
const calendarGrid = document.getElementById("calendarGrid");

const calendarTitleContainer = document.getElementById("calendarTitleContainer");
const calendarModal = document.getElementById("calendarModal");
const modalYearDisplay = document.getElementById("modalYearDisplay");
const modalMonthsGrid = document.getElementById("modalMonthsGrid");
const modalPrevYear = document.getElementById("modalPrevYear");
const modalNextYear = document.getElementById("modalNextYear");
const closeModalBtn = document.getElementById("closeModalBtn");

let currentDate = new Date();
let selectedDate = ""; 
let temporaryModalYear = currentDate.getFullYear();
let modalViewState = "months"; // Tracks current pop-up state: "months" or "years"

// In-memory cache for event indicators to prevent N+1 queries during render
let monthEventsCache = new Map();

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Fetch all events for the active month in a single batch query
 */
async function fetchMonthEvents(year, month) {
    monthEventsCache.clear();
    const startMonthStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endMonthStr = `${year}-${String(month + 1).padStart(2, '0')}-31`;

    try {
        const q = query(
            collection(db, "calendar-events"), 
            where("date", ">=", startMonthStr),
            where("date", "<=", endMonthStr)
        );
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.date && data.description && data.description.trim() !== "") {
                monthEventsCache.set(data.date, data.description);
            }
        });
    } catch (error) {
        console.error("Error batch fetching month events:", error);
    }
}

/**
 * Main Calendar Render Pipeline
 */
async function renderCalendar() {
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

    // Prefetch all event markers for the current month view
    await fetchMonthEvents(year, month);

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    // Render empty start padding slots
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement("div");
        empty.classList.add("calendar-date", "empty");
        calendarGrid.appendChild(empty);
    }

    const today = new Date();

    for (let day = 1; day <= lastDate; day++) {
        const dateCell = document.createElement("div");
        dateCell.classList.add("calendar-date");
        dateCell.textContent = day;

        // Formats to match YYYY-MM-DD key structure (e.g., "2026-06-20")
        const monthString = String(month + 1).padStart(2, '0');
        const dayString = String(day).padStart(2, '0');
        const dateKeyString = `${year}-${monthString}-${dayString}`;

        if (
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear()
        ) {
            dateCell.classList.add("today");
        }

        if (selectedDate === dateKeyString) {
            dateCell.classList.add("selected");
        }

        // Apply visual event indicator from pre-fetched cache
        if (monthEventsCache.has(dateKeyString)) {
            dateCell.classList.add("has-event");
        }

        // Date Cell Click Handler
        dateCell.addEventListener("click", async function() {
            document.querySelectorAll(".calendar-date").forEach(d => d.classList.remove("selected"));
            dateCell.classList.add("selected");

            selectedDate = dateKeyString;

            // Activate input region
            const complianceBox = document.querySelector(".compliance-box");
            if (complianceBox) complianceBox.classList.add("active");

            const selectedDateElem = document.getElementById("selectedDate");
            if (selectedDateElem) {
                selectedDateElem.textContent = new Date(year, month, day).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                });
            }

            // Past date read-only check
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
                    if (complianceBox) complianceBox.classList.add("past-disabled");
                } else {
                    eventInput.placeholder = "Type here for announcements and reminders";
                    eventInput.disabled = false;
                    saveEventBtn.disabled = false;
                    if (complianceBox) complianceBox.classList.remove("past-disabled");
                }
                eventInput.value = ""; 
            }

            // Fetch specific detail for selected date
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
                console.error("Error reading entry from database: ", error);
            }
        });

        calendarGrid.appendChild(dateCell);
    }
}

// Navigation Controls
const prevMonthBtn = document.getElementById("prevMonth");
if (prevMonthBtn) {
    prevMonthBtn.onclick = function() {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    };
}

const nextMonthBtn = document.getElementById("nextMonth");
if (nextMonthBtn) {
    nextMonthBtn.onclick = function() {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    };
}

// ================= MODAL JUMP INTERACTION ENGINE =================

if (calendarTitleContainer) {
    calendarTitleContainer.onclick = function(e) {
        if (calendarModal && calendarModal.contains(e.target) && e.target !== calendarTitleContainer) return;
        
        modalViewState = "months";
        temporaryModalYear = currentDate.getFullYear();
        renderModalContent();
        if (calendarModal) calendarModal.classList.remove("hidden");
    };
}

if (modalYearDisplay) {
    modalYearDisplay.onclick = function() {
        modalViewState = (modalViewState === "months") ? "years" : "months";
        renderModalContent();
    };
}

function renderModalContent() {
    if (!modalYearDisplay || !modalMonthsGrid) return;

    if (modalViewState === "months") {
        modalYearDisplay.textContent = temporaryModalYear;
        modalMonthsGrid.classList.remove("years-view");
        renderModalMonths();
    } else {
        const startYear = temporaryModalYear - (temporaryModalYear % 12);
        modalYearDisplay.textContent = `${startYear} - ${startYear + 11}`;
        modalMonthsGrid.classList.add("years-view");
        renderModalYears(startYear);
    }
}

function renderModalMonths() {
    if (!modalMonthsGrid) return;
    modalMonthsGrid.innerHTML = "";
    const activeMonth = currentDate.getMonth();
    const activeYear = currentDate.getFullYear();

    shortMonths.forEach((monthName, index) => {
        const monthBtn = document.createElement("button");
        monthBtn.classList.add("modal-month-btn");
        monthBtn.textContent = monthName;

        if (index === activeMonth && temporaryModalYear === activeYear) {
            monthBtn.classList.add("active");
        }

        monthBtn.onclick = function() {
            currentDate.setFullYear(temporaryModalYear);
            currentDate.setMonth(index);
            renderCalendar();
            if (calendarModal) calendarModal.classList.add("hidden");
        };

        modalMonthsGrid.appendChild(monthBtn);
    });
}

function renderModalYears(startYear) {
    if (!modalMonthsGrid) return;
    modalMonthsGrid.innerHTML = "";
    const activeYear = currentDate.getFullYear();

    for (let i = 0; i < 12; i++) {
        const targetYear = startYear + i;
        const yearBtn = document.createElement("button");
        yearBtn.classList.add("modal-month-btn");
        yearBtn.textContent = targetYear;

        if (targetYear === activeYear) {
            yearBtn.classList.add("active");
        }

        yearBtn.onclick = function() {
            temporaryModalYear = targetYear;
            currentDate.setFullYear(targetYear);
            renderCalendar(); 
            
            modalViewState = "months";
            renderModalContent();
        };

        modalMonthsGrid.appendChild(yearBtn);
    }
}

if (modalPrevYear) {
    modalPrevYear.onclick = function() {
        if (modalViewState === "months") {
            temporaryModalYear--;
        } else {
            temporaryModalYear -= 12;
        }
        renderModalContent();
    };
}

if (modalNextYear) {
    modalNextYear.onclick = function() {
        if (modalViewState === "months") {
            temporaryModalYear++;
        } else {
            temporaryModalYear += 12;
        }
        renderModalContent();
    };
}

if (closeModalBtn) {
    closeModalBtn.onclick = function() {
        if (calendarModal) calendarModal.classList.add("hidden");
    };
}

window.addEventListener("click", function(event) {
    if (calendarModal && calendarTitleContainer && 
        !calendarModal.contains(event.target) && 
        !calendarTitleContainer.contains(event.target)) {
        calendarModal.classList.add("hidden");
    }
});

// ================= ANNOUNCEMENT SAVE BUTTON ENGINE =================
const saveBtn = document.getElementById("saveEventBtn");
if (saveBtn) {
    saveBtn.addEventListener("click", async function() {
        const eventInput = document.getElementById("eventInput");
        const text = eventInput ? eventInput.value.trim() : "";

        if (selectedDate === "") {
            alert("Please select a date first.");
            return;
        }

        try {
            const q = query(collection(db, "calendar-events"), where("date", "==", selectedDate));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                querySnapshot.forEach(async (docSnap) => {
                    const docRef = doc(db, "calendar-events", docSnap.id);
                    await setDoc(docRef, {
                        description: text,
                        title: text.split('\n')[0] || "Mass Announcement",
                        updatedAt: new Date()
                    }, { merge: true });
                });
            } else {
                await addDoc(collection(db, "calendar-events"), {
                    category: "Announcement",
                    created: new Date(),
                    date: selectedDate,
                    description: text,
                    title: text.split('\n')[0] || "New Announcement"
                });
            }

            alert("Announcement saved successfully!");
            renderCalendar(); // Refresh indicators and active states
        } catch (error) {
            console.error("Database execution failed: ", error);
            alert("Error saving data: " + error.message);
        }
    });
}

// ================= DYNAMIC CHART & STATS ENGINE =================

if (typeof ChartDataLabels !== 'undefined' && typeof Chart !== 'undefined') {
    Chart.register(ChartDataLabels);
}

let mixedChart = null;

export function renderDashboardChart() {
    const canvas = document.getElementById('statisticsLineChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');

    if (mixedChart) {
        mixedChart.destroy();
    }

    mixedChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [2020, 2021, 2022, 2023, 2024, 2025],
            datasets: [
                {
                    type: 'bar',
                    label: 'No. of Animal Bites',
                    data: [34692, 40183, 46308, 72805, 70405, 69562],
                    backgroundColor: '#EA6113',
                    borderColor: '#C24B06',
                    borderWidth: 1,
                    borderRadius: 4,
                    yAxisID: 'yLeft',
                    order: 3,
                    datalabels: {
                        align: 'end',
                        anchor: 'end',
                        color: '#2D1A0E',
                        font: { weight: 'bold', size: 11 },
                        formatter: (val) => val ? Number(val).toLocaleString() : 0
                    }
                },
                {
                    type: 'line',
                    label: 'No. of ABTCs',
                    data: [19, 19, 23, 28, 32, 33],
                    borderColor: '#3B82F6',
                    backgroundColor: '#3B82F6',
                    borderWidth: 2.5,
                    tension: 0.2,
                    yAxisID: 'yRight',
                    order: 1,
                    datalabels: {
                        align: 'top',
                        anchor: 'center',
                        color: '#1E3A8A',
                        font: { weight: 'bold', size: 11 }
                    }
                },
                {
                    type: 'line',
                    label: 'No. of Human Rabies Deaths',
                    data: [7, 12, 4, 5, 5, 1],
                    borderColor: '#EF4444',
                    backgroundColor: '#EF4444',
                    borderWidth: 2.5,
                    tension: 0.2,
                    yAxisID: 'yRight',
                    order: 2,
                    datalabels: {
                        align: 'bottom',
                        anchor: 'center',
                        color: '#991B1B',
                        font: { weight: 'bold', size: 11 }
                    }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Annual Animal Bite Cases & ABTC Trends',
                    color: '#2D1A0E',
                    font: { size: 16, weight: 'bold' }
                },
                legend: { 
                    position: 'top',
                    labels: { usePointStyle: true, boxWidth: 8 }
                }
            },
            scales: {
                x: { grid: { display: false } },
                yLeft: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => value.toLocaleString()
                    },
                    grid: { color: '#E2E8F0' }
                },
                yRight: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    ticks: { stepSize: 10 },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

// ================= FETCH HUMAN POPULATION DATA FROM FIRESTORE =================

async function loadHumanPopulation() {
    const popElem = document.getElementById('humanPopulation');
    if (!popElem) return;

    try {
        const querySnapshot = await getDocs(collection(db, "pho_population_data"));
        
        if (querySnapshot.empty) {
            popElem.textContent = "0";
            return;
        }

        let totalPopulationAccumulator = 0;
        let sumOfMunicipalities = 0;

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const docIdUpper = docSnap.id.trim().toUpperCase();

            // Handle Master Provincial Record vs Municipal Accumulation
            if (docIdUpper === "ILOILO" || docIdUpper === "ILOILO_TOTAL") {
                totalPopulationAccumulator = Number(data.totalPopulation) || 0;
            } else {
                if (data.totalPopulation !== undefined) {
                    sumOfMunicipalities += Number(data.totalPopulation) || 0;
                }
            }
        });

        if (totalPopulationAccumulator === 0) {
            totalPopulationAccumulator = sumOfMunicipalities;
        }

        popElem.textContent = totalPopulationAccumulator.toLocaleString();

    } catch (error) {
        console.error("Error fetching Human Population from Firestore:", error);
    }
}

// Initial runtime startup
document.addEventListener('DOMContentLoaded', () => {
    renderCalendar();
    renderDashboardChart();
    loadHumanPopulation();
});