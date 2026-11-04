import { registerPvoPersonnel } from '../db/pvo-signup-db.js';

document.addEventListener('DOMContentLoaded', () => {
    initSignupForm();
    initPasswordToggles();
});

let toastTimer = null;

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) {
        alert(message);
        return;
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function initPasswordToggles() {
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;

            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';

            const icon = btn.querySelector('.eye-icon');
            if (icon) {
                icon.style.fill = isPassword ? '#EA6113' : '#665248';
            }
        });
    });
}

function initSignupForm() {
    const form = document.getElementById('regForm');
    const submitBtn = document.getElementById('regButton');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const middleInitial = document.getElementById('middleInitial').value.trim();
        const suffix = document.getElementById('suffix').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const streetAddress = document.getElementById('streetAddress').value.trim();
        const barangay = document.getElementById('barangay').value.trim();
        const city = document.getElementById('city').value.trim();
        const province = document.getElementById('province').value.trim();
        const contactNumber = document.getElementById('contactNumber').value.trim();
        const dateOfBirth = document.getElementById('dateOfBirth').value;
        const designation = document.getElementById('designation').value;

        if (!firstName || !lastName || !email || !password || !city || !contactNumber || !designation) {
            showToast('Please fill in all required fields.');
            return;
        }

        if (password.length < 6) {
            showToast('Password must be at least 6 characters.');
            return;
        }

        if (password !== confirmPassword) {
            showToast('Passwords do not match.');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Registering Officer...';

            await registerPvoPersonnel({
                email,
                firstName,
                lastName,
                middleInitial,
                suffix,
                designation,
                streetAddress,
                barangay,
                city,
                province,
                contactNumber,
                dateOfBirth
            }, password);

            showToast('Account registered successfully! Redirecting...');
            setTimeout(() => {
                window.location.href = 'pvo-login.html';
            }, 1500);

        } catch (error) {
            console.error('Registration failure:', error);
            showToast(`Registration failed: ${error.message}`);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account';
        }
    });
}