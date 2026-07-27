// abtc-reg.js - Patient Registry Library Controller
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { 
    getFirestore, collection, onSnapshot, query, where, doc, getDoc, deleteDoc, updateDoc, connectFirestoreEmulator 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

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

// 🧪 CONNECT TO LOCAL EMULATOR
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');

let activeFacilityId = null;
let libraryCache = [];

const tableBody = document.getElementById("patientRegistryTableBody");
const searchBox = document.getElementById("searchRegistryInput");
const filterExposure = document.getElementById("filterExposureType");
const filterCategory = document.getElementById("filterBiteCategory");

const drawer = document.getElementById("recordDrawer");
const overlay = document.getElementById("drawerOverlay");
const closeBtn = document.getElementById("drawerCloseBtn");
const closeBtnFooter = document.getElementById("drawerCloseBtnFooter");
const printBtn = document.getElementById("printRecordBtn");
const profileContainer = document.getElementById("profileInfoText");

// Edit Controls
let currentActiveDocId = null;
let isEditMode = false;
const toggleEditBtn = document.getElementById("toggleEditBtn");
const saveRecordBtn = document.getElementById("saveRecordBtn");
const modeBadge = document.getElementById("drawerModeBadge");

function safeSetText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value ?? "N/A";
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        activeFacilityId = user.uid;
        
        try {
            const userRole = sessionStorage.getItem("activeDesignation") || localStorage.getItem("activeDesignation") || "Nurse";
            let activePersonnel = sessionStorage.getItem("activePersonnelName") || localStorage.getItem("activePersonnelName");

            let facilityName = sessionStorage.getItem("cachedFacilityName");
            if (!facilityName) {
                const facilitySnapshot = await getDoc(doc(db, "facilities", user.uid));
                if (facilitySnapshot.exists()) {
                    facilityName = facilitySnapshot.data().facilityName || "WESTERN VISAYAS MEDICAL CENTER";
                    sessionStorage.setItem("cachedFacilityName", facilityName);
                }
            }

            const titleElement = document.getElementById("dashboardTitle");
            if (titleElement && facilityName) {
                titleElement.innerText = `${facilityName.toUpperCase()} PATIENT REGISTRY`;
            }

            const activeStaffMember = activePersonnel || "Attending Personnel";
            const displayRoleLabel = userRole === "Owner" ? "Administrator / Owner" : "Personnel";
            
            if (profileContainer) {
                profileContainer.innerHTML = `<strong>${activeStaffMember}</strong><br><span>${displayRoleLabel}</span>`;
            }
        } catch (error) {
            console.error("Header rendering error:", error);
        }

        streamFacilityRecords(user.uid);
    } else {
        window.location.href = "abtc-login.html";
    }
});

// ----------------------------------------------------
// Stream Root Collection filtered by Facility ID
// ----------------------------------------------------
function streamFacilityRecords(facilityId) {
    const recordsQuery = query(
        collection(db, "patient-database"), 
        where("facilityId", "==", facilityId)
    );

    onSnapshot(recordsQuery, (snapshot) => {
        libraryCache = [];
        if (snapshot.empty) {
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#888; padding:30px;">No matching patient records discovered.</td></tr>`;
            }
            return;
        }

        snapshot.forEach((docSnap) => {
            libraryCache.push({ id: docSnap.id, ...docSnap.data() });
        });

        executeCombinedFilters();
    }, (error) => {
        console.error("Database tracking loop error:", error);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#e03131; padding:30px;">Error parsing records from patient-database.</td></tr>`;
        }
    });
}

function renderLibraryTable(dataList) {
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (dataList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#888; padding:20px;">No matching patient records discovered.</td></tr>`;
        return;
    }

    dataList.forEach((record) => {
        const row = document.createElement("tr");
        row.className = "clickable-req-row";
        
        let dateString = "N/A";
        if (record.createdAt && record.createdAt.seconds) {
            dateString = new Date(record.createdAt.seconds * 1000).toLocaleDateString();
        } else if (record.consultDateTime) {
            dateString = new Date(record.consultDateTime).toLocaleDateString();
        }

        const caseIdDisplay = record.caseId || record.recordNo || record.id.substring(0,8).toUpperCase();
        const patientNameDisplay = record.fullName || record.name || "Unknown Patient";
        const exposureTypeDisplay = record.exposureType || (record.animalType ? `${record.animalType} Exposure` : "N/A");
        const categoryDisplay = record.classification || (record.exposureCategory ? `Category ${record.exposureCategory}` : "N/A");

        row.innerHTML = `
            <td><strong>${caseIdDisplay}</strong></td>
            <td>${patientNameDisplay}</td>
            <td>${exposureTypeDisplay}</td>
            <td>${categoryDisplay}</td>
            <td>${dateString}</td>
            <td style="text-align: center;">
                <button class="btn-enable btn-open-file" data-id="${record.id}">View Record</button>
                <button class="btn-disable btn-delete-file" data-id="${record.id}" data-name="${patientNameDisplay}">Delete</button>
            </td>
        `;

        row.addEventListener("click", (e) => {
            if (e.target.closest("button")) return;
            openDocumentDrawer(record.id);
        });

        row.querySelector(".btn-open-file")?.addEventListener("click", (e) => {
            openDocumentDrawer(e.currentTarget.getAttribute("data-id"));
        });

        row.querySelector(".btn-delete-file")?.addEventListener("click", async (e) => {
            const targetId = e.currentTarget.getAttribute("data-id");
            const targetName = e.currentTarget.getAttribute("data-name");
            
            if (confirm(`Are you sure you want to delete record "${caseIdDisplay}" for ${targetName}?`)) {
                try {
                    await deleteDoc(doc(db, "patient-database", targetId));
                    alert("Patient record deleted successfully.");
                } catch (err) {
                    alert("Delete Error: " + err.message);
                }
            }
        });

        tableBody.appendChild(row);
    });
}

function openDocumentDrawer(docId) {
    const file = libraryCache.find(item => item.id === docId);
    if (!file) return;

    currentActiveDocId = docId;
    toggleMode(false);

    const displayId = file.caseId || file.recordNo || file.id.substring(0,8).toUpperCase();
    safeSetText("drawerIdLabel", `RECORD: ${displayId}`);
    
    safeSetText("lblFullName", file.fullName || file.name || "Not Specified");
    safeSetText("lblAgeSex", `${file.age || "N/A"} Yrs / ${file.sex || "N/A"}`);
    safeSetText("lblContact", file.contactNo || "N/A");
    safeSetText("lblAddress", file.address || "N/A");
    safeSetText("lblPhysician", file.physician || "Not Specified");

    if (document.getElementById("editFullName")) document.getElementById("editFullName").value = file.fullName || file.name || "";
    if (document.getElementById("editAge")) document.getElementById("editAge").value = file.age || "";
    if (document.getElementById("editSex")) document.getElementById("editSex").value = file.sex || "Male";
    if (document.getElementById("editContact")) document.getElementById("editContact").value = file.contactNo || "";
    if (document.getElementById("editAddress")) document.getElementById("editAddress").value = file.address || "";
    if (document.getElementById("editPhysician")) document.getElementById("editPhysician").value = file.physician || "";

    if (drawer && overlay) {
        drawer.classList.add("open");
        overlay.classList.add("open");
    }
}

function toggleMode(forceEdit = null) {
    isEditMode = forceEdit !== null ? forceEdit : !isEditMode;
    if (isEditMode) {
        drawer?.classList.add("edit-mode");
        if (modeBadge) modeBadge.innerText = "EDIT MODE";
    } else {
        drawer?.classList.remove("edit-mode");
        if (modeBadge) modeBadge.innerText = "VIEW MODE";
    }
}

if (saveRecordBtn) {
    saveRecordBtn.addEventListener("click", async () => {
        if (!currentActiveDocId) return;

        const updatedData = {
            fullName: document.getElementById("editFullName")?.value || "",
            age: document.getElementById("editAge")?.value || "",
            sex: document.getElementById("editSex")?.value || "Male",
            contactNo: document.getElementById("editContact")?.value || "",
            address: document.getElementById("editAddress")?.value || ""
        };

        try {
            await updateDoc(doc(db, "patient-database", currentActiveDocId), updatedData);
            alert("Patient record updated successfully!");
            toggleMode(false);
        } catch (err) {
            alert("Failed to update record: " + err.message);
        }
    });
}

function executeCombinedFilters() {
    const searchValue = searchBox ? searchBox.value.toLowerCase().trim() : "";
    const filtered = libraryCache.filter(item => {
        const fullName = (item.fullName || item.name || "").toLowerCase();
        const recordId = (item.caseId || item.recordNo || "").toLowerCase();
        return fullName.includes(searchValue) || recordId.includes(searchValue);
    });

    renderLibraryTable(filtered);
}

if (searchBox) searchBox.addEventListener("input", executeCombinedFilters);