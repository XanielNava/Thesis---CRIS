// ==============================================================================
// pho_settings-db.js - PHO Settings Database & Storage Controller
// ==============================================================================

import { auth, db } from '../../firebase/firebase-config.js';
import { 
    collection, 
    writeBatch, 
    doc, 
    getDoc, 
    setDoc, 
    getDocs, 
    query, 
    orderBy, 
    limit, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { 
    updatePassword, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const PHO_CONFIG_DOC = ["system_config", "pho_profile"];
const AUDIT_COL = "audit_logs";
const IMPORT_HISTORY_COL = "import_history";

export function listenToAuth(callback) {
    return onAuthStateChanged(auth, callback);
}

export async function fetchPhoProfile() {
    const snap = await getDoc(doc(db, ...PHO_CONFIG_DOC));
    return snap.exists() ? snap.data() : null;
}

export async function savePhoProfile(payload) {
    payload.updatedAt = serverTimestamp();
    await setDoc(doc(db, ...PHO_CONFIG_DOC), payload, { merge: true });
    await logAudit("Facility Updated", "Updated PHO provincial workspace & contact profile");
}

export async function fetchUserData(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
}

export async function updateUserData(uid, profilePayload, newPassword = null) {
    if (newPassword && auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
    }
    profilePayload.updatedAt = serverTimestamp();
    await setDoc(doc(db, "users", uid), profilePayload, { merge: true });
    await logAudit("User Profile Updated", `Updated details for ${profilePayload.fullName || uid}`);
}

export async function fetchAuditLogs(limitCount = 10) {
    const q = query(collection(db, AUDIT_COL), orderBy("timestamp", "desc"), limit(limitCount));
    const snap = await getDocs(q);
    const logs = [];
    snap.forEach(d => logs.push({ id: d.id, ...d.data() }));
    return logs;
}

export async function fetchImportHistory(limitCount = 15) {
    const q = query(collection(db, IMPORT_HISTORY_COL), orderBy("timestamp", "desc"), limit(limitCount));
    const snap = await getDocs(q);
    const history = [];
    snap.forEach(d => history.push({ id: d.id, ...d.data() }));
    return history;
}

export async function logAudit(action, details) {
    try {
        await setDoc(doc(collection(db, AUDIT_COL)), {
            timestamp: serverTimestamp(),
            action,
            details,
            performedBy: auth.currentUser?.email || "PHO Personnel"
        });
    } catch (e) {
        console.warn("Audit logging failed:", e);
    }
}

export async function saveDatasetBatch(targetCol, records, fileInfo) {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = records.slice(i, i + CHUNK_SIZE);
        
        chunk.forEach(item => {
            const sanitizedId = sanitizeDocId(item.facilityName);
            const docRef = doc(db, targetCol, sanitizedId);
            batch.set(docRef, { ...item, updatedAt: serverTimestamp() }, { merge: true });
        });
        await batch.commit();
    }

    await setDoc(doc(collection(db, IMPORT_HISTORY_COL)), {
        timestamp: serverTimestamp(),
        fileName: fileInfo.name,
        importType: fileInfo.type,
        totalFacilities: records.length,
        status: "Completed"
    });

    await logAudit("Data Imported", `Imported ${fileInfo.type} file: ${fileInfo.name}`);
}

export function sanitizeDocId(name) {
    return String(name).replace(/\//g, "-").trim();
}