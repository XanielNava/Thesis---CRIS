// ==========================================================================
// CRIS PHO ADMIN - DASHBOARD CONTROLLER (admin-db.js)
// ==========================================================================

import { auth, db } from '../../firebase/firebase-config.js';
import { 
    collection, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    limit 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

// DOM Elements - Metrics
const statTotalFacilities = document.getElementById("statTotalFacilities");
const statActiveUsers = document.getElementById("statActiveUsers");
const statActiveFacilities = document.getElementById("statActiveFacilities");
const statPending = document.getElementById("statPending");
const statSuspended = document.getElementById("statSuspended");

// DOM Elements - Lists
const pendingList = document.getElementById("pendingList");
const recentActivity = document.getElementById("recentActivity");

// Sidebar & Modals
const sidebar = document.getElementById("sidebar");
const appLayout = document.getElementById("appLayout");
const sidebarToggle = document.getElementById("sidebarToggle");
const logoutModal = document.getElementById("logoutModal");
const logoutBtn = document.getElementById("logoutBtn");
const logoutConfirm = document.getElementById("logoutConfirm");

/* ======================================================================
   1. AUTHENTICATION & SIDEBAR STATE
   ====================================================================== */

const SIDEBAR_KEY = 'sidebarCollapsed';

function readSidebarState() {
    try {
        return localStorage.getItem(SIDEBAR_KEY) === 'true';
    } catch (e) {
        return false;
    }
}

function storeSidebarState(collapsed) {
    try {
        localStorage.setItem(SIDEBAR_KEY, String(collapsed));
    } catch (e) { /* Storage unavailable */ }
}

function applySidebarState(collapsed) {
    if (!sidebar || !appLayout) return;
    sidebar.classList.toggle('collapsed', collapsed);
    appLayout.classList.toggle('sidebar-collapsed', collapsed);
    if (sidebarToggle) {
        sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    }
}

if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        const collapsed = !sidebar.classList.contains('collapsed');
        applySidebarState(collapsed);
        storeSidebarState(collapsed);
    });
}

// Ensure user is authenticated
onAuthStateChanged(auth, (user) => {
    if (!user) {
        // Redirect to login if session is expired
        window.location.href = "../pho/pho-login.html";
    }
});

/* ======================================================================
   2. DASHBOARD METRICS & DATA FETCHING
   ====================================================================== */

async function loadDashboardData() {
    try {
        // ------------------------------------------------------------------
        // A. Facility Metrics (facilities collection)
        // ------------------------------------------------------------------
        const facSnapshot = await getDocs(collection(db, "facilities"));
        let totalFacilitiesCount = 0;
        let activeFacilitiesCount = 0;
        let suspendedFacilitiesCount = 0;
        const allFacilities = [];

        facSnapshot.forEach(docSnap => {
            totalFacilitiesCount++;
            const data = docSnap.data();
            const status = (data.status || '').toLowerCase();

            if (status === 'active') {
                activeFacilitiesCount++;
            } else if (status === 'suspended' || status === 'inactive') {
                suspendedFacilitiesCount++;
            }

            allFacilities.push({
                id: docSnap.id,
                ...data
            });
        });

        if (statTotalFacilities) statTotalFacilities.textContent = totalFacilitiesCount;
        if (statActiveFacilities) statActiveFacilities.textContent = activeFacilitiesCount;
        if (statSuspended) statSuspended.textContent = suspendedFacilitiesCount;
        
        // ------------------------------------------------------------------
        // B. Active PHO User Accounts (INTERNAL PHO PERSONNEL ONLY)
        // ------------------------------------------------------------------
        const usersQuery = query(
            collection(db, "users"),
            where("status", "==", "Active")
        );
        const userSnapshot = await getDocs(usersQuery);

        let phoActiveCount = 0;
        userSnapshot.forEach(docSnap => {
            const data = docSnap.data();

            // 🛡️ SEPARATION FILTER: Exclude any facility owners, clinic heads, or staff
            if (data.facilityId || data.accountType === 'facility' || data.facilityRole) {
                return;
            }

            phoActiveCount++;
        });

        if (statActiveUsers) {
            statActiveUsers.textContent = phoActiveCount;
        }

        // ------------------------------------------------------------------
        // C. Pending Applications Metric & List (facility_applications)
        // ------------------------------------------------------------------
        const pendingQuery = query(
            collection(db, "facility_applications"),
            where("reviewStatus", "==", "Pending")
        );
        const appSnapshot = await getDocs(pendingQuery);
        
        if (statPending) {
            statPending.textContent = appSnapshot.size;
        }

        renderPendingList(appSnapshot.docs);

        // ------------------------------------------------------------------
        // D. Recent Administrative Activity
        // ------------------------------------------------------------------
        renderRecentActivity(allFacilities);

    } catch (error) {
        console.error("Dashboard metric load failed:", error);
    }
}

/* ======================================================================
   3. PANEL RENDERING
   ====================================================================== */

function renderPendingList(docs) {
    if (!pendingList) return;

    if (docs.length === 0) {
        pendingList.innerHTML = `
            <li class="simple-item" style="color: var(--text-muted, #64748b); padding: 16px; text-align: center;">
                No pending facility applications. All caught up!
            </li>
        `;
        return;
    }

    pendingList.innerHTML = docs.slice(0, 5).map(docSnap => {
        const app = docSnap.data();
        const dateStr = app.submittedAt?.toDate 
            ? app.submittedAt.toDate().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Recently';

        return `
            <li class="simple-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border-color, #e2e8f0);">
                <div>
                    <strong>${app.facilityName || 'Unnamed Facility'}</strong>
                    <div style="font-size: 0.82rem; color: var(--text-muted, #64748b);">
                        ${app.address?.city || 'Unknown location'}, ${app.address?.province || ''} &bull; Submitted ${dateStr}
                    </div>
                </div>
                <a href="facilities.html" class="btn btn-sm btn-ghost" style="text-decoration: none;">Review</a>
            </li>
        `;
    }).join('');
}

function renderRecentActivity(facilities) {
    if (!recentActivity) return;

    if (facilities.length === 0) {
        recentActivity.innerHTML = `
            <li class="simple-item" style="color: var(--text-muted, #64748b); padding: 16px; text-align: center;">
                No recent administrative events recorded.
            </li>
        `;
        return;
    }

    // Sort by createdAt descending and take top 5
    const sorted = [...facilities].sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
    }).slice(0, 5);

    recentActivity.innerHTML = sorted.map(fac => {
        const dateStr = fac.createdAt?.toDate 
            ? fac.createdAt.toDate().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Recent';

        return `
            <li class="simple-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border-color, #e2e8f0);">
                <div>
                    <span style="color: #166534; font-weight: 600;">Facility Commissioned</span>
                    <div style="font-size: 0.88rem; color: var(--text-primary, #1e293b);">
                        <strong>${fac.facilityName}</strong> was activated into the network.
                    </div>
                </div>
                <small style="color: var(--text-muted, #64748b); white-space: nowrap;">${dateStr}</small>
            </li>
        `;
    }).join('');
}

/* ======================================================================
   4. LOGOUT & MODAL EVENTS
   ====================================================================== */

function openModal(el) {
    if (!el) return;
    el.style.display = 'flex';
    el.setAttribute('aria-hidden', 'false');
}

function closeModal(el) {
    if (!el) return;
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => openModal(logoutModal));
}

if (logoutConfirm) {
    logoutConfirm.addEventListener('click', async () => {
        try {
            await signOut(auth);
            localStorage.clear();
            window.location.href = '../pho/pho-login.html';
        } catch (err) {
            console.error("Logout failed:", err);
            window.location.href = '../pho/pho-login.html';
        }
    });
}

document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(logoutModal));
});

window.addEventListener('click', (e) => {
    if (e.target === logoutModal) closeModal(logoutModal);
});

// Boot Controller
document.addEventListener("DOMContentLoaded", () => {
    applySidebarState(readSidebarState());
    loadDashboardData();
});