// ==========================================================================
// CRIS PHO ADMIN - SETTINGS DATABASE SERVICE (settings-db.js)
// ==========================================================================

import { auth, db } from '../../firebase/firebase-config.js';
import { 
    doc, 
    getDoc, 
    setDoc, 
    addDoc, 
    collection, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

/**
 * Fetch global system settings from Firestore
 */
export async function fetchSystemSettingsFromDb() {
    try {
        const docRef = doc(db, "system_settings", "general");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data();
        }
        return null; // Triggers fallback to default constants
    } catch (err) {
        console.warn("Could not load cloud settings, using local fallback:", err);
        return null;
    }
}

/**
 * Save settings to Firestore and write an audit log
 */
export async function saveSystemSettingsToDb(settingsData) {
    // 1. Persist to Firestore
    const docRef = doc(db, "system_settings", "general");
    await setDoc(docRef, {
        ...settingsData,
        updatedBy: auth.currentUser?.email || 'PHO Admin',
        updatedAt: serverTimestamp()
    }, { merge: true });

    // 2. Record to audit_logs
    try {
        await addDoc(collection(db, "audit_logs"), {
            action: "Settings Updated",
            affected: "System Configuration",
            details: "Administrative settings and reference lists updated",
            performedBy: auth.currentUser?.email || 'PHO Admin',
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.warn("Failed to write settings audit log:", e);
    }
}

export function logoutAdmin() {
    return signOut(auth);
}