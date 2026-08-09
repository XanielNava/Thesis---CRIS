// abtc-home.js - ABTC Home Dashboard Controller (Fully Optimized)

// 1. Import required Auth & Firestore functions from CDN
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { 
    collection, doc, getDoc, onSnapshot, query, where, getCountFromServer 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// 2. Import shared central instances (Managed by firebase-config.js switch)
import { auth, db } from './firebase-config.js';

const facilityTitleDisplay = document.getElementById('facilityTitleDisplay');
const profileInfoText = document.getElementById('profileInfoText');
const totalPatientsCount = document.getElementById('totalPatientsCount');
const dosesTodayCount = document.getElementById('dosesTodayCount');
const categoryThreeCount = document.getElementById('categoryThreeCount');
const vialStockCount = document.getElementById('vialStockCount');
const todayDateBadge = document.getElementById('todayDateBadge');
const todayScheduleTableBody = document.getElementById('todayScheduleTableBody');
const logoutBtn = document.getElementById('logout-btn');

let currentFacilityId = null;

// Compute timezone-safe local YYYY-MM-DD
const now = new Date();
const formattedToday = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
const todayISODate = localDate.toISOString().split('T')[0];

if (todayDateBadge) todayDateBadge.textContent = formattedToday;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentFacilityId = user.uid;

        const activeName = sessionStorage.getItem("activePersonnelName") || "Duty Personnel";
        const activeRole = sessionStorage.getItem("activeDesignation") || "Duty Personnel";
        if (profileInfoText) profileInfoText.innerHTML = `<strong>${activeName}</strong><br><span>${activeRole}</span>`;

        const cachedFacilityName = sessionStorage.getItem("cachedFacilityName");
        if (cachedFacilityName && facilityTitleDisplay) {
            facilityTitleDisplay.textContent = cachedFacilityName;
        } else {
            try {
                const facilitySnap = await getDoc(doc(db, "facilities", currentFacilityId));
                if (facilitySnap.exists()) {
                    const facName = facilitySnap.data().facilityName || facilitySnap.data().name || "WESTERN VISAYAS MEDICAL CENTER ABTC";
                    sessionStorage.setItem("cachedFacilityName", facName);
                    if (facilityTitleDisplay) facilityTitleDisplay.textContent = facName;
                }
            } catch (err) {
                console.error("Facility fetch error:", err);
            }
        }

        loadAggregatedMetrics(currentFacilityId);
        attachTodayQueueListener(currentFacilityId);

    } else {
        window.location.href = "abtc-login.html";
    }
});

// Server-side Aggregations (1 Read per count query)
async function loadAggregatedMetrics(facilityId) {
    try {
        const rootPatientsCol = collection(db, "patient-database");
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
    const patientsQuery = query(collection(db, "patient-database"), where("facilityId", "==", facilityId));
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
                        const cleanTarget = dayKey.toLowerCase();
                        return cleanDone === cleanTarget;
                    });

                    todayDosesList.push({
                        docId: docSnap.id,
                        itrNo: data.caseId || data.recordNo || docSnap.id.substring(0, 6).toUpperCase(),
                        patientName: data.fullName || data.name || "Unknown Patient",
                        targetDoseLabel: cleanDoseLabel,
                        contactNo: data.contactNo || "N/A",
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

if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (confirm("Are you sure you want to switch personnel profiles?")) {
            sessionStorage.removeItem("activeDesignation");
            sessionStorage.removeItem("activePersonnelName");
            window.location.href = "abtc-profiles.html";
        }
    });
}