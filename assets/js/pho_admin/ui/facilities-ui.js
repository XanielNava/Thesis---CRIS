/* ==========================================================================
   FACILITY MANAGEMENT — PHO ADMIN PAGE CONTROLLER (facilities-ui.js)
   ========================================================================== */

import { 
    fetchAllFacilitiesFromDb, 
    commissionFacilityInDb, 
    rejectApplicationInDb, 
    setFacilityStatusInDb, 
    logoutAdmin 
} from '../db/facilities-db.js';

(function () {
    'use strict';

    /* ======================================================================
       1. SIDEBAR & LOGOUT
       ====================================================================== */

    const SIDEBAR_KEY = 'sidebarCollapsed';
    const sidebar = document.getElementById('sidebar');
    const appLayout = document.getElementById('appLayout');
    const sidebarToggle = document.getElementById('sidebarToggle');
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
        sidebarToggle.addEventListener('click', function () {
            const collapsed = !sidebar.classList.contains('collapsed');
            applySidebarState(collapsed);
            storeSidebarState(collapsed);
        });
    }

    /* ======================================================================
       2. HELPERS & MODAL UTILITIES
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
       3. DATA STATE & RENDERING
       ====================================================================== */

    let facilities = [];
    let selectedApplication = null;

    const tableBody = document.getElementById("facilityTableBody");
    const searchInput = document.getElementById("facilitySearch");
    const statusFilter = document.getElementById("facilityStatusFilter");
    const emptyState = document.getElementById("facilityEmpty");

    const reviewModal = document.getElementById("reviewModal");
    const reviewModalBody = document.getElementById("reviewModalBody");
    const btnApproveApp = document.getElementById("btnApproveApp");
    const btnRejectApp = document.getElementById("btnRejectApp");

    const facilityModal = document.getElementById("facilityModal");
    const facilityForm = document.getElementById("facilityForm");

    async function loadTableData() {
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;">Loading facilities...</td></tr>`;
        }

        try {
            facilities = await fetchAllFacilitiesFromDb();
            renderTable();
        } catch (err) {
            console.error("Failed to load facilities:", err);
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Failed to load facilities: ${esc(err.message)}</td></tr>`;
            }
        }
    }

    function renderTable() {
        if (!Array.isArray(facilities)) facilities = [];

        const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const filter = statusFilter ? statusFilter.value : '';

        const rows = facilities.filter(fac => {
            const matchesQuery = !q ||
                fac.facilityName.toLowerCase().includes(q) ||
                fac.id.toLowerCase().includes(q) ||
                fac.municipality.toLowerCase().includes(q) ||
                fac.contactPerson.toLowerCase().includes(q);

            const matchesStatus = filter === "" || fac.status.toLowerCase() === filter.toLowerCase();
            return matchesQuery && matchesStatus;
        });

        if (!tableBody) return;

        if (rows.length === 0) {
            tableBody.innerHTML = "";
            if (emptyState) emptyState.classList.remove("hidden");
            return;
        }

        if (emptyState) emptyState.classList.add("hidden");
        tableBody.innerHTML = "";

        rows.forEach(fac => {
            const row = document.createElement("tr");
            const formattedDate = fac.submittedAt.toLocaleDateString('en-PH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            const isActive = fac.status === "Active";

            // If pending application -> static badge; if commissioned -> interactive dropdown
            const statusCellHtml = fac.isApplication && fac.status === "Pending"
                ? `<span class="status-badge status-pending">Pending</span>`
                : `
                    <select class="inline-select facility-status-dropdown" data-id="${esc(fac.id)}" aria-label="Status for ${esc(fac.facilityName)}">
                        <option value="Active" ${fac.status === 'Active' ? 'selected' : ''}>Active</option>
                        <option value="Inactive" ${fac.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
                        <option value="Suspended" ${fac.status === 'Suspended' ? 'selected' : ''}>Suspended</option>
                    </select>
                `;

           row.innerHTML = `
                <td><code>${esc(fac.id.substring(0, 10))}...</code></td>
                <td>
                    <strong>${esc(fac.facilityName)}</strong>
                    ${fac.acronym ? `<small style="display:block; color:#64748b;">${esc(fac.acronym)} &bull; ${esc(fac.facilityType)}</small>` : ''}
                </td>
                <td>${esc(fac.municipality)}, ${esc(fac.province)}</td>
                <td>
                    <strong>${esc(fac.contactPerson || 'Unassigned')}</strong>
                    <small style="display:block; color:#64748b;">${esc(fac.email || 'No email')}</small>
                </td>
                <td>${esc(formattedDate)}</td>
                <td>${statusCellHtml}</td>
                <td class="col-actions">
                    ${fac.isApplication && fac.status === "Pending" ? `
                        <button class="btn btn-sm btn-primary btn-review" data-id="${esc(fac.id)}">Review</button>
                    ` : `
                        <button class="btn btn-sm btn-ghost btn-inspect" data-id="${esc(fac.id)}">Details</button>
                        <button class="btn btn-sm ${isActive ? 'btn-warn' : 'btn-success'} btn-toggle-facility" 
                                data-id="${esc(fac.id)}" 
                                data-name="${esc(fac.facilityName)}" 
                                data-status="${esc(fac.status)}">
                            ${isActive ? 'Deactivate' : 'Activate'}
                        </button>
                    `}
                </td>
            `;

            tableBody.appendChild(row);
        });

        attachActionListeners();
    }

    /* ======================================================================
       4. ACTION LISTENERS & MODAL HANDLERS
       ====================================================================== */

    function attachActionListeners() {
        document.querySelectorAll(".btn-review").forEach(btn => {
            btn.onclick = () => openReviewModal(btn.getAttribute("data-id"));
        });

        document.querySelectorAll(".btn-inspect").forEach(btn => {
            btn.onclick = () => openInspectModal(btn.getAttribute("data-id"));
        });

        document.querySelectorAll(".btn-toggle-facility").forEach(btn => {
            btn.onclick = async () => {
                const id = btn.getAttribute("data-id");
                const name = btn.getAttribute("data-name");
                const currentStatus = btn.getAttribute("data-status");
                const nextStatus = currentStatus === "Active" ? "Inactive" : "Active";

                if (!confirm(`Are you sure you want to change "${name}" to ${nextStatus}?`)) {
                    return;
                }

                btn.disabled = true;
                try {
                    await setFacilityStatusInDb(id, name, currentStatus, nextStatus);
                    toast(`Facility "${name}" status changed to ${nextStatus}.`);
                    await loadTableData();
                } catch (err) {
                    console.error("Toggle error:", err);
                    alert("Status change failed: " + err.message);
                } finally {
                    btn.disabled = false;
                }
            };
        });
    }

    // Direct Status Dropdown Handler in Table
    document.addEventListener("change", async (e) => {
        if (!e.target.matches(".facility-status-dropdown")) return;

        const dropdown = e.target;
        const facId = dropdown.getAttribute("data-id");
        const nextStatus = dropdown.value;
        const fac = facilities.find(f => f.id === facId);
        const name = fac ? fac.facilityName : "Facility";
        const currentStatus = fac ? fac.status : "Active";

        dropdown.disabled = true;

        try {
            await setFacilityStatusInDb(facId, name, currentStatus, nextStatus);
            toast(`"${name}" status updated to ${nextStatus}.`);
            await loadTableData();
        } catch (err) {
            console.error("Dropdown status update error:", err);
            toast("Status update failed: " + err.message);
            dropdown.disabled = false;
        }
    });

    function openReviewModal(appId) {
        selectedApplication = facilities.find(f => f.id === appId);
        if (!selectedApplication || !reviewModal || !reviewModalBody) return;

        const raw = selectedApplication.raw;
        const reg = raw.regulatoryData || {};

        reviewModalBody.innerHTML = `
            <div class="review-facility-banner">
                <div class="banner-title">${esc(raw.facilityName)} ${raw.acronym ? `(${esc(raw.acronym)})` : ''}</div>
                <div class="banner-meta">
                    <span><strong>Type:</strong> ${esc(raw.facilityType || 'ABTC')}</span>
                    <span>&bull;</span>
                    <span><strong>Ownership:</strong> ${esc(reg.ownershipType || 'Not specified')}</span>
                </div>
                <div class="banner-sub">
                    <strong>Location:</strong> ${esc(raw.address?.street ? raw.address.street + ', ' : '')}${esc(raw.address?.barangay ? raw.address.barangay + ', ' : '')}${esc(raw.address?.city || '')}, ${esc(raw.address?.province || '')}
                </div>
            </div>

            <div class="review-section">
                <div class="review-section-header">Personnel &amp; Contact</div>
                <div class="review-grid">
                    <div class="review-item">
                        <span class="label">Head of Facility:</span>
                        <span class="value">${esc(raw.contactInfo?.contactPerson || 'N/A')} ${raw.contactInfo?.position ? `(${esc(raw.contactInfo.position)})` : ''}</span>
                    </div>
                    <div class="review-item">
                        <span class="label">Official Email:</span>
                        <span class="value">${esc(raw.contactInfo?.email || 'N/A')}</span>
                    </div>
                    <div class="review-item">
                        <span class="label">Contact Number:</span>
                        <span class="value">${esc(raw.contactInfo?.phone || 'N/A')}</span>
                    </div>
                </div>
            </div>

            <div class="review-section">
                <div class="review-section-header">Regulatory Compliance &amp; Verification</div>
                <div class="review-grid">
                    <div class="review-item">
                        <span class="label">DOH LTO / Accreditation:</span>
                        <span class="value"><code>${esc(reg.dohLto || 'N/A')}</code></span>
                    </div>
                    <div class="review-item">
                        <span class="label">Cold Chain Integrity:</span>
                        <span class="value">${reg.coldChainCompliant ? '<span class="tag-success">✅ Confirmed (2°C to 8°C Storage)</span>' : '<span class="tag-warning">⚠️ Not Declared</span>'}</span>
                    </div>
                </div>
            </div>
        `;

        openModal(reviewModal);
    }

  function openInspectModal(facId) {
        const fac = facilities.find(f => f.id === facId);
        if (!fac || !facilityModal) return;

        $('#facilityId').value = fac.id;
        $('#facName').value = fac.facilityName;
        
        // Populate the Owner / Head of Facility
        const ownerEl = $('#facOwner');
        if (ownerEl) {
            ownerEl.value = fac.contactPerson ? `${fac.contactPerson}${fac.position ? ' (' + fac.position + ')' : ''}` : 'N/A';
        }

        $('#facDistrict').value = fac.municipality;
        $('#facPhone').value = fac.phone;
        $('#facEmail').value = fac.email;
        $('#facStatus').value = fac.status;

        openModal(facilityModal);
    }

    /* ======================================================================
       5. FORM SUBMISSIONS
       ====================================================================== */

    if (btnApproveApp) {
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
                await commissionFacilityInDb(appId, raw);
                toast(`Facility "${raw.facilityName}" commissioned successfully!`);
                closeModal(reviewModal);
                await loadTableData();
            } catch (error) {
                console.error("Approval failed:", error);
                alert("Approval failed: " + error.message);
            } finally {
                btnApproveApp.disabled = false;
                btnApproveApp.innerText = "Approve & Commission";
            }
        });
    }

    if (btnRejectApp) {
        btnRejectApp.addEventListener("click", async () => {
            if (!selectedApplication) return;
            const raw = selectedApplication.raw;
            const appId = selectedApplication.id;

            const reason = prompt("Enter the reason for rejecting this facility application:");
            if (!reason) return;

            btnRejectApp.disabled = true;
            btnRejectApp.innerText = "Rejecting...";

            try {
                await rejectApplicationInDb(appId, raw.facilityName, reason);
                toast("Application has been rejected.");
                closeModal(reviewModal);
                await loadTableData();
            } catch (error) {
                console.error("Rejection error:", error);
                alert("Rejection failed: " + error.message);
            } finally {
                btnRejectApp.disabled = false;
                btnRejectApp.innerText = "Reject Application";
            }
        });
    }

    // Modal Status Save (Details are read-only; only status can be updated)
    if (facilityForm) {
        facilityForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const facId = $('#facilityId').value;
            const fac = facilities.find(f => f.id === facId);
            const nextStatus = $('#facStatus').value;

            if (!fac) return;

            const submitBtn = facilityForm.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;

            try {
                await setFacilityStatusInDb(facId, fac.facilityName, fac.status, nextStatus);
                toast("Facility status updated successfully!");
                closeModal(facilityModal);
                await loadTableData();
            } catch (err) {
                console.error("Status save error:", err);
                alert("Update failed: " + err.message);
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    /* ======================================================================
       6. EVENTS & MODAL CLOSE
       ====================================================================== */

    document.querySelectorAll("[data-close-review]").forEach(btn => btn.onclick = () => closeModal(reviewModal));
    document.querySelectorAll("[data-close-edit]").forEach(btn => btn.onclick = () => closeModal(facilityModal));
    document.querySelectorAll("[data-close-logout]").forEach(btn => btn.onclick = () => closeModal(logoutModal));

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => openModal(logoutModal));
    }

    if (logoutConfirm) {
        logoutConfirm.addEventListener("click", async () => {
            try {
                await logoutAdmin();
                localStorage.clear();
                window.location.href = "../pho/pho-login.html";
            } catch (err) {
                window.location.href = "../pho/pho-login.html";
            }
        });
    }

    if (searchInput) searchInput.addEventListener("input", renderTable);
    if (statusFilter) statusFilter.addEventListener("change", renderTable);

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeModal(reviewModal);
            closeModal(facilityModal);
            closeModal(logoutModal);
        }
    });

    // Boot
    applySidebarState(readSidebarState());
    loadTableData();
})();