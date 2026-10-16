import { auth, db } from '../firebase/firebase-config.js';
import { 
    signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// ✅ Read the user's REAL designation from Firestore
async function getUserDesignation(uid) {
  const userDocRef = doc(db, "pvo-users", uid); // change path to your own, e.g., "pvo_users/{uid}"
  const userDocSnap = await getDoc(userDocRef);

  if (!userDocSnap.exists()) {
    throw new Error("The username, password, or designation is incorrect.");
  }

  const data = userDocSnap.data();
  return data.designation; // this is the designation they chose during signup
}


// Login form handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const loginDesignation = document.getElementById("designation").value; // what they picked now

  try {
    document.getElementById('loginBtn').textContent = 'Logging in...';

    // 1. Sign in
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Get the role they originally set during signup
    const dbDesignation = await getUserDesignation(user.uid);

    // 3. ❌ BLOCK if login designation is wrong
    if (loginDesignation !== dbDesignation) {
      throw new Error("The username, password, or designation is incorrect.");
    }

    // 4. ✅ Store that correct designation (only if it matches)
    localStorage.setItem('userDesignation', loginDesignation);

    // 5. Redirect based on role (you can customize this)
    if (loginDesignation === 'Administrator') {
      window.location.href = 'pvo-dash.html';
    } else {
      // Veterinary Officer, Health Officer, etc.
      window.location.href = 'pvo-dash.html';
    }

  } catch (error) {
    console.error('Login error:', error.code, error.message);
    alert('Login failed: ' + error.message);
  } finally {
    document.getElementById('loginBtn').textContent = 'Login';
  }
});