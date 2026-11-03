// ==========================================================================
// CRIS PHO MODULE - SIGNUP UI CONTROLLER (pho-signup.js)
// Handles DOM interactions, input validations, UI states, and alerts
// ==========================================================================

import { registerPhoPersonnel } from '../db/pho_signup-db.js';

const regForm = document.getElementById('regForm');
const regButton = document.getElementById('regButton');

function setButtonLoading(isLoading) {
    if (!regButton) return;
    regButton.disabled = isLoading;
    regButton.textContent = isLoading ? 'Registering...' : 'Sign Up';
}

if (regForm) {
    regForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Gather Form Inputs
        const firstName = document.getElementById('firstName')?.value.trim() || '';
        const lastName = document.getElementById('lastName')?.value.trim() || '';
        const middleInitial = document.getElementById('middleInitial')?.value.trim() || '';
        const suffix = document.getElementById('suffix')?.value.trim() || '';

        const email = document.getElementById('email')?.value.trim() || '';
        const password = document.getElementById('password')?.value || '';
        const confirmPassword = document.getElementById('confirmPassword')?.value || '';

        const designation = document.getElementById('designation')?.value || '';
        const prcLicenseNumber = document.getElementById('prcLicenseNumber')?.value.trim() || '';
        const employeeIdNumber = document.getElementById('employeeIdNumber')?.value.trim() || '';

        const contactNumber = document.getElementById('contactNumber')?.value.trim() || '';
        const dateOfBirth = document.getElementById('dateOfBirth')?.value || '';

        const streetAddress = document.getElementById('streetAddress')?.value.trim() || '';
        const barangay = document.getElementById('barangay')?.value.trim() || '';
        const cityMunicipality = document.getElementById('cityMunicipality')?.value.trim() || '';
        const province = document.getElementById('province')?.value.trim() || '';

        // 2. Client-Side Input Validations
        if (!firstName || !lastName || !email || !password || !designation || !employeeIdNumber || !contactNumber || !dateOfBirth) {
            alert('Please fill out all required fields.');
            return;
        }

        // Clinical roles prompt if PRC is blank
        if ((designation === 'Facilitating Nurse' || designation === 'Health Officer') && !prcLicenseNumber) {
            const proceed = confirm('You selected a clinical role without providing a PRC License Number. Would you like to proceed for manual admin review?');
            if (!proceed) {
                document.getElementById('prcLicenseNumber')?.focus();
                return;
            }
        }

        if (password !== confirmPassword) {
            alert('Passwords do not match. Please verify your password.');
            return;
        }

        if (password.length < 6) {
            alert('Password must be at least 6 characters long.');
            return;
        }

        // 3. Dispatch to Database Controller
        try {
            setButtonLoading(true);

            await registerPhoPersonnel(email, password, {
                firstName,
                lastName,
                middleInitial,
                suffix,
                designation,
                prcLicenseNumber,
                employeeIdNumber,
                contactNumber,
                dateOfBirth,
                streetAddress,
                barangay,
                cityMunicipality,
                province
            });

            alert('Registration submitted successfully! Your account is now pending verification by the PHO Administrator.');
            window.location.href = 'pho-login.html';

        } catch (error) {
            console.error('Registration Failure:', error);
            alert('Registration Failed: ' + error.message);
        } finally {
            setButtonLoading(false);
        }
    });
}