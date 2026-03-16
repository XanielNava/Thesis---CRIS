// PVO Login.js - CDN VERSION (Works in any browser)
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

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const designation = document.getElementById("designation").value;

  try {
    // Show loading
    document.getElementById('loginBtn').textContent = 'Logging in...';
    
    // Sign in
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('Logged in:', userCredential.user);
    
    // Store designation (for your PVO roles)
    localStorage.setItem('userDesignation', designation);
    
    // Redirect based on role
    if (designation === 'admin') {
      window.location.href = 'admin-dashboard.html';
    } else {
      window.location.href = 'PVO Dashboard.html';
    }
    
  } catch (error) {
    console.error('Login error:', error.code, error.message);
    alert('Login failed: ' + error.message);
  } finally {
    document.getElementById('loginBtn').textContent = 'Login';
  }
});
