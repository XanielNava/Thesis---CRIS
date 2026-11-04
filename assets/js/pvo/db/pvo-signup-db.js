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
 * Registers a new officer in Firebase Authentication and stores the master profile document in Firestore.
 */
export async function registerPvoPersonnel(profileData, password) {
    const { email, firstName, lastName, middleInitial, suffix, designation, streetAddress, barangay, city, province, contactNumber, dateOfBirth } = profileData;

    // 1. Authenticate new credentials
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Build profile payload
    const payload = {
        uid: user.uid,
        email: email.toLowerCase().trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        middleInitial: middleInitial ? middleInitial.trim().toUpperCase() : '',
        suffix: suffix ? suffix.trim() : '',
        fullName: [firstName, middleInitial ? `${middleInitial}.` : '', lastName, suffix].filter(Boolean).join(' '),
        designation,
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
        status: 'Active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    // 3. Write directly to master users collection
    await setDoc(doc(db, "users", user.uid), payload);

    return payload;
}