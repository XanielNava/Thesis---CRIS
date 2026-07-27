// ================= INTERFACE & DATABASE DATA COUPLING =================
//import { db, doc, setDoc, query, where, collection, getDocs, addDoc } from "../../settings/js/settings-firebase.js";

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
    if (!calendarGrid || !monthYear) return;
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

        // Formats to match exact YYYY-MM-DD string key structure
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

        // Check Firestore for existing events/announcements
        checkAndMarkEvent(dateKeyString, dateCell);

        dateCell.onclick = async function(){
            document.querySelectorAll(".calendar-date").forEach(d => d.classList.remove("selected"));
            dateCell.classList.add("selected");

            selectedDate = dateKeyString;

            // Wake up input container
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

            // --- PAST DATE VALIDATION ENGINE ---
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
        };

        calendarGrid.appendChild(dateCell);
    }
}

// Queries Firestore to check if the day contains an event
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

const prevBtn = document.getElementById("prevMonth");
if (prevBtn) {
    prevBtn.onclick = function(){
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    };
}

const nextBtn = document.getElementById("nextMonth");
if (nextBtn) {
    nextBtn.onclick = function(){
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    };
}

// ================= MODAL JUMP INTERACTION CAPABILITIES =================

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

window.onclick = function(event) {
    if (calendarModal && calendarTitleContainer) {
        if (!calendarModal.contains(event.target) && !calendarTitleContainer.contains(event.target)) {
            calendarModal.classList.add("hidden");
        }
    }
};

// ================= ANNOUNCEMENT SAVE BUTTON ENGINE =================
const saveBtn = document.getElementById("saveEventBtn");
if (saveBtn) {
    saveBtn.onclick = async function(){
        const eventInput = document.getElementById("eventInput");
        const text = eventInput ? eventInput.value : "";

        if(selectedDate === ""){
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
                        created: new Date()
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
            renderCalendar();
        } catch (error) {
            console.error("Database execution failed: ", error);
            alert("Error saving data: " + error.message);
        }
    };
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
                {
                    type: 'line',
                    label: 'No. of ABTCs',
                    data: [19, 19, 23, 28, 32, 33],
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
                {
                    type: 'line',
                    label: 'No. of Human Rabies Death',
                    data: [7, 12, 4, 5, 5, 1],
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

// ================= FETCH DYNAMIC KPI DATA FROM FIRESTORE =================

async function loadKPIStatistics() {
    const popElem = document.getElementById('humanPopulation');
    const bitesElem = document.getElementById('animalBiteCases');
    const deathsElem = document.getElementById('humanRabiesDeaths');

    // 1. Fetch Human Population
    if (popElem) {
        try {
            const querySnapshot = await getDocs(collection(db, "pho_population_data"));
            let totalPopulation = 0;

            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const rawVal = data.population ?? data.count ?? data.iloiloPopulation ?? data.value ?? 0;
                const cleanVal = typeof rawVal === 'string' ? rawVal.replace(/,/g, '') : rawVal;
                totalPopulation += Number(cleanVal || 0);
            });

            popElem.textContent = totalPopulation > 0 ? totalPopulation.toLocaleString() : "2,050,400";
        } catch (error) {
            console.error("Error fetching Human Population:", error);
            popElem.textContent = ""; 
        }
    }

    // 2. Fetch Animal Bite Cases Tally
    if (bitesElem) {
        try {
            const querySnapshot = await getDocs(collection(db, "animal_bite_cases"));
            if (!querySnapshot.empty) {
                bitesElem.textContent = querySnapshot.size.toLocaleString();
            } else {
                bitesElem.textContent = "69,562"; // Fallback to last recorded annual total
            }
        } catch (error) {
            console.error("Error fetching Animal Bite Cases:", error);
            bitesElem.textContent = "69,562";
        }
    }

    // 3. Fetch Human Rabies Deaths Tally
    if (deathsElem) {
        try {
            const q = query(collection(db, "animal_bite_cases"), where("outcome", "==", "Death"));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                deathsElem.textContent = querySnapshot.size.toLocaleString();
            } else {
                deathsElem.textContent = "1"; // Fallback to last recorded annual total
            }
        } catch (error) {
            console.error("Error fetching Rabies Deaths:", error);
            deathsElem.textContent = "1";
        }
    }
}

// Direct window onload execution replacing DOMContentLoaded/addEventListener
window.onload = function() {
    renderCalendar();
    renderDashboardChart();
    loadKPIStatistics();
};