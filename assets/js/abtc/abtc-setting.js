// abtc-setting.js - Core Profile & Workspace Meta Config Controller
// Conformed to CRIS Master Architecture ('facilities/{facilityId}')

import { 
    onAuthStateChanged, updatePassword, signOut 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { 
    doc, getDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Import shared central instances
import { auth, db } from '../firebase/firebase-config.js';

let currentFacilityId = sessionStorage.getItem("activeFacilityId") || null;
let processedBase64Logo = null;

// =====================================================
// 1. Fetch and Populate Facility Data
// =====================================================
async function loadFacilityData(facilityId) {
  if (!facilityId) return;
  currentFacilityId = facilityId;
  console.log(`Fetching facility settings for document ID: ${facilityId}`);
  
  const docRef = doc(db, "facilities", facilityId);
  
  try {
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      
      const facName = data.facilityName || data.name || "";
      const acronym = data.acronym || data.code || "";

      document.getElementById("facilityName").value = facName;
      document.getElementById("facilityCode").value = acronym;

      // Update active session branding
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
      
      if (data.logoData) {
         const sidebarLogo = document.getElementById("sidebarLogoPreview");
         if (sidebarLogo) {
             sidebarLogo.src = data.logoData;
         }
      }

      console.log("Facility configurations successfully loaded.");
    } else {
      console.warn(`No document found in Firestore under ID: ${facilityId}`);
    }
  } catch (error) {
    console.error("Firestore facility fetch error:", error);
  }
}

// =====================================================
// 2. File Selection Handler (Convert Image to Base64 String)
// =====================================================
const logoInputElement = document.getElementById("facilityLogo");
if (logoInputElement) {
    logoInputElement.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            alert("File Size Overflow: Please select a workspace logo file under 2MB.");
            logoInputElement.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            processedBase64Logo = reader.result;
            console.log("Logo image processed into Base64 format successfully.");
        };
        reader.readAsDataURL(file);
    });
}

// =====================================================
// 3. Save Facility Changes & Update Credentials
// =====================================================
async function saveFacilityChanges() {
  if (!currentFacilityId) {
    alert("Error: No active facility identity loaded. Please re-authenticate.");
    return;
  }

  const saveBtn = document.getElementById("saveFacilityBtn");
  const newPassword = document.getElementById("facilityPassword").value;
  const confirmPassword = document.getElementById("confirmFacilityPassword").value;

  let shouldUpdatePassword = false;

  if (newPassword || confirmPassword) {
    if (newPassword !== confirmPassword) {
      alert("Validation Error: The new passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      alert("Validation Error: Password must be at least 6 characters long.");
      return;
    }
    shouldUpdatePassword = true;
  }

  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

  try {
    // 1. Password update if requested
    if (shouldUpdatePassword && auth.currentUser) {
      try {
        await updatePassword(auth.currentUser, newPassword);
      } catch (pwErr) {
        if (pwErr.code === 'auth/requires-recent-login') {
          alert("Security Notice: Updating your password requires a recent login. Please log out, log in again, and retry.");
        } else {
          alert(`Password Update Notice: ${pwErr.message}`);
        }
      }
    }

    const facName = document.getElementById("facilityName").value.trim();
    const facAcronym = document.getElementById("facilityCode").value.trim().toUpperCase();

    // 2. Document update according to schema
    const docRef = doc(db, "facilities", currentFacilityId);
    const updatedData = {
      facilityName: facName,
      acronym: facAcronym,
      code: facAcronym,
      address: {
        street: document.getElementById("streetAddress").value.trim(),
        barangay: document.getElementById("barangay").value.trim(),
        city: document.getElementById("municipality").value.trim(),
        province: document.getElementById("province").value.trim()
      },
      contactInfo: {
        contactPerson: document.getElementById("adminName").value.trim(),
        phone: document.getElementById("contactNumber").value.trim(),
        email: document.getElementById("facilityEmail").value.trim()
      }
    };

    if (processedBase64Logo) {
        updatedData.logoData = processedBase64Logo;
    }

    await updateDoc(docRef, updatedData);

    // 3. Immediately sync session variables across all other views
    sessionStorage.setItem("activeFacilityName", facName);
    sessionStorage.setItem("activeFacilityAcronym", facAcronym);

    alert("Facility profile updated successfully!");

    if (processedBase64Logo) {
        const sidebarLogo = document.getElementById("sidebarLogoPreview");
        if (sidebarLogo) sidebarLogo.src = processedBase64Logo;
    }

    document.getElementById("facilityPassword").value = "";
    document.getElementById("confirmFacilityPassword").value = "";

  } catch (error) {
    console.error("Error updating facility profile:", error);
    alert(`Failed to save configuration changes: ${error.message}`);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Changes`;
  }
}

document.getElementById("saveFacilityBtn")?.addEventListener("click", saveFacilityChanges);

// Prioritize session facilityId from QR / login
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

// Intercept logout and clear session
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (confirm("Are you sure you want to exit configurations?")) {
            if (auth) await signOut(auth);
            sessionStorage.clear();
            localStorage.removeItem("activeDesignation");
            localStorage.removeItem("activePersonnelName");
            window.location.href = 'abtc-login.html';
        }
    });
}