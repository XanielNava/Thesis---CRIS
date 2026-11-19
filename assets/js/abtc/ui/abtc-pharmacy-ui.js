/* ==========================================================================
   CRIS ABTC MODULE — PHARMACY UI CONTROLLER (abtc-pharmacy-ui.js)
   Handles Summary Metrics, Requisition Queue, FIFO Stock Table & Modals,
   and Embedded Facility Calendar & Admin Announcements Widget.
   ========================================================================== */

import {
    resolvePharmacyFacilitySession,
    subscribeToPharmacyInventory,
    subscribeToPharmacyRequisitions,
    subscribeToPharmacyAnnouncements,
    registerIncomingBatch,
    removeInventoryBatch,
    commitFifoRequisitionRelease,
    signOutPharmacySession
} from '../db/abtc-pharmacy-db.js';

const $ = (id) => document.getElementById(id);

let activeFacilityId = sessionStorage.getItem('activeFacilityId') || null;
const currentResolvedPersonnel =
    sessionStorage.getItem('activePersonnelName') || 'Duty Pharmacist';

let inventoryList = [];
let pendingReqList = [];
let selectedActiveReq = null;

let unsubInventory = null;
let unsubRequisitions = null;
let unsubAnnouncements = null;

// DOM References
const inventoryTableBody = $('inventoryTableBody');
const requisitionTableBody = $('requisitionTableBody');
const statTotalVials = $('statTotalVials');
const statTotalDoses = $('statTotalDoses');
const statPendingReqs = $('statPendingReqs');
const searchInventoryInput = $('searchInventoryInput');
const profileContainer = $('profileInfoText');

// Modals
const inventoryModal = $('inventoryModal');
const btnOpenAddModal = $('btnOpenAddModal');
const closeInvModalX = $('closeInvModalX');
const closeInvModalBtn = $('closeInvModalBtn');
const addStockForm = $('addStockForm');

const viewReqModal = $('viewReqModal');
const closeViewReqX = $('closeViewReqX');
const closeViewReqBtn = $('closeViewReqBtn');
const modalApproveBtn = $('modalApproveBtn');

// Calendar State
const now = new Date();
const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
const todayISODate = localDate.toISOString().split('T')[0];

let viewYear = now.getFullYear();
let viewMonth = now.getMonth();
let selectedDateISO = todayISODate;
let announcementsByDate = {};

const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));

function toISODateString(year, monthZeroIndexed, day) {
    const m = String(monthZeroIndexed + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
}

function formatLongDate(isoStr) {
    const [y, m, d] = isoStr.split('-').map(Number);
    if (!y || !m || !d) return isoStr;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
}

/* ==========================================================================
   1. SESSION & REAL-TIME STREAMS
   ========================================================================== */

function initPharmacySession(facilityId) {
    activeFacilityId = facilityId;

    if (profileContainer) {
        profileContainer.innerHTML = `<strong>${esc(currentResolvedPersonnel)}</strong><br><span>Pharmacist / Custodian</span>`;
    }

    if (!activeFacilityId) return;

    if (unsubInventory) unsubInventory();
    unsubInventory = subscribeToPharmacyInventory(
        activeFacilityId,
        ({ inventoryList: list, totalVials, totalDoses }) => {
            inventoryList = list;
            if (statTotalVials) statTotalVials.innerText = totalVials;
            if (statTotalDoses) statTotalDoses.innerText = totalDoses;
            renderInventoryTable();
        }
    );

    if (unsubRequisitions) unsubRequisitions();
    unsubRequisitions = subscribeToPharmacyRequisitions(activeFacilityId, (list) => {
        pendingReqList = list;
        if (statPendingReqs) statPendingReqs.innerText = pendingReqList.length;
        renderRequisitionTable();
    });

    if (unsubAnnouncements) unsubAnnouncements();
    unsubAnnouncements = subscribeToPharmacyAnnouncements(activeFacilityId, (byDateMap) => {
        announcementsByDate = byDateMap;
        renderPharmacyCalendar();
        renderSelectedDateAnnouncements();
    });
}

/* ==========================================================================
   2. INVENTORY & REQUISITION TABLES
   ========================================================================== */

function renderInventoryTable() {
    if (!inventoryTableBody) return;
    inventoryTableBody.innerHTML = '';

    const queryText = searchInventoryInput ? searchInventoryInput.value.trim().toLowerCase() : '';
    const filtered = inventoryList.filter(
        (item) =>
            (item.brandName || '').toLowerCase().includes(queryText) ||
            (item.batchNo || '').toLowerCase().includes(queryText)
    );

    if (filtered.length === 0) {
        inventoryTableBody.innerHTML = `<tr><td colspan="7" class="table-loading-notice">No cold-chain stock records found.</td></tr>`;
        return;
    }

    const nextFifoBrandMap = {};
    inventoryList.forEach((item) => {
        if (item.vialsLeft > 0 && !nextFifoBrandMap[item.brandName]) {
            nextFifoBrandMap[item.brandName] = item.docId;
        }
    });

    filtered.forEach((item) => {
        const row = document.createElement('tr');

        let statusClass = 'status-in-stock';
        let statusText = 'In Stock';
        const vials = item.vialsLeft;

        if (vials === 0) {
            statusClass = 'status-out-of-stock';
            statusText = 'Depleted';
        } else if (item.docId === nextFifoBrandMap[item.brandName]) {
            statusClass = 'status-fifo-next';
            statusText = 'Priority (FIFO Next)';
        } else if (vials <= 5) {
            statusClass = 'status-low-stock';
            statusText = 'Low Stock';
        }

        row.innerHTML = `
            <td><strong>${esc(item.brandName)}</strong></td>
            <td>${esc(item.batchNo)}</td>
            <td><strong>${vials}</strong> vials</td>
            <td>${item.dosesPerVial} doses/vial</td>
            <td>${esc(item.expDate || 'N/A')}</td>
            <td><span class="stock-status-badge ${statusClass}">${statusText}</span></td>
            <td class="text-center">
                <button class="btn-enable btn-delete-batch" data-id="${esc(item.docId)}">
                    <i class="fa-solid fa-trash"></i> Remove
                </button>
            </td>
        `;

        row.querySelector('.btn-delete-batch')?.addEventListener('click', async (e) => {
            const docId = e.currentTarget.getAttribute('data-id');
            if (confirm(`Remove Lot ${item.batchNo} (${item.brandName}) from cold-chain storage?`)) {
                try {
                    await removeInventoryBatch(activeFacilityId, docId);
                } catch (err) {
                    alert('Delete failed: ' + err.message);
                }
            }
        });

        inventoryTableBody.appendChild(row);
    });
}

searchInventoryInput?.addEventListener('input', renderInventoryTable);

function renderRequisitionTable() {
    if (!requisitionTableBody) return;
    requisitionTableBody.innerHTML = '';

    if (pendingReqList.length === 0) {
        requisitionTableBody.innerHTML = `<tr><td colspan="7" class="table-empty-notice">No pending nurse requisition tickets.</td></tr>`;
        return;
    }

    pendingReqList.forEach((req) => {
        const row = document.createElement('tr');
        row.className = 'clickable-req-row';
        const formattedDate = new Date(req.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        row.innerHTML = `
            <td><strong>${esc(req.ticketId)}</strong></td>
            <td>${esc(req.requestedBy)}</td>
            <td>${esc(req.patientName)}</td>
            <td><strong>${esc(req.vaccineBrand)}</strong> (${req.vialsRequested} Vial[s])</td>
            <td><span class="remarks-subtext">${esc(req.remarks)}</span></td>
            <td>${esc(formattedDate)}</td>
            <td class="text-center">
                <button class="btn-enable btn-approve-req" data-id="${esc(req.docId)}" data-brand="${esc(req.vaccineBrand)}" data-vials="${req.vialsRequested}">
                    <i class="fa-solid fa-boxes-packing"></i> FIFO Issue
                </button>
            </td>
        `;

        row.addEventListener('click', (e) => {
            if (e.target.closest('.btn-approve-req')) return;
            openViewModal(req.docId);
        });

        row.querySelector('.btn-approve-req')?.addEventListener('click', (e) => {
            const reqDocId = e.currentTarget.getAttribute('data-id');
            const brand = e.currentTarget.getAttribute('data-brand');
            const vialsRequested = Number(e.currentTarget.getAttribute('data-vials'));
            executeFifoStockApproval(reqDocId, brand, vialsRequested);
        });

        requisitionTableBody.appendChild(row);
    });
}

/* ==========================================================================
   3. REQUISITION DETAILS MODAL & FIFO ALLOCATION
   ========================================================================== */

function openViewModal(reqDocId) {
    selectedActiveReq = pendingReqList.find((r) => r.docId === reqDocId);
    if (!selectedActiveReq) return;

    $('detTicketId').innerText = selectedActiveReq.ticketId;
    $('modalTicketSubId').innerText = `Inspecting FIFO allocation for ${selectedActiveReq.vaccineBrand}`;
    $('detTimestamp').innerText = selectedActiveReq.timestamp
        ? new Date(selectedActiveReq.timestamp).toLocaleString()
        : 'N/A';
    $('detRequestedBy').innerText = selectedActiveReq.requestedBy;
    $('detPatientName').innerText = selectedActiveReq.patientName;
    $('detItemQty').innerText = `${selectedActiveReq.vaccineBrand} — ${selectedActiveReq.vialsRequested} Vial(s)`;
    $('detRemarks').innerText = selectedActiveReq.remarks || 'None';

    viewReqModal?.classList.add('active');
}

function closeViewModal() {
    viewReqModal?.classList.remove('active');
    selectedActiveReq = null;
}

closeViewReqX?.addEventListener('click', closeViewModal);
closeViewReqBtn?.addEventListener('click', closeViewModal);
viewReqModal?.addEventListener('click', (e) => {
    if (e.target === viewReqModal) closeViewModal();
});

modalApproveBtn?.addEventListener('click', async () => {
    if (!selectedActiveReq) return;
    await executeFifoStockApproval(
        selectedActiveReq.docId,
        selectedActiveReq.vaccineBrand,
        selectedActiveReq.vialsRequested
    );
    closeViewModal();
});

async function executeFifoStockApproval(reqDocId, brand, totalRequested) {
    const candidateBatches = inventoryList.filter(
        (b) => b.brandName.toLowerCase() === brand.toLowerCase() && b.vialsLeft > 0
    );

    const totalAvailable = candidateBatches.reduce((acc, cur) => acc + cur.vialsLeft, 0);

    if (totalAvailable < totalRequested) {
        return alert(
            `Insufficient Stock: Cannot fulfill requisition.\nRequested: ${totalRequested} vials\nTotal Available in Storage: ${totalAvailable} vials`
        );
    }

    let remainingToDeduct = totalRequested;
    const allocationPlan = [];

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
        .map((p) => `• Lot ${p.batchNo} (Exp: ${p.expDate}): Deduct ${p.deductCount} vial(s)`)
        .join('\n');

    if (
        !confirm(
            `Confirm FIFO Allocation for ${totalRequested} vial(s) of ${brand}?\n\nFIFO Allocation Plan:\n${allocationSummary}`
        )
    ) {
        return;
    }

    try {
        const assignedLotsString = await commitFifoRequisitionRelease({
            facilityId: activeFacilityId,
            reqDocId,
            allocationPlan,
            fulfilledBy: currentResolvedPersonnel
        });

        alert(
            `Success! ${totalRequested} vial(s) released under FIFO policy.\nAssigned: ${assignedLotsString}`
        );
    } catch (err) {
        console.error('FIFO processing error:', err);
        alert('Stock release transaction failed: ' + err.message);
    }
}

/* ==========================================================================
   4. REGISTER INCOMING STOCK MODAL
   ========================================================================== */

function closeInvModal() {
    inventoryModal?.classList.remove('active');
}

btnOpenAddModal?.addEventListener('click', () => inventoryModal?.classList.add('active'));
closeInvModalX?.addEventListener('click', closeInvModal);
closeInvModalBtn?.addEventListener('click', closeInvModal);

inventoryModal?.addEventListener('click', (e) => {
    if (e.target === inventoryModal) closeInvModal();
});

addStockForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!activeFacilityId) return alert('Unauthorized session.');

    const brandName = $('invBrandName').value;
    const batchNo = $('invBatchNo').value.trim();
    const expDate = $('invExpDate').value;
    const vialsLeft = Number($('invVialsCount').value);
    const dosesPerVial = Number($('invDosesPerVial').value);

    try {
        await registerIncomingBatch(activeFacilityId, {
            brandName,
            batchNo,
            expDate,
            vialsLeft,
            dosesPerVial,
            registeredBy: currentResolvedPersonnel,
            createdAt: new Date().toISOString()
        });

        alert(
            `Batch registered: ${brandName} (Lot ${batchNo}). Added to FIFO queue according to expiration date (${expDate}).`
        );
        addStockForm.reset();
        closeInvModal();
    } catch (err) {
        alert('Error registering stock: ' + err.message);
    }
});

/* ==========================================================================
   5. EMBEDDED FACILITY CALENDAR & ADMIN ANNOUNCEMENTS WIDGET
   ========================================================================== */

function renderPharmacyCalendar() {
    const monthLabelEl = $('pharmCalMonthLabel');
    const daysGridEl = $('pharmCalDaysGrid');
    if (!monthLabelEl || !daysGridEl) return;

    const monthDate = new Date(viewYear, viewMonth, 1);
    monthLabelEl.textContent = monthDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });

    const firstWeekday = monthDate.getDay();
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();

    let cellsHtml = '';
    for (let i = 0; i < firstWeekday; i++) {
        cellsHtml += `<span class="pharm-cal-empty"></span>`;
    }

    for (let day = 1; day <= totalDays; day++) {
        const iso = toISODateString(viewYear, viewMonth, day);
        const isToday = iso === todayISODate;
        const isSelected = iso === selectedDateISO;
        const hasAnnouncement =
            Array.isArray(announcementsByDate[iso]) && announcementsByDate[iso].length > 0;

        const classes = [
            'pharm-cal-day',
            isToday ? 'today' : '',
            isSelected ? 'selected' : '',
            hasAnnouncement ? 'has-note' : ''
        ]
            .filter(Boolean)
            .join(' ');

        cellsHtml += `<button type="button" class="${classes}" data-date="${iso}">${day}</button>`;
    }

    daysGridEl.innerHTML = cellsHtml;
}

function renderSelectedDateAnnouncements() {
    const dateLabelEl = $('pharmSelectedDateLabel');
    const listEl = $('pharmDateAnnouncementsList');
    if (!dateLabelEl || !listEl) return;

    dateLabelEl.textContent = formatLongDate(selectedDateISO);

    const items = announcementsByDate[selectedDateISO] || [];
    if (items.length === 0) {
        listEl.innerHTML = `
            <div class="pharm-notice-item empty-notice">
                <p>No announcements or reminders posted for this date.</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = items
        .map(
            (note) => `
            <div class="pharm-notice-item">
                <strong><i class="fa-solid fa-bullhorn"></i> ${esc(note.createdBy)}</strong>
                <p>${esc(note.message)}</p>
            </div>
        `
        )
        .join('');
}

function wireCalendarControls() {
    $('pharmCalPrevBtn')?.addEventListener('click', () => {
        viewMonth--;
        if (viewMonth < 0) {
            viewMonth = 11;
            viewYear--;
        }
        renderPharmacyCalendar();
    });

    $('pharmCalNextBtn')?.addEventListener('click', () => {
        viewMonth++;
        if (viewMonth > 11) {
            viewMonth = 0;
            viewYear++;
        }
        renderPharmacyCalendar();
    });

    $('pharmCalDaysGrid')?.addEventListener('click', (e) => {
        const dayBtn = e.target.closest('button[data-date]');
        if (!dayBtn) return;
        selectedDateISO = dayBtn.dataset.date;
        renderPharmacyCalendar();
        renderSelectedDateAnnouncements();
    });
}

/* ==========================================================================
   6. LOGOUT & BOOTSTRAP
   ========================================================================== */

$('logout-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (confirm('Are you sure you want to exit your Pharmacist session?')) {
        try {
            await signOutPharmacySession();
        } catch (err) {
            console.warn('Sign-out skipped:', err);
        }
        sessionStorage.removeItem('activeDesignation');
        sessionStorage.removeItem('activePersonnelName');
        window.location.href = 'abtc-login.html';
    }
});

wireCalendarControls();
renderPharmacyCalendar();
renderSelectedDateAnnouncements();

resolvePharmacyFacilitySession((facilityId) => {
    initPharmacySession(facilityId);
});