import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, collection, addDoc }from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

