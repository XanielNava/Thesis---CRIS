/* ==========================================================================
   CRIS LGU MODULE — ANIMAL REGISTRY DATABASE SERVICE
   Municipality-scoped Firestore access
   ========================================================================== */

import { db } from '../../firebase/firebase-config.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    addDoc,
    query,
    where,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const OWNERS_COLLECTION = "animal_owners";
const LGU_USERS_COLLECTION = "lgu-users";
const LGU_MUNICIPALITIES_COLLECTION = "lgu_municipalities";
const AUDIT_LOGS_COLLECTION = "audit_logs";

/**
 * Fetch the logged-in LGU officer's profile from lgu-users/{uid}.
 */
export async function fetchCurrentLguOfficer(uid) {
    if (!uid) return null;

    const snap = await getDoc(doc(db, LGU_USERS_COLLECTION, uid));

    return snap.exists()
        ? { id: snap.id, ...snap.data() }
        : null;
}

/**
 * Fetch registered municipalities and barangays.
 */
export async function fetchRegisteredMunicipalities() {
    const snap = await getDocs(
        collection(db, LGU_MUNICIPALITIES_COLLECTION)
    );

    return snap.docs
        .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
        }))
        .filter((municipality) => municipality.municipality);
}

/**
 * Fetch animal owners belonging ONLY to the officer's municipality.
 * This function deliberately does not fall back to fetching all records.
 */
export async function fetchAnimalRegistryRecords(municipalityFilter) {
    if (
        !municipalityFilter ||
        typeof municipalityFilter !== "string"
    ) {
        throw new Error(
            "A valid municipality filter is required to load LGU records."
        );
    }

    const colRef = collection(db, OWNERS_COLLECTION);

    const q = query(
        colRef,
        where("municipality", "==", municipalityFilter)
    );

    const snapshot = await getDocs(q);

    const recordsMap = {};

    snapshot.docs.forEach((docSnap) => {
        const d = docSnap.data();

        recordsMap[docSnap.id] = {
            id: docSnap.id,
            regId: d.regId || docSnap.id,
            lastName: d.lastName || "",
            firstName: d.firstName || "",
            middleInitial: d.middleInitial || "",
            suffix: d.suffix || "",
            contact: d.contact || "",
            street: d.street || "",
            barangay: d.barangay || "",
            municipality: d.municipality || "",
            province: d.province || "",
            region: d.region || "",
            zipCode: d.zipCode || "",
            photo: d.photo || "",
            animals: Array.isArray(d.animals) ? d.animals : []
        };
    });

    return recordsMap;
}

/**
 * Create a new Owner + Primary Animal record.
 * The municipality is taken from the authenticated officer's profile,
 * not from the submitted form.
 */
export async function createOwnerRecord(
    ownerKey,
    ownerPayload,
    officerProfile
) {
    const municipality =
        officerProfile?.municipality ||
        officerProfile?.address?.municipality ||
        "";

    if (!municipality) {
        throw new Error(
            "Cannot register an owner: the LGU officer has no assigned municipality."
        );
    }

    const docRef = doc(db, OWNERS_COLLECTION, ownerKey);

    const actorUid = officerProfile?.id || "";
    const actorName =
        officerProfile?.fullName ||
        officerProfile?.email ||
        "";

    const scopedPayload = {
        ...ownerPayload,
        municipality
    };

    const dataToSave = {
        ...scopedPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdByUid: actorUid,
        createdByName: actorName
    };

    await setDoc(docRef, dataToSave);

    await addDoc(
        collection(db, AUDIT_LOGS_COLLECTION),
        {
            action: "Animal Owner Registered",
            module: "LGU",
            affected: `${scopedPayload.lastName}, ${scopedPayload.firstName} (${scopedPayload.regId})`,
            performedBy: actorName,
            actorUid,
            details: {
                regId: ownerPayload.regId,
                municipality: scopedPayload.municipality,
                barangay: ownerPayload.barangay,
                notes: `Registered owner with ${scopedPayload.animals?.length || 0} animal(s)`
            },
            timestamp: serverTimestamp()
        }
    ).catch(() => {});

    return {
        id: ownerKey,
        ...scopedPayload
    };
}

/**
 * Update an existing Owner's demographic details.
 * Verifies that the record belongs to the officer's municipality.
 */
export async function updateOwnerRecord(
    ownerId,
    updatedFields,
    officerProfile
) {
    const municipality =
        officerProfile?.municipality ||
        officerProfile?.address?.municipality ||
        "";

    if (!municipality) {
        throw new Error(
            "Cannot update owner: the LGU officer has no assigned municipality."
        );
    }

    const docRef = doc(db, OWNERS_COLLECTION, ownerId);
    const existing = await getDoc(docRef);

    if (!existing.exists()) {
        throw new Error("Owner record was not found.");
    }

    if (existing.data().municipality !== municipality) {
        throw new Error(
            "You are not authorized to update records outside your municipality."
        );
    }

    await updateDoc(docRef, {
        ...updatedFields,
        municipality,
        updatedAt: serverTimestamp(),
        updatedBy:
            officerProfile?.fullName ||
            officerProfile?.email ||
            ""
    });
}

/**
 * Sync the owner's animals array.
 * Verifies that the owner belongs to the officer's municipality.
 */
export async function syncOwnerAnimals(
    ownerId,
    regId,
    animalsArray,
    actionNote,
    officerProfile
) {
    const municipality =
        officerProfile?.municipality ||
        officerProfile?.address?.municipality ||
        "";

    if (!municipality) {
        throw new Error(
            "Cannot update animals: the LGU officer has no assigned municipality."
        );
    }

    const docRef = doc(db, OWNERS_COLLECTION, ownerId);
    const existing = await getDoc(docRef);

    if (!existing.exists()) {
        throw new Error("Owner record was not found.");
    }

    if (existing.data().municipality !== municipality) {
        throw new Error(
            "You are not authorized to modify records outside your municipality."
        );
    }

    const actorName =
        officerProfile?.fullName ||
        officerProfile?.email ||
        "";

    const actorUid = officerProfile?.id || "";

    await updateDoc(docRef, {
        animals: animalsArray,
        updatedAt: serverTimestamp()
    });

    await addDoc(
        collection(db, AUDIT_LOGS_COLLECTION),
        {
            action: "Animal Profile Updated",
            module: "LGU",
            affected: `Registry ${regId}`,
            performedBy: actorName,
            actorUid,
            details: {
                ownerId,
                regId,
                notes: actionNote
            },
            timestamp: serverTimestamp()
        }
    ).catch(() => {});
}