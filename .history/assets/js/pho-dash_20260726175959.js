// ================= INTERFACE & DATABASE DATA COUPLING =================
import { db, doc, setDoc, query, where, collection, getDocs, addDoc } from "../../settings/js/settings-firebase.js";

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
    if (!calendarGrid) return;
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
            if (complianceBox) complianceBox.classList.add("active");

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

            try {
                const q = query(collection(db, "calendar-events"), where("date", "==", selectedDate));
                const querySnapshot = await getDocs(q);
                
                let hasData = false;
                querySnapshot.forEach((docSnap) => {
                    eventInput.value = docSnap.data().description || "";
                    hasData = true;
                });

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
});

// INITIAL CALENDAR RUNTIME
renderCalendar();

// ================= DYNAMIC TREND CHART & STATS ENGINE =================

let trendChart = null;

export function renderDashboardChart() {
    // FIX: Updated element ID to match <canvas id="incidentTrendChart">
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
                    borderColor: '#F88F22', // CRIS Sunset Gold
                    backgroundColor: 'rgba(248, 143, 34, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Category III',
                    data: [80, 95, 110, 130, 150, 140, 160, 175, 155, 135, 120, 110],
                    borderColor: '#EA6113', // CRIS Sunset Orange
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
                legend: { display: false } // Managed via custom header legend in HTML/CSS
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

// ================= FETCH HUMAN POPULATION DATA FROM FIRESTORE =================

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

// Initial runtime startup
document.addEventListener('DOMContentLoaded', () => {
    renderDashboardChart();
    loadHumanPopulation();
});