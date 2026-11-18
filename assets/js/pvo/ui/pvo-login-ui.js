// ==========================================================================
// CRIS PVO MODULE - LOGIN UI CONTROLLER (pvo-login-ui.js)
// Handles progressive designation reveal, password visibility, and redirection
// ==========================================================================

import { authenticatePvoPersonnel } from '../db/pvo-login-db.js';

const EYE_OPEN_PATH = `<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>`;
const EYE_CLOSED_PATH = `<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.17c0-1.66-1.34-3-3-3l-.17.02z"/>`;

const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const backBtn = document.getElementById('backBtn');
const designationSelect = document.getElementById('designation');
const credentialsContainer = document.getElementById('credentialsContainer');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

function setButtonLoading(isLoading) {
    if (!loginBtn) return;
    loginBtn.disabled = isLoading;
    loginBtn.textContent = isLoading ? 'Authenticating...' : 'Login';
}

function toggleCredentialsVisibility() {
    if (!designationSelect || !credentialsContainer) return;

    const hasDesignation = Boolean(designationSelect.value.trim());

    credentialsContainer.hidden = !hasDesignation;
    if (loginBtn) loginBtn.hidden = !hasDesignation;

    if (emailInput) emailInput.disabled = !hasDesignation;
    if (passwordInput) passwordInput.disabled = !hasDesignation;

    if (hasDesignation && emailInput) {
        emailInput.focus();
    }
}

function initPasswordToggles() {
    document.querySelectorAll('.toggle-password').forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target || 'password';
            const input = document.getElementById(targetId);
            const icon = btn.querySelector('.eye-icon');
            if (!input) return;

            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            if (icon) {
                icon.innerHTML = isPassword ? EYE_CLOSED_PATH : EYE_OPEN_PATH;
            }
        });
    });
}

if (designationSelect) {
    toggleCredentialsVisibility();
    designationSelect.addEventListener('change', toggleCredentialsVisibility);
}

if (backBtn) {
    backBtn.addEventListener('click', () => {
        window.location.href = '../../index.html';
    });
}

initPasswordToggles();

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput?.value.trim() || '';
        const password = passwordInput?.value || '';
        const designation = designationSelect?.value.trim() || '';

        if (!designation) {
            alert('Please select your authorized designation role.');
            return;
        }

        if (!email || !password) {
            alert('Please enter both your email address and password.');
            return;
        }

        try {
            setButtonLoading(true);

            const result = await authenticatePvoPersonnel(email, password, designation);
            window.location.href = result.redirectUrl;
        } catch (error) {
            console.error('Login failure:', error);
            alert('Login Failed: ' + error.message);
        } finally {
            setButtonLoading(false);
        }
    });
}