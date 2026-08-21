// abtc-users.js - Dedicated Administration and Immutable Auditing Handler Engine
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { 
    doc, collection, addDoc, deleteDoc, query, where, onSnapshot 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// Import shared central instances (Managed by firebase-config.js switch)
import { auth, db } from '../firebase/firebase-config.js';

let currentFacilityId = null;

// Ensure authentication loop boundaries are honored
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentFacilityId = user.uid;
        console.log("Admin security terminal context mounted for workspace ID:", currentFacilityId);
        
        startLiveStaffRosterStream(currentFacilityId);
        startLiveAuditLogsStream(currentFacilityId);
    } else {
        window.location.href = "abtc-login.html";
    }
});

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
        const email = emailInput.value.trim();
        const position = positionInput.value.trim();
        const pin = pinInput.value.trim();

        if (!name || !email || !position || !pin) {
            alert("Please completely fill out all the staff parameter inputs, including the security PIN.");
            return;
        }

        if (!currentFacilityId) {
            alert("Session Error: Administrative workspace identification lost. Please re-login.");
            return;
        }

        if (pin.length !== 4 || isNaN(pin)) {
            alert("Security PIN must be exactly a 4-digit numeric sequence.");
            return;
        }

        try {
            const staffSubcollectionRef = collection(db, "facilities", currentFacilityId, "staff");
            await addDoc(staffSubcollectionRef, {
                name: name,
                email: email,
                position: position,
                pin: pin,
                createdAt: new Date().toISOString()
            });

            alert(`Successfully enrolled ${name} (${position}) into your active roster configuration.`);
            
            nameInput.value = ""; 
            emailInput.value = ""; 
            positionInput.value = ""; 
            pinInput.value = "";
        } catch (error) {
            console.error("Failed to append staff node record row:", error);
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
            staffTableBody.innerHTML = `<tr><td colspan="4" class="text-center table-empty-notice">No active staff records mapped yet.</td></tr>`;
            return;
        }

        snapshot.forEach((staffDoc) => {
            const staff = staffDoc.data();
            const row = document.createElement("tr");

            row.innerHTML = `
                <td><strong>${staff.name}</strong></td>
                <td>${getRoleBadgeMarkup(staff.position)}</td>
                <td>${staff.email}</td>
                <td class="text-center">
                    <button class="btn-delete btn-delete-inline" data-id="${staffDoc.id}">Remove</button>
                </td>
            `;

            row.querySelector(".btn-delete")?.addEventListener("click", async (e) => {
                const targetDocId = e.target.getAttribute("data-id");
                if (confirm(`Are you sure you want to remove ${staff.name} from your active database tracking?`)) {
                    try {
                        await deleteDoc(doc(db, "facilities", facilityId, "staff", targetDocId));
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

// ==========================================================
// LOGOUT INTERCEPTOR (TAB-ISOLATED EXIT)
// ==========================================================
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (confirm("Are you sure you want to close this admin workspace session log on this tab?")) {
            sessionStorage.removeItem("activeDesignation");
            sessionStorage.removeItem("activePersonnelName");
            localStorage.removeItem("activeDesignation");
            localStorage.removeItem("activePersonnelName");
            window.location.href = 'abtc-profiles.html';
        }
    });
}