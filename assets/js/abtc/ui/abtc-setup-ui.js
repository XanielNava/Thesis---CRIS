/* ==========================================================================
   CRIS ABTC MODULE — FACILITY SETUP UI CONTROLLER (abtc-setup-ui.js)
   Captures exact on-site Device Geolocation (Latitude & Longitude)
   ========================================================================== */

import { submitAbtcFacilityApplication } from '../db/abtc-setup-db.js';

const $ = (id) => document.getElementById(id);

/* ==========================================================================
   1. STRICT DEVICE GEOLOCATION ENGINE
   ========================================================================== */

function setGeoStatus(html) {
    const geoStatus = $('setupGeoStatus');
    if (geoStatus) geoStatus.innerHTML = html;
}

/**
 * Strictly captures the current device's physical latitude and longitude.
 * Does NOT fall back to typed address geocoding.
 */
function detectDeviceLocation() {
    const latInput = $('abtcLatitude');
    const lngInput = $('abtcLongitude');

    if (!navigator.geolocation) {
        setGeoStatus(
            `<span style="color:#b91c1c;"><i class="fa-solid fa-circle-xmark"></i> Geolocation is not supported by this browser/device.</span>`
        );
        return;
    }

    setGeoStatus(`<i class="fa-solid fa-spinner fa-spin"></i> Acquiring exact device coordinates...`);

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude.toFixed(6);
            const lng = position.coords.longitude.toFixed(6);
            const accuracyMeters = Math.round(position.coords.accuracy || 0);

            if (latInput) latInput.value = lat;
            if (lngInput) lngInput.value = lng;

            setGeoStatus(
                `<span style="color:#15803d; font-weight:bold;"><i class="fa-solid fa-location-crosshairs"></i> Device location locked: ${lat}, ${lng} (±${accuracyMeters}m)</span>`
            );
        },
        (error) => {
            console.warn('Device geolocation error:', error.code, error.message);

            let reason = 'Unable to acquire device location.';
            if (error.code === 1) {
                reason = 'Location permission denied. Please allow Location access in your browser settings and try again.';
            } else if (error.code === 2) {
                reason = 'Device position unavailable. Turn ON device Location Services / GPS and Wi-Fi.';
            } else if (error.code === 3) {
                reason = 'Location request timed out. Ensure device GPS / Location Services is enabled and retry.';
            }

            setGeoStatus(
                `<span style="color:#b91c1c;"><i class="fa-solid fa-triangle-exclamation"></i> ${reason}</span>`
            );
        },
        {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 0
        }
    );
}

/* ==========================================================================
   2. FORM SUBMISSION & EVENT WIRING
   ========================================================================== */

async function handleSetupSubmit(e) {
    e.preventDefault();

    const password = $('abtcPassword')?.value || '';
    const confirmPassword = $('confirmAbtcPassword')?.value || '';

    if (password !== confirmPassword) {
        alert('Validation Error: Passwords do not match. Please verify and try again.');
        return;
    }

    if (password.length < 6) {
        alert('Validation Error: Password must be at least 6 characters long.');
        return;
    }

    const finalLat = parseFloat($('abtcLatitude')?.value);
    const finalLng = parseFloat($('abtcLongitude')?.value);

    if (isNaN(finalLat) || isNaN(finalLng)) {
        alert('Location Required: Please allow Location access and click "Auto-Detect" so the device can capture the facility\'s exact coordinates.');
        detectDeviceLocation();
        return;
    }

    const applicationData = {
        email: $('abtcEmail')?.value.trim() || '',
        facilityName: $('abtcName')?.value.trim() || '',
        acronym: $('abtcCode')?.value.toUpperCase().trim() || '',
        facilityType: $('abtcType')?.value || '',
        street: $('abtcStreet')?.value.trim() || '',
        barangay: $('abtcBarangay')?.value.trim() || '',
        city: $('abtcCity')?.value.trim() || '',
        province: $('abtcProvince')?.value.trim() || 'Iloilo',
        lat: finalLat,
        lng: finalLng,
        contactPerson: $('abtcContactPerson')?.value.trim() || '',
        position: $('abtcPosition')?.value.trim() || '',
        phone: $('abtcPhone')?.value.trim() || '',
        dohLto: $('abtcDohLto')?.value.trim() || '',
        ownershipType: $('abtcOwnership')?.value || '',
        hasColdChain: Boolean($('abtcColdChainCheck')?.checked)
    };

    const submitBtn = e.target.querySelector('.btn-submit') || e.target.querySelector("button[type='submit']");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Submitting Application...`;
    }

    try {
        const result = await submitAbtcFacilityApplication(applicationData, password);

        alert(
            `Registration Submitted!\nFacility: ${result.facilityName} (${result.acronym})\nDevice Coordinates: ${result.lat}, ${result.lng}\n\nYour application is now pending verification by the PHO Administrator.`
        );
        window.location.href = 'abtc-login.html';
    } catch (error) {
        console.error('Facility setup submission error:', error);
        alert('Setup Failed: ' + error.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Submit Application for Review';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    $('btnDetectGpsSetup')?.addEventListener('click', detectDeviceLocation);
    $('abtcSetupForm')?.addEventListener('submit', handleSetupSubmit);

    // Automatically capture device location as soon as the setup page opens
    detectDeviceLocation();
});