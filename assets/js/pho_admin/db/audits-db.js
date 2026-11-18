// ==========================================================================
// CRIS PHO ADMIN - AUDIT LOGS DATABASE SERVICE (audits-db.js)
// Live Firestore queries & logging for administrative audit trail records
// ==========================================================================

import { auth, db } from '../../firebase/firebase-config.js';
import { 
    collection, 
    getDocs, 
    addDoc,
    query, 
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

// Routine clinic actions that must NOT appear in the PHO provincial audit log
const EXCLUDED_CLINIC_ACTIONS = [
    "duty badge clock-in",
    "autonomous duty badge sign-in",
    "enrolled staff",
    "enrolled new staff",
    "updated staff status",
    "removed staff member"
];

/**
 * Fetch high-level provincial audit log records ordered from most recent to oldest
 */
export async function fetchAuditLogsFromDb() {
    const records = [];

    // Order by timestamp descending so recent administrative actions appear first
    const auditsQuery = query(
        collection(db, "audit_logs"),
        orderBy("timestamp", "desc")
    );

    const snapshot = await getDocs(auditsQuery);

    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const actionText = (data.action || '').trim();
        const actionLower = actionText.toLowerCase();

        // 1. Guard against routine clinic staff noise
        const isClinicAction = EXCLUDED_CLINIC_ACTIONS.some(excluded => actionLower.includes(excluded));
        if (isClinicAction) {
            return; // Skip routine clinic activity
        }

        // 2. Safe timestamp parsing across Firestore Timestamps, Dates, and ISO strings
        let formattedDate = 'Recently';
        if (data.timestamp?.toDate) {
            formattedDate = data.timestamp.toDate().toLocaleDateString('en-PH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } else if (data.timestamp instanceof Date) {
            formattedDate = data.timestamp.toLocaleDateString('en-PH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } else if (typeof data.timestamp === 'string') {
            const parsed = new Date(data.timestamp);
            if (!isNaN(parsed)) {
                formattedDate = parsed.toLocaleDateString('en-PH', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        }

        // 3. Resolve Affected Entity name cleanly
        const affectedDisplay = data.affected 
            || (data.facilityName ? `${data.facilityName}${data.facilityId ? ` (${data.facilityId})` : ''}` : 'PHO System');

        // 4. Resolve Performed By
        const performedByDisplay = data.performedBy 
            || data.adminEmail 
            || (auth.currentUser ? auth.currentUser.email : 'PHO Administrator');

        // 5. Resolve Details summary
        const detailsDisplay = data.details 
            || data.notes 
            || (data.action ? `Action executed: ${data.action}` : 'Administrative operation verified.');

        records.push({
            id: docSnap.id,
            timestamp: formattedDate,
            action: actionText || 'Governance Action',
            affected: affectedDisplay,
            performedBy: performedByDisplay,
            details: detailsDisplay
        });
    });

    return records;
}

/**
 * Standardized logging helper for PHO Admin governance actions
 */
export async function logPhoGovernanceAction(action, affected, details) {
    try {
        const adminEmail = auth.currentUser?.email || sessionStorage.getItem("phoAdminEmail") || "admin@pho.gov.ph";

        await addDoc(collection(db, "audit_logs"), {
            action: action,
            affected: affected || "PHO System",
            performedBy: adminEmail,
            details: details || "No details provided",
            timestamp: serverTimestamp()
        });
    } catch (error) {
        console.error("Failed to write PHO audit log:", error);
    }
}

export function logoutAdmin() {
    return signOut(auth);
}