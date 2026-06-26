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
const ctx = document.getElementById('statisticsLineChart');
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
}

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

        if(
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear()
        ){
            dateCell.classList.add("today");
        }

        if (selectedDate === `${year}-${month + 1}-${day}`) {
            dateCell.classList.add("selected");
        }

        dateCell.addEventListener("click", function(){
            document.querySelectorAll(".calendar-date").forEach(d => d.classList.remove("selected"));
            dateCell.classList.add("selected");

            selectedDate = `${year}-${month + 1}-${day}`;

            document.getElementById("selectedDate").textContent = new Date(year, month, day).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric"
            });
        });

        calendarGrid.appendChild(dateCell);
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

// Switch view between Months and Years when clicking the Year header label inside modal
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

    for (let i = 0; i <100; i++) {
        const targetYear = startYear + i;
        const yearBtn = document.createElement("button");
        yearBtn.classList.add("modal-month-btn");
        yearBtn.textContent = targetYear;

        if (targetYear === activeYear) {
            yearBtn.classList.add("active");
        }

        yearBtn.onclick = function() {
            temporaryModalYear = targetYear;
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

// ANNOUNCEMENT SAVE BUTTON ENGINE
document.getElementById("saveEventBtn").addEventListener("click", function(){
    const text = document.getElementById("eventInput").value;

    if(selectedDate === ""){
        alert("Please select a date first.");
        return;
    }

    console.log({
        date: selectedDate,
        event: text
    });

    alert("Announcement saved successfully!");
});

// INITIAL RUNTIME
renderCalendar();