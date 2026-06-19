import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBfqjfJoGz591aI8TJjhIS3T4OEvQxX11Y",
    authDomain: "cris-database-da989.firebaseapp.com",
    projectId: "cris-database-da989",
    storageBucket: "cris-database-da989.firebasestorage.app",
    messagingSenderId: "627885439681",
    appId: "1:627885439681:web:3c657d64c0aad9b4913240"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* --------------------
    Authentication State Observer
-------------------- */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 🌟 Scan Firestore for the logged-in facility's name and print it to the H1
        await printFacilityNameInHeader(user.uid);
        
        // 🌟 Start monitoring live numbers for the dashboard metric cards
        listenToLiveDashboardMetrics(user.uid);
    } else {
        // Kick out to login page if user isn't logged in
        window.location.href = 'abtc-login.html';
    }
});

/* --------------------
    Firestore Scanner & Header Printer
-------------------- */
async function printFacilityNameInHeader(uid) {
    const titleElement = document.getElementById("dashboardTitle");

    // Safety check: stop if the H1 element is missing on the current page
    if (!titleElement) return;

    try {
        // 🔎 Scan the "facilities" collection for a document matching the logged-in user's UID
        const facilitySnapshot = await getDoc(doc(db, "facilities", uid));

        if (facilitySnapshot.exists()) {
            const data = facilitySnapshot.data();
            const name = data.facilityName || "ABTC";
            
            // 🖨️ Print it directly inside your <h1> container in uppercase
            titleElement.innerText = `${name.toUpperCase()} DASHBOARD`;
        } else {
            // Fallback text if the profile document doesn't exist in Firestore
            titleElement.innerText = "ABTC DASHBOARD";
        }
    } catch (error) {
        console.error("Firestore scanning failure:", error);
        titleElement.innerText = "ABTC DASHBOARD";
    }
}

/* --------------------
    🌟 Dynamic Dashboard Metrics Counter Engine
-------------------- */
function listenToLiveDashboardMetrics(facilityUid) {
    const patientsCounterEl = document.getElementById("totalPatientsCount");
    const catThreeCounterEl = document.getElementById("categoryThreeCount");

    // Query to pull only records that belong to the logged-in facility's workspace
    const metricsQuery = query(
        collection(db, "bite_cases"),
        where("facilityId", "==", facilityUid)
    );

    // Active real-time multi-tenant snapshot listener
    onSnapshot(metricsQuery, (snapshot) => {
        const totalPatientsCount = snapshot.size; // Counts total number of documents in query
        let totalCategoryThreeCount = 0;

        // Loop through metrics data array to identify explicit Category III cases
        snapshot.forEach((patientDoc) => {
            const data = patientDoc.data();
            if (data.classification === "Category III") {
                totalCategoryThreeCount++;
            }
        });

        // 🖨️ Inject formatted two-digit counter values directly into your dashboard cards
        if (patientsCounterEl) {
            patientsCounterEl.innerText = String(totalPatientsCount).padStart(2, '0');
        }
        if (catThreeCounterEl) {
            catThreeCounterEl.innerText = String(totalCategoryThreeCount).padStart(2, '0');
        }
    });
}

/* --------------------
    Logout Interceptor
-------------------- */
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        if (confirm("Are you sure you want to log out?")) {
            try {
                await signOut(auth);
                window.location.href = 'abtc-login.html';
            } catch (err) {
                console.error("Sign-out failure:", err);
            }
        }
    });
}