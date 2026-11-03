// ==========================================================================
// CRIS PHO MODULE - SIGNUP DB CONTROLLER (pho_signup-db.js)
// Handles Firebase Auth account creation and Firestore document persistence
// ==========================================================================

import { auth, db } from '../../firebase/firebase-config.js';
import { 
    createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { 
    doc, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/**
 * Registers a new PHO personnel in Firebase Auth and saves their profile 
 * to Firestore with a 'Pending' verification status for Administrator review.
 *
 * @param {string} email
 * @param {string} password
 * @param {Object} profile
 * @returns {Promise<Object>} { uid, email }
 */
export async function registerPhoPersonnel(email, password, profile) {
    try {
        // 1. Create Firebase Auth Credential
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Build full name format
        const fullName = `${profile.firstName} ${profile.middleInitial ? profile.middleInitial + '.' : ''} ${profile.lastName} ${profile.suffix || ''}`.trim();

        // 3. Save User Profile in Firestore
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
            uid: user.uid,
            firstName: profile.firstName,
            lastName: profile.lastName,
            middleInitial: profile.middleInitial || '',
            suffix: profile.suffix || '',
            fullName: fullName,
            email: email,
            designation: profile.designation,
            verification: {
                prcLicenseNumber: profile.prcLicenseNumber || '',
                employeeIdNumber: profile.employeeIdNumber || '',
                hasIdUpload: Boolean(profile.idFileName),
                idFileName: profile.idFileName || null,
                isVerified: false,
                verifiedBy: null,
                verifiedAt: null
            },
            contactNumber: profile.contactNumber || '',
            dateOfBirth: profile.dateOfBirth || '',
            address: {
                street: profile.streetAddress || '',
                barangay: profile.barangay || '',
                cityMunicipality: profile.cityMunicipality || '',
                province: profile.province || ''
            },
            module: 'PHO',
            status: 'Pending', // Held for Administrator approval
            createdAt: serverTimestamp()
        });

        return { uid: user.uid, email: user.email };
    } catch (error) {
        // Map common Firebase errors to readable messages
        let friendlyMessage = error.message;

        if (error.code === 'auth/email-already-in-use') {
            friendlyMessage = 'This email address is already registered.';
        } else if (error.code === 'auth/invalid-email') {
            friendlyMessage = 'Invalid email address format.';
        } else if (error.code === 'auth/weak-password') {
            friendlyMessage = 'Password is too weak. Please use at least 6 characters.';
        }

        const customError = new Error(friendlyMessage);
        customError.code = error.code;
        throw customError;
    }
}