// PVO Login.js - CDN VERSION (Works in any browser)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


// ✅ Read the user's REAL designation from Firestore
async function getUserDesignation(uid) {
  const userDocRef = doc(db, "users", uid); // change path to your own, e.g., "pvo_users/{uid}"
  const userDocSnap = await getDoc(userDocRef);

  if (!userDocSnap.exists()) {
    throw new Error("The username, password, or designation is incorrect.");
  }

  const data = userDocSnap.data();
  return data.designation; // this is the designation they chose during signup
}


// Login form handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const loginDesignation = document.getElementById("designation").value; // what they picked now

  try {
    document.getElementById('loginBtn').textContent = 'Logging in...';

    // 1. Sign in
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Get the role they originally set during signup
    const dbDesignation = await getUserDesignation(user.uid);

    // 3. ❌ BLOCK if login designation is wrong
    if (loginDesignation !== dbDesignation) {
      throw new Error("The username, password, or designation is incorrect.");
    }

    // 4. ✅ Store that correct designation (only if it matches)
    localStorage.setItem('userDesignation', loginDesignation);

    // 5. Redirect based on role (you can customize this)
    if (loginDesignation === 'Administrator') {
      window.location.href = '../src/pvo-dashboard.html';
    } else {
      // Veterinary Officer, Health Officer, etc.
      window.location.href = '../src/pvo-dashboard.html';
    }

  } catch (error) {
    console.error('Login error:', error.code, error.message);
    alert('Login failed: ' + error.message);
  } finally {
    document.getElementById('loginBtn').textContent = 'Login';
  }
});