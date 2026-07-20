// js/firebase-config.js

// 1. Your Firebase Configuration
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// 2. Destructure the SDK from the globally loaded window object (attached in your HTML scripts)
const { initializeApp, getFirestore, collection, addDoc, writeBatch, doc, getDocs, query, orderBy } = window.FirebaseSDK;

// 3. Initialize Firebase & Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 4. Export them so other JS files (like settings.js) can import them
export { db, collection, addDoc, writeBatch, doc, getDocs, query, orderBy };