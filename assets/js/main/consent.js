/* ==========================================================================
   CRIS DATA PRIVACY ACT (RA 10173) CONSENT MODAL CONTROLLER
   Automatically enforces explicit privacy consent before personal info entry
   ========================================================================== */

(function () {
    'use strict';

    let hasAcceptedPrivacy = false;
    let promptShownOnce = false;
    let pendingSubmitForm = null;

    function injectPrivacyModalDOM() {
        if (document.getElementById('crisPrivacyModal')) return;

        const modalHTML = `
            <div id="crisPrivacyModal" role="dialog" aria-modal="true" aria-labelledby="privacyModalTitle" aria-hidden="true">
                <div class="privacy-modal-card">
                    <div class="privacy-modal-header">
                        <div class="privacy-shield-badge">
                            <i class="fa-solid fa-shield-halved"></i>
                        </div>
                        <div>
                            <h2 id="privacyModalTitle">Data Privacy Notice &amp; Consent</h2>
                            <p>Republic Act No. 10173 — Data Privacy Act of 2012 (Philippines)</p>
                        </div>
                    </div>

                    <div class="privacy-modal-body">
                        <p>
                            Before entering your personal information into the <strong>Community-Centric Rabies Intelligence System (CRIS)</strong>, please review how your data is collected, processed, and protected:
                        </p>

                        <div class="privacy-section-box">
                            <h4>1. Personal Information Collected</h4>
                            <p>We collect your full name, official email address, contact number, office/facility assignment, and designation role solely for account verification and role-based access control.</p>
                        </div>

                        <div class="privacy-section-box">
                            <h4>2. Purpose of Processing</h4>
                            <ul>
                                <li>Verify your identity and authorization with your Provincial, City, Municipal, or ABTC administrator.</li>
                                <li>Maintain tamper-evident audit logs for rabies surveillance, vaccination, and bite case records.</li>
                            </ul>
                        </div>

                        <div class="privacy-section-box">
                            <h4>3. Data Protection &amp; Your Rights</h4>
                            <p>Your credentials are encrypted and restricted to authorized CRIS system administrators. Under RA 10173, you retain the right to access, correct, or request deactivation of your personal record through your unit administrator.</p>
                        </div>
                    </div>

                    <div class="privacy-consent-check-wrap">
                        <input type="checkbox" id="privacyAgreeCheckbox">
                        <label for="privacyAgreeCheckbox">
                            I have read and understood the CRIS Data Privacy Notice and voluntarily consent to the collection and processing of my personal information in accordance with Republic Act No. 10173.
                        </label>
                    </div>

                    <div class="privacy-modal-footer">
                        <button type="button" class="btn-privacy-decline" id="declinePrivacyBtn">Decline &amp; Exit</button>
                        <button type="button" class="btn-privacy-accept" id="acceptPrivacyBtn" disabled>I Agree &amp; Continue</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    function openPrivacyModal(formToResume = null) {
        injectPrivacyModalDOM();
        pendingSubmitForm = formToResume;

        const modal = document.getElementById('crisPrivacyModal');
        const checkbox = document.getElementById('privacyAgreeCheckbox');
        const acceptBtn = document.getElementById('acceptPrivacyBtn');

        if (!modal) return;
        if (checkbox) checkbox.checked = hasAcceptedPrivacy;
        if (acceptBtn) acceptBtn.disabled = !hasAcceptedPrivacy;

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closePrivacyModal() {
        const modal = document.getElementById('crisPrivacyModal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    function initPrivacyConsent() {
        injectPrivacyModalDOM();

        const modal = document.getElementById('crisPrivacyModal');
        const checkbox = document.getElementById('privacyAgreeCheckbox');
        const acceptBtn = document.getElementById('acceptPrivacyBtn');
        const declineBtn = document.getElementById('declinePrivacyBtn');
        const signupForm = document.querySelector('form');

        checkbox?.addEventListener('change', () => {
            if (acceptBtn) acceptBtn.disabled = !checkbox.checked;
        });

       acceptBtn?.addEventListener('click', () => {
            if (!checkbox?.checked) return;
            hasAcceptedPrivacy = true;

            window.crisPrivacyConsent = {
                accepted: true,
                acceptedAt: new Date().toISOString(),
                policyVersion: 'RA-10173-v1.0',
                lawReference: 'Republic Act No. 10173 (Data Privacy Act of 2012)',
                consentMethod: 'Explicit Checkbox Modal'
            };

            closePrivacyModal();

            if (pendingSubmitForm) {
                const form = pendingSubmitForm;
                pendingSubmitForm = null;
                form.requestSubmit();
            }
        });

        declineBtn?.addEventListener('click', () => {
            hasAcceptedPrivacy = false;
            closePrivacyModal();
            window.location.href = '../../index.html';
        });

        // Allow optional inline "View Data Privacy Notice" links to re-open the modal
        document.querySelectorAll('[data-open-privacy]').forEach((trigger) => {
            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                openPrivacyModal(null);
            });
        });

        if (signupForm) {
            // 1. Trigger popup when user starts interacting with personal info inputs
            signupForm.addEventListener('focusin', (e) => {
                const tag = e.target.tagName;
                if (!hasAcceptedPrivacy && !promptShownOnce && (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA')) {
                    promptShownOnce = true;
                    e.target.blur();
                    openPrivacyModal(null);
                }
            });

            // 2. Capture-phase guard: block form submission if they dismissed/bypassed without agreeing
            signupForm.addEventListener('submit', (e) => {
                if (!hasAcceptedPrivacy) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    openPrivacyModal(signupForm);
                }
            }, true);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPrivacyConsent);
    } else {
        initPrivacyConsent();
    }
})();