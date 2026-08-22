// firebase-config.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { 
    initializeFirestore, 
    memoryLocalCache, 
    connectFirestoreEmulator 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
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

// Forces Firestore to ONLY keep data in RAM memory (No IndexedDB caching)
export const db = initializeFirestore(app, {
    localCache: memoryLocalCache()
});

export const auth = getAuth(app);

// 🎛️ SWITCHES
const USE_EMULATOR = true; // Set to false if not running local emulator
const USE_NGROK = false; 

if (USE_EMULATOR) {
    if (USE_NGROK) {
        connectFirestoreEmulator(db, 'isotope-editor-levitate.ngrok-free.dev', 443, { ssl: true });
        console.log("🌐 Connected to Firestore via ngrok Tunnel");
    } else {
        connectFirestoreEmulator(db, '127.0.0.1', 8088);
        console.log("🧪 Connected to Local Firestore Emulator");
    }

    connectAuthEmulator(auth, 'http://127.0.0.1:9099');
} else {
    console.log("🚀 Connected to Live Firebase Database");
}