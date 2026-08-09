// seed-firestore.js
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

// Live DB connection
const liveApp = initializeApp({ credential: cert(serviceAccount) }, 'liveApp');
const liveDb = getFirestore(liveApp);

// Local Firestore Emulator connection
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8088'; 
const emulatorApp = initializeApp({ projectId: serviceAccount.project_id }, 'emulatorApp');
const emulatorDb = getFirestore(emulatorApp);

const selectedCollections = [
  'abtcs',
  'app-database',
  'audit_logs',
  'bite_reports',
  'calendar-events',
  'facilities',
  'facility_counters',
  'patient-database',
  'pho-users',
  'pvo-users',
  'user-info',
  'users'
];

async function copyDocAndSubcols(docRef, targetColRef) {
  const docSnap = await docRef.get();
  if (!docSnap.exists) return;

  const targetDocRef = targetColRef.doc(docSnap.id);
  await targetDocRef.set(docSnap.data());

  const subcols = await docRef.listCollections();
  for (const subcol of subcols) {
    const subDocs = await subcol.get();
    for (const subDoc of subDocs.docs) {
      await copyDocAndSubcols(subDoc.ref, targetDocRef.collection(subcol.id));
    }
  }
}

async function syncFirestore() {
  console.log('📦 Syncing Firestore Collections...');
  for (const colName of selectedCollections) {
    const colRef = liveDb.collection(colName);
    const snap = await colRef.get();
    if (snap.empty) continue;

    const targetRef = emulatorDb.collection(colName);
    for (const docSnap of snap.docs) {
      await copyDocAndSubcols(docSnap.ref, targetRef);
    }
    console.log(`✅ Synced ${snap.size} doc(s) for "${colName}"`);
  }
  console.log('🎉 Firestore sync complete!');
  process.exit(0);
}

syncFirestore().catch(console.error);