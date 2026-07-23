// abtc-reg.js - Production Modular Library Controller Pipeline
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { 
    getFirestore, collection, onSnapshot, query, where, doc, getDoc, deleteDoc, updateDoc 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

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

// Lightbox Elements
const lightbox = document.getElementById("woundLightbox");
const lightboxImg = document.getElementById("lightboxImg");
const closeLightboxBtn = document.getElementById("closeLightboxBtn");

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

// ----------------------------------------------------
// 1. Session Observer & Header Branding (TAB ISOLATED)
// ----------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (user) {
        activeFacilityId = user.uid;
        
        try {
            const userRole = sessionStorage.getItem("activeDesignation") || localStorage.getItem("activeDesignation") || "Nurse";
            const activePersonnel = sessionStorage.getItem("activePersonnelName") || localStorage.getItem("activePersonnelName");

            const facilitySnapshot = await getDoc(doc(db, "facilities", user.uid));

            if (facilitySnapshot.exists()) {
                const facilityData = facilitySnapshot.data();
                
                const name = facilityData.facilityName || "WESTERN VISAYAS MEDICAL CENTER";
                const titleElement = document.getElementById("dashboardTitle");
                if (titleElement) {
                    titleElement.innerText = `${name.toUpperCase()} PATIENT REGISTRY`;
                }

                let activeStaffMember = activePersonnel;
                if (!activeStaffMember) {
                    activeStaffMember = userRole === "Owner" 
                        ? (facilityData.contactInfo?.contactPerson || "Facility Administrator")
                        : "Attending Personnel";
                }

                const displayRoleLabel = userRole === "Owner" ? "Administrator / Owner" : "Personnel";
                
                if (profileContainer) {
                    profileContainer.innerHTML = `<strong>${activeStaffMember}</strong><br><span>${displayRoleLabel}</span>`;
                }
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
// 2. Real-Time Stream from 'patient-database'
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

// ----------------------------------------------------
// 3. Table Renderer
// ----------------------------------------------------
function renderLibraryTable(dataList) {
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (dataList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#888; padding:20px;">No matching patient records discovered.</td></tr>`;
        return;
    }

    dataList.forEach((record) => {
        const row = document.createElement("tr");
        
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

// ----------------------------------------------------
// 4. Slide Drawer Inspector Data Hydration & Editing
// ----------------------------------------------------
function openLightbox(imgSrc) {
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = imgSrc;
    lightbox.classList.add("open");
}

function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove("open");
}

if (closeLightboxBtn) closeLightboxBtn.addEventListener("click", closeLightbox);
if (lightbox) {
    lightbox.addEventListener("click", (e) => {
        if (e.target === lightbox) closeLightbox();
    });
}

function toggleMode(forceEdit = null) {
    isEditMode = forceEdit !== null ? forceEdit : !isEditMode;
    
    if (isEditMode) {
        drawer?.classList.add("edit-mode");
        if (modeBadge) modeBadge.innerText = "EDIT MODE";
        if (toggleEditBtn) toggleEditBtn.innerHTML = `<i class="fa-solid fa-eye"></i> View`;
        if (printBtn) printBtn.style.display = "none";
        if (saveRecordBtn) saveRecordBtn.style.display = "inline-block";
    } else {
        drawer?.classList.remove("edit-mode");
        if (modeBadge) modeBadge.innerText = "VIEW MODE";
        if (toggleEditBtn) toggleEditBtn.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit`;
        if (printBtn) printBtn.style.display = "inline-block";
        if (saveRecordBtn) saveRecordBtn.style.display = "none";
    }
}

if (toggleEditBtn) {
    toggleEditBtn.addEventListener("click", () => toggleMode());
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

    safeSetText("lblExposureDate", file.exposureDate || "N/A");
    safeSetText("lblConsultDateTime", file.consultDateTime ? new Date(file.consultDateTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : "N/A");
    safeSetText("lblBiteArea", file.biteArea || "N/A");
    safeSetText("lblAnimalType", file.animalType || "N/A");
    safeSetText("lblAnimalCaged", file.animalCaged || "N/A");
    safeSetText("lblCategory", file.classification || (file.exposureCategory ? `Category ${file.exposureCategory}` : "Unclassified"));
    safeSetText("lblPriorVacc", file.priorVaccination || "N/A");

    if (document.getElementById("editExposureDate")) document.getElementById("editExposureDate").value = file.exposureDate || "";
    if (document.getElementById("editConsultDateTime")) document.getElementById("editConsultDateTime").value = file.consultDateTime || "";
    if (document.getElementById("editBiteArea")) document.getElementById("editBiteArea").value = file.biteArea || "";
    if (document.getElementById("editAnimalType")) document.getElementById("editAnimalType").value = file.animalType || "Dog";
    if (document.getElementById("editAnimalCaged")) document.getElementById("editAnimalCaged").value = file.animalCaged || "No";
    if (document.getElementById("editCategory")) document.getElementById("editCategory").value = file.classification || (file.exposureCategory ? `Category ${file.exposureCategory}` : "Category I");
    if (document.getElementById("editPriorVacc")) document.getElementById("editPriorVacc").value = file.priorVaccination || "No";

    safeSetText("lblBp", file.bp || "---");
    safeSetText("lblTemp", file.temp ? `${file.temp} °C` : "---");
    safeSetText("lblPulse", file.pulse ? `${file.pulse} bpm` : "---");
    safeSetText("lblResp", file.resp ? `${file.resp} cpm` : "---");
    safeSetText("lblO2", file.o2sat ? `${file.o2sat}%` : "---");
    safeSetText("lblWeight", file.weight ? `${file.weight} kg` : "---");

    if (document.getElementById("editBp")) document.getElementById("editBp").value = file.bp || "";
    if (document.getElementById("editTemp")) document.getElementById("editTemp").value = file.temp || "";
    if (document.getElementById("editPulse")) document.getElementById("editPulse").value = file.pulse || "";
    if (document.getElementById("editResp")) document.getElementById("editResp").value = file.resp || "";
    if (document.getElementById("editO2")) document.getElementById("editO2").value = file.o2sat || "";
    if (document.getElementById("editWeight")) document.getElementById("editWeight").value = file.weight || "";

    safeSetText("lblComorbidities", file.comorbidities || "None");
    safeSetText("lblAllergies", file.allergies || "None");
    safeSetText("lblMedications", file.medications || "None");

    if (document.getElementById("editComorbidities")) document.getElementById("editComorbidities").value = file.comorbidities || "";
    if (document.getElementById("editAllergies")) document.getElementById("editAllergies").value = file.allergies || "";
    if (document.getElementById("editMedications")) document.getElementById("editMedications").value = file.medications || "";

    safeSetText("lblWoundCare", file.woundCare || "N/A");
    safeSetText("lblVaccineBrand", file.vaccineBrand || "None");
    safeSetText("lblRoute", file.route || "N/A");
    safeSetText("lblImmunoglobulin", file.immunoglobulin || "None");
    safeSetText("lblRemarks", file.remarks || "None");

    if (document.getElementById("editWoundCare")) document.getElementById("editWoundCare").value = file.woundCare || "";
    if (document.getElementById("editVaccineBrand")) document.getElementById("editVaccineBrand").value = file.vaccineBrand || "";
    if (document.getElementById("editRoute")) document.getElementById("editRoute").value = file.route || "Intramuscular";
    if (document.getElementById("editImmunoglobulin")) document.getElementById("editImmunoglobulin").value = file.immunoglobulin || "";
    if (document.getElementById("editRemarks")) document.getElementById("editRemarks").value = file.remarks || "";

    const photoFrame = document.getElementById("lblPhotoFrame");
    const photoUrl = file.woundPhotoData || file.woundPhoto;

    if (photoFrame) {
        if (photoUrl) {
            photoFrame.innerHTML = `
                <img src="${photoUrl}" class="wound-img-preview" id="drawerWoundImg" alt="Assessment photo">
                <p style="color:#777; font-size: 11px; margin-top: 6px;"><i class="fa-solid fa-magnifying-glass-plus"></i> Click image to expand view</p>
            `;
            document.getElementById("drawerWoundImg")?.addEventListener("click", () => openLightbox(photoUrl));
        } else {
            photoFrame.innerHTML = `<p style="color:#aaa; font-style: italic; font-size: 13px;"><i class="fa-solid fa-image-slash"></i> No assessment photo linked.</p>`;
        }
    }

    renderHistoryTimeline(file);

    if (drawer && overlay) {
        drawer.classList.add("open");
        overlay.classList.add("open");
    }
}

// SAVE UPDATED RECORD TO FIREBASE
if (saveRecordBtn) {
    saveRecordBtn.addEventListener("click", async () => {
        if (!currentActiveDocId) return;

        // Reads strictly from tab-isolated sessionStorage
        const activeStaff = sessionStorage.getItem("activePersonnelName") 
            || localStorage.getItem("activePersonnelName") 
            || document.getElementById("editPhysician")?.value 
            || "Duty Personnel";

        const updatedData = {
            fullName: document.getElementById("editFullName")?.value || "",
            age: document.getElementById("editAge")?.value || "",
            sex: document.getElementById("editSex")?.value || "Male",
            contactNo: document.getElementById("editContact")?.value || "",
            address: document.getElementById("editAddress")?.value || "",
            physician: document.getElementById("editPhysician")?.value || "",
            exposureDate: document.getElementById("editExposureDate")?.value || "",
            consultDateTime: document.getElementById("editConsultDateTime")?.value || "",
            biteArea: document.getElementById("editBiteArea")?.value || "",
            animalType: document.getElementById("editAnimalType")?.value || "Dog",
            animalCaged: document.getElementById("editAnimalCaged")?.value || "No",
            classification: document.getElementById("editCategory")?.value || "Category I",
            priorVaccination: document.getElementById("editPriorVacc")?.value || "No",
            bp: document.getElementById("editBp")?.value || "",
            temp: document.getElementById("editTemp")?.value || "",
            pulse: document.getElementById("editPulse")?.value || "",
            resp: document.getElementById("editResp")?.value || "",
            o2sat: document.getElementById("editO2")?.value || "",
            weight: document.getElementById("editWeight")?.value || "",
            comorbidities: document.getElementById("editComorbidities")?.value || "",
            allergies: document.getElementById("editAllergies")?.value || "",
            medications: document.getElementById("editMedications")?.value || "",
            woundCare: document.getElementById("editWoundCare")?.value || "",
            vaccineBrand: document.getElementById("editVaccineBrand")?.value || "",
            route: document.getElementById("editRoute")?.value || "",
            immunoglobulin: document.getElementById("editImmunoglobulin")?.value || "",
            remarks: document.getElementById("editRemarks")?.value || ""
        };

        try {
            const currentFile = libraryCache.find(item => item.id === currentActiveDocId);
            const currentHistory = currentFile?.historyLogs || [];

            currentHistory.push({
                action: "Record Modified",
                timestamp: new Date().toISOString(),
                personnel: activeStaff,
                details: "Patient record information updated by staff."
            });

            updatedData.historyLogs = currentHistory;

            await updateDoc(doc(db, "patient-database", currentActiveDocId), updatedData);

            alert("Patient record updated successfully!");
            toggleMode(false);
        } catch (err) {
            console.error("Update error:", err);
            alert("Failed to update record: " + err.message);
        }
    });
}

function renderHistoryTimeline(file) {
    const historyContainer = document.getElementById("lblHistoryTimeline");
    if (!historyContainer) return;

    let historyHtml = "";
    let creationDate = "Unknown Date";
    if (file.createdAt && file.createdAt.seconds) {
        creationDate = new Date(file.createdAt.seconds * 1000).toLocaleString();
    } else if (file.consultDateTime) {
        creationDate = new Date(file.consultDateTime).toLocaleString();
    }

    historyHtml += `
        <div class="history-item">
            <div class="history-item-header">
                <span class="history-item-action"><i class="fa-solid fa-file-circle-check"></i> Record Created</span>
                <span>${creationDate}</span>
            </div>
            <div class="history-item-meta">Initial intake record registered by <strong>${file.physician || "Duty Staff"}</strong>.</div>
        </div>
    `;

    if (file.historyLogs && Array.isArray(file.historyLogs)) {
        file.historyLogs.forEach(log => {
            historyHtml += `
                <div class="history-item">
                    <div class="history-item-header">
                        <span class="history-item-action"><i class="fa-solid fa-pen-to-square"></i> ${log.action || "Record Updated"}</span>
                        <span>${log.timestamp ? new Date(log.timestamp).toLocaleString() : "Recently"}</span>
                    </div>
                    <div class="history-item-meta">${log.details || "Treatment or status updated."} &mdash; <strong>${log.personnel || "Personnel"}</strong></div>
                </div>
            `;
        });
    }

    historyContainer.innerHTML = historyHtml;
}

const closeDrawer = () => { 
    if (drawer && overlay) {
        drawer.classList.remove("open"); 
        overlay.classList.remove("open"); 
    }
};

if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
if (closeBtnFooter) closeBtnFooter.addEventListener("click", closeDrawer);
if (overlay) overlay.addEventListener("click", closeDrawer);

if (printBtn) {
    printBtn.addEventListener("click", () => {
        window.print();
    });
}

// ----------------------------------------------------
// 5. Client-Side Filtering
// ----------------------------------------------------
function executeCombinedFilters() {
    const searchValue = searchBox ? searchBox.value.toLowerCase().trim() : "";
    const exposureValue = filterExposure ? filterExposure.value : "";
    const categoryValue = filterCategory ? filterCategory.value : "";

    const filtered = libraryCache.filter(item => {
        const fullName = (item.fullName || item.name || "").toLowerCase();
        const recordId = (item.caseId || item.recordNo || "").toLowerCase();
        
        const matchText = fullName.includes(searchValue) || recordId.includes(searchValue);
        
        const itemType = item.exposureType || (item.animalType ? `${item.animalType} Exposure` : "");
        const matchExposure = !exposureValue || itemType.toLowerCase().includes(exposureValue.toLowerCase().replace("bite", "").replace("scratch", "").trim());

        const itemCat = item.classification || (item.exposureCategory ? `Category ${item.exposureCategory}` : "");
        const matchCategory = !categoryValue || itemCat.toLowerCase() === categoryValue.toLowerCase();

        return matchText && matchExposure && matchCategory;
    });

    renderLibraryTable(filtered);
}

if (searchBox) searchBox.addEventListener("input", executeCombinedFilters);
if (filterExposure) filterExposure.addEventListener("change", executeCombinedFilters);
if (filterCategory) filterCategory.addEventListener("change", executeCombinedFilters);

// ----------------------------------------------------
// 6. Tab-Isolated Profile Session Switch / Logout
// ----------------------------------------------------
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (confirm("Are you sure you want to exit your profile session on this tab?")) {
            sessionStorage.removeItem("activeDesignation");
            sessionStorage.removeItem("activePersonnelName");
            window.location.href = 'abtc-profiles.html';
        }
    });
}