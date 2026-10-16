// ==========================================================================
// CRIS PHO MODULE - LOGIN CONTROLLER (pho-login.js)
// ==========================================================================

import { auth, db } from '../firebase/firebase-config.js';
import { 
    signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Retrieve user designation from 'pho-users'
async function getUserDesignation(uid) {
    const userDocRef = doc(db, "pho-users", uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
        throw new Error("User record not found in PHO personnel database.");
    }

    const data = userDocSnap.data();

    if (!data.designation) {
        throw new Error("Designation role is not assigned to this account.");
    }

    return data.designation;
}

// Login Form Event Listener
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const loginDesignation = document.getElementById("designation").value.trim().toLowerCase();

        try {
            loginBtn.disabled = true;
            loginBtn.textContent = 'Logging in...';

            // 1. Firebase Authentication Login
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 2. Fetch User Designation from Firestore
            const dbDesignationRaw = await getUserDesignation(user.uid);
            const dbDesignation = dbDesignationRaw.trim().toLowerCase();

            // 3. Block login if selected designation does not match database record
            if (loginDesignation !== dbDesignation) {
                throw new Error("Incorrect designation selected for this account.");
            }

            // 4. Save Session State
            localStorage.setItem('userDesignation', dbDesignationRaw);
            localStorage.setItem('userEmail', user.email);
            localStorage.setItem('userUid', user.uid);

            // 5. Redirect to PHO Dashboard
            window.location.href = 'pho-dash.html';

        } catch (error) {
            console.error("Login Error:", error);
            let message = error.message;

            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                message = "Invalid email or password.";
            }

            alert('Login failed: ' + message);
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Login';
        }
    });
}