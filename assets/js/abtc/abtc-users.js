// ==========================================================================
// ABTC USERS MODULE - PERSONNEL ROSTER & QR BADGE CONTROLLER (abtc-users.js)
// Conformed to CRIS Master Architecture with Scoped Facility Activity Logs
// ==========================================================================

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { 
    doc, getDoc, setDoc, collection, addDoc, updateDoc, deleteDoc, query, onSnapshot, serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

import { auth, db } from '../firebase/firebase-config.js';

let currentFacilityId = sessionStorage.getItem("activeFacilityId") || "fac_default";
let currentFacilityName = sessionStorage.getItem("activeFacilityName") || "Animal Bite Treatment Center";
let currentFacilityAcronym = sessionStorage.getItem("activeFacilityAcronym") || "ABTC";

// Initialize View & Metadata
async function initWorkspace() {
    if (db && currentFacilityId !== "fac_default") {
        try {
            const facSnap = await getDoc(doc(db, "facilities", currentFacilityId));
            if (facSnap.exists()) {
                const facData = facSnap.data();
                currentFacilityName = facData.facilityName || currentFacilityName;
                currentFacilityAcronym = facData.acronym || facData.code || currentFacilityAcronym;

                sessionStorage.setItem("activeFacilityName", currentFacilityName);
                sessionStorage.setItem("activeFacilityAcronym", currentFacilityAcronym);
            }
        } catch (e) {
            console.warn("Facility metadata lookup fallback:", e);
        }
    }

    startLiveStaffRosterStream(currentFacilityId);
    startLiveActivityLogsStream(currentFacilityId);
}

// Track active session fallback
if (auth) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (!currentFacilityId || currentFacilityId === "fac_default") {
                try {
                    const uSnap = await getDoc(doc(db, "users", user.uid));
                    if (uSnap.exists() && uSnap.data().facilityId) {
                        currentFacilityId = uSnap.data().facilityId;
                    } else {
                        currentFacilityId = user.uid;
                    }
                } catch (err) {
                    currentFacilityId = user.uid;
                }
                sessionStorage.setItem("activeFacilityId", currentFacilityId);
                initWorkspace();
            }
        }
    });
}

initWorkspace();

// Helper: Dynamic Badge Markup
function getRoleBadgeMarkup(role) {
    if (!role) return `<span class="badge-nurse">Nurse</span>`;
    const lower = role.toLowerCase();
    
    if (lower.includes("owner") || lower.includes("admin")) {
        return `<span class="badge-owner">Owner</span>`;
    }
    if (lower.includes("pharmacist")) {
        return `<span class="badge-pharmacist">Pharmacist</span>`;
    }
    if (lower.includes("physician") || lower.includes("doctor")) {
        return `<span class="badge-doctor">Physician</span>`;
    }
    return `<span class="badge-nurse">${role}</span>`;
}

// Helper: Status Pill Markup
function getStatusPillMarkup(status) {
    const isDeactivated = (status || "").toLowerCase() === "deactivated";
    if (isDeactivated) {
        return `<span class="status-pill status-deactivated"><i class="fa-solid fa-ban"></i> Deactivated</span>`;
    }
    return `<span class="status-pill status-active"><i class="fa-solid fa-circle-check"></i> Active</span>`;
}

// ==========================================================
// BADGE QR GENERATOR MODAL CONTROLLER
// ==========================================================
const badgeModal = document.getElementById("badgeModal");
const closeBadgeModalBtn = document.getElementById("closeBadgeModalBtn");
const printBadgeBtn = document.getElementById("printBadgeBtn");
const qrContainer = document.getElementById("badgeQrCodeContainer");

function openBadgeModal(staffId, staffName, staffRole, staffStatus) {
    if (!badgeModal || !qrContainer) return;

    if ((staffStatus || "").toLowerCase() === "deactivated") {
        alert("Cannot issue badge: This staff profile is currently Deactivated. Please activate the profile first.");
        return;
    }

    document.getElementById("badgeStaffName").textContent = staffName;
    document.getElementById("badgeStaffRole").textContent = staffRole;
    document.getElementById("badgeFacilityName").textContent = currentFacilityName;

    qrContainer.innerHTML = "";

    // ENCODED BADGE PAYLOAD: Includes explicit facilityId and facilityName
    const payload = JSON.stringify({
        uid: staffId,
        facilityId: currentFacilityId,
        facilityName: currentFacilityName,
        acronym: currentFacilityAcronym,
        type: "CRIS_STAFF_ID"
    });

    new QRCode(qrContainer, {
        text: payload,
        width: 140,
        height: 140,
        colorDark: "#111827",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
    });

    badgeModal.classList.add("active");
}

if (closeBadgeModalBtn && badgeModal) {
    closeBadgeModalBtn.addEventListener("click", () => {
        badgeModal.classList.remove("active");
    });
}

if (printBadgeBtn) {
    printBadgeBtn.addEventListener("click", () => {
        window.print();
    });
}

// ==========================================================
// PIPELINE 1: ENROLL NEW STAFF (STAMPED WITH FACILITY ID)
// ==========================================================
const addPersonnelBtn = document.getElementById("addPersonnelBtn");
if (addPersonnelBtn) {
    addPersonnelBtn.addEventListener("click", async () => {
        const nameInput = document.getElementById("fullName");
        const emailInput = document.getElementById("personnelEmail");
        const positionInput = document.getElementById("position");
        const pinInput = document.getElementById("personnelPin");

        const name = nameInput.value.trim();
        const email = emailInput.value.trim().toLowerCase();
        const position = positionInput.value.trim();
        const pin = pinInput.value.trim();

        if (!name || !email || !position || !pin) {
            alert("Please completely fill out all staff fields, including the 4-digit security PIN.");
            return;
        }

        if (pin.length !== 4 || isNaN(pin)) {
            alert("Security PIN must be exactly a 4-digit numeric sequence.");
            return;
        }

        addPersonnelBtn.disabled = true;
        addPersonnelBtn.textContent = "Enrolling...";

        try {
            const staffSubcollectionRef = collection(db, "facilities", currentFacilityId, "staff");
            
            const staffPayload = {
                facilityId: currentFacilityId,
                facilityName: currentFacilityName,
                name: name,
                fullName: name,
                email: email,
                position: position,
                designation: position,
                pin: pin,
                status: "Active",
                createdAt: new Date().toISOString()
            };

            const newDocRef = await addDoc(staffSubcollectionRef, staffPayload);
            const staffUid = newDocRef.id;

            // Mirror staff identity into master users collection
            try {
                await setDoc(doc(db, "users", staffUid), {
                    uid: staffUid,
                    fullName: name,
                    email: email,
                    position: position,
                    designation: position,
                    facilityId: currentFacilityId,
                    facilityName: currentFacilityName,
                    globalRole: "staff",
                    status: "Active",
                    createdAt: serverTimestamp()
                }, { merge: true });
            } catch (uErr) {
                console.warn("Global users mirror bypassed:", uErr);
            }

            // Write internal facility activity log (Keeps PHO central audit log clean)
            await addDoc(collection(db, "facilities", currentFacilityId, "activity_logs"), {
                facilityId: currentFacilityId,
                facilityName: currentFacilityName,
                personnelName: sessionStorage.getItem("activePersonnelName") || "Administrator",
                role: "Admin",
                action: `Enrolled Staff: ${name} (${position})`,
                timestamp: new Date().toISOString()
            });

            // Automatically display printable ID badge
            openBadgeModal(staffUid, name, position, "Active");

            // Reset inputs
            nameInput.value = ""; 
            emailInput.value = ""; 
            positionInput.value = ""; 
            pinInput.value = "";
        } catch (error) {
            console.error("Failed to append staff record:", error);
            alert("Database write error: " + error.message);
        } finally {
            addPersonnelBtn.disabled = false;
            addPersonnelBtn.textContent = "Save Personnel Record";
        }
    });
}

// ==========================================================
// PIPELINE 2: LIVE STREAM ROSTER DATA TO DOM TABLE
// ==========================================================
function startLiveStaffRosterStream(facilityId) {
    const staffTableBody = document.getElementById("personnelTableBody");
    if (!staffTableBody) return;

    const staffQuery = collection(db, "facilities", facilityId, "staff");

    onSnapshot(staffQuery, (snapshot) => {
        staffTableBody.innerHTML = ""; 
        
        if (snapshot.empty) {
            staffTableBody.innerHTML = `<tr><td colspan="5" class="text-center table-empty-notice">No active staff records mapped to this clinic yet.</td></tr>`;
            return;
        }

        snapshot.forEach((staffDoc) => {
            const staff = staffDoc.data();
            const staffStatus = staff.status || "Active";
            const isDeactivated = staffStatus.toLowerCase() === "deactivated";

            const row = document.createElement("tr");

            // Cohesive, unified action buttons
            row.innerHTML = `
                <td><strong>${staff.name || staff.fullName}</strong></td>
                <td>${getRoleBadgeMarkup(staff.position || staff.designation)}</td>
                <td>${staff.email || "No email"}</td>
                <td>${getStatusPillMarkup(staffStatus)}</td>
                <td class="roster-action-cell" style="display: flex; gap: 8px; align-items: center;">
                    <button type="button" class="btn-badge-action" data-id="${staffDoc.id}" data-name="${staff.name || staff.fullName}" data-role="${staff.position || staff.designation}" data-status="${staffStatus}">
                        <i class="fa-solid fa-qrcode"></i> Badge
                    </button>
                    <button type="button" class="btn-toggle-status ${isDeactivated ? 'activate' : 'deactivate'}" data-id="${staffDoc.id}" data-status="${staffStatus}" data-name="${staff.name || staff.fullName}">
                        <i class="fa-solid ${isDeactivated ? 'fa-check' : 'fa-user-slash'}"></i> ${isDeactivated ? 'Activate' : 'Deactivate'}
                    </button>
                    <button type="button" class="btn-delete btn-delete-inline" data-id="${staffDoc.id}" data-name="${staff.name || staff.fullName}">
                        <i class="fa-solid fa-trash-can"></i> Remove
                    </button>
                </td>
            `;

            // Badge preview handler
            row.querySelector(".btn-badge-action")?.addEventListener("click", (e) => {
                const btn = e.currentTarget;
                openBadgeModal(
                    btn.getAttribute("data-id"),
                    btn.getAttribute("data-name"),
                    btn.getAttribute("data-role"),
                    btn.getAttribute("data-status")
                );
            });

            // Status toggle handler
            row.querySelector(".btn-toggle-status")?.addEventListener("click", async (e) => {
                const btn = e.currentTarget;
                const targetId = btn.getAttribute("data-id");
                const currentStat = btn.getAttribute("data-status") || "Active";
                const staffName = btn.getAttribute("data-name");
                const newStatus = currentStat.toLowerCase() === "active" ? "Deactivated" : "Active";

                if (confirm(`Change status of ${staffName} to ${newStatus}?`)) {
                    try {
                        const targetRef = doc(db, "facilities", facilityId, "staff", targetId);
                        await updateDoc(targetRef, { status: newStatus });

                        try {
                            await updateDoc(doc(db, "users", targetId), { status: newStatus });
                        } catch (uErr) { /* soft sync */ }

                        // Write to internal facility log
                        await addDoc(collection(db, "facilities", facilityId, "activity_logs"), {
                            facilityId: facilityId,
                            facilityName: currentFacilityName,
                            personnelName: sessionStorage.getItem("activePersonnelName") || "Administrator",
                            role: "Admin",
                            action: `Updated Staff Status: ${staffName} -> ${newStatus}`,
                            timestamp: new Date().toISOString()
                        });
                    } catch (err) {
                        console.error("Status update error:", err);
                        alert("Could not update staff status: " + err.message);
                    }
                }
            });

            // Removal handler
            row.querySelector(".btn-delete")?.addEventListener("click", async (e) => {
                const targetDocId = e.currentTarget.getAttribute("data-id");
                const staffName = e.currentTarget.getAttribute("data-name");

                if (confirm(`Permanently remove ${staffName} from this facility roster?`)) {
                    try {
                        await deleteDoc(doc(db, "facilities", facilityId, "staff", targetDocId));

                        try {
                            await deleteDoc(doc(db, "users", targetDocId));
                        } catch (uErr) { /* soft sync */ }

                        // Write to internal facility log
                        await addDoc(collection(db, "facilities", facilityId, "activity_logs"), {
                            facilityId: facilityId,
                            facilityName: currentFacilityName,
                            personnelName: sessionStorage.getItem("activePersonnelName") || "Administrator",
                            role: "Admin",
                            action: `Removed Staff Member: ${staffName}`,
                            timestamp: new Date().toISOString()
                        });
                    } catch (err) {
                        console.error("Staff removal failure:", err);
                    }
                }
            });

            staffTableBody.appendChild(row);
        });
    });
}

// ==========================================================
// PIPELINE 3: LIVE STREAM FACILITY INTERNAL ACTIVITY LOGS
// ==========================================================
function startLiveActivityLogsStream(facilityId) {
    const auditTableBody = document.getElementById("auditLogTableBody");
    if (!auditTableBody) return;
    
    // Listen to the local facility subcollection
    const auditQuery = collection(db, "facilities", facilityId, "activity_logs");

    onSnapshot(auditQuery, (snapshot) => {
        auditTableBody.innerHTML = "";

        if (snapshot.empty) {
            auditTableBody.innerHTML = `<tr><td colspan="5" class="text-center table-empty-notice">No internal activity logs recorded yet.</td></tr>`;
            return;
        }

        const logsArray = [];
        snapshot.forEach((logDoc) => {
            logsArray.push({ id: logDoc.id, ...logDoc.data() });
        });

        logsArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        logsArray.forEach((log) => {
            const row = document.createElement("tr");
            const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString() : "N/A";

            row.innerHTML = `
                <td class="log-timestamp">${dateStr}</td>
                <td><strong>${log.personnelName || "Staff Member"}</strong></td>
                <td>${getRoleBadgeMarkup(log.role)}</td>
                <td>${log.action || "Duty Sign-In"}</td>
                <td><span class="verified-pass-text">✓ Internal Record</span></td>
            `;

            auditTableBody.appendChild(row);
        });
    }, (error) => {
        console.error("Activity log stream failed:", error);
        auditTableBody.innerHTML = `<tr><td colspan="5" class="stream-error-notice">Unable to load internal activity logs.</td></tr>`;
    });
}