// abtc-pharmacy.js - Pharmacist Cold-Chain & Requisition Engine (Optimized Pipeline)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { 
    getFirestore, collection, onSnapshot, query, where, doc, getDoc, addDoc, updateDoc, deleteDoc, connectFirestoreEmulator 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

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

// 🧪 CONNECT TO LOCAL EMULATOR
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');

let activeFacilityId = null;
let inventoryList = [];
let pendingReqList = [];
let currentResolvedPersonnel = "Duty Pharmacist";
let selectedActiveReq = null; // Stores currently inspected ticket

// DOM References
const inventoryTableBody = document.getElementById("inventoryTableBody");
const requisitionTableBody = document.getElementById("requisitionTableBody");
const statTotalVials = document.getElementById("statTotalVials");
const statTotalDoses = document.getElementById("statTotalDoses");
const statPendingReqs = document.getElementById("statPendingReqs");
const searchInventoryInput = document.getElementById("searchInventoryInput");
const profileContainer = document.getElementById("profileInfoText");

// Modal References
const inventoryModal = document.getElementById("inventoryModal");
const btnOpenAddModal = document.getElementById("btnOpenAddModal");
const closeInvModalX = document.getElementById("closeInvModalX");
const closeInvModalBtn = document.getElementById("closeInvModalBtn");
const addStockForm = document.getElementById("addStockForm");

// View Details Modal References
const viewReqModal = document.getElementById("viewReqModal");
const closeViewReqX = document.getElementById("closeViewReqX");
const closeViewReqBtn = document.getElementById("closeViewReqBtn");
const modalApproveBtn = document.getElementById("modalApproveBtn");

const detTicketId = document.getElementById("detTicketId");
const detTimestamp = document.getElementById("detTimestamp");
const detRequestedBy = document.getElementById("detRequestedBy");
const detPatientName = document.getElementById("detPatientName");
const detItemQty = document.getElementById("detItemQty");
const detRemarks = document.getElementById("detRemarks");
const modalTicketSubId = document.getElementById("modalTicketSubId");

// ----------------------------------------------------
// 1. Session & Access Authentication Observer
// ----------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (user) {
        activeFacilityId = user.uid;
        
        try {
            const userRole = sessionStorage.getItem("activeDesignation") || localStorage.getItem("activeDesignation") || "Pharmacist";
            let activePersonnel = sessionStorage.getItem("activePersonnelName") || localStorage.getItem("activePersonnelName");

            if (!activePersonnel) {
                const facilitySnapshot = await getDoc(doc(db, "facilities", user.uid));
                if (facilitySnapshot.exists()) {
                    const facilityData = facilitySnapshot.data();
                    activePersonnel = userRole === "Owner" ? facilityData.contactInfo?.contactPerson : "Attending Pharmacist";
                    sessionStorage.setItem("activePersonnelName", activePersonnel);
                }
            }

            const activeStaffMember = activePersonnel || "Attending Pharmacist";
            currentResolvedPersonnel = activeStaffMember;

            if (profileContainer) {
                profileContainer.innerHTML = `<strong>${activeStaffMember}</strong><br><span>Pharmacist / Custodian</span>`;
            }
        } catch (e) {
            console.error("Pharmacist session resolution error:", e);
        }

        streamInventory(user.uid);
        streamRequisitions(user.uid);
    } else {
        window.location.href = "abtc-login.html";
    }
});

// ----------------------------------------------------
// 2. Real-Time Inventory Subcollection Stream
// ----------------------------------------------------
function streamInventory(facilityId) {
    const invColRef = collection(db, "facilities", facilityId, "vaccine-inventory");

    onSnapshot(invColRef, (snapshot) => {
        inventoryList = [];
        let totalVials = 0;
        let totalDoses = 0;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const vials = Number(data.vialsLeft) || 0;
            const dosesPerVial = Number(data.dosesPerVial) || 1;

            totalVials += vials;
            totalDoses += (vials * dosesPerVial);

            inventoryList.push({
                docId: docSnap.id,
                ...data
            });
        });

        if (statTotalVials) statTotalVials.innerText = totalVials;
        if (statTotalDoses) statTotalDoses.innerText = totalDoses;

        renderInventoryTable();
    });
}

// Render Table
function renderInventoryTable() {
    if (!inventoryTableBody) return;
    inventoryTableBody.innerHTML = "";

    const queryText = searchInventoryInput ? searchInventoryInput.value.trim().toLowerCase() : "";
    const filtered = inventoryList.filter(item => 
        (item.brandName || "").toLowerCase().includes(queryText) ||
        (item.batchNo || "").toLowerCase().includes(queryText)
    );

    if (filtered.length === 0) {
        inventoryTableBody.innerHTML = `<tr><td colspan="7" class="table-loading-notice">No cold-chain stock records found.</td></tr>`;
        return;
    }

    filtered.forEach(item => {
        const row = document.createElement("tr");

        let statusClass = "status-in-stock";
        let statusText = "In Stock";
        const vials = Number(item.vialsLeft) || 0;

        if (vials === 0) {
            statusClass = "status-out-of-stock";
            statusText = "Out of Stock";
        } else if (vials <= 5) {
            statusClass = "status-low-stock";
            statusText = "Low Stock";
        }

        row.innerHTML = `
            <td><strong>${item.brandName}</strong></td>
            <td>${item.batchNo}</td>
            <td><strong>${item.vialsLeft}</strong> vials</td>
            <td>${item.dosesPerVial} doses/vial</td>
            <td>${item.expDate}</td>
            <td><span class="stock-status-badge ${statusClass}">${statusText}</span></td>
            <td class="text-center">
                <button class="btn-enable btn-delete-batch" data-id="${item.docId}">
                    <i class="fa-solid fa-trash"></i> Remove
                </button>
            </td>
        `;

        row.querySelector(".btn-delete-batch")?.addEventListener("click", async (e) => {
            const docId = e.currentTarget.getAttribute("data-id");
            if (confirm("Are you sure you want to delete this batch record from cold-chain storage?")) {
                try {
                    await deleteDoc(doc(db, "facilities", activeFacilityId, "vaccine-inventory", docId));
                } catch (err) {
                    alert("Delete failed: " + err.message);
                }
            }
        });

        inventoryTableBody.appendChild(row);
    });
}

if (searchInventoryInput) searchInventoryInput.addEventListener("input", renderInventoryTable);

// ----------------------------------------------------
// 3. Real-Time Requisitions Subcollection Stream & Fulfillment
// ----------------------------------------------------
function streamRequisitions(facilityId) {
    const reqColRef = collection(db, "facilities", facilityId, "vaccine-requisitions");
    const q = query(reqColRef, where("status", "==", "Pending Release"));

    onSnapshot(q, (snapshot) => {
        pendingReqList = [];
        snapshot.forEach(docSnap => {
            pendingReqList.push({
                docId: docSnap.id,
                ...docSnap.data()
            });
        });

        if (statPendingReqs) statPendingReqs.innerText = pendingReqList.length;
        renderRequisitionTable();
    });
}

function renderRequisitionTable() {
    if (!requisitionTableBody) return;
    requisitionTableBody.innerHTML = "";

    if (pendingReqList.length === 0) {
        requisitionTableBody.innerHTML = `<tr><td colspan="7" class="table-empty-notice">No pending nurse requisition tickets.</td></tr>`;
        return;
    }

    pendingReqList.forEach(req => {
        const row = document.createElement("tr");
        row.className = "clickable-req-row";
        const formattedDate = new Date(req.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        row.innerHTML = `
            <td><strong>${req.ticketId}</strong></td>
            <td>${req.requestedBy}</td>
            <td>${req.patientName}</td>
            <td><strong>${req.vaccineBrand}</strong> (${req.vialsRequested} Vial[s])</td>
            <td><span class="remarks-subtext">${req.remarks}</span></td>
            <td>${formattedDate}</td>
            <td class="text-center">
                <button class="btn-enable btn-approve-req" data-id="${req.docId}" data-brand="${req.vaccineBrand}" data-vials="${req.vialsRequested}">
                    <i class="fa-solid fa-check-double"></i> Approve & Issue
                </button>
            </td>
        `;

        row.addEventListener("click", (e) => {
            if (e.target.closest(".btn-approve-req")) return;
            openViewModal(req.docId);
        });

        row.querySelector(".btn-approve-req")?.addEventListener("click", async (e) => {
            const reqDocId = e.currentTarget.getAttribute("data-id");
            const brand = e.currentTarget.getAttribute("data-brand");
            const vialsRequested = Number(e.currentTarget.getAttribute("data-vials"));
            executeStockApproval(reqDocId, brand, vialsRequested);
        });

        requisitionTableBody.appendChild(row);
    });
}

// Open Pop-Up Modal and Populate Details
function openViewModal(reqDocId) {
    selectedActiveReq = pendingReqList.find(r => r.docId === reqDocId);
    if (!selectedActiveReq) return;

    detTicketId.innerText = selectedActiveReq.ticketId;
    modalTicketSubId.innerText = `Inspecting ticket request for ${selectedActiveReq.vaccineBrand}`;
    detTimestamp.innerText = selectedActiveReq.timestamp ? new Date(selectedActiveReq.timestamp).toLocaleString() : "N/A";
    detRequestedBy.innerText = selectedActiveReq.requestedBy;
    detPatientName.innerText = selectedActiveReq.patientName;
    detItemQty.innerText = `${selectedActiveReq.vaccineBrand} — ${selectedActiveReq.vialsRequested} Vial(s)`;
    detRemarks.innerText = selectedActiveReq.remarks || "None";

    if (viewReqModal) viewReqModal.classList.add("active");
}

function closeViewModal() {
    if (viewReqModal) viewReqModal.classList.remove("active");
    selectedActiveReq = null;
}

if (closeViewReqX) closeViewReqX.addEventListener("click", closeViewModal);
if (closeViewReqBtn) closeViewReqBtn.addEventListener("click", closeViewModal);
if (viewReqModal) {
    viewReqModal.addEventListener("click", (e) => {
        if (e.target === viewReqModal) closeViewModal();
    });
}

// Approve button inside the pop-up modal
if (modalApproveBtn) {
    modalApproveBtn.addEventListener("click", async () => {
        if (!selectedActiveReq) return;
        await executeStockApproval(selectedActiveReq.docId, selectedActiveReq.vaccineBrand, selectedActiveReq.vialsRequested);
        closeViewModal();
    });
}

// Core Approval & Deduction Logic
async function executeStockApproval(reqDocId, brand, vialsRequested) {
    const targetBatch = inventoryList.find(b => b.brandName === brand && Number(b.vialsLeft) >= vialsRequested);

    if (!targetBatch) {
        return alert(`Insufficient Stock: Cannot approve request. No active batch for ${brand} with at least ${vialsRequested} vial(s) remaining.`);
    }

    if (confirm(`Approve release of ${vialsRequested} vial(s) of ${brand} from Lot ${targetBatch.batchNo}?`)) {
        try {
            // Deduct stock from vaccine-inventory subcollection
            await updateDoc(doc(db, "facilities", activeFacilityId, "vaccine-inventory", targetBatch.docId), {
                vialsLeft: Number(targetBatch.vialsLeft) - vialsRequested
            });

            // Update ticket status directly in the vaccine-requisitions subcollection
            await updateDoc(doc(db, "facilities", activeFacilityId, "vaccine-requisitions", reqDocId), {
                status: "Released",
                fulfilledBy: currentResolvedPersonnel,
                batchAssigned: targetBatch.batchNo,
                releasedAt: new Date().toISOString()
            });

            alert(`Stock Issued Successfully! Assigned Lot: ${targetBatch.batchNo}`);
        } catch (err) {
            alert("Failed to process stock release: " + err.message);
        }
    }
}

// ----------------------------------------------------
// 4. Register Incoming Stock Batch Modal Controller
// ----------------------------------------------------
function closeInvModal() {
    if (inventoryModal) inventoryModal.classList.remove("active");
}

if (btnOpenAddModal) btnOpenAddModal.addEventListener("click", () => inventoryModal.classList.add("active"));
if (closeInvModalX) closeInvModalX.addEventListener("click", closeInvModal);
if (closeInvModalBtn) closeInvModalBtn.addEventListener("click", closeInvModal);

if (inventoryModal) {
    inventoryModal.addEventListener("click", (e) => {
        if (e.target === inventoryModal) closeInvModal();
    });
}

if (addStockForm) {
    addStockForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!activeFacilityId) return alert("Unauthorized session.");

        const brandName = document.getElementById("invBrandName").value;
        const batchNo = document.getElementById("invBatchNo").value.trim();
        const expDate = document.getElementById("invExpDate").value;
        const vialsLeft = Number(document.getElementById("invVialsCount").value);
        const dosesPerVial = Number(document.getElementById("invDosesPerVial").value);

        try {
            await addDoc(collection(db, "facilities", activeFacilityId, "vaccine-inventory"), {
                brandName: brandName,
                batchNo: batchNo,
                expDate: expDate,
                vialsLeft: vialsLeft,
                dosesPerVial: dosesPerVial,
                registeredBy: currentResolvedPersonnel,
                createdAt: new Date().toISOString()
            });

            alert("Success: New vaccine stock batch registered in cold-chain storage!");
            addStockForm.reset();
            closeInvModal();
        } catch (err) {
            alert("Error registering stock: " + err.message);
        }
    });
}

// ----------------------------------------------------
// 5. Session Termination (Logout)
// ----------------------------------------------------
document.getElementById("logout-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (confirm("Are you sure you want to exit your Pharmacist session?")) {
        sessionStorage.removeItem("activeDesignation");
        sessionStorage.removeItem("activePersonnelName");
        window.location.href = 'abtc-login.html';
    }
});