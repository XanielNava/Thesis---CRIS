// ==========================================================================
// CRIS PHO ADMIN - FACILITIES DATABASE SERVICE (facilities-db.js)
// Conformed to CRIS Master Architecture with Cooldown & Patient Preservation
// ==========================================================================

import { auth, db } from '../../firebase/firebase-config.js';
import { 
    collection, 
    getDocs, 
    getDoc,
    doc, 
    updateDoc, 
    addDoc,
    writeBatch, 
    serverTimestamp,
    query,
    where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

// Retention grace period in days before an inactive facility can be permanently purged
export const DELETION_GRACE_PERIOD_DAYS = 30;

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
            deactivatedAt: null,
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
            deactivatedAt: data.deactivatedAt?.toDate ? data.deactivatedAt.toDate() : (data.deactivatedAt ? new Date(data.deactivatedAt) : null),
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

    const newFacilityRef = doc(collection(db, "facilities"));
    const newFacilityId = newFacilityRef.id;

    const lat = Number(rawData.coordinates?.lat ?? rawData.location?.latitude ?? 10.7202);
    const lng = Number(rawData.coordinates?.lng ?? rawData.location?.longitude ?? 122.5621);

    batch.set(newFacilityRef, {
        facilityId: newFacilityId,
        facilityName: rawData.facilityName,
        acronym: rawData.acronym || '',
        code: rawData.code || rawData.acronym || '',
        facilityType: rawData.facilityType || 'ABTC',
        status: "Active",
        deactivatedAt: null,
        address: rawData.address || {},
        coordinates: { lat: lat, lng: lng },
        location: { latitude: lat, longitude: lng },
        contactInfo: rawData.contactInfo || {},
        regulatoryData: rawData.regulatoryData || {},
        commissionedBy: auth.currentUser ? auth.currentUser.uid : "admin",
        createdAt: serverTimestamp()
    });

    if (rawData.applicantUid) {
        const userRef = doc(db, "users", rawData.applicantUid);
        batch.update(userRef, {
            status: "Active",
            facilityId: newFacilityId,
            updatedAt: serverTimestamp()
        });

        const membershipRef = doc(db, "facility_memberships", `${rawData.applicantUid}_${newFacilityId}`);
        batch.set(membershipRef, {
            userId: rawData.applicantUid,
            facilityId: newFacilityId,
            facilityRole: "Facility Head",
            isActive: true,
            assignedDate: serverTimestamp()
        });
    }

    const appRef = doc(db, "facility_applications", appId);
    batch.delete(appRef);

    const counterRef = doc(db, "facility_counters", newFacilityId);
    batch.set(counterRef, { currentSequence: 0 });

    await batch.commit();

    await recordFacilityAudit(
        'Facility Commissioned', 
        `${rawData.facilityName} (${newFacilityId})`, 
        `Application approved and commissioned with coordinates: ${lat}, ${lng}`
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
 * Set status (Active, Inactive, Suspended) with deactivation timestamp tracking
 */
export async function setFacilityStatusInDb(facId, facilityName, currentStatus, nextStatus) {
    if (currentStatus === nextStatus) return;

    const batch = writeBatch(db);
    const facDocRef = doc(db, "facilities", facId);

    const updatePayload = {
        status: nextStatus,
        updatedAt: serverTimestamp()
    };

    // Track when facility entered Inactive/Suspended cooldown
    if (nextStatus === "Inactive" || nextStatus === "Suspended") {
        updatePayload.deactivatedAt = serverTimestamp();
    } else if (nextStatus === "Active") {
        updatePayload.deactivatedAt = null; // Clear cooldown timer if reactivated
    }

    batch.update(facDocRef, updatePayload);

    // Sync Facility Head user account status
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
        `Status updated from ${currentStatus} to ${nextStatus}${nextStatus !== 'Active' ? ' (Retention timer started)' : ''}`
    );

    return nextStatus;
}

/**
 * Permanently purge an inactive facility past its retention window.
 * PRESERVES ALL ROOT PATIENT RECORDS for clinical and epidemiological continuity.
 */
export async function deleteFacilityFromDb(facId, facilityName) {
    const facRef = doc(db, "facilities", facId);
    const facSnap = await getDoc(facRef);

    if (!facSnap.exists()) {
        throw new Error("Facility record does not exist.");
    }

    const facData = facSnap.data();

    // 1. Guard: Cannot delete an active facility directly
    if ((facData.status || "Active").toLowerCase() === "active") {
        throw new Error("Active facilities cannot be deleted. Deactivate the facility first to start the retention cooldown.");
    }

    // 2. Guard: Must satisfy retention grace period
    const deactivatedDate = facData.deactivatedAt?.toDate ? facData.deactivatedAt.toDate() : (facData.deactivatedAt ? new Date(facData.deactivatedAt) : null);
    if (deactivatedDate) {
        const diffMs = Date.now() - deactivatedDate.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < DELETION_GRACE_PERIOD_DAYS) {
            const remaining = DELETION_GRACE_PERIOD_DAYS - diffDays;
            throw new Error(`Grace Period Active: This facility has only been inactive for ${diffDays} day(s). It cannot be permanently purged until the retention period ends (${remaining} day(s) remaining).`);
        }
    }

    const batch = writeBatch(db);

    // 3. Purge subcollections under facilities/{facId}
    async function purgeSubcollection(subColName) {
        const subColRef = collection(db, "facilities", facId, subColName);
        const subSnap = await getDocs(subColRef);
        subSnap.forEach(d => batch.delete(d.ref));
    }

    await purgeSubcollection("staff");
    await purgeSubcollection("vaccine-inventory");
    await purgeSubcollection("vaccine-requisitions");

    // 4. Delete the parent facility document
    batch.delete(facRef);

    // 5. Delete facility counter document
    const counterRef = doc(db, "facility_counters", facId);
    batch.delete(counterRef);

    // 6. Delete application documents
    const appDirectRef = doc(db, "facility_applications", `app_${facId}`);
    batch.delete(appDirectRef);

    const appQuery = query(collection(db, "facility_applications"), where("applicantUid", "==", facId));
    const appSnap = await getDocs(appQuery);
    appSnap.forEach(d => batch.delete(d.ref));

    // 7. Clean up facility memberships & detach users
    const memberQuery = query(collection(db, "facility_memberships"), where("facilityId", "==", facId));
    const memberSnap = await getDocs(memberQuery);
    memberSnap.forEach((mDoc) => {
        const uId = mDoc.data().userId;
        if (uId) {
            batch.update(doc(db, "users", uId), {
                status: "Deactivated",
                facilityId: null,
                archivedFacilityName: facilityName,
                updatedAt: serverTimestamp()
            });
        }
        batch.delete(mDoc.ref);
    });

    // Also detach any direct users mapped to this facility
    const userFacQuery = query(collection(db, "users"), where("facilityId", "==", facId));
    const userFacSnap = await getDocs(userFacQuery);
    userFacSnap.forEach((uDoc) => {
        batch.update(uDoc.ref, {
            status: "Deactivated",
            facilityId: null,
            archivedFacilityName: facilityName,
            updatedAt: serverTimestamp()
        });
    });

    // 8. 🩺 ARCHIVE PATIENTS (DO NOT DELETE)
    // Decouple patient records from active facility while preserving vaccination and bite history
    const patientQuery = query(collection(db, "patients"), where("facilityId", "==", facId));
    const patientSnap = await getDocs(patientQuery);
    patientSnap.forEach((pDoc) => {
        batch.update(pDoc.ref, {
            facilityStatus: "Decommissioned",
            archivedFacilityName: facilityName,
            archivedAt: serverTimestamp()
        });
    });

    await batch.commit();

    await recordFacilityAudit(
        'Facility Purged', 
        `${facilityName} (${facId})`, 
        `Facility purged after passing the ${DELETION_GRACE_PERIOD_DAYS}-day retention period. ${patientSnap.size} patient record(s) were preserved in the provincial registry.`
    );

    return true;
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