/* ==========================================================================
   CRIS ABTC MODULE — FACILITY SETUP DATABASE SERVICE (abtc-setup-db.js)
   Handles Firebase Auth registration, RA 10173 consent, Firestore persistence,
   and audit logging for new ABTC facility applications.
   ========================================================================== */

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

import { auth, db } from '../../firebase/firebase-config.js';

function buildPrivacyConsentRecord(fallbackConsent) {
    const consent = window.crisPrivacyConsent || fallbackConsent;
    if (!consent || !consent.accepted) {
        throw new Error('Data Privacy Act (RA 10173) consent is required before submitting a facility application.');
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
 * Registers an ABTC Facility Head in Firebase Auth, writes their profile to `users`,
 * submits the facility application to `facility_applications`, logs to `audit_logs`,
 * and signs out pending PHO Administrator approval.
 */
export async function submitAbtcFacilityApplication(applicationData, password) {
    const privacyConsent = buildPrivacyConsentRecord(applicationData.privacyConsent);

    const {
        email,
        facilityName,
        acronym,
        facilityType,
        street,
        barangay,
        city,
        province,
        lat,
        lng,
        contactPerson,
        position,
        phone,
        dohLto,
        ownershipType,
        hasColdChain
    } = applicationData;

    const cleanEmail = email.toLowerCase().trim();
    const cleanAcronym = acronym.toUpperCase().trim();
    const validLat = typeof lat === 'number' && !isNaN(lat) ? lat : null;
    const validLng = typeof lng === 'number' && !isNaN(lng) ? lng : null;

    try {
        // 1. Create Firebase Auth user
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const userUid = userCredential.user.uid;

        // 2. Save applicant profile into `users` collection
        await setDoc(doc(db, 'users', userUid), {
            uid: userUid,
            email: cleanEmail,
            fullName: contactPerson.trim(),
            position: position.trim(),
            designation: 'Facility Head',
            globalRole: 'staff',
            module: 'ABTC',
            privacyConsent,
            status: 'Pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        // 3. Submit into `facility_applications` with dual spatial coordinates
        const applicationId = `app_${userUid}`;
        await setDoc(doc(db, 'facility_applications', applicationId), {
            applicantUid: userUid,
            facilityName: facilityName.trim(),
            acronym: cleanAcronym,
            code: cleanAcronym,
            facilityType,
            address: {
                street: street.trim(),
                barangay: barangay.trim(),
                city: city.trim(),
                province: province.trim()
            },
            coordinates: {
                lat: validLat,
                lng: validLng
            },
            location: {
                latitude: validLat,
                longitude: validLng
            },
            contactInfo: {
                contactPerson: contactPerson.trim(),
                position: position.trim(),
                phone: phone.trim(),
                email: cleanEmail
            },
            regulatoryData: {
                dohLto: dohLto.trim(),
                ownershipType,
                coldChainCompliant: Boolean(hasColdChain)
            },
            privacyConsent,
            reviewStatus: 'Pending',
            submittedAt: serverTimestamp()
        });

        // 4. Record application submission in `audit_logs`
        try {
            await addDoc(collection(db, 'audit_logs'), {
                action: 'ABTC Facility Application Submitted',
                module: 'PHO',
                affected: `${facilityName.trim()} (${cleanAcronym})`,
                performedBy: contactPerson.trim(),
                actorUid: userUid,
                actorEmail: cleanEmail,
                details: {
                    applicationId,
                    facilityName: facilityName.trim(),
                    acronym: cleanAcronym,
                    city: city.trim(),
                    privacyPolicyVersion: privacyConsent.policyVersion,
                    privacyAcceptedAt: privacyConsent.acceptedAt,
                    notes: `ABTC Facility Application submitted by ${contactPerson.trim()} (${position.trim()}) — Pending PHO Review`
                },
                timestamp: serverTimestamp()
            });
        } catch (auditErr) {
            console.warn('Audit log write skipped:', auditErr);
        }

        // 5. Sign out immediately so applicant must log in after PHO approval
        await signOut(auth);

        return {
            uid: userUid,
            applicationId,
            facilityName: facilityName.trim(),
            acronym: cleanAcronym,
            lat: validLat,
            lng: validLng
        };
    } catch (error) {
        let friendlyMessage = error.message;

        if (error.code === 'auth/email-already-in-use') {
            friendlyMessage = 'This email address is already registered in the system.';
        } else if (error.code === 'auth/invalid-email') {
            friendlyMessage = 'Invalid email address format.';
        } else if (error.code === 'auth/weak-password') {
            friendlyMessage = 'Password must be at least 6 characters long.';
        }

        const customError = new Error(friendlyMessage);
        customError.code = error.code;
        throw customError;
    }
}