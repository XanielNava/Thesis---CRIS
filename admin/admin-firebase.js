import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, collection, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js"; 

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
    Utility Functions
-------------------- */
function generateAcronym(name) {
    const words = name.trim().toUpperCase().split(/\s+/);
    if (words.length === 1) {
        return words[0].replace(/[^A-Z0-9]/g, '');
    }
    return words.map(word => word[0]).join('').replace(/[^A-Z0-9]/g, '');
}

/* --------------------
    Dashboard Statistics Counter
-------------------- */
function listenToDashboardStats() {
    const countElement = document.getElementById("facilityCount");
    if (!countElement) return; 

    // 🌟 Update: Only count active facilities (exclude Disabled ones from your active count)
    const activeFacilitiesQuery = query(
        collection(db, "facilities"),
        where("status", "!=", "Disabled")
    );

    onSnapshot(activeFacilitiesQuery, (snapshot) => {
        countElement.innerText = snapshot.size;
    }, (error) => {
        console.error("Dashboard count error:", error);
    });
}

/* --------------------
    Read - Real-time Data Table Loading
-------------------- */
function listenToFacilities() {
    const tableBody = document.getElementById("facilityTable");
    if (!tableBody) return; 

    try {
        onSnapshot(collection(db, "facilities"), (snapshot) => {
            let rows = ""; 
            snapshot.forEach((facility) => {
                const data = facility.data();
                const uid = facility.id;
                
                let statusStyle = "color: #6c757d;"; // Offline gray
                let toggleButtonHtml = "";

                if (data.status === "Online") {
                    statusStyle = "color: #28a745; font-weight: bold;"; // Online green
                    toggleButtonHtml = `<button class="btn-toggle-status btn-disable" data-id="${uid}" data-name="${data.facilityName}" data-current-status="Active">Disable</button>`;
                } else if (data.status === "Disabled") {
                    statusStyle = "color: #dc3545; font-weight: bold; font-style: italic;"; // Disabled red
                    // If disabled, the action button flips to "Enable"
                    toggleButtonHtml = `<button class="btn-toggle-status btn-enable" data-id="${uid}" data-name="${data.facilityName}" data-current-status="Disabled">Enable</button>`;
                } else {
                    // Default Offline state
                    statusStyle = "color: #6c757d;";
                    toggleButtonHtml = `<button class="btn-toggle-status btn-disable" data-id="${uid}" data-name="${data.facilityName}" data-current-status="Active">Disable</button>`;
                }

                const displayAcronym = data.acronym ? ` (${data.acronym})` : '';
                const isControlDisabled = data.status === "Disabled" ? "disabled style='opacity:0.5; cursor:not-allowed;'" : "";

                rows += `
                    <tr>
                        <td>${data.facilityName || ''}${displayAcronym}</td>
                        <td>${data.email || ''}</td>
                        <td style="${statusStyle}">${data.status || 'Offline'}</td>
                        <td>
                            <button class="btn-edit" data-id="${uid}" data-name="${data.facilityName}" data-type="${data.facilityType || ''}" ${isControlDisabled}>Edit</button>
                            ${toggleButtonHtml} 
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = rows;
        });
    } catch (error) {
        console.error("Error loading facilities:", error);
    }
}

/* --------------------
    Create - Register Facility
-------------------- */
const facilityForm = document.getElementById("facilityForm");
if (facilityForm) {
    facilityForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const registerModal = document.getElementById("facilityModal");
        const facilityName = document.getElementById("facilityName").value.trim();
        const email = document.getElementById("facilityEmail").value.trim();
        const password = document.getElementById("facilityPassword").value;
        const facilityType = document.getElementById("facilityType").value;
        const acronym = generateAcronym(facilityName);

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const uid = userCredential.user.uid;

            await setDoc(doc(db, "facilities", uid), {
                facilityName: facilityName,
                acronym: acronym,       
                email: email,
                facilityType: facilityType,
                status: "Offline",      
                createdAt: new Date()
            });

            await setDoc(doc(db, "facility_counters", uid), {
                currentSequence: 0
            });

            alert(`Facility account created successfully!\nAssigned Prefix: ${acronym}`);
            facilityForm.reset();
            if (registerModal) registerModal.style.display = "none";

        } catch (error) {
            console.error(error);
            alert("Error: " + error.message);
        }
    });
}

/* --------------------
    Table Clicks Interceptors (Edit & Enable/Disable Toggles)
-------------------- */
const tableBody = document.getElementById("facilityTable");
if (tableBody) {
    tableBody.addEventListener("click", async (e) => {
        const editModal = document.getElementById("editFacilityModal");

        // 🟡 EDIT CLICKED
        if (e.target.classList.contains("btn-edit")) {
            const id = e.target.getAttribute("data-id");
            const name = e.target.getAttribute("data-name");
            const type = e.target.getAttribute("data-type");

            document.getElementById("editFacilityId").value = id;
            document.getElementById("editFacilityName").value = name;
            document.getElementById("editFacilityType").value = type;

            if (editModal) editModal.style.display = "block";
        }

        // 🔄 🌟 NEW: ENABLE / DISABLE TOGGLE CLICKED
        if (e.target.classList.contains("btn-toggle-status")) {
            const id = e.target.getAttribute("data-id");
            const name = e.target.getAttribute("data-name");
            const currentStatusRef = e.target.getAttribute("data-current-status");

            if (currentStatusRef === "Active") {
                // Process Disabling
                const confirmDisable = confirm(`Are you sure you want to DISABLE "${name}"?\nThey will be blocked from logging into their dashboard module.`);
                if (confirmDisable) {
                    try {
                        await updateDoc(doc(db, "facilities", id), { status: "Disabled" });
                        alert(`"${name}" has been disabled.`);
                    } catch (err) {
                        alert("Error: " + err.message);
                    }
                }
            } else {
                // Process Enabling
                const confirmEnable = confirm(`Are you sure you want to RE-ENABLE "${name}"?`);
                if (confirmEnable) {
                    try {
                        // When re-enabling, reset them back to baseline "Offline" state
                        await updateDoc(doc(db, "facilities", id), { status: "Offline" });
                        alert(`"${name}" has been successfully re-enabled.`);
                    } catch (err) {
                        alert("Error: " + err.message);
                    }
                }
            }
        }
    });
}

/* --------------------
    Edit Form Update Processing
-------------------- */
const editFacilityForm = document.getElementById("editFacilityForm");
if (editFacilityForm) {
    editFacilityForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const editModal = document.getElementById("editFacilityModal");
        const id = document.getElementById("editFacilityId").value;
        const updatedName = document.getElementById("editFacilityName").value.trim();
        const updatedType = document.getElementById("editFacilityType").value;
        const newAcronym = generateAcronym(updatedName);

        try {
            await updateDoc(doc(db, "facilities", id), {
                facilityName: updatedName,
                acronym: newAcronym,
                facilityType: updatedType
            });

            alert("Facility configuration updated successfully!");
            if (editModal) editModal.style.display = "none";
        } catch (err) {
            console.error(err);
            alert("Update Error: " + err.message);
        }
    });
}

/* --------------------
    Modal Overlay Toggles Setup
-------------------- */
const registerBtn = document.getElementById("registerFacilityBtn");
const registerModal = document.getElementById("facilityModal");
const closeRegisterBtn = document.querySelector(".close");
const editModal = document.getElementById("editFacilityModal");
const closeEditBtn = document.querySelector(".close-edit");

if (registerBtn && registerModal && closeRegisterBtn) {
    registerBtn.addEventListener("click", () => registerModal.style.display = "block");
    closeRegisterBtn.addEventListener("click", () => registerModal.style.display = "none");
}
if (closeEditBtn && editModal) {
    closeEditBtn.addEventListener("click", () => editModal.style.display = "none");
}
window.addEventListener("click", (e) => {
    if (registerModal && e.target === registerModal) registerModal.style.display = "none";
    if (editModal && e.target === editModal) editModal.style.display = "none";
});

listenToDashboardStats();
listenToFacilities();