// firebase-config.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { 
    initializeFirestore, 
    memoryLocalCache, 
    connectFirestoreEmulator,
    setLogLevel 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

// Silence verbose internal connection warnings
setLogLevel('silent');

const firebaseConfig = {
    apiKey: "AIzaSyBfqjfJoGz591aI8TJjhIS3T4OEvQxX11Y",
    authDomain: "cris-database-da989.firebaseapp.com",
    projectId: "cris-database-da989",
    storageBucket: "cris-database-da989.firebasestorage.app",
    messagingSenderId: "627885439681",
    appId: "1:627885439681:web:3c657d64c0aad9b4913240"
};

const app = initializeApp(firebaseConfig);

// In-Memory cache only (prevents ghost cache from reappearing)
export const db = initializeFirestore(app, {
    localCache: memoryLocalCache()
});

export const auth = getAuth(app);

// 🎛️ CONNECT DIRECTLY TO ACTIVE EMULATOR PORTS
try {
    connectFirestoreEmulator(db, '127.0.0.1', 8088);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    console.log("🧪 Connected to Local Firebase Emulator (Firestore: 8088, Auth: 9099)");
} catch (err) {
    // Prevent duplicate attachment on fast refresh
}