import { initializeApp }
from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import { getAuth }
from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import { getFirestore }
from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "cris-database-da989.firebaseapp.com",
  projectId: "cris-database-da989",
  storageBucket: "cris-database-da989.firebasestorage.app",
  messagingSenderId: "627885439681",
  appId: "1:627885439681:web:3c657d64c0aad9b4913240"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);