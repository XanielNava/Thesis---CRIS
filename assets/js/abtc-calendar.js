// abtc-calendar.js - Dynamic Visual PEP Calendar Engine
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { 
    getFirestore, collection, onSnapshot, query, where, doc, getDoc, updateDoc 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

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

let currentDate = new Date();
let activeFacilityId = null;
let allDosesList = [];
let pendingAdministerTarget = null; // Stores target info while confirmation modal is active

// DOM References
const monthYearLabel = document.getElementById("currentMonthYearLabel");
const calendarDaysGrid = document.getElementById("calendarDaysGrid");
const upcomingDoseList = document.getElementById("upcomingDoseList");
const profileContainer = document.getElementById("profileInfoText");
const searchUpcomingInput = document.getElementById("searchUpcomingInput");

// Modal DOM Elements - Day Details
const dayDetailsModal = document.getElementById("dayDetailsModal");
const modalSelectedDateTitle = document.getElementById("modalSelectedDateTitle");
const modalDoseListBody = document.getElementById("modalDoseListBody");
const closeDayModalBtn = document.getElementById("closeDayModalBtn");
const closeDayModalFooterBtn = document.getElementById("closeDayModalFooterBtn");

// Modal DOM Elements - Dose Confirmation
const confirmDoseModal = document.getElementById("confirmDoseModal");
const closeConfirmModalBtn = document.getElementById("closeConfirmModalBtn");
const cancelConfirmModalBtn = document.getElementById("cancelConfirmModalBtn");
const submitConfirmDoseBtn = document.getElementById("submitConfirmDoseBtn");
const confirmPatientName = document.getElementById("confirmPatientName");
const confirmDoseDayLabel = document.getElementById("confirmDoseDayLabel");
const radioFacilityStock = document.getElementById("radioFacilityStock");
const radioPatientPurchased = document.getElementById("radioPatientPurchased");
const pharmacyInputWrap = document.getElementById("pharmacyInputWrap");
const confirmPharmacyName = document.getElementById("confirmPharmacyName");
const btnAcquireVial = document.getElementById("btnAcquireVialTicket");

// ----------------------------------------------------
// 1. Session Observer & Header Branding
// ----------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (user) {
        activeFacilityId = user.uid;
        
        try {
            const userRole = sessionStorage.getItem("activeDesignation") || localStorage.getItem("activeDesignation") || "Nurse";
            const activePersonnel = sessionStorage.getItem("activePersonnelName") || localStorage.getItem("activePersonnelName");

            const facilitySnapshot = await getDoc(doc(db, "facilities", user.uid));
            if (facilitySnapshot.exists()) {
                const facilityData = facilitySnapshot.data();

                let activeStaffMember = activePersonnel || (userRole === "Owner" ? facilityData.contactInfo?.contactPerson : "Attending Personnel");
                const displayRoleLabel = userRole === "Owner" ? "Administrator / Owner" : "Personnel";

                if (profileContainer) {
                    profileContainer.innerHTML = `<strong>${activeStaffMember}</strong><br><span>${displayRoleLabel}</span>`;
                }
            }
        } catch (e) {
            console.error("Calendar session error:", e);
        }

        streamPatientSchedules(user.uid);
    } else {
        window.location.href = "abtc-login.html";
    }
});

// Calculate Dose Dates (Day 0, 3, 7, 14, 28)
function computePepSchedule(day0DateStr) {
    if (!day0DateStr) return [];
    const baseDate = new Date(day0DateStr);
    
    const intervals = [
        { label: "Day 0", offset: 0, class: "badge-day0" },
        { label: "Day 3", offset: 3, class: "badge-day3" },
        { label: "Day 7", offset: 7, class: "badge-day7" },
        { label: "Day 14", offset: 14, class: "badge-day14" },
        { label: "Day 28", offset: 28, class: "badge-day28" }
    ];

    return intervals.map(item => {
        const target = new Date(baseDate);
        target.setDate(target.getDate() + item.offset);
        return {
            doseLabel: item.label,
            badgeClass: item.class,
            targetDateIso: target.toISOString().split("T")[0]
        };
    });
}

// ----------------------------------------------------
// 2. Stream Patient Records from Firestore
// ----------------------------------------------------
function streamPatientSchedules(facilityId) {
    const q = query(collection(db, "patient-database"), where("facilityId", "==", facilityId));

    onSnapshot(q, (snapshot) => {
        allDosesList = [];

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const patientName = data.fullName || data.name || "Unknown Patient";
            const day0Date = data.exposureDate || data.consultDateTime?.split("T")[0];

            if (day0Date) {
                const schedule = computePepSchedule(day0Date);
                const completedDoses = data.completedDoses || [];

                schedule.forEach(dose => {
                    allDosesList.push({
                        patientId: docSnap.id,
                        patientName: patientName,
                        doseLabel: dose.doseLabel,
                        targetDateIso: dose.targetDateIso,
                        badgeClass: dose.badgeClass,
                        isDone: completedDoses.includes(dose.doseLabel)
                    });
                });
            }
        });

        renderCalendarGrid();
        renderUpcomingQueue();
    });
}

// ----------------------------------------------------
// 3. Render Monthly Calendar Grid
// ----------------------------------------------------
function renderCalendarGrid() {
    if (!calendarDaysGrid || !monthYearLabel) return;

    calendarDaysGrid.innerHTML = "";

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthYearLabel.innerText = `${monthNames[month]} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const todayIso = new Date().toISOString().split("T")[0];

    // Render Previous Month's Trailing Days
    for (let i = firstDayIndex; i > 0; i--) {
        const dayNum = prevMonthDays - i + 1;
        const cell = document.createElement("div");
        cell.className = "cal-day-cell other-month";
        cell.innerHTML = `<span class="cell-number">${dayNum}</span>`;
        calendarDaysGrid.appendChild(cell);
    }

    // Render Current Month Days
    for (let day = 1; day <= totalDaysInMonth; day++) {
        const cell = document.createElement("div");
        const monthFormatted = String(month + 1).padStart(2, '0');
        const dayFormatted = String(day).padStart(2, '0');
        const dateIso = `${year}-${monthFormatted}-${dayFormatted}`;

        cell.className = "cal-day-cell";
        if (dateIso === todayIso) cell.classList.add("today-cell");

        let eventsHtml = "";
        const matches = allDosesList.filter(d => d.targetDateIso === dateIso);

        matches.forEach(item => {
            const strikeStyle = item.isDone ? "text-decoration: line-through; opacity: 0.6;" : "";
            eventsHtml += `
                <div class="event-badge ${item.badgeClass}" style="${strikeStyle}" title="${item.patientName} - ${item.doseLabel}">
                    ${item.patientName.split(" ")[0]}: ${item.doseLabel}
                </div>
            `;
        });

        cell.innerHTML = `
            <span class="cell-number">${day}</span>
            <div class="cell-events">${eventsHtml}</div>
        `;

        cell.addEventListener("click", () => {
            openDayDetailsModal(dateIso);
        });

        calendarDaysGrid.appendChild(cell);
    }
}

// ----------------------------------------------------
// 4. Render Left Panel Upcoming List
// ----------------------------------------------------
function renderUpcomingQueue() {
    if (!upcomingDoseList) return;
    upcomingDoseList.innerHTML = "";

    const queryText = searchUpcomingInput ? searchUpcomingInput.value.trim().toLowerCase() : "";
    const todayIso = new Date().toISOString().split("T")[0];

    const upcoming = allDosesList
        .filter(d => d.targetDateIso >= todayIso && !d.isDone)
        .filter(d => d.patientName.toLowerCase().includes(queryText))
        .sort((a, b) => new Date(a.targetDateIso) - new Date(b.targetDateIso))
        .slice(0, 10);

    if (upcoming.length === 0) {
        upcomingDoseList.innerHTML = `
            <div class="upcoming-loading-state">
                ${queryText ? `No doses found for "${queryText}"` : "No pending doses scheduled."}
            </div>
        `;
        return;
    }

    upcoming.forEach(item => {
        const div = document.createElement("div");
        div.className = "upcoming-item";
        div.innerHTML = `
            <span class="patient-name">${item.patientName}</span>
            <div class="dose-tag">
                <span><strong>${item.doseLabel}</strong></span>
                <span>${item.targetDateIso}</span>
            </div>
        `;

        div.addEventListener("click", () => {
            openDayDetailsModal(item.targetDateIso);
        });

        upcomingDoseList.appendChild(div);
    });
}

if (searchUpcomingInput) {
    searchUpcomingInput.addEventListener("input", renderUpcomingQueue);
}

// ----------------------------------------------------
// 5. Day Details Modal Controllers
// ----------------------------------------------------
function closeModal() {
    if (dayDetailsModal) dayDetailsModal.classList.remove("active");
}

if (closeDayModalBtn) closeDayModalBtn.addEventListener("click", closeModal);
if (closeDayModalFooterBtn) closeDayModalFooterBtn.addEventListener("click", closeModal);
if (dayDetailsModal) {
    dayDetailsModal.addEventListener("click", (e) => {
        if (e.target === dayDetailsModal) closeModal();
    });
}

function openDayDetailsModal(dateIso) {
    if (!dayDetailsModal || !modalSelectedDateTitle || !modalDoseListBody) return;

    const [year, month, day] = dateIso.split("-");
    const dateObj = new Date(year, month - 1, day);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    modalSelectedDateTitle.innerText = dateObj.toLocaleDateString("en-US", options);

    const dayMatches = allDosesList.filter(d => d.targetDateIso === dateIso);
    modalDoseListBody.innerHTML = "";

    if (dayMatches.length === 0) {
        modalDoseListBody.innerHTML = `
            <div class="modal-empty-state">
                <i class="fa-regular fa-calendar-xmark"></i>
                <h4 style="margin:0; font-size:16px; color:#495057;">No Scheduled Doses</h4>
                <p style="margin:4px 0 0 0; font-size:13px;">There are no patient vaccination appointments set for this date.</p>
            </div>
        `;
    } else {
        dayMatches.forEach(item => {
            const card = document.createElement("div");
            card.className = `modal-dose-card ${item.isDone ? 'done' : ''}`;
            
            card.innerHTML = `
                <div class="modal-patient-info">
                    <span class="modal-patient-name">${item.patientName}</span>
                    <span class="modal-dose-badge">${item.doseLabel} Target</span>
                </div>
                <div>
                    ${item.isDone ? 
                        `<span style="color:#2b8a3e; font-weight:bold; font-size:13px;"><i class="fa-solid fa-check-circle"></i> Done</span>` : 
                        `<button class="btn-enable btn-mark-administered" data-id="${item.patientId}" data-name="${item.patientName}" data-dose="${item.doseLabel}" style="padding: 5px 10px; font-size:12px;">
                            <i class="fa-solid fa-syringe"></i> Mark Done
                         </button>`
                    }
                </div>
            `;

            card.querySelector(".btn-mark-administered")?.addEventListener("click", (e) => {
                const patientId = e.currentTarget.getAttribute("data-id");
                const patientName = e.currentTarget.getAttribute("data-name");
                const doseLabel = e.currentTarget.getAttribute("data-dose");

                openConfirmDoseModal(patientId, patientName, doseLabel);
            });

            modalDoseListBody.appendChild(card);
        });
    }

    dayDetailsModal.classList.add("active");
}

// ----------------------------------------------------
// 6. Progressive Disclosure & Confirmation Modal Handlers
// ----------------------------------------------------
function togglePharmacyInputState() {
    if (!pharmacyInputWrap || !confirmPharmacyName) return;

    if (radioPatientPurchased && radioPatientPurchased.checked) {
        pharmacyInputWrap.style.opacity = "1";
        pharmacyInputWrap.style.pointerEvents = "auto";
        confirmPharmacyName.disabled = false;
        confirmPharmacyName.focus();
    } else {
        pharmacyInputWrap.style.opacity = "0.4";
        pharmacyInputWrap.style.pointerEvents = "none";
        confirmPharmacyName.disabled = true;
        confirmPharmacyName.value = "";
    }
}

if (radioFacilityStock) radioFacilityStock.addEventListener("change", togglePharmacyInputState);
if (radioPatientPurchased) radioPatientPurchased.addEventListener("change", togglePharmacyInputState);

function openConfirmDoseModal(patientId, patientName, doseLabel) {
    closeModal(); // Close schedule roster modal first to prevent stacking

    // Explicitly set the target object to the exact patient selected
    pendingAdministerTarget = { patientId, patientName, doseLabel };

    if (confirmPatientName) confirmPatientName.innerText = patientName;
    if (confirmDoseDayLabel) confirmDoseDayLabel.innerText = doseLabel;

    if (radioFacilityStock) radioFacilityStock.checked = true;
    if (radioPatientPurchased) radioPatientPurchased.checked = false;
    if (confirmPharmacyName) confirmPharmacyName.value = "";
    
    togglePharmacyInputState();

    if (confirmDoseModal) confirmDoseModal.classList.add("active");
}

function closeConfirmDoseModal() {
    if (confirmDoseModal) confirmDoseModal.classList.remove("active");
    pendingAdministerTarget = null;
}

if (closeConfirmModalBtn) closeConfirmModalBtn.addEventListener("click", closeConfirmDoseModal);
if (cancelConfirmModalBtn) cancelConfirmModalBtn.addEventListener("click", closeConfirmDoseModal);

// Shortcut Button: Acquire Vial Ticket (Sends request to inventory/pharmacy)
if (btnAcquireVial) {
    btnAcquireVial.addEventListener("click", (e) => {
        e.preventDefault();
        if (!pendingAdministerTarget) return;

        const { patientName, doseLabel } = pendingAdministerTarget;

        sessionStorage.setItem("autoOpenRequisition", "true");
        sessionStorage.setItem("reqTargetPatient", patientName);
        sessionStorage.setItem("reqRemarks", `Requisition for ${patientName} (${doseLabel}) dose administration`);

        window.location.href = "abtc-inventory.html";
    });
}

// Execute Dose Administration Logging (Without auto-deducting inventory stock)
if (submitConfirmDoseBtn) {
    submitConfirmDoseBtn.addEventListener("click", async () => {
        if (!pendingAdministerTarget) return;

        const { patientId, patientName, doseLabel } = pendingAdministerTarget;
        const isPatientPurchased = radioPatientPurchased && radioPatientPurchased.checked;
        const pharmacyName = confirmPharmacyName ? confirmPharmacyName.value.trim() : "";

        try {
            const patientDocRef = doc(db, "patient-database", patientId);
            const patientSnap = await getDoc(patientDocRef);

            if (patientSnap.exists()) {
                const patientData = patientSnap.data();
                const completed = patientData.completedDoses || [];
                const history = patientData.historyLogs || [];

                const activeStaff = sessionStorage.getItem("activePersonnelName") 
                    || localStorage.getItem("activePersonnelName") 
                    || "Duty Personnel";

                const sourceLabel = isPatientPurchased 
                    ? `Patient-Purchased${pharmacyName ? ' (' + pharmacyName + ')' : ''}`
                    : "Facility Stock";

                completed.push(doseLabel);
                history.push({
                    action: "Dose Administered",
                    timestamp: new Date().toISOString(),
                    personnel: activeStaff,
                    details: `${doseLabel} administered using ${sourceLabel}.`
                });

                await updateDoc(patientDocRef, {
                    completedDoses: completed,
                    historyLogs: history
                });

                alert(`Success: ${doseLabel} for ${patientName} logged via ${sourceLabel}!`);
                closeConfirmDoseModal();
            }
        } catch (err) {
            console.error("Administration logging error:", err);
            alert("Failed to administer dose: " + err.message);
        }
    });
}

// ----------------------------------------------------
// 7. Navigation Controls & Logout
// ----------------------------------------------------
document.getElementById("prevMonthBtn")?.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendarGrid();
});

document.getElementById("nextMonthBtn")?.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendarGrid();
});

document.getElementById("todayMonthBtn")?.addEventListener("click", () => {
    currentDate = new Date();
    renderCalendarGrid();
});

document.getElementById("logout-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (confirm("Are you sure you want to exit your profile session on this tab?")) {
        sessionStorage.removeItem("activeDesignation");
        sessionStorage.removeItem("activePersonnelName");
        window.location.href = 'abtc-profiles.html';
    }
});