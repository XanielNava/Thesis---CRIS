// js/firebase-config.js

// 1. Your Firebase Configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

// 2. Destructure the SDK from the globally loaded window object (attached in your HTML scripts)
const { initializeApp, getFirestore, collection, addDoc, writeBatch, doc, getDocs, query, orderBy } = window.FirebaseSDK;

// 3. Initialize Firebase & Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 4. Export them so other JS files (like settings.js) can import them
export { db, collection, addDoc, writeBatch, doc, getDocs, query, orderBy };