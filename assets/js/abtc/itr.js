// itr.js - Individual Treatment Record Registration Controller
// Conformed to CRIS Master 13-Collection Architecture

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { 
    doc, getDoc, deleteDoc, collection, addDoc, runTransaction, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { auth, db } from '../firebase/firebase-config.js';

// Session credentials derived from QR badge verification
let activeFacilityUid = sessionStorage.getItem("activeFacilityId") || null;
let activePersonnelName = sessionStorage.getItem("activePersonnelName") || "Duty Staff";
let currentPrefillDocId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // -------------------------------------------------------------------------
    // 1. DOM REFERENCES & SAFE DECLARATIONS
    // -------------------------------------------------------------------------
    const getVal = (id) => document.getElementById(id)?.value?.trim() ?? '';
    const setVal = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    };

    const PEP_DAYS = [0, 3, 7, 14, 28];
    const consultDateTimeInput = document.getElementById("consultDateTime");
    const dateInputDay0 = document.getElementById("dateInputDay0");
    const scheduleHelpText = document.getElementById("scheduleHelpText");
    const birthdayInput = document.getElementById('birthday');
    const ageInput = document.getElementById('age');
    const animalType = document.getElementById('animalType');
    const animalOtherWrap = document.getElementById('animalOtherWrap');
    const uploadBox = document.getElementById('uploadBox');
    const woundPhoto = document.getElementById('woundPhoto');
    const uploadPrompt = document.getElementById('uploadPrompt');
    const uploadPreviewWrap = document.getElementById('uploadPreviewWrap');
    const uploadPreview = document.getElementById('uploadPreview');
    const removePhoto = document.getElementById('removePhoto');
    const resetBtn = document.getElementById('resetBtn');
    const itrForm = document.getElementById('itrForm');

    let capturedBase64Photo = null;

    // -------------------------------------------------------------------------
    // 2. HELPER FUNCTIONS
    // -------------------------------------------------------------------------
    function setDefaultConsultTime() {
        if (consultDateTimeInput && !consultDateTimeInput.value) {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            consultDateTimeInput.value = now.toISOString().slice(0, 16);
        }
    }

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

    function getPillValue(name) {
        const active = document.querySelector(`.pill-group[data-name="${name}"] .pill.active`);
        return active ? active.dataset.value : '';
    }

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

    function getCheckedMap(group) {
        const result = {};
        document.querySelectorAll(`.check-row[data-group="${group}"]`).forEach((row) => {
            if (!row.querySelector('input[type="checkbox"]').checked) return;
            const fields = {};
            row.querySelectorAll('[data-field]').forEach((el) => {
                fields[el.dataset.field] = el.value ? el.value.trim() : '';
            });
            result[row.dataset.value] = fields;
        });
        return result;
    }

    function toggleAnimalOther() {
        if (animalOtherWrap && animalType) {
            animalOtherWrap.hidden = animalType.value !== 'Other';
        }
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
                ? `<strong class="text-danger">Category I Exposure:</strong> PEP is not required according to DOH protocols.`
                : `<strong class="text-success">Category ${category || 'II/III'} PEP Active:</strong> Target dates auto-calculated.`;
        }
    }

    async function previewRecordNumber(facilityId) {
        const recordNoField = document.getElementById('recordNo');
        if (!recordNoField) return;

        try {
            let facilityAcronym = sessionStorage.getItem("activeFacilityAcronym");
            
            if (!facilityAcronym && facilityId) {
                const facilitySnap = await getDoc(doc(db, "facilities", facilityId));
                if (facilitySnap.exists()) {
                    const facilityData = facilitySnap.data();
                    facilityAcronym = facilityData.acronym || facilityData.code || "ABTC";
                    sessionStorage.setItem("activeFacilityAcronym", facilityAcronym);
                } else {
                    facilityAcronym = "ABTC";
                }
            }

            const safeAcronym = (facilityAcronym || "ABTC").toUpperCase();

            let nextIndex = 1;
            try {
                const counterSnap = await getDoc(doc(db, "facility_counters", facilityId));
                if (counterSnap.exists()) {
                    nextIndex = (counterSnap.data().currentSequence || 0) + 1;
                }
            } catch (ce) {
                console.warn("Facility counter fallback:", ce);
            }

            const paddedSeq = String(nextIndex).padStart(3, '0');
            const year = new Date().getFullYear();
            recordNoField.value = `${safeAcronym} - ${year} - ${paddedSeq}`;
        } catch (err) {
            console.error("Counter preview error:", err);
            recordNoField.value = `ABTC - 2026 - 001`;
        }
    }

    // -------------------------------------------------------------------------
    // 3. INITIALIZE STATE
    // -------------------------------------------------------------------------
    setVal('physician', activePersonnelName);
    setDefaultConsultTime();

    if (activeFacilityUid) {
        await previewRecordNumber(activeFacilityUid);
    }

    if (auth) {
        onAuthStateChanged(auth, async (user) => {
            if (user && !activeFacilityUid) {
                try {
                    const userSnap = await getDoc(doc(db, "users", user.uid));
                    if (userSnap.exists() && userSnap.data().facilityId) {
                        activeFacilityUid = userSnap.data().facilityId;
                    } else {
                        activeFacilityUid = user.uid;
                    }
                } catch (e) {
                    activeFacilityUid = user.uid;
                }
                sessionStorage.setItem("activeFacilityId", activeFacilityUid);
                await previewRecordNumber(activeFacilityUid);
            }
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    currentPrefillDocId = urlParams.get("prefillId");
    if (currentPrefillDocId) {
        try {
            const docRef = doc(db, "patient-database", currentPrefillDocId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setVal('lastName', data.lastName);
                setVal('firstName', data.firstName || data.name);
                setVal('middleName', data.middleName);
                setVal('age', data.age);
                setVal('sex', data.sex);
                setVal('contactNo', data.contactNo || data.mobileNumber);
                setVal('houseStreet', data.houseStreet || data.street);
                setVal('barangay', data.barangay);
                setVal('cityMunicipality', data.cityMunicipality || data.municipality);
                setVal('province', data.province || 'Iloilo');
                setVal('biteArea', Array.isArray(data.biteArea) ? data.biteArea[0] : (data.biteArea || ''));
            }
        } catch (err) {
            console.warn("Intake prefill error:", err);
        }
    }

    recalculatePepSchedule();

    // -------------------------------------------------------------------------
    // 4. EVENT LISTENERS
    // -------------------------------------------------------------------------
    if (birthdayInput && ageInput) {
        birthdayInput.addEventListener('change', () => {
            if (!birthdayInput.value) return;
            const [y, m, d] = birthdayInput.value.split('-').map(Number);
            const today = new Date();
            let years = today.getFullYear() - y;
            const hasHadBirthday = 
                (today.getMonth() + 1 > m) || 
                (today.getMonth() + 1 === m && today.getDate() >= d);
            if (!hasHadBirthday) years--;
            ageInput.value = Math.max(years, 0);
        });

        ageInput.addEventListener('input', () => {
            const enteredAge = parseInt(ageInput.value, 10);
            if (!isNaN(enteredAge) && enteredAge >= 0 && enteredAge <= 120) {
                if (!birthdayInput.value) {
                    const currentYear = new Date().getFullYear();
                    birthdayInput.value = `${currentYear - enteredAge}-01-01`;
                }
            }
        });
    }

    document.querySelectorAll('.pill-group').forEach((group) => {
        group.addEventListener('click', (e) => {
            const pill = e.target.closest('.pill');
            if (!pill) return;
            group.querySelectorAll('.pill').forEach((p) => p.classList.toggle('active', p === pill));
            if (group.dataset.name === 'exposureCategory') recalculatePepSchedule();
        });
    });

    document.querySelectorAll('.check-row').forEach((row) => {
        row.querySelector('input[type="checkbox"]').addEventListener('change', () => syncCheckRow(row));
        syncCheckRow(row);
    });

    if (consultDateTimeInput) consultDateTimeInput.addEventListener('change', () => recalculatePepSchedule(false));
    if (dateInputDay0) dateInputDay0.addEventListener('change', () => recalculatePepSchedule(true));
    if (animalType) animalType.addEventListener('change', toggleAnimalOther);

    if (uploadBox && woundPhoto) {
        uploadBox.addEventListener('click', (e) => {
            if (!e.target.closest('.remove-photo')) woundPhoto.click();
        });

        woundPhoto.addEventListener('change', () => {
            const file = woundPhoto.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    capturedBase64Photo = ev.target.result;
                    uploadPreview.src = capturedBase64Photo;
                    uploadPrompt.hidden = true;
                    uploadPreviewWrap.hidden = false;
                };
                reader.readAsDataURL(file);
            }
        });
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

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (!confirm('Clear all form inputs?')) return;
            const recordNoField = document.getElementById('recordNo');
            const physicianField = document.getElementById('physician');
            const keptRecordNo = recordNoField ? recordNoField.value : '';
            const keptPhysician = physicianField ? physicianField.value : '';

            itrForm.reset();

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

    // -------------------------------------------------------------------------
    // 5. SCHEMA-CONFORMED PERSISTENCE ENGINE
    // -------------------------------------------------------------------------
    async function handleTreatmentRecordSave(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        const resolvedFacilityId = activeFacilityUid || sessionStorage.getItem("activeFacilityId");
        if (!resolvedFacilityId) {
            alert("Session Expired: Please scan your staff badge to re-authenticate.");
            return false;
        }

        const lName = getVal('lastName');
        const fName = getVal('firstName');
        const ageVal = getVal('age');
        const sexVal = getVal('sex');

        if (!lName || !fName || !ageVal || !sexVal) {
            alert("Incomplete Patient Information: Please fill in at least the Last Name, First Name, Age, and Sex.");
            return false;
        }

        const submitBtn = itrForm?.querySelector('button[type="submit"]');
        const submitBtnHtml = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving to Clinical Database...`;
        }

        try {
            let acronym = (sessionStorage.getItem("activeFacilityAcronym") || "ABTC").toUpperCase();
            let generatedCustomId = "";

            // 1. Transactional Counter Management
            try {
                const counterDocRef = doc(db, "facility_counters", resolvedFacilityId);
                await runTransaction(db, async (transaction) => {
                    const counterDoc = await transaction.get(counterDocRef);
                    let currentSeq = counterDoc.exists() ? (counterDoc.data().currentSequence || 0) : 0;
                    const nextIndex = currentSeq + 1;
                    generatedCustomId = `${acronym}-${String(nextIndex).padStart(3, '0')}`;
                    transaction.set(counterDocRef, { 
                        currentSequence: nextIndex,
                        lastUpdated: serverTimestamp() 
                    }, { merge: true });
                });
            } catch (counterError) {
                console.warn("Counter transaction bypassed, using fallback timestamp ID:", counterError);
                generatedCustomId = `${acronym}-${Date.now().toString().slice(-4)}`;
            }

            const selectedAnimal = animalType.value === 'Other' ? getVal('animalOther') : animalType.value;
            const exposureCatValue = getPillValue('exposureCategory');
            const fullItrDisplayString = getVal('recordNo') || generatedCustomId;

            const mName = getVal('middleName');
            const suffix = getVal('suffix');
            const parsedFullName = `${lName}, ${fName}${mName ? ' ' + mName : ''}${suffix ? ' ' + suffix : ''}`.trim();

            const houseStr = getVal('houseStreet');
            const brgy = getVal('barangay');
            const city = getVal('cityMunicipality');
            const prov = getVal('province');
            const parsedAddress = [houseStr, brgy, city, prov].filter(val => val !== '').join(', ');

            const physicianOrders = getCheckedMap('physicianOrder');
            const pastHistory = getCheckedMap('pastHistory');

            const rigOrders = [['erig', 'ERIG'], ['hrig', 'HRIG']].filter(([key]) => physicianOrders[key]);
            const selectedRigType = rigOrders.map(([, label]) => label).join(' + ');
            const enteredRigDose = rigOrders
                .map(([key]) => physicianOrders[key].maxDose ? `${physicianOrders[key].maxDose} mL` : '')
                .filter(Boolean)
                .join(' + ');

            // 2. Exact Architecture Schema Mapping
            const patientDataPayload = {
                // Identity & Relational Keys
                recordNo: generatedCustomId,
                caseId: generatedCustomId,
                patientId: generatedCustomId,
                itrDisplayNo: fullItrDisplayString,
                facilityId: resolvedFacilityId,
                facilityAcronym: acronym,
                status: "Active",
                currentDayDose: "Day 0",

                // Demographics
                lastName: lName,
                firstName: fName,
                middleName: mName,
                suffix: suffix,
                fullName: parsedFullName,
                name: parsedFullName,
                birthday: getVal('birthday') || null,
                age: Number(ageVal),
                sex: sexVal,
                civilStatus: getVal('civilStatus'),
                religion: getVal('religion'),
                contactNo: getVal('contactNo'),
                spouseName: getVal('spouseName'),
                parentName: getVal('parentName'),

                // Address
                address: {
                    houseStreet: houseStr,
                    barangay: brgy,
                    cityMunicipality: city,
                    province: prov,
                    fullAddress: parsedAddress
                },

                // PhilHealth
                phic: {
                    categories: getCheckedMap('phic'),
                    membership: getPillValue('phicMembership') || "None"
                },

                // Exposure & Clinical Encounter
                exposure: {
                    date: getVal('exposureDate'),
                    time: getVal('exposureTime'),
                    place: getVal('incidentPlace'),
                    animalType: selectedAnimal || "Unknown",
                    animalStatus: getVal('animalStatus'),
                    biteArea: getVal('biteArea'),
                    category: exposureCatValue ? `Category ${exposureCatValue}` : "Unclassified",
                    woundTypes: getCheckedMap('woundType')
                },

                // Backward-compatibility top-level fields for existing queries
                exposureType: selectedAnimal ? `${selectedAnimal} Exposure` : "Animal Exposure",
                classification: exposureCatValue ? `Category ${exposureCatValue}` : "Unclassified",
                exposureDate: getVal('exposureDate'),
                consultDateTime: getVal('consultDateTime'),
                biteArea: getVal('biteArea'),
                animalType: selectedAnimal,
                animalStatus: getVal('animalStatus'),
                physician: getVal('physician') || activePersonnelName,
                recordedBy: activePersonnelName,

                // Vitals (Cast to numeric types)
                vitalSigns: {
                    bp: getVal('bp') || null,
                    weightKg: parseFloat(getVal('weight')) || null,
                    heightFt: parseFloat(getVal('height')) || null,
                    tempC: parseFloat(getVal('temp')) || null,
                    pulseBpm: parseInt(getVal('pulse'), 10) || null,
                    respCpm: parseInt(getVal('resp'), 10) || null,
                    o2sat: parseInt(getVal('o2sat'), 10) || null
                },

                // Past Medical History
                pastMedicalHistory: pastHistory,
                allergies: pastHistory.allergy?.details || '',
                comorbidities: pastHistory.medicalProblems?.details || '',

                // Clinical Orders
                physicianOrders: physicianOrders,
                woundCare: getVal('woundCare'),
                vaccineBrand: getVal('vaccineBrand'),
                route: getVal('route'),
                rigType: selectedRigType,
                rigDose: enteredRigDose,
                remarks: getVal('remarks'),

                // PEP Vaccination Dates & Tracking Map
                pepScheduleDates: {
                    day0: getVal('dateInputDay0'),
                    day3: getVal('dateInputDay3'),
                    day7: getVal('dateInputDay7'),
                    day14: getVal('dateInputDay14'),
                    day28: getVal('dateInputDay28')
                },
                completedDoses: ["day0"],

                // Photo Guard
                woundPhotoData: (capturedBase64Photo && capturedBase64Photo.length < 800000) 
                    ? capturedBase64Photo 
                    : null,

                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),

                // Audit History Sub-array
                historyLogs: [
                    {
                        action: "Record Registered",
                        timestamp: new Date().toISOString(),
                        personnel: activePersonnelName,
                        details: `Initial consultation completed under ITR No. ${fullItrDisplayString}. Day 0 administered.`
                    }
                ]
            };

            // 3. Write to primary patient collection
            await addDoc(collection(db, "patients"), patientDataPayload);

            // 4. Remove intake queue item if coming from prefill
            if (currentPrefillDocId) {
                try {
                    await deleteDoc(doc(db, "patients", currentPrefillDocId));
                } catch (cleanupErr) {
                    console.warn("Intake queue cleanup bypassed:", cleanupErr);
                }
            }

            alert(`Record Saved Successfully!\nITR No: ${fullItrDisplayString}\nPatient: ${parsedFullName}`);
            window.location.href = "abtc-reg.html";

        } catch (error) {
            console.error("Firestore persistence error:", error);
            alert("Database Error: " + error.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = submitBtnHtml;
            }
        }

        return false;
    }

    if (itrForm) {
        itrForm.addEventListener('submit', handleTreatmentRecordSave);

        const submitBtn = itrForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                handleTreatmentRecordSave(e);
            });
        }
    }
});