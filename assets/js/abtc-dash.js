// abtc-dash.js - Optimized Dashboard Controller with Untouched Calendar Engine
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { 
    getFirestore, doc, getDoc, setDoc, addDoc, collection, query, where, getDocs, onSnapshot, getCountFromServer 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyBfqjfJoGz591aI8TJjhIS3T4OEvQxX11Y",
    authDomain: "cris-database-da989.firebaseapp.com",
    projectId: "cris-database-da989",
    storageBucket: "cris-database-da989.firebasestorage.app",
    messagingSenderId: "627885439681",
    appId: "1:627885439681:web:3c657d64c0aad9b4913240"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* --------------------
    Authentication State Observer & Profile Cache
-------------------- */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            let userRole = sessionStorage.getItem("activeDesignation") || localStorage.getItem("activeDesignation"); 
            const currentPath = window.location.pathname;

            if (!userRole) {
                window.location.href = "abtc-profiles.html";
                return;
            }

            if (userRole === "Nurse" && !currentPath.includes("patient-registry.html")) {
                window.location.href = "patient-registry.html";
                return;
            } else if (userRole === "Owner" && !currentPath.includes("abtc-dash.html")) {
                window.location.href = "abtc-dash.html";
                return;
            }

            // Session Caching Check (Bypasses repeated getDoc reads)
            let cachedFacilityName = sessionStorage.getItem("cachedFacilityName");
            let activeStaffMember = sessionStorage.getItem("activePersonnelName") || localStorage.getItem("activePersonnelName");

            if (!cachedFacilityName || !activeStaffMember) {
                const facilityDocRef = doc(db, "facilities", user.uid);
                const facilitySnapshot = await getDoc(facilityDocRef);

                if (facilitySnapshot.exists()) {
                    const facilityData = facilitySnapshot.data();
                    
                    activeStaffMember = userRole === "Owner" 
                        ? (facilityData.contactInfo?.contactPerson || "Facility Administrator")
                        : (activeStaffMember || "Duty Nurse Personnel");
                    
                    cachedFacilityName = facilityData.facilityName || facilityData.name || "ABTC FACILITY";

                    sessionStorage.setItem("cachedFacilityName", cachedFacilityName);
                    sessionStorage.setItem("activePersonnelName", activeStaffMember);

                    if (facilityData.logoData) {
                        const sidebarLogo = document.getElementById("sidebarLogoPreview");
                        if (sidebarLogo) sidebarLogo.src = facilityData.logoData;
                    }
                } else {
                    activeStaffMember = userRole === "Owner" ? "Facility Owner" : "Duty Nurse Personnel";
                    cachedFacilityName = "ABTC";
                }
            }

            renderUserAndFacilityHeader(cachedFacilityName, activeStaffMember, userRole);
            loadAggregatedDashboardMetrics(user.uid);

        } catch (error) {
            console.error("Auth routing engine failure:", error);
        }
    } else {
        handleLogoutRedirect();
    }
});

/* --------------------
    Profile & Header Renderer
-------------------- */
function renderUserAndFacilityHeader(facilityName, displayName, userRole) {
    const titleElement = document.getElementById("dashboardTitle");
    if (titleElement) {
        titleElement.innerText = `${facilityName.toUpperCase()} DASHBOARD`;
    }
    
    const mappedRoleTitle = userRole === "Owner" ? "Administrator / Owner" : "Nurse Duty Personnel";
    updateProfileUI(displayName, mappedRoleTitle);
}

function updateProfileUI(name, role) {
    const profileContainer = document.getElementById("profileInfoText");
    const welcomeBar = document.getElementById("welcomeBarText");

    if (profileContainer) {
        profileContainer.innerHTML = `<strong>${name}</strong><br><span>${role}</span>`;
    }
    if (welcomeBar) {
        const cleanFirstName = name.split(" ")[0];
        welcomeBar.innerHTML = `<div class="avatar-circle"><i class="fa-solid fa-user"></i></div>Welcome back, ${cleanFirstName}`;
    }
}

/* --------------------
    Server-Side & Live Dashboard Metrics Engine (4 Metrics Connected)
-------------------- */
async function loadAggregatedDashboardMetrics(facilityId) {
    const patientsCounterEl = document.getElementById("totalPatientsCount");
    const catThreeCounterEl = document.getElementById("categoryThreeCount");
    const scheduledTodayEl = document.getElementById("scheduledTodayCount");
    const pepVialsEl = document.getElementById("pepVialsCount");

    try {
        const rootPatientsCol = collection(db, "patient-database");

        // 1. Server-side Count for Total Patients (1 Read)
        const totalQuery = query(rootPatientsCol, where("facilityId", "==", facilityId));
        const totalSnap = await getCountFromServer(totalQuery);

        // 2. Server-side Count for Category III Patients (1 Read)
        const cat3Query = query(rootPatientsCol, where("facilityId", "==", facilityId), where("classification", "==", "Category III"));
        const cat3Snap = await getCountFromServer(cat3Query);

        if (patientsCounterEl) {
            patientsCounterEl.innerText = String(totalSnap.data().count).padStart(2, '0');
        }
        if (catThreeCounterEl) {
            catThreeCounterEl.innerText = String(cat3Snap.data().count).padStart(2, '0');
        }

    } catch (error) {
        console.error("Server-side metrics aggregation failed:", error);
    }

    // 3. Dynamic Calculation for Today's Scheduled Doses
    const now = new Date();
    const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    const todayISODate = localDate.toISOString().split('T')[0];

    const facilityPatientsQuery = query(collection(db, "patient-database"), where("facilityId", "==", facilityId));
    
    onSnapshot(facilityPatientsQuery, (snapshot) => {
        let scheduledTodayCount = 0;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const pepSchedule = data.pepScheduleDates || {};

            Object.keys(pepSchedule).forEach((dayKey) => {
                if (pepSchedule[dayKey] === todayISODate) {
                    scheduledTodayCount++;
                }
            });
        });

        if (scheduledTodayEl) {
            scheduledTodayEl.innerText = String(scheduledTodayCount).padStart(2, '0');
        }
    });

    // 4. Live Cold-Chain PEP Vials Inventory Aggregation
    const inventoryColRef = collection(db, "facilities", facilityId, "vaccine-inventory");
    
    onSnapshot(inventoryColRef, (snapshot) => {
        let totalVials = 0;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            // Fallback supports vialsLeft, vials, or stock
            const countVal = data.vialsLeft ?? data.vials ?? data.stock ?? 0;
            totalVials += Number(countVal);
        });

        if (pepVialsEl) {
            pepVialsEl.innerText = String(totalVials).padStart(2, '0');
        }
    }, (err) => {
        console.error("Inventory metric listener error:", err);
        if (pepVialsEl) pepVialsEl.innerText = "00";
    });
}

function handleLogoutRedirect() {
    sessionStorage.clear();
    localStorage.removeItem("activeDesignation");
    localStorage.removeItem("activePersonnelName");
    window.location.href = 'abtc-login.html';
}

/* --------------------
    Logout Interceptor
-------------------- */
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (confirm("Are you sure you want to log out?")) {
            try {
                await signOut(auth);
                handleLogoutRedirect();
            } catch (err) {
                console.error("Sign-out failure:", err);
            }
        }
    });
}

/* =====================================================
     CRIS DYNAMIC INTERACTIVE CALENDAR ENGINE (UNTOUCHED)
===================================================== */
let currentDate = new Date();
let selectedDateKey = ""; 
let temporaryModalYear = currentDate.getFullYear();
let modalViewState = "months";

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function renderCalendar() {
    const monthYear = document.getElementById("monthYear");
    const calendarGrid = document.getElementById("calendarGrid");

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

        if (selectedDateKey === dateKeyString) {
            dateCell.classList.add("selected");
        }

        checkAndMarkEvent(dateKeyString, dateCell);

        dateCell.addEventListener("click", async function() {
            document.querySelectorAll(".calendar-date").forEach(d => d.classList.remove("selected"));
            dateCell.classList.add("selected");

            selectedDateKey = dateKeyString;

            const complianceBox = document.querySelector(".compliance-box");
            if (complianceBox) complianceBox.classList.add("active");

            const selectedDateLabel = document.getElementById("selectedDate");
            if (selectedDateLabel) {
                selectedDateLabel.textContent = new Date(year, month, day).toLocaleDateString("en-US", {
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

            if (isPastDate) {
                if (eventInput) {
                    eventInput.placeholder = "🔒 Past date. Viewing announcement in read-only mode.";
                    eventInput.disabled = true;
                }
                if (saveEventBtn) saveEventBtn.disabled = true;
                if (complianceBox) complianceBox.classList.add("past-disabled");
            } else {
                if (eventInput) {
                    eventInput.placeholder = "Type here for announcements and reminders";
                    eventInput.disabled = false;
                }
                if (saveEventBtn) saveEventBtn.disabled = false;
                if (complianceBox) complianceBox.classList.remove("past-disabled");
            }

            if (eventInput) eventInput.value = ""; 

            try {
                const q = query(collection(db, "calendar-events"), where("date", "==", selectedDateKey));
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
                console.error("Error fetching announcement record: ", error);
            }
        });

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

document.addEventListener("DOMContentLoaded", () => {
    const prevBtn = document.getElementById("prevMonth");
    const nextBtn = document.getElementById("nextMonth");
    const calendarTitleContainer = document.getElementById("calendarTitleContainer");
    const calendarModal = document.getElementById("calendarModal");
    const modalYearDisplay = document.getElementById("modalYearDisplay");
    const modalPrevYear = document.getElementById("modalPrevYear");
    const modalNextYear = document.getElementById("modalNextYear");
    const closeModalBtn = document.getElementById("closeModalBtn");
    const saveEventBtn = document.getElementById("saveEventBtn");

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

    if (saveEventBtn) {
        saveEventBtn.addEventListener("click", async function() {
            const eventInput = document.getElementById("eventInput");
            const text = eventInput ? eventInput.value : "";

            if (selectedDateKey === "") {
                alert("Please select a date first.");
                return;
            }

            try {
                const q = query(collection(db, "calendar-events"), where("date", "==", selectedDateKey));
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
                        date: selectedDateKey,
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
    }

    renderCalendar();
});

function renderModalContent() {
    const modalYearDisplay = document.getElementById("modalYearDisplay");
    const modalMonthsGrid = document.getElementById("modalMonthsGrid");

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
    const modalMonthsGrid = document.getElementById("modalMonthsGrid");
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
            
            const calendarModal = document.getElementById("calendarModal");
            if (calendarModal) calendarModal.classList.add("hidden");
        };

        modalMonthsGrid.appendChild(monthBtn);
    });
}

function renderModalYears(startYear) {
    const modalMonthsGrid = document.getElementById("modalMonthsGrid");
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