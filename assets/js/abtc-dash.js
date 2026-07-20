// abtc-dash.js - CDN Modular Version for the Operational Dashboard
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { 
    getFirestore, doc, getDoc, collection, query, where, onSnapshot 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

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
        console.log("Active facility workspace session authenticated for UID:", user.uid);
        
        try {
            // 1. Read the user designation chosen on the profile selection screen
            const userRole = localStorage.getItem("activeDesignation"); 
            const currentPath = window.location.pathname;

            console.log(`Current session role state: ${userRole} | Path: ${currentPath}`);

            // 2. Enforce Redirection Guard Rails
            if (!userRole) {
                console.warn("No active designation role found. Routing back to profile picker.");
                window.location.href = "abtc-profiles.html";
                return;
            }

            if (userRole === "Nurse" && !currentPath.includes("patient-registry.html")) {
                console.log("Redirecting nurse to Patient Registry terminal...");
                window.location.href = "patient-registry.html";
                return;
            } else if (userRole === "Owner" && !currentPath.includes("abtc-dash.html")) {
                console.log("Redirecting owner to main Operational Dashboard...");
                window.location.href = "abtc-dash.html";
                return;
            }

            // 3. Fetch Facility Meta Details to render page layouts dynamically
            const facilityDocRef = doc(db, "facilities", user.uid);
            const facilitySnapshot = await getDoc(facilityDocRef);

            if (facilitySnapshot.exists()) {
                const facilityData = facilitySnapshot.data();
                
                // 🎯 FIX: Prioritize direct database field data context over session fallbacks for the Owner role
                const activeStaffMember = userRole === "Owner" 
                    ? (facilityData.contactInfo?.contactPerson || "Facility Administrator")
                    : (localStorage.getItem("activePersonnelName") || "Duty Nurse Personnel");
                
                // Dynamically check and inject the uploaded facility logo to the universal sidebar header
                if (facilityData.logoData) {
                    const sidebarLogo = document.getElementById("sidebarLogoPreview");
                    if (sidebarLogo) {
                        sidebarLogo.src = facilityData.logoData;
                    }
                }
                
                await renderUserAndFacilityHeader(facilityData, activeStaffMember, userRole);
                listenToLiveDashboardMetrics(user.uid);
            } else {
                console.warn("Facility workspace metadata document missing from database mapping.");
                const standardFallbackName = userRole === "Owner" ? "Facility Owner" : "Duty Nurse Personnel";
                updateProfileUI(standardFallbackName, userRole === "Owner" ? "Administrator" : "Nurse Duty Staff");
                listenToLiveDashboardMetrics(user.uid);
            }

        } catch (error) {
            console.error("Auth routing engine failure:", error);
        }
    } else {
        handleLogoutRedirect();
    }
});

/* --------------------
    Profile & Header Renderer
-------------------- */
async function renderUserAndFacilityHeader(facilityData, displayName, userRole) {
    const titleElement = document.getElementById("dashboardTitle");
    const name = facilityData.facilityName || "ABTC";
    
    if (titleElement) {
        titleElement.innerText = `${name.toUpperCase()} DASHBOARD`;
    }
    
    // Format presentation parameters
    const mappedRoleTitle = userRole === "Owner" ? "Administrator / Owner" : "Nurse Duty Personnel";
    updateProfileUI(displayName, mappedRoleTitle);
}

function updateProfileUI(name, role) {
    const profileContainer = document.getElementById("profileInfoText");
    const welcomeBar = document.getElementById("welcomeBarText");

    if (profileContainer) {
        profileContainer.innerHTML = `<strong>${name}</strong><br><span>${role}</span>`;
    }
    if (welcomeBar) {
        // Obtains first name cleanly without slicing characters array layouts
        const cleanFirstName = name.split(" ")[0];
        welcomeBar.innerHTML = `<div class="avatar-circle"></div>Welcome back, ${cleanFirstName}`;
    }
}

/* --------------------
    Dynamic Dashboard Metrics Counter Engine
-------------------- */
function listenToLiveDashboardMetrics(facilityId) {
    const patientsCounterEl = document.getElementById("totalPatientsCount");
    const catThreeCounterEl = document.getElementById("categoryThreeCount");

    const metricsQuery = query(
        collection(db, "bite_cases"),
        where("facilityId", "==", facilityId)
    );

    onSnapshot(metricsQuery, (snapshot) => {
        const totalPatientsCount = snapshot.size;
        let totalCategoryThreeCount = 0;

        snapshot.forEach((patientDoc) => {
            const data = patientDoc.data();
            if (data.classification === "Category III") {
                totalCategoryThreeCount++;
            }
        });

        if (patientsCounterEl) {
            patientsCounterEl.innerText = String(totalPatientsCount).padStart(2, '0');
        }
        if (catThreeCounterEl) {
            catThreeCounterEl.innerText = String(totalCategoryThreeCount).padStart(2, '0');
        }
    }, (error) => {
        console.error("Real-time metrics stream failed:", error);
    });
}

function handleLogoutRedirect() {
    localStorage.removeItem("activeDesignation");
    localStorage.removeItem("activePersonnelName");
    window.location.href = 'abtc-login.html';
}

/* --------------------
    Logout Interceptor
-------------------- */
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (confirm("Are you sure you want to log out?")) {
            try {
                await signOut(auth);
                handleLogoutRedirect();
            } catch (err) {
                console.error("Sign-out failure:", err);
            }
        }
    });
}