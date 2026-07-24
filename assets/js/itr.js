import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, collection, addDoc, runTransaction, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

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

let activeFacilityUid = null;
let activePersonnelName = "Duty Staff";

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // 1. Session Observer Loop
    // ----------------------------------------------------
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            activeFacilityUid = user.uid;
            activePersonnelName = localStorage.getItem("activePersonnelName") || "Duty Staff";
            
            // Auto-populate the Physician/Nurse field if empty
            const physicianInput = document.getElementById("physician");
            if (physicianInput && !physicianInput.value) {
                physicianInput.value = activePersonnelName;
            }

            // Set default consultation time to current local time string
            const consultField = document.getElementById('consultDateTime');
            if (consultField && !consultField.value) {
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                consultField.value = now.toISOString().slice(0,16);
            }

            // Generate initial preview sequence ID using facility acronym
            await previewRecordNumber(user.uid);

            // Compute initial schedule automatically
            recalculatePepSchedule();
        } else {
            window.location.href = "abtc-login.html";
        }
    });

    // Fetch the ACRONYM from the facilities collection and format the ITR display field
    async function previewRecordNumber(uid) {
        const recordNoField = document.getElementById('recordNo');
        if (!recordNoField) return;

        try {
            const facilitySnap = await getDoc(doc(db, "facilities", uid));
            let facilityAcronym = "ABTC";
            
            if (facilitySnap.exists()) {
                const facilityData = facilitySnap.data();
                facilityAcronym = facilityData.acronym || facilityData.code || "ABTC";
            }
            
            const counterSnap = await getDoc(doc(db, "facility_counters", uid));
            const nextIndex = counterSnap.exists() ? ((counterSnap.data().currentSequence || 0) + 1) : 1;
            const paddedSeq = String(nextIndex).padStart(3, '0');
            const year = new Date().getFullYear();
            
            // Display: ACRONYM - YEAR - SEQUENCE (e.g., WVMC - 2026 - 001)
            recordNoField.value = `${facilityAcronym.toUpperCase()} - ${year} - ${paddedSeq}`;
        } catch (err) {
            console.error("Counter preview error:", err);
            recordNoField.value = `ABTC - 2026 - 001`;
        }
    }

    // ----------------------------------------------------
    // 2. Form Controls & Interactive UI Handlers
    // ----------------------------------------------------
    document.querySelectorAll('.pill-group').forEach((group) => {
        const isMulti = group.classList.contains('multi');
        group.querySelectorAll('.pill').forEach((pill) => {
            pill.addEventListener('click', () => {
                if (isMulti) {
                    pill.classList.toggle('active');
                } else {
                    group.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
                    pill.classList.add('active');

                    // If Category pill changed, recalculate PEP schedule!
                    if (group.dataset.name === 'exposureCategory') {
                        recalculatePepSchedule();
                    }
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

    // ----------------------------------------------------
    // 🌟 AUTOMATED PEP SCHEDULE CALCULATION ENGINE
    // ----------------------------------------------------
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

        // Priority 1: Direct edit inside Day 0 card picker
        if (fromDay0Input && dateInputDay0 && dateInputDay0.value) {
            baseDateVal = dateInputDay0.value;
        } 
        // Priority 2: Main consultation date input at top
        else if (consultDateTimeInput && consultDateTimeInput.value) {
            baseDateVal = consultDateTimeInput.value.split('T')[0];
        }

        if (!baseDateVal) return;

        // Parse local date components to avoid UTC shift
        const [year, month, day] = baseDateVal.split('-').map(Number);
        const baseDate = new Date(year, month - 1, day);

        const d0 = baseDate;
        const d3 = addDays(baseDate, 3);
        const d7 = addDays(baseDate, 7);
        const d14 = addDays(baseDate, 14);
        const d28 = addDays(baseDate, 28);

        // Update inline date inputs
        if (dateInputDay0) dateInputDay0.value = formatDateForInput(d0);
        if (dateInputDay3) dateInputDay3.value = formatDateForInput(d3);
        if (dateInputDay7) dateInputDay7.value = formatDateForInput(d7);
        if (dateInputDay14) dateInputDay14.value = formatDateForInput(d14);
        if (dateInputDay28) dateInputDay28.value = formatDateForInput(d28);

        const cards = [
            document.getElementById("cardDay0"),
            document.getElementById("cardDay3"),
            document.getElementById("cardDay7"),
            document.getElementById("cardDay14"),
            document.getElementById("cardDay28")
        ];

        if (category === "I") {
            // Category I: Disable schedule cards
            cards.forEach(card => {
                if (card) {
                    card.classList.remove('active');
                    card.classList.add('disabled');
                }
            });
            if (scheduleHelpText) {
                scheduleHelpText.innerHTML = `<span style="color:#e03131; font-weight:bold;">Category I Exposure:</span> PEP is generally not required according to DOH/WHO protocols.`;
            }
        } else {
            // Category II & III: Activate cards
            cards.forEach(card => {
                if (card) {
                    card.classList.remove('disabled');
                    card.classList.add('active');
                }
            });

            if (scheduleHelpText) {
                scheduleHelpText.innerHTML = `<span style="color:#2b8a3e; font-weight:bold;">Category ${category || 'II/III'} PEP Active:</span> Target dates auto-calculated relative to Day 0.`;
            }
        }
    }

    // Trigger schedule updates on date changes
    if (consultDateTimeInput) {
        consultDateTimeInput.addEventListener('change', () => recalculatePepSchedule(false));
    }

    if (dateInputDay0) {
        dateInputDay0.addEventListener('change', () => recalculatePepSchedule(true));
    }

    const animalType = document.getElementById('animalType');
    const animalOtherWrap = document.getElementById('animalOtherWrap');
    if (animalType && animalOtherWrap) {
        animalType.addEventListener('change', () => {
            animalOtherWrap.hidden = animalType.value !== 'Other';
        });
    }

    // Photo Upload Handlers
    const uploadBox = document.getElementById('uploadBox');
    const woundPhoto = document.getElementById('woundPhoto');
    const uploadPrompt = document.getElementById('uploadPrompt');
    const uploadPreviewWrap = document.getElementById('uploadPreviewWrap');
    const uploadPreview = document.getElementById('uploadPreview');
    const removePhoto = document.getElementById('removePhoto');
    let capturedBase64Photo = null;

    if (uploadBox && woundPhoto) {
        uploadBox.addEventListener('click', (e) => {
            if (e.target.closest('.remove-photo')) return;
            woundPhoto.click();
        });

        woundPhoto.addEventListener('change', () => {
            const file = woundPhoto.files[0];
            if (file) processImageFile(file);
        });

        uploadBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadBox.classList.add('dragover');
        });

        uploadBox.addEventListener('dragleave', () => {
            uploadBox.classList.remove('dragover');
        });

        uploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadBox.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                woundPhoto.files = e.dataTransfer.files;
                processImageFile(file);
            }
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

    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            document.getElementById('itrForm').reset();
            document.querySelectorAll('.pill.active').forEach((p) => p.classList.remove('active'));
            if (animalOtherWrap) animalOtherWrap.hidden = true;
            capturedBase64Photo = null;
            uploadPreview.src = '';
            uploadPrompt.hidden = false;
            uploadPreviewWrap.hidden = true;
            recalculatePepSchedule(false);
        });
    }

    // ----------------------------------------------------
    // 3. Database Persistence Submission
    // ----------------------------------------------------
    const itrForm = document.getElementById('itrForm');
    if (itrForm) {
        itrForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!activeFacilityUid) {
                alert("Session Expired: Please log in again to register patients.");
                window.location.href = "abtc-login.html";
                return;
            }

            if (!itrForm.checkValidity()) {
                itrForm.reportValidity();
                return;
            }

            const submitBtn = itrForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving Patient Record...`;
            }

            try {
                const facilitySnap = await getDoc(doc(db, "facilities", activeFacilityUid));
                let acronym = "ABTC";
                if (facilitySnap.exists()) {
                    acronym = facilitySnap.data().acronym || facilitySnap.data().code || "ABTC";
                }

                const counterDocRef = doc(db, "facility_counters", activeFacilityUid);
                let generatedCustomId = "";

                await runTransaction(db, async (transaction) => {
                    const counterDoc = await transaction.get(counterDocRef);
                    let currentSeq = 0;
                    
                    if (counterDoc.exists()) {
                        currentSeq = counterDoc.data().currentSequence || 0;
                    }

                    const nextIndex = currentSeq + 1;
                    const paddedSequence = String(nextIndex).padStart(3, '0');
                    
                    generatedCustomId = `${acronym.toUpperCase()}-${paddedSequence}`;
                    transaction.set(counterDocRef, { currentSequence: nextIndex }, { merge: true });
                });

                const selectedAnimal = animalType.value === 'Other' ? document.getElementById('animalOther').value : animalType.value;
                const exposureCatValue = getPillValue('exposureCategory');
                const parsedFullName = document.getElementById('fullName').value.trim();
                const fullItrDisplayString = document.getElementById('recordNo').value;

                // Extract RIG Values safely
                const selectedRigType = document.getElementById('rigType') ? document.getElementById('rigType').value : '';
                const enteredRigDose = document.getElementById('rigDose') ? document.getElementById('rigDose').value.trim() : '';

                // Build payload matching 'patient-database' collection schema
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

                    // Core Patient Information
                    exposureDate: document.getElementById('exposureDate').value,
                    consultDateTime: document.getElementById('consultDateTime').value,
                    age: document.getElementById('age').value,
                    sex: document.getElementById('sex').value,
                    contactNo: document.getElementById('contactNo').value,
                    address: document.getElementById('address').value,
                    physician: document.getElementById('physician').value,

                    // Bite Details
                    biteArea: document.getElementById('biteArea').value,
                    animalType: selectedAnimal,
                    animalCaged: getPillValue('animalCaged'),
                    exposureCategory: exposureCatValue,
                    priorVaccination: getPillValue('priorVaccination'),
                    lastVaccDate: document.getElementById('lastVaccDate').value,

                    // Clinical Vitals
                    bp: document.getElementById('bp').value,
                    temp: document.getElementById('temp').value,
                    pulse: document.getElementById('pulse').value,
                    resp: document.getElementById('resp').value,
                    o2sat: document.getElementById('o2sat').value,
                    weight: document.getElementById('weight').value,

                    // Medical History
                    comorbidities: document.getElementById('comorbidities').value,
                    allergies: document.getElementById('allergies').value,
                    medications: document.getElementById('medications').value,

                    // Management & Treatment Plan
                    woundCare: document.getElementById('woundCare').value,
                    vaccineBrand: document.getElementById('vaccineBrand').value,
                    route: document.getElementById('route').value,
                    
                    // Structured RIG fields
                    rigType: selectedRigType,
                    rigDose: enteredRigDose,
                    immunoglobulin: selectedRigType ? `${selectedRigType}${enteredRigDose ? ' - ' + enteredRigDose : ''}` : (enteredRigDose || 'None'),

                    vaccSchedule: getPillValues('vaccSchedule'),
                    remarks: document.getElementById('remarks').value,

                    // Auto-Calculated Target Dates Map
                    pepScheduleDates: {
                        day0: dateInputDay0 ? dateInputDay0.value : '',
                        day3: dateInputDay3 ? dateInputDay3.value : '',
                        day7: dateInputDay7 ? dateInputDay7.value : '',
                        day14: dateInputDay14 ? dateInputDay14.value : '',
                        day28: dateInputDay28 ? dateInputDay28.value : ''
                    },

                    // Base64 Wound Photo
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