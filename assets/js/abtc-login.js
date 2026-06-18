// PVO Login.js - CDN VERSION with Active Real-Time Status Handshake
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'; // 🌟 Added updateDoc to imports

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

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Login form handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const loginBtn = document.getElementById('loginBtn');

  try {
    loginBtn.textContent = 'Logging in...';
    loginBtn.disabled = true; 

    // 1. Authenticate user via Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log("Authenticated user UID:", user.uid);

    // 2. 🔒 THE SECURITY FIREWALL & ACCESS GRANTED HANDLING
    const facilityDocRef = doc(db, "facilities", user.uid);
    const facilitySnapshot = await getDoc(facilityDocRef);

    if (facilitySnapshot.exists()) {
      const facilityData = facilitySnapshot.data();

      // 🛑 CASE A: The facility has been suspended by the Admin
      if (facilityData.status === "Disabled") {
        await signOut(auth); // Disconnect their auth session immediately
        alert("Access Denied: This facility account has been suspended by the Admin.");
        return; // Kill the process loop completely
      }
      
      // 🟢 CASE B: The facility is active and NOT disabled
      // Update their status to "Online" in Firestore right before moving forward
      await updateDoc(facilityDocRef, {
        status: "Online"
      });
      
    } else {
      console.warn("No matching metadata profile found in Firestore for this user.");
    }

    // 3. ✅ Redirect directly to the dashboard module layout view
    window.location.href = 'abtc-reg.html';

  } catch (error) {
    console.error('Login error:', error.code, error.message);
    
    // Clean up Firebase error messages for a professional look
    let clientErrorMessage = error.message;
    if (
      error.code === 'auth/invalid-credential' || 
      error.code === 'auth/user-not-found' || 
      error.code === 'auth/wrong-password'
    ) {
      clientErrorMessage = "The email address or password you entered is incorrect.";
    }

    alert('Login failed: ' + clientErrorMessage);
  } finally {
    loginBtn.textContent = 'Login';
    loginBtn.disabled = false;
  }
});