// ==========================================================================
// ABTC WORKSPACE LOGIN GATEKEEPER
// Conformed to CRIS Master Architecture with Deactivation Security Guard
// ==========================================================================

import { 
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js'; 

import { auth, db } from '../firebase/firebase-config.js';

// ==========================================================
// 🏢 1. WORKPLACE LOOKUP AS USER TYPES EMAIL
// ==========================================================
document.getElementById("email")?.addEventListener("change", async (e) => {
  const emailValue = e.target.value.trim().toLowerCase();
  const indicatorBox = document.getElementById("facilityIndicator");
  const nameTextContainer = document.getElementById("facilityNameText");

  if (!emailValue) {
    if (indicatorBox) indicatorBox.classList.remove("visible");
    return;
  }

  try {
    const facilitiesRef = collection(db, "facilities");
    const facQ = query(facilitiesRef, where("contactInfo.email", "==", emailValue));
    const facSnap = await getDocs(facQ);
    
    if (!facSnap.empty) {
      const foundFacilityName = facSnap.docs[0].data().facilityName;
      if (nameTextContainer) nameTextContainer.innerText = foundFacilityName;
      if (indicatorBox) indicatorBox.classList.add("visible");
    } else {
      if (indicatorBox) indicatorBox.classList.remove("visible");
    }
  } catch (error) {
    console.warn("Facility preview discovery:", error);
    if (indicatorBox) indicatorBox.classList.remove("visible");
  }
});

// ==========================================================
// 🔒 2. LOGIN FORM SUBMISSION WITH DEACTIVATION BLOCKER
// ==========================================================
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;
  const loginBtn = document.getElementById('loginBtn');

  try {
    if (loginBtn) {
      loginBtn.textContent = 'Verifying workspace access...';
      loginBtn.disabled = true; 
    }

    // 1. Ensure local persistence
    await setPersistence(auth, browserLocalPersistence);

    // 2. Authenticate credentials
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 3. Resolve user identity and associated facility ID
    let facilityId = user.uid;
    let userFullName = "Facility Administrator";

    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const uData = userDocSnap.data();
        facilityId = uData.facilityId || user.uid;
        userFullName = uData.fullName || userFullName;
      }
    } catch (uErr) {
      console.warn("User profile resolution fallback:", uErr);
    }

    // 4. 🚨 STRICT OPERATIONAL STATUS VERIFICATION
    const facilityDocRef = doc(db, "facilities", facilityId);
    const facilitySnap = await getDoc(facilityDocRef);

    if (facilitySnap.exists()) {
      const facData = facilitySnap.data();
      const facStatus = (facData.status || "Active").toLowerCase();

      // If deactivated, suspended, or inactive by PHO -> BLOCK ACCESS
      if (facStatus !== "active") {
        await signOut(auth);
        sessionStorage.clear();
        localStorage.removeItem("activeDesignation");
        localStorage.removeItem("activePersonnelName");

        alert(`Access Denied: The facility "${facData.facilityName || 'ABTC'}" is currently ${facData.status.toUpperCase()} by the Provincial Health Office (PHO). Login is restricted.`);
        return;
      }

      // If active, populate full session context
      const facName = facData.facilityName || "ABTC Facility";
      const facAcronym = facData.acronym || facData.code || "ABTC";
      const adminName = facData.contactInfo?.contactPerson || userFullName;

      sessionStorage.setItem("activeFacilityId", facilityId);
      sessionStorage.setItem("activeFacilityName", facName);
      sessionStorage.setItem("activeFacilityAcronym", facAcronym);
      sessionStorage.setItem("authenticatedFacilityEmail", email);
      sessionStorage.setItem("activeDesignation", "Owner");
      sessionStorage.setItem("activePersonnelName", adminName);

    } else {
      // If no facility document exists, check pending application status
      const appDocRef = doc(db, "facility_applications", `app_${user.uid}`);
      const appSnap = await getDoc(appDocRef);

      if (appSnap.exists()) {
        await signOut(auth);
        sessionStorage.clear();
        alert("Application Pending: Your facility application is still undergoing review and accreditation by the PHO Administrator.");
        return;
      } else {
        await signOut(auth);
        sessionStorage.clear();
        alert("Authentication Error: No approved facility records linked to this account.");
        return;
      }
    }

    // 5. Navigate to Dashboard
    window.location.href = 'abtc-dash.html';

  } catch (error) {
    console.error('Authentication failure:', error.code, error.message);
    
    let clientErrorMessage = "The email address or password you entered is incorrect.";
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      clientErrorMessage = "Invalid email or password.";
    } else if (error.message) {
      clientErrorMessage = error.message;
    }

    alert('Login failed: ' + clientErrorMessage);
  } finally {
    if (loginBtn) {
      loginBtn.textContent = 'Login';
      loginBtn.disabled = false;
    }
  }
});