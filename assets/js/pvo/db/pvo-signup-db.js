/* ==========================================================================
   PVO SIGNUP — DATABASE SERVICE (pvo-signup-db.js)
   ========================================================================== */

import { auth, db } from '../../firebase/firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
    collection,
    doc,
    setDoc,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Change to 'pvo-users' ONLY if you want a separate collection instead of the master 'users' collection
const USERS_COLLECTION = 'pvo-users';

/**
 * Registers a new PVO officer in Firebase Authentication, stores the profile
 * in Firestore, logs to audit_logs, and signs out pending admin approval.
 */
export async function registerPvoPersonnel(profileData, password) {
    const {
        email,
        firstName,
        lastName,
        middleInitial,
        suffix,
        designation,
        streetAddress,
        barangay,
        city,
        province,
        contactNumber,
        dateOfBirth
    } = profileData;

    // 1. Create Firebase Auth user
    const cleanEmail = email.toLowerCase().trim();
    const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const user = userCredential.user;

    // 2. Format clean fullName (avoiding double periods on middle initial)
    const cleanMI = middleInitial ? middleInitial.trim().replace(/\.$/, '').toUpperCase() : '';
    const cleanSuffix = suffix ? suffix.trim() : '';
    const fullName = [
        firstName.trim(),
        cleanMI ? `${cleanMI}.` : '',
        lastName.trim(),
        cleanSuffix
    ].filter(Boolean).join(' ');

    // 3. Build standardized user document payload
    const payload = {
        uid: user.uid,
        email: cleanEmail,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        middleInitial: cleanMI,
        suffix: cleanSuffix,
        fullName,
        designation: designation || 'Veterinary Officer',
        accountType: 'pvo',
        organizationId: 'PVO',
        address: {
            street: streetAddress || '',
            barangay: barangay || '',
            municipality: city || '',
            province: province || 'Iloilo'
        },
        contactNumber: contactNumber || '',
        dateOfBirth: dateOfBirth || '',
        status: 'Pending', // Shows up in pvo-users.html Pending Approvals list
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    // 4. Write to Firestore users collection
    await setDoc(doc(db, USERS_COLLECTION, user.uid), payload);

    // 5. Record registration in audit_logs
    try {
        await addDoc(collection(db, 'audit_logs'), {
            action: 'Account Registered',
            module: 'PVO',
            affected: `${fullName} (${user.uid})`,
            performedBy: fullName,
            actorUid: user.uid,
            actorEmail: cleanEmail,
            details: {
                targetUser: fullName,
                targetUid: user.uid,
                notes: `Registered as ${payload.designation} (Pending Approval)`
            },
            timestamp: serverTimestamp()
        });
    } catch (auditErr) {
        console.warn('Audit log write skipped:', auditErr);
    }

    // 6. Sign out immediately so user must log in after approval
    await signOut(auth);

    return payload;
}