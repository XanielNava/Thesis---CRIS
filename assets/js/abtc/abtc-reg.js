// abtc-reg.js - Patient Registry Library Controller (patient-database Unified Stream)
import { 
    collection, onSnapshot, query, where, doc, getDoc, deleteDoc, updateDoc 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

// Import shared central instances
import { auth, db } from '../firebase/firebase-config.js';

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

// Lightbox Controls
const woundLightbox = document.getElementById("woundLightbox");
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
    if (el) el.innerText = (value !== undefined && value !== null && value !== "") ? value : "N/A";
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
// Stream patient-database collection (Registered + Mobile Pending Intake Reports)
// ----------------------------------------------------
function streamFacilityRecords(facilityId) {
    // Listen to all documents in patient-database
    const allPatientsQuery = query(collection(db, "patient-database"));

    onSnapshot(allPatientsQuery, (snapshot) => {
        libraryCache = [];
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const docId = docSnap.id;

            // Determine if record is an unregistered mobile intake report
            const isPendingAppReport = data.abtcClaimed === false || !data.facilityId || data.status === "Pending" || docId.startsWith("BITE-");

            // Normalize nested mobile app fields if present
            const patientObj = data.patient || {};
            const animalObj = data.animal || {};
            const exposureObj = data.exposure || {};

            const normalizedFirstName = data.firstName || patientObj.firstName || '';
            const normalizedLastName = data.lastName || patientObj.lastName || '';
            let normalizedFullName = data.fullName || data.name || patientObj.fullName || '';
            
            if (!normalizedFullName && (normalizedFirstName || normalizedLastName)) {
                normalizedFullName = `${normalizedFirstName} ${normalizedLastName}`.trim();
            }

            const normalizedAge = data.age || patientObj.age || data.ageYears || '';
            const normalizedSex = data.sex || patientObj.sex || 'Male';
            const normalizedContact = data.contactNo || data.mobileNumber || patientObj.contactNo || '';
            
            const normalizedAnimalType = data.animalType || animalObj.species || exposureObj.animalType || '';
            const normalizedCaged = data.animalCaged || animalObj.caged || 'No';

            libraryCache.push({
                id: docId,
                sourceCollection: "patient-database",
                isPending: isPendingAppReport,
                
                // Root properties
                ...data,

                // Normalized helper properties
                firstName: normalizedFirstName,
                lastName: normalizedLastName,
                fullName: normalizedFullName || "Unknown Patient",
                age: normalizedAge,
                sex: normalizedSex,
                contactNo: normalizedContact,
                animalType: normalizedAnimalType,
                animalCaged: normalizedCaged,
                exposureType: data.exposureType || (normalizedAnimalType ? `${normalizedAnimalType} Exposure` : "N/A"),
                classification: data.classification || (data.exposureCategory ? `Category ${data.exposureCategory}` : (exposureObj.category ? `Category ${exposureObj.category}` : "N/A"))
            });
        });

        executeCombinedFilters();
    }, (error) => {
        console.error("Patient database tracking error:", error);
    });
}

function renderLibraryTable(dataList) {
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (dataList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#888; padding:20px;">No matching patient records found.</td></tr>`;
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
        } else if (record.exposureDate) {
            dateString = new Date(record.exposureDate).toLocaleDateString();
        }

        const caseIdDisplay = record.itrDisplayNo || record.caseId || record.recordNo || record.patientId || record.id;
        const patientNameDisplay = record.fullName || "Unknown Patient";
        const exposureTypeDisplay = record.exposureType;
        const categoryDisplay = record.classification;

        const isPending = record.isPending;
        const actionButtonText = isPending ? "Process Intake" : "View Record";

        row.innerHTML = `
            <td><strong>${caseIdDisplay}</strong> ${isPending ? '<span style="color:#f88f22; font-size:10px; font-weight:bold; margin-left:4px;">[APP PENDING]</span>' : ''}</td>
            <td>${patientNameDisplay}</td>
            <td>${exposureTypeDisplay}</td>
            <td>${categoryDisplay}</td>
            <td>${dateString}</td>
            <td style="text-align: center;">
                <button class="btn-enable btn-open-file" data-id="${record.id}">${actionButtonText}</button>
                <button class="btn-disable btn-delete-file" data-id="${record.id}" data-name="${patientNameDisplay}">Delete</button>
            </td>
        `;

        row.addEventListener("click", (e) => {
            if (e.target.closest("button")) return;
            if (isPending) {
                window.location.href = `itr.html?prefillId=${record.id}`;
            } else {
                openDocumentDrawer(record.id);
            }
        });

        row.querySelector(".btn-open-file")?.addEventListener("click", (e) => {
            const targetId = e.currentTarget.getAttribute("data-id");
            const item = libraryCache.find(r => r.id === targetId);
            if (item && item.isPending) {
                window.location.href = `itr.html?prefillId=${targetId}`;
            } else {
                openDocumentDrawer(targetId);
            }
        });

        row.querySelector(".btn-delete-file")?.addEventListener("click", async (e) => {
            const targetId = e.currentTarget.getAttribute("data-id");
            const targetName = e.currentTarget.getAttribute("data-name");
            
            if (confirm(`Are you sure you want to delete record for ${targetName}?`)) {
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

    // 1. Basic Information
    const caseId = file.itrDisplayNo || file.caseId || file.recordNo || file.patientId || file.id;
    const fullName = file.fullName || "Not Specified";
    const age = file.age ?? "N/A";
    const sex = file.sex ?? "N/A";
    const contact = file.contactNo || file.mobileNumber || "N/A";
    const address = file.address || file.municipality || "N/A";
    const physician = file.physician || file.recordedBy || "Not Specified";

    // 2. Exposure & Bite Details
    const exposureDate = file.exposureDate || "N/A";
    const consultDateTime = file.consultDateTime ? file.consultDateTime.replace("T", " ") : "N/A";
    const biteArea = file.biteArea || "N/A";
    const animalType = file.animalType || "N/A";
    const animalCaged = file.animalCaged || "N/A";
    const category = file.classification || "N/A";
    const priorVaccination = file.priorVaccination || "N/A";

    // 3. Vital Signs
    const bp = file.bp || "N/A";
    const temp = file.temp || "N/A";
    const pulse = file.pulse || "N/A";
    const resp = file.resp || "N/A";
    const o2sat = file.o2sat || "N/A";
    const weight = file.weight || "N/A";

    // 4. Medical History
    const comorbidities = file.comorbidities || "None";
    const allergies = file.allergies || "None";
    const medications = file.medications || "None";

    // 5. Treatment & Management
    const woundCare = file.woundCare || "N/A";
    const vaccineBrand = file.vaccineBrand || "N/A";
    const route = file.route || "N/A";
    const immunoglobulin = file.immunoglobulin || "None";
    const remarks = file.remarks || "None";
    
    let completedDosesText = "None";
    if (Array.isArray(file.completedDoses)) {
        const validDoses = file.completedDoses.filter(d => d && d.trim() !== "");
        if (validDoses.length > 0) completedDosesText = validDoses.join(", ");
    }

    // Set Text to Drawer HTML Elements
    safeSetText("drawerIdLabel", `RECORD: ${caseId}`);
    safeSetText("lblFullName", fullName);
    safeSetText("lblAgeSex", `${age} Yrs / ${sex}`);
    safeSetText("lblContact", contact);
    safeSetText("lblAddress", address);
    safeSetText("lblPhysician", physician);

    safeSetText("lblExposureDate", exposureDate);
    safeSetText("lblConsultDateTime", consultDateTime);
    safeSetText("lblBiteArea", biteArea);
    safeSetText("lblAnimalType", animalType);
    safeSetText("lblAnimalCaged", animalCaged);
    safeSetText("lblCategory", category);
    safeSetText("lblPriorVacc", priorVaccination);

    safeSetText("lblBp", bp);
    safeSetText("lblTemp", temp !== "N/A" ? `${temp} °C` : "N/A");
    safeSetText("lblPulse", pulse !== "N/A" ? `${pulse} bpm` : "N/A");
    safeSetText("lblResp", resp !== "N/A" ? `${resp} cpm` : "N/A");
    safeSetText("lblO2", o2sat !== "N/A" ? `${o2sat}%` : "N/A");
    safeSetText("lblWeight", weight !== "N/A" ? `${weight} kg` : "N/A");

    safeSetText("lblComorbidities", comorbidities);
    safeSetText("lblAllergies", allergies);
    safeSetText("lblMedications", medications);

    safeSetText("lblWoundCare", woundCare);
    safeSetText("lblVaccineBrand", vaccineBrand);
    safeSetText("lblRoute", route);
    safeSetText("lblRigType", immunoglobulin);
    safeSetText("lblCompletedDoses", completedDosesText);
    safeSetText("lblRemarks", remarks);

    // Wound Assessment Photo
    const imgElement = document.getElementById("imgWoundPhoto");
    const noPhotoText = document.getElementById("noPhotoText");
    if (imgElement && noPhotoText) {
        if (file.woundPhotoData && file.woundPhotoData.trim() !== "") {
            imgElement.src = file.woundPhotoData;
            imgElement.style.display = "inline-block";
            noPhotoText.style.display = "none";

            imgElement.onclick = () => {
                if (woundLightbox && lightboxImg) {
                    lightboxImg.src = file.woundPhotoData;
                    woundLightbox.style.display = "flex";
                }
            };
        } else {
            imgElement.style.display = "none";
            noPhotoText.style.display = "block";
        }
    }

    // Timeline Logs
    const timelineContainer = document.getElementById("lblHistoryTimeline");
    if (timelineContainer) {
        timelineContainer.innerHTML = "";
        if (Array.isArray(file.historyLogs) && file.historyLogs.length > 0) {
            file.historyLogs.forEach((log) => {
                const item = document.createElement("div");
                item.className = "history-item";

                let rawTime = log.timestamp || log.createdAt || log.date || log.time;
                let logTime = "N/A";

                if (rawTime) {
                    if (typeof rawTime.seconds === 'number') {
                        logTime = new Date(rawTime.seconds * 1000).toLocaleString();
                    } else {
                        const parsedDate = new Date(rawTime);
                        if (!isNaN(parsedDate)) {
                            logTime = parsedDate.toLocaleString();
                        } else {
                            logTime = rawTime;
                        }
                    }
                }
                
                item.innerHTML = `
                    <div class="history-item-header">
                        <span class="history-item-action">${log.action || log.type || "Record Activity"}</span>
                        <span class="history-item-meta">${logTime}</span>
                    </div>
                    <div style="color: var(--text-dark); margin-top: 2px;">${log.details || log.description || ""}</div>
                    <div class="history-item-meta" style="margin-top: 4px; font-style: italic;">By: ${log.personnel || log.staff || "System"}</div>
                `;
                timelineContainer.appendChild(item);
            });
        } else {
            timelineContainer.innerHTML = `<p style="color:var(--text-muted); font-style: italic; font-size: 13px;">No activity logs recorded.</p>`;
        }
    }

    // Populate Edit Mode Form Controls
    if (document.getElementById("editFullName")) document.getElementById("editFullName").value = fullName !== "Not Specified" ? fullName : "";
    if (document.getElementById("editAge")) document.getElementById("editAge").value = age !== "N/A" ? age : "";
    if (document.getElementById("editSex")) document.getElementById("editSex").value = sex !== "N/A" ? sex : "Male";
    if (document.getElementById("editContact")) document.getElementById("editContact").value = contact !== "N/A" ? contact : "";
    if (document.getElementById("editAddress")) document.getElementById("editAddress").value = address !== "N/A" ? address : "";
    if (document.getElementById("editPhysician")) document.getElementById("editPhysician").value = physician !== "Not Specified" ? physician : "";

    if (document.getElementById("editExposureDate")) document.getElementById("editExposureDate").value = file.exposureDate || "";
    if (document.getElementById("editConsultDateTime")) document.getElementById("editConsultDateTime").value = file.consultDateTime || "";
    if (document.getElementById("editBiteArea")) document.getElementById("editBiteArea").value = file.biteArea || "";
    if (document.getElementById("editAnimalType")) document.getElementById("editAnimalType").value = file.animalType || "Dog";
    if (document.getElementById("editAnimalCaged")) document.getElementById("editAnimalCaged").value = file.animalCaged || "No";
    if (document.getElementById("editCategory")) document.getElementById("editCategory").value = file.classification || "Category I";
    if (document.getElementById("editPriorVacc")) document.getElementById("editPriorVacc").value = file.priorVaccination || "No";

    if (document.getElementById("editBp")) document.getElementById("editBp").value = file.bp || "";
    if (document.getElementById("editTemp")) document.getElementById("editTemp").value = file.temp || "";
    if (document.getElementById("editPulse")) document.getElementById("editPulse").value = file.pulse || "";
    if (document.getElementById("editResp")) document.getElementById("editResp").value = file.resp || "";
    if (document.getElementById("editO2")) document.getElementById("editO2").value = file.o2sat || "";
    if (document.getElementById("editWeight")) document.getElementById("editWeight").value = file.weight || "";

    if (document.getElementById("editComorbidities")) document.getElementById("editComorbidities").value = file.comorbidities || "";
    if (document.getElementById("editAllergies")) document.getElementById("editAllergies").value = file.allergies || "";
    if (document.getElementById("editMedications")) document.getElementById("editMedications").value = file.medications || "";

    if (document.getElementById("editWoundCare")) document.getElementById("editWoundCare").value = file.woundCare || "";
    if (document.getElementById("editVaccineBrand")) document.getElementById("editVaccineBrand").value = file.vaccineBrand || "";
    if (document.getElementById("editRoute")) document.getElementById("editRoute").value = file.route || "Intradermal";
    if (document.getElementById("editRigType")) document.getElementById("editRigType").value = file.immunoglobulin || "";
    if (document.getElementById("editRemarks")) document.getElementById("editRemarks").value = file.remarks || "";

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
        if (saveRecordBtn) saveRecordBtn.style.display = "inline-flex";
    } else {
        drawer?.classList.remove("edit-mode");
        if (modeBadge) modeBadge.innerText = "VIEW MODE";
        if (saveRecordBtn) saveRecordBtn.style.display = "none";
    }
}

if (toggleEditBtn) toggleEditBtn.addEventListener("click", () => toggleMode());

if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
if (closeBtnFooter) closeBtnFooter.addEventListener("click", closeDrawer);
if (overlay) overlay.addEventListener("click", closeDrawer);

if (printBtn) {
    printBtn.addEventListener("click", () => {
        toggleMode(false);
        window.print();
    });
}

if (closeLightboxBtn) {
    closeLightboxBtn.addEventListener("click", () => {
        if (woundLightbox) woundLightbox.style.display = "none";
    });
}

function closeDrawer() {
    if (drawer && overlay) {
        drawer.classList.remove("open");
        overlay.classList.remove("open");
    }
}

if (saveRecordBtn) {
    saveRecordBtn.addEventListener("click", async () => {
        if (!currentActiveDocId) return;

        const updatedData = {
            fullName: document.getElementById("editFullName")?.value || "",
            name: document.getElementById("editFullName")?.value || "",
            age: document.getElementById("editAge")?.value || "",
            sex: document.getElementById("editSex")?.value || "Male",
            contactNo: document.getElementById("editContact")?.value || "",
            address: document.getElementById("editAddress")?.value || "",
            physician: document.getElementById("editPhysician")?.value || "",
            
            exposureDate: document.getElementById("editExposureDate")?.value || "",
            consultDateTime: document.getElementById("editConsultDateTime")?.value || "",
            biteArea: document.getElementById("editBiteArea")?.value || "",
            animalType: document.getElementById("editAnimalType")?.value || "",
            animalCaged: document.getElementById("editAnimalCaged")?.value || "",
            classification: document.getElementById("editCategory")?.value || "",
            priorVaccination: document.getElementById("editPriorVacc")?.value || "",

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
            immunoglobulin: document.getElementById("editRigType")?.value || "",
            remarks: document.getElementById("editRemarks")?.value || ""
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

// Filter and search logic
function executeCombinedFilters() {
    const searchValue = searchBox ? searchBox.value.toLowerCase().trim() : "";
    const selectedType = filterExposure ? filterExposure.value : "";
    const selectedCategory = filterCategory ? filterCategory.value : "";

    const filtered = libraryCache.filter(item => {
        const fullName = (item.fullName || "").toLowerCase();
        const firstName = (item.firstName || "").toLowerCase();
        const lastName = (item.lastName || "").toLowerCase();
        const recordId = (item.itrDisplayNo || item.caseId || item.recordNo || item.patientId || item.id || "").toLowerCase();

        const combinedNameString = `${firstName} ${lastName} ${fullName}`;

        const matchesSearch = !searchValue || combinedNameString.includes(searchValue) || recordId.includes(searchValue);
        const matchesType = !selectedType || (item.exposureType || "").includes(selectedType) || (item.animalType && selectedType.includes(item.animalType));
        const matchesCategory = !selectedCategory || (item.classification || "").includes(selectedCategory);

        // Hide app pending reports by default if search bar is empty
        if (searchValue === "" && item.isPending) {
            return false;
        }

        return matchesSearch && matchesType && matchesCategory;
    });

    renderLibraryTable(filtered);
}

if (searchBox) searchBox.addEventListener("input", executeCombinedFilters);
if (filterExposure) filterExposure.addEventListener("change", executeCombinedFilters);
if (filterCategory) filterCategory.addEventListener("change", executeCombinedFilters);

document.getElementById("logout-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (confirm("Are you sure you want to switch personnel profiles?")) {
        sessionStorage.removeItem("activeDesignation");
        sessionStorage.removeItem("activePersonnelName");
        window.location.href = 'abtc-profiles.html';
    }
});