// ==========================================================================
// CRIS PHO MODULE - LOGIN DB CONTROLLER (pho_login-db.js)
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

/**
 * Authenticates user credentials and checks their verification status in 'pho-users'.
 *
 * @param {string} email
 * @param {string} password
 * @param {string} selectedDesignation
 * @returns {Promise<Object>} Authorized user data & redirect path
 */
export async function authenticatePhoPersonnel(email, password, selectedDesignation) {
    try {
        // 1. Firebase Authentication Sign-In
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Fetch User Profile from 'pho-users'
        const userDocRef = doc(db, "pho-users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            await signOut(auth);
            throw new Error("User record not found in the PHO personnel registry.");
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
        const userRole = (data.role || data.designation || '').trim();
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
        localStorage.setItem('userFullName', data.fullName || 'PHO Duty Personnel');
        localStorage.setItem('userRole', userRole);
        localStorage.setItem('userDesignation', userRole);
        localStorage.setItem('userStatus', status);

        // 7. Determine standard redirect URL based on role
        let redirectUrl = 'pho-dash.html';
        const normalizedRole = userRole.toLowerCase();

        if (normalizedRole === 'administrator') {
            redirectUrl = '../../pages/pho_admin/admin_dash.html';
        } else if (normalizedRole === 'health officer') {
            redirectUrl = 'pho-dash.html';
        } else if (normalizedRole === 'facilitating nurse') {
            redirectUrl = 'pho-dash.html'; // Or 'pho-clinic.html' depending on your clinic view
        }

        return {
            uid: user.uid,
            email: user.email,
            role: userRole,
            redirectUrl: redirectUrl
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