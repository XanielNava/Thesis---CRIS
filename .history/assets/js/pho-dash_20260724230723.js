// ================= INTERFACE & DATABASE DATA COUPLING =================
// Import everything needed directly from your dedicated firebase-config file
import { db, doc, setDoc, query, where, collection, getDocs, addDoc } from "./pho-dash-firebase.js"; 

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
let modalViewState = "months"; // Tracks current pop-up state: "months" or "years"

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function renderCalendar(){
    calendarGrid.innerHTML = "";

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthYear.textContent = currentDate.toLocaleString("default", {
        month: "long",
        year: "numeric"
    });

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    for(let i = 0; i < firstDay; i++){
        const empty = document.createElement("div");
        empty.classList.add("calendar-date", "empty");
        calendarGrid.appendChild(empty);
    }

    const today = new Date();

    for(let day = 1; day <= lastDate; day++){
        const dateCell = document.createElement("div");
        dateCell.classList.add("calendar-date");
        dateCell.textContent = day;

        // Formats to match the exact YYYY-MM-DD string key structure (e.g., "2026-06-20")
        const monthString = String(month + 1).padStart(2, '0');
        const dayString = String(day).padStart(2, '0');
        const dateKeyString = `${year}-${monthString}-${dayString}`;

        if(
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear()
        ){
            dateCell.classList.add("today");
        }

        if (selectedDate === dateKeyString) {
            dateCell.classList.add("selected");
        }

        // Checks Firestore using a query to see if this day has data
        checkAndMarkEvent(dateKeyString, dateCell);

        dateCell.addEventListener("click", async function(){
            document.querySelectorAll(".calendar-date").forEach(d => d.classList.remove("selected"));
            dateCell.classList.add("selected");

            selectedDate = dateKeyString;

            // Wake up and reveal the input area container smoothly
            const complianceBox = document.querySelector(".compliance-box");
            complianceBox.classList.add("active");

            document.getElementById("selectedDate").textContent = new Date(year, month, day).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric"
            });

            // --- PAST DATE VALIDATION ENGINE ---
            const targetDateObj = new Date(year, month, day);
            const currentDateObj = new Date();
            currentDateObj.setHours(0, 0, 0, 0);

            const eventInput = document.getElementById("eventInput");
            const saveEventBtn = document.getElementById("saveEventBtn");

            const isPastDate = targetDateObj < currentDateObj;

            if (isPastDate) {
                // If the selected date is in the past, freeze inputs but keep them open for reading
                eventInput.placeholder = "🔒 Past date. Viewing announcement in read-only mode.";
                eventInput.disabled = true;
                saveEventBtn.disabled = true;
                complianceBox.classList.add("past-disabled");
            } else {
                // Future dates or today: Enable full editing capability
                eventInput.placeholder = "Type here for announcements and reminders";
                eventInput.disabled = false;
                saveEventBtn.disabled = false;
                complianceBox.classList.remove("past-disabled");
            }
            
            // Reset textarea value while loading new data
            eventInput.value = ""; 
            // ------------------------------------

            try {
                // Find matching documents within 'calendar-events' collection by 'date' field
                const q = query(collection(db, "calendar-events"), where("date", "==", selectedDate));
                const querySnapshot = await getDocs(q);
                
                let hasData = false;
                querySnapshot.forEach((docSnap) => {
                    // Populate field text area with your 'description' field data
                    eventInput.value = docSnap.data().description || "";
                    hasData = true;
                });

                // If it's a past date and has no saved data, show a clear message
                if (isPastDate && !hasData) {
                    eventInput.placeholder = "🔒 No announcements were recorded for this date.";
                }
            } catch (error) {
                console.error("Error reading entry from database: ", error);
            }
        });

        calendarGrid.appendChild(dateCell);
    }
}

// Queries Firestore to check if the day contains an event and adds a visual indicator
async function checkAndMarkEvent(dateKey, cellElement) {
    try {
        const q = query(collection(db, "calendar-events"), where("date", "==", dateKey));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            querySnapshot.forEach(docSnap => {
                if (docSnap.data().description && docSnap.data().description.trim() !== "") {
                    cellElement.classList.add("has-event");
                }
            });
        }
    } catch (e) {
        console.error("Error drawing indicators: ", e);
    }
}

document.getElementById("prevMonth").onclick = function(){
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
};

document.getElementById("nextMonth").onclick = function(){
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
};

// ================= MODAL JUMP INTERACTION CAPABILITIES =================

calendarTitleContainer.onclick = function(e) {
    if (calendarModal.contains(e.target) && e.target !== calendarTitleContainer) return;
    
    modalViewState = "months";
    temporaryModalYear = currentDate.getFullYear();
    renderModalContent();
    calendarModal.classList.remove("hidden");
};

modalYearDisplay.onclick = function() {
    modalViewState = (modalViewState === "months") ? "years" : "months";
    renderModalContent();
};

function renderModalContent() {
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
            calendarModal.classList.add("hidden");
        };

        modalMonthsGrid.appendChild(monthBtn);
    });
}

function renderModalYears(startYear) {
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

modalPrevYear.onclick = function() {
    if (modalViewState === "months") {
        temporaryModalYear--;
    } else {
        temporaryModalYear -= 12;
    }
    renderModalContent();
};

modalNextYear.onclick = function() {
    if (modalViewState === "months") {
        temporaryModalYear++;
    } else {
        temporaryModalYear += 12;
    }
    renderModalContent();
};

closeModalBtn.onclick = function() {
    calendarModal.classList.add("hidden");
};

window.addEventListener("click", function(event) {
    if (!calendarModal.contains(event.target) && !calendarTitleContainer.contains(event.target)) {
        calendarModal.classList.add("hidden");
    }
});

// ================= ANNOUNCEMENT SAVE BUTTON ENGINE =================
document.getElementById("saveEventBtn").addEventListener("click", async function(){
    const text = document.getElementById("eventInput").value;

    if(selectedDate === ""){
        alert("Please select a date first.");
        return;
    }

    try {
        // Query to check if an announcement entry already exists for the chosen date
        const q = query(collection(db, "calendar-events"), where("date", "==", selectedDate));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // Document found: Update its fields using its auto-generated document ID
            querySnapshot.forEach(async (docSnap) => {
                const docRef = doc(db, "calendar-events", docSnap.id);
                await setDoc(docRef, {
                    description: text,
                    title: text.split('\n')[0] || "Mass Announcement",
                    created: new Date() // Updates timestamp details
                }, { merge: true });
            });
        } else {
            // Document not found: Add a brand new document with an auto-generated random ID
            await addDoc(collection(db, "calendar-events"), {
                category: "Announcement",
                created: new Date(),
                date: selectedDate,
                description: text,
                title: text.split('\n')[0] || "New Announcement"
            });
        }

        alert("Announcement saved successfully!");
        renderCalendar(); // Re-render the UI calendar grid to instantly reflect changes
    } catch (error) {
        console.error("Database execution failed: ", error);
        alert("Error saving data: " + error.message);
    }
});

// INITIAL CALENDAR RUNTIME
renderCalendar();

// ================= DYNAMIC CHART & STATS ENGINE =================

// Register ChartDataLabels plugin if available in global scope
if (typeof ChartDataLabels !== 'undefined' && typeof Chart !== 'undefined') {
    Chart.register(ChartDataLabels);
}

let mixedChart = null;

/**
 * Renders or updates the mixed bar/line chart dynamically without hardcoded datasets.
 * @param {Object} data - Contains array attributes: labels, animalBites, abtcCases, rabiesDeaths
 */
export function renderDashboardChart(data = {}) {
    const canvas = document.getElementById('statisticsLineChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');

    // Destroy existing chart instance to prevent canvas rendering overlaps
    if (mixedChart) {
        mixedChart.destroy();
    }

    mixedChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [2020, 2021, 2022, 2023, 2024, 2025],
            datasets: [
                // 1. Bar Chart: Animal Bite Cases (Left Y-Axis)
                {
                    type: 'bar',
                    label: 'No. of Animal Bites',
                    data: [34692, 40183, 46308, 72805, 70405, 695 ],
                    backgroundColor: '#5ea228',
                    borderColor: '#396317',
                    borderWidth: 1,
                    yAxisID: 'yLeft',
                    order: 3,
                    datalabels: {
                        align: 'end',
                        anchor: 'end',
                        color: '#002B7F',
                        font: { weight: 'bold', size: 12 },
                        formatter: (val) => val ? Number(val).toLocaleString() : 0
                    }
                },
                // 2. Line Chart: ABTCs (Right Y-Axis)
                {
                    type: 'line',
                    label: 'No. of ABTCs',
                    data: data.abtcCases || [],
                    borderColor: '#1e1c78',
                    backgroundColor: '#1e1c78',
                    borderWidth: 3,
                    tension: 0.1,
                    yAxisID: 'yRight',
                    order: 1,
                    datalabels: {
                        align: 'top',
                        anchor: 'center',
                        color: '#000000',
                        font: { weight: 'bold', size: 11 }
                    }
                },
                // 3. Line Chart: Human Rabies Deaths (Right Y-Axis)
                {
                    type: 'line',
                    label: 'No. of Human Rabies Death',
                    data: data.rabiesDeaths || [],
                    borderColor: '#d91d1c',
                    backgroundColor: '#d91d1c',
                    borderWidth: 2,
                    tension: 0.1,
                    yAxisID: 'yRight',
                    order: 2,
                    datalabels: {
                        align: 'bottom',
                        anchor: 'center',
                        color: '#8b0000',
                        font: { weight: 'bold', italic: true, size: 11 }
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
                    text: 'Total Annual Animal Bite Cases',
                    color: '#b21817',
                    font: { size: 18, weight: 'bold' }
                },
                legend: { position: 'top' }
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
                    grid: { color: '#e0e0e0' }
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

/**
 * Updates summary cards above the chart with computed totals
 */
function updateStatCards(data = {}) {
    const totalBites = (data.animalBites || []).reduce((acc, curr) => acc + Number(curr || 0), 0);
    const totalABTC = (data.abtcCases || []).reduce((acc, curr) => acc + Number(curr || 0), 0);
    const totalDeaths = (data.rabiesDeaths || []).reduce((acc, curr) => acc + Number(curr || 0), 0);

    const biteElem = document.getElementById('animalPopulation');
    const abtcElem = document.getElementById('animalBiteCases');
    const deathElem = document.getElementById('humanRabiesDeaths');

    if (biteElem) biteElem.textContent = totalBites.toLocaleString();
    if (abtcElem) abtcElem.textContent = totalABTC.toLocaleString();
    if (deathElem) deathElem.textContent = totalDeaths.toLocaleString();
}

/**
 * Loads dynamic dataset stored by settings.js from browser storage
 */
function initDashboardChart() {
    const savedData = localStorage.getItem('cris_dashboard_data');
    
    if (savedData) {
        try {
            const parsedData = JSON.parse(savedData);
            renderDashboardChart(parsedData);
            updateStatCards(parsedData);
        } catch (e) {
            console.error("Failed to parse stored dataset:", e);
        }
    } else {
        // Fallback initialized state before data is uploaded from settings
        renderDashboardChart({ labels: [], animalBites: [], abtcCases: [], rabiesDeaths: [] });
    }
}

// Watch for cross-tab or settings dataset modifications live
window.addEventListener('storage', (event) => {
    if (event.key === 'cris_dashboard_data' && event.newValue) {
        try {
            const newData = JSON.parse(event.newValue);
            renderDashboardChart(newData);
            updateStatCards(newData);
        } catch (e) {
            console.error("Failed updating chart from storage event:", e);
        }
    }
});

// Run chart initialization on startup
document.addEventListener('DOMContentLoaded', initDashboardChart);