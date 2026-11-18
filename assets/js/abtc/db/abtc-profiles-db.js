/* ==========================================================================
   ABTC WORKSPACE PROFILE GATEKEEPER — DATABASE SERVICE (abtc-profile-db.js)
   Handles:
     1. Direct QR Badge verification (Zero PIN)
     2. Alternative Staff Email + Default PIN verification
     3. Facility status checks & shift audit logging
   ========================================================================== */

import {
    collection,
    collectionGroup,
    doc,
    getDoc,
    getDocs,
    addDoc,
    query,
    where,
    limit
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

import { db } from '../../firebase/firebase-config.js';

/**
 * Verifies parent facility existence and operational status in `facilities/{facilityId}`
 */
async function verifyFacilityActive(facilityId, fallbackName = 'ABTC Facility', fallbackAcronym = 'ABTC') {
    if (!facilityId) {
        throw new Error('Facility ID is missing from this staff profile.');
    }

    const facSnap = await getDoc(doc(db, 'facilities', facilityId));
    if (!facSnap.exists()) {
        throw new Error('Unrecognized Facility: The facility linked to this account is not commissioned or has been deleted.');
    }

    const facilityData = facSnap.data();
    const facilityStatus = String(facilityData.status || 'Active').toLowerCase();

    if (facilityStatus !== 'active') {
        throw new Error(
            `Facility Suspended: Access for "${facilityData.facilityName || 'this facility'}" has been marked as ${(facilityData.status || 'Inactive').toUpperCase()} by the PHO. Duty clock-in is prohibited.`
        );
    }

    return {
        id: facilityId,
        name: facilityData.facilityName || fallbackName,
        acronym: facilityData.acronym || facilityData.code || fallbackAcronym
    };
}

/**
 * Builds the canonical session context & destination route for a verified duty staff member
 */
function buildStaffSession(staffRecord, facilityMeta, method) {
    if (String(staffRecord.status || 'Active').toLowerCase() === 'deactivated') {
        throw new Error('Access Denied: This staff personnel profile has been deactivated.');
    }

    const resolvedRole = staffRecord.position || staffRecord.facilityRole || staffRecord.designation || 'Nurse';
    const staffName = staffRecord.name || staffRecord.fullName || staffRecord.email || 'Duty Staff';
    const redirectUrl = resolvedRole.toLowerCase().includes('pharmacist')
        ? 'abtc-pharmacy.html'
        : 'abtc-home.html';

    return {
        facilityId: facilityMeta.id,
        facilityName: facilityMeta.name,
        facilityAcronym: facilityMeta.acronym,
        staffId: staffRecord.id,
        staffName,
        role: resolvedRole,
        method,
        redirectUrl
    };
}

/**
 * 1. DIRECT QR BADGE VERIFICATION (NO PIN REQUIRED)
 */
export async function verifyStaffByQrBadge(decodedText) {
    let badgeData;
    try {
        badgeData = JSON.parse(decodedText);
    } catch {
        throw new Error('Invalid QR Code: Unrecognized badge format.');
    }

    if (badgeData.type !== 'CRIS_STAFF_ID' || !badgeData.uid || !badgeData.facilityId) {
        throw new Error('Invalid QR Code: Not an authorized CRIS Staff ID Badge.');
    }

    const facilityMeta = await verifyFacilityActive(
        badgeData.facilityId,
        badgeData.facilityName || 'ABTC Facility',
        badgeData.acronym || 'ABTC'
    );

    // Check subcollection first: facilities/{facilityId}/staff/{uid}
    let staffRecord = null;
    const staffSnap = await getDoc(doc(db, 'facilities', badgeData.facilityId, 'staff', badgeData.uid));

    if (staffSnap.exists()) {
        staffRecord = { id: staffSnap.id, ...staffSnap.data() };
    } else {
        // Fallback: master `users` collection
        const userSnap = await getDoc(doc(db, 'users', badgeData.uid));
        if (userSnap.exists()) {
            staffRecord = { id: userSnap.id, ...userSnap.data() };
        }
    }

    if (!staffRecord) {
        throw new Error('Staff record not found on this facility\'s roster. Please contact your administrator.');
    }

    return buildStaffSession(staffRecord, facilityMeta, 'QR Badge (Direct)');
}

/**
 * 2. ALTERNATIVE EMAIL + DEFAULT PIN VERIFICATION
 */
export async function verifyStaffByEmailAndPin(emailInput, pinInput) {
    const cleanEmail = String(emailInput || '').trim().toLowerCase();
    const cleanPin = String(pinInput || '').trim();

    if (!cleanEmail || !cleanPin) {
        throw new Error('Please enter both your registered email address and your assigned PIN.');
    }

    let staffRecord = null;
    let resolvedFacilityId = '';

    // 1. Search `facilities/{facilityId}/staff` subcollections via collectionGroup
    try {
        const staffGroupQ = query(
            collectionGroup(db, 'staff'),
            where('email', '==', cleanEmail),
            limit(1)
        );
        const groupSnap = await getDocs(staffGroupQ);

        if (!groupSnap.empty) {
            const docSnap = groupSnap.docs[0];
            staffRecord = { id: docSnap.id, ...docSnap.data() };
            resolvedFacilityId = staffRecord.facilityId || docSnap.ref.parent?.parent?.id || '';
        }
    } catch (err) {
        console.warn('Staff collectionGroup query fallback:', err);
    }

    // 2. Fallback: Search master `users` collection by email
    if (!staffRecord) {
        const usersQ = query(
            collection(db, 'users'),
            where('email', '==', cleanEmail),
            limit(5)
        );
        const usersSnap = await getDocs(usersQ);
        const matchedUser = usersSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .find((u) => u.facilityId && (!u.module || String(u.module).toUpperCase() === 'ABTC'));

        if (matchedUser) {
            staffRecord = matchedUser;
            resolvedFacilityId = matchedUser.facilityId;
        }
    }

    if (!staffRecord) {
        throw new Error('Email not found in any registered ABTC facility staff roster.');
    }

    const facilityMeta = await verifyFacilityActive(
        resolvedFacilityId,
        staffRecord.facilityName || 'ABTC Facility'
    );

    const validPin = String(staffRecord.pin ?? staffRecord.defaultPin ?? '1234').trim();
    if (cleanPin !== validPin) {
        throw new Error('Access Denied: Incorrect security PIN.');
    }

    return buildStaffSession(staffRecord, facilityMeta, 'Email & Default PIN');
}

/**
 * 3. RECORD VERIFIED SHIFT CLOCK-IN IN `audit_logs`
 */
export async function recordDutyClockInAudit(session) {
    try {
        await addDoc(collection(db, 'audit_logs'), {
            facilityId: session.facilityId,
            facilityName: session.facilityName,
            personnelName: session.staffName,
            role: session.role,
            action: `Duty Clock-In (${session.method})`,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.warn('Audit trace log skipped:', err);
    }
}