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


// ✅ Get user designation from Firestore
async function getUserDesignation(uid) {

  const userDocRef = doc(db, "pho-users", uid);

  const userDocSnap = await getDoc(userDocRef);

  if (!userDocSnap.exists()) {
    throw new Error("User record not found.");
  }

  const data = userDocSnap.data();

  console.log("Firestore User Data:", data);

  // ✅ Check if designation exists
  if (!data.designation) {
    throw new Error("Designation field is missing in Firestore.");
  }

  return data.designation;
}


// ✅ Login Form Handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {

  e.preventDefault();

  const email = document.getElementById("email").value.trim();

  const password = document.getElementById("password").value;

  const loginDesignation =
    document.getElementById("designation")
    .value
    .trim()
    .toLowerCase();

  try {

    document.getElementById('loginBtn').textContent = 'Logging in...';

    // ✅ Firebase Login
    const userCredential =
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

    const user = userCredential.user;

    console.log("Logged in user UID:", user.uid);

    // ✅ Get Firestore designation
    const dbDesignationRaw =
      await getUserDesignation(user.uid);

    const dbDesignation =
      dbDesignationRaw
      .trim()
      .toLowerCase();

    console.log("Selected Designation:", loginDesignation);
    console.log("Database Designation:", dbDesignation);

    // ❌ Block wrong designation
    if (loginDesignation !== dbDesignation) {

      throw new Error(
        "The username, password, or designation is incorrect."
      );
    }

    // ✅ Save session
    localStorage.setItem(
      'userDesignation',
      dbDesignationRaw
    );

    // ✅ Redirect
    window.location.href = '../src/pho-dash.html';

  }
  catch (error) {

    console.error("Full Login Error:", error);

    alert(
      'Login failed: ' +
      (error.message || 'Unknown error')
    );

  }
  finally {

    document.getElementById('loginBtn').textContent = 'Login';

  }

});