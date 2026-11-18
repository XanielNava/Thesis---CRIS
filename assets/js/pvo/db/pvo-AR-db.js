import { db } from '../../firebase/firebase-config.js';
import { 
    collection, 
    doc, 
    getDocs, 
    getDoc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    serverTimestamp,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const OWNERS_COLLECTION = "animal_owners";

/**
 * Fetches all registered animal owners and their associated pets from Firestore.
 */
export async function fetchAllOwners() {
    const q = query(collection(db, OWNERS_COLLECTION), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const owners = {};

    snapshot.forEach(docSnap => {
        owners[docSnap.id] = {
            id: docSnap.id,
            ...docSnap.data()
        };
    });

    return owners;
}

/**
 * Fetches a single owner by document ID.
 */
export async function getOwnerById(ownerId) {
    const docRef = doc(db, OWNERS_COLLECTION, ownerId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error("Owner record not found.");
    return { id: snap.id, ...snap.data() };
}

/**
 * Creates a new animal owner document in Firestore.
 */
export async function saveNewOwner(ownerData) {
    const docRef = doc(collection(db, OWNERS_COLLECTION));
    const payload = {
        ...ownerData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };
    await setDoc(docRef, payload);
    return { id: docRef.id, ...payload };
}

/**
 * Updates an owner's demographic information.
 */
export async function updateOwner(ownerId, updatedFields) {
    const docRef = doc(db, OWNERS_COLLECTION, ownerId);
    const payload = {
        ...updatedFields,
        updatedAt: serverTimestamp()
    };
    await updateDoc(docRef, payload);
}

/**
 * Persists changes to an owner's registered animals list (add, edit, update-vax, delete).
 */
export async function updateOwnerAnimals(ownerId, animalsList) {
    const docRef = doc(db, OWNERS_COLLECTION, ownerId);
    await updateDoc(docRef, {
        animals: animalsList,
        updatedAt: serverTimestamp()
    });
}

/**
 * Deletes an entire owner record.
 */
export async function deleteOwnerRecord(ownerId) {
    const docRef = doc(db, OWNERS_COLLECTION, ownerId);
    await deleteDoc(docRef);
}