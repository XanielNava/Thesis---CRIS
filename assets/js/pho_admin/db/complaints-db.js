// ==========================================================================
// CRIS PHO ADMIN - COMPLAINTS DATABASE SERVICE (complaints-db.js)
// Live Firestore operations for user support tickets & complaints
// ==========================================================================

import { auth, db } from '../../firebase/firebase-config.js';
import { 
    collection, 
    getDocs, 
    doc, 
    updateDoc, 
    addDoc, 
    serverTimestamp, 
    query, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

/**
 * Fetch all complaints ordered by submission timestamp descending
 */
export async function fetchComplaintsFromDb() {
    const records = [];

    const complaintsQuery = query(
        collection(db, "complaints"),
        orderBy("submittedAt", "desc")
    );

    let snapshot;
    try {
        snapshot = await getDocs(complaintsQuery);
    } catch (e) {
        // Fallback without orderBy in case submittedAt isn't indexed or documents use createdAt
        snapshot = await getDocs(collection(db, "complaints"));
    }

    snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        // Safe timestamp parsing across Firestore Timestamps, Dates, and strings
        const rawDate = data.submittedAt || data.createdAt;
        let formattedDate = 'Recently';
        if (rawDate?.toDate) {
            formattedDate = rawDate.toDate().toLocaleDateString('en-PH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } else if (rawDate instanceof Date) {
            formattedDate = rawDate.toLocaleDateString('en-PH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } else if (typeof rawDate === 'string') {
            const parsed = new Date(rawDate);
            if (!isNaN(parsed)) {
                formattedDate = parsed.toLocaleDateString('en-PH', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            }
        }

        records.push({
            id: docSnap.id,
            user: data.userName || data.reportedBy || data.user || 'Anonymous User',
            userEmail: data.userEmail || data.contactEmail || '',
            module: data.module || data.category || 'General',
            description: data.description || data.message || 'No description provided.',
            status: data.status || 'Open',
            submitted: formattedDate,
            raw: data
        });
    });

    return records;
}

/**
 * Update complaint status and write an audit trail record
 */
export async function updateComplaintStatusInDb(complaintId, moduleName, nextStatus) {
    const docRef = doc(db, "complaints", complaintId);
    await updateDoc(docRef, {
        status: nextStatus,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email || 'PHO Admin'
    });

    // Write directly to audit_logs
    try {
        await addDoc(collection(db, "audit_logs"), {
            action: "Complaint Status Updated",
            affected: `${complaintId} (${moduleName})`,
            details: `Status set to ${nextStatus}`,
            performedBy: auth.currentUser?.email || 'PHO Admin',
            timestamp: serverTimestamp()
        });
    } catch (err) {
        console.warn("Could not log complaint audit:", err);
    }
}

export function logoutAdmin() {
    return signOut(auth);
}