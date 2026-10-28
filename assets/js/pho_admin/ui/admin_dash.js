/* ==========================================================================
   SYSTEM OVERVIEW (DASHBOARD) — PHO ADMIN PAGE CONTROLLER (admin_dash.js)
   Connected to Firestore: facilities, facility_applications, and users
   ========================================================================== */

import { auth, db } from '../../firebase/firebase-config.js';
import { 
    collection, 
    getDocs, 
    doc, 
    writeBatch, 
    serverTimestamp, 
    query, 
    where 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

(function () {
    'use strict';

    /* ======================================================================
       1. SIDEBAR & SESSION NAVIGATION
       ====================================================================== */

    const SIDEBAR_KEY = 'sidebarCollapsed';

    const sidebar = document.getElementById('sidebar');
    const appLayout = document.getElementById('appLayout');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const logoutBtn = document.getElementById('logoutBtn');
    const logoutModal = document.getElementById('logoutModal');
    const logoutConfirm = document.getElementById('logoutConfirm');

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
        } catch (e) { /* storage unavailable */ }
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
        sidebarToggle.addEventListener('click', function () {
            const collapsed = !sidebar.classList.contains('collapsed');
            applySidebarState(collapsed);
            storeSidebarState(collapsed);
        });
    }

    // Session Verification & Boot Entrypoint
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            console.warn("No active session found. Redirecting to login...");
            window.location.href = '../pho/pho-login.html';
            return;
        }

        console.log("Authenticated PHO Admin:", user.email);
        applySidebarState(readSidebarState());
        await loadDashboardMetrics();
    });

    /* ======================================================================
       2. HELPERS & UTILITIES
       ====================================================================== */

    const $ = (selector) => document.querySelector(selector);

    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const toastEl = document.getElementById('toast');
    let toastTimer = null;

    function toast(message) {
        if (!toastEl) return;
        toastEl.textContent = message;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
    }

    function openModal(el) {
        if (!el) return;
        el.classList.add('open');
        el.style.display = 'flex';
        el.setAttribute('aria-hidden', 'false');
    }

    function closeModal(el) {
        if (!el) return;
        el.classList.remove('open');
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
    }

    /* ======================================================================
       3. FIRESTORE DATA STATE & FETCHING
       ====================================================================== */

    let pendingApplications = [];
    let activeFacilities = [];

    async function loadDashboardMetrics() {
        try {
            // A. Fetch All Facilities
            const facSnapshot = await getDocs(collection(db, "facilities"));
            let totalFacCount = 0;
            let activeFacCount = 0;
            let suspendedCount = 0;
            activeFacilities = [];

            facSnapshot.forEach((docSnap) => {
                totalFacCount++;
                const data = docSnap.data();
                const st = (data.status || '').toLowerCase();

                if (st === 'active') {
                    activeFacCount++;
                } else if (st === 'suspended' || st === 'inactive') {
                    suspendedCount++;
                }

                activeFacilities.push({
                    id: docSnap.id,
                    name: data.facilityName || 'Unnamed Facility',
                    createdAt: data.createdAt,
                    ...data
                });
            });

            // B. Fetch Active Users (STRICT PHO ADMIN SEPARATION)
            const usersQuery = query(collection(db, "users"), where("status", "==", "Active"));
            const userSnapshot = await getDocs(usersQuery);

            let phoActiveCount = 0;
            userSnapshot.forEach((docSnap) => {
                const u = docSnap.data();
                // Exclude any external facility head/staff
                if (u.facilityId || u.accountType === 'facility' || u.facilityRole) {
                    return;
                }
                phoActiveCount++;
            });

            // C. Fetch Pending Applications
            const pendingQuery = query(collection(db, "facility_applications"), where("reviewStatus", "==", "Pending"));
            const appSnapshot = await getDocs(pendingQuery);
            
            pendingApplications = [];
            appSnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                pendingApplications.push({
                    id: docSnap.id,
                    name: data.facilityName || 'Unnamed Facility',
                    district: `${data.address?.city || ''}${data.address?.province ? ', ' + data.address.province : ''}`,
                    registered: data.submittedAt?.toDate 
                        ? data.submittedAt.toDate().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Recently',
                    raw: data
                });
            });

            // Render Metrics
            if ($('#statTotalFacilities')) $('#statTotalFacilities').textContent = totalFacCount;
            if ($('#statActiveUsers')) $('#statActiveUsers').textContent = phoActiveCount;
            if ($('#statActiveFacilities')) $('#statActiveFacilities').textContent = activeFacCount;
            if ($('#statPending')) $('#statPending').textContent = appSnapshot.size;
            if ($('#statSuspended')) $('#statSuspended').textContent = suspendedCount;

            renderOverviewLists();

        } catch (error) {
            console.error("Dashboard metric loading error:", error);
        }
    }

    /* ======================================================================
       4. PANEL RENDERING
       ====================================================================== */

    function renderOverviewLists() {
        // Pending Facility Approvals List
        const pendingListEl = $('#pendingList');
        if (pendingListEl) {
            if (pendingApplications.length === 0) {
                pendingListEl.innerHTML = '<li><span class="muted" style="padding: 12px; display: block; text-align: center;">No pending approvals. All caught up!</span></li>';
            } else {
                pendingListEl.innerHTML = pendingApplications.slice(0, 5).map((f) => `
                    <li>
                        <div class="li-main">
                            <strong>${esc(f.name)}</strong>
                            <small>${esc(f.district)} &bull; Submitted ${esc(f.registered)}</small>
                        </div>
                        <button class="btn btn-success btn-sm" data-action="approve-facility" data-id="${esc(f.id)}">Approve</button>
                    </li>`).join('');
            }
        }

        // Recent Activity List (Recent Commissioned Facilities)
        const activityListEl = $('#recentActivity');
        if (activityListEl) {
            if (activeFacilities.length === 0) {
                activityListEl.innerHTML = '<li><span class="muted" style="padding: 12px; display: block; text-align: center;">No administrative activities recorded yet.</span></li>';
            } else {
                const sortedRecent = [...activeFacilities].sort((a, b) => {
                    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
                    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
                    return timeB - timeA;
                }).slice(0, 5);

                activityListEl.innerHTML = sortedRecent.map((fac) => {
                    const dateStr = (() => {
                        if (!fac.createdAt) return 'Recently';
                        if (typeof fac.createdAt.toDate === 'function') {
                            return fac.createdAt.toDate().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                        }
                        if (fac.createdAt instanceof Date) {
                            return fac.createdAt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                        }
                        const parsed = new Date(fac.createdAt);
                        return !isNaN(parsed) 
                            ? parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                            : 'Recently';
                    })();

                    return `
                        <li>
                            <div class="li-main">
                                <strong style="color: #166534;">Facility Commissioned</strong>
                                <small>${esc(fac.name)} was activated into the network.</small>
                            </div>
                            <small class="muted">${esc(dateStr)}</small>
                        </li>`;
                }).join('');
            }
        }
    }

    /* ======================================================================
       5. ATOMIC APPROVAL ACTION
       ====================================================================== */

    async function approveApplicationFromDash(appId) {
        const item = pendingApplications.find((a) => a.id === appId);
        if (!item || !item.raw) return;

        const raw = item.raw;
        if (!window.confirm(`Approve and commission "${raw.facilityName}" directly from dashboard?`)) return;

        try {
            const batch = writeBatch(db);

            // 1. Permanent entry in 'facilities'
            const newFacilityRef = doc(collection(db, "facilities"));
            const newFacilityId = newFacilityRef.id;

            batch.set(newFacilityRef, {
                facilityId: newFacilityId,
                facilityName: raw.facilityName,
                acronym: raw.acronym || '',
                facilityType: raw.facilityType || 'ABTC',
                status: "Active",
                address: raw.address || {},
                contactInfo: raw.contactInfo || {},
                regulatoryData: raw.regulatoryData || {},
                commissionedBy: auth.currentUser ? auth.currentUser.uid : "admin",
                createdAt: serverTimestamp()
            });

            // 2. Activate user
            if (raw.applicantUid) {
                const userRef = doc(db, "users", raw.applicantUid);
                batch.update(userRef, {
                    status: "Active",
                    facilityId: newFacilityId,
                    updatedAt: serverTimestamp()
                });

                // 3. Link membership
                const membershipRef = doc(db, "facility_memberships", `${raw.applicantUid}_${newFacilityId}`);
                batch.set(membershipRef, {
                    userId: raw.applicantUid,
                    facilityId: newFacilityId,
                    facilityRole: "Facility Head",
                    isActive: true,
                    assignedDate: serverTimestamp()
                });
            }

            // 4. Delete pending application
            const appRef = doc(db, "facility_applications", appId);
            batch.delete(appRef);

            // 5. Seed sequence counter
            const counterRef = doc(db, "facility_counters", newFacilityId);
            batch.set(counterRef, {
                currentSequence: 0
            });

            await batch.commit();
            toast(`${raw.facilityName} approved.`);
            await loadDashboardMetrics();

        } catch (err) {
            console.error("Dashboard quick-approval error:", err);
            alert("Approval failed: " + err.message);
        }
    }

    /* ======================================================================
       6. EVENTS
       ====================================================================== */

    document.addEventListener('click', function (e) {
        const approveBtn = e.target.closest('[data-action="approve-facility"]');
        if (approveBtn) {
            approveApplicationFromDash(approveBtn.dataset.id);
            return;
        }

        if (e.target.closest('#logoutBtn')) {
            openModal(logoutModal);
            return;
        }

        if (e.target.closest('#logoutConfirm')) {
            signOut(auth).then(() => {
                localStorage.clear();
                window.location.href = '../pho/pho-login.html';
            }).catch(() => {
                window.location.href = '../pho/pho-login.html';
            });
            return;
        }

        const closeBtn = e.target.closest('[data-close]');
        if (closeBtn) {
            closeModal(logoutModal);
            return;
        }

        if (e.target === logoutModal) {
            closeModal(logoutModal);
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && logoutModal && logoutModal.classList.contains('open')) {
            closeModal(logoutModal);
        }
    });
})();