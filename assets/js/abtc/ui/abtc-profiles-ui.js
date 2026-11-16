/* ==========================================================================
   ABTC WORKSPACE PROFILE GATEKEEPER — UI CONTROLLER (abtc-profile-ui.js)
   Manages QR Badge instant clock-in & Email + Default PIN fallback modal
   ========================================================================== */

import {
    verifyStaffByQrBadge,
    verifyStaffByEmailAndPin,
    recordDutyClockInAudit
} from '../db/abtc-profile-db.js';

const $ = (id) => document.getElementById(id);

let html5QrScanner = null;
let isAuthenticating = false;

/* ==========================================================================
   1. SESSION BINDING & REDIRECT
   ========================================================================== */

async function completeStaffClockIn(session) {
    sessionStorage.setItem('activeFacilityId', session.facilityId);
    sessionStorage.setItem('activeFacilityName', session.facilityName);
    sessionStorage.setItem('activeFacilityAcronym', session.facilityAcronym);
    sessionStorage.setItem('activeStaffId', session.staffId);
    sessionStorage.setItem('activePersonnelName', session.staffName);
    sessionStorage.setItem('activeDesignation', session.role);

    await recordDutyClockInAudit(session);
    window.location.href = session.redirectUrl;
}

/* ==========================================================================
   2. QR SCANNER CONTROLLER (INSTANT CLOCK-IN — NO PIN)
   ========================================================================== */

function startBadgeScanner() {
    resetScannerUI();

    if (html5QrScanner) {
        try {
            html5QrScanner.clear();
        } catch {
            // Ignore clear error if not initialized
        }
        html5QrScanner = null;
    }

    html5QrScanner = new Html5Qrcode('qrReader');
    const config = { fps: 10, qrbox: { width: 190, height: 190 } };

    html5QrScanner.start(
        { facingMode: 'environment' },
        config,
        onQrCodeSuccess,
        () => {} // Ignore empty polling frames
    ).catch((err) => {
        console.warn('Camera access failed:', err);
        alert('Camera error: Could not access video device. You can switch to "Email & PIN" to clock in.');
    });
}

function stopBadgeScanner() {
    if (!html5QrScanner) return;
    html5QrScanner.stop().then(() => {
        html5QrScanner.clear();
        html5QrScanner = null;
    }).catch(() => {
        html5QrScanner = null;
    });
}

function resetScannerUI() {
    isAuthenticating = false;
    $('scannedIdentityBanner')?.classList.remove('active');
    if ($('scannerSection')) $('scannerSection').style.display = 'block';
    if ($('staffEmailInput')) $('staffEmailInput').value = '';
    if ($('nursePinInput')) $('nursePinInput').value = '';
}

async function onQrCodeSuccess(decodedText) {
    if (isAuthenticating) return;
    isAuthenticating = true;

    try {
        const session = await verifyStaffByQrBadge(decodedText);

        // Stop camera and show brief identity confirmation while redirecting
        stopBadgeScanner();
        if ($('scannedStaffName')) $('scannedStaffName').textContent = session.staffName;
        if ($('scannedStaffRole')) $('scannedStaffRole').textContent = `${session.role} • ${session.facilityName}`;
        $('scannedIdentityBanner')?.classList.add('active');
        if ($('scannerSection')) $('scannerSection').style.display = 'none';

        await completeStaffClockIn(session);
    } catch (err) {
        isAuthenticating = false;
        console.warn('QR Clock-In error:', err);
        alert(err.message || 'Invalid QR Code: Not an authorized CRIS Staff ID Badge.');
    }
}

/* ==========================================================================
   3. MODAL MODE SWITCHING (QR BADGE vs. EMAIL & DEFAULT PIN)
   ========================================================================== */

function switchModalMode(mode) {
    const isQr = mode === 'qr';

    $('tabQrScan')?.classList.toggle('active', isQr);
    $('tabQrScan')?.setAttribute('aria-selected', String(isQr));

    $('tabEmailPin')?.classList.toggle('active', !isQr);
    $('tabEmailPin')?.setAttribute('aria-selected', String(!isQr));

    if ($('qrClockInPanel')) $('qrClockInPanel').hidden = !isQr;
    if ($('emailPinClockInPanel')) $('emailPinClockInPanel').hidden = isQr;

    if (isQr) {
        startBadgeScanner();
    } else {
        stopBadgeScanner();
        $('staffEmailInput')?.focus();
    }
}

function closeDutyModal() {
    $('nurseModalOverlay')?.classList.remove('active');
    stopBadgeScanner();
    resetScannerUI();
}

/* ==========================================================================
   4. EVENT WIRING
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // Duty Personnel Card -> Open Modal in QR Badge Mode
    $('nurseProfileCard')?.addEventListener('click', () => {
        $('nurseModalOverlay')?.classList.add('active');
        switchModalMode('qr');
    });

    // Owner / Admin Card -> Route to ABTC Admin Login
    $('ownerProfileCard')?.addEventListener('click', () => {
        stopBadgeScanner();
        window.location.href = 'abtc-login.html';
    });

    // Mode Switcher Tabs & Fallback Button
    $('tabQrScan')?.addEventListener('click', () => switchModalMode('qr'));
    $('tabEmailPin')?.addEventListener('click', () => switchModalMode('email-pin'));
    $('switchToFallbackBtn')?.addEventListener('click', () => switchModalMode('email-pin'));

    // Modal Cancel Buttons
    $('closeNurseModalBtn')?.addEventListener('click', closeDutyModal);
    $('cancelEmailPinBtn')?.addEventListener('click', closeDutyModal);

    // Forgot Default PIN Notice
    $('forgotPinLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        alert('PIN Notice: Please contact your Facility Administrator to retrieve or reset your default clock-in PIN.');
    });

    // Alternative Email + Default PIN Form Submission
    $('nurseVerificationForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isAuthenticating) return;

        const email = $('staffEmailInput')?.value.trim() || '';
        const pin = $('nursePinInput')?.value.trim() || '';
        const submitBtn = $('btnClockIn');

        try {
            isAuthenticating = true;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Clocking In...';
            }

            const session = await verifyStaffByEmailAndPin(email, pin);
            await completeStaffClockIn(session);
        } catch (err) {
            isAuthenticating = false;
            alert(err.message || 'Access Denied: Invalid email or security PIN.');
            if ($('nursePinInput')) {
                $('nursePinInput').value = '';
                $('nursePinInput').focus();
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Clock In';
            }
        }
    });
});