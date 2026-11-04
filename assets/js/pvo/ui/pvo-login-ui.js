// ==========================================================================
// CRIS PHO MODULE - LOGIN UI CONTROLLER (pho-login.js)
// Handles DOM interactions, input capture, visual states, and redirection
// ==========================================================================

import { authenticatePhoPersonnel } from '../db/pvo-login-db.js';

const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');

function setButtonLoading(isLoading) {
    if (!loginBtn) return;
    loginBtn.disabled = isLoading;
    loginBtn.textContent = isLoading ? 'Authenticating...' : 'Login';
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Capture Form Inputs
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const designationSelect = document.getElementById('designation');

        const email = emailInput?.value.trim() || '';
        const password = passwordInput?.value || '';
        const designation = designationSelect?.value.trim() || '';

        // 2. Client-Side Input Validations
        if (!email || !password) {
            alert('Please enter both your email address and password.');
            return;
        }

        if (!designation) {
            alert('Please select your authorized designation role.');
            return;
        }

        // 3. Delegate to DB Controller
        try {
            setButtonLoading(true);

            const result = await authenticatePhoPersonnel(email, password, designation);

            // 4. Redirect upon successful authentication & role check
            window.location.href = result.redirectUrl;

        } catch (error) {
            console.error("Login failure:", error);
            alert("Login Failed: " + error.message);
        } finally {
            setButtonLoading(false);
        }
    });
}