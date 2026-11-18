// ==========================================================================
// ABTC SETTINGS CONTROLLER (abtc-setting.js)
// Conformed to CRIS Master Architecture with Automated Spatial Coordinate Mapping
// ==========================================================================

import { 
    onAuthStateChanged, updatePassword, signOut 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { 
    doc, getDoc, updateDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { auth, db } from '../firebase/firebase-config.js';

let currentFacilityId = sessionStorage.getItem("activeFacilityId") || null;
let processedBase64Logo = null;
let activeResolvedCoordinates = { lat: 10.7202, lng: 122.5621 }; // Defaults to Iloilo City

// Fallback Municipal Centroids (Iloilo Province)
const ILOILO_CENTROIDS = {
    "iloilo city": { lat: 10.7202, lng: 122.5621 },
    "mandurriao": { lat: 10.7167, lng: 122.5333 },
    "jaro": { lat: 10.7333, lng: 122.5667 },
    "molo": { lat: 10.6975, lng: 122.5444 },
    "passi city": { lat: 11.1072, lng: 122.6417 },
    "pototan": { lat: 10.9472, lng: 122.6306 },
    "santa barbara": { lat: 10.8206, lng: 122.5336 },
    "pavia": { lat: 10.7761, lng: 122.5428 },
    "oton": { lat: 10.6958, lng: 122.4833 },
    "tigbauan": { lat: 10.6750, lng: 122.3781 },
    "guimbal": { lat: 10.6625, lng: 122.3167 },
    "miagao": { lat: 10.6431, lng: 122.2358 },
    "san joaquin": { lat: 10.5878, lng: 122.1408 },
    "dumangas": { lat: 10.8306, lng: 122.7153 },
    "barotac nuevo": { lat: 10.8931, lng: 122.7058 },
    "barotac viejo": { lat: 11.0483, lng: 122.8467 },
    "ajuy": { lat: 11.1714, lng: 122.9961 },
    "balasan": { lat: 11.4583, lng: 123.0833 },
    "carles": { lat: 11.5833, lng: 123.1333 },
    "estancia": { lat: 11.4561, lng: 123.1558 },
    "sara": { lat: 11.2589, lng: 123.0139 },
    "san dionisio": { lat: 11.2725, lng: 123.0903 },
    "concepcion": { lat: 11.2222, lng: 123.1111 },
    "calinog": { lat: 11.1250, lng: 122.5361 },
    "lambunao": { lat: 11.0569, lng: 122.4797 },
    "cabatuan": { lat: 10.8789, lng: 122.4864 },
    "alimodian": { lat: 10.8197, lng: 122.4283 },
    "leganes": { lat: 10.7850, lng: 122.5908 },
    "zarraga": { lat: 10.8219, lng: 122.6106 },
    "new lucena": { lat: 10.8878, lng: 122.5892 },
    "mina": { lat: 10.9306, lng: 122.5767 },
    "dingle": { lat: 11.0028, lng: 122.6681 },
    "dueñas": { lat: 11.0667, lng: 122.6167 },
    "san enrique": { lat: 11.0833, lng: 122.6667 },
    "bingawan": { lat: 11.2000, lng: 122.5667 },
    "lemery": { lat: 11.2333, lng: 122.9167 },
    "san rafael": { lat: 11.2000, lng: 122.8500 },
    "banate": { lat: 11.0167, lng: 122.8000 },
    "anilao": { lat: 10.9833, lng: 122.7500 },
    "tubungan": { lat: 10.7667, lng: 122.3167 },
    "igbaras": { lat: 10.7167, lng: 122.2667 },
    "leon": { lat: 10.7833, lng: 122.3833 },
    "san miguel": { lat: 10.7833, lng: 122.4667 }
};

// =====================================================
// 1. Fetch and Populate Facility Data
// =====================================================
async function loadFacilityData(facilityId) {
    if (!facilityId) return;
    currentFacilityId = facilityId;

    try {
        const docRef = doc(db, "facilities", facilityId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();

            const facName = data.facilityName || data.name || "";
            const acronym = data.acronym || data.code || "";

            document.getElementById("facilityName").value = facName;
            document.getElementById("facilityCode").value = acronym;

            sessionStorage.setItem("activeFacilityName", facName);
            sessionStorage.setItem("activeFacilityAcronym", acronym);

            if (data.contactInfo) {
                document.getElementById("adminName").value = data.contactInfo.contactPerson || "";
                document.getElementById("contactNumber").value = data.contactInfo.phone || "";
                document.getElementById("facilityEmail").value = data.contactInfo.email || "";
            }

            if (data.address) {
                document.getElementById("streetAddress").value = data.address.street || "";
                document.getElementById("barangay").value = data.address.barangay || "";
                document.getElementById("municipality").value = data.address.city || "";
                document.getElementById("province").value = data.address.province || "";
            }

            // Populate GIS Coordinates
            const lat = Number(data.coordinates?.lat ?? data.location?.latitude ?? 10.7202);
            const lng = Number(data.coordinates?.lng ?? data.location?.longitude ?? 122.5621);
            updateCoordinateDisplay(lat, lng, "(Stored in Database)");

            // Preview Logo
            if (data.logoData) {
                const sidebarLogo = document.getElementById("sidebarLogoPreview");
                if (sidebarLogo) sidebarLogo.src = data.logoData;
            }
        }
    } catch (error) {
        console.error("Firestore facility fetch error:", error);
    }
}

function updateCoordinateDisplay(lat, lng, method) {
    activeResolvedCoordinates = { lat, lng };
    document.getElementById("displayLat").textContent = lat.toFixed(4);
    document.getElementById("displayLng").textContent = lng.toFixed(4);
    document.getElementById("coordResolutionMethod").textContent = method;
}

// =====================================================
// 2. Spatial Geocoding Engine
// =====================================================
async function geocodeAddress(street, barangay, municipality, province) {
    const cleanMun = municipality.trim().toLowerCase();
    const cleanBarangay = barangay.trim().toLowerCase();

    // 1. Nominatim OpenStreetMap Geocoder
    try {
        const queryStr = `${street ? street + ', ' : ''}${barangay ? barangay + ', ' : ''}${municipality}, ${province}, Philippines`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}&limit=1`;
        
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (res.ok) {
            const results = await res.json();
            if (results && results.length > 0) {
                const lat = parseFloat(results[0].lat);
                const lng = parseFloat(results[0].lon);
                return { lat, lng, method: "✓ OpenStreetMap Geocoded" };
            }
        }
    } catch (e) {
        console.warn("OSM Nominatim resolution skipped:", e);
    }

    // 2. Municipal Centroid Dictionary Fallback
    if (ILOILO_CENTROIDS[cleanMun]) {
        return { ...ILOILO_CENTROIDS[cleanMun], method: "✓ Municipal Centroid Fallback" };
    }
    if (ILOILO_CENTROIDS[cleanBarangay]) {
        return { ...ILOILO_CENTROIDS[cleanBarangay], method: "✓ Barangay Centroid Fallback" };
    }

    // 3. Central Iloilo Provincial Default
    return { lat: 10.7202, lng: 122.5621, method: "✓ Provincial Default Centroid" };
}

// Recalibrate via browser GPS
document.getElementById("btnRecalibrateGps")?.addEventListener("click", () => {
    if (!navigator.geolocation) {
        alert("Browser GPS Error: Geolocation is not supported by your browser.");
        return;
    }

    const btn = document.getElementById("btnRecalibrateGps");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Reading GPS...`;

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = Number(pos.coords.latitude.toFixed(6));
            const lng = Number(pos.coords.longitude.toFixed(6));
            updateCoordinateDisplay(lat, lng, "✓ Live Browser GPS Locked");
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-crosshairs"></i> Recalibrate via Browser GPS`;
        },
        (err) => {
            alert(`GPS Access Denied or Timed Out: ${err.message}. Relying on municipal address geocoding.`);
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-crosshairs"></i> Recalibrate via Browser GPS`;
        },
        { enableHighAccuracy: true, timeout: 8000 }
    );
});

// =====================================================
// 3. Logo Upload to Base64 String
// =====================================================
const logoInputElement = document.getElementById("facilityLogo");
if (logoInputElement) {
    logoInputElement.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            alert("File Size Exceeded: Logo must be less than 2MB.");
            logoInputElement.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            processedBase64Logo = reader.result;
            const sidebarLogo = document.getElementById("sidebarLogoPreview");
            if (sidebarLogo) sidebarLogo.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

// =====================================================
// 4. Save Facility Metadata & Synchronize Coordinates
// =====================================================
async function saveFacilityChanges() {
    if (!currentFacilityId) {
        alert("Session Error: No active facility loaded.");
        return;
    }

    const saveBtn = document.getElementById("saveFacilityBtn");
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Geocoding &amp; Saving...`;

    try {
        const street = document.getElementById("streetAddress").value.trim();
        const barangay = document.getElementById("barangay").value.trim();
        const city = document.getElementById("municipality").value.trim();
        const province = document.getElementById("province").value.trim();

        // Automatically resolve coordinates for the address
        const resolvedGeo = await geocodeAddress(street, barangay, city, province);
        updateCoordinateDisplay(resolvedGeo.lat, resolvedGeo.lng, resolvedGeo.method);

        const docRef = doc(db, "facilities", currentFacilityId);
        const updatePayload = {
            address: {
                street: street,
                barangay: barangay,
                city: city,
                province: province
            },
            coordinates: {
                lat: resolvedGeo.lat,
                lng: resolvedGeo.lng
            },
            location: {
                latitude: resolvedGeo.lat,
                longitude: resolvedGeo.lng
            },
            contactInfo: {
                contactPerson: document.getElementById("adminName").value.trim(),
                phone: document.getElementById("contactNumber").value.trim(),
                email: document.getElementById("facilityEmail").value.trim()
            },
            updatedAt: serverTimestamp()
        };

        if (processedBase64Logo) {
            updatePayload.logoData = processedBase64Logo;
        }

        await updateDoc(docRef, updatePayload);

        alert(`Facility settings saved successfully!\nGIS Coordinates updated to [${resolvedGeo.lat.toFixed(4)}, ${resolvedGeo.lng.toFixed(4)}]`);

    } catch (error) {
        console.error("Error updating facility profile:", error);
        alert(`Failed to save configuration: ${error.message}`);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Changes &amp; Sync Coordinates`;
    }
}

document.getElementById("saveFacilityBtn")?.addEventListener("click", saveFacilityChanges);

// =====================================================
// 5. Separate Password Update Handler
// =====================================================
document.getElementById("updatePasswordBtn")?.addEventListener("click", async () => {
    const pw = document.getElementById("facilityPassword").value;
    const confirmPw = document.getElementById("confirmFacilityPassword").value;
    const btn = document.getElementById("updatePasswordBtn");

    if (!pw || !confirmPw) {
        alert("Please enter and confirm your new master password.");
        return;
    }

    if (pw !== confirmPw) {
        alert("Password Error: The entered passwords do not match.");
        return;
    }

    if (pw.length < 6) {
        alert("Password Error: Password must be at least 6 characters long.");
        return;
    }

    if (!auth.currentUser) {
        alert("Session Error: You must be logged in as an administrator to change credentials.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Updating Password...`;

    try {
        await updatePassword(auth.currentUser, pw);
        alert("Password updated successfully!");
        document.getElementById("facilityPassword").value = "";
        document.getElementById("confirmFacilityPassword").value = "";
    } catch (err) {
        if (err.code === "auth/requires-recent-login") {
            alert("Security Requirement: Please log out and sign in again before updating your master password.");
        } else {
            alert("Password Update Failed: " + err.message);
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-key"></i> Update Master Password`;
    }
});

// Auto-boot session data
if (currentFacilityId) {
    loadFacilityData(currentFacilityId);
}

if (auth) {
    onAuthStateChanged(auth, async (user) => {
        if (user && !currentFacilityId) {
            try {
                const userSnap = await getDoc(doc(db, "users", user.uid));
                if (userSnap.exists() && userSnap.data().facilityId) {
                    currentFacilityId = userSnap.data().facilityId;
                } else {
                    currentFacilityId = user.uid;
                }
            } catch (e) {
                currentFacilityId = user.uid;
            }
            sessionStorage.setItem("activeFacilityId", currentFacilityId);
            loadFacilityData(currentFacilityId);
        }
    });
}