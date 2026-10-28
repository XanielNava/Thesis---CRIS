// ==========================================================================
// ABTC WORKSPACE LOGIN GATEKEEPER (Dev-Unblocked Mode)
// ==========================================================================

import { 
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence
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
// 🔒 2. LOGIN FORM SUBMISSION
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

    // Ensure session persistence
    await setPersistence(auth, browserLocalPersistence);

    // Authenticate credentials
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log("Authenticated User UID:", user.uid);

    // Save baseline session context
    sessionStorage.setItem("authenticatedFacilityEmail", email);
    sessionStorage.setItem("activeDesignation", "Facility Head");
    sessionStorage.setItem("activePersonnelName", "Facility Administrator");

    // Attempt soft lookup of facilityId without blocking redirect if missing
    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const uData = userDocSnap.data();
        sessionStorage.setItem("activeFacilityId", uData.facilityId || "default_abtc");
      } else {
        sessionStorage.setItem("activeFacilityId", "default_abtc");
      }
    } catch (err) {
      console.warn("Soft facilityId lookup skipped:", err);
      sessionStorage.setItem("activeFacilityId", "default_abtc");
    }

    // Direct routing to Dashboard
    window.location.href = 'abtc-dash.html';

  } catch (error) {
    console.error('Terminal authentication failure:', error.code, error.message);
    
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