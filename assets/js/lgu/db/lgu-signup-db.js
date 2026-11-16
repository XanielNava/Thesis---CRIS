/* ==========================================================================
   CRIS LGU MODULE — SIGNUP DATABASE SERVICE (lgu-signup-db.js)
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

const LGU_USERS_COLLECTION = 'lgu-users';
const AUDIT_LOGS_COLLECTION = 'audit_logs';

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
 * Registers a new LGU personnel account in Firebase Auth & Firestore (`lgu-users`)
 * with RA 10173 consent metadata and status: 'Pending' for PVO approval.
 */
export async function registerLguPersonnel(profileData, password) {
    const privacyConsent = buildPrivacyConsentRecord(profileData.privacyConsent);

    const {
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
    } = profileData;

    const cleanEmail = email.toLowerCase().trim();

    // 1. Create Firebase Auth credentials
    const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const user = userCredential.user;

    // 2. Build clean fullName
    const cleanMI = middleInitial ? middleInitial.trim().replace(/\.$/, '').toUpperCase() : '';
    const cleanSuffix = suffix ? suffix.trim() : '';
    const fullName = [
        firstName.trim(),
        cleanMI ? `${cleanMI}.` : '',
        lastName.trim(),
        cleanSuffix
    ].filter(Boolean).join(' ');

    // 3. Construct LGU user document payload with RA 10173 consent metadata
    const payload = {
        uid: user.uid,
        email: cleanEmail,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        middleInitial: cleanMI,
        suffix: cleanSuffix,
        fullName,
        district: district.trim(),
        municipality: municipality.trim(),
        designation: designation.trim(),
        accountType: 'lgu',
        organizationId: `LGU_${municipality.trim().toUpperCase().replace(/\s+/g, '_')}`,
        address: {
            fullAddress: address ? address.trim() : '',
            district: district.trim(),
            municipality: municipality.trim(),
            province: 'Iloilo'
        },
        contactNumber: contactNumber ? contactNumber.trim() : '',
        dateOfBirth: dateOfBirth || '',
        privacyConsent,
        status: 'Pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    // 4. Write to `lgu-users/{uid}`
    await setDoc(doc(db, LGU_USERS_COLLECTION, user.uid), payload);

    // 5. Record registration in `audit_logs` (tagged for PVO Admin visibility)
    try {
        await addDoc(collection(db, AUDIT_LOGS_COLLECTION), {
            action: 'LGU Account Registered',
            module: 'PVO',
            accountScope: 'LGU',
            affected: `${fullName} (${municipality.trim()} LGU)`,
            performedBy: fullName,
            actorUid: user.uid,
            actorEmail: cleanEmail,
            details: {
                targetUser: fullName,
                targetUid: user.uid,
                district: district.trim(),
                municipality: municipality.trim(),
                designation: designation.trim(),
                privacyPolicyVersion: privacyConsent.policyVersion,
                privacyAcceptedAt: privacyConsent.acceptedAt,
                notes: `LGU ${designation.trim()} (${municipality.trim()}) — Pending PVO Approval • RA 10173 Consent Recorded`
            },
            timestamp: serverTimestamp()
        });
    } catch (auditErr) {
        console.warn('Audit log write skipped:', auditErr);
    }

    // 6. Sign out immediately so Pending LGU user cannot bypass PVO approval
    await signOut(auth);

    return payload;
}