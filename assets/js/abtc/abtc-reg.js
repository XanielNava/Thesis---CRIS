// abtc-reg.js - Patient Registry Library Controller (patient-database Unified Stream)
import { 
    collection, onSnapshot, query, where, doc, getDoc, deleteDoc, updateDoc, arrayUnion 
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

// ----------------------------------------------------
// ITR-aligned drawer: checklist definitions (mirror the checklists in itr.html)
// ----------------------------------------------------
const DETAILS = [{ name: 'details', label: 'Details', type: 'text' }];
const CONSENT = { name: 'consentBy', label: 'Consent from', type: 'text', placeholder: 'Name' };

const CHECK_DEFS = {
    phic: [
        { key: 'nhts', label: 'NHTS' },
        { key: 'fourPs', label: '4Ps' },
        { key: 'seniorCitizen', label: 'Senior citizen' },
        { key: 'lguSponsored', label: 'LGU sponsored' },
        { key: 'others', label: 'Others', fields: DETAILS }
    ],
    woundType: [
        { key: 'Punctured', label: 'Punctured' },
        { key: 'Lacerated', label: 'Lacerated' },
        { key: 'Abrasion', label: 'Abrasion' },
        { key: 'Scratch', label: 'Scratch' },
        { key: 'Multiple', label: 'Multiple', fields: DETAILS },
        { key: 'Others', label: 'Others', fields: DETAILS }
    ],
    pastHistory: [
        { key: 'hospitalization', label: 'Hospitalization', fields: DETAILS },
        { key: 'allergy', label: 'Food / drug allergy', fields: DETAILS },
        { key: 'immunization', label: 'Previous immunization', fields: DETAILS },
        { key: 'medicalProblems', label: 'Medical problems / medications', fields: DETAILS },
        { key: 'others', label: 'Others', fields: DETAILS }
    ],
    physicianOrder: [
        { key: 'tetanusToxoid', label: 'Tetanus toxoid / TD 0.5 mL IM', fields: [
            { name: 'details', label: 'Remarks', type: 'text' },
            { name: 'givenAt', label: 'Given on', type: 'datetime-local' }
        ] },
        { key: 'htig', label: 'HTIG 250 U IM', fields: [
            { name: 'details', label: 'Remarks', type: 'text' },
            { name: 'givenAt', label: 'Given on', type: 'datetime-local' }
        ] },
        { key: 'pcecvPvrv', label: 'PCECV / PVRV', fields: [
            { name: 'brand', label: 'Brand / type', type: 'text' },
            { name: 'route', label: 'Route', type: 'select', options: ['Intramuscular', 'Intradermal'] }
        ] },
        { key: 'skinTest', label: 'ERIG skin test (0.1 mL ERIG + 0.9 mL sterile water)', fields: [
            { name: 'injectedAt', label: 'Injected at', type: 'datetime-local' },
            { name: 'dueAt', label: 'Due on', type: 'datetime-local' },
            { name: 'result', label: 'Result', type: 'select', options: ['Negative', 'Positive'] },
            CONSENT
        ] },
        { key: 'erig', label: 'ERIG 200 IU/mL, to infiltrate wound, ANST', fields: [
            { name: 'maxDose', label: 'Max dose (mL)', type: 'number' },
            { name: 'amountGiven', label: 'Amount infiltrated', type: 'text' },
            CONSENT
        ] },
        { key: 'hrig', label: 'HRIG 150 IU/mL, to infiltrate wound, ANST', fields: [
            { name: 'maxDose', label: 'Max dose (mL)', type: 'number' }
        ] },
        { key: 'antibiotics', label: 'Antibiotics', fields: [
            { name: 'details', label: 'Drug, dose, frequency', type: 'text' }
        ] },
        { key: 'dailyDressing', label: 'Daily wound dressing' },
        { key: 'observeAnimal', label: 'Observe animal for 14 days' }
    ]
};

// [view container id, edit container id]
const CHECK_CONTAINERS = {
    phic: ['lblPhic', 'editPhic'],
    woundType: ['lblWoundTypes', 'editWoundTypes'],
    pastHistory: ['lblPastHistory', 'editPastHistory'],
    physicianOrder: ['lblOrders', 'editOrders']
};

const PEP_DAYS = [0, 3, 7, 14, 28];

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function setEditVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
}

function getEditVal(id) {
    return document.getElementById(id)?.value.trim() ?? '';
}

function renderCheckView(group, map) {
    const el = document.getElementById(CHECK_CONTAINERS[group][0]);
    if (!el) return;

    const items = CHECK_DEFS[group].filter((def) => map && map[def.key]).map((def) => {
        const vals = map[def.key] || {};
        const details = (def.fields || [])
            .filter((f) => vals[f.name])
            .map((f) => {
                const shown = f.type === 'datetime-local' ? String(vals[f.name]).replace('T', ' ') : vals[f.name];
                return `<span class="check-detail"><em>${esc(f.label)}:</em> ${esc(shown)}</span>`;
            }).join('');
        return `<li><i class="fa-solid fa-square-check"></i><div><strong>${esc(def.label)}</strong>${details}</div></li>`;
    });

    el.innerHTML = items.length
        ? `<ul class="drawer-check-view">${items.join('')}</ul>`
        : `<span class="drawer-none">None recorded</span>`;
}

function buildFieldControl(f, value, enabled) {
    const disabled = enabled ? '' : 'disabled';
    if (f.type === 'select') {
        const opts = ['', ...f.options]
            .map((o) => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o || 'Select')}</option>`)
            .join('');
        return `<select data-field="${f.name}" ${disabled}>${opts}</select>`;
    }
    const extra = f.type === 'number' ? 'step="0.1" min="0"' : '';
    return `<input type="${f.type || 'text'}" data-field="${f.name}" value="${esc(value)}" placeholder="${esc(f.placeholder || '')}" ${extra} ${disabled}>`;
}

function renderCheckEdit(group, map) {
    const el = document.getElementById(CHECK_CONTAINERS[group][1]);
    if (!el) return;

    el.innerHTML = CHECK_DEFS[group].map((def) => {
        const checked = !!(map && map[def.key]);
        const vals = (map && map[def.key]) || {};
        const fields = (def.fields || []).map((f) => (
            `<label class="drawer-sub-field"><span>${esc(f.label)}</span>${buildFieldControl(f, vals[f.name], checked)}</label>`
        )).join('');
        return `
            <div class="drawer-check-row" data-value="${def.key}">
                <label class="drawer-check"><input type="checkbox" ${checked ? 'checked' : ''}><span>${esc(def.label)}</span></label>
                ${fields ? `<div class="drawer-check-fields">${fields}</div>` : ''}
            </div>`;
    }).join('');
}

// Same shape ITR saves: { value: { fieldName: fieldValue } } for ticked rows only
function collectCheckGroup(group) {
    const result = {};
    document.querySelectorAll(`#${CHECK_CONTAINERS[group][1]} .drawer-check-row`).forEach((row) => {
        if (!row.querySelector('input[type="checkbox"]').checked) return;
        const fields = {};
        row.querySelectorAll('[data-field]').forEach((el) => { fields[el.dataset.field] = el.value.trim(); });
        result[row.dataset.value] = fields;
    });
    return result;
}

// Ticking a row enables its detail fields (same behaviour as the ITR form)
Object.values(CHECK_CONTAINERS).forEach(([, editId]) => {
    document.getElementById(editId)?.addEventListener('change', (e) => {
        if (!e.target.matches('input[type="checkbox"]')) return;
        const row = e.target.closest('.drawer-check-row');
        row.querySelectorAll('[data-field]').forEach((el) => {
            el.disabled = !e.target.checked;
            if (!e.target.checked) el.value = '';
        });
    });
});

const editAnimalTypeEl = document.getElementById("editAnimalType");
const editAnimalOtherEl = document.getElementById("editAnimalOther");
if (editAnimalTypeEl && editAnimalOtherEl) {
    editAnimalTypeEl.addEventListener("change", () => {
        editAnimalOtherEl.hidden = editAnimalTypeEl.value !== "Other";
    });
}

// Records saved before the ITR revision only have flat fields; map them into the new shape for display/editing
function getPastHistoryMap(file) {
    if (file.pastMedicalHistory) return file.pastMedicalHistory;
    const map = {};
    if (String(file.priorVaccination).toLowerCase() === "yes") map.immunization = { details: "" };
    if (file.allergies) map.allergy = { details: file.allergies };
    const problems = [file.comorbidities, file.medications].filter(Boolean).join("; ");
    if (problems) map.medicalProblems = { details: problems };
    return map;
}

function getOrdersMap(file) {
    if (file.physicianOrders) return file.physicianOrders;
    const map = {};
    if (file.vaccineBrand || file.route) map.pcecvPvrv = { brand: file.vaccineBrand || "", route: file.route || "" };
    return map;
}

function getCategoryCode(file) {
    if (file.exposureCategory) return file.exposureCategory;
    const m = String(file.classification || "").match(/Category (I{1,3})$/);
    return m ? m[1] : "";
}

function openDocumentDrawer(docId) {
    const file = libraryCache.find(item => item.id === docId);
    if (!file) return;

    currentActiveDocId = docId;
    toggleMode(false);

    const hasNameParts = !!(file.lastName || file.firstName);
    const hasAddressParts = !!(file.houseStreet || file.barangay || file.cityMunicipality || file.province);
    const orders = getOrdersMap(file);
    const category = getCategoryCode(file);
    const schedule = file.pepScheduleDates || {};

    const caseId = file.itrDisplayNo || file.caseId || file.recordNo || file.patientId || file.id;
    const na = (v) => (v !== undefined && v !== null && v !== "") ? v : "N/A";
    const withUnit = (v, unit) => (v !== undefined && v !== null && v !== "") ? `${v}${unit}` : "N/A";

    // 1. Record details
    safeSetText("drawerIdLabel", `RECORD: ${caseId}`);
    safeSetText("lblRecordNo", caseId);
    safeSetText("lblConsultDateTime", file.consultDateTime ? file.consultDateTime.replace("T", " ") : "");
    safeSetText("lblPhysician", file.physician || file.recordedBy || "");

    // 2. Patient's information
    safeSetText("lblFullName", file.fullName);
    safeSetText("lblBirthday", file.birthday);
    safeSetText("lblAgeSex", `${file.age ?? "N/A"} Yrs / ${file.sex ?? "N/A"}`);
    safeSetText("lblCivilStatus", file.civilStatus);
    safeSetText("lblReligion", file.religion);
    safeSetText("lblContact", file.contactNo || file.mobileNumber);
    safeSetText("lblSpouse", file.spouseName);
    safeSetText("lblParent", file.parentName);
    safeSetText("lblAddress", file.address || file.municipality);

    renderCheckView("phic", file.phic?.categories);
    safeSetText("lblPhicMembership", file.phic?.membership);

    // 3. Vital signs
    safeSetText("lblWeight", withUnit(file.weight, " kg"));
    safeSetText("lblHeight", withUnit(file.height, " ft"));
    safeSetText("lblTemp", withUnit(file.temp, " °C"));
    safeSetText("lblPulse", withUnit(file.pulse, " bpm"));
    safeSetText("lblResp", withUnit(file.resp, " cpm"));
    safeSetText("lblBp", file.bp);
    safeSetText("lblO2", withUnit(file.o2sat, "%"));

    // 4. Chief complaint - nature of incident
    safeSetText("lblAnimalType", file.animalType);
    safeSetText("lblAnimalStatus", file.animalStatus);
    renderCheckView("woundType", file.woundTypes);
    safeSetText("lblExposureDate", file.exposureDate);
    safeSetText("lblExposureTime", file.incidentTime);
    safeSetText("lblIncidentPlace", file.incidentPlace);
    safeSetText("lblBiteArea", Array.isArray(file.biteArea) ? file.biteArea.join(", ") : file.biteArea);

    // 5. Past medical history
    renderCheckView("pastHistory", getPastHistoryMap(file));

    // 6. Orders & treatment given
    safeSetText("lblDiagnosis", file.diagnosis);
    safeSetText("lblCategory", category ? `Category ${category}` : "Unclassified");
    renderCheckView("physicianOrder", orders);
    safeSetText("lblWoundCare", file.woundCare);
    safeSetText("lblRemarks", file.remarks || "None");

    // Immunoglobulin text from records created before the ITR revision
    const legacyRigField = document.getElementById("legacyRigField");
    const isLegacyRecord = !file.physicianOrders;
    const legacyRig = file.immunoglobulin && file.immunoglobulin !== "None" ? file.immunoglobulin : "";
    if (legacyRigField) legacyRigField.hidden = !(isLegacyRecord && legacyRig);
    safeSetText("lblLegacyRig", legacyRig);

    // Vaccination schedule
    PEP_DAYS.forEach((d) => {
        safeSetText(`lblDay${d}`, schedule[`day${d}`] || "---");
        document.getElementById(`cardSchedDay${d}`)?.classList.toggle("disabled", category === "I");
    });

    let completedDosesText = "None";
    if (Array.isArray(file.completedDoses)) {
        const validDoses = file.completedDoses.filter(d => d && d.trim() !== "");
        if (validDoses.length > 0) completedDosesText = validDoses.join(", ");
    }
    safeSetText("lblCompletedDoses", completedDosesText);

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

    // ---- Populate edit-mode controls ----
    setEditVal("editConsultDateTime", file.consultDateTime);
    setEditVal("editPhysician", file.physician || file.recordedBy);

    // Older records only have a full name / one-line address: park them in the first field so a save doesn't blank them
    setEditVal("editLastName", file.lastName);
    setEditVal("editFirstName", hasNameParts ? file.firstName : (file.fullName !== "Unknown Patient" ? file.fullName : ""));
    setEditVal("editMiddleName", file.middleName);
    setEditVal("editSuffix", file.suffix);
    setEditVal("editBirthday", file.birthday);
    setEditVal("editAge", file.age);
    setEditVal("editSex", file.sex || "Male");
    setEditVal("editCivilStatus", file.civilStatus);
    setEditVal("editReligion", file.religion);
    setEditVal("editContact", file.contactNo || file.mobileNumber);
    setEditVal("editSpouse", file.spouseName);
    setEditVal("editParent", file.parentName);
    setEditVal("editHouseStreet", hasAddressParts ? file.houseStreet : (file.address || ""));
    setEditVal("editBarangay", file.barangay);
    setEditVal("editCity", file.cityMunicipality);
    setEditVal("editProvince", file.province);

    renderCheckEdit("phic", file.phic?.categories);
    setEditVal("editPhicMembership", file.phic?.membership);

    setEditVal("editWeight", file.weight);
    setEditVal("editHeight", file.height);
    setEditVal("editTemp", file.temp);
    setEditVal("editPulse", file.pulse);
    setEditVal("editResp", file.resp);
    setEditVal("editBp", file.bp);
    setEditVal("editO2", file.o2sat);

    const knownAnimal = ["Dog", "Cat"].includes(file.animalType);
    setEditVal("editAnimalType", knownAnimal || !file.animalType ? (file.animalType || "Dog") : "Other");
    setEditVal("editAnimalOther", knownAnimal || !file.animalType ? "" : file.animalType);
    if (editAnimalOtherEl) editAnimalOtherEl.hidden = knownAnimal || !file.animalType ? true : false;
    setEditVal("editAnimalStatus", file.animalStatus);
    renderCheckEdit("woundType", file.woundTypes);
    setEditVal("editExposureDate", file.exposureDate);
    setEditVal("editExposureTime", file.incidentTime);
    setEditVal("editIncidentPlace", file.incidentPlace);
    setEditVal("editBiteArea", Array.isArray(file.biteArea) ? file.biteArea.join(", ") : file.biteArea);

    renderCheckEdit("pastHistory", getPastHistoryMap(file));

    setEditVal("editDiagnosis", file.diagnosis);
    setEditVal("editCategory", category);
    renderCheckEdit("physicianOrder", orders);
    setEditVal("editWoundCare", file.woundCare);
    setEditVal("editRemarks", file.remarks);
    PEP_DAYS.forEach((d) => setEditVal(`editDay${d}`, schedule[`day${d}`]));

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

        const file = libraryCache.find(item => item.id === currentActiveDocId) || {};
        const isLegacyRecord = !file.physicianOrders;

        // Name / address are rebuilt exactly the way itr.js builds them
        const lName = getEditVal("editLastName");
        const fName = getEditVal("editFirstName");
        const mName = getEditVal("editMiddleName");
        const suffix = getEditVal("editSuffix");
        const givenPart = `${fName}${mName ? " " + mName : ""}${suffix ? " " + suffix : ""}`.trim();
        const parsedFullName = [lName, givenPart].filter(Boolean).join(", ");

        const houseStr = getEditVal("editHouseStreet");
        const brgy = getEditVal("editBarangay");
        const city = getEditVal("editCity");
        const prov = getEditVal("editProvince");
        const parsedAddress = [houseStr, brgy, city, prov].filter(Boolean).join(", ");

        const animalSelect = getEditVal("editAnimalType");
        const selectedAnimal = animalSelect === "Other" ? getEditVal("editAnimalOther") : animalSelect;
        const categoryCode = getEditVal("editCategory");

        const pastHistory = collectCheckGroup("pastHistory");
        const physicianOrders = collectCheckGroup("physicianOrder");

        const updatedData = {
            // Record details
            consultDateTime: getEditVal("editConsultDateTime"),
            physician: getEditVal("editPhysician"),

            // Patient's information
            lastName: lName,
            firstName: fName,
            middleName: mName,
            suffix: suffix,
            fullName: parsedFullName,
            name: parsedFullName,
            birthday: getEditVal("editBirthday"),
            age: getEditVal("editAge"),
            sex: getEditVal("editSex") || "Male",
            civilStatus: getEditVal("editCivilStatus"),
            religion: getEditVal("editReligion"),
            contactNo: getEditVal("editContact"),
            spouseName: getEditVal("editSpouse"),
            parentName: getEditVal("editParent"),
            houseStreet: houseStr,
            barangay: brgy,
            cityMunicipality: city,
            province: prov,
            address: parsedAddress,
            phic: {
                categories: collectCheckGroup("phic"),
                membership: getEditVal("editPhicMembership")
            },

            // Vital signs
            weight: getEditVal("editWeight"),
            height: getEditVal("editHeight"),
            temp: getEditVal("editTemp"),
            pulse: getEditVal("editPulse"),
            resp: getEditVal("editResp"),
            bp: getEditVal("editBp"),
            o2sat: getEditVal("editO2"),

            // Chief complaint - nature of incident
            animalType: selectedAnimal,
            exposureType: `${selectedAnimal} Exposure`,
            animalStatus: getEditVal("editAnimalStatus"),
            woundTypes: collectCheckGroup("woundType"),
            exposureDate: getEditVal("editExposureDate"),
            incidentTime: getEditVal("editExposureTime"),
            incidentPlace: getEditVal("editIncidentPlace"),
            biteArea: getEditVal("editBiteArea"),

            // Past medical history (+ the legacy flat fields other pages still read)
            pastMedicalHistory: pastHistory,
            allergies: pastHistory.allergy?.details || "",
            comorbidities: pastHistory.medicalProblems?.details || "",
            priorVaccination: pastHistory.immunization ? "Yes" : "",

            // Orders & treatment
            diagnosis: getEditVal("editDiagnosis"),
            exposureCategory: categoryCode,
            classification: categoryCode ? `Category ${categoryCode}` : "Unclassified",
            physicianOrders: physicianOrders,
            vaccineBrand: physicianOrders.pcecvPvrv?.brand || "",
            route: physicianOrders.pcecvPvrv?.route || "",
            woundCare: getEditVal("editWoundCare"),
            remarks: getEditVal("editRemarks"),
            pepScheduleDates: Object.fromEntries(PEP_DAYS.map((d) => [`day${d}`, getEditVal(`editDay${d}`)]))
        };

        // Legacy immunoglobulin fields (same derivation as itr.js). Older records keep their original text unless RIG is ticked.
        const rigOrders = [["erig", "ERIG"], ["hrig", "HRIG"]].filter(([key]) => physicianOrders[key]);
        if (rigOrders.length || !isLegacyRecord) {
            const rigType = rigOrders.map(([, label]) => label).join(" + ");
            const rigDose = rigOrders
                .map(([key]) => physicianOrders[key].maxDose ? `${physicianOrders[key].maxDose} mL` : "")
                .filter(Boolean)
                .join(" + ");
            updatedData.rigType = rigType;
            updatedData.rigDose = rigDose;
            updatedData.immunoglobulin = rigType ? `${rigType}${rigDose ? " - " + rigDose : ""}` : (rigDose || "None");
        }

        const editor = sessionStorage.getItem("activePersonnelName") || localStorage.getItem("activePersonnelName") || "Attending Personnel";
        updatedData.historyLogs = arrayUnion({
            action: "Record Edited",
            timestamp: new Date().toISOString(),
            personnel: editor,
            details: "Record details updated from the patient registry."
        });

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