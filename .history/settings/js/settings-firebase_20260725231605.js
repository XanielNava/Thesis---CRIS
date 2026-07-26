// =========================================================================
// CRIS PLATFORM - FIREBASE & FIRESTORE INITIALIZATION
// =========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    writeBatch, 
    doc, 
    getDocs, 
    query, 
    where,
    orderBy, 
    onSnapshot,
    setDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const db = getFirestore(app);

export { 
    db, collection, addDoc, writeBatch, doc, 
    getDocs, query, where, orderBy, onSnapshot, setDoc, deleteDoc 
};