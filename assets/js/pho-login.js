// PHO Login.js - CDN VERSION (Works in any browser)

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

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

// ✅ Login Form Handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    document.getElementById('loginBtn').textContent = 'Logging in...';

    // ✅ Firebase Login using only Email and Password
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    const user = userCredential.user;
    console.log("Logged in user UID:", user.uid);

    // ✅ Redirect safely to dashboard directly after successful authentication
    window.location.href = 'pho-dash.html';

  } catch (error) {
    console.error("Full Login Error:", error);
    
    // Clean up Firebase error messages for cleaner client presentation
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
    document.getElementById('loginBtn').textContent = 'Login';
  }
});