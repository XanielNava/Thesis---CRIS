/* ==========================================================================
   USER MANAGEMENT — DATABASE COMPONENT (user_account-db.js)
   Firestore operations for PHO Personnel & Self-Registration Queue
   ========================================================================== */

import { auth, db } from '../../firebase/firebase-config.js';
import { 
    collection, 
    getDocs, 
    doc, 
    setDoc, 
    updateDoc, 
    addDoc, 
    onSnapshot,
    query,
    orderBy,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    getAuth
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

const PHO_USERS_COLLECTION = "pho-users";

/**
 * Real-time listener for all PHO user records (Active, Inactive, Pending).
 */
export function listenToPhoUsers(callback) {
    const q = query(collection(db, PHO_USERS_COLLECTION), orderBy('createdAt', 'desc'));

    return onSnapshot(q, (snapshot) => {
        const users = [];

        snapshot.forEach((docSnap) => {
            const d = docSnap.data();

            // Strict separation filter: skip any external health facility accounts
            if (d.facilityId || d.accountType === 'facility' || d.facilityRole) {
                return;
            }

            users.push({
                id: docSnap.id,
                uid: d.uid || docSnap.id,
                name: d.fullName || `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Unnamed Personnel',
                email: d.email || 'N/A',
                role: d.role || d.designation || 'Facilitating Nurse',
                status: d.status || 'Pending',
                contactNumber: d.contactNumber || 'N/A',
                address: d.address || {},
                verification: {
                    prcLicenseNumber: d.verification?.prcLicenseNumber || 'N/A',
                    employeeIdNumber: d.verification?.employeeIdNumber || 'N/A',
                    isVerified: d.verification?.isVerified || false,
                    verifiedAt: d.verification?.verifiedAt || null,
                    verifiedBy: d.verification?.verifiedBy || null
                },
                createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString().slice(0, 10) : 'N/A',
                raw: d
            });
        });

        callback(users);
    }, (error) => {
        console.error("Error listening to PHO users:", error);
    });
}

/**
 * Approves a self-registered pending personnel account.
 */
export async function approveUserInDb(id, name, role) {
    const userRef = doc(db, PHO_USERS_COLLECTION, id);
    const adminEmail = auth.currentUser?.email || 'PHO Administrator';

    await updateDoc(userRef, {
        status: 'Active',
        role: role,
        designation: role,
        'verification.isVerified': true,
        'verification.verifiedAt': new Date().toISOString(),
        'verification.verifiedBy': adminEmail,
        updatedAt: serverTimestamp()
    });

    await logAuditToDb('Registration Approved', `${name} (${id})`, `Approved with role: ${role}`);
}

/**
 * Rejects a self-registered pending account.
 */
export async function rejectUserInDb(id, name, reason = 'Registration criteria not met') {
    const userRef = doc(db, PHO_USERS_COLLECTION, id);
    const adminEmail = auth.currentUser?.email || 'PHO Administrator';

    await updateDoc(userRef, {
        status: 'Rejected',
        rejectionReason: reason,
        rejectedAt: serverTimestamp(),
        rejectedBy: adminEmail
    });

    await logAuditToDb('Registration Rejected', `${name} (${id})`, reason);
}

/**
 * Direct account creation by Administrator (Uses Secondary App to prevent kicking admin session).
 */
export async function createUserInDb({ name, email, role, status, medicalLicense, employeeId }) {
    const defaultPassword = "Password123!";
    
    // Initialize temporary secondary app so current admin session remains active
    const secondaryApp = initializeApp(auth.app.options, `SecondaryApp_${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);

    try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, defaultPassword);
        const uid = cred.user.uid;

        await setDoc(doc(db, PHO_USERS_COLLECTION, uid), {
            uid: uid,
            fullName: name,
            email: email,
            role: role,
            designation: role,
            status: status || 'Active',
            verification: {
                prcLicenseNumber: medicalLicense || 'N/A',
                employeeIdNumber: employeeId || 'N/A',
                isVerified: status === 'Active',
                verifiedAt: status === 'Active' ? new Date().toISOString() : null,
                verifiedBy: auth.currentUser?.email || 'PHO Administrator'
            },
            module: 'PHO',
            createdAt: serverTimestamp()
        });

        await logAuditToDb('Account Created', `${name} (${uid})`, `Role: ${role}`);
        return uid;
    } finally {
        await signOut(secondaryAuth).catch(() => {});
    }
}

/**
 * Update an existing active user's details
 */
export async function updateUserInDb(id, { name, role, status, medicalLicense, employeeId }) {
    const userRef = doc(db, PHO_USERS_COLLECTION, id);
    await updateDoc(userRef, {
        fullName: name,
        role: role,
        designation: role,
        status: status,
        'verification.prcLicenseNumber': medicalLicense || 'N/A',
        'verification.employeeIdNumber': employeeId || 'N/A',
        updatedAt: serverTimestamp()
    });

    await logAuditToDb('Account Updated', `${name} (${id})`, `Updated info & credentials`);
}

/**
 * Update user status (Active / Inactive)
 */
export async function setUserStatusInDb(id, name, nextStatus) {
    const userRef = doc(db, PHO_USERS_COLLECTION, id);
    await updateDoc(userRef, {
        status: nextStatus,
        updatedAt: serverTimestamp()
    });

    await logAuditToDb(
        nextStatus === 'Active' ? 'Account Activated' : 'Account Deactivated',
        `${name} (${id})`,
        `Status set to ${nextStatus}`
    );
}

/**
 * Update user role
 */
export async function setUserRoleInDb(id, name, prevRole, nextRole) {
    const userRef = doc(db, PHO_USERS_COLLECTION, id);
    await updateDoc(userRef, {
        role: nextRole,
        designation: nextRole,
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
            performedBy: auth.currentUser?.email || 'PHO Administrator',
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.warn("Audit logging skipped:", e);
    }
}

export function listenToAuth(callback) {
    return onAuthStateChanged(auth, callback);
}

export function performLogout() {
    return signOut(auth);
}