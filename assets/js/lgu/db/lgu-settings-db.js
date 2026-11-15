/* ==========================================================================
   CRIS LGU MODULE — SETTINGS DATABASE SERVICE (lgu-settings-db.js)
   Handles LGU user profile, municipality config, barangays, and password
   ========================================================================== */

import { auth, db } from '../../firebase/firebase-config.js';
import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    addDoc,
    collection,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const LGU_USERS_COLLECTION = 'lgu-users';
const LGU_MUNICIPALITIES_COLLECTION = 'lgu_municipalities';
const AUDIT_LOGS_COLLECTION = 'audit_logs';

/**
 * Builds the canonical LGU organization code from the municipality name
 * e.g. "Santa Barbara" -> "LGU_SANTA_BARBARA"
 */
export function buildLguOrgId(municipality = '') {
    const clean = municipality.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    return clean ? `LGU_${clean}` : 'LGU_ILOILO';
}

/**
 * Fetch the logged-in LGU officer's profile from `lgu-users/{uid}`
 */
export async function fetchLguOfficerProfile(uid) {
    if (!uid) return null;
    const snap = await getDoc(doc(db, LGU_USERS_COLLECTION, uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Fetch or initialize the Municipality configuration document in `lgu_municipalities/{orgId}`
 */
export async function fetchMunicipalitySettings(municipality, district = '') {
    const orgId = buildLguOrgId(municipality);
    const docRef = doc(db, LGU_MUNICIPALITIES_COLLECTION, orgId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
        return { id: snap.id, ...snap.data() };
    }

    return {
        id: orgId,
        organizationId: orgId,
        municipality: municipality || '',
        district: district || '',
        agriculturist: '',
        healthOfficer: '',
        contactNumber: '',
        officeAddress: '',
        barangays: []
    };
}

/**
 * Save Municipality Profile details to `lgu_municipalities/{orgId}` and record an audit log
 */
export async function saveMunicipalitySettings(municipalityData, actorProfile) {
    const cleanMuni = (municipalityData.municipality || '')
        .replace(/^Municipality of\s+/i, '')
        .trim() || 'Iloilo';
    const orgId = buildLguOrgId(cleanMuni);
    const docRef = doc(db, LGU_MUNICIPALITIES_COLLECTION, orgId);

    const payload = {
        organizationId: orgId,
        municipality: cleanMuni,
        district: (municipalityData.district || '').trim(),
        agriculturist: (municipalityData.agriculturist || '').trim(),
        healthOfficer: (municipalityData.healthOfficer || '').trim(),
        contactNumber: (municipalityData.contactNumber || '').trim(),
        officeAddress: (municipalityData.officeAddress || '').trim(),
        updatedAt: serverTimestamp(),
        updatedBy: actorProfile?.fullName || actorProfile?.email || 'LGU Officer'
    };

    await setDoc(docRef, payload, { merge: true });

    await addDoc(collection(db, AUDIT_LOGS_COLLECTION), {
        action: 'LGU Settings Updated',
        module: 'LGU',
        affected: `${cleanMuni} LGU (${orgId})`,
        performedBy: actorProfile?.fullName || actorProfile?.email || 'LGU Officer',
        actorUid: actorProfile?.id || actorProfile?.uid || 'SYSTEM',
        details: {
            municipality: cleanMuni,
            notes: `Updated LGU Municipality Profile for ${cleanMuni}`
        },
        timestamp: serverTimestamp()
    }).catch(() => {});

    return payload;
}

/**
 * Save the updated Monitored Barangay Jurisdictions list for the Municipality
 */
export async function updateMunicipalityBarangays(municipality, district, barangays, actorProfile) {
    const cleanMuni = (municipality || '').replace(/^Municipality of\s+/i, '').trim() || 'Iloilo';
    const orgId = buildLguOrgId(cleanMuni);
    const docRef = doc(db, LGU_MUNICIPALITIES_COLLECTION, orgId);

    await setDoc(docRef, {
        organizationId: orgId,
        municipality: cleanMuni,
        district: district || '',
        barangays,
        updatedAt: serverTimestamp(),
        updatedBy: actorProfile?.fullName || actorProfile?.email || 'LGU Officer'
    }, { merge: true });
}

/**
 * Update the LGU officer's personal profile in `lgu-users/{uid}`
 */
export async function updateLguOfficerProfile(uid, updates) {
    if (!uid) throw new Error('Officer UID is missing.');

    const cleanMI = updates.middleInitial
        ? updates.middleInitial.trim().replace(/\.$/, '').toUpperCase()
        : '';
    const cleanSuffix = updates.suffix ? updates.suffix.trim() : '';
    const fullName = [
        updates.firstName.trim(),
        cleanMI ? `${cleanMI}.` : '',
        updates.lastName.trim(),
        cleanSuffix
    ].filter(Boolean).join(' ');

    const payload = {
        firstName: updates.firstName.trim(),
        lastName: updates.lastName.trim(),
        middleInitial: cleanMI,
        suffix: cleanSuffix,
        fullName,
        contactNumber: updates.contactNumber.trim(),
        updatedAt: serverTimestamp()
    };

    await updateDoc(doc(db, LGU_USERS_COLLECTION, uid), payload);
    localStorage.setItem('userFullName', fullName);

    return payload;
}

/**
 * Re-authenticate and update the LGU officer's Firebase Auth password
 */
export async function changeLguOfficerPassword(currentPassword, newPassword) {
    const user = auth.currentUser;
    if (!user || !user.email) {
        throw new Error('No active authenticated session found. Please log in again.');
    }

    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
}