// ==========================================================================
// CRIS PHO ADMIN - FACILITIES DATABASE SERVICE (facilities-db.js)
// ==========================================================================

import { auth, db } from '../../firebase/firebase-config.js';
import { 
    collection, 
    getDocs, 
    doc, 
    updateDoc, 
    addDoc,
    writeBatch, 
    serverTimestamp,
    query,
    where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

/**
 * Fetch all pending facility applications and active/inactive facilities
 */
export async function fetchAllFacilitiesFromDb() {
    const records = [];

    // 1. Pending applications only
    const pendingQuery = query(
        collection(db, "facility_applications"), 
        where("reviewStatus", "==", "Pending")
    );
    const appSnapshot = await getDocs(pendingQuery);
    
    appSnapshot.forEach(docSnap => {
        const data = docSnap.data();
        records.push({
            id: docSnap.id,
            isApplication: true,
            facilityName: data.facilityName || 'Unnamed Facility',
            acronym: data.acronym || '',
            facilityType: data.facilityType || 'ABTC',
            municipality: data.address?.city || data.address?.municipality || 'N/A',
            province: data.address?.province || '',
            contactPerson: data.contactInfo?.contactPerson || 'N/A',
            position: data.contactInfo?.position || '',
            phone: data.contactInfo?.phone || 'N/A',
            email: data.contactInfo?.email || 'N/A',
            status: data.reviewStatus || 'Pending',
            submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate() : new Date(),
            raw: data
        });
    });

    // 2. Commissioned facilities
    const facSnapshot = await getDocs(collection(db, "facilities"));
    facSnapshot.forEach(docSnap => {
        const data = docSnap.data();
        records.push({
            id: docSnap.id,
            isApplication: false,
            facilityName: data.facilityName || 'Unnamed Facility',
            acronym: data.acronym || '',
            facilityType: data.facilityType || 'ABTC',
            municipality: data.address?.city || data.address?.municipality || 'N/A',
            province: data.address?.province || '',
            contactPerson: data.contactInfo?.contactPerson || 'N/A',
            position: data.contactInfo?.position || '',
            phone: data.contactInfo?.phone || 'N/A',
            email: data.contactInfo?.email || 'N/A',
            status: data.status || 'Active',
            submittedAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
            raw: data
        });
    });

    return records;
}

/**
 * Atomic batch: Commission a facility, activate the applicant, link membership, and delete application
 */
export async function commissionFacilityInDb(appId, rawData) {
    const batch = writeBatch(db);

    // 1. Create document in 'facilities'
    const newFacilityRef = doc(collection(db, "facilities"));
    const newFacilityId = newFacilityRef.id;

    batch.set(newFacilityRef, {
        facilityId: newFacilityId,
        facilityName: rawData.facilityName,
        acronym: rawData.acronym || '',
        facilityType: rawData.facilityType || 'ABTC',
        status: "Active",
        address: rawData.address || {},
        contactInfo: rawData.contactInfo || {},
        regulatoryData: rawData.regulatoryData || {},
        commissionedBy: auth.currentUser ? auth.currentUser.uid : "admin",
        createdAt: serverTimestamp()
    });

    // 2. Activate user profile in 'users'
    if (rawData.applicantUid) {
        const userRef = doc(db, "users", rawData.applicantUid);
        batch.update(userRef, {
            status: "Active",
            facilityId: newFacilityId,
            updatedAt: serverTimestamp()
        });

        // 3. Link initial membership in 'facility_memberships'
        const membershipRef = doc(db, "facility_memberships", `${rawData.applicantUid}_${newFacilityId}`);
        batch.set(membershipRef, {
            userId: rawData.applicantUid,
            facilityId: newFacilityId,
            facilityRole: "Facility Head",
            isActive: true,
            assignedDate: serverTimestamp()
        });
    }

    // 4. Delete document from 'facility_applications'
    const appRef = doc(db, "facility_applications", appId);
    batch.delete(appRef);

    // 5. Initialize sequence counters for bite records
    const counterRef = doc(db, "facility_counters", newFacilityId);
    batch.set(counterRef, {
        currentSequence: 0
    });

    await batch.commit();

    await recordFacilityAudit(
        'Facility Commissioned', 
        `${rawData.facilityName} (${newFacilityId})`, 
        'Application approved and commissioned into the network'
    );

    return newFacilityId;
}

/**
 * Reject a facility application
 */
export async function rejectApplicationInDb(appId, facilityName, reason) {
    const appRef = doc(db, "facility_applications", appId);
    await updateDoc(appRef, {
        reviewStatus: "Rejected",
        rejectionReason: reason,
        reviewedBy: auth.currentUser ? auth.currentUser.uid : "admin",
        reviewedAt: serverTimestamp()
    });

    await recordFacilityAudit(
        'Facility Rejected', 
        `${facilityName} (${appId})`, 
        `Reason: ${reason}`
    );
}

/**
 * Set an explicit status (Active, Inactive, Suspended) and sync Facility Head
 */
export async function setFacilityStatusInDb(facId, facilityName, currentStatus, nextStatus) {
    if (currentStatus === nextStatus) return;

    const batch = writeBatch(db);

    // 1. Update facility document
    const facDocRef = doc(db, "facilities", facId);
    batch.update(facDocRef, {
        status: nextStatus,
        updatedAt: serverTimestamp()
    });

    // 2. Synchronize Facility Head user account status
    const userTargetStatus = nextStatus === "Active" ? "Active" : "Inactive";

    const memberQuery = query(
        collection(db, "facility_memberships"),
        where("facilityId", "==", facId),
        where("facilityRole", "==", "Facility Head")
    );
    const memberSnap = await getDocs(memberQuery);
    memberSnap.forEach((mDoc) => {
        const uId = mDoc.data().userId;
        if (uId) {
            const userRef = doc(db, "users", uId);
            batch.update(userRef, {
                status: userTargetStatus,
                updatedAt: serverTimestamp()
            });
        }
    });

    await batch.commit();

    await recordFacilityAudit(
        'Facility Status Modified', 
        `${facilityName} (${facId})`, 
        `Status updated from ${currentStatus} to ${nextStatus}`
    );

    return nextStatus;
}

/**
 * Write to audit_logs
 */
export async function recordFacilityAudit(action, affected, details) {
    try {
        await addDoc(collection(db, "audit_logs"), {
            action,
            affected,
            details,
            performedBy: auth.currentUser?.email || 'PHO Admin',
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.warn("Audit log error:", e);
    }
}

export function logoutAdmin() {
    return signOut(auth);
}