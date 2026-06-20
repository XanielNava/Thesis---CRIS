import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, runTransaction, deleteDoc, updateDoc, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

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
    Modal Interactive Action Elements Map
-------------------- */
const registerModal = document.getElementById("patientFormModal");
const openRegisterModalBtn = document.getElementById("openPatientModalBtn");
const closeRegisterModalBtn = document.querySelector(".close-modal-trigger");

const editModal = document.getElementById("editPatientModal");
const closeEditModalBtn = document.querySelector(".close-edit-modal-trigger");

if (openRegisterModalBtn && registerModal && closeRegisterModalBtn) {
    openRegisterModalBtn.addEventListener("click", () => { registerModal.style.display = "block"; });
    closeRegisterModalBtn.addEventListener("click", () => { registerModal.style.display = "none"; });
}
if (closeEditModalBtn && editModal) {
    closeEditModalBtn.addEventListener("click", () => { editModal.style.display = "none"; });
}
window.addEventListener("click", (e) => {
    if (e.target === registerModal) registerModal.style.display = "none";
    if (e.target === editModal) editModal.style.display = "none";
});

/* --------------------
    Authentication Listening Observer Handshaker Loop
-------------------- */
let activeFacilityUid = null;
let allPatientsCache = []; // Client-side cache array to manage high-speed sorting filters cost-effectively

onAuthStateChanged(auth, async (user) => {
    if (user) {
        activeFacilityUid = user.uid; 
        await displayDynamicHeaderAndSidebar(user.uid);
        listenToExclusivePatients(user.uid); 
    } else {
        window.location.href = 'abtc-login.html';
    }
});

/* --------------------
    Dynamic Context Branding Engine
-------------------- */
async function displayDynamicHeaderAndSidebar(uid) {
    const titleElement = document.getElementById("dashboardTitle");
    const badgeElement = document.getElementById("facilityNameBadge");

    try {
        const facilitySnapshot = await getDoc(doc(db, "facilities", uid));
        if (facilitySnapshot.exists()) {
            const data = facilitySnapshot.data();
            const name = data.facilityName || "ABTC";

            if (titleElement) titleElement.innerText = `${name.toUpperCase()} PATIENT REGISTRY`;
            if (badgeElement) badgeElement.innerText = name;
        } else {
            if (titleElement) titleElement.innerText = "PATIENT REGISTRY";
        }
    } catch (error) {
        console.error("Profile metadata lookup failure:", error);
        if (titleElement) titleElement.innerText = "PATIENT REGISTRY";
    }
}

/* --------------------
    CRUD - READ: Real-Time Sync & Local Storage Cache Mapping
-------------------- */
function listenToExclusivePatients(facilityUid) {
    const tableBody = document.getElementById("patientRegistryTableBody");
    if (!tableBody) return;

    const exclusiveQuery = query(
        collection(db, "bite_cases"),
        where("facilityId", "==", facilityUid)
    );

    // Continuous Sync pipeline
    onSnapshot(exclusiveQuery, (snapshot) => {
        allPatientsCache = []; // Empty baseline parameters on incoming transactions delta
        
        snapshot.forEach((patientDoc) => {
            const data = patientDoc.data();
            allPatientsCache.push({
                caseId: patientDoc.id,
                name: data.name || '',
                exposureType: data.exposureType || '',
                classification: data.classification || '',
                seconds: data.createdAt ? data.createdAt.seconds : 0
            });
        });
        
        // Execute instant redraw
        applyFiltersAndRenderTable();
    });

    // Native query interception triggers tracking input manipulations
    document.getElementById("searchRegistryInput").addEventListener("input", applyFiltersAndRenderTable);
    document.getElementById("filterExposureType").addEventListener("change", applyFiltersAndRenderTable);
    document.getElementById("filterBiteCategory").addEventListener("change", applyFiltersAndRenderTable);
}

/* --------------------
    Client-Side Real-Time Filter & Render Engine
-------------------- */
function applyFiltersAndRenderTable() {
    const tableBody = document.getElementById("patientRegistryTableBody");
    if (!tableBody) return;

    const searchQuery = document.getElementById("searchRegistryInput").value.toLowerCase().trim();
    const selectedExposure = document.getElementById("filterExposureType").value;
    const selectedCategory = document.getElementById("filterBiteCategory").value;

    let rows = "";

    // Parse array bounds in memory instantly with zero read expenses
    const filteredPatients = allPatientsCache.filter(patient => {
        const matchesName = patient.name.toLowerCase().includes(searchQuery);
        const matchesExposure = selectedExposure === "" || patient.exposureType === selectedExposure;
        const matchesCategory = selectedCategory === "" || patient.classification === selectedCategory;
        return matchesName && matchesExposure && matchesCategory;
    });

    filteredPatients.forEach((patient) => {
        const timestamp = patient.seconds ? new Date(patient.seconds * 1000).toLocaleDateString() : 'N/A';

        rows += `
            <tr>
                <td><strong>${patient.caseId}</strong></td>
                <td>${patient.name}</td>
                <td>${patient.exposureType}</td>
                <td>${patient.classification}</td>
                <td>${timestamp}</td>
                <td>
                    <button class="btn-toggle-status btn-enable" 
                        data-id="${patient.caseId}" data-name="${patient.name}" data-type="${patient.exposureType}" data-class="${patient.classification}">
                        Edit
                    </button>
                    <button class="btn-toggle-status btn-disable" 
                        data-id="${patient.caseId}" data-name="${patient.name}">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    });

    if (filteredPatients.length === 0) {
        rows = `<tr><td colspan="6" style="text-align: center; color: #888; padding: 20px;">No matching patient records discovered.</td></tr>`;
    }

    tableBody.innerHTML = rows;
}

/* --------------------
    CRUD - CREATE: Atomic Form Queue Saver
-------------------- */
const regForm = document.getElementById("patientRegistrationForm");
if (regForm) {
    regForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!activeFacilityUid) return;

        try {
            const facilitySnapshot = await getDoc(doc(db, "facilities", activeFacilityUid));
            if (!facilitySnapshot.exists()) throw new Error("Missing workspace profile metadata configuration parameters.");
            
            const acronym = facilitySnapshot.data().acronym || "ABTC";
            const counterDocRef = doc(db, "facility_counters", activeFacilityUid);

            await runTransaction(db, async (transaction) => {
                const counterDoc = await transaction.get(counterDocRef);
                if (!counterDoc.exists()) throw new Error("Baseline auto-increment counter tracking ledger missing.");

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

            alert("Patient record captured successfully!");
            regForm.reset();
            registerModal.style.display = "none";
        } catch (error) {
            console.error("Submission operational failure:", error);
            alert("Registration Error: " + error.message);
        }
    });
}

/* --------------------
    CRUD - UPDATE & DELETE: Row Action Binding Interceptors
-------------------- */
const tableBodyContainer = document.getElementById("patientRegistryTableBody");
if (tableBodyContainer) {
    tableBodyContainer.addEventListener("click", async (e) => {
        // Edit Action Form Injection
        if (e.target.classList.contains("btn-enable")) {
            document.getElementById("editPatientId").value = e.target.getAttribute("data-id");
            document.getElementById("editPatientNameInput").value = e.target.getAttribute("data-name");
            document.getElementById("editExposureTypeSelect").value = e.target.getAttribute("data-type");
            document.getElementById("editBiteCategorySelect").value = e.target.getAttribute("data-class");
            if (editModal) editModal.style.display = "block";
        }

        // Delete Execution Pipeline
        if (e.target.classList.contains("btn-disable")) {
            const id = e.target.getAttribute("data-id");
            if (confirm(`Permanently wipe case entry profile "${id}"? This operation cannot be uncommitted.`)) {
                try {
                    await deleteDoc(doc(db, "bite_cases", id));
                    alert("Purged document from cloud records.");
                } catch (err) { alert("Delete processing error: " + err.message); }
            }
        }
    });
}

// Processing Updates Save Changes Document Commit
const editForm = document.getElementById("editPatientForm");
if (editForm) {
    editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("editPatientId").value;

        try {
            await updateDoc(doc(db, "bite_cases", id), {
                name: document.getElementById("editPatientNameInput").value.trim(),
                exposureType: document.getElementById("editExposureTypeSelect").value,
                classification: document.getElementById("editBiteCategorySelect").value
            });
            alert("Patient record synchronized successfully!");
            if (editModal) editModal.style.display = "none";
        } catch (err) { alert("Synchronization error: " + err.message); }
    });
}

/* --------------------
    CRUD - BULK IMPORT: Multi-Row Async Ingestion Engine
-------------------- */
const csvFileInput = document.getElementById("csvFileInput");
if (csvFileInput) {
    csvFileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file || !activeFacilityUid) return;

        if (!confirm(`Process and bulk upload simulation arrays from "${file.name}"?`)) {
            csvFileInput.value = ""; return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            const lines = event.target.result.split(/\r?\n/);
            if (lines.length <= 1) { alert("CSV target data source appears empty."); return; }

            try {
                const facilitySnapshot = await getDoc(doc(db, "facilities", activeFacilityUid));
                const acronym = facilitySnapshot.data().acronym || "ABTC";
                const counterDocRef = doc(db, "facility_counters", activeFacilityUid);

                const counterSnapshot = await getDoc(counterDocRef);
                let currentRunningSequence = counterSnapshot.data().currentSequence;
                let successCount = 0;

                for (let i = 1; i < lines.length; i++) {
                    const rowData = lines[i].trim();
                    if (!rowData) continue;

                    const columns = rowData.split(",");
                    if (columns.length < 3) continue;

                    const patientName = columns[0].replace(/['"]+/g, '').trim();
                    const exposureType = columns[1].replace(/['"]+/g, '').trim();
                    const classification = columns[2].replace(/['"]+/g, '').trim();

                    if (!patientName) continue;

                    currentRunningSequence++;
                    const paddedSequence = String(currentRunningSequence).padStart(3, '0');
                    const customGeneratedId = `${acronym}-${paddedSequence}`;

                    await setDoc(doc(db, "bite_cases", customGeneratedId), {
                        patientId: customGeneratedId,
                        facilityId: activeFacilityUid,
                        name: patientName,
                        exposureType: exposureType,
                        classification: classification,
                        createdAt: new Date()
                    });
                    successCount++;
                }

                if (successCount > 0) {
                    await updateDoc(counterDocRef, { currentSequence: currentRunningSequence });
                    alert(`Bulk import sequence finalized! Successfully ingested ${successCount} entries seamlessly.`);
                }
            } catch (err) { alert("CSV Ingestion compilation breakdown: " + err.message); }
            finally { csvFileInput.value = ""; }
        };
        reader.readAsText(file);
    });
}

/* --------------------
    Session Sign-Out Hook Parameters
-------------------- */
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        if (confirm("Are you sure you want to exit the registry session workspace?")) {
            try { await signOut(auth); window.location.href = 'abtc-login.html'; } 
            catch (err) { console.error(err); }
        }
    });
}