/* ==========================================================================
   FACILITY MANAGEMENT — PHO ADMIN PAGE CONTROLLER (facilities-ui.js)
   Conformed to Grace Period Retention & Safe Deletion Lifecycle
   ========================================================================== */

import { 
    fetchAllFacilitiesFromDb, 
    commissionFacilityInDb, 
    rejectApplicationInDb, 
    setFacilityStatusInDb,
    deleteFacilityFromDb,
    DELETION_GRACE_PERIOD_DAYS,
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
       2. HELPERS & TOAST UTILITIES
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
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
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
       3. DELETE MODAL DOM INJECTION
       ====================================================================== */

    let facilityPendingDeletion = null;

    function ensureDeleteModalInDom() {
        if (document.getElementById("deleteFacilityModal")) return;

        const modalDiv = document.createElement("div");
        modalDiv.id = "deleteFacilityModal";
        modalDiv.style.cssText = "display: none; position: fixed; inset: 0; background: rgba(15, 23, 42, 0.7); z-index: 9999; align-items: center; justify-content: center; backdrop-filter: blur(4px);";
        modalDiv.innerHTML = `
            <div style="background: #ffffff; border-radius: 12px; max-width: 500px; width: 90%; padding: 24px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3); border-top: 5px solid #dc2626; font-family: inherit;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                    <div style="background: #fee2e2; color: #dc2626; width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                        ⚠️
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 18px; color: #0f172a;">Permanently Delete Facility</h3>
                        <small style="color: #64748b; font-size: 12px;">Irreversible administrative operation</small>
                    </div>
                </div>

                <div id="deleteModalNotice" style="margin-bottom: 14px; font-size: 13.5px; line-height: 1.5; color: #475569;">
                    <p style="margin: 0 0 8px 0;">
                        Are you sure you want to permanently delete <strong id="deleteTargetFacilityName" style="color: #dc2626;"></strong>?
                    </p>
                    <div style="background: #ecfdf5; border-left: 3px solid #10b981; padding: 8px 12px; border-radius: 4px; font-size: 12.5px; color: #065f46;">
                        <strong>✓ Patient Data Safety:</strong> All patient bite consultations and vaccination schedules remain preserved in the central registry for medical continuity.
                    </div>
                </div>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; margin-bottom: 18px;">
                    <label for="deleteConfirmationInput" style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 6px;">
                        Type <strong id="deleteExpectedText" style="color: #0f172a; text-decoration: underline;"></strong> to confirm:
                    </label>
                    <input type="text" id="deleteConfirmationInput" placeholder="Enter exact facility name" autocomplete="off"
                           style="width: 100%; box-sizing: border-box; padding: 9px 12px; border: 1.5px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; outline: none; transition: border-color 0.2s;">
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button type="button" id="btnCancelDeleteModal" style="padding: 8px 16px; border-radius: 6px; cursor: pointer; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; font-weight: 600; font-size: 13px;">
                        Cancel
                    </button>
                    <button type="button" id="btnConfirmDeleteFacility" disabled
                            style="padding: 8px 18px; border-radius: 6px; font-weight: 700; font-size: 13px; cursor: not-allowed; border: none; background: #cbd5e1; color: #ffffff; transition: all 0.2s ease;">
                        Permanently Delete
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modalDiv);

        const deleteInput = document.getElementById("deleteConfirmationInput");
        const btnConfirm = document.getElementById("btnConfirmDeleteFacility");
        const btnCancel = document.getElementById("btnCancelDeleteModal");

        deleteInput.addEventListener("input", () => {
            if (!facilityPendingDeletion) return;
            const typed = deleteInput.value.trim();
            const expected = facilityPendingDeletion.name.trim();

            if (typed === expected) {
                btnConfirm.disabled = false;
                btnConfirm.style.background = "#dc2626";
                btnConfirm.style.cursor = "pointer";
                deleteInput.style.borderColor = "#dc2626";
            } else {
                btnConfirm.disabled = true;
                btnConfirm.style.background = "#cbd5e1";
                btnConfirm.style.cursor = "not-allowed";
                deleteInput.style.borderColor = "#cbd5e1";
            }
        });

        btnCancel.addEventListener("click", closeDeleteVerificationModal);

        btnConfirm.addEventListener("click", async () => {
            if (!facilityPendingDeletion) return;
            const { id, name } = facilityPendingDeletion;

            btnConfirm.disabled = true;
            btnConfirm.textContent = "Purging...";

            try {
                await deleteFacilityFromDb(id, name);
                toast(`Facility "${name}" was permanently removed. Patient data remains archived.`);
                closeDeleteVerificationModal();
                await loadTableData();
            } catch (err) {
                console.error("Deletion error:", err);
                alert("Deletion Blocked: " + err.message);
            } finally {
                btnConfirm.disabled = false;
                btnConfirm.textContent = "Permanently Delete";
            }
        });
    }

    function openDeleteVerificationModal(facId, facName) {
        ensureDeleteModalInDom();
        facilityPendingDeletion = { id: facId, name: facName };

        const modal = document.getElementById("deleteFacilityModal");
        const targetNameEl = document.getElementById("deleteTargetFacilityName");
        const expectedEl = document.getElementById("deleteExpectedText");
        const inputEl = document.getElementById("deleteConfirmationInput");
        const btnConfirm = document.getElementById("btnConfirmDeleteFacility");

        targetNameEl.textContent = `"${facName}"`;
        expectedEl.textContent = facName;
        inputEl.value = "";
        btnConfirm.disabled = true;
        btnConfirm.style.background = "#cbd5e1";
        btnConfirm.style.cursor = "not-allowed";

        modal.style.display = "flex";
        inputEl.focus();
    }

    function closeDeleteVerificationModal() {
        const modal = document.getElementById("deleteFacilityModal");
        if (modal) modal.style.display = "none";
        facilityPendingDeletion = null;
    }

    /* ======================================================================
       4. DATA STATE & RENDERING
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

            // Calculate grace period cooldown
            let daysInactive = 0;
            let canDelete = false;
            let cooldownBadge = '';

            if (!isActive && fac.deactivatedAt) {
                const diffMs = Date.now() - fac.deactivatedAt.getTime();
                daysInactive = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                canDelete = daysInactive >= DELETION_GRACE_PERIOD_DAYS;

                if (!canDelete) {
                    const remaining = DELETION_GRACE_PERIOD_DAYS - daysInactive;
                    cooldownBadge = `<small style="display:block; color:#b45309; font-size:11px;"><i class="fa-solid fa-clock"></i> Retention: ${remaining}d left</small>`;
                } else {
                    cooldownBadge = `<small style="display:block; color:#dc2626; font-size:11px;"><i class="fa-solid fa-triangle-exclamation"></i> Eligible for purge</small>`;
                }
            }

            const statusCellHtml = fac.isApplication && fac.status === "Pending"
                ? `<span class="status-badge status-pending">Pending</span>`
                : `
                    <select class="inline-select facility-status-dropdown" data-id="${esc(fac.id)}" aria-label="Status for ${esc(fac.facilityName)}">
                        <option value="Active" ${fac.status === 'Active' ? 'selected' : ''}>Active</option>
                        <option value="Inactive" ${fac.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
                        <option value="Suspended" ${fac.status === 'Suspended' ? 'selected' : ''}>Suspended</option>
                    </select>
                    ${cooldownBadge}
                `;

            // Delete button is enabled only when non-active AND past grace period
            const deleteBtnHtml = fac.isApplication && fac.status === "Pending" ? '' : `
                <button class="btn btn-sm btn-delete-facility" 
                        data-id="${esc(fac.id)}" 
                        data-name="${esc(fac.facilityName)}"
                        data-can-delete="${canDelete}"
                        data-active="${isActive}"
                        data-days="${daysInactive}"
                        title="${isActive ? 'Deactivate facility first' : (!canDelete ? `Retention grace period active (${DELETION_GRACE_PERIOD_DAYS - daysInactive}d left)` : 'Permanently remove facility')}"
                        style="background-color: ${canDelete ? '#fee2e2' : '#f1f5f9'}; 
                               color: ${canDelete ? '#dc2626' : '#94a3b8'}; 
                               border: 1px solid ${canDelete ? '#fecaca' : '#e2e8f0'}; 
                               font-weight: 600; padding: 4px 8px; border-radius: 4px; 
                               cursor: ${canDelete ? 'pointer' : 'not-allowed'}; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-trash" style="font-size: 11px;"></i> Delete
                </button>
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
                <td class="col-actions" style="display: flex; gap: 6px; align-items: center; justify-content: flex-start;">
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
                        ${deleteBtnHtml}
                    `}
                </td>
            `;

            tableBody.appendChild(row);
        });

        attachActionListeners();
    }

    /* ======================================================================
       5. ACTION LISTENERS
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

                const confirmMsg = nextStatus === "Inactive"
                    ? `Deactivate "${name}"?\n• Access will be immediately locked for administrators and staff.\n• The ${DELETION_GRACE_PERIOD_DAYS}-day retention period will begin.\n• Patient records remain fully intact.`
                    : `Reactivate "${name}"?\n• Staff and admin login access will be immediately restored.`;

                if (!confirm(confirmMsg)) return;

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

        // 🗑️ Delete Button Click: Enforce Grace Period Checks
        document.querySelectorAll(".btn-delete-facility").forEach(btn => {
            btn.onclick = () => {
                const id = btn.getAttribute("data-id");
                const name = btn.getAttribute("data-name");
                const isActive = btn.getAttribute("data-active") === "true";
                const canDelete = btn.getAttribute("data-can-delete") === "true";
                const days = parseInt(btn.getAttribute("data-days") || "0", 10);

                if (isActive) {
                    alert(`Action Blocked: "${name}" is currently ACTIVE.\n\nTo safeguard epidemiological and medical records, an active facility must first be set to "Inactive" or "Suspended" to enter the ${DELETION_GRACE_PERIOD_DAYS}-day retention cooldown.`);
                    return;
                }

                if (!canDelete) {
                    const remaining = DELETION_GRACE_PERIOD_DAYS - days;
                    alert(`Retention Grace Period Active: "${name}" has only been inactive for ${days} day(s).\n\nUnder health compliance rules, permanent purge is locked for ${remaining} more day(s) to allow for clinical audits and patient transfers.`);
                    return;
                }

                openDeleteVerificationModal(id, name);
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
        const lat = raw.coordinates?.lat ?? raw.location?.latitude ?? 'N/A';
        const lng = raw.coordinates?.lng ?? raw.location?.longitude ?? 'N/A';

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
                <div class="banner-sub" style="margin-top: 5px; color: #1e40af; font-size: 12.5px;">
                    <strong>Spatial Coordinates:</strong> ${lat !== 'N/A' ? `Lat: ${lat}, Lng: ${lng}` : '<span style="color:#dc2626;">Missing GPS/Centroid</span>'}
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
       6. FORM SUBMISSIONS
       ====================================================================== */

    if (btnApproveApp) {
        btnApproveApp.addEventListener("click", async () => {
            if (!selectedApplication) return;
            const raw = selectedApplication.raw;
            const appId = selectedApplication.id;

            if (!confirm(`Confirm approval for "${raw.facilityName}"? This will commission the facility, activate its admin account, and persist its spatial coordinates.`)) {
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
       7. EVENTS & MODAL CLOSE
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
            closeDeleteVerificationModal();
        }
    });

    // Boot
    applySidebarState(readSidebarState());
    loadTableData();
})();