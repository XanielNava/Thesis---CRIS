// abtc-login.js - Master Facility Gatekeeper for Multi-Tenant Shared Terminals
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { 
  getFirestore, doc, getDoc, updateDoc, collection, query, where, getDocs 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'; 

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
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================================
// 🏢 INTELLIGENT WORKPLACE LOOKUP (AS THEY TYPE)
// ==========================================================
document.getElementById("email")?.addEventListener("change", async (e) => {
  const emailValue = e.target.value.trim().toLowerCase();
  const indicatorBox = document.getElementById("facilityIndicator");
  const nameTextContainer = document.getElementById("facilityNameText");

  if (!emailValue) {
    if (indicatorBox) indicatorBox.style.display = "none";
    return;
  }

  try {
    const facilitiesRef = collection(db, "facilities");
    const q = query(facilitiesRef, where("contactInfo.email", "==", emailValue));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const facilityDoc = querySnapshot.docs[0];
      const facilityData = facilityDoc.data();
      
      if (nameTextContainer) nameTextContainer.innerText = facilityData.facilityName || "Registered ABTC Location";
      if (indicatorBox) indicatorBox.style.display = "block";
    } else {
      if (indicatorBox) indicatorBox.style.display = "none";
    }
  } catch (error) {
    console.error("Dynamic workspace identifier discovery failure:", error);
    if (indicatorBox) indicatorBox.style.display = "none";
  }
});

// ==========================================================
// 🔒 MASTER GATEKEEPER SUBMIT HANDSHAKE
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

    // 1. Authenticate facility baseline workspace tokens
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Security Status Firewall Check
    const facilityDocRef = doc(db, "facilities", user.uid);
    const facilitySnapshot = await getDoc(facilityDocRef);

    if (facilitySnapshot.exists()) {
      const facilityData = facilitySnapshot.data();

      if (facilityData.status === "Disabled") {
        await signOut(auth);
        alert("Access Denied: This facility terminal account has been suspended.");
        return; 
      }
      
      await updateDoc(facilityDocRef, { status: "Online" });
    }

    // 3. Tab-Isolated session initialization
    sessionStorage.setItem("authenticatedFacilityEmail", email);
    sessionStorage.removeItem("activeDesignation");
    sessionStorage.removeItem("activePersonnelName");

    // Clear stale global fallback storage
    localStorage.removeItem("activeDesignation");
    localStorage.removeItem("activePersonnelName");

    // 4. Route into Profile Selection Matrix
    window.location.href = 'abtc-profiles.html';

  } catch (error) {
    console.error('Terminal authentication failure:', error.code, error.message);
    
    let clientErrorMessage = "The email address or password you entered is incorrect.";
    if (error.code && !error.code.includes('auth/')) {
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