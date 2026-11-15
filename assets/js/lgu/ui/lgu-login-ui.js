/* ==========================================================================
   CRIS LGU MODULE — LOGIN UI CONTROLLER (lgu-login-ui.js)
   ========================================================================== */

import { authenticateLguPersonnel } from '../db/lgu-login-db.js';

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

        const selectedDistrict = document.getElementById('district')?.value.trim() || '';
        const selectedMunicipality = document.getElementById('municipality')?.value.trim() || '';
        const email = document.getElementById('email')?.value.trim() || '';
        const password = document.getElementById('password')?.value || '';
        const selectedDesignation = document.getElementById('designation')?.value.trim() || '';

        if (!selectedDistrict || !selectedMunicipality) {
            alert('Please select your Congressional District and Municipality / City.');
            return;
        }

        if (!email || !password) {
            alert('Please enter both your official email address and password.');
            return;
        }

        if (!selectedDesignation) {
            alert('Please select your authorized LGU designation.');
            return;
        }

        try {
            setButtonLoading(true);

            const result = await authenticateLguPersonnel({
                email,
                password,
                selectedDistrict,
                selectedMunicipality,
                selectedDesignation
            });

            window.location.href = result.redirectUrl;

        } catch (error) {
            console.error('LGU Login failure:', error);
            alert('Login Failed: ' + error.message);
        } finally {
            setButtonLoading(false);
        }
    });
}