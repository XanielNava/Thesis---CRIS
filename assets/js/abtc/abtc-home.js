// abtc-home.js - ABTC Home Dashboard Controller (Conformed to 'patients')

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    updateDoc, 
    addDoc, 
    onSnapshot, 
    query, 
    where, 
    getCountFromServer 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

import { auth, db } from '../firebase/firebase-config.js';

const facilityTitleDisplay = document.getElementById('facilityTitleDisplay');
const profileInfoText = document.getElementById('profileInfoText');
const totalPatientsCount = document.getElementById('totalPatientsCount');
const dosesTodayCount = document.getElementById('dosesTodayCount');
const categoryThreeCount = document.getElementById('categoryThreeCount');
const vialStockCount = document.getElementById('vialStockCount');
const todayDateBadge = document.getElementById('todayDateBadge');
const todayScheduleTableBody = document.getElementById('todayScheduleTableBody');
const changePinBtn = document.getElementById('changePinBtn');

let currentFacilityId = sessionStorage.getItem("activeFacilityId") || null;

const now = new Date();
const formattedToday = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
const todayISODate = localDate.toISOString().split('T')[0];

if (todayDateBadge) todayDateBadge.textContent = formattedToday;

async function initDashboard() {
    const activeName = sessionStorage.getItem("activePersonnelName") || "Duty Personnel";
    const activeRole = sessionStorage.getItem("activeDesignation") || "Nurse";
    
    if (profileInfoText) {
        profileInfoText.innerHTML = `<strong>${activeName}</strong><br><span>${activeRole}</span>`;
    }

    // Show "Change PIN" for duty staff personnel (Nurse, Staff, Pharmacist, etc.)
    const isOwnerOrAdmin = activeRole.toLowerCase().includes("owner") || 
                           (activeRole.toLowerCase() === "admin" && !sessionStorage.getItem("activeStaffUid"));

    if (changePinBtn) {
        if (isOwnerOrAdmin) {
            changePinBtn.style.display = "none";
        } else {
            changePinBtn.style.display = "inline-flex";
        }
    }

    await resolveFacilityBranding();

    if (currentFacilityId) {
        loadAggregatedMetrics(currentFacilityId);
        attachTodayQueueListener(currentFacilityId);
    }
}

async function resolveFacilityBranding() {
    let cachedFacilityName = sessionStorage.getItem("activeFacilityName");
    let cachedAcronym = sessionStorage.getItem("activeFacilityAcronym");

    if (cachedFacilityName && facilityTitleDisplay) {
        facilityTitleDisplay.textContent = cachedAcronym 
            ? `${cachedFacilityName} (${cachedAcronym.toUpperCase()})` 
            : cachedFacilityName;
        return;
    }

    if (!currentFacilityId || !db) {
        if (facilityTitleDisplay) facilityTitleDisplay.textContent = "Animal Bite Treatment Center (ABTC)";
        return;
    }

    try {
        const facilitySnap = await getDoc(doc(db, "facilities", currentFacilityId));
        if (facilitySnap.exists()) {
            const facData = facilitySnap.data();
            const facName = facData.facilityName || facData.name || "Animal Bite Treatment Center";
            const acronym = facData.acronym || facData.code || "ABTC";

            sessionStorage.setItem("activeFacilityName", facName);
            sessionStorage.setItem("activeFacilityAcronym", acronym);

            if (facilityTitleDisplay) {
                facilityTitleDisplay.textContent = `${facName} (${acronym.toUpperCase()})`;
            }
        } else {
            if (facilityTitleDisplay) facilityTitleDisplay.textContent = "Animal Bite Treatment Center (ABTC)";
        }
    } catch (err) {
        console.error("Facility branding fetch error:", err);
        if (facilityTitleDisplay) facilityTitleDisplay.textContent = "Animal Bite Treatment Center (ABTC)";
    }
}

if (auth) {
    onAuthStateChanged(auth, async (user) => {
        if (user && !currentFacilityId) {
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists() && userDoc.data().facilityId) {
                    currentFacilityId = userDoc.data().facilityId;
                    sessionStorage.setItem("activeFacilityId", currentFacilityId);
                } else {
                    currentFacilityId = user.uid;
                }
            } catch (e) {
                currentFacilityId = user.uid;
            }
            initDashboard();
        }
    });
}

initDashboard();

async function loadAggregatedMetrics(facilityId) {
    try {
        const rootPatientsCol = collection(db, "patients");
        const facilityQuery = query(rootPatientsCol, where("facilityId", "==", facilityId));

        const totalSnap = await getCountFromServer(facilityQuery);
        if (totalPatientsCount) totalPatientsCount.textContent = totalSnap.data().count;

        const cat3Query = query(rootPatientsCol, where("facilityId", "==", facilityId), where("classification", "==", "Category III"));
        const cat3Snap = await getCountFromServer(cat3Query);
        if (categoryThreeCount) categoryThreeCount.textContent = cat3Snap.data().count;

    } catch (err) {
        console.error("Metric aggregation error:", err);
    }
}

function attachTodayQueueListener(facilityId) {
    const patientsQuery = query(collection(db, "patients"), where("facilityId", "==", facilityId));
    const inventoryColRef = collection(db, "facilities", facilityId, "vaccine-inventory");

    onSnapshot(patientsQuery, (snapshot) => {
        let todayDosesList = [];

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const pepSchedule = data.pepScheduleDates || {};
            const completedDoses = Array.isArray(data.completedDoses) ? data.completedDoses : [];

            Object.keys(pepSchedule).forEach((dayKey) => {
                if (pepSchedule[dayKey] === todayISODate) {
                    const dayNum = dayKey.replace(/\D/g, ''); 
                    const cleanDoseLabel = `Day ${dayNum}`;

                    const isDone = completedDoses.some(done => {
                        const cleanDone = String(done).replace(/\s+/g, '').toLowerCase();
                        const cleanTarget = cleanDoseLabel.replace(/\s+/g, '').toLowerCase();
                        return cleanDone === cleanTarget || cleanDone === dayKey.toLowerCase();
                    });

                    todayDosesList.push({
                        docId: docSnap.id,
                        itrNo: data.caseId || data.recordNo || docSnap.id.substring(0, 6).toUpperCase(),
                        patientName: data.fullName || data.name || "Unknown Patient",
                        targetDoseLabel: cleanDoseLabel,
                        contactNo: data.contactNo || data.mobileNumber || "N/A",
                        status: isDone ? "Completed" : "Pending"
                    });
                }
            });
        });

        if (dosesTodayCount) dosesTodayCount.textContent = todayDosesList.length;
        renderTodayScheduleTable(todayDosesList);
    });

    onSnapshot(inventoryColRef, (snapshot) => {
        let totalVials = 0;
        snapshot.forEach((docSnap) => {
            totalVials += Number(docSnap.data().vialsLeft || 0);
        });
        if (vialStockCount) vialStockCount.textContent = totalVials;
    });
}

function renderTodayScheduleTable(dosesList) {
    if (!todayScheduleTableBody) return;

    if (dosesList.length === 0) {
        todayScheduleTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">
                    <i class="fa-solid fa-circle-check" style="color: var(--success); margin-right: 6px;"></i>
                    No patients scheduled for follow-up PEP doses today.
                </td>
            </tr>`;
        return;
    }

    let rowsHtml = '';
    dosesList.forEach((item) => {
        const isCompleted = item.status === 'Completed';
        rowsHtml += `
            <tr>
                <td><strong>${item.itrNo}</strong></td>
                <td>${item.patientName}</td>
                <td><span class="dose-tag">${item.targetDoseLabel}</span></td>
                <td>${item.contactNo}</td>
                <td><span class="status-badge ${isCompleted ? 'completed' : 'pending'}">${item.status}</span></td>
                <td>${isCompleted 
                    ? `<button class="btn-sm secondary" disabled>Completed</button>` 
                    : `<button class="btn-sm primary btn-administer-now" data-id="${item.docId}">Administer</button>`}
                </td>
            </tr>`;
    });

    todayScheduleTableBody.innerHTML = rowsHtml;

    document.querySelectorAll('.btn-administer-now').forEach(btn => {
        btn.addEventListener('click', () => {
            window.location.href = `abtc-calendar.html?patientId=${btn.getAttribute('data-id')}`;
        });
    });
}

/* ==========================================================
   CHANGE PIN MODAL & UNIFIED SHOW PIN CONTROLLER
   ========================================================== */
const changePinModal = document.getElementById('changePinModal');
const closePinModalBtn = document.getElementById('closePinModalBtn');
const cancelPinBtn = document.getElementById('cancelPinBtn');
const changePinForm = document.getElementById('changePinForm');
const showPinsCheckbox = document.getElementById('showPinsCheckbox');

// Toggle all 3 PIN input fields together
function toggleAllPinVisibility(shouldShow) {
    const pinInputs = document.querySelectorAll('.pin-field');
    pinInputs.forEach(input => {
        input.type = shouldShow ? 'text' : 'password';
    });
}

if (showPinsCheckbox) {
    showPinsCheckbox.addEventListener('change', (e) => {
        toggleAllPinVisibility(e.target.checked);
    });
}

// Reset modal form and mask fields
function resetPinModalState() {
    if (changePinForm) changePinForm.reset();
    if (showPinsCheckbox) showPinsCheckbox.checked = false;
    toggleAllPinVisibility(false);
}

if (changePinBtn && changePinModal) {
    changePinBtn.addEventListener('click', () => {
        resetPinModalState();
        changePinModal.classList.add('open', 'active');
        const firstInput = document.getElementById('currentPinInput');
        if (firstInput) firstInput.focus();
    });
}

function closePinModal() {
    if (changePinModal) {
        changePinModal.classList.remove('open', 'active');
        resetPinModalState();
    }
}

if (closePinModalBtn) closePinModalBtn.addEventListener('click', closePinModal);
if (cancelPinBtn) cancelPinBtn.addEventListener('click', closePinModal);

if (changePinForm) {
    changePinForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const currentPinVal = document.getElementById('currentPinInput').value.trim();
        const newPinVal = document.getElementById('newPinInput').value.trim();
        const confirmPinVal = document.getElementById('confirmPinInput').value.trim();

        if (newPinVal.length !== 4 || isNaN(newPinVal)) {
            return alert("New PIN must be exactly 4 numeric digits.");
        }

        if (newPinVal !== confirmPinVal) {
            return alert("New PIN and Confirm PIN do not match.");
        }

        const savePinBtn = document.getElementById('savePinBtn');
        savePinBtn.disabled = true;
        savePinBtn.textContent = "Updating...";

        try {
            let staffDocId = sessionStorage.getItem("activeStaffUid") || sessionStorage.getItem("activeStaffId");

            if (!staffDocId) {
                const staffQuery = query(
                    collection(db, "facilities", currentFacilityId, "staff"),
                    where("name", "==", sessionStorage.getItem("activePersonnelName") || "")
                );
                const querySnap = await getDocs(staffQuery);
                if (!querySnap.empty) {
                    staffDocId = querySnap.docs[0].id;
                    sessionStorage.setItem("activeStaffUid", staffDocId);
                }
            }

            if (!staffDocId) {
                throw new Error("Unable to identify your staff record. Please try logging in again with your badge.");
            }

            const staffRef = doc(db, "facilities", currentFacilityId, "staff", staffDocId);
            const staffSnap = await getDoc(staffRef);

            if (!staffSnap.exists()) {
                throw new Error("Staff record was not found in database.");
            }

            const staffData = staffSnap.data();
            if (String(staffData.pin) !== String(currentPinVal)) {
                savePinBtn.disabled = false;
                savePinBtn.textContent = "Update PIN";
                return alert("Current PIN is incorrect.");
            }

            await updateDoc(staffRef, {
                pin: newPinVal,
                pinUpdatedAt: new Date().toISOString()
            });

            await addDoc(collection(db, "facilities", currentFacilityId, "activity_logs"), {
                facilityId: currentFacilityId,
                personnelName: staffData.name || "Duty Personnel",
                role: staffData.position || "Nurse",
                action: "Updated Security PIN",
                timestamp: new Date().toISOString()
            });

            alert("Security PIN successfully updated!");
            closePinModal();
        } catch (error) {
            console.error("PIN update error:", error);
            alert("Failed to update PIN: " + error.message);
        } finally {
            savePinBtn.disabled = false;
            savePinBtn.textContent = "Update PIN";
        }
    });
}