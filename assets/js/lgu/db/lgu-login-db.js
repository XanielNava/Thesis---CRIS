/* ==========================================================================
   CRIS LGU MODULE — LOGIN DATABASE SERVICE (lgu-login-db.js)
   ========================================================================== */

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

const LGU_USERS_COLLECTION = 'lgu-users';

/**
 * Authenticates LGU personnel and validates their status, district, municipality, and designation.
 */
export async function authenticateLguPersonnel({
    email,
    password,
    selectedDistrict,
    selectedMunicipality,
    selectedDesignation
}) {
    try {
        // 1. Firebase Auth Sign-In
        const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
        const user = userCredential.user;

        // 2. Fetch User Profile from `lgu-users`
        const userDocRef = doc(db, LGU_USERS_COLLECTION, user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            await signOut(auth);
            throw new Error("User record not found in the LGU personnel registry.");
        }

        const data = userDocSnap.data();

        // 3. Status Guard: Require PVO Admin approval
        const status = data.status || 'Pending';
        if (status === 'Pending') {
            await signOut(auth);
            throw new Error("Your LGU account registration is currently pending PVO Administrator approval.");
        }

        if (status === 'Inactive' || status === 'Rejected') {
            await signOut(auth);
            const reason = data.rejectionReason ? ` Reason: ${data.rejectionReason}` : '';
            throw new Error(`Your LGU account has been deactivated or rejected by the Provincial Veterinary Office.${reason}`);
        }

        // 4. Jurisdiction Guard: District & Municipality check
        const userDistrict = (data.district || data.address?.district || '').trim();
        const userMunicipality = (data.municipality || data.address?.municipality || '').trim();

        if (selectedDistrict && userDistrict && userDistrict.toLowerCase() !== selectedDistrict.trim().toLowerCase()) {
            await signOut(auth);
            throw new Error(`District mismatch: Your account is registered under ${userDistrict}.`);
        }

        if (selectedMunicipality && userMunicipality && userMunicipality.toLowerCase() !== selectedMunicipality.trim().toLowerCase()) {
            await signOut(auth);
            throw new Error(`Municipality mismatch: Your account is registered under the LGU of ${userMunicipality}.`);
        }

        // 5. Designation Guard
        const userRole = (data.designation || '').trim();
        if (selectedDesignation && userRole.toLowerCase() !== selectedDesignation.trim().toLowerCase()) {
            await signOut(auth);
            throw new Error(`Designation mismatch: You are authorized as "${userRole}". Please select the correct designation.`);
        }

        // 6. Update last login timestamp
        await updateDoc(userDocRef, {
            lastLoginAt: serverTimestamp()
        }).catch(() => {});

        // 7. Cache LGU session in localStorage
        localStorage.setItem('userUid', user.uid);
        localStorage.setItem('userEmail', user.email);
        localStorage.setItem('userFullName', data.fullName || 'LGU Duty Personnel');
        localStorage.setItem('userRole', userRole);
        localStorage.setItem('userDesignation', userRole);
        localStorage.setItem('userDistrict', userDistrict);
        localStorage.setItem('userMunicipality', userMunicipality);
        localStorage.setItem('userStatus', status);
        localStorage.setItem('accountType', 'lgu');

        // 8. Redirect to LGU Dashboard
        return {
            uid: user.uid,
            email: user.email,
            role: userRole,
            district: userDistrict,
            municipality: userMunicipality,
            redirectUrl: 'lgu-animal-registry.html' // Default LGU dashboard
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
            friendlyMessage = "Access temporarily blocked due to repeated failed login attempts. Please try again later.";
        }

        const customError = new Error(friendlyMessage);
        customError.code = error.code;
        throw customError;
    }
}