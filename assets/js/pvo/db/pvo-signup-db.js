/* ==========================================================================
   PVO SIGNUP — DATABASE SERVICE (pvo-signup-db.js)
   ========================================================================== */

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

const USERS_COLLECTION = 'pvo-users';

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
 * Registers a new PVO officer in Firebase Authentication, stores the profile
 * with RA 10173 consent metadata in Firestore, logs to audit_logs, and signs out.
 */
export async function registerPvoPersonnel(profileData, password) {
    const privacyConsent = buildPrivacyConsentRecord(profileData.privacyConsent);

    const {
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
    } = profileData;

    // 1. Create Firebase Auth user
    const cleanEmail = email.toLowerCase().trim();
    const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const user = userCredential.user;

    // 2. Format clean fullName (avoiding double periods on middle initial)
    const cleanMI = middleInitial ? middleInitial.trim().replace(/\.$/, '').toUpperCase() : '';
    const cleanSuffix = suffix ? suffix.trim() : '';
    const fullName = [
        firstName.trim(),
        cleanMI ? `${cleanMI}.` : '',
        lastName.trim(),
        cleanSuffix
    ].filter(Boolean).join(' ');

    // 3. Build standardized user document payload with RA 10173 consent metadata
    const payload = {
        uid: user.uid,
        email: cleanEmail,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        middleInitial: cleanMI,
        suffix: cleanSuffix,
        fullName,
        designation: designation || 'Veterinary Officer',
        accountType: 'pvo',
        organizationId: 'PVO',
        address: {
            street: streetAddress || '',
            barangay: barangay || '',
            municipality: city || '',
            province: province || 'Iloilo'
        },
        contactNumber: contactNumber || '',
        dateOfBirth: dateOfBirth || '',
        privacyConsent,
        status: 'Pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    // 4. Write to Firestore users collection
    await setDoc(doc(db, USERS_COLLECTION, user.uid), payload);

    // 5. Record registration in audit_logs
    try {
        await addDoc(collection(db, 'audit_logs'), {
            action: 'Account Registered',
            module: 'PVO',
            affected: `${fullName} (${user.uid})`,
            performedBy: fullName,
            actorUid: user.uid,
            actorEmail: cleanEmail,
            details: {
                targetUser: fullName,
                targetUid: user.uid,
                privacyPolicyVersion: privacyConsent.policyVersion,
                privacyAcceptedAt: privacyConsent.acceptedAt,
                notes: `Registered as ${payload.designation} (Pending Approval • RA 10173 Consent Recorded)`
            },
            timestamp: serverTimestamp()
        });
    } catch (auditErr) {
        console.warn('Audit log write skipped:', auditErr);
    }

    // 6. Sign out immediately so user must log in after approval
    await signOut(auth);

    return payload;
}