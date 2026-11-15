// ==========================================================================
// CRIS PVO MODULE - LOGIN DB CONTROLLER (pvo-login-db.js)
// Handles authentication, personnel status checks, and session caching
// ==========================================================================

import { auth, db } from '../../firebase/firebase-config.js';
import { 
    signInWithEmailAndPassword,
    signOut 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { 
    doc, 
    getDoc,
    updateDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const PVO_USERS_COLLECTION = 'pvo-users';

/**
 * Authenticates user credentials and checks their verification status in 'pvo-users'.
 *
 * @param {string} email
 * @param {string} password
 * @param {string} selectedDesignation
 * @returns {Promise<Object>} Authorized user data & redirect path
 */
export async function authenticatePvoPersonnel(email, password, selectedDesignation) {
    try {
        // 1. Firebase Authentication Sign-In
        const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
        const user = userCredential.user;

        // 2. Fetch User Profile from 'pvo-users'
        const userDocRef = doc(db, PVO_USERS_COLLECTION, user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            await signOut(auth);
            throw new Error("User record not found in the PVO personnel registry.");
        }

        const data = userDocSnap.data();

        // 3. Status Guard: Block non-approved accounts
        const status = data.status || 'Pending';
        if (status === 'Pending') {
            await signOut(auth);
            throw new Error("Your account registration is currently pending administrator verification.");
        }

        if (status === 'Inactive' || status === 'Rejected') {
            await signOut(auth);
            const reason = data.rejectionReason ? ` Reason: ${data.rejectionReason}` : '';
            throw new Error(`Your account has been deactivated or rejected by the Provincial Administrator.${reason}`);
        }

        // 4. Role Guard: Ensure designation matches record
        const userRole = (data.designation || '').trim();
        if (selectedDesignation && userRole.toLowerCase() !== selectedDesignation.trim().toLowerCase()) {
            await signOut(auth);
            throw new Error(`Designation mismatch: You are authorized as "${userRole}". Please select the correct designation role.`);
        }

        // 5. Update last login timestamp in Firestore
        await updateDoc(userDocRef, {
            lastLoginAt: serverTimestamp()
        }).catch(() => {}); // Non-blocking

        // 6. Cache user session in localStorage
        localStorage.setItem('userUid', user.uid);
        localStorage.setItem('userEmail', user.email);
        localStorage.setItem('userFullName', data.fullName || 'PVO Duty Personnel');
        localStorage.setItem('userRole', userRole);
        localStorage.setItem('userDesignation', userRole);
        localStorage.setItem('userStatus', status);

        // 7. Determine standard redirect URL based on PVO role
        const normalizedRole = userRole.toLowerCase();
        let redirectUrl = 'pvo-dash.html';

        if (normalizedRole === 'administrator' || normalizedRole === 'super admin') {
            redirectUrl = 'pvo-dash.html'; // Change to 'pvo-users.html' if Admins should land on User Approvals first
        } else if (normalizedRole === 'veterinary officer' || normalizedRole === 'provincial veterinarian') {
            redirectUrl = 'pvo-dash.html';
        }

        return {
            uid: user.uid,
            email: user.email,
            role: userRole,
            redirectUrl
        };

    } catch (error) {
        let friendlyMessage = error.message;

        if (
            error.code === 'auth/user-not-found' || 
            error.code === 'auth/wrong-password' || 
            error.code === 'auth/invalid-credential'
        ) {
            friendlyMessage = "Invalid official email address or password.";
        } else if (error.code === 'auth/too-many-requests') {
            friendlyMessage = "Access temporarily blocked due to repeated failed login attempts. Please reset your password or try again later.";
        }

        const customError = new Error(friendlyMessage);
        customError.code = error.code;
        throw customError;
    }
}