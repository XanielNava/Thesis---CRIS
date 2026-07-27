// ================= INTERFACE & DATABASE DATA COUPLING =================
//import { db, doc, setDoc, query, where, collection, getDocs, addDoc, orderBy, limit } from "../../settings/js/settings-firebase.js";

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

        checkAndMarkEvent(dateKeyString, dateCell);

        dateCell.onclick = async function(){
            document.querySelectorAll(".calendar-date").forEach(d => d.classList.remove("selected"));
            dateCell.classList.add("selected");

            selectedDate = dateKeyString;

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

// ================= DYNAMIC SUMMARY KPI CALCULATIONS =================

async function loadExecutiveSummaryKPIs() {
    const monthlyBitesElem = document.getElementById('monthlyBites');
    const highRiskElem = document.getElementById('highRiskCases');

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    // 1. Calculate Monthly Bite Cases
    if (monthlyBitesElem) {
        try {
            const q = query(
                collection(db, "animal_bite_cases"), 
                where("dateReported", ">=", firstDayOfMonth)
            );
            const snapshot = await getDocs(q);
            monthlyBitesElem.textContent = snapshot.size.toLocaleString();
            
            const trendElem = document.getElementById('bitesTrend');
            if (trendElem) trendElem.textContent = `Recorded since ${now.toLocaleString('default', { month: 'short' })} 1`;
        } catch (err) {
            console.error("Error fetching monthly bite cases:", err);
            monthlyBitesElem.textContent = "0";
        }
    }

    // 2. High Risk (Category III) Exposures
    if (highRiskElem) {
        try {
            const qCat3 = query(
                collection(db, "animal_bite_cases"), 
                where("exposureCategory", "==", "Category III")
            );
            const snapshot = await getDocs(qCat3);
            highRiskElem.textContent = snapshot.size.toLocaleString();
        } catch (err) {
            console.error("Error fetching high risk cases:", err);
            highRiskElem.textContent = "0";
        }
    }
}

// ================= POPULATE RECENT INCIDENTS STREAM =================

async function loadRecentIncidents() {
    const tableBody = document.getElementById('recentIncidentsTable');
    if (!tableBody) return;

    try {
        const q = query(
            collection(db, "animal_bite_cases"),
            orderBy("dateReported", "desc"),
            limit(5)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No recent incidents recorded.</td></tr>`;
            return;
        }

        let html = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const badgeClass = data.exposureCategory === 'Category III' ? 'badge-danger' : 'badge-warning';
            
            html += `
                <tr>
                    <td>${data.dateReported || 'N/A'}</td>
                    <td>${data.municipality || 'Iloilo'}, ${data.barangay || ''}</td>
                    <td><span class="badge ${badgeClass}">${data.exposureCategory || 'Category II'}</span></td>
                    <td>${data.animalType || 'Dog'}</td>
                    <td>${data.status || 'Under Treatment'}</td>
                </tr>
            `;
        });
        tableBody.innerHTML = html;
    } catch (err) {
        console.error("Error loading incident stream:", err);
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Unable to fetch real-time incidents.</td></tr>`;
    }
}

// Direct window onload initialization replacing DOMContentLoaded / addEventListener
window.onload = function() {
    renderCalendar();
    loadExecutiveSummaryKPIs();
    loadRecentIncidents();
};