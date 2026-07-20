// abtc-users.js - Dedicated Administration and Immutable Auditing Handler Engine
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { 
    getFirestore, doc, collection, addDoc, deleteDoc, query, where, onSnapshot 
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

let currentFacilityId = null;

// Ensure authentication loop boundaries are honored
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentFacilityId = user.uid;
        console.log("Admin security terminal context mounted for workspace ID:", currentFacilityId);
        
        // Initialize the real-time query pipelines
        startLiveStaffRosterStream(currentFacilityId);
        startLiveAuditLogsStream(currentFacilityId);
    } else {
        window.location.href = "abtc-login.html";
    }
});

// ==========================================================
// PIPELINE 1: WRITE NEW PERSONNEL RECORDS (FIXED V2)
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
            // Securely utilizing our globally tracked currentFacilityId path mapping
            const staffSubcollectionRef = collection(db, "facilities", currentFacilityId, "staff");
            await addDoc(staffSubcollectionRef, {
                name: name,
                email: email,
                position: position,
                pin: pin,
                createdAt: new Date().toISOString()
            });

            alert(`Successfully enrolled ${name} into your active roster configuration.`);
            
            // Flush input element text fields safely
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
        staffTableBody.innerHTML = ""; // Clear table row stack
        
        if (snapshot.empty) {
            staffTableBody.innerHTML = `<tr><td colspan="4" class="text-center" style="color:#999;">No active staff records mapped yet.</td></tr>`;
            return;
        }

        snapshot.forEach((staffDoc) => {
            const staff = staffDoc.data();
            const row = document.createElement("tr");

            row.innerHTML = `
                <td><strong>${staff.name}</strong></td>
                <td>${staff.position}</td>
                <td>${staff.email}</td>
                <td class="text-center">
                    <button class="btn-delete" style="background:none; border:none; color:#e03131; cursor:pointer; font-weight:bold;" data-id="${staffDoc.id}">Remove</button>
                </td>
            `;

            // Bind click event listener context to deletion tracking codes
            row.querySelector(".btn-delete").addEventListener("click", async (e) => {
                const targetDocId = e.target.getAttribute("data-id");
                if (confirm(`Are you sure you want to remove this staff member from your active database tracking?`)) {
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
// PIPELINE 3: LIVE STREAM AUDIT LOG ACCESS LOGS (INDEX-FREE PATCH)
// ==========================================================
function startLiveAuditLogsStream(facilityId) {
    const auditTableBody = document.getElementById("auditLogTableBody");
    if (!auditTableBody) return;
    
    // Querying filtered only by facilityId to ensure a Composite Index is not required
    const auditQuery = query(
        collection(db, "audit_logs"),
        where("facilityId", "==", facilityId)
    );

    onSnapshot(auditQuery, (snapshot) => {
        auditTableBody.innerHTML = "";

        if (snapshot.empty) {
            auditTableBody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:#999;">No security login actions verified on log arrays yet.</td></tr>`;
            return;
        }

        // Gather document snapshot logs natively into a structural array list
        const logsArray = [];
        snapshot.forEach((logDoc) => {
            logsArray.push({ id: logDoc.id, ...logDoc.data() });
        });

        // Sort chronologically (Newest check-ins at the top) purely client-side
        logsArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Generate and render table row logs smoothly
        logsArray.forEach((log) => {
            const row = document.createElement("tr");

            const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString() : "N/A";
            const roleBadge = log.role === "Owner" 
                ? `<span class="badge-owner">Owner</span>` 
                : `<span class="badge-nurse">Nurse</span>`;

            row.innerHTML = `
                <td class="log-timestamp">${dateStr}</td>
                <td><strong>${log.personnelName || "Unknown Staff"}</strong></td>
                <td>${roleBadge}</td>
                <td>${log.action || "System Sign-In"}</td>
                <td><span style="color:#2b8a3e; font-weight:bold;">✓ Verified Pass</span></td>
            `;

            auditTableBody.appendChild(row);
        });
    }, (error) => {
        console.error("Audit log real-time stream failed:", error);
        auditTableBody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:#e03131;">Security Authorization Error: Unable to stream session trails.</td></tr>`;
    });
}

// ==========================================================
// LOGOUT INTERCEPTOR INTERACTION BLOCKS
// ==========================================================
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (confirm("Are you sure you want to close this admin workspace session log?")) {
            await signOut(auth);
            localStorage.removeItem("activeDesignation");
            localStorage.removeItem("activePersonnelName");
            window.location.href = 'abtc-login.html';
        }
    });
}