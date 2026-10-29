// ==========================================================================
// ABTC WORKSPACE PROFILE GATEKEEPER (Autonomous Badge Scan + PIN)
// Conformed to CRIS Master Architecture with Autonomous Facility ID Resolution
// ==========================================================================

import { 
    collection, 
    doc, 
    getDoc, 
    addDoc 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

import { db } from '../firebase/firebase-config.js';

// DOM Elements
const nurseCard = document.getElementById("nurseProfileCard");
const ownerCard = document.getElementById("ownerProfileCard");
const nurseModal = document.getElementById("nurseModalOverlay");
const closeNurseModalBtn = document.getElementById("closeNurseModalBtn");
const nurseForm = document.getElementById("nurseVerificationForm");
const nursePinInput = document.getElementById("nursePinInput");
const btnClockIn = document.getElementById("btnClockIn");
const forgotPinLink = document.getElementById("forgotPinLink");

// Scanner UI Elements
const scannerSection = document.getElementById("scannerSection");
const scannedBanner = document.getElementById("scannedIdentityBanner");
const scannedStaffName = document.getElementById("scannedStaffName");
const scannedStaffRole = document.getElementById("scannedStaffRole");
const btnRescan = document.getElementById("btnRescan");

let html5QrScanner = null;
let activeScannedStaff = null;
let resolvedFacilityMeta = null;

/* ======================================================================
   1. QR SCANNER CONTROLLER (html5-qrcode)
   ====================================================================== */

function startBadgeScanner() {
    resetScannerState();

    if (html5QrScanner) {
        html5QrScanner.clear();
        html5QrScanner = null;
    }

    html5QrScanner = new Html5Qrcode("qrReader");
    const config = { fps: 10, qrbox: { width: 190, height: 190 } };

    html5QrScanner.start(
        { facingMode: "environment" },
        config,
        onQrCodeSuccess,
        onQrCodeFailure
    ).catch(err => {
        console.warn("Camera access failed:", err);
        alert("Camera error: Could not access video device for badge scanning.");
    });
}

function stopBadgeScanner() {
    if (html5QrScanner) {
        html5QrScanner.stop().then(() => {
            html5QrScanner.clear();
            html5QrScanner = null;
        }).catch(err => {
            console.warn("Error stopping QR camera:", err);
            html5QrScanner = null;
        });
    }
}

function resetScannerState() {
    activeScannedStaff = null;
    resolvedFacilityMeta = null;
    scannedBanner.classList.remove("active");
    scannerSection.style.display = "block";
    nursePinInput.value = "";
    nursePinInput.disabled = true;
    btnClockIn.disabled = true;
}

// 🟢 AUTONOMOUS BADGE RESOLUTION: Discovers Facility ID & Checks Status
async function onQrCodeSuccess(decodedText) {
    try {
        const badgeData = JSON.parse(decodedText);

        if (badgeData.type !== "CRIS_STAFF_ID" || !badgeData.uid || !badgeData.facilityId) {
            alert("Invalid QR Code: Not an authorized CRIS Staff ID Badge.");
            return;
        }

        const staffUid = badgeData.uid;
        const targetFacilityId = badgeData.facilityId;

        // 1. 🚨 DISCOVER & VERIFY PARENT FACILITY OPERATIONAL STATUS
        let facilityData = null;
        if (db) {
            const facDocRef = doc(db, "facilities", targetFacilityId);
            const facSnap = await getDoc(facDocRef);

            if (!facSnap.exists()) {
                alert("Unrecognized Facility: The facility encoded in this badge is not commissioned or has been deleted.");
                return;
            }

            facilityData = facSnap.data();
            const facilityStatus = (facilityData.status || "Active").toLowerCase();

            if (facilityStatus !== "active") {
                stopBadgeScanner();
                resetScannerState();
                alert(`Facility Suspended: Access for "${facilityData.facilityName || 'this facility'}" has been marked as ${facilityData.status.toUpperCase()} by the PHO. Duty clock-in is prohibited.`);
                return;
            }
        }

        // 2. FETCH & VERIFY STAFF MEMBER RECORD
        let staffRecord = null;
        if (db) {
            // Check subcollection first: facilities/{facilityId}/staff/{uid}
            const staffDocRef = doc(db, "facilities", targetFacilityId, "staff", staffUid);
            const staffSnap = await getDoc(staffDocRef);

            if (staffSnap.exists()) {
                staffRecord = { id: staffSnap.id, ...staffSnap.data() };
            } else {
                // Secondary fallback: master users collection
                const userDocRef = doc(db, "users", staffUid);
                const userSnap = await getDoc(userDocRef);
                if (userSnap.exists()) {
                    staffRecord = { id: userSnap.id, ...userSnap.data() };
                }
            }
        }

        if (!staffRecord) {
            alert("Staff record not found on this facility's roster. Please contact your administrator.");
            return;
        }

        // 3. VERIFY STAFF ACCOUNT STATUS
        if ((staffRecord.status || "Active").toLowerCase() === "deactivated") {
            alert("Access Denied: This staff personnel profile has been deactivated.");
            return;
        }

        // Cache resolved credentials for clock-in PIN submission
        activeScannedStaff = staffRecord;
        resolvedFacilityMeta = {
            id: targetFacilityId,
            name: facilityData?.facilityName || badgeData.facilityName || "ABTC Facility",
            acronym: facilityData?.acronym || facilityData?.code || badgeData.acronym || "ABTC"
        };

        // Display resolved badge info
        scannedStaffName.textContent = staffRecord.name || staffRecord.fullName || "Staff Member";
        scannedStaffRole.textContent = `${staffRecord.position || staffRecord.facilityRole || 'Staff'} • ${resolvedFacilityMeta.name}`;
        scannedBanner.classList.add("active");
        scannerSection.style.display = "none";

        // Stop camera and activate PIN input
        stopBadgeScanner();
        nursePinInput.disabled = false;
        btnClockIn.disabled = false;
        nursePinInput.focus();

    } catch (e) {
        console.warn("Unrecognized QR payload format:", decodedText);
    }
}

function onQrCodeFailure() {
    // Polling frame
}

if (btnRescan) {
    btnRescan.addEventListener("click", () => {
        startBadgeScanner();
    });
}

/* ======================================================================
   2. MODAL CONTROLS & ROUTING
   ====================================================================== */

// 🩺 Duty Personnel Card: Open Scanner
if (nurseCard && nurseModal) {
    nurseCard.addEventListener("click", () => {
        nurseModal.classList.add("active");
        startBadgeScanner();
    });
}

// 💼 Owner Card: Route to Admin Login Screen
if (ownerCard) {
    ownerCard.addEventListener("click", () => {
        stopBadgeScanner();
        window.location.href = "abtc-login.html";
    });
}

// Close Modal
if (closeNurseModalBtn && nurseModal) {
    closeNurseModalBtn.addEventListener("click", () => {
        nurseModal.classList.remove("active");
        stopBadgeScanner();
        resetScannerState();
    });
}

if (forgotPinLink) {
    forgotPinLink.addEventListener("click", (e) => {
        e.preventDefault();
        alert("PIN Notice: Please contact your Facility Administrator to retrieve or reset your 4-digit clock-in PIN.");
    });
}

/* ======================================================================
   3. INDEPENDENT CLOCK-IN PIN VERIFICATION & SESSION BINDING
   ====================================================================== */

if (nurseForm) {
    nurseForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!activeScannedStaff || !resolvedFacilityMeta) {
            alert("Please scan an authorized staff badge ID first.");
            return;
        }

        const typedPin = nursePinInput.value.trim();
        const validPin = activeScannedStaff.pin || "1234";

        if (typedPin === String(validPin)) {
            const resolvedRole = activeScannedStaff.position || activeScannedStaff.facilityRole || "Nurse";
            const staffName = activeScannedStaff.name || activeScannedStaff.fullName || "Duty Staff";

            // Bind full session context for the workstation
            sessionStorage.setItem("activeFacilityId", resolvedFacilityMeta.id);
            sessionStorage.setItem("activeFacilityName", resolvedFacilityMeta.name);
            sessionStorage.setItem("activeFacilityAcronym", resolvedFacilityMeta.acronym);
            sessionStorage.setItem("activeStaffId", activeScannedStaff.id);
            sessionStorage.setItem("activePersonnelName", staffName);
            sessionStorage.setItem("activeDesignation", resolvedRole);

            // Record verified audit trail
            try {
                if (db) {
                    await addDoc(collection(db, "audit_logs"), {
                        facilityId: resolvedFacilityMeta.id,
                        facilityName: resolvedFacilityMeta.name,
                        personnelName: staffName,
                        role: resolvedRole,
                        action: "Duty Badge Clock-In",
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (err) {
                console.warn("Audit trace log skipped:", err);
            }

            stopBadgeScanner();

            // Direct route based on clinic role
            if (resolvedRole.toLowerCase().includes("pharmacist")) {
                window.location.href = "abtc-pharmacy.html";
            } else {
                window.location.href = "abtc-home.html";
            }
        } else {
            alert("Access Denied: Incorrect 4-digit security PIN.");
            nursePinInput.value = "";
            nursePinInput.focus();
        }
    });
}