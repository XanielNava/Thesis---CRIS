// abtc-inventory.js - Read-Only Nurse Inventory & Requisition Generator
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { 
    getFirestore, collection, onSnapshot, query, where, doc, getDoc, addDoc 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

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

let activeFacilityId = null;
let inventoryList = [];
let currentResolvedPersonnel = "Duty Personnel";

// Standard Master Vaccine Register
const STANDARD_VACCINES = [
    "Verorab",
    "Rabipur",
    "Speeda",
    "Abhayrab",
    "RIG (Rabies Immunoglobulin)"
];

// DOM References
const inventoryTableBody = document.getElementById("inventoryTableBody");
const statTotalVials = document.getElementById("statTotalVials");
const statTotalDoses = document.getElementById("statTotalDoses");
const statLowStockCount = document.getElementById("statLowStockCount");
const searchInventoryInput = document.getElementById("searchInventoryInput");
const profileContainer = document.getElementById("profileInfoText");

// Modal References
const requisitionModal = document.getElementById("requisitionModal");
const btnRequestStock = document.getElementById("btnRequestStock");
const closeReqModalX = document.getElementById("closeReqModalX");
const closeReqModalBtn = document.getElementById("closeReqModalBtn");
const requisitionForm = document.getElementById("requisitionForm");
const reqVaccineBrand = document.getElementById("reqVaccineBrand");

// ----------------------------------------------------
// 1. Dynamic Dropdown Stock Indicator Population
// ----------------------------------------------------
function populateRequisitionDropdown() {
    if (!reqVaccineBrand) return;

    reqVaccineBrand.innerHTML = `<option value="" disabled selected>-- Select Vaccine --</option>`;

    // Calculate total vials available per brand across all active batches
    const brandStockMap = {};
    STANDARD_VACCINES.forEach(v => brandStockMap[v] = 0);

    inventoryList.forEach(item => {
        const brand = item.brandName;
        const vials = Number(item.vialsLeft) || 0;
        
        if (brandStockMap[brand] !== undefined) {
            brandStockMap[brand] += vials;
        } else {
            brandStockMap[brand] = vials;
        }
    });

    // Generate options with dynamic stock badges and status flags
    STANDARD_VACCINES.forEach(brand => {
        const count = brandStockMap[brand] || 0;
        const option = document.createElement("option");
        option.value = brand;

        if (count === 0) {
            // OUT OF STOCK: Grayed out and disabled from selection
            option.textContent = `${brand} (0 vials — OUT OF STOCK)`;
            option.disabled = true;
            option.className = "opt-out-of-stock";
        } else if (count <= 5) {
            // LOW STOCK: Highlighted warning text
            option.textContent = `${brand} (${count} vial[s] left — LOW STOCK)`;
            option.className = "opt-low-stock";
        } else {
            // IN STOCK: Standard availability count
            option.textContent = `${brand} (${count} vials available)`;
            option.className = "opt-in-stock";
        }

        reqVaccineBrand.appendChild(option);
    });
}

// ----------------------------------------------------
// 2. Modal Show / Hide Handlers
// ----------------------------------------------------
function openReqModal() {
    populateRequisitionDropdown();
    if (requisitionModal) requisitionModal.classList.add("active");
}

function closeReqModal() {
    if (requisitionModal) requisitionModal.classList.remove("active");
}

if (btnRequestStock) btnRequestStock.addEventListener("click", openReqModal);
if (closeReqModalX) closeReqModalX.addEventListener("click", closeReqModal);
if (closeReqModalBtn) closeReqModalBtn.addEventListener("click", closeReqModal);

if (requisitionModal) {
    requisitionModal.addEventListener("click", (e) => {
        if (e.target === requisitionModal) closeReqModal();
    });
}

// ----------------------------------------------------
// 3. Session Observer & Active Staff Resolution
// ----------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (user) {
        activeFacilityId = user.uid;
        
        try {
            const userRole = sessionStorage.getItem("activeDesignation") || localStorage.getItem("activeDesignation") || "Nurse";
            const activePersonnel = sessionStorage.getItem("activePersonnelName") || localStorage.getItem("activePersonnelName");

            const facilitySnapshot = await getDoc(doc(db, "facilities", user.uid));
            if (facilitySnapshot.exists()) {
                const facilityData = facilitySnapshot.data();

                let activeStaffMember = activePersonnel || (userRole === "Owner" ? facilityData.contactInfo?.contactPerson : "Attending Personnel");
                const displayRoleLabel = userRole === "Owner" ? "Administrator / Owner" : "Personnel";

                currentResolvedPersonnel = activeStaffMember;

                if (profileContainer) {
                    profileContainer.innerHTML = `<strong>${activeStaffMember}</strong><br><span>${displayRoleLabel}</span>`;
                }
            }
        } catch (e) {
            console.error("Inventory session error:", e);
        }

        streamInventory(user.uid);
    } else {
        window.location.href = "abtc-login.html";
    }
});

// ----------------------------------------------------
// 4. Stream Inventory Records (Read-Only)
// ----------------------------------------------------
function streamInventory(facilityId) {
    const q = query(collection(db, "vaccine-inventory"), where("facilityId", "==", facilityId));

    onSnapshot(q, (snapshot) => {
        inventoryList = [];
        let totalVials = 0;
        let totalDoses = 0;
        let lowStockCounter = 0;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const vials = Number(data.vialsLeft) || 0;
            const dosesPerVial = Number(data.dosesPerVial) || 1;

            totalVials += vials;
            totalDoses += (vials * dosesPerVial);
            if (vials <= 5 && vials > 0) lowStockCounter++;

            inventoryList.push({
                docId: docSnap.id,
                ...data
            });
        });

        if (statTotalVials) statTotalVials.innerText = totalVials;
        if (statTotalDoses) statTotalDoses.innerText = totalDoses;
        if (statLowStockCount) statLowStockCount.innerText = lowStockCounter;

        renderInventoryTable();

        // 🌟 Shortcut Auto-Open & Pre-fill Handler from Calendar
        if (sessionStorage.getItem("autoOpenRequisition") === "true") {
            sessionStorage.removeItem("autoOpenRequisition");

            const targetPatient = sessionStorage.getItem("reqTargetPatient");
            const remarksText = sessionStorage.getItem("reqRemarks");

            if (targetPatient && document.getElementById("reqPatientName")) {
                document.getElementById("reqPatientName").value = targetPatient;
            }
            if (remarksText && document.getElementById("reqRemarks")) {
                document.getElementById("reqRemarks").value = remarksText;
            }

            sessionStorage.removeItem("reqTargetPatient");
            sessionStorage.removeItem("reqRemarks");

            setTimeout(() => {
                openReqModal();
            }, 250);
        }
    });
}

// ----------------------------------------------------
// 5. Render Table
// ----------------------------------------------------
function renderInventoryTable() {
    if (!inventoryTableBody) return;
    inventoryTableBody.innerHTML = "";

    const queryText = searchInventoryInput ? searchInventoryInput.value.trim().toLowerCase() : "";
    const filtered = inventoryList.filter(item => 
        (item.brandName || "").toLowerCase().includes(queryText) ||
        (item.batchNo || "").toLowerCase().includes(queryText)
    );

    if (filtered.length === 0) {
        inventoryTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#888; padding:30px;">No stock records found for this clinic.</td></tr>`;
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
            <td style="text-align: center;">
                ${vials > 0 ? 
                    `<span style="color:#2b8a3e; font-weight:bold; font-size:12px;"><i class="fa-solid fa-circle-check"></i> Ready for Duty</span>` : 
                    `<span style="color:#e03131; font-weight:bold; font-size:12px;"><i class="fa-solid fa-circle-xmark"></i> Depleted</span>`
                }
            </td>
        `;

        inventoryTableBody.appendChild(row);
    });
}

if (searchInventoryInput) searchInventoryInput.addEventListener("input", renderInventoryTable);

// ----------------------------------------------------
// 6. Form Requisition Submission & Printable Ticket Generator
// ----------------------------------------------------
if (requisitionForm) {
    requisitionForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const brand = reqVaccineBrand ? reqVaccineBrand.value : document.getElementById("reqVaccineBrand").value;
        const qty = document.getElementById("reqVialQty").value;
        const patient = document.getElementById("reqPatientName").value.trim() || "General Clinic Stock";
        const remarks = document.getElementById("reqRemarks").value.trim() || "Routine PEP Administration";
        
        const activeStaff = currentResolvedPersonnel;
        const reqTicketId = "REQ-" + Date.now().toString().slice(-6);

        if (!brand) return alert("Please select a valid vaccine brand.");

        try {
            await addDoc(collection(db, "vaccine-requisitions"), {
                ticketId: reqTicketId,
                facilityId: activeFacilityId,
                requestedBy: activeStaff,
                vaccineBrand: brand,
                vialsRequested: Number(qty),
                patientName: patient,
                remarks: remarks,
                status: "Pending Release",
                timestamp: new Date().toISOString()
            });

            closeReqModal();

            // Print Preview Ticket Window
            const printWindow = window.open('', '_blank', 'width=600,height=700');
            printWindow.document.write(`
                <html>
                <head>
                    <title>Vial Requisition Ticket - ${reqTicketId}</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
                        .ticket-card { border: 2px dashed #0d233a; padding: 20px; border-radius: 8px; max-width: 450px; margin: auto; }
                        .header { text-align: center; border-bottom: 2px solid #0d233a; padding-bottom: 10px; margin-bottom: 15px; }
                        .header h2 { margin: 0; font-size: 18px; color: #0d233a; }
                        .header p { margin: 2px 0 0 0; font-size: 11px; color: #64748b; }
                        .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
                        .label { font-weight: bold; color: #475569; }
                        .value { font-weight: bold; color: #0f172a; }
                        .box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; margin: 12px 0; }
                        .pharmacy-section { border-top: 1px solid #cbd5e1; margin-top: 15px; padding-top: 10px; font-size: 12px; }
                        .sig-line { margin-top: 35px; border-top: 1px solid #000; width: 60%; text-align: center; font-size: 11px; }
                    </style>
                </head>
                <body>
                    <div class="ticket-card">
                        <div class="header">
                            <h2>CRIS | VIAL REQUISITION TICKET</h2>
                            <p>Community-Centric Rabies Intelligence System — ABTC Module</p>
                        </div>
                        <div class="row"><span class="label">Ticket No:</span><span class="value">${reqTicketId}</span></div>
                        <div class="row"><span class="label">Date & Time:</span><span class="value">${new Date().toLocaleString()}</span></div>
                        <div class="row"><span class="label">Requested By:</span><span class="value">${activeStaff}</span></div>
                        <div class="row"><span class="label">Target Patient:</span><span class="value">${patient}</span></div>
                        
                        <div class="box">
                            <div class="row"><span class="label">Vaccine Item:</span><span class="value">${brand}</span></div>
                            <div class="row"><span class="label">Quantity Needed:</span><span class="value">${qty} Vial(s)</span></div>
                            <div class="row"><span class="label">Remarks:</span><span>${remarks}</span></div>
                        </div>

                        <div class="pharmacy-section">
                            <strong>PHARMACY RELEASE VERIFICATION (OFFICIAL USE ONLY)</strong>
                            <p style="margin: 6px 0;">[ ] Approved & Released &nbsp;&nbsp;&nbsp;&nbsp; [ ] Unavailable</p>
                            <p style="margin: 6px 0;">Lot / Batch No. Released: _______________________</p>
                            <div class="sig-line">Pharmacist Signature & Date</div>
                        </div>
                    </div>
                    <script>
                        window.onload = function() { window.print(); window.close(); };
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();

        } catch (err) {
            alert("Error submitting requisition: " + err.message);
        }
    });
}

// Logout
document.getElementById("logout-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (confirm("Are you sure you want to exit your session?")) {
        sessionStorage.removeItem("activeDesignation");
        sessionStorage.removeItem("activePersonnelName");
        window.location.href = 'abtc-profiles.html';
    }
});