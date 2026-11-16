// ==========================================================================
// CRIS PHO MODULE - SIGNUP DB CONTROLLER (pho_signup-db.js)
// Handles Firebase Auth account creation, RA 10173 consent, and persistence
// ==========================================================================

import { auth, db } from '../../firebase/firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
    collection,
    doc,
    setDoc,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

function buildPrivacyConsentRecord(fallbackConsent) {
    const consent = window.crisPrivacyConsent || fallbackConsent;
    if (!consent || !consent.accepted) {
        throw new Error('Data Privacy Act (RA 10173) consent is required before registering an account.');
    }

    return {
        accepted: true,
        acceptedAt: consent.acceptedAt || new Date().toISOString(),
        serverRecordedAt: serverTimestamp(),
        policyVersion: consent.policyVersion || 'RA-10173-v1.0',
        lawReference: consent.lawReference || 'Republic Act No. 10173 (Data Privacy Act of 2012)',
        consentMethod: consent.consentMethod || 'Explicit Checkbox Modal'
    };
}

/**
 * Registers a new PHO personnel in Firebase Auth and saves their profile
 * with RA 10173 consent metadata to Firestore with 'Pending' status.
 */
export async function registerPhoPersonnel(email, password, profile) {
    try {
        const privacyConsent = buildPrivacyConsentRecord(profile.privacyConsent);

        // 1. Create Firebase Auth Credential
        const cleanEmail = email.toLowerCase().trim();
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const user = userCredential.user;

        // 2. Build clean full name format
        const cleanMI = profile.middleInitial ? profile.middleInitial.trim().replace(/\.$/, '').toUpperCase() : '';
        const cleanSuffix = profile.suffix ? profile.suffix.trim() : '';
        const fullName = [
            profile.firstName.trim(),
            cleanMI ? `${cleanMI}.` : '',
            profile.lastName.trim(),
            cleanSuffix
        ].filter(Boolean).join(' ');

        // 3. Save User Profile in Firestore with RA 10173 consent metadata
        const userDocRef = doc(db, 'pho-users', user.uid);
        await setDoc(userDocRef, {
            uid: user.uid,
            firstName: profile.firstName.trim(),
            lastName: profile.lastName.trim(),
            middleInitial: cleanMI,
            suffix: cleanSuffix,
            fullName,
            email: cleanEmail,
            designation: profile.designation,
            verification: {
                prcLicenseNumber: profile.prcLicenseNumber || '',
                employeeIdNumber: profile.employeeIdNumber || '',
                hasIdUpload: Boolean(profile.idFileName),
                idFileName: profile.idFileName || null,
                isVerified: false,
                verifiedBy: null,
                verifiedAt: null
            },
            contactNumber: profile.contactNumber || '',
            dateOfBirth: profile.dateOfBirth || '',
            address: {
                street: profile.streetAddress || '',
                barangay: profile.barangay || '',
                cityMunicipality: profile.cityMunicipality || '',
                province: profile.province || ''
            },
            privacyConsent,
            module: 'PHO',
            status: 'Pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        // 4. Record registration in audit_logs
        try {
            await addDoc(collection(db, 'audit_logs'), {
                action: 'PHO Account Registered',
                module: 'PHO',
                affected: `${fullName} (${user.uid})`,
                performedBy: fullName,
                actorUid: user.uid,
                actorEmail: cleanEmail,
                details: {
                    targetUser: fullName,
                    targetUid: user.uid,
                    designation: profile.designation,
                    privacyPolicyVersion: privacyConsent.policyVersion,
                    privacyAcceptedAt: privacyConsent.acceptedAt,
                    notes: `PHO ${profile.designation} — Pending Administrator Verification • RA 10173 Consent Recorded`
                },
                timestamp: serverTimestamp()
            });
        } catch (auditErr) {
            console.warn('Audit log write skipped:', auditErr);
        }

        // 5. Sign out immediately so user must log in after admin approval
        await signOut(auth);

        return { uid: user.uid, email: user.email, privacyConsent };
    } catch (error) {
        let friendlyMessage = error.message;

        if (error.code === 'auth/email-already-in-use') {
            friendlyMessage = 'This email address is already registered.';
        } else if (error.code === 'auth/invalid-email') {
            friendlyMessage = 'Invalid email address format.';
        } else if (error.code === 'auth/weak-password') {
            friendlyMessage = 'Password is too weak. Please use at least 6 characters.';
        }

        const customError = new Error(friendlyMessage);
        customError.code = error.code;
        throw customError;
    }
}