/* ==========================================================================
   PVO ACCOUNT MANAGEMENT — DATABASE SERVICE (pvo-users-db.js)
   Manages both PVO (`pvo-users`) and Municipal LGU (`lgu-users`) accounts
   ========================================================================== */

import { db } from '../../firebase/firebase-config.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    query,
    orderBy,
    limit,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const PVO_USERS_COLLECTION = 'pvo-users';
const LGU_USERS_COLLECTION = 'lgu-users';
const AUDIT_LOGS_COLLECTION = 'audit_logs';

/**
 * Normalize a Firestore document from either `pvo-users` or `lgu-users`
 */
function normalizeAccountDoc(docSnap, scope, collectionName) {
    const d = docSnap.data();
    const fullName = d.fullName || `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.email || 'Unnamed Personnel';
    const createdDate = d.createdAt?.toDate
        ? d.createdAt.toDate().toISOString().slice(0, 10)
        : (d.registered || 'N/A');

    const municipality = d.municipality || d.address?.municipality || '';
    const district = d.district || d.address?.district || '';
    const addressText = d.address?.fullAddress
        || [d.address?.street, d.address?.barangay, municipality, d.address?.province].filter(Boolean).join(', ')
        || 'Not provided';

    return {
        id: docSnap.id,
        collectionName,
        scope, // 'PVO' or 'LGU'
        name: fullName,
        email: d.email || '',
        role: d.designation || d.role || (scope === 'LGU' ? 'LGU Officer' : 'Veterinary Officer'),
        district: district || 'N/A',
        municipality: municipality || 'N/A',
        contactNumber: d.contactNumber || 'Not provided',
        dateOfBirth: d.dateOfBirth || 'Not provided',
        addressText,
        status: d.status || 'Pending',
        registered: createdDate
    };
}

/**
 * Fetch the currently authenticated PVO admin's profile
 */
export async function fetchCurrentAdminProfile(uid) {
    if (!uid) return null;
    const snap = await getDoc(doc(db, PVO_USERS_COLLECTION, uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Fetch all PVO (`pvo-users`) and LGU (`lgu-users`) accounts in parallel
 */
export async function fetchManagedAccounts() {
    const [pvoSnap, lguSnap] = await Promise.all([
        getDocs(collection(db, PVO_USERS_COLLECTION)),
        getDocs(collection(db, LGU_USERS_COLLECTION))
    ]);

    const pvoAccounts = pvoSnap.docs.map((docSnap) =>
        normalizeAccountDoc(docSnap, 'PVO', PVO_USERS_COLLECTION)
    );
    const lguAccounts = lguSnap.docs.map((docSnap) =>
        normalizeAccountDoc(docSnap, 'LGU', LGU_USERS_COLLECTION)
    );

    return [...pvoAccounts, ...lguAccounts];
}

export const fetchPvoUsers = fetchManagedAccounts;

/**
 * Fetch recent PVO & LGU account management audit logs
 */
export async function fetchRecentPvoAuditLogs(maxCount = 5) {
    const auditRef = collection(db, AUDIT_LOGS_COLLECTION);
    const q = query(auditRef, orderBy('timestamp', 'desc'), limit(25));

    try {
        const snapshot = await getDocs(q);
        return snapshot.docs
            .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
            .filter((d) => !d.module || d.module === 'PVO' || d.module === 'LGU')
            .slice(0, maxCount)
            .map((d) => {
                const stamp = d.timestamp?.toDate
                    ? d.timestamp.toDate().toISOString().slice(0, 16).replace('T', ' ')
                    : (d.timestamp || 'Just now');

                return {
                    id: d.id,
                    action: d.action || 'System Action',
                    affected: d.affected || d.details?.targetUser || 'N/A',
                    performedBy: d.performedBy || d.actorEmail || 'System Administrator',
                    details: d.details?.notes || '',
                    timestamp: stamp
                };
            });
    } catch (err) {
        console.warn('Could not order audit_logs by timestamp (index or empty collection):', err);
        return [];
    }
}

/**
 * Approve a pending PVO or LGU user account in its respective collection
 */
export async function approveManagedAccount(account, adminProfile) {
    const targetCollection = account.collectionName || (account.scope === 'LGU' ? LGU_USERS_COLLECTION : PVO_USERS_COLLECTION);
    const userRef = doc(db, targetCollection, account.id);

    await updateDoc(userRef, {
        status: 'Active',
        rejectionReason: '',
        updatedAt: serverTimestamp()
    });

    const performedBy = adminProfile?.fullName || adminProfile?.email || 'System Administrator (Super Admin)';
    const scopeLabel = account.scope === 'LGU'
        ? `LGU (${account.municipality})`
        : 'PVO';

    await addDoc(collection(db, AUDIT_LOGS_COLLECTION), {
        action: `${account.scope} Account Approved`,
        module: 'PVO',
        accountScope: account.scope,
        affected: `${account.name} — ${scopeLabel}`,
        performedBy,
        actorUid: adminProfile?.id || 'SYSTEM',
        details: {
            targetUser: account.name,
            targetUid: account.id,
            targetCollection,
            municipality: account.municipality || '',
            notes: `Approved ${account.scope} ${account.role} account (Pending -> Active)`
        },
        timestamp: serverTimestamp()
    });
}

/**
 * Reject a pending PVO or LGU user account and store the rejection reason
 */
export async function rejectManagedAccount(account, reason, adminProfile) {
    const targetCollection = account.collectionName || (account.scope === 'LGU' ? LGU_USERS_COLLECTION : PVO_USERS_COLLECTION);
    const userRef = doc(db, targetCollection, account.id);

    await updateDoc(userRef, {
        status: 'Rejected',
        rejectionReason: reason || 'Registration rejected by PVO Administrator.',
        updatedAt: serverTimestamp()
    });

    const performedBy = adminProfile?.fullName || adminProfile?.email || 'System Administrator (Super Admin)';
    const scopeLabel = account.scope === 'LGU'
        ? `LGU (${account.municipality})`
        : 'PVO';

    await addDoc(collection(db, AUDIT_LOGS_COLLECTION), {
        action: `${account.scope} Account Rejected`,
        module: 'PVO',
        accountScope: account.scope,
        affected: `${account.name} — ${scopeLabel}`,
        performedBy,
        actorUid: adminProfile?.id || 'SYSTEM',
        details: {
            targetUser: account.name,
            targetUid: account.id,
            targetCollection,
            reason: reason || 'No reason specified',
            notes: `Rejected ${account.scope} ${account.role} account: ${reason || 'No reason provided'}`
        },
        timestamp: serverTimestamp()
    });
}