// itr.js - Individual Treatment Record Registration Controller
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { 
    doc, getDoc, collection, addDoc, runTransaction, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Import shared central instances (Managed by firebase-config.js switch)
import { auth, db } from './firebase-config.js';

let activeFacilityUid = null;
let activePersonnelName = "Duty Staff";

document.addEventListener('DOMContentLoaded', () => {
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
                activePersonnelName = parsed.name || parsed.fullName || activePersonnelName;
            } catch (e) {}

            activePersonnelName = activePersonnelName.trim();
            sessionStorage.setItem("activePersonnelName", activePersonnelName);

            const applyPersonnelName = () => {
                const physicianInput = document.getElementById("physician");
                if (physicianInput) physicianInput.value = activePersonnelName;
            };

            applyPersonnelName();
            setTimeout(applyPersonnelName, 150);

            const consultField = document.getElementById('consultDateTime');
            if (consultField && !consultField.value) {
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                consultField.value = now.toISOString().slice(0, 16);
            }

            await previewRecordNumber(user.uid);
            recalculatePepSchedule();
        } else {
            window.location.href = "abtc-login.html";
        }
    });

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

    // Pill Button Logic
    document.querySelectorAll('.pill-group').forEach((group) => {
        const isMulti = group.classList.contains('multi');
        group.querySelectorAll('.pill').forEach((pill) => {
            pill.addEventListener('click', () => {
                if (isMulti) {
                    pill.classList.toggle('active');
                } else {
                    group.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
                    pill.classList.add('active');

                    if (group.dataset.name === 'exposureCategory') recalculatePepSchedule();
                }
            });
        });
    });

    function getPillValue(name) {
        const group = document.querySelector(`.pill-group[data-name="${name}"]`);
        if (!group) return '';
        const active = group.querySelector('.pill.active');
        return active ? active.dataset.value : '';
    }

    function getPillValues(name) {
        const group = document.querySelector(`.pill-group[data-name="${name}"]`);
        if (!group) return [];
        return Array.from(group.querySelectorAll('.pill.active')).map((p) => p.dataset.value);
    }

    // PEP Schedule Engine
    const consultDateTimeInput = document.getElementById("consultDateTime");
    const scheduleHelpText = document.getElementById("scheduleHelpText");

    const dateInputDay0 = document.getElementById("dateInputDay0");
    const dateInputDay3 = document.getElementById("dateInputDay3");
    const dateInputDay7 = document.getElementById("dateInputDay7");
    const dateInputDay14 = document.getElementById("dateInputDay14");
    const dateInputDay28 = document.getElementById("dateInputDay28");

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
        let baseDateVal = '';

        if (fromDay0Input && dateInputDay0 && dateInputDay0.value) {
            baseDateVal = dateInputDay0.value;
        } 
        else if (consultDateTimeInput && consultDateTimeInput.value) {
            baseDateVal = consultDateTimeInput.value.split('T')[0];
        }

        if (!baseDateVal) return;

        const [year, month, day] = baseDateVal.split('-').map(Number);
        const baseDate = new Date(year, month - 1, day);

        if (dateInputDay0) dateInputDay0.value = formatDateForInput(baseDate);
        if (dateInputDay3) dateInputDay3.value = formatDateForInput(addDays(baseDate, 3));
        if (dateInputDay7) dateInputDay7.value = formatDateForInput(addDays(baseDate, 7));
        if (dateInputDay14) dateInputDay14.value = formatDateForInput(addDays(baseDate, 14));
        if (dateInputDay28) dateInputDay28.value = formatDateForInput(addDays(baseDate, 28));

        const cards = [
            document.getElementById("cardDay0"),
            document.getElementById("cardDay3"),
            document.getElementById("cardDay7"),
            document.getElementById("cardDay14"),
            document.getElementById("cardDay28")
        ];

        if (category === "I") {
            cards.forEach(card => card && card.classList.replace('active', 'disabled'));
            if (scheduleHelpText) scheduleHelpText.innerHTML = `<span style="color:#e03131; font-weight:bold;">Category I Exposure:</span> PEP is generally not required according to DOH/WHO protocols.`;
        } else {
            cards.forEach(card => card && card.classList.replace('disabled', 'active'));
            if (scheduleHelpText) scheduleHelpText.innerHTML = `<span style="color:#2b8a3e; font-weight:bold;">Category ${category || 'II/III'} PEP Active:</span> Target dates auto-calculated relative to Day 0.`;
        }
    }

    if (consultDateTimeInput) consultDateTimeInput.addEventListener('change', () => recalculatePepSchedule(false));
    if (dateInputDay0) dateInputDay0.addEventListener('change', () => recalculatePepSchedule(true));

    const animalType = document.getElementById('animalType');
    const animalOtherWrap = document.getElementById('animalOtherWrap');
    if (animalType && animalOtherWrap) {
        animalType.addEventListener('change', () => {
            animalOtherWrap.hidden = animalType.value !== 'Other';
        });
    }

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

    // Form Submission
    const itrForm = document.getElementById('itrForm');
    if (itrForm) {
        itrForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!activeFacilityUid) return alert("Session Expired: Please log in again.");
            if (!itrForm.checkValidity()) return itrForm.reportValidity();

            const submitBtn = itrForm.querySelector('button[type="submit"]');
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

                const selectedAnimal = animalType.value === 'Other' ? document.getElementById('animalOther').value : animalType.value;
                const exposureCatValue = getPillValue('exposureCategory');
                const fullItrDisplayString = document.getElementById('recordNo').value;

                const lName = document.getElementById('lastName')?.value.trim() || '';
                const fName = document.getElementById('firstName')?.value.trim() || '';
                const mName = document.getElementById('middleName')?.value.trim() || '';
                const parsedFullName = `${lName}, ${fName}${mName ? ' ' + mName : ''}`.trim();

                const houseStr = document.getElementById('houseStreet')?.value.trim() || '';
                const brgy = document.getElementById('barangay')?.value.trim() || '';
                const city = document.getElementById('cityMunicipality')?.value.trim() || '';
                const prov = document.getElementById('province')?.value.trim() || '';
                const parsedAddress = [houseStr, brgy, city, prov].filter(val => val !== '').join(', ');

                const selectedRigType = document.getElementById('rigType')?.value || '';
                const enteredRigDose = document.getElementById('rigDose')?.value.trim() || '';

                const patientDataPayload = {
                    recordNo: generatedCustomId,
                    caseId: generatedCustomId,
                    patientId: generatedCustomId,
                    itrDisplayNo: fullItrDisplayString,
                    facilityId: activeFacilityUid,
                    facilityAcronym: acronym.toUpperCase(),
                    recordedBy: activePersonnelName,
                    createdAt: serverTimestamp(),
                    
                    name: parsedFullName,
                    fullName: parsedFullName,
                    exposureType: `${selectedAnimal} Exposure`,
                    classification: exposureCatValue ? `Category ${exposureCatValue}` : "Unclassified",

                    exposureDate: document.getElementById('exposureDate').value,
                    consultDateTime: document.getElementById('consultDateTime').value,
                    age: document.getElementById('age').value,
                    sex: document.getElementById('sex').value,
                    contactNo: document.getElementById('contactNo').value,
                    address: parsedAddress, 
                    physician: document.getElementById('physician').value || activePersonnelName,

                    biteArea: document.getElementById('biteArea').value,
                    animalType: selectedAnimal,
                    animalCaged: getPillValue('animalCaged'),
                    exposureCategory: exposureCatValue,
                    priorVaccination: getPillValue('priorVaccination'),
                    lastVaccDate: document.getElementById('lastVaccDate').value,

                    bp: document.getElementById('bp').value,
                    temp: document.getElementById('temp').value,
                    pulse: document.getElementById('pulse').value,
                    resp: document.getElementById('resp').value,
                    o2sat: document.getElementById('o2sat').value,
                    weight: document.getElementById('weight').value,

                    comorbidities: document.getElementById('comorbidities').value,
                    allergies: document.getElementById('allergies').value,
                    medications: document.getElementById('medications').value,

                    woundCare: document.getElementById('woundCare').value,
                    vaccineBrand: document.getElementById('vaccineBrand').value,
                    route: document.getElementById('route').value,
                    
                    rigType: selectedRigType,
                    rigDose: enteredRigDose,
                    immunoglobulin: selectedRigType ? `${selectedRigType}${enteredRigDose ? ' - ' + enteredRigDose : ''}` : (enteredRigDose || 'None'),

                    vaccSchedule: getPillValues('vaccSchedule'),
                    remarks: document.getElementById('remarks').value,

                    pepScheduleDates: {
                        day0: dateInputDay0 ? dateInputDay0.value : '',
                        day3: dateInputDay3 ? dateInputDay3.value : '',
                        day7: dateInputDay7 ? dateInputDay7.value : '',
                        day14: dateInputDay14 ? dateInputDay14.value : '',
                        day28: dateInputDay28 ? dateInputDay28.value : ''
                    },

                    woundPhotoData: capturedBase64Photo || null
                };

                await addDoc(collection(db, "patient-database"), patientDataPayload);

                alert(`Success! Record ${generatedCustomId} for ${parsedFullName} has been stored.`);
                window.location.href = "abtc-reg.html";

            } catch (error) {
                console.error("Firestore persistence error:", error);
                alert("Database Error: " + error.message);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save treatment record`;
                }
            }
        });
    }
});