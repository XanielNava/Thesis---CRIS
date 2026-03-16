import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBfqjfJoGz591aI8TJjhIS3T4OEvQxX11Y",
  authDomain: "cris-database-da989.firebaseapp.com",
  databaseURL: "https://cris-database-da989-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "cris-database-da989",
  storageBucket: "cris-database-da989.firebasestorage.app",
  messagingSenderId: "627885439681",
  appId: "1:627885439681:web:3c657d64c0aad9b4913240",
  measurementId: "G-0X99BH7GW4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.getElementById("regButton").addEventListener("click", getAllInputs);

async function getAllInputs() {
    const lastName = document.getElementById("lastName").value;
    const firstName = document.getElementById("firstName").value;
    const middleInitial = document.getElementById("middleInitial").value;
    const suffix = document.getElementById("suffix").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const address = document.getElementById("address").value;
    const contactNumber = document.getElementById("contactNumber").value;
    const dateOfBirth = document.getElementById("dateOfBirth").value;
    const designation = document.getElementById("designation").value;
    
    // Validation
    if (password !== confirmPassword) {
        alert("Passwords do not match. Please try again.");
        return;
    }
    if (password.length < 8) {
        alert("Password must be at least 8 characters long.");
        return;
    }
    if (!lastName || !firstName || !email || !password || !address || !contactNumber || !dateOfBirth || !designation) {
        alert("Please fill in all required fields.");
        return;
    }

    try {
        // Show loading
        document.getElementById("regButton").textContent = "Creating Account...";
        
        // 1. CREATE USER IN FIREBASE AUTH
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log("User created in Auth:", user.uid);

        // 2. SAVE PROFILE TO FIRESTORE (using user UID)
        const userData = {
            uid: user.uid,
            email: email,
            lastName, firstName, middleInitial, suffix, 
            address, contactNumber, dateOfBirth, designation,
            registrationDate: new Date().toISOString(),
            // NEVER store password in Firestore
        };

        // Save to Firestore 'users' collection
        await setDoc(doc(db, "users", user.uid), userData);
        console.log("User profile saved to Firestore");

        alert("Registration successful! Redirecting to login...");
        window.location.href = "CRIS PVO Login.html";

    } catch (error) {
        console.error("Registration error:", error.code, error.message);
        
        if (error.code === 'auth/email-already-in-use') {
            alert("Email already registered. Please use a different email or login.");
        } else if (error.code === 'auth/weak-password') {
            alert("Password is too weak. Use at least 8 characters.");
        } else {
            alert("Registration failed: " + error.message);
        }
    } finally {
        document.getElementById("regButton").textContent = "Register";
    }
}
