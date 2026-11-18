/* ==========================================================================
   CRIS ABTC MODULE — ITR DATABASE SERVICE (itr-db.js)
   Handles Firebase Auth/facility resolution, sequential record number preview,
   loading mobile QR pre-fill documents, and transactional ITR persistence.
   ========================================================================== */

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    collection,
    addDoc,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { auth, db } from '../../firebase/firebase-config.js';

/**
 * Resolves the active ABTC facility ID for the logged-in staff session.
 */
export function resolveItrFacilitySession(onResolved) {
    const cachedFacilityId = sessionStorage.getItem("activeFacilityId") || null;

    if (!auth) {
        onResolved(cachedFacilityId);
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        let facilityId = sessionStorage.getItem("activeFacilityId") || null;

        if (user && !facilityId) {
            try {
                const staffSnap = await getDoc(doc(db, "abtc_personnel", user.uid));
                if (staffSnap.exists() && staffSnap.data().facilityId) {
                    facilityId = staffSnap.data().facilityId;
                } else {
                    const userSnap = await getDoc(doc(db, "users", user.uid));
                    facilityId = (userSnap.exists() && userSnap.data().facilityId)
                        ? userSnap.data().facilityId
                        : user.uid;
                }
            } catch (err) {
                facilityId = user.uid;
            }
            if (facilityId) {
                sessionStorage.setItem("activeFacilityId", facilityId);
            }
        }

        onResolved(facilityId);
    });
}

/**
 * Fetches the facility acronym and next sequential ITR display number
 * from `facilities` and `facility_counters`.
 */
export async function fetchPreviewRecordNumber(facilityId) {
    const year = new Date().getFullYear();
    if (!facilityId) return `ABTC - ${year} - 001`;

    try {
        let facilityAcronym =
            sessionStorage.getItem("activeFacilityAcronym") ||
            sessionStorage.getItem("activeFacilityCode");

        if (!facilityAcronym) {
            const facilitySnap = await getDoc(doc(db, "facilities", facilityId));
            if (facilitySnap.exists()) {
                const facilityData = facilitySnap.data();
                facilityAcronym =
                    facilityData.facilityAcronym ||
                    facilityData.acronym ||
                    facilityData.code ||
                    "ABTC";
                sessionStorage.setItem("activeFacilityAcronym", facilityAcronym.toUpperCase());
                sessionStorage.setItem("activeFacilityCode", facilityAcronym.toUpperCase());
            } else {
                facilityAcronym = "ABTC";
            }
        }

        const safeAcronym = facilityAcronym.toUpperCase();

        let nextIndex = 1;
        try {
            const counterSnap = await getDoc(doc(db, "facility_counters", facilityId));
            if (counterSnap.exists()) {
                nextIndex = (counterSnap.data().currentSequence || 0) + 1;
            }
        } catch (ce) {
            console.warn("Facility counter fallback:", ce);
        }

        const paddedSeq = String(nextIndex).padStart(3, '0');
        return `${safeAcronym} - ${year} - ${paddedSeq}`;
    } catch (err) {
        console.error("Counter preview error:", err);
        return `ABTC - ${year} - 001`;
    }
}

/**
 * Loads a pending mobile app QR pre-fill record from `patients/{prefillId}`.
 */
export async function fetchPrefillPatientRecord(prefillDocId) {
    if (!prefillDocId) return null;
    const docRef = doc(db, "patients", prefillDocId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}

/**
 * Atomically increments `facility_counters/{facilityId}` and saves the completed ITR
 * into `patients`. If `prefillDocId` is present (e.g., `CRIS-...`), updates that
 * document in-place so the mobile app Case ID and history link remain intact.
 */
export async function saveItrPatientRecord({
    facilityId,
    personnelName,
    prefillDocId,
    formPayload
}) {
    const acronym = (
        sessionStorage.getItem("activeFacilityAcronym") ||
        sessionStorage.getItem("activeFacilityCode") ||
        "ABTC"
    ).toUpperCase();

    let generatedCustomId = "";

    // 1. Transactional Counter Management
    try {
        const counterDocRef = doc(db, "facility_counters", facilityId);
        await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterDocRef);
            const currentSeq = counterDoc.exists() ? (counterDoc.data().currentSequence || 0) : 0;
            const nextIndex = currentSeq + 1;
            generatedCustomId = `${acronym}-${String(nextIndex).padStart(3, '0')}`;
            transaction.set(
                counterDocRef,
                {
                    currentSequence: nextIndex,
                    lastUpdated: serverTimestamp()
                },
                { merge: true }
            );
        });
    } catch (counterError) {
        console.warn("Counter transaction bypassed, using fallback timestamp ID:", counterError);
        generatedCustomId = `${acronym}-${Date.now().toString().slice(-4)}`;
    }

    const fullItrDisplayString = formPayload.itrDisplayNo || generatedCustomId;
    const finalCaseId = prefillDocId || generatedCustomId;

    const finalPayload = {
        ...formPayload,
        recordNo: generatedCustomId,
        caseId: finalCaseId,
        patientId: generatedCustomId,
        itrDisplayNo: fullItrDisplayString,
        facilityId,
        facilityAcronym: acronym,
        status: "Active",
        claimedByAbtc: true,
        claimedByAbtcId: facilityId,
        currentDayDose: "Day 0",
        updatedAt: serverTimestamp(),
        historyLogs: [
            {
                action: "Record Registered",
                timestamp: new Date().toISOString(),
                personnel: personnelName,
                details: prefillDocId
                    ? `Mobile QR pre-fill (${prefillDocId}) claimed and completed under ITR No. ${fullItrDisplayString}. Day 0 administered.`
                    : `Initial consultation completed under ITR No. ${fullItrDisplayString}. Day 0 administered.`
            }
        ]
    };

    // 2. Persist to `patients`
    if (prefillDocId) {
        await setDoc(doc(db, "patients", prefillDocId), finalPayload, { merge: true });
    } else {
        finalPayload.createdAt = serverTimestamp();
        await addDoc(collection(db, "patients"), finalPayload);
    }

    return {
        itrDisplayNo: fullItrDisplayString,
        caseId: finalCaseId,
        fullName: finalPayload.fullName
    };
}