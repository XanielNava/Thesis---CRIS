// abtc-users.js - Dedicated Administration, ID Badge QR Generation, Status Safeguards, and Auditing Handler
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { 
    doc, getDoc, collection, addDoc, updateDoc, deleteDoc, query, where, onSnapshot 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

import { auth, db } from '../firebase/firebase-config.js';

let currentFacilityId = sessionStorage.getItem("activeFacilityId") || "fac_default";
let currentFacilityName = sessionStorage.getItem("activeFacilityName") || "Animal Bite Treatment Center";

// Initialize View & Streams
async function initWorkspace() {
    if (db && currentFacilityId !== "fac_default") {
        try {
            const facSnap = await getDoc(doc(db, "facilities", currentFacilityId));
            if (facSnap.exists()) {
                currentFacilityName = facSnap.data().facilityName || currentFacilityName;
            }
        } catch (e) {
            console.warn("Facility metadata soft fetch:", e);
        }
    }

    startLiveStaffRosterStream(currentFacilityId);
    startLiveAuditLogsStream(currentFacilityId);
}

// Track active session
if (auth) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (!currentFacilityId || currentFacilityId === "fac_default") {
                currentFacilityId = user.uid;
            }
        }
    });
}

initWorkspace();

// Helper: Dynamic Badge Resolver
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

// Helper: Status Pill Resolver
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

    const payload = JSON.stringify({
        uid: staffId,
        facilityId: currentFacilityId,
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
// PIPELINE 1: WRITE NEW PERSONNEL RECORDS
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
            alert("Please completely fill out all the staff parameter inputs, including the security PIN.");
            return;
        }

        if (pin.length !== 4 || isNaN(pin)) {
            alert("Security PIN must be exactly a 4-digit numeric sequence.");
            return;
        }

        try {
            const staffSubcollectionRef = collection(db, "facilities", currentFacilityId, "staff");
            const newDocRef = await addDoc(staffSubcollectionRef, {
                name: name,
                email: email,
                position: position,
                pin: pin,
                status: "Active", // Default operational status
                createdAt: new Date().toISOString()
            });

            // Write audit trail
            await addDoc(collection(db, "audit_logs"), {
                facilityId: currentFacilityId,
                personnelName: sessionStorage.getItem("activePersonnelName") || "Administrator",
                role: "Admin",
                action: `Enrolled New Staff: ${name} (${position})`,
                timestamp: new Date().toISOString()
            });

            // Automatically open printable ID badge
            openBadgeModal(newDocRef.id, name, position, "Active");

            // Reset inputs
            nameInput.value = ""; 
            emailInput.value = ""; 
            positionInput.value = ""; 
            pinInput.value = "";
        } catch (error) {
            console.error("Failed to append staff record:", error);
            alert("Database write error: Unable to save personnel configuration changes.");
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
            staffTableBody.innerHTML = `<tr><td colspan="5" class="text-center table-empty-notice">No active staff records mapped yet.</td></tr>`;
            return;
        }

        snapshot.forEach((staffDoc) => {
            const staff = staffDoc.data();
            const staffStatus = staff.status || "Active";
            const isDeactivated = staffStatus.toLowerCase() === "deactivated";

            const row = document.createElement("tr");

            row.innerHTML = `
                <td><strong>${staff.name}</strong></td>
                <td>${getRoleBadgeMarkup(staff.position)}</td>
                <td>${staff.email}</td>
                <td>${getStatusPillMarkup(staffStatus)}</td>
                <td class="roster-action-cell">
                    <button class="btn-badge-action" data-id="${staffDoc.id}" data-name="${staff.name}" data-role="${staff.position}" data-status="${staffStatus}">
                        <i class="fa-solid fa-qrcode"></i> Badge
                    </button>
                    <button class="btn-toggle-status ${isDeactivated ? 'activate' : 'deactivate'}" data-id="${staffDoc.id}" data-status="${staffStatus}" data-name="${staff.name}">
                        <i class="fa-solid ${isDeactivated ? 'fa-check' : 'fa-user-slash'}"></i> ${isDeactivated ? 'Activate' : 'Deactivate'}
                    </button>
                    <button class="btn-delete btn-delete-inline" data-id="${staffDoc.id}" data-name="${staff.name}">Remove</button>
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

                        await addDoc(collection(db, "audit_logs"), {
                            facilityId: facilityId,
                            personnelName: sessionStorage.getItem("activePersonnelName") || "Administrator",
                            role: "Admin",
                            action: `Updated Staff Status for ${staffName} -> ${newStatus}`,
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

                if (confirm(`Permanently remove ${staffName} from the facility roster?`)) {
                    try {
                        await deleteDoc(doc(db, "facilities", facilityId, "staff", targetDocId));

                        await addDoc(collection(db, "audit_logs"), {
                            facilityId: facilityId,
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
// PIPELINE 3: LIVE STREAM AUDIT LOG ACCESS LOGS
// ==========================================================
function startLiveAuditLogsStream(facilityId) {
    const auditTableBody = document.getElementById("auditLogTableBody");
    if (!auditTableBody) return;
    
    const auditQuery = query(
        collection(db, "audit_logs"),
        where("facilityId", "==", facilityId)
    );

    onSnapshot(auditQuery, (snapshot) => {
        auditTableBody.innerHTML = "";

        if (snapshot.empty) {
            auditTableBody.innerHTML = `<tr><td colspan="5" class="text-center table-empty-notice">No security login actions verified on log arrays yet.</td></tr>`;
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
                <td><strong>${log.personnelName || "Unknown Staff"}</strong></td>
                <td>${getRoleBadgeMarkup(log.role)}</td>
                <td>${log.action || "System Sign-In"}</td>
                <td><span class="verified-pass-text">✓ Verified Pass</span></td>
            `;

            auditTableBody.appendChild(row);
        });
    }, (error) => {
        console.error("Audit log real-time stream failed:", error);
        auditTableBody.innerHTML = `<tr><td colspan="5" class="stream-error-notice">Security Authorization Error: Unable to stream session trails.</td></tr>`;
    });
}