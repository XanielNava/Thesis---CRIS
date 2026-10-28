// ==========================================================================
// ABTC WORKSPACE PROFILE GATEKEEPER (Autonomous Badge Scan + PIN)
// Allows duty personnel to clock in independently without prior admin login
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
let resolvedFacilityId = null;

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
    resolvedFacilityId = null;
    scannedBanner.classList.remove("active");
    scannerSection.style.display = "block";
    nursePinInput.value = "";
    nursePinInput.disabled = true;
    btnClockIn.disabled = true;
}

// 🟢 AUTONOMOUS BADGE RESOLUTION
async function onQrCodeSuccess(decodedText) {
    try {
        const badgeData = JSON.parse(decodedText);

        if (badgeData.type !== "CRIS_STAFF_ID" || !badgeData.uid || !badgeData.facilityId) {
            alert("Invalid QR Code: Not a valid CRIS Staff ID Badge.");
            return;
        }

        const staffUid = badgeData.uid;
        const facId = badgeData.facilityId;

        // Fetch live staff record directly using badge coordinates
        let staffRecord = null;

        if (db) {
            // First check facilities/{facilityId}/staff/{uid}
            const staffDocRef = doc(db, "facilities", facId, "staff", staffUid);
            const staffSnap = await getDoc(staffDocRef);

            if (staffSnap.exists()) {
                staffRecord = { id: staffSnap.id, ...staffSnap.data() };
            } else {
                // Secondary fallback: check master users collection
                const userDocRef = doc(db, "users", staffUid);
                const userSnap = await getDoc(userDocRef);
                if (userSnap.exists()) {
                    staffRecord = { id: userSnap.id, ...userSnap.data() };
                }
            }
        }

        // Development fallback if Firestore offline
        if (!staffRecord) {
            if (staffUid === "staff-01") {
                staffRecord = { id: "staff-01", name: "Maria Santos, RN", position: "Triage Nurse", pin: "1234", status: "Active" };
            } else {
                alert("Staff record not found on system. Please contact your administrator.");
                return;
            }
        }

        // Verify account status
        if ((staffRecord.status || "").toLowerCase() === "deactivated") {
            alert("Access Denied: This staff account has been deactivated.");
            return;
        }

        // Cache resolved credentials
        activeScannedStaff = staffRecord;
        resolvedFacilityId = facId;

        // Display badge info
        scannedStaffName.textContent = staffRecord.name || staffRecord.fullName || "Staff Member";
        scannedStaffRole.textContent = staffRecord.position || staffRecord.facilityRole || "Duty Personnel";
        scannedBanner.classList.add("active");
        scannerSection.style.display = "none";

        // Stop camera and activate PIN entry
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

// 💼 Owner Card: Direct Route to Admin Login Screen
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
   3. INDEPENDENT CLOCK-IN PIN VERIFICATION
   ====================================================================== */

if (nurseForm) {
    nurseForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!activeScannedStaff) {
            alert("Please scan your staff badge ID first.");
            return;
        }

        const typedPin = nursePinInput.value.trim();
        const validPin = activeScannedStaff.pin || "1234";

        if (typedPin === String(validPin)) {
            const resolvedRole = activeScannedStaff.position || activeScannedStaff.facilityRole || "Nurse";
            const staffName = activeScannedStaff.name || activeScannedStaff.fullName || "Duty Staff";

            // Bind session for clinic workstation
            sessionStorage.setItem("activeDesignation", resolvedRole);
            sessionStorage.setItem("activePersonnelName", staffName);
            sessionStorage.setItem("activeStaffId", activeScannedStaff.id);
            sessionStorage.setItem("activeFacilityId", resolvedFacilityId || "fac_default");

            // Write session audit log
            try {
                if (db && resolvedFacilityId) {
                    await addDoc(collection(db, "audit_logs"), {
                        facilityId: resolvedFacilityId,
                        personnelName: staffName,
                        role: resolvedRole,
                        action: "Autonomous Duty Badge Sign-In",
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