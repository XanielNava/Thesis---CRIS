/* ==========================================================================
   CRIS ABTC MODULE — FACILITY SETUP UI CONTROLLER (abtc-setup-ui.js)
   Handles GPS/Nominatim geolocation UI, form capture, validation, & routing
   ========================================================================== */

import { submitAbtcFacilityApplication } from '../db/abtc-setup-db.js';

const $ = (id) => document.getElementById(id);

/* ==========================================================================
   1. AUTOMATIC GEOLOCATION & NOMINATIM FORWARD-GEOCODING ENGINE
   ========================================================================== */

function setGeoStatus(html) {
    const geoStatus = $('setupGeoStatus');
    if (geoStatus) geoStatus.innerHTML = html;
}

function detectCurrentGps() {
    const latInput = $('abtcLatitude');
    const lngInput = $('abtcLongitude');

    if (!navigator.geolocation) {
        autoGeocodeAddress();
        return;
    }

    setGeoStatus(`<i class="fa-solid fa-spinner fa-spin"></i> Locking GPS satellite coordinates...`);

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude.toFixed(6);
            const lng = position.coords.longitude.toFixed(6);

            if (latInput) latInput.value = lat;
            if (lngInput) lngInput.value = lng;

            setGeoStatus(
                `<span style="color:#15803d; font-weight:bold;"><i class="fa-solid fa-circle-check"></i> High-accuracy GPS locked (${lat}, ${lng})</span>`
            );
        },
        (error) => {
            console.warn('GPS access ungranted or unavailable, falling back to address geocoder:', error.message);
            autoGeocodeAddress();
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
}

async function autoGeocodeAddress() {
    const latInput = $('abtcLatitude');
    const lngInput = $('abtcLongitude');
    const street = $('abtcStreet')?.value.trim() || '';
    const brgy = $('abtcBarangay')?.value.trim() || '';
    const city = $('abtcCity')?.value.trim() || '';
    const prov = $('abtcProvince')?.value.trim() || 'Iloilo';

    if (!city) return null;

    const queryParts = [street, brgy, city, prov, 'Philippines'].filter((p) => p.length > 0);
    const queryStr = queryParts.join(', ');

    setGeoStatus(`<i class="fa-solid fa-spinner fa-spin"></i> Geocoding "${city}, ${prov}"...`);

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}&limit=1`,
            {
                headers: {
                    'Accept-Language': 'en',
                    'User-Agent': 'CRIS-Rabies-System/1.0'
                }
            }
        );

        const results = await response.json();

        if (results && results.length > 0) {
            const lat = parseFloat(results[0].lat).toFixed(6);
            const lng = parseFloat(results[0].lon).toFixed(6);

            if (latInput) latInput.value = lat;
            if (lngInput) lngInput.value = lng;

            setGeoStatus(
                `<span style="color:#15803d; font-weight:bold;"><i class="fa-solid fa-circle-check"></i> Resolved from address: ${lat}, ${lng}</span>`
            );
            return { lat: parseFloat(lat), lng: parseFloat(lng) };
        }

        // Broaden search to city + province
        const broadQuery = `${city}, ${prov}, Philippines`;
        const broadResponse = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(broadQuery)}&limit=1`
        );
        const broadResults = await broadResponse.json();

        if (broadResults && broadResults.length > 0) {
            const lat = parseFloat(broadResults[0].lat).toFixed(6);
            const lng = parseFloat(broadResults[0].lon).toFixed(6);

            if (latInput) latInput.value = lat;
            if (lngInput) lngInput.value = lng;

            setGeoStatus(
                `<span style="color:#d97706;"><i class="fa-solid fa-map-location-dot"></i> Centroid mapped for ${city}: ${lat}, ${lng}</span>`
            );
            return { lat: parseFloat(lat), lng: parseFloat(lng) };
        }
    } catch (err) {
        console.warn('Geocoding service error:', err);
    }

    setGeoStatus(
        `<span style="color:#b91c1c;">Could not resolve location. Please verify City / Municipality spelling.</span>`
    );
    return null;
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

    const latInput = $('abtcLatitude');
    const lngInput = $('abtcLongitude');
    let finalLat = parseFloat(latInput?.value);
    let finalLng = parseFloat(lngInput?.value);

    if (isNaN(finalLat) || isNaN(finalLng)) {
        const resolved = await autoGeocodeAddress();
        if (resolved) {
            finalLat = resolved.lat;
            finalLng = resolved.lng;
        }
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

        const coordDisplay = result.lat !== null && result.lng !== null
            ? `${result.lat}, ${result.lng}`
            : 'Pending GIS';

        alert(
            `Registration Submitted!\nFacility: ${result.facilityName} (${result.acronym})\nCoordinates: ${coordDisplay}\n\nYour application is now pending verification by the PHO Administrator.`
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
    $('btnDetectGpsSetup')?.addEventListener('click', detectCurrentGps);

    $('abtcCity')?.addEventListener('blur', () => {
        if (!$('abtcLatitude')?.value || !$('abtcLongitude')?.value) {
            autoGeocodeAddress();
        }
    });

    $('abtcSetupForm')?.addEventListener('submit', handleSetupSubmit);

    // Run initial GPS detection on page load
    detectCurrentGps();
});