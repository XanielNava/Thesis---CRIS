// ==========================================================================
// CRIS PHO ADMIN - AUDIT LOGS DATABASE SERVICE (audits-db.js)
// Live Firestore queries for administrative audit trail records
// ==========================================================================

import { auth, db } from '../../firebase/firebase-config.js';
import { 
    collection, 
    getDocs, 
    query, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

/**
 * Fetch all audit log records ordered from most recent to oldest
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

        // Safe timestamp parsing across Firestore Timestamps, Dates, and ISO strings
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

        records.push({
            id: docSnap.id,
            timestamp: formattedDate,
            action: data.action || 'System Action',
            affected: data.affected || 'N/A',
            performedBy: data.performedBy || 'System',
            details: data.details || 'No details provided'
        });
    });

    return records;
}

export function logoutAdmin() {
    return signOut(auth);
}