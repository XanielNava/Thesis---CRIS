// itr.js - Individual Treatment Record Registration Controller (patient-database exclusive)
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { 
    doc, getDoc, deleteDoc, collection, addDoc, runTransaction, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Import shared central instances (Managed by firebase-config.js switch)
import { auth, db } from '../firebase/firebase-config.js';

let activeFacilityUid = null;
let activePersonnelName = "Duty Staff";
let currentPrefillDocId = null;

document.addEventListener('DOMContentLoaded', () => {
    // Trimmed value of a field by id ('' if the field does not exist)
    const getVal = (id) => document.getElementById(id)?.value.trim() ?? '';
    const setVal = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    };

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            activeFacilityUid = user.uid;
            
            let detectedName = sessionStorage.getItem("activePersonnelName") || 
                               localStorage.getItem("activePersonnelName") || 
                               localStorage.getItem("activePersonnel");

            if (!detectedName) {
                try {
                    const userSnap = await getDoc(doc(db, "users", user.uid));
                    if (userSnap.exists()) {
                        detectedName = userSnap.data().name || userSnap.data().fullName;
                    } else {
                        const facSnap = await getDoc(doc(db, "facilities", user.uid));
                        if (facSnap.exists()) detectedName = facSnap.data().personnelName;
                    }
                } catch (err) {
                    console.warn("Firestore user profile fetch error:", err);
                }
            }

            activePersonnelName = (detectedName || user.displayName || user.email || "Duty Staff").trim();

            try {
                const parsed = JSON.parse(activePersonnelName);
                activePersonnelName = String(parsed.name || parsed.fullName || activePersonnelName).trim();
            } catch (e) {}

            sessionStorage.setItem("activePersonnelName", activePersonnelName);

            setVal('physician', activePersonnelName);

            setDefaultConsultTime();

            await previewRecordNumber(user.uid);
            
            // Check if there is a prefillId query parameter from patient-database pending intake queue
            const urlParams = new URLSearchParams(window.location.search);
            currentPrefillDocId = urlParams.get("prefillId");
            if (currentPrefillDocId) {
                await loadPrefilledAppData(currentPrefillDocId);
            }

            recalculatePepSchedule();
        } else {
            window.location.href = "abtc-login.html";
        }
    });

    // Fills the consultation field with the current local date/time if it is empty
    function setDefaultConsultTime() {
        const consultField = document.getElementById('consultDateTime');
        if (consultField && !consultField.value) {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            consultField.value = now.toISOString().slice(0, 16);
        }
    }

    // Function to fetch and auto-fill from patient-database with full nested map support
    async function loadPrefilledAppData(docId) {
        try {
            const docRef = doc(db, "patient-database", docId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();

                // 1. Patient demographics and 2. address
                const prefillFields = {
                    lastName: data.lastName,
                    firstName: data.firstName || data.name,
                    middleName: data.middleName,
                    age: data.age,
                    sex: data.sex,
                    contactNo: data.contactNo || data.mobileNumber,
                    houseStreet: data.houseStreet || data.street,
                    barangay: data.barangay,
                    cityMunicipality: data.cityMunicipality || data.municipality,
                    province: data.province || 'Iloilo'
                };
                Object.entries(prefillFields).forEach(([id, value]) => setVal(id, value));

                // 3. Exposure & Bite Details
                let targetBiteArea = '';
                if (Array.isArray(data.biteArea) && data.biteArea.length > 0) {
                    targetBiteArea = data.biteArea[0];
                } else if (data.exposure && Array.isArray(data.exposure.bodySites) && data.exposure.bodySites.length > 0) {
                    targetBiteArea = data.exposure.bodySites[0];
                } else if (data.exposure && data.exposure.areaDescription) {
                    targetBiteArea = data.exposure.areaDescription;
                } else {
                    targetBiteArea = data.biteArea || data.biteAreaDescription || '';
                }

                setVal('biteArea', targetBiteArea);

                // Animal type (anything other than dog/cat goes under "Other")
                const rawAnimal = data.animalType || (data.exposure ? data.exposure.animalType : '') || '';
                const animalSelect = document.getElementById('animalType');
                if (animalSelect && rawAnimal) {
                    const animalKey = rawAnimal.toLowerCase();
                    if (animalKey.includes('dog')) {
                        animalSelect.value = 'Dog';
                    } else if (animalKey.includes('cat')) {
                        animalSelect.value = 'Cat';
                    } else {
                        animalSelect.value = 'Other';
                        setVal('animalOther', rawAnimal);
                    }
                    toggleAnimalOther();
                }

                // 4. Status of animal
                // Status of animal (older intake records only stored a caged Yes/No/Unknown value)
                const cagedVal = data.animalCaged || (data.exposure ? data.exposure.animalCaged : '');
                const cagedLabels = { yes: 'Caged', no: 'Not caged', unknown: 'Unknown' };
                setVal('animalStatus', data.animalStatus || cagedLabels[String(cagedVal).toLowerCase()]);

                // Previous immunization now lives in Past Medical History
                const vaccVal = data.priorVaccination || data.previouslyVaccinated;
                if (String(vaccVal).toLowerCase() === 'yes') {
                    setCheckRow('pastHistory', 'immunization', true, {
                        details: data.lastVaccDate ? `Last vaccinated ${data.lastVaccDate}` : ''
                    });
                }

                // 5. First Aid / Wound Care mapping
                if (data.firstAid) {
                    const woundCareInput = document.getElementById('woundCare');
                    if (woundCareInput) {
                        let careSummary = [];
                        if (data.firstAid.washedWithSoapAndWater === "Yes" || data.firstAid.washed === true) {
                            careSummary.push(`Washed with soap & water (${data.firstAid.washMinutes || '5'} mins)`);
                        }
                        if (data.firstAid.substanceApplied) {
                            careSummary.push(`Applied ${data.firstAid.substanceApplied}`);
                        }
                        woundCareInput.value = careSummary.join(". ") || "Washed and treated";
                    }
                }

                console.log("Successfully prefilled fields from patient-database for ID:", docId);
            } else {
                console.warn("No prefill document found in patient-database with ID:", docId);
            }
        } catch (err) {
            console.error("Error loading prefilled app data from patient-database:", err);
        }
    }

    async function previewRecordNumber(uid) {
        const recordNoField = document.getElementById('recordNo');
        if (!recordNoField) return;

        try {
            let facilityAcronym = sessionStorage.getItem("cachedFacilityAcronym");
            
            if (!facilityAcronym) {
                const facilitySnap = await getDoc(doc(db, "facilities", uid));
                if (facilitySnap.exists()) {
                    const facilityData = facilitySnap.data();
                    facilityAcronym = facilityData.acronym || facilityData.code || "ABTC";
                    sessionStorage.setItem("cachedFacilityAcronym", facilityAcronym);
                } else {
                    facilityAcronym = "ABTC";
                }
            }

            const counterSnap = await getDoc(doc(db, "facility_counters", uid));
            const nextIndex = counterSnap.exists() ? ((counterSnap.data().currentSequence || 0) + 1) : 1;
            const paddedSeq = String(nextIndex).padStart(3, '0');
            const year = new Date().getFullYear();
            
            recordNoField.value = `${facilityAcronym.toUpperCase()} - ${year} - ${paddedSeq}`;
        } catch (err) {
            console.error("Counter preview error:", err);
            recordNoField.value = `ABTC - 2026 - 001`;
        }
    }

    // Pill Button Logic (single-select groups)
    document.querySelectorAll('.pill-group').forEach((group) => {
        group.addEventListener('click', (e) => {
            const pill = e.target.closest('.pill');
            if (!pill) return;

            group.querySelectorAll('.pill').forEach((p) => p.classList.toggle('active', p === pill));
            if (group.dataset.name === 'exposureCategory') recalculatePepSchedule();
        });
    });

    function getPillValue(name) {
        const active = document.querySelector(`.pill-group[data-name="${name}"] .pill.active`);
        return active ? active.dataset.value : '';
    }

    // Checkbox Rows (paper-form checkboxes; ticking a row enables its detail fields)
    function syncCheckRow(row) {
        const checked = row.querySelector('input[type="checkbox"]').checked;
        row.querySelectorAll('[data-field]').forEach((el) => {
            el.disabled = !checked;
            if (!checked) el.value = '';
        });
    }

    function setCheckRow(group, value, checked, fields = {}) {
        const row = document.querySelector(`.check-row[data-group="${group}"][data-value="${value}"]`);
        if (!row) return;
        row.querySelector('input[type="checkbox"]').checked = checked;
        syncCheckRow(row);
        Object.entries(fields).forEach(([name, val]) => {
            const field = row.querySelector(`[data-field="${name}"]`);
            if (field && checked) field.value = val;
        });
    }

    // Returns { value: { fieldName: fieldValue } } for every ticked row in a group
    function getCheckedMap(group) {
        const result = {};
        document.querySelectorAll(`.check-row[data-group="${group}"]`).forEach((row) => {
            if (!row.querySelector('input[type="checkbox"]').checked) return;
            const fields = {};
            row.querySelectorAll('[data-field]').forEach((el) => {
                fields[el.dataset.field] = el.value.trim();
            });
            result[row.dataset.value] = fields;
        });
        return result;
    }

    document.querySelectorAll('.check-row').forEach((row) => {
        row.querySelector('input[type="checkbox"]').addEventListener('change', () => syncCheckRow(row));
        syncCheckRow(row);
    });

    // Birthday -> Age
    const birthdayInput = document.getElementById('birthday');
    const ageInput = document.getElementById('age');
    if (birthdayInput && ageInput) {
        birthdayInput.addEventListener('change', () => {
            if (!birthdayInput.value) return;
            const [y, m, d] = birthdayInput.value.split('-').map(Number);
            const today = new Date();
            let years = today.getFullYear() - y;
            const hadBirthday = today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
            if (!hadBirthday) years--;
            ageInput.value = Math.max(years, 0);
        });
    }

    // PEP Schedule Engine
    const PEP_DAYS = [0, 3, 7, 14, 28];
    const consultDateTimeInput = document.getElementById("consultDateTime");
    const dateInputDay0 = document.getElementById("dateInputDay0");
    const scheduleHelpText = document.getElementById("scheduleHelpText");

    function formatDateForInput(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function addDays(baseDate, days) {
        const result = new Date(baseDate);
        result.setDate(result.getDate() + days);
        return result;
    }

    function recalculatePepSchedule(fromDay0Input = false) {
        const category = getPillValue('exposureCategory');
        const baseDateVal = (fromDay0Input && dateInputDay0 && dateInputDay0.value)
            ? dateInputDay0.value
            : (consultDateTimeInput ? consultDateTimeInput.value.split('T')[0] : '');

        if (!baseDateVal) return;

        const [year, month, day] = baseDateVal.split('-').map(Number);
        const baseDate = new Date(year, month - 1, day);
        const isCategoryI = category === 'I';

        PEP_DAYS.forEach((offset) => {
            setVal(`dateInputDay${offset}`, formatDateForInput(addDays(baseDate, offset)));

            const card = document.getElementById(`cardDay${offset}`);
            if (card) {
                card.classList.toggle('disabled', isCategoryI);
                card.classList.toggle('active', !isCategoryI);
            }
        });

        if (scheduleHelpText) {
            scheduleHelpText.innerHTML = isCategoryI
                ? `<strong class="text-danger">Category I Exposure:</strong> PEP is generally not required according to DOH/WHO protocols.`
                : `<strong class="text-success">Category ${category || 'II/III'} PEP Active:</strong> Target dates auto-calculated relative to Day 0.`;
        }
    }

    if (consultDateTimeInput) consultDateTimeInput.addEventListener('change', () => recalculatePepSchedule(false));
    if (dateInputDay0) dateInputDay0.addEventListener('change', () => recalculatePepSchedule(true));

    const animalType = document.getElementById('animalType');
    const animalOtherWrap = document.getElementById('animalOtherWrap');

    function toggleAnimalOther() {
        if (animalOtherWrap) animalOtherWrap.hidden = animalType.value !== 'Other';
    }

    if (animalType) animalType.addEventListener('change', toggleAnimalOther);

    // Photo Upload
    const uploadBox = document.getElementById('uploadBox');
    const woundPhoto = document.getElementById('woundPhoto');
    const uploadPrompt = document.getElementById('uploadPrompt');
    const uploadPreviewWrap = document.getElementById('uploadPreviewWrap');
    const uploadPreview = document.getElementById('uploadPreview');
    const removePhoto = document.getElementById('removePhoto');
    let capturedBase64Photo = null;

    if (uploadBox && woundPhoto) {
        uploadBox.addEventListener('click', (e) => {
            if (!e.target.closest('.remove-photo')) woundPhoto.click();
        });

        woundPhoto.addEventListener('change', () => {
            const file = woundPhoto.files[0];
            if (file) processImageFile(file);
        });
    }

    function processImageFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            capturedBase64Photo = e.target.result;
            uploadPreview.src = capturedBase64Photo;
            uploadPrompt.hidden = true;
            uploadPreviewWrap.hidden = false;
        };
        reader.readAsDataURL(file);
    }

    if (removePhoto) {
        removePhoto.addEventListener('click', (e) => {
            e.stopPropagation();
            woundPhoto.value = '';
            capturedBase64Photo = null;
            uploadPreview.src = '';
            uploadPrompt.hidden = false;
            uploadPreviewWrap.hidden = true;
        });
    }

    // Reset Form (keeps the read-only record number and attending physician)
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (!confirm('Clear everything entered on this form?')) return;

            const recordNoField = document.getElementById('recordNo');
            const physicianField = document.getElementById('physician');
            const keptRecordNo = recordNoField ? recordNoField.value : '';
            const keptPhysician = physicianField ? physicianField.value : '';

            document.getElementById('itrForm').reset();

            if (recordNoField) recordNoField.value = keptRecordNo;
            if (physicianField) physicianField.value = keptPhysician;

            document.querySelectorAll('.pill.active').forEach((p) => p.classList.remove('active'));
            document.querySelectorAll('.check-row').forEach(syncCheckRow);
            toggleAnimalOther();
            if (removePhoto) removePhoto.click();

            setDefaultConsultTime();
            recalculatePepSchedule();
        });
    }

    // Form Submission
    const itrForm = document.getElementById('itrForm');
    if (itrForm) {
        itrForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!activeFacilityUid) return alert("Session Expired: Please log in again.");
            if (!itrForm.reportValidity()) return;

            const submitBtn = itrForm.querySelector('button[type="submit"]');
            const submitBtnHtml = submitBtn ? submitBtn.innerHTML : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving Patient Record...`;
            }

            try {
                let acronym = sessionStorage.getItem("cachedFacilityAcronym") || "ABTC";
                const counterDocRef = doc(db, "facility_counters", activeFacilityUid);
                let generatedCustomId = "";

                await runTransaction(db, async (transaction) => {
                    const counterDoc = await transaction.get(counterDocRef);
                    let currentSeq = counterDoc.exists() ? (counterDoc.data().currentSequence || 0) : 0;
                    const nextIndex = currentSeq + 1;
                    generatedCustomId = `${acronym.toUpperCase()}-${String(nextIndex).padStart(3, '0')}`;
                    transaction.set(counterDocRef, { currentSequence: nextIndex }, { merge: true });
                });

                const selectedAnimal = animalType.value === 'Other' ? getVal('animalOther') : animalType.value;
                const exposureCatValue = getPillValue('exposureCategory');
                const fullItrDisplayString = getVal('recordNo');

                const lName = getVal('lastName');
                const fName = getVal('firstName');
                const mName = getVal('middleName');
                const suffix = getVal('suffix');
                const parsedFullName = `${lName}, ${fName}${mName ? ' ' + mName : ''}${suffix ? ' ' + suffix : ''}`.trim();

                const houseStr = getVal('houseStreet');
                const brgy = getVal('barangay');
                const city = getVal('cityMunicipality');
                const prov = getVal('province');
                const parsedAddress = [houseStr, brgy, city, prov].filter(val => val !== '').join(', ');

                // Physician's order checklist (ticked rows only) and the past medical history checklist
                const physicianOrders = getCheckedMap('physicianOrder');
                const pastHistory = getCheckedMap('pastHistory');

                // Keep the legacy rigType / rigDose / immunoglobulin fields populated for other pages
                const rigOrders = [['erig', 'ERIG'], ['hrig', 'HRIG']].filter(([key]) => physicianOrders[key]);
                const selectedRigType = rigOrders.map(([, label]) => label).join(' + ');
                const enteredRigDose = rigOrders
                    .map(([key]) => physicianOrders[key].maxDose ? `${physicianOrders[key].maxDose} mL` : '')
                    .filter(Boolean)
                    .join(' + ');

                const patientDataPayload = {
                    recordNo: generatedCustomId,
                    caseId: generatedCustomId,
                    patientId: generatedCustomId,
                    itrDisplayNo: fullItrDisplayString,
                    facilityId: activeFacilityUid,
                    facilityAcronym: acronym.toUpperCase(),
                    recordedBy: activePersonnelName,
                    createdAt: serverTimestamp(),
                    
                    lastName: lName,
                    firstName: fName,
                    middleName: mName,
                    suffix: suffix,
                    name: parsedFullName,
                    fullName: parsedFullName,
                    exposureType: `${selectedAnimal} Exposure`,
                    classification: exposureCatValue ? `Category ${exposureCatValue}` : "Unclassified",

                    exposureDate: getVal('exposureDate'),
                    consultDateTime: getVal('consultDateTime'),
                    birthday: getVal('birthday'),
                    age: getVal('age'),
                    sex: getVal('sex'),
                    civilStatus: getVal('civilStatus'),
                    religion: getVal('religion'),
                    contactNo: getVal('contactNo'),
                    spouseName: getVal('spouseName'),
                    parentName: getVal('parentName'),
                    phic: {
                        categories: getCheckedMap('phic'),
                        membership: getPillValue('phicMembership')
                    },
                    houseStreet: houseStr,
                    barangay: brgy,
                    cityMunicipality: city,
                    province: prov,
                    address: parsedAddress, 
                    physician: getVal('physician') || activePersonnelName,

                    biteArea: getVal('biteArea'),
                    animalType: selectedAnimal,
                    animalStatus: getVal('animalStatus'),
                    woundTypes: getCheckedMap('woundType'),
                    incidentTime: getVal('exposureTime'),
                    incidentPlace: getVal('incidentPlace'),
                    exposureCategory: exposureCatValue,
                    priorVaccination: pastHistory.immunization ? 'Yes' : '',

                    bp: getVal('bp'),
                    temp: getVal('temp'),
                    pulse: getVal('pulse'),
                    resp: getVal('resp'),
                    o2sat: getVal('o2sat'),
                    weight: getVal('weight'),
                    height: getVal('height'),

                    pastMedicalHistory: pastHistory,
                    allergies: pastHistory.allergy?.details || '',
                    comorbidities: pastHistory.medicalProblems?.details || '',

                    diagnosis: getVal('diagnosis'),
                    physicianOrders: physicianOrders,
                    woundCare: getVal('woundCare'),
                    vaccineBrand: getVal('vaccineBrand'),
                    route: getVal('route'),
                    
                    rigType: selectedRigType,
                    rigDose: enteredRigDose,
                    immunoglobulin: selectedRigType ? `${selectedRigType}${enteredRigDose ? ' - ' + enteredRigDose : ''}` : (enteredRigDose || 'None'),

                    remarks: getVal('remarks'),

                    pepScheduleDates: Object.fromEntries(
                        PEP_DAYS.map((offset) => [`day${offset}`, getVal(`dateInputDay${offset}`)])
                    ),

                    woundPhotoData: capturedBase64Photo || null,
                    historyLogs: [
                        {
                            action: "Record Created",
                            timestamp: new Date().toISOString(),
                            personnel: activePersonnelName,
                            details: `Processed from intake report and registered under ITR No. ${fullItrDisplayString}.`
                        }
                    ]
                };

                // 1. Save official registered patient record into patient-database
                await addDoc(collection(db, "patient-database"), patientDataPayload);

                // 2. Remove the processed intake draft record from patient-database
                if (currentPrefillDocId) {
                    try {
                        await deleteDoc(doc(db, "patient-database", currentPrefillDocId));
                        console.log("Deleted processed intake record from patient-database:", currentPrefillDocId);
                    } catch (cleanupErr) {
                        console.warn("Could not remove record from patient-database:", cleanupErr);
                    }
                }

                alert(`Success! Record ${generatedCustomId} (${fullItrDisplayString}) for ${parsedFullName} has been stored and registered.`);
                window.location.href = "abtc-reg.html";

            } catch (error) {
                console.error("Firestore persistence error:", error);
                alert("Database Error: " + error.message);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = submitBtnHtml;
                }
            }
        });
    }
});