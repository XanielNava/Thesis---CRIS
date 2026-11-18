/* ==========================================================================
   CRIS ABTC MODULE — ADMIN DASHBOARD DATABASE SERVICE (abtc-dash-db.js)
   Handles Admin Session & Facility Resolution, Aggregated Dashboard Metrics,
   and Facility-Scoped Calendar Announcements (`facility_announcements`).
   ========================================================================== */

import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
    doc,
    getDoc,
    setDoc,
    deleteDoc,
    collection,
    query,
    where,
    getDocs,
    onSnapshot,
    getCountFromServer,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

import { auth, db } from '../../firebase/firebase-config.js';

/**
 * Resolves the active Admin session and true Firestore `facilities` document ID.
 */
export function resolveAdminFacilitySession(onResolved) {
    const cachedId = sessionStorage.getItem('activeFacilityId') || null;
    if (cachedId) {
        onResolved(cachedId);
    }

    if (!auth) return;

    onAuthStateChanged(auth, async (user) => {
        let facilityId = sessionStorage.getItem('activeFacilityId') || null;

        if (user && !facilityId) {
            for (const fieldName of ['applicantUid', 'ownerUid', 'adminUid']) {
                try {
                    const q = query(
                        collection(db, 'facilities'),
                        where(fieldName, '==', user.uid)
                    );
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        facilityId = snap.docs[0].id;
                        break;
                    }
                } catch (e) {
                    console.warn(`facilities.${fieldName} lookup skipped:`, e);
                }
            }

            if (!facilityId) {
                facilityId = user.uid;
            }

            sessionStorage.setItem('activeFacilityId', facilityId);
            onResolved(facilityId);
        }
    });
}

/**
 * Fetches and caches facility branding (`facilityName`, `facilityAcronym`, `logoData`)
 * and administrator display name from `facilities/{facilityId}`.
 */
export async function fetchAdminFacilityBranding(facilityId) {
    let cachedName = sessionStorage.getItem('activeFacilityName');
    let cachedAcronym =
        sessionStorage.getItem('activeFacilityAcronym') ||
        sessionStorage.getItem('activeFacilityCode');
    let staffName = sessionStorage.getItem('activePersonnelName') || null;
    let logoData = null;

    if (facilityId && db) {
        try {
            const facilitySnap = await getDoc(doc(db, 'facilities', facilityId));
            if (facilitySnap.exists()) {
                const d = facilitySnap.data();
                cachedName = d.facilityName || d.name || cachedName || 'ABTC Facility';
                cachedAcronym = (
                    d.facilityAcronym ||
                    d.acronym ||
                    d.code ||
                    cachedAcronym ||
                    'ABTC'
                ).toUpperCase();
                staffName =
                    staffName || d.contactInfo?.contactPerson || 'Facility Administrator';
                logoData = d.logoData || null;

                sessionStorage.setItem('activeFacilityName', cachedName);
                sessionStorage.setItem('activeFacilityAcronym', cachedAcronym);
                sessionStorage.setItem('activeFacilityCode', cachedAcronym);
                sessionStorage.setItem('activePersonnelName', staffName);
            }
        } catch (e) {
            console.warn('Facility branding resolution skipped:', e);
        }
    }

    const displayFacilityName = cachedName
        ? `${cachedName} (${(cachedAcronym || 'ABTC').toUpperCase()})`
        : 'ABTC FACILITY';

    return {
        facilityName: cachedName || 'ABTC Facility',
        facilityAcronym: (cachedAcronym || 'ABTC').toUpperCase(),
        displayFacilityName,
        staffName: staffName || 'Administrator',
        logoData
    };
}

/**
 * Fetches server-side patient and Category III counts for `facilityId`.
 */
export async function fetchAdminAggregatedCounts(facilityId) {
    if (!facilityId) return { totalPatients: 0, categoryThreeCount: 0 };

    try {
        const rootPatientsCol = collection(db, 'patients');

        const totalQuery = query(
            rootPatientsCol,
            where('facilityId', '==', facilityId)
        );
        const totalSnap = await getCountFromServer(totalQuery);

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
    } catch (error) {
        console.error('Server-side metrics aggregation failed:', error);
        return { totalPatients: 0, categoryThreeCount: 0 };
    }
}

/**
 * Streams today's scheduled PEP doses count for `facilityId`.
 */
export function subscribeToAdminTodayScheduled(facilityId, todayISODate, onCountUpdate) {
    const facilityPatientsQuery = query(
        collection(db, 'patients'),
        where('facilityId', '==', facilityId)
    );

    return onSnapshot(facilityPatientsQuery, (snapshot) => {
        let scheduledTodayCount = 0;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const pepSchedule = data.pepScheduleDates || {};

            Object.keys(pepSchedule).forEach((dayKey) => {
                if (pepSchedule[dayKey] === todayISODate) {
                    scheduledTodayCount++;
                }
            });
        });

        onCountUpdate(scheduledTodayCount);
    });
}

/**
 * Streams total available PEP vials from `facilities/{facilityId}/vaccine-inventory`.
 */
export function subscribeToAdminVialStock(facilityId, onStockUpdate) {
    const inventoryColRef = collection(db, 'facilities', facilityId, 'vaccine-inventory');

    return onSnapshot(
        inventoryColRef,
        (snapshot) => {
            let totalVials = 0;
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const countVal = data.vialsLeft ?? data.vials ?? data.stock ?? 0;
                totalVials += Number(countVal);
            });
            onStockUpdate(totalVials);
        },
        (err) => {
            console.error('Inventory metric listener error:', err);
            onStockUpdate(0);
        }
    );
}

/**
 * Streams all calendar announcements strictly indexed by `facilityId`
 * from `facility_announcements` so only this facility's notes load.
 */
export function subscribeToAdminFacilityAnnouncements(facilityId, onAnnouncementsUpdate) {
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

                byDate[dateKey] = {
                    id: docSnap.id,
                    date: dateKey,
                    message: data.message || data.description || '',
                    createdBy: data.createdBy || 'Administrator',
                    updatedAt: data.updatedAt || null
                };
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
 * Saves (or clears if empty) an announcement for `facilityId` on `dateKey`
 * inside `facility_announcements/{facilityId}_{dateKey}`.
 */
export async function saveFacilityAnnouncement({
    facilityId,
    facilityAcronym,
    dateKey,
    message,
    createdBy
}) {
    if (!facilityId) {
        throw new Error('Facility ID not resolved. Please reload or log in again.');
    }
    if (!dateKey) {
        throw new Error('Please select a date first.');
    }

    const docId = `${facilityId}_${dateKey}`;
    const docRef = doc(db, 'facility_announcements', docId);
    const trimmed = String(message || '').trim();

    if (!trimmed) {
        await deleteDoc(docRef);
        return;
    }

    await setDoc(
        docRef,
        {
            facilityId,
            facilityAcronym: (facilityAcronym || 'ABTC').toUpperCase(),
            date: dateKey,
            title: trimmed.split('\n')[0] || 'Facility Announcement',
            message: trimmed,
            createdBy: createdBy || 'Administrator',
            updatedAt: serverTimestamp()
        },
        { merge: true }
    );
}

/**
 * Signs out the current Firebase Auth session.
 */
export async function signOutAdminSession() {
    if (auth) {
        await signOut(auth);
    }
}