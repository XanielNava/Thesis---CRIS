// abtc-setting.js - Core Profile & Workspace Meta Config Controller
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getAuth, onAuthStateChanged, updatePassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBfqjfJoGz591aI8TJjhIS3T4OEvQxX11Y",
  authDomain: "cris-database-da989.firebaseapp.com",
  databaseURL: "https://cris-database-da989-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "cris-database-da989",
  storageBucket: "cris-database-da989.firebasestorage.app",
  messagingSenderId: "627885439681",
  appId: "1:627885439681:web:3c657d64c0aad9b4913240",
  measurementId: "G-0X99BH7GW4"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

let currentFacilityId = null;
let processedBase64Logo = null;

// =====================================================
// 1. Fetch and Populate Facility Data
// =====================================================
async function loadFacilityData(facilityId) {
  currentFacilityId = facilityId;
  console.log(`Fetching Firestore data for document ID: ${facilityId}`);
  
  const docRef = doc(db, "facilities", facilityId);
  
  try {
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      
      document.getElementById("facilityName").value = data.facilityName || "";
      document.getElementById("facilityCode").value = data.acronym || "";

      // 👤 Map data payload properties cleanly onto our new element inputs
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
    console.error("Firestore fetch error:", error);
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
// 3. Save Facility Changes & Update Password
// =====================================================
async function saveFacilityChanges() {
  if (!currentFacilityId) {
    alert("Error: No active facility identity loaded.");
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
  saveBtn.innerText = "Saving...";

  try {
    if (shouldUpdatePassword && auth.currentUser) {
      await updatePassword(auth.currentUser, newPassword);
    }

    const docRef = doc(db, "facilities", currentFacilityId);
    const updatedData = {
      facilityName: document.getElementById("facilityName").value.trim(),
      acronym: document.getElementById("facilityCode").value.trim(),
      address: {
        street: document.getElementById("streetAddress").value.trim(),
        barangay: document.getElementById("barangay").value.trim(),
        city: document.getElementById("municipality").value.trim(),
        province: document.getElementById("province").value.trim()
      },
      contactInfo: {
        contactPerson: document.getElementById("adminName").value.trim(), // 👤 Pushing the updated name value
        phone: document.getElementById("contactNumber").value.trim(),
        email: document.getElementById("facilityEmail").value.trim()
      }
    };

    if (processedBase64Logo) {
        updatedData.logoData = processedBase64Logo;
    }

    await updateDoc(docRef, updatedData);
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
    saveBtn.innerText = "Save Changes";
  }
}

document.getElementById("saveFacilityBtn").addEventListener("click", saveFacilityChanges);

onAuthStateChanged(auth, (user) => {
  if (user) {
    loadFacilityData(user.uid);
  } else {
    window.location.href = "abtc-login.html";
  }
});

const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (confirm("Are you sure you want to exit configurations?")) {
            await signOut(auth);
            localStorage.removeItem("activeDesignation");
            localStorage.removeItem("activePersonnelName");
            window.location.href = 'abtc-login.html';
        }
    });
}