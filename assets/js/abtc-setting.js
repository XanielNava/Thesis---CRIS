/* =========================================================
   CRIS — ABTC Settings Page
   Minimal JavaScript for UI-only interactions.
   No backend calls are made from this file.
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ---- Facility logo upload: show chosen filename ---- */
  const logoInput = document.getElementById('facilityLogo');
  if (logoInput) {
    const uploadLabel = logoInput.closest('.file-upload');
    const defaultText = uploadLabel.innerHTML;

    logoInput.addEventListener('change', () => {
      if (logoInput.files && logoInput.files.length > 0) {
        uploadLabel.childNodes[0].textContent = `📤 ${logoInput.files[0].name} selected`;
      } else {
        uploadLabel.innerHTML = defaultText;
      }
    });
  }

  /* ---- Confirm password: simple visual match check ---- */
  const pw = document.getElementById('changePassword');
  const confirmPw = document.getElementById('confirmPassword');

  if (pw && confirmPw) {
    const checkMatch = () => {
      if (confirmPw.value.length === 0) {
        confirmPw.style.borderColor = '';
        return;
      }
      confirmPw.style.borderColor = (pw.value === confirmPw.value)
        ? '#4CAF50'
        : '#E0733B';
    };
    pw.addEventListener('input', checkMatch);
    confirmPw.addEventListener('input', checkMatch);
  }

  /* ---- Placeholder buttons: prevent accidental form submits ---- */
  document.querySelectorAll('.btn, .action-tile').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      // Backend/API wiring goes here in the full CRIS implementation.
    });
  });

});