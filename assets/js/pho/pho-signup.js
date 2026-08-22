// ==========================================================================
// CRIS PHO MODULE - SIGNUP CONTROLLER (pho-signup.js)
// ==========================================================================

import { auth, db } from '../main/firebase-config.js';
import { 
    createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { 
    doc, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const regForm = document.getElementById('regForm');
const regButton = document.getElementById('regButton');

if (regForm) {
    regForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Capture Form Values
        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const middleInitial = document.getElementById('middleInitial').value.trim();
        const suffix = document.getElementById('suffix')?.value.trim() || '';

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        const streetAddress = document.getElementById('streetAddress')?.value.trim() || '';
        const barangay = document.getElementById('barangay')?.value.trim() || '';
        const cityMunicipality = document.getElementById('cityMunicipality')?.value.trim() || '';
        const province = document.getElementById('province')?.value.trim() || '';

        const contactNumber = document.getElementById('contactNumber')?.value.trim() || '';
        const dateOfBirth = document.getElementById('dateOfBirth')?.value || '';
        const designation = document.getElementById('designation').value;

        // 2. Validate Password Match
        if (password !== confirmPassword) {
            alert("Passwords do not match. Please verify your password.");
            return;
        }

        if (password.length < 6) {
            alert("Password must be at least 6 characters long.");
            return;
        }

        try {
            regButton.disabled = true;
            regButton.textContent = 'Registering...';

            // 3. Create Firebase Authentication Account
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 4. Save User Profile to Firestore 'pho-users' Collection
            const userDocRef = doc(db, 'pho-users', user.uid);
            await setDoc(userDocRef, {
                uid: user.uid,
                firstName: firstName,
                lastName: lastName,
                middleInitial: middleInitial,
                suffix: suffix,
                fullName: `${firstName} ${middleInitial ? middleInitial + '.' : ''} ${lastName} ${suffix}`.trim(),
                email: email,
                designation: designation,
                contactNumber: contactNumber,
                dateOfBirth: dateOfBirth,
                address: {
                    street: streetAddress,
                    barangay: barangay,
                    cityMunicipality: cityMunicipality,
                    province: province
                },
                module: 'PHO',
                createdAt: serverTimestamp()
            });

            alert('Personnel account created successfully! You can now log in.');
            window.location.href = 'pho-login.html';

        } catch (error) {
            console.error('Registration Error:', error);
            let message = error.message;

            if (error.code === 'auth/email-already-in-use') {
                message = 'This email address is already registered.';
            } else if (error.code === 'auth/invalid-email') {
                message = 'Invalid email address format.';
            } else if (error.code === 'auth/weak-password') {
                message = 'Password is too weak.';
            }

            alert('Registration Failed: ' + message);
        } finally {
            regButton.disabled = false;
            regButton.textContent = 'Sign Up';
        }
    });
}