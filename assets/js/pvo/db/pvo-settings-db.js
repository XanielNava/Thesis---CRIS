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
    const userDocRef = doc(db, "pvo-users", uid);
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) throw new Error("Officer record not found in system.");
    return snap.data();
}

/**
 * Updates officer user profile record
 */
export async function updateOfficerProfile(uid, { firstName, lastName }) {
    const userDocRef = doc(db, "pvo-users", uid);
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
 * Batches uploaded population records to Firestore with robust row filtering & normalization
 */
export async function batchSavePopulationData(records, fileName) {
    const batch = writeBatch(db);
    let validRecordsCount = 0;

    records.forEach((record) => {
        // Find municipality key dynamically across potential column name variations
        const muniKey = Object.keys(record).find(k => 
            /municipality|city|province|barangay/i.test(k)
        );
        const popKey = Object.keys(record).find(k => 
            /total\s*pop|population/i.test(k)
        );

        const rawMuni = muniKey ? record[muniKey] : (record.municipality || record.City || record.MUNICIPALITY);
        const rawPop = popKey ? record[popKey] : (record.totalPopulation || record.population || record.POPULATION);

        if (!rawMuni || typeof rawMuni !== 'string') return;

        const cleanMuni = rawMuni.trim();
        // Skip metadata headers, total summary rows, or empty lines
        if (
            !cleanMuni || 
            cleanMuni.toUpperCase().includes('TABLE') || 
            cleanMuni.toUpperCase().includes('PROVINCE, CITY') || 
            cleanMuni.toUpperCase().includes('ILOILO *') ||
            cleanMuni.toUpperCase().includes('TOTAL')
        ) {
            return;
        }

        const popValue = Number(String(rawPop).replace(/,/g, '')) || 0;
        if (popValue <= 0) return;

        const docId = cleanMuni.toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
        const docRef = doc(db, "population_data", docId);
        
        batch.set(docRef, {
            municipality: cleanMuni,
            totalPopulation: popValue,
            updatedAt: serverTimestamp()
        }, { merge: true });

        validRecordsCount++;
    });

    if (validRecordsCount === 0) {
        throw new Error("No valid municipality population records could be extracted from the uploaded spreadsheet.");
    }

    await batch.commit();

    // Log to import history
    await setDoc(doc(collection(db, "import_history")), {
        dataset: "Iloilo Population",
        fileName,
        recordsCount: validRecordsCount,
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