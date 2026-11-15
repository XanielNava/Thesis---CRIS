/* ==========================================================================
   CRIS LGU MODULE — SIGNUP UI CONTROLLER (lgu-signup-ui.js)
   ========================================================================== */

import { registerLguPersonnel } from '../db/lgu-signup-db.js';

document.addEventListener('DOMContentLoaded', () => {
    initLguSignupForm();
});

function formatAuthError(error) {
    switch (error?.code) {
        case 'auth/email-already-in-use':
            return 'This email address is already registered.';
        case 'auth/invalid-email':
            return 'Please enter a valid official email address.';
        case 'auth/weak-password':
            return 'Password must be at least 6 characters long.';
        default:
            return error?.message || 'Unable to complete registration.';
    }
}

function initLguSignupForm() {
    const form = document.getElementById('regForm');
    const submitBtn = document.getElementById('regButton');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const firstName = document.getElementById('firstName')?.value.trim() || '';
        const lastName = document.getElementById('lastName')?.value.trim() || '';
        const middleInitial = document.getElementById('middleInitial')?.value.trim() || '';
        const suffix = document.getElementById('suffix')?.value.trim() || '';
        const district = document.getElementById('district')?.value.trim() || '';
        const municipality = document.getElementById('municipality')?.value.trim() || '';
        const designation = document.getElementById('designation')?.value.trim() || '';
        const email = document.getElementById('email')?.value.trim() || '';
        const password = document.getElementById('password')?.value || '';
        const confirmPassword = document.getElementById('confirmPassword')?.value || '';
        const contactNumber = document.getElementById('contactNumber')?.value.trim() || '';
        const dateOfBirth = document.getElementById('dateOfBirth')?.value || '';
        const address = document.getElementById('address')?.value.trim() || '';

        if (!firstName || !lastName || !district || !municipality || !designation || !email || !password) {
            alert('Please fill in all required (*) fields, including District, Municipality, and Designation.');
            return;
        }

        if (password.length < 6) {
            alert('Password must be at least 6 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            alert('Passwords do not match.');
            return;
        }

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Registering...';
            }

            await registerLguPersonnel({
                firstName,
                lastName,
                middleInitial,
                suffix,
                district,
                municipality,
                designation,
                email,
                contactNumber,
                dateOfBirth,
                address
            }, password);

            alert('LGU Account registered successfully! Your account is now pending PVO Administrator approval.');
            form.reset();
            window.location.href = 'lgu-login.html';

        } catch (error) {
            console.error('LGU Registration failure:', error);
            alert('Registration Failed: ' + formatAuthError(error));
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Sign Up';
            }
        }
    });
}