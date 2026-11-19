/* ==========================================================================
   CRIS ABTC MODULE — HOME DASHBOARD DATABASE SERVICE (abtc-home-db.js)
   Handles Facility Session & Branding Resolution, Aggregated Metrics,
   Real-Time Patient Schedule & Inventory Streams, Facility-Scoped
   Announcements (`facility_announcements`), and Staff Security PIN Updates.
   ========================================================================== */

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    addDoc,
    onSnapshot,
    query,
    where,
    getCountFromServer
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

import { auth, db } from '../../firebase/firebase-config.js';

/**
 * Resolves the active ABTC facility ID from sessionStorage, `abtc_personnel`,
 * `users`, or direct `facilities` ownership.
 */
export function resolveHomeFacilitySession(onResolved) {
    const cachedId = sessionStorage.getItem('activeFacilityId') || null;
    if (cachedId) {
        onResolved(cachedId);
    }

    if (!auth) return;

    onAuthStateChanged(auth, async (user) => {
        let facilityId = sessionStorage.getItem('activeFacilityId') || null;

        if (user && !facilityId) {
            try {
                const staffSnap = await getDoc(doc(db, 'abtc_personnel', user.uid));
                if (staffSnap.exists() && staffSnap.data().facilityId) {
                    facilityId = staffSnap.data().facilityId;
                } else {
                    const userDoc = await getDoc(doc(db, 'users', user.uid));
                    facilityId =
                        userDoc.exists() && userDoc.data().facilityId
                            ? userDoc.data().facilityId
                            : user.uid;
                }
            } catch (e) {
                facilityId = user.uid;
            }

            if (facilityId) {
                sessionStorage.setItem('activeFacilityId', facilityId);
                onResolved(facilityId);
            }
        }
    });
}

/**
 * Resolves facility name and acronym from sessionStorage or `facilities/{facilityId}`.
 */
export async function fetchFacilityBranding(facilityId) {
    const cachedName = sessionStorage.getItem('activeFacilityName');
    const cachedAcronym =
        sessionStorage.getItem('activeFacilityAcronym') ||
        sessionStorage.getItem('activeFacilityCode');

    if (cachedName) {
        return {
            facilityName: cachedName,
            facilityAcronym: (cachedAcronym || 'ABTC').toUpperCase()
        };
    }

    if (!facilityId || !db) {
        return {
            facilityName: 'Animal Bite Treatment Center (ABTC)',
            facilityAcronym: 'ABTC'
        };
    }

    try {
        const facilitySnap = await getDoc(doc(db, 'facilities', facilityId));
        if (facilitySnap.exists()) {
            const facData = facilitySnap.data();
            const facName =
                facData.facilityName || facData.name || 'Animal Bite Treatment Center';
            const acronym = (
                facData.facilityAcronym ||
                facData.acronym ||
                facData.code ||
                'ABTC'
            ).toUpperCase();

            sessionStorage.setItem('activeFacilityName', facName);
            sessionStorage.setItem('activeFacilityAcronym', acronym);
            sessionStorage.setItem('activeFacilityCode', acronym);

            return { facilityName: facName, facilityAcronym: acronym };
        }
    } catch (err) {
        console.error('Facility branding fetch error:', err);
    }

    return {
        facilityName: 'Animal Bite Treatment Center (ABTC)',
        facilityAcronym: 'ABTC'
    };
}

/**
 * Fetches server-side counts for Total Registered Patients and Category III Exposures
 * strictly scoped to `facilityId`.
 */
export async function fetchAggregatedHomeMetrics(facilityId) {
    if (!facilityId) return { totalPatients: 0, categoryThreeCount: 0 };

    try {
        const rootPatientsCol = collection(db, 'patients');

        const facilityQuery = query(
            rootPatientsCol,
            where('facilityId', '==', facilityId)
        );
        const totalSnap = await getCountFromServer(facilityQuery);

        const cat3Query = query(
            rootPatientsCol,
            where('facilityId', '==', facilityId),
            where('classification', '==', 'Category III')
        );
        const cat3Snap = await getCountFromServer(cat3Query);

        return {
            totalPatients: totalSnap.data().count,
            categoryThreeCount: cat3Snap.data().count
        };
    } catch (err) {
        console.error('Metric aggregation error:', err);
        return { totalPatients: 0, categoryThreeCount: 0 };
    }
}

/**
 * Streams today's scheduled PEP doses for `facilityId`.
 */
export function subscribeToTodaySchedule(facilityId, todayISODate, onScheduleUpdate) {
    const patientsQuery = query(
        collection(db, 'patients'),
        where('facilityId', '==', facilityId)
    );

    return onSnapshot(patientsQuery, (snapshot) => {
        const todayDosesList = [];

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const pepSchedule = data.pepScheduleDates || {};
            const completedDoses = Array.isArray(data.completedDoses) ? data.completedDoses : [];

            Object.keys(pepSchedule).forEach((dayKey) => {
                if (pepSchedule[dayKey] === todayISODate) {
                    const dayNum = dayKey.replace(/\D/g, '');
                    const cleanDoseLabel = `Day ${dayNum}`;

                    const isDone = completedDoses.some((done) => {
                        const cleanDone = String(done).replace(/\s+/g, '').toLowerCase();
                        const cleanTarget = cleanDoseLabel.replace(/\s+/g, '').toLowerCase();
                        return cleanDone === cleanTarget || cleanDone === dayKey.toLowerCase();
                    });

                    todayDosesList.push({
                        docId: docSnap.id,
                        itrNo:
                            data.itrDisplayNo ||
                            data.caseId ||
                            data.recordNo ||
                            docSnap.id.substring(0, 6).toUpperCase(),
                        patientName: data.fullName || data.name || 'Unknown Patient',
                        targetDoseLabel: cleanDoseLabel,
                        contactNo: data.contactNo || data.mobileNumber || 'N/A',
                        status: isDone ? 'Completed' : 'Pending'
                    });
                }
            });
        });

        onScheduleUpdate(todayDosesList);
    });
}

/**
 * Streams total available PEP vials from `facilities/{facilityId}/vaccine-inventory`.
 */
export function subscribeToVaccineInventoryCount(facilityId, onStockUpdate) {
    const inventoryColRef = collection(db, 'facilities', facilityId, 'vaccine-inventory');
    return onSnapshot(inventoryColRef, (snapshot) => {
        let totalVials = 0;
        snapshot.forEach((docSnap) => {
            totalVials += Number(docSnap.data().vialsLeft || 0);
        });
        onStockUpdate(totalVials);
    });
}

/**
 * Streams announcements strictly indexed by `facilityId` from `facility_announcements`
 * so each ABTC facility only sees its own administrator announcements and reminders.
 */
export function subscribeToFacilityAnnouncements(facilityId, onAnnouncementsUpdate) {
    if (!facilityId) {
        onAnnouncementsUpdate({});
        return () => {};
    }

    const q = query(
        collection(db, 'facility_announcements'),
        where('facilityId', '==', facilityId)
    );

    return onSnapshot(
        q,
        (snapshot) => {
            const byDate = {};
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.facilityId !== facilityId) return;

                const dateKey = String(data.date || '').trim();
                if (!dateKey) return;

                if (!byDate[dateKey]) {
                    byDate[dateKey] = [];
                }
                byDate[dateKey].push({
                    id: docSnap.id,
                    date: dateKey,
                    message: data.message || data.text || '',
                    createdBy: data.createdBy || data.author || 'Administrator',
                    updatedAt: data.updatedAt || data.createdAt || null
                });
            });
            onAnnouncementsUpdate(byDate);
        },
        (err) => {
            console.error('Facility announcements stream error:', err);
            onAnnouncementsUpdate({});
        }
    );
}

/**
 * Verifies and updates the logged-in duty staff member's 4-digit security PIN
 * and appends an audit entry to `facilities/{facilityId}/activity_logs`.
 */
export async function updateStaffSecurityPin({
    facilityId,
    personnelName,
    currentPin,
    newPin
}) {
    let staffDocId =
        sessionStorage.getItem('activeStaffUid') || sessionStorage.getItem('activeStaffId');

    if (!staffDocId) {
        const staffQuery = query(
            collection(db, 'facilities', facilityId, 'staff'),
            where('name', '==', personnelName || '')
        );
        const querySnap = await getDocs(staffQuery);
        if (!querySnap.empty) {
            staffDocId = querySnap.docs[0].id;
            sessionStorage.setItem('activeStaffUid', staffDocId);
        }
    }

    if (!staffDocId) {
        throw new Error(
            'Unable to identify your staff record. Please try logging in again with your badge.'
        );
    }

    const staffRef = doc(db, 'facilities', facilityId, 'staff', staffDocId);
    const staffSnap = await getDoc(staffRef);

    if (!staffSnap.exists()) {
        throw new Error('Staff record was not found in database.');
    }

    const staffData = staffSnap.data();
    if (String(staffData.pin) !== String(currentPin)) {
        throw new Error('Current PIN is incorrect.');
    }

    await updateDoc(staffRef, {
        pin: newPin,
        pinUpdatedAt: new Date().toISOString()
    });

    await addDoc(collection(db, 'facilities', facilityId, 'activity_logs'), {
        facilityId,
        personnelName: staffData.name || personnelName || 'Duty Personnel',
        role: staffData.position || 'Nurse',
        action: 'Updated Security PIN',
        timestamp: new Date().toISOString()
    });
}