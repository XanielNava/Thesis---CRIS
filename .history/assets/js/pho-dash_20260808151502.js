// pho-dash.js - PHO Dashboard, Calendar & Heatmap Controller (Self-Contained)

// 1. Direct CDN Imports
// import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
// import { 
//     getFirestore, 
//     collection, 
//     doc, 
//     getDocs, 
//     query, 
//     where, 
//     setDoc,
//     getCountFromServer, 
//     collectionGroup,
//     connectFirestoreEmulator
// } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// import { 
//     getAuth, 
//     connectAuthEmulator 
// } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// // 2. Your Firebase Configuration
// const firebaseConfig = {
//   apiKey: "AIzaSyBfqjfJoGz591aI8TJjhIS3T4OEvQxX11Y",
//   authDomain: "cris-database-da989.firebaseapp.com",
//   databaseURL: "https://cris-database-da989-default-rtdb.asia-southeast1.firebasedatabase.app",
//   projectId: "cris-database-da989",
//   storageBucket: "cris-database-da989.firebasestorage.app",
//   messagingSenderId: "627885439681",
//   appId: "1:627885439681:web:3c657d64c0aad9b4913240",
//   measurementId: "G-0X99BH7GW4"
// };

// 3. Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 🧪 4. CONNECT TO LOCAL EMULATOR
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');

// ================= SIDEBAR TOGGLE FUNCTIONALITY =================
const sidebarToggle = document.getElementById("sidebarToggle");
const sidebar = document.getElementById("sidebar");

if (sidebarToggle) {
    sidebarToggle.addEventListener("click", function() {
        sidebar.classList.toggle("collapsed");
        // Save preference to localStorage
        const isCollapsed = sidebar.classList.contains("collapsed");
        localStorage.setItem("sidebarCollapsed", isCollapsed);
    });
}

// Restore sidebar state on page load
document.addEventListener("DOMContentLoaded", function() {
    const wasCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
    if (wasCollapsed) {
        sidebar.classList.add("collapsed");
    }
}, { once: true });

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

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement("div");
        empty.classList.add("calendar-date", "empty");
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
        console.error("Month event fetch failed:", err);
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
        if (eventsSet.has(dateKeyString)) dateCell.classList.add("has-event");

        dateCell.addEventListener("click", async function() {
            document.querySelectorAll(".calendar-date").forEach(d => d.classList.remove("selected"));
            dateCell.classList.add("selected");
            selectedDate = dateKeyString;

            const complianceBox = document.querySelector(".compliance-box");
            if (complianceBox) complianceBox.classList.add("active");

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
                console.error("Error reading announcement: ", error);
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

// Stats Cards
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

            // Separate the provincial total row from municipal rows to prevent double-counting
            if (docIdUpper === "ILOILO" || docIdUpper === "ILOILO_TOTAL") {
                iloiloSummaryTotal = cleanVal;
            } else {
                municipalTotal += cleanVal;
            }
        });

        // Use the explicit provincial total if available; otherwise use the sum of municipalities
        const finalPopulation = iloiloSummaryTotal > 0 ? iloiloSummaryTotal : municipalTotal;
        popElem.textContent = finalPopulation.toLocaleString();
    } catch (error) {
        console.error("Error fetching Human Population:", error);
    }
}

async function loadAbtcReportingStatus() {
    const reportingRatioEl = document.getElementById('abtcReporting');
    const percentageEl = document.querySelector('.sub-stat-percentage');

    if (!reportingRatioEl) return;

    try {
        const facSnap = await getCountFromServer(collection(db, "facilities"));
        const totalFacilities = facSnap.data().count;

        if (totalFacilities === 0) {
            reportingRatioEl.textContent = "0 / 0";
            if (percentageEl) percentageEl.textContent = "0.0% Completed";
            return;
        }

        const currentPeriod = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

        const repQuery = query(
            collectionGroup(db, "submitted-reports"),
            where("reportPeriod", "==", currentPeriod)
        );
        const repSnap = await getDocs(repQuery);

        const submittedFacilitiesSet = new Set();
        repSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.facilityId) submittedFacilitiesSet.add(data.facilityId);
        });

        const submittedCount = submittedFacilitiesSet.size;
        reportingRatioEl.textContent = `${submittedCount} / ${totalFacilities}`;

        if (percentageEl) {
            const pct = ((submittedCount / totalFacilities) * 100).toFixed(1);
            percentageEl.textContent = `${pct}% Completed`;
        }
    } catch (error) {
        console.error("Error loading ABTC Reporting status:", error);
    }
}

async function loadHumanRabiesCases() {
    const rabiesCasesEl = document.getElementById('humanRabiesCases');
    if (!rabiesCasesEl) return;

    try {
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

// Announcement Save Handler
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

document.addEventListener('DOMContentLoaded', () => {
    renderCalendar();
    loadHumanPopulation();
    loadAbtcReportingStatus();
    loadHumanRabiesCases();
});