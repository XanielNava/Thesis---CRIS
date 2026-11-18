/* ==========================================================================
   CRIS ABTC MODULE — PATIENT REGISTRY DATABASE SERVICE (abtc-reg-db.js)
   Handles Firebase Auth session resolution, true `facilities` doc ID & acronym
   lookup, strict facility-scoped `patients` streaming, record updates, and deletes.
   ========================================================================== */

import {
    collection,
    onSnapshot,
    query,
    where,
    getDocs,
    doc,
    getDoc,
    deleteDoc,
    updateDoc,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import { auth, db } from '../../firebase/firebase-config.js';

/**
 * Derives an uppercase acronym/code from a facility name
 * Example: "Western Visayas Medical Center" -> "WVMC"
 */
export function deriveFacilityCode(facilityName = '') {
    const stopWords = new Set(['OF', 'THE', 'AND', 'IN', 'AT', 'FOR']);
    const words = String(facilityName)
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w && !stopWords.has(w));

    if (words.length === 0) return 'ABTC';
    if (words.length === 1) return words[0].slice(0, 6);
    return words.map((w) => w[0]).join('');
}

/**
 * Resolves the true Firestore `facilities` document ID, facilityAcronym, & facilityName
 * for the logged-in ABTC user so QR codes and queries match the exact facility.
 */
export function resolveActiveFacilitySession(onResolved) {
    const finish = (facilityId, facilityName, explicitAcronym = '') => {
        const resolvedName = facilityName || 'ABTC FACILITY';
        const resolvedAcronym = (
            explicitAcronym ||
            sessionStorage.getItem('activeFacilityAcronym') ||
            sessionStorage.getItem('activeFacilityCode') ||
            deriveFacilityCode(resolvedName)
        ).toUpperCase();

        if (facilityId) sessionStorage.setItem('activeFacilityId', facilityId);
        if (facilityName) sessionStorage.setItem('activeFacilityName', facilityName);
        if (resolvedAcronym) {
            sessionStorage.setItem('activeFacilityAcronym', resolvedAcronym);
            sessionStorage.setItem('activeFacilityCode', resolvedAcronym);
        }

        onResolved({
            facilityId: facilityId || null,
            facilityAcronym: resolvedAcronym,
            facilityCode: resolvedAcronym,
            facilityName: resolvedName
        });
    };

    if (!auth) {
        finish(
            sessionStorage.getItem('activeFacilityId'),
            sessionStorage.getItem('activeFacilityName'),
            sessionStorage.getItem('activeFacilityAcronym') ||
                sessionStorage.getItem('activeFacilityCode') ||
                ''
        );
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        let cachedId = sessionStorage.getItem('activeFacilityId') || null;
        let cachedName = sessionStorage.getItem('activeFacilityName') || '';
        let cachedAcronym =
            sessionStorage.getItem('activeFacilityAcronym') ||
            sessionStorage.getItem('activeFacilityCode') ||
            '';

        // 1. Verify if cachedId already matches a real document in `facilities`
        if (cachedId) {
            try {
                const directSnap = await getDoc(doc(db, 'facilities', cachedId));
                if (directSnap.exists()) {
                    const d = directSnap.data();
                    finish(
                        directSnap.id,
                        d.facilityName || cachedName,
                        d.facilityAcronym || d.facilityCode || d.acronym || cachedAcronym
                    );
                    return;
                }
            } catch (err) {
                console.warn('Cached facility verification skipped:', err);
            }
        }

        if (!user) {
            finish(cachedId, cachedName, cachedAcronym);
            return;
        }

        // 2. Check `abtc_personnel/{user.uid}` for assigned facilityId
        try {
            const staffSnap = await getDoc(doc(db, 'abtc_personnel', user.uid));
            if (staffSnap.exists() && staffSnap.data().facilityId) {
                const assignedFacId = staffSnap.data().facilityId;
                const facSnap = await getDoc(doc(db, 'facilities', assignedFacId));
                if (facSnap.exists()) {
                    const d = facSnap.data();
                    finish(
                        facSnap.id,
                        d.facilityName || cachedName,
                        d.facilityAcronym || d.facilityCode || d.acronym || cachedAcronym
                    );
                    return;
                }
            }
        } catch (err) {
            console.warn('abtc_personnel lookup skipped:', err);
        }

        // 3. Check `facilities` where applicantUid / ownerUid / adminUid == user.uid
        for (const fieldName of ['applicantUid', 'ownerUid', 'adminUid']) {
            try {
                const q = query(collection(db, 'facilities'), where(fieldName, '==', user.uid));
                const querySnap = await getDocs(q);
                if (!querySnap.empty) {
                    const facDoc = querySnap.docs[0];
                    const d = facDoc.data();
                    finish(
                        facDoc.id,
                        d.facilityName || cachedName,
                        d.facilityAcronym || d.facilityCode || d.acronym || cachedAcronym
                    );
                    return;
                }
            } catch (err) {
                console.warn(`facilities.${fieldName} lookup skipped:`, err);
            }
        }

        // 4. Check if `facilities/{user.uid}` exists directly
        try {
            const uidFacSnap = await getDoc(doc(db, 'facilities', user.uid));
            if (uidFacSnap.exists()) {
                const d = uidFacSnap.data();
                finish(
                    uidFacSnap.id,
                    d.facilityName || cachedName,
                    d.facilityAcronym || d.facilityCode || d.acronym || cachedAcronym
                );
                return;
            }
        } catch (err) {
            console.warn('Direct UID facility check skipped:', err);
        }

        finish(cachedId || user.uid, cachedName || 'ABTC FACILITY', cachedAcronym);
    });
}

/**
 * Fetches and caches the facilityName & facilityAcronym from `facilities/{facilityId}`.
 */
export async function fetchFacilityName(facilityId) {
    let cachedName = sessionStorage.getItem('activeFacilityName');
    if (cachedName) return cachedName;
    if (!facilityId) return 'ABTC FACILITY';

    try {
        const snap = await getDoc(doc(db, 'facilities', facilityId));
        if (snap.exists()) {
            const d = snap.data();
            cachedName = d.facilityName || 'ABTC FACILITY';
            sessionStorage.setItem('activeFacilityName', cachedName);
            const acronym = d.facilityAcronym || d.facilityCode || d.acronym;
            if (acronym) {
                const upper = String(acronym).toUpperCase();
                sessionStorage.setItem('activeFacilityAcronym', upper);
                sessionStorage.setItem('activeFacilityCode', upper);
            }
            return cachedName;
        }
    } catch (err) {
        console.warn('Facility name read bypassed:', err);
    }

    return 'ABTC FACILITY';
}

/**
 * Normalizes a raw Firestore `patients` document following both the standardized
 * web ITR schema and the Flutter app's pre-fill schema.
 */
function normalizePatientDoc(docSnap) {
    const data = docSnap.data();
    const docId = docSnap.id;
    const statusLower = String(data.status || '').toLowerCase();

    const isPendingAppReport =
        data.claimedByAbtc === false ||
        data.abtcClaimed === false ||
        statusLower.includes('pending');

    const patientObj = data.patient || data.patientInfo || {};
    const animalObj = data.animal || {};
    const exposureObj = data.exposure || data.initialExposure || {};

    const normalizedFirstName = data.firstName || patientObj.firstName || '';
    const normalizedLastName = data.lastName || patientObj.lastName || '';
    const normalizedMiddleName = data.middleName || patientObj.middleName || '';
    const normalizedSuffix = data.suffix || patientObj.suffix || '';
    let normalizedFullName = data.fullName || data.name || patientObj.fullName || '';

    if (!normalizedFullName && (normalizedFirstName || normalizedLastName)) {
        const givenPart = [normalizedFirstName, normalizedMiddleName, normalizedSuffix]
            .filter(Boolean)
            .join(' ');
        normalizedFullName = [normalizedLastName, givenPart].filter(Boolean).join(', ');
    }

    const normalizedBirthday = data.birthday || patientObj.dateOfBirth || '';
    const normalizedAge = data.age ?? patientObj.age ?? data.ageYears ?? '';
    const normalizedSex = data.sex || patientObj.sex || 'Male';
    const normalizedCivilStatus = data.civilStatus || patientObj.civilStatus || '';
    const normalizedContact =
        data.contactNo ||
        data.mobileNumber ||
        patientObj.mobileNumber ||
        patientObj.contactNo ||
        patientObj.contactNumber ||
        '';
    const normalizedEmail = data.emailAddress || patientObj.emailAddress || '';
    const normalizedParent =
        data.parentName || patientObj.fatherOrMotherName || patientObj.guardianName || '';
    const normalizedSpouse =
        data.spouseName || patientObj.husbandOrWife || '';

    const street = data.address?.houseStreet || patientObj.streetAddress || '';
    const barangay = data.address?.barangay || patientObj.barangay || data.barangay || '';
    const municipality =
        data.address?.cityMunicipality || patientObj.municipality || data.municipality || '';
    const province = data.address?.province || patientObj.province || data.province || '';
    const fullAddress =
        data.address?.fullAddress ||
        (typeof data.address === 'string' ? data.address : '') ||
        [street, barangay, municipality, province].filter(Boolean).join(', ');

    const normalizedAnimalType =
        data.animalType || animalObj.species || animalObj.type || exposureObj.animalType || '';
    const normalizedAnimalStatus =
        data.animalStatus || animalObj.ownership || data.animalCaged || 'Unknown';

    const normalizedAcronym = String(
        data.facilityAcronym || data.facilityCode || data.acronym || ''
    )
        .toUpperCase()
        .trim();

    return {
        id: docId,
        sourceCollection: 'patients',
        isPending: isPendingAppReport,
        ...data,
        facilityId: String(data.facilityId || data.facility?.id || '').trim(),
        facilityAcronym: normalizedAcronym,
        facilityCode: normalizedAcronym,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        middleName: normalizedMiddleName,
        suffix: normalizedSuffix,
        fullName: normalizedFullName || 'Unknown Patient',
        birthday: normalizedBirthday,
        age: normalizedAge,
        sex: normalizedSex,
        civilStatus: normalizedCivilStatus,
        contactNo: normalizedContact,
        emailAddress: normalizedEmail,
        parentName: normalizedParent,
        spouseName: normalizedSpouse,
        address: {
            houseStreet: street,
            barangay: barangay,
            cityMunicipality: municipality,
            province: province,
            fullAddress: fullAddress
        },
        animalType: normalizedAnimalType,
        animalStatus: normalizedAnimalStatus,
        animalCaged: normalizedAnimalStatus,
        exposureType:
            data.exposureType ||
            (normalizedAnimalType ? `${normalizedAnimalType} Exposure` : 'N/A'),
        classification:
            data.classification ||
            (data.exposureCategory
                ? `Category ${data.exposureCategory}`
                : exposureObj.category
                ? `Category ${exposureObj.category}`
                : 'N/A')
    };
}

/**
 * Strictly streams `patients` records belonging to THIS facility:
 * - For pending QR pre-fill forms: requires BOTH `facilityId` AND `facilityAcronym`
 *   to match the active facility before appearing in the pre-fill modal.
 * - For claimed/registered facility cases: requires `facilityId` (or legacy
 *   `facilityAcronym` / `facilityName` if `facilityId` wasn't stored on old docs).
 */
export function subscribeToFacilityPatients(
    { facilityId, facilityAcronym, facilityCode, facilityName },
    onRecordsUpdate,
    onError
) {
    const targetId = String(facilityId || '').trim();
    const targetAcronym = String(
        facilityAcronym || facilityCode || deriveFacilityCode(facilityName || '')
    )
        .toUpperCase()
        .trim();

    if (!targetId) {
        onRecordsUpdate([]);
        return () => {};
    }

    // Query Firestore directly by `facilityId` so we never download other facilities' patients
    const q = query(collection(db, 'patients'), where('facilityId', '==', targetId));

    return onSnapshot(
        q,
        (snapshot) => {
            const records = [];
            snapshot.forEach((docSnap) => {
                const raw = docSnap.data();
                const statusLower = String(raw.status || '').toLowerCase();
                const isPending =
                    raw.claimedByAbtc === false ||
                    raw.abtcClaimed === false ||
                    statusLower.includes('pending');

                const recFacId = String(raw.facilityId || raw.facility?.id || '').trim();
                const recAcronym = String(
                    raw.facilityAcronym || raw.facilityCode || raw.acronym || ''
                )
                    .toUpperCase()
                    .trim();

                // Verify exact facilityId match
                if (recFacId !== targetId) return;

                // For pending QR pre-fill forms, strictly require BOTH facilityId AND facilityAcronym to match
                if (isPending) {
                    if (!recAcronym || recAcronym !== targetAcronym) {
                        return;
                    }
                } else if (recAcronym && targetAcronym && recAcronym !== targetAcronym) {
                    return;
                }

                records.push(normalizePatientDoc(docSnap));
            });
            onRecordsUpdate(records);
        },
        (error) => {
            console.error('Patient database tracking error:', error);
            if (onError) onError(error);
        }
    );
}

/**
 * Deletes a patient record or discarded QR pre-fill form from `patients`.
 */
export async function deletePatientRecord(docId) {
    await deleteDoc(doc(db, 'patients', docId));
}

/**
 * Updates an existing patient record in `patients` and appends an audit entry
 * to `historyLogs`.
 */
export async function updatePatientRecord(docId, updatedPayload, editorName) {
    const payloadWithHistory = {
        ...updatedPayload,
        historyLogs: arrayUnion({
            action: 'Record Edited',
            timestamp: new Date().toISOString(),
            personnel: editorName || 'Attending Personnel',
            details: 'Record details updated from the patient registry.'
        })
    };

    await updateDoc(doc(db, 'patients', docId), payloadWithHistory);
}