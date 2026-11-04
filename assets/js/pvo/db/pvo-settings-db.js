import { auth, db } from '../../firebase/firebase-config.js';
import { 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    collection, 
    getDocs, 
    query, 
    orderBy, 
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { updatePassword } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

/**
 * Retrieves officer profile from the canonical users collection
 */
export async function getOfficerProfile(uid) {
    const userDocRef = doc(db, "users", uid);
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) throw new Error("Officer record not found in system.");
    return snap.data();
}

/**
 * Updates officer user profile record
 */
export async function updateOfficerProfile(uid, { firstName, lastName }) {
    const userDocRef = doc(db, "users", uid);
    await updateDoc(userDocRef, {
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`.trim(),
        updatedAt: serverTimestamp()
    });
}

/**
 * Updates user password in Firebase Auth
 */
export async function changeOfficerPassword(newPassword) {
    const user = auth.currentUser;
    if (!user) throw new Error("No active authenticated session.");
    await updatePassword(user, newPassword);
}

/**
 * Batches uploaded case records to Firestore
 */
export async function batchSaveRabiesCases(records, fileName) {
    const batch = writeBatch(db);
    const colRef = collection(db, "pvo_rabies_cases");

    records.forEach((record, index) => {
        const docRef = doc(colRef);
        batch.set(docRef, {
            ...record,
            documentOrder: index + 1,
            uploadedAt: serverTimestamp()
        });
    });

    await batch.commit();

    // Log to import history
    await setDoc(doc(collection(db, "import_history")), {
        dataset: "PVO Rabies Cases",
        fileName,
        recordsCount: records.length,
        status: "Completed",
        uploadedAt: serverTimestamp()
    });
}

/**
 * Batches uploaded population records to Firestore
 */
export async function batchSavePopulationData(records, fileName) {
    const batch = writeBatch(db);

    records.forEach((record) => {
        const docId = record.municipality.toUpperCase().replace(/\s+/g, '_');
        const docRef = doc(db, "population_data", docId);
        batch.set(docRef, {
            ...record,
            updatedAt: serverTimestamp()
        }, { merge: true });
    });

    await batch.commit();

    // Log to import history
    await setDoc(doc(collection(db, "import_history")), {
        dataset: "Iloilo Population",
        fileName,
        recordsCount: records.length,
        status: "Completed",
        uploadedAt: serverTimestamp()
    });
}

/**
 * Retrieves import audit history logs
 */
export async function fetchImportAuditLogs() {
    const q = query(collection(db, "import_history"), orderBy("uploadedAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}