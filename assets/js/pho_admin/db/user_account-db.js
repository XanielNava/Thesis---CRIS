/* ==========================================================================
   USER MANAGEMENT — DATABASE COMPONENT (user-db.js)
   Firestore operations matching user_accounts.html
   ========================================================================== */

import { auth, db } from '../../firebase/firebase-config.js';
import { 
    collection, 
    getDocs, 
    doc, 
    setDoc, 
    updateDoc, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

/**
 * Fetch all users from Firestore
 */
/**
 * Fetch users from Firestore — STRICTLY PHO INTERNAL PERSONNEL ONLY
 * Excludes any user associated with a health facility (facilityId).
 */
export async function fetchUsersFromDb() {
    const snapshot = await getDocs(collection(db, "users"));
    const list = [];

    snapshot.forEach((docSnap) => {
        const d = docSnap.data();

        // 🛡️ SEPARATION FILTER:
        // If the user document has a facilityId, they are a Facility Admin/Staff, NOT a PHO user!
        if (d.facilityId) {
            return; // Skip facility accounts like Xaniel
        }

        // Also exclude if their role or accountType explicitly marks them as facility staff
        if (d.accountType === 'facility' || d.facilityRole) {
            return;
        }

        list.push({
            id: docSnap.id,
            name: d.fullName || d.name || 'Unnamed User',
            email: d.email || '',
            role: d.role || d.globalRole || 'Viewer',
            status: d.status || 'Active',
            lastLogin: d.lastLoginAt?.toDate 
                ? d.lastLoginAt.toDate().toISOString().slice(0, 16).replace('T', ' ')
                : (d.createdAt?.toDate 
                    ? d.createdAt.toDate().toISOString().slice(0, 16).replace('T', ' ')
                    : 'Never'),
            raw: d
        });
    });

    return list;
}

/**
 * Create a new user account in Auth & Firestore
 */
export async function createUserInDb({ name, email, role, status }) {
    // Default initial password for newly created accounts (can be changed on first login)
    const defaultPassword = "Password123!";
    const cred = await createUserWithEmailAndPassword(auth, email, defaultPassword);
    const uid = cred.user.uid;

    await setDoc(doc(db, "users", uid), {
        uid: uid,
        fullName: name,
        email: email,
        role: role,
        status: status,
        createdAt: serverTimestamp()
    });

    await logAuditToDb('Account Created', `${name} (${uid})`, `Role assigned: ${role}`);
    return uid;
}

/**
 * Update an existing user's details
 */
export async function updateUserInDb(id, { name, role, status }) {
    const userRef = doc(db, "users", id);
    await updateDoc(userRef, {
        fullName: name,
        role: role,
        status: status,
        updatedAt: serverTimestamp()
    });

    await logAuditToDb('Account Updated', `${name} (${id})`, `Information updated`);
}

/**
 * Update user status (Active / Inactive)
 */
export async function setUserStatusInDb(id, name, nextStatus) {
    const userRef = doc(db, "users", id);
    await updateDoc(userRef, {
        status: nextStatus,
        updatedAt: serverTimestamp()
    });

    await logAuditToDb(
        nextStatus === 'Active' ? 'Account Activated' : 'Account Deactivated',
        `${name} (${id})`,
        `Account ${nextStatus.toLowerCase()}`
    );
}

/**
 * Update user role
 */
export async function setUserRoleInDb(id, name, prevRole, nextRole) {
    const userRef = doc(db, "users", id);
    await updateDoc(userRef, {
        role: nextRole,
        updatedAt: serverTimestamp()
    });

    await logAuditToDb('Role Changed', `${name} (${id})`, `${prevRole} → ${nextRole}`);
}

/**
 * Audit log logger
 */
export async function logAuditToDb(action, affected, details) {
    try {
        await addDoc(collection(db, "audit_logs"), {
            action,
            affected,
            details,
            performedBy: auth.currentUser?.email || 'Super Admin',
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.warn("Audit logging skipped:", e);
    }
}

/**
 * Authentication listener & logout helpers
 */
export function listenToAuth(callback) {
    return onAuthStateChanged(auth, callback);
}

export function performLogout() {
    return signOut(auth);
}