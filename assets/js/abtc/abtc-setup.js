// ==========================================================================
// CRIS ABTC MODULE - FACILITY SETUP & APPLICATION CONTROLLER (abtc-setup.js)
// Conformed to Master CRIS Architecture with Automated Geocoding
// ==========================================================================

import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Central config instance
import { auth, db } from '../firebase/firebase-config.js';

const setupForm = document.getElementById("abtcSetupForm");
const latInput = document.getElementById("abtcLatitude");
const lngInput = document.getElementById("abtcLongitude");
const geoStatus = document.getElementById("setupGeoStatus");
const btnGps = document.getElementById("btnDetectGpsSetup");
const cityInput = document.getElementById("abtcCity");

// ==========================================================================
// 1. AUTOMATIC GEOLOCATION & NOMINATIM FORWARD-GEOCODING ENGINE
// ==========================================================================

// Engine A: Browser Geolocation API
function detectCurrentGps() {
    if (!navigator.geolocation) {
        autoGeocodeAddress();
        return;
    }

    if (geoStatus) geoStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Locking GPS satellite coordinates...`;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude.toFixed(6);
            const lng = position.coords.longitude.toFixed(6);

            if (latInput) latInput.value = lat;
            if (lngInput) lngInput.value = lng;

            if (geoStatus) {
                geoStatus.innerHTML = `<span style="color:#15803d; font-weight:bold;"><i class="fa-solid fa-circle-check"></i> High-accuracy GPS locked (${lat}, ${lng})</span>`;
            }
        },
        (error) => {
            console.warn("GPS access ungranted or unavailable, falling back to address geocoder:", error.message);
            autoGeocodeAddress();
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
}

// Engine B: OpenStreetMap Forward Geocoder
async function autoGeocodeAddress() {
    const street = document.getElementById("abtcStreet")?.value.trim() || "";
    const brgy = document.getElementById("abtcBarangay")?.value.trim() || "";
    const city = cityInput?.value.trim() || "";
    const prov = document.getElementById("abtcProvince")?.value.trim() || "Iloilo";

    if (!city) return null;

    const queryParts = [street, brgy, city, prov, "Philippines"].filter(p => p.length > 0);
    const queryStr = queryParts.join(", ");

    if (geoStatus) geoStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Geocoding "${city}, ${prov}"...`;

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}&limit=1`, {
            headers: {
                "Accept-Language": "en",
                "User-Agent": "CRIS-Rabies-System/1.0"
            }
        });

        const results = await response.json();

        if (results && results.length > 0) {
            const lat = parseFloat(results[0].lat).toFixed(6);
            const lng = parseFloat(results[0].lon).toFixed(6);

            if (latInput) latInput.value = lat;
            if (lngInput) lngInput.value = lng;

            if (geoStatus) {
                geoStatus.innerHTML = `<span style="color:#15803d; font-weight:bold;"><i class="fa-solid fa-circle-check"></i> Resolved from address: ${lat}, ${lng}</span>`;
            }
            return { lat: parseFloat(lat), lng: parseFloat(lng) };
        } else {
            // Broaden search to city + province
            const broadQuery = `${city}, ${prov}, Philippines`;
            const broadResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(broadQuery)}&limit=1`);
            const broadResults = await broadResponse.json();

            if (broadResults && broadResults.length > 0) {
                const lat = parseFloat(broadResults[0].lat).toFixed(6);
                const lng = parseFloat(broadResults[0].lon).toFixed(6);

                if (latInput) latInput.value = lat;
                if (lngInput) lngInput.value = lng;

                if (geoStatus) {
                    geoStatus.innerHTML = `<span style="color:#d97706;"><i class="fa-solid fa-map-location-dot"></i> Centroid mapped for ${city}: ${lat}, ${lng}</span>`;
                }
                return { lat: parseFloat(lat), lng: parseFloat(lng) };
            }
        }
    } catch (err) {
        console.warn("Geocoding service error:", err);
    }

    if (geoStatus) {
        geoStatus.innerHTML = `<span style="color:#b91c1c;">Could not resolve location. Please verify City / Municipality spelling.</span>`;
    }
    return null;
}

// Event Listeners for Geolocation
if (btnGps) btnGps.addEventListener("click", detectCurrentGps);

if (cityInput) {
    cityInput.addEventListener("blur", () => {
        if (!latInput.value || !lngInput.value) {
            autoGeocodeAddress();
        }
    });
}

// Run GPS check on initial form load
document.addEventListener("DOMContentLoaded", () => {
    detectCurrentGps();
});

// ==========================================================================
// 2. SUBMISSION ENGINE: MASTER REGISTRATION WITH SPATIAL COORDINATES
// ==========================================================================

if (setupForm) {
    setupForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        // 1. Password Validation
        const password = document.getElementById("abtcPassword").value;
        const confirmPassword = document.getElementById("confirmAbtcPassword").value;

        if (password !== confirmPassword) {
            alert("Validation Error: Passwords do not match. Please verify and try again.");
            return;
        }

        if (password.length < 6) {
            alert("Validation Error: Password must be at least 6 characters long.");
            return;
        }

        // 2. Automatic Coordinate Check (if inputs are still blank upon submit)
        let finalLat = parseFloat(latInput?.value);
        let finalLng = parseFloat(lngInput?.value);

        if (isNaN(finalLat) || isNaN(finalLng)) {
            const resolved = await autoGeocodeAddress();
            if (resolved) {
                finalLat = resolved.lat;
                finalLng = resolved.lng;
            }
        }

        // 3. Field Extractions
        const email = document.getElementById("abtcEmail").value.trim();
        const facilityName = document.getElementById("abtcName").value.trim();
        const acronym = document.getElementById("abtcCode").value.toUpperCase().trim();
        const facilityType = document.getElementById("abtcType").value;
        
        const street = document.getElementById("abtcStreet").value.trim();
        const barangay = document.getElementById("abtcBarangay").value.trim();
        const city = cityInput.value.trim();
        const province = document.getElementById("abtcProvince").value.trim();
        
        const contactPerson = document.getElementById("abtcContactPerson").value.trim();
        const position = document.getElementById("abtcPosition").value.trim();
        const phone = document.getElementById("abtcPhone").value.trim();

        const dohLto = document.getElementById("abtcDohLto").value.trim();
        const ownershipType = document.getElementById("abtcOwnership").value;
        const hasColdChain = document.getElementById("abtcColdChainCheck").checked;

        const submitBtn = e.target.querySelector(".btn-submit") || e.target.querySelector("button[type='submit']");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Submitting Application...`;
        }

        try {
            console.log("Registering applicant authentication profile...");
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const userUid = userCredential.user.uid;

            // 4. Save into 'users' collection
            console.log("Saving user profile to 'users'...");
            await setDoc(doc(db, "users", userUid), {
                uid: userUid,
                email: email,
                fullName: contactPerson,
                position: position,
                designation: "Facility Head",
                globalRole: "staff",
                status: "Pending",
                createdAt: serverTimestamp()
            });

            // 5. Submit into 'facility_applications' with spatial mapping
            console.log("Submitting record to 'facility_applications' with coordinates...");
            await setDoc(doc(db, "facility_applications", `app_${userUid}`), {
                applicantUid: userUid,
                facilityName: facilityName,
                acronym: acronym,
                code: acronym,
                facilityType: facilityType,
                address: {
                    street: street,
                    barangay: barangay,
                    city: city,
                    province: province
                },
                // Dual spatial coordinates for heatmaps and GIS routing
                coordinates: {
                    lat: isNaN(finalLat) ? null : finalLat,
                    lng: isNaN(finalLng) ? null : finalLng
                },
                location: {
                    latitude: isNaN(finalLat) ? null : finalLat,
                    longitude: isNaN(finalLng) ? null : finalLng
                },
                contactInfo: {
                    contactPerson: contactPerson,
                    position: position,
                    phone: phone,
                    email: email
                },
                regulatoryData: {
                    dohLto: dohLto,
                    ownershipType: ownershipType,
                    coldChainCompliant: hasColdChain
                },
                reviewStatus: "Pending",
                submittedAt: serverTimestamp()
            });

            alert(`Registration Submitted!\nFacility: ${facilityName} (${acronym})\nCoordinates: ${isNaN(finalLat) ? 'Pending GIS' : `${finalLat}, ${finalLng}`}\n\nYour application is now pending verification by the PHO Administrator.`);
            window.location.href = "abtc-login.html";

        } catch (error) {
            console.error("Facility setup submission error:", error);
            if (error.code === "auth/email-already-in-use") {
                alert("Setup Failed: This email address is already registered in the system.");
            } else {
                alert("Setup Failed: " + error.message);
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = "Submit Application for Review";
            }
        }
    });
}