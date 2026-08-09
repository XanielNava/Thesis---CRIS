// firebase-config.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const firebaseConfig = {
    apiKey: "AIzaSyBfqjfJoGz591aI8TJjhIS3T4OEvQxX11Y",
    authDomain: "cris-database-da989.firebaseapp.com",
    projectId: "cris-database-da989",
    storageBucket: "cris-database-da989.firebasestorage.app",
    messagingSenderId: "627885439681",
    appId: "1:627885439681:web:3c657d64c0aad9b4913240"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// 🎛️ SWITCHES
const USE_EMULATOR = true; 
const USE_NGROK = false; 

if (USE_EMULATOR) {
    if (USE_NGROK) {
        // Point to your active ngrok URL (update domain string if ngrok generates a new one)
        connectFirestoreEmulator(db, 'isotope-editor-levitate.ngrok-free.dev', 443, { ssl: true });
        console.log("🌐 Connected to Firestore via ngrok Tunnel");
    } else {
        // Local testing on port 8088
        connectFirestoreEmulator(db, '127.0.0.1', 8088);
        console.log("🧪 Connected to Local Firestore Emulator");
    }

    connectAuthEmulator(auth, 'http://127.0.0.1:9099');
} else {
    console.log("🚀 Connected to Live Firebase Database");
}