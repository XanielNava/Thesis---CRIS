import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";

const firebaseConfig = { /* your firebase config */ };
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

const host = window.location.hostname;
connectFirestoreEmulator(db, host, 8080);
connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });

