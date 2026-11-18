/* ==========================================================================
   CRIS ABTC MODULE — PHARMACY DATABASE SERVICE (abtc-pharmacy-db.js)
   Handles Facility Session Resolution, Real-Time FIFO/FEFO Vaccine Inventory,
   Pending Nurse Requisitions, Multi-Batch Stock Deduction, and Facility-Scoped
   Calendar Announcements (`facility_announcements`).
   ========================================================================== */

import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
    collection,
    onSnapshot,
    query,
    where,
    doc,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

import { auth, db } from '../../firebase/firebase-config.js';

/**
 * Resolves the active ABTC facility ID for the logged-in Pharmacist session.
 */
export function resolvePharmacyFacilitySession(onResolved) {
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
 * Streams `facilities/{facilityId}/vaccine-inventory` sorted by FIFO/FEFO
 * (earliest expiration date first, then earliest arrival timestamp).
 */
export function subscribeToPharmacyInventory(facilityId, onUpdate) {
    const invColRef = collection(db, 'facilities', facilityId, 'vaccine-inventory');

    return onSnapshot(invColRef, (snapshot) => {
        const items = [];
        let totalVials = 0;
        let totalDoses = 0;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const vials = Number(data.vialsLeft) || 0;
            const dosesPerVial = Number(data.dosesPerVial) || 1;

            totalVials += vials;
            totalDoses += vials * dosesPerVial;

            items.push({
                docId: docSnap.id,
                ...data,
                vialsLeft: vials,
                dosesPerVial
            });
        });

        items.sort((a, b) => {
            const expA = a.expDate ? new Date(a.expDate).getTime() : Infinity;
            const expB = b.expDate ? new Date(b.expDate).getTime() : Infinity;
            if (expA !== expB) return expA - expB;

            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return timeA - timeB;
        });

        onUpdate({ inventoryList: items, totalVials, totalDoses });
    });
}

/**
 * Streams pending nurse vaccine requisition tickets for `facilityId`.
 */
export function subscribeToPharmacyRequisitions(facilityId, onUpdate) {
    const reqColRef = collection(db, 'facilities', facilityId, 'vaccine-requisitions');
    const q = query(reqColRef, where('status', '==', 'Pending Release'));

    return onSnapshot(q, (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
            list.push({
                docId: docSnap.id,
                ...docSnap.data()
            });
        });

        list.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        onUpdate(list);
    });
}

/**
 * Streams facility-specific announcements from `facility_announcements`
 * strictly indexed by `facilityId`.
 */
export function subscribeToPharmacyAnnouncements(facilityId, onUpdate) {
    if (!facilityId) {
        onUpdate({});
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
                    message: data.message || data.description || '',
                    createdBy: data.createdBy || 'Administrator',
                    updatedAt: data.updatedAt || null
                });
            });
            onUpdate(byDate);
        },
        (err) => {
            console.error('Pharmacy announcements stream error:', err);
            onUpdate({});
        }
    );
}

/**
 * Registers an incoming vaccine batch into `facilities/{facilityId}/vaccine-inventory`.
 */
export async function registerIncomingBatch(facilityId, batchPayload) {
    await addDoc(
        collection(db, 'facilities', facilityId, 'vaccine-inventory'),
        batchPayload
    );
}

/**
 * Deletes a batch document from `facilities/{facilityId}/vaccine-inventory`.
 */
export async function removeInventoryBatch(facilityId, batchDocId) {
    await deleteDoc(doc(db, 'facilities', facilityId, 'vaccine-inventory', batchDocId));
}

/**
 * Commits a multi-batch FIFO stock deduction and marks the requisition ticket Released.
 */
export async function commitFifoRequisitionRelease({
    facilityId,
    reqDocId,
    allocationPlan,
    fulfilledBy
}) {
    for (const alloc of allocationPlan) {
        await updateDoc(
            doc(db, 'facilities', facilityId, 'vaccine-inventory', alloc.docId),
            { vialsLeft: alloc.finalVials }
        );
    }

    const assignedLotsString = allocationPlan
        .map((p) => `${p.batchNo} (${p.deductCount}v)`)
        .join(', ');

    await updateDoc(
        doc(db, 'facilities', facilityId, 'vaccine-requisitions', reqDocId),
        {
            status: 'Released',
            fulfilledBy,
            batchAssigned: assignedLotsString,
            allocationBreakdown: allocationPlan,
            releasedAt: new Date().toISOString()
        }
    );

    return assignedLotsString;
}

/**
 * Signs out the active Firebase Auth session.
 */
export async function signOutPharmacySession() {
    if (auth) {
        await signOut(auth);
    }
}