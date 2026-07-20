// pho-dash.js - Dynamic Analytics Controller for PHO Dashboard
/*import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBfqjfJoGz591aI8TJjhIS3T4OEvQxX11Y",
    authDomain: "cris-database-da989.firebaseapp.com",
    databaseURL: "https://cris-database-da989-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "cris-database-da989",
    storageBucket: "cris-database-da989.firebasestorage.app",
    messagingSenderId: "627885439681",
    appId: "1:627885439681:web:3c657d64c0aad9b4913240",
    measurementId: "G-0X99BH7GW4"
};

// Initialize Firebase App services
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function calculateDashboardMetrics() {
    const totalBiteElement = document.getElementById('totalBiteCasesCount');
    const vaccinatedPatientsElement = document.getElementById('vaccinatedPatientsCount');
    const alertElement = document.getElementById('alert-status-text');
    
    try {
        const querySnapshot = await getDocs(collection(db, "bite_reports"));
        let totalReports = querySnapshot.size; 
        let vaccinatedCount = 0;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const status = (data.vaccinationStatus || data.animalVaccinationStatus || "").toLowerCase().trim();
            if (status === "vaccinated" || status === "yes") {
                vaccinatedCount++;
            }
        });

        if (totalBiteElement) totalBiteElement.textContent = totalReports.toLocaleString();
        if (vaccinatedPatientsElement) vaccinatedPatientsElement.textContent = vaccinatedCount.toLocaleString();

        if (alertElement) {
            if (totalReports > 0) {
                alertElement.textContent = `${totalReports} ongoing animal bite case incident logs registered within system records.`;
            } else {
                alertElement.textContent = "No active rabies or animal bite case alerts mapped out today.";
            }
        }
    } catch (error) {
        console.error("Error generating metrics dashboard calculations: ", error);
        if (totalBiteElement) totalBiteElement.textContent = "Error";
        if (vaccinatedPatientsElement) vaccinatedPatientsElement.textContent = "Error";
    }
}

document.addEventListener('DOMContentLoaded', calculateDashboardMetrics); */

// LINE CHART 
/*const ctx = document.getElementById('statisticsLineChart');
if (ctx) {
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            datasets: [
                {
                    label: 'Animal Bite Cases',
                    data: [25, 40, 35, 50, 70, 65, 80, 75, 90, 85, 95, 110],
                    borderColor: 'blue',
                    backgroundColor: 'rgba(234,97,19,0.15)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#EA6113',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2
                },
                {
                    label: 'Human Rabies Deaths',
                    data: [25, 40, 35, 50, 70, 65, 80, 75, 90, 85, 95, 110],
                    borderColor: '#EA6113',
                    backgroundColor: 'rgba(234,97,19,0.15)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#EA6113',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2
                },
                {
                    label: 'Animal Rabies Deaths',
                    data: [70, 50, 40, 65, 80, 35, 90, 100, 90, 85, 95, 110],
                    backgroundColor: 'rgba(0,0,0,0.15)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#EA6113',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' },
                title: { display: true, text: 'MONTHLY REPORT' }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#eeeeee' }, ticks: { stepSize: 20 } },
                x: { grid: { display: false } }
            }
        }
    });
} */

// ================= INTERFACE & DATABASE DATA COUPLING =================
// Import everything needed directly from your dedicated firebase-config file
import { db, doc, setDoc, query, where, collection, getDocs, addDoc } from "./firebase-config.js"; 

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

            if (targetDateObj < currentDateObj) {
                // If the selected date is in the past, restrict modifications
                eventInput.value = ""; 
                eventInput.placeholder = "🔒 Announcements cannot be added to past dates.";
                eventInput.disabled = true;
                saveEventBtn.disabled = true;
                complianceBox.classList.add("past-disabled");
            } else {
                // Future dates or today: Enable full operational capabilities
                eventInput.placeholder = "Type here for announcements and reminders";
                eventInput.disabled = false;
                saveEventBtn.disabled = false;
                complianceBox.classList.remove("past-disabled");
                eventInput.value = ""; 
            }
            // ------------------------------------

            try {
                // Find matching documents within 'calendar-events' collection by 'date' field
                const q = query(collection(db, "calendar-events"), where("date", "==", selectedDate));
                const querySnapshot = await getDocs(q);
                
                querySnapshot.forEach((docSnap) => {
                    // Populate field text area with your 'description' field data
                    document.getElementById("eventInput").value = docSnap.data().description || "";
                });
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

// INITIAL RUNTIME
renderCalendar();