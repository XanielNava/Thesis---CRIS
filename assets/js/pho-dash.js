// pho-dash.js - Optimized PHO Dashboard & Calendar Controller
import { 
    db, doc, setDoc, query, where, collection, getDocs, 
    getCountFromServer, collectionGroup 
} from "../../settings/js/settings-firebase.js";

// ================= CORE CALENDAR ENGINE =================
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
let modalViewState = "months";

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    // Render preceding padding empty cells
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement("div");
        empty.classList.add("calendar-date", "empty");
        calendarGrid.appendChild(empty);
    }

    // 1 single query for the whole month instead of 30 separate calls
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
        console.error("Single-query month event fetch failed:", err);
    }

    const today = new Date();

    for (let day = 1; day <= lastDate; day++) {
        const dateCell = document.createElement("div");
        dateCell.classList.add("calendar-date");
        dateCell.textContent = day;

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

        if (eventsSet.has(dateKeyString)) {
            dateCell.classList.add("has-event");
        }

        dateCell.addEventListener("click", async function() {
            document.querySelectorAll(".calendar-date").forEach(d => d.classList.remove("selected"));
            dateCell.classList.add("selected");

            selectedDate = dateKeyString;

            const complianceBox = document.querySelector(".compliance-box");
            if (complianceBox) complianceBox.classList.add("active");

            const selectedDateEl = document.getElementById("selectedDate");
            if (selectedDateEl) {
                selectedDateEl.textContent = new Date(year, month, day).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                });
            }

            // Past date validation
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
const prevBtn = document.getElementById("prevMonth");
const nextBtn = document.getElementById("nextMonth");

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

// Modal View Controllers
if (calendarTitleContainer && calendarModal) {
    calendarTitleContainer.onclick = function(e) {
        if (calendarModal.contains(e.target) && e.target !== calendarTitleContainer) return;
        
        modalViewState = "months";
        temporaryModalYear = currentDate.getFullYear();
        renderModalContent();
        calendarModal.classList.remove("hidden");
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

if (closeModalBtn && calendarModal) {
    closeModalBtn.onclick = function() {
        calendarModal.classList.add("hidden");
    };
}

window.addEventListener("click", function(event) {
    if (calendarModal && calendarTitleContainer) {
        if (!calendarModal.contains(event.target) && !calendarTitleContainer.contains(event.target)) {
            calendarModal.classList.add("hidden");
        }
    }
});

// Announcement Save Button
const saveEventBtn = document.getElementById("saveEventBtn");
if (saveEventBtn) {
    saveEventBtn.addEventListener("click", async function() {
        const eventInput = document.getElementById("eventInput");
        const text = eventInput ? eventInput.value : "";

        if (selectedDate === "") {
            alert("Please select a date first.");
            return;
        }

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
            console.error("Database execution failed: ", error);
            alert("Error saving data: " + error.message);
        }
    });
}

// Rabies Exposure Trends Chart
let trendChart = null;

export function renderDashboardChart() {
    const canvas = document.getElementById('incidentTrendChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');

    if (trendChart) {
        trendChart.destroy();
    }

    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            datasets: [
                {
                    label: 'Category II',
                    data: [120, 140, 160, 180, 210, 195, 220, 240, 210, 190, 175, 160],
                    borderColor: '#F88F22',
                    backgroundColor: 'rgba(248, 143, 34, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Category III',
                    data: [80, 95, 110, 130, 150, 140, 160, 175, 155, 135, 120, 110],
                    borderColor: '#EA6113',
                    backgroundColor: 'rgba(234, 97, 19, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { grid: { display: false } },
                y: {
                    beginAtZero: true,
                    grid: { color: '#f0e6df' }
                }
            }
        }
    });
}

// ================= 1. CARD 1: HUMAN POPULATION =================
async function loadHumanPopulation() {
    const popElem = document.getElementById('humanPopulation');
    if (!popElem) return;

    try {
        const querySnapshot = await getDocs(collection(db, "pho_population_data"));
        let totalPopulation = 0;

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const rawVal = data.population ?? data.count ?? data.iloiloPopulation ?? data.value ?? 0;
            const cleanVal = typeof rawVal === 'string' ? rawVal.replace(/,/g, '') : rawVal;
            
            totalPopulation += Number(cleanVal || 0);
        });

        popElem.textContent = totalPopulation.toLocaleString();

    } catch (error) {
        console.error("Error fetching Human Population from Firestore:", error);
    }
}

// ================= 2. CARD 2: ABTC REPORTING STATUS (COST OPTIMIZED) =================
async function loadAbtcReportingStatus() {
    const reportingRatioEl = document.getElementById('abtcReporting');
    const percentageEl = document.querySelector('.sub-stat-percentage');

    if (!reportingRatioEl) return;

    try {
        // 1. Costs only 1 server read unit total
        const facSnap = await getCountFromServer(collection(db, "facilities"));
        const totalFacilities = facSnap.data().count;

        if (totalFacilities === 0) {
            reportingRatioEl.textContent = "0 / 0";
            if (percentageEl) percentageEl.textContent = "0.0% Completed";
            return;
        }

        // 2. Exact current month string ("July 2026")
        const currentPeriod = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

        // 3. Costs ONLY as many reads as submitted reports found (e.g. 1 or 2 reads)
        const repQuery = query(
            collectionGroup(db, "submitted-reports"),
            where("reportPeriod", "==", currentPeriod)
        );
        const repSnap = await getDocs(repQuery);

        const submittedFacilitiesSet = new Set();
        repSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.facilityId) {
                submittedFacilitiesSet.add(data.facilityId);
            }
        });

        const submittedCount = submittedFacilitiesSet.size;

        // 4. Render results
        reportingRatioEl.textContent = `${submittedCount} / ${totalFacilities}`;

        if (percentageEl) {
            const pct = ((submittedCount / totalFacilities) * 100).toFixed(1);
            percentageEl.textContent = `${pct}% Completed`;
        }

    } catch (error) {
        console.error("Error loading ABTC Reporting status:", error);
    }
}

// ================= 3. CARD 3: HUMAN RABIES CASES =================
async function loadHumanRabiesCases() {
    const rabiesCasesEl = document.getElementById('humanRabiesCases');
    if (!rabiesCasesEl) return;

    try {
        // Costs only 1 server read unit total using count aggregation
        const rabiesQuery = query(
            collection(db, "patient-database"),
            where("treatmentStatus", "==", "Died")
        );
        const countSnap = await getCountFromServer(rabiesQuery);
        rabiesCasesEl.textContent = countSnap.data().count;

    } catch (error) {
        console.error("Error loading Human Rabies Cases:", error);
    }
}

// ================= INITIAL RUNTIME STARTUP =================
document.addEventListener('DOMContentLoaded', () => {
    renderCalendar();
    renderDashboardChart();
    loadHumanPopulation();
    loadAbtcReportingStatus();
    loadHumanRabiesCases();
});