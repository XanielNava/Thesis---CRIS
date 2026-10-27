// ==========================================================================
// CRIS PHO ADMIN - FACILITIES CONTROLLER (facilities.js)
// ==========================================================================

import { auth, db } from '../../firebase/firebase-config.js';
import { 
    collection, 
    getDocs, 
    doc, 
    updateDoc, 
    writeBatch, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

// State
let allFacilities = [];
let selectedApplication = null;

// DOM Elements
const tableBody = document.getElementById("facilityTableBody");
const searchInput = document.getElementById("facilitySearch");
const statusFilter = document.getElementById("facilityStatusFilter");
const emptyState = document.getElementById("facilityEmpty");

// Modals
const reviewModal = document.getElementById("reviewModal");
const reviewModalBody = document.getElementById("reviewModalBody");
const btnApproveApp = document.getElementById("btnApproveApp");
const btnRejectApp = document.getElementById("btnRejectApp");

const facilityModal = document.getElementById("facilityModal");
const facilityForm = document.getElementById("facilityForm");
const logoutModal = document.getElementById("logoutModal");

// --------------------------------------------------------------------------
// 1. DATA INITIALIZATION & FETCHING
// --------------------------------------------------------------------------

async function fetchAllFacilityData() {
    try {
        allFacilities = [];

        // 1. Fetch Pending Applications
        const appSnapshot = await getDocs(collection(db, "facility_applications"));
        appSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            allFacilities.push({
                id: docSnap.id,
                isApplication: true,
                facilityName: data.facilityName || 'Unnamed Facility',
                acronym: data.acronym || '',
                facilityType: data.facilityType || 'ABTC',
                municipality: data.address?.city || data.address?.municipality || 'N/A',
                province: data.address?.province || '',
                contactPerson: data.contactInfo?.contactPerson || 'N/A',
                position: data.contactInfo?.position || '',
                phone: data.contactInfo?.phone || 'N/A',
                email: data.contactInfo?.email || 'N/A',
                status: data.reviewStatus || 'Pending',
                submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate() : new Date(),
                raw: data
            });
        });

        // 2. Fetch Active/Commissioned Facilities
        const facSnapshot = await getDocs(collection(db, "facilities"));
        facSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            allFacilities.push({
                id: docSnap.id,
                isApplication: false,
                facilityName: data.facilityName || 'Unnamed Facility',
                acronym: data.acronym || '',
                facilityType: data.facilityType || 'ABTC',
                municipality: data.address?.city || data.address?.municipality || 'N/A',
                province: data.address?.province || '',
                contactPerson: data.contactInfo?.contactPerson || 'N/A',
                position: data.contactInfo?.position || '',
                phone: data.contactInfo?.phone || 'N/A',
                email: data.contactInfo?.email || 'N/A',
                status: data.status || 'Active',
                submittedAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
                raw: data
            });
        });

        renderTable();

    } catch (error) {
        console.error("Error loading facilities:", error);
        tableBody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Failed to load facility data: ${error.message}</td></tr>`;
    }
}

// --------------------------------------------------------------------------
// 2. RENDER TABLE & FILTERING
// --------------------------------------------------------------------------

function renderTable() {
    const query = searchInput.value.trim().toLowerCase();
    const filter = statusFilter.value;

    const filtered = allFacilities.filter(fac => {
        const matchesQuery = 
            fac.facilityName.toLowerCase().includes(query) ||
            fac.id.toLowerCase().includes(query) ||
            fac.municipality.toLowerCase().includes(query) ||
            fac.contactPerson.toLowerCase().includes(query);

        const matchesStatus = filter === "" || fac.status.toLowerCase() === filter.toLowerCase();

        return matchesQuery && matchesStatus;
    });

    if (filtered.length === 0) {
        tableBody.innerHTML = "";
        emptyState.classList.remove("hidden");
        return;
    }

    emptyState.classList.add("hidden");
    tableBody.innerHTML = "";

    filtered.forEach(fac => {
        const row = document.createElement("tr");
        const statusClass = (fac.status || "active").toLowerCase();
        const formattedDate = fac.submittedAt.toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        row.innerHTML = `
            <td><code>${fac.id.substring(0, 10)}...</code></td>
            <td>
                <strong>${fac.facilityName}</strong>
                ${fac.acronym ? `<small style="display:block; color:#64748b;">${fac.acronym} &bull; ${fac.facilityType}</small>` : ''}
            </td>
            <td>${fac.municipality}, ${fac.province}</td>
            <td>
                ${fac.contactPerson}
                <small style="display:block; color:#64748b;">${fac.phone}</small>
            </td>
            <td>${formattedDate}</td>
            <td>
                <span class="status-badge status-${statusClass}">${fac.status}</span>
            </td>
            <td class="col-actions">
                ${fac.isApplication && fac.status === "Pending" ? `
                    <button class="btn btn-sm btn-primary btn-review" data-id="${fac.id}">Review</button>
                ` : `
                    <button class="btn btn-sm btn-ghost btn-edit" data-id="${fac.id}">Edit</button>
                `}
            </td>
        `;

        tableBody.appendChild(row);
    });

    attachActionListeners();
}

// --------------------------------------------------------------------------
// 3. EVENT LISTENERS & MODAL HANDLERS
// --------------------------------------------------------------------------

function attachActionListeners() {
    // Review Application Button
    document.querySelectorAll(".btn-review").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = e.target.getAttribute("data-id");
            openReviewModal(id);
        });
    });

    // Edit Active Facility Button
    document.querySelectorAll(".btn-edit").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = e.target.getAttribute("data-id");
            openEditModal(id);
        });
    });
}

function openReviewModal(appId) {
    selectedApplication = allFacilities.find(f => f.id === appId);
    if (!selectedApplication) return;

    const raw = selectedApplication.raw;
    const reg = raw.regulatoryData || {};

    reviewModalBody.innerHTML = `
        <div style="background: rgba(0,0,0,0.03); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
            <h4 style="margin: 0 0 6px 0;">${raw.facilityName} (${raw.acronym || 'N/A'})</h4>
            <p style="margin: 0;"><strong>Type:</strong> ${raw.facilityType} &bull; <strong>Ownership:</strong> ${reg.ownershipType || 'Not specified'}</p>
            <p style="margin: 0;"><strong>Location:</strong> ${raw.address?.street}, ${raw.address?.barangay}, ${raw.address?.city}, ${raw.address?.province}</p>
        </div>

        <h4 style="margin: 12px 0 6px 0;">Personnel &amp; Contact</h4>
        <p style="margin: 0;"><strong>Lead Officer:</strong> ${raw.contactInfo?.contactPerson} (${raw.contactInfo?.position || 'N/A'})</p>
        <p style="margin: 0;"><strong>PRC License Number:</strong> <code>${reg.prcLicense || 'N/A'}</code></p>
        <p style="margin: 0;"><strong>Email:</strong> ${raw.contactInfo?.email} &bull; <strong>Phone:</strong> ${raw.contactInfo?.phone}</p>

        <h4 style="margin: 12px 0 6px 0;">DOH Compliance &amp; Proof</h4>
        <p style="margin: 0;"><strong>DOH LTO / Accreditation:</strong> <code>${reg.dohLto || 'N/A'}</code></p>
        <p style="margin: 0;"><strong>Cold Chain Integrity Confirmed:</strong> ${reg.coldChainCompliant ? '✅ Yes (2°C to 8°C Storage)' : '❌ Not Declared'}</p>
        <p style="margin: 8px 0 0 0;">
            <strong>Verification Documents:</strong> 
            ${reg.docsFolderUrl ? `
                <a href="${reg.docsFolderUrl}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; font-weight: bold;">
                    Open Attached Scanned Documents Folder ↗
                </a>
            ` : '<span style="color:#ef4444;">No cloud link provided</span>'}
        </p>
    `;

    reviewModal.style.display = "flex";
    reviewModal.setAttribute("aria-hidden", "false");
}

function openEditModal(facId) {
    const fac = allFacilities.find(f => f.id === facId);
    if (!fac) return;

    document.getElementById("facilityId").value = fac.id;
    document.getElementById("facName").value = fac.facilityName;
    document.getElementById("facDistrict").value = fac.municipality;
    document.getElementById("facPhone").value = fac.phone;
    document.getElementById("facEmail").value = fac.email;
    document.getElementById("facStatus").value = fac.status;

    facilityModal.style.display = "flex";
    facilityModal.setAttribute("aria-hidden", "false");
}

// --------------------------------------------------------------------------
// 4. STEP 2: APPROVAL & COMMISSIONING (ATOMIC BATCH TRANSACTION)
// --------------------------------------------------------------------------

btnApproveApp.addEventListener("click", async () => {
    if (!selectedApplication) return;
    const raw = selectedApplication.raw;
    const appId = selectedApplication.id;

    if (!confirm(`Confirm approval for "${raw.facilityName}"? This will commission the facility and activate its admin account.`)) {
        return;
    }

    btnApproveApp.disabled = true;
    btnApproveApp.innerText = "Approving...";

    try {
        const batch = writeBatch(db);

        // 1. Create entry in permanent 'facilities' collection
        const newFacilityRef = doc(collection(db, "facilities"));
        const newFacilityId = newFacilityRef.id;

        batch.set(newFacilityRef, {
            facilityId: newFacilityId,
            facilityName: raw.facilityName,
            acronym: raw.acronym,
            facilityType: raw.facilityType,
            status: "Active",
            address: raw.address,
            contactInfo: raw.contactInfo,
            regulatoryData: raw.regulatoryData,
            commissionedBy: auth.currentUser ? auth.currentUser.uid : "admin",
            createdAt: serverTimestamp()
        });

        // 2. Activate the applicant's user record in 'users'
        const userRef = doc(db, "users", raw.applicantUid);
        batch.update(userRef, {
            status: "Active",
            facilityId: newFacilityId,
            updatedAt: serverTimestamp()
        });

        // 3. Create initial membership link in 'facility_memberships'
        const membershipRef = doc(db, "facility_memberships", `${raw.applicantUid}_${newFacilityId}`);
        batch.set(membershipRef, {
            userId: raw.applicantUid,
            facilityId: newFacilityId,
            facilityRole: "Facility Head",
            isActive: true,
            assignedDate: serverTimestamp()
        });

        // 4. Update the application status to Approved
        const appRef = doc(db, "facility_applications", appId);
        batch.update(appRef, {
            reviewStatus: "Approved",
            reviewedBy: auth.currentUser ? auth.currentUser.uid : "admin",
            approvedAt: serverTimestamp()
        });

        // 5. Initialize sequence counters for bite case logs
        const counterRef = doc(db, "facility_counters", newFacilityId);
        batch.set(counterRef, {
            currentSequence: 0
        });

        await batch.commit();

        showToast(`Facility "${raw.facilityName}" commissioned successfully!`);
        closeModals();
        await fetchAllFacilityData();

    } catch (error) {
        console.error("Approval failed:", error);
        alert("Approval failed: " + error.message);
    } finally {
        btnApproveApp.disabled = false;
        btnApproveApp.innerText = "Approve & Commission";
    }
});

btnRejectApp.addEventListener("click", async () => {
    if (!selectedApplication) return;
    const appId = selectedApplication.id;

    const reason = prompt("Enter the reason for rejecting this facility application:");
    if (!reason) return;

    btnRejectApp.disabled = true;
    btnRejectApp.innerText = "Rejecting...";

    try {
        const appRef = doc(db, "facility_applications", appId);
        await updateDoc(appRef, {
            reviewStatus: "Rejected",
            rejectionReason: reason,
            reviewedBy: auth.currentUser ? auth.currentUser.uid : "admin",
            reviewedAt: serverTimestamp()
        });

        showToast("Application has been rejected.");
        closeModals();
        await fetchAllFacilityData();

    } catch (error) {
        console.error("Rejection error:", error);
        alert("Rejection failed: " + error.message);
    } finally {
        btnRejectApp.disabled = false;
        btnRejectApp.innerText = "Reject Application";
    }
});

// Edit Form Submit (For Existing Active Facilities)
facilityForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const facId = document.getElementById("facilityId").value;
    const updatedName = document.getElementById("facName").value.trim();
    const updatedDistrict = document.getElementById("facDistrict").value.trim();
    const updatedPhone = document.getElementById("facPhone").value.trim();
    const updatedEmail = document.getElementById("facEmail").value.trim();
    const updatedStatus = document.getElementById("facStatus").value;

    try {
        const facDocRef = doc(db, "facilities", facId);
        await updateDoc(facDocRef, {
            facilityName: updatedName,
            "address.city": updatedDistrict,
            "contactInfo.phone": updatedPhone,
            "contactInfo.email": updatedEmail,
            status: updatedStatus,
            updatedAt: serverTimestamp()
        });

        showToast("Facility updated successfully!");
        closeModals();
        await fetchAllFacilityData();

    } catch (err) {
        console.error("Failed to update facility:", err);
        alert("Update error: " + err.message);
    }
});

// --------------------------------------------------------------------------
// 5. UTILITIES, MODAL CLOSE & LOGOUT
// --------------------------------------------------------------------------

function closeModals() {
    reviewModal.style.display = "none";
    reviewModal.setAttribute("aria-hidden", "true");
    facilityModal.style.display = "none";
    facilityModal.setAttribute("aria-hidden", "true");
    logoutModal.style.display = "none";
    logoutModal.setAttribute("aria-hidden", "true");
    selectedApplication = null;
}

document.querySelectorAll("[data-close-review], [data-close-edit], [data-close-logout]").forEach(btn => {
    btn.addEventListener("click", closeModals);
});

// Search & Filter Listeners
searchInput.addEventListener("input", renderTable);
statusFilter.addEventListener("change", renderTable);

// Toast Utility
function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3500);
}

// Logout Flow
const logoutBtn = document.getElementById("logoutBtn");
const logoutConfirm = document.getElementById("logoutConfirm");

if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        logoutModal.style.display = "flex";
        logoutModal.setAttribute("aria-hidden", "false");
    });
}

if (logoutConfirm) {
    logoutConfirm.addEventListener("click", async () => {
        try {
            await signOut(auth);
            localStorage.clear();
            window.location.href = "../pho/pho-login.html";
        } catch (err) {
            console.error("Logout failed:", err);
            window.location.href = "../pho/pho-login.html";
        }
    });
}

// Boot Controller
document.addEventListener("DOMContentLoaded", fetchAllFacilityData);