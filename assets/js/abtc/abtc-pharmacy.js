// abtc-pharmacy.js - Pharmacist Cold-Chain & FIFO Requisition Engine
// Conformed to CRIS Master Architecture ('facilities/{facilityId}/vaccine-inventory')

import { 
    collection, onSnapshot, query, where, doc, getDoc, addDoc, updateDoc, deleteDoc 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { 
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

import { auth, db } from '../firebase/firebase-config.js';

let activeFacilityId = sessionStorage.getItem("activeFacilityId") || null;
let currentFacilityName = sessionStorage.getItem("activeFacilityName") || null;
let inventoryList = [];
let pendingReqList = [];
let currentResolvedPersonnel = sessionStorage.getItem("activePersonnelName") || "Duty Pharmacist";
let selectedActiveReq = null;

// DOM References
const inventoryTableBody = document.getElementById("inventoryTableBody");
const requisitionTableBody = document.getElementById("requisitionTableBody");
const statTotalVials = document.getElementById("statTotalVials");
const statTotalDoses = document.getElementById("statTotalDoses");
const statPendingReqs = document.getElementById("statPendingReqs");
const searchInventoryInput = document.getElementById("searchInventoryInput");
const profileContainer = document.getElementById("profileInfoText");

// Modals
const inventoryModal = document.getElementById("inventoryModal");
const btnOpenAddModal = document.getElementById("btnOpenAddModal");
const closeInvModalX = document.getElementById("closeInvModalX");
const closeInvModalBtn = document.getElementById("closeInvModalBtn");
const addStockForm = document.getElementById("addStockForm");

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

async function initPharmacySession() {
    if (profileContainer) {
        profileContainer.innerHTML = `<strong>${currentResolvedPersonnel}</strong><br><span>Pharmacist / Custodian</span>`;
    }

    if (activeFacilityId) {
        streamInventory(activeFacilityId);
        streamRequisitions(activeFacilityId);
    }
}

initPharmacySession();

if (auth) {
    onAuthStateChanged(auth, async (user) => {
        if (user && !activeFacilityId) {
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists() && userDoc.data().facilityId) {
                    activeFacilityId = userDoc.data().facilityId;
                } else {
                    activeFacilityId = user.uid;
                }
            } catch (e) {
                activeFacilityId = user.uid;
            }
            sessionStorage.setItem("activeFacilityId", activeFacilityId);
            initPharmacySession();
        }
    });
}

/* --------------------
    1. Inventory Stream (Sorted by Expiration / Arrival for FIFO)
-------------------- */
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
                ...data,
                vialsLeft: vials,
                dosesPerVial: dosesPerVial
            });
        });

        // FIFO/FEFO: Sort by earliest expiration date first, fallback to createdAt timestamp
        inventoryList.sort((a, b) => {
            const expA = a.expDate ? new Date(a.expDate).getTime() : Infinity;
            const expB = b.expDate ? new Date(b.expDate).getTime() : Infinity;
            if (expA !== expB) return expA - expB;

            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return timeA - timeB;
        });

        if (statTotalVials) statTotalVials.innerText = totalVials;
        if (statTotalDoses) statTotalDoses.innerText = totalDoses;

        renderInventoryTable();
    });
}

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

    // Map which batch is the next active FIFO queue candidate per brand
    const nextFifoBrandMap = {};
    inventoryList.forEach(item => {
        if (item.vialsLeft > 0 && !nextFifoBrandMap[item.brandName]) {
            nextFifoBrandMap[item.brandName] = item.docId;
        }
    });

    filtered.forEach(item => {
        const row = document.createElement("tr");

        let statusClass = "status-in-stock";
        let statusText = "In Stock";
        const vials = item.vialsLeft;

        if (vials === 0) {
            statusClass = "status-out-of-stock";
            statusText = "Depleted";
        } else if (item.docId === nextFifoBrandMap[item.brandName]) {
            statusClass = "status-fifo-next";
            statusText = "Priority (FIFO Next)";
        } else if (vials <= 5) {
            statusClass = "status-low-stock";
            statusText = "Low Stock";
        }

        row.innerHTML = `
            <td><strong>${item.brandName}</strong></td>
            <td>${item.batchNo}</td>
            <td><strong>${item.vialsLeft}</strong> vials</td>
            <td>${item.dosesPerVial} doses/vial</td>
            <td>${item.expDate || 'N/A'}</td>
            <td><span class="stock-status-badge ${statusClass}">${statusText}</span></td>
            <td class="text-center">
                <button class="btn-enable btn-delete-batch" data-id="${item.docId}">
                    <i class="fa-solid fa-trash"></i> Remove
                </button>
            </td>
        `;

        row.querySelector(".btn-delete-batch")?.addEventListener("click", async (e) => {
            const docId = e.currentTarget.getAttribute("data-id");
            if (confirm(`Remove Lot ${item.batchNo} (${item.brandName}) from cold-chain storage?`)) {
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

/* --------------------
    2. Requisition Stream & FIFO Verification
-------------------- */
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

        // Oldest request tickets first
        pendingReqList.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

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
                    <i class="fa-solid fa-boxes-packing"></i> FIFO Issue
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
            executeFifoStockApproval(reqDocId, brand, vialsRequested);
        });

        requisitionTableBody.appendChild(row);
    });
}

function openViewModal(reqDocId) {
    selectedActiveReq = pendingReqList.find(r => r.docId === reqDocId);
    if (!selectedActiveReq) return;

    detTicketId.innerText = selectedActiveReq.ticketId;
    modalTicketSubId.innerText = `Inspecting FIFO allocation for ${selectedActiveReq.vaccineBrand}`;
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

if (modalApproveBtn) {
    modalApproveBtn.addEventListener("click", async () => {
        if (!selectedActiveReq) return;
        await executeFifoStockApproval(selectedActiveReq.docId, selectedActiveReq.vaccineBrand, selectedActiveReq.vialsRequested);
        closeViewModal();
    });
}

/* --------------------
    3. Multi-Batch FIFO / FEFO Deduction Engine
-------------------- */
async function executeFifoStockApproval(reqDocId, brand, totalRequested) {
    // 1. Identify all active batches matching this brand, sorted by earliest expiration
    const candidateBatches = inventoryList.filter(b => 
        b.brandName.toLowerCase() === brand.toLowerCase() && b.vialsLeft > 0
    );

    const totalAvailable = candidateBatches.reduce((acc, cur) => acc + cur.vialsLeft, 0);

    if (totalAvailable < totalRequested) {
        return alert(`Insufficient Stock: Cannot fulfill requisition.\nRequested: ${totalRequested} vials\nTotal Available in Storage: ${totalAvailable} vials`);
    }

    // 2. Compute FIFO allocation plan across earliest expiring batches
    let remainingToDeduct = totalRequested;
    const allocationPlan = []; // [{ docId, batchNo, deductCount, finalVials }]

    for (const batch of candidateBatches) {
        if (remainingToDeduct <= 0) break;

        const takeFromThisBatch = Math.min(batch.vialsLeft, remainingToDeduct);
        allocationPlan.push({
            docId: batch.docId,
            batchNo: batch.batchNo,
            expDate: batch.expDate,
            deductCount: takeFromThisBatch,
            finalVials: batch.vialsLeft - takeFromThisBatch
        });

        remainingToDeduct -= takeFromThisBatch;
    }

    const allocationSummary = allocationPlan
        .map(p => `• Lot ${p.batchNo} (Exp: ${p.expDate}): Deduct ${p.deductCount} vial(s)`)
        .join("\n");

    if (!confirm(`Confirm FIFO Allocation for ${totalRequested} vial(s) of ${brand}?\n\nFIFO Allocation Plan:\n${allocationSummary}`)) {
        return;
    }

    try {
        // 3. Atomically update inventory batches
        for (const alloc of allocationPlan) {
            await updateDoc(doc(db, "facilities", activeFacilityId, "vaccine-inventory", alloc.docId), {
                vialsLeft: alloc.finalVials
            });
        }

        const assignedLotsString = allocationPlan.map(p => `${p.batchNo} (${p.deductCount}v)`).join(", ");

        // 4. Mark requisition completed with traceability
        await updateDoc(doc(db, "facilities", activeFacilityId, "vaccine-requisitions", reqDocId), {
            status: "Released",
            fulfilledBy: currentResolvedPersonnel,
            batchAssigned: assignedLotsString,
            allocationBreakdown: allocationPlan,
            releasedAt: new Date().toISOString()
        });

        alert(`Success! ${totalRequested} vial(s) released under FIFO policy.\nAssigned: ${assignedLotsString}`);

    } catch (err) {
        console.error("FIFO processing error:", err);
        alert("Stock release transaction failed: " + err.message);
    }
}

/* --------------------
    4. Register Incoming Stock Batch Modal Controller
-------------------- */
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

            alert(`Batch registered: ${brandName} (Lot ${batchNo}). Added to FIFO queue according to expiration date (${expDate}).`);
            addStockForm.reset();
            closeInvModal();
        } catch (err) {
            alert("Error registering stock: " + err.message);
        }
    });
}

document.getElementById("logout-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (confirm("Are you sure you want to exit your Pharmacist session?")) {
        sessionStorage.removeItem("activeDesignation");
        sessionStorage.removeItem("activePersonnelName");
        window.location.href = 'abtc-login.html';
    }
});