// abtc-profile.js - Secured Profile Gatekeeper Handler
import { signInWithEmailAndPassword, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { collection, addDoc, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// Import shared central instances (Managed by firebase-config.js switch)
import { auth, db } from './firebase-config.js';

// DOM Selection Elements
const nurseCard = document.getElementById("nurseProfileCard");
const ownerCard = document.getElementById("ownerProfileCard");
const ownerModal = document.getElementById("passwordModalOverlay");
const nurseModal = document.getElementById("nurseModalOverlay");
const closeOwnerModalBtn = document.getElementById("closeModalBtn");
const closeNurseModalBtn = document.getElementById("closeNurseModalBtn");
const ownerForm = document.getElementById("ownerVerificationForm");
const nurseForm = document.getElementById("nurseVerificationForm");
const ownerPasswordInput = document.getElementById("ownerPasswordInput");
const nursePinInput = document.getElementById("nursePinInput");
const nurseDropdown = document.getElementById("nurseSelectDropdown");
const forgotPinLink = document.getElementById("forgotPinLink");

let globalActiveFacilityId = null;
let cachedStaffArray = [];

// Track Active Facility Session Baseline
onAuthStateChanged(auth, async (user) => {
    if (user) {
        globalActiveFacilityId = user.uid;
        console.log("Active Facility Session Tracked:", globalActiveFacilityId);
        
        try {
            const facilityDocRef = doc(db, "facilities", user.uid);
            const facilitySnap = await getDoc(facilityDocRef);
            
            if (facilitySnap.exists()) {
                const facilityData = facilitySnap.data();
                if (facilityData.logoData) {
                    const ownerLogoImgElement = document.getElementById("ownerLogoPreview");
                    if (ownerLogoImgElement) {
                        ownerLogoImgElement.src = facilityData.logoData;
                        ownerLogoImgElement.style.backgroundColor = "transparent";
                        ownerLogoImgElement.style.padding = "0px";
                        ownerLogoImgElement.style.borderRadius = "50%";
                        ownerLogoImgElement.style.objectFit = "contain";
                    }
                }
            }
        } catch (logoFetchError) {
            console.error("Failed to dynamically resolve workspace logo image mapping:", logoFetchError);
        }

        await populatePersonnelDropdown(user.uid);
    } else {
        console.warn("No active session workspace located. Routing back to lock screen gate.");
        window.location.href = "abtc-login.html";
    }
});

// Load Live Subcollection Staff records directly into select dropdown lists
async function populatePersonnelDropdown(facilityId) {
    if (!nurseDropdown) return;
    try {
        const staffSnapshot = await getDocs(collection(db, "facilities", facilityId, "staff"));
        nurseDropdown.innerHTML = `<option value="" disabled selected>-- Choose Your Profile Identity --</option>`;
        cachedStaffArray = [];

        if (staffSnapshot.empty) {
            nurseDropdown.innerHTML = `<option value="" disabled>No active staff found. Contact Admin.</option>`;
            return;
        }

        staffSnapshot.forEach((doc) => {
            const data = doc.data();
            cachedStaffArray.push({ id: doc.id, ...data });

            const option = document.createElement("option");
            option.value = doc.id;
            const staffRole = data.position || data.role || 'Staff';
            option.innerText = `${data.name} (${staffRole})`;
            nurseDropdown.appendChild(option);
        });
    } catch (error) {
        console.error("Error reading facility database profiles:", error);
    }
}

// 🟢 WORKFLOW A: PERSONNEL SELECTION MODAL SYSTEM
if (nurseCard && nurseModal) {
    nurseCard.addEventListener("click", () => {
        nurseModal.classList.add("active");
        if (nurseDropdown) nurseDropdown.focus();
    });
}

// 🟡 WORKFLOW B: OWNER SELECTION MODAL SYSTEM
if (ownerCard && ownerModal) {
    ownerCard.addEventListener("click", () => {
        ownerModal.classList.add("active");
        if (ownerPasswordInput) ownerPasswordInput.focus();
    });
}

// Modal Dismiss Closes
if (closeOwnerModalBtn && ownerModal && ownerPasswordInput) {
    closeOwnerModalBtn.addEventListener("click", () => { ownerModal.classList.remove("active"); ownerPasswordInput.value = ""; });
}
if (closeNurseModalBtn && nurseModal && nursePinInput) {
    closeNurseModalBtn.addEventListener("click", () => { nurseModal.classList.remove("active"); nursePinInput.value = ""; });
}

// FORGOT PIN ACCESS COMPLIANCE HANDLER
if (forgotPinLink) {
    forgotPinLink.addEventListener("click", (e) => {
        e.preventDefault();
        alert("PIN Recovery Notice: Please request the Facility Owner or Administrator to check your profile under the 'Personnel & Audit Logs' administration page view to retrieve or re-assign your 4-digit security PIN.");
    });
}

// SECURITY ACCESS SUBMISSIONS & AUDIT TRACE LOG ENGINE
async function writeAuditRecord(name, role) {
    if (!globalActiveFacilityId) return;
    try {
        await addDoc(collection(db, "audit_logs"), {
            facilityId: globalActiveFacilityId,
            personnelName: name,
            role: role,
            action: "Terminal Profile Session Sign-In",
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.error("Security Trace Write Log Aborted:", e);
    }
}

// 🩺 CLINIC PERSONNEL SYSTEM CLOCK IN
if (nurseForm) {
    nurseForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const selectedStaffId = nurseDropdown.value;
        const typedPin = nursePinInput.value.trim();

        const matchedStaff = cachedStaffArray.find(person => person.id === selectedStaffId);

        if (!matchedStaff) {
            alert("Please identify your profile context row first from the list selection input.");
            return;
        }

        if (matchedStaff.pin === typedPin) {
            const resolvedRole = matchedStaff.position || matchedStaff.role || "Nurse";

            sessionStorage.setItem("activeDesignation", resolvedRole);
            sessionStorage.setItem("activePersonnelName", matchedStaff.name);
            localStorage.setItem("activeDesignation", resolvedRole);
            localStorage.setItem("activePersonnelName", matchedStaff.name);
            
            await writeAuditRecord(matchedStaff.name, resolvedRole);
            
            console.log(`Personnel profile match accepted for ${matchedStaff.name} [${resolvedRole}]. Routing...`);

            if (resolvedRole.toLowerCase().includes("pharmacist")) {
                window.location.href = "abtc-pharmacy.html";
            } else {
                window.location.href = "abtc-home.html";
            }
        } else {
            alert("Access Denied: The 4-digit passcode PIN entered does not match your roster record profile mapping.");
            nursePinInput.value = "";
            nursePinInput.focus();
        }
    });
}

// 💼 OWNER SYSTEM LOG ENTRY
if (ownerForm) {
    ownerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const enteredPassword = ownerPasswordInput.value;
        
        const activeFacilityEmail = auth.currentUser?.email 
            || sessionStorage.getItem("authenticatedFacilityEmail") 
            || localStorage.getItem("authenticatedFacilityEmail");

        if (!activeFacilityEmail) {
            alert("Session Error: Workspace credentials expired. Please re-login.");
            window.location.href = "abtc-login.html";
            return;
        }

        try {
            await signInWithEmailAndPassword(auth, activeFacilityEmail, enteredPassword);
            
            let dynamicAdminName = "Facility Administrator";
            if (globalActiveFacilityId) {
                const facilityDocRef = doc(db, "facilities", globalActiveFacilityId);
                const facilitySnapshot = await getDoc(facilityDocRef);
                if (facilitySnapshot.exists()) {
                    const facilityData = facilitySnapshot.data();
                    dynamicAdminName = facilityData.contactInfo?.contactPerson || dynamicAdminName;
                }
            }
            
            sessionStorage.setItem("activeDesignation", "Owner");
            sessionStorage.setItem("activePersonnelName", dynamicAdminName);
            localStorage.setItem("activeDesignation", "Owner");
            localStorage.setItem("activePersonnelName", dynamicAdminName);
            
            await writeAuditRecord(dynamicAdminName, "Owner");
            
            console.log(`Admin gate verified for ${dynamicAdminName}. Routing to dashboard panels...`);
            window.location.href = "abtc-dash.html";
        } catch (error) {
            console.error("Owner authentication checkpoint rejection handler:", error);
            alert("Access Denied: The administrative clearance control password typed is invalid.");
            ownerPasswordInput.value = "";
            ownerPasswordInput.focus();
        }
    });
}