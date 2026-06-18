import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, runTransaction, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

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
    Modal Event Bindings
-------------------- */
const modal = document.getElementById("patientFormModal");
const openModalBtn = document.getElementById("openPatientModalBtn");
const closeModalBtn = document.querySelector(".close-modal-trigger");

if (openModalBtn && modal && closeModalBtn) {
    openModalBtn.addEventListener("click", () => { modal.style.display = "block"; });
    closeModalBtn.addEventListener("click", () => { modal.style.display = "none"; });
    window.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
} else {
    console.error("DOM Error: Modal operational components mapping failed.");
}

/* --------------------
    Authentication State Loop
-------------------- */
let activeFacilityUid = null;

onAuthStateChanged(auth, (user) => {
    if (user) {
        activeFacilityUid = user.uid; 
        listenToExclusivePatients(user.uid); 
    } else {
        window.location.href = 'abtc-login.html';
    }
});

/* --------------------
    Read: Multi-Tenant Workspace Stream
-------------------- */
function listenToExclusivePatients(facilityUid) {
    const tableBody = document.getElementById("patientRegistryTableBody");
    if (!tableBody) return;

    const exclusiveQuery = query(
        collection(db, "bite_cases"),
        where("facilityId", "==", facilityUid)
    );

    onSnapshot(exclusiveQuery, (snapshot) => {
        let rows = "";
        snapshot.forEach((patientDoc) => {
            const data = patientDoc.data();
            const timestamp = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';

            rows += `
                <tr>
                    <td><strong>${data.patientId || ''}</strong></td>
                    <td>${data.name || ''}</td>
                    <td>${data.exposureType || ''}</td>
                    <td>${data.classification || ''}</td>
                    <td>${timestamp}</td>
                </tr>
            `;
        });
        tableBody.innerHTML = rows;
    });
}

/* --------------------
    Create: Transaction Sequence Pipeline
-------------------- */
const regForm = document.getElementById("patientRegistrationForm");
if (regForm) {
    regForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!activeFacilityUid) {
            alert("Session lost. Please refresh and log back in.");
            return;
        }

        try {
            const facilitySnapshot = await getDoc(doc(db, "facilities", activeFacilityUid));
            if (!facilitySnapshot.exists()) throw new Error("Could not find matching facility metadata profile.");
            
            const acronym = facilitySnapshot.data().acronym || "ABTC";
            const counterDocRef = doc(db, "facility_counters", activeFacilityUid);

            await runTransaction(db, async (transaction) => {
                const counterDoc = await transaction.get(counterDocRef);
                if (!counterDoc.exists()) {
                    throw new Error("Sequential counter file has not been initialized for this workspace. Please register a new facility under the Admin Module.");
                }

                const nextIndex = counterDoc.data().currentSequence + 1;
                const paddedSequence = String(nextIndex).padStart(3, '0');
                const generatedCustomId = `${acronym}-${paddedSequence}`; 

                const targetPatientDocRef = doc(db, "bite_cases", generatedCustomId);

                transaction.set(targetPatientDocRef, {
                    patientId: generatedCustomId,
                    facilityId: activeFacilityUid, 
                    name: document.getElementById("patientNameInput").value.trim(),
                    exposureType: document.getElementById("exposureTypeSelect").value,
                    classification: document.getElementById("biteCategorySelect").value,
                    createdAt: new Date()
                });

                transaction.update(counterDocRef, { currentSequence: nextIndex });
            });

            alert("Patient record captured successfully inside exclusive module parameters!");
            regForm.reset();
            modal.style.display = "none";

        } catch (error) {
            console.error("Submission operational failure:", error);
            alert("Registration Error: " + error.message);
        }
    });
}

/* --------------------
    Logout Interceptor
-------------------- */
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        if (confirm("Are you sure you want to log out?")) {
            try {
                await signOut(auth);
                window.location.href = 'abtc-login.html';
            } catch (err) {
                console.error(err);
            }
        }
    });
}