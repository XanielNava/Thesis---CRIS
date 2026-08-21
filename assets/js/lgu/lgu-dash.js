/* ==========================================================================
   CRIS LGU MODULE - DASHBOARD CONTROLLER (lgu-dash.js)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    initTableFilters();
    initRowActions();
    initExportCSV();
    initLogout();
});

/* ==========================================================================
   1. REAL-TIME SEARCH & STATUS FILTERING
   ========================================================================== */
function initTableFilters() {
    const searchInput = document.getElementById("intakeSearchInput");
    const statusSelect = document.getElementById("statusFilterSelect");
    const tableBody = document.getElementById("lguIntakeTableBody");

    if (!tableBody) return;

    function filterTable() {
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : "";
        const selectedStatus = statusSelect ? statusSelect.value.toLowerCase().trim() : "";
        const rows = tableBody.querySelectorAll("tr");

        rows.forEach(row => {
            const textContent = row.textContent.toLowerCase();
            const badgeElement = row.querySelector(".badge-lgu");
            const badgeText = badgeElement ? badgeElement.textContent.toLowerCase() : "";

            const matchesSearch = searchTerm === "" || textContent.includes(searchTerm);
            const matchesStatus = selectedStatus === "" || badgeText.includes(selectedStatus);

            if (matchesSearch && matchesStatus) {
                row.style.display = "";
            } else {
                row.style.display = "none";
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", filterTable);
    }
    if (statusSelect) {
        statusSelect.addEventListener("change", filterTable);
    }
}

/* ==========================================================================
   2. DYNAMIC INTAKE TABLE ROW ACTIONS (VERIFY, FLAG, DETAILS)
   ========================================================================== */
function initRowActions() {
    const tableBody = document.getElementById("lguIntakeTableBody");
    if (!tableBody) return;

    tableBody.addEventListener("click", (event) => {
        const target = event.target.closest("button");
        if (!target) return;

        const row = target.closest("tr");
        if (!row) return;

        const reportId = row.cells[0]?.textContent.trim() || "Report";
        const statusCell = row.cells[4];
        const actionCell = row.cells[5];

        // VERIFY ACTION
        if (target.classList.contains("btn-lgu-verify")) {
            if (confirm(`Verify incident report ${reportId}?`)) {
                if (statusCell) {
                    statusCell.innerHTML = `<span class="badge-lgu badge-verified-lgu"><i class="fa-solid fa-circle-check"></i> Verified</span>`;
                }
                if (actionCell) {
                    actionCell.innerHTML = `
                        <div class="action-group-btn">
                            <button class="btn-lgu-action btn-lgu-view"><i class="fa-solid fa-eye"></i> Details</button>
                        </div>
                    `;
                }
                updatePendingCount(-1);
            }
        }

        // FLAG ACTION
        if (target.classList.contains("btn-lgu-flag")) {
            if (confirm(`Flag ${reportId} as High-Risk Threat?`)) {
                if (statusCell) {
                    statusCell.innerHTML = `<span class="badge-lgu badge-flagged-risk"><i class="fa-solid fa-triangle-exclamation"></i> Flagged Risk</span>`;
                }
                if (actionCell) {
                    actionCell.innerHTML = `
                        <div class="action-group-btn">
                            <button class="btn-lgu-action btn-lgu-view"><i class="fa-solid fa-eye"></i> Details</button>
                        </div>
                    `;
                }
                updatePendingCount(-1);
            }
        }

        // VIEW DETAILS ACTION
        if (target.classList.contains("btn-lgu-view")) {
            const brgy = row.cells[1]?.textContent.trim();
            const biteType = row.cells[2]?.textContent.trim();
            alert(`--- INCIDENT REPORT DETAILS ---\n\nID: ${reportId}\nJurisdiction: ${brgy}\nType: ${biteType}\nStatus: ${statusCell?.textContent.trim()}`);
        }
    });
}

// Helper to decrement pending intake counter dynamically
function updatePendingCount(delta) {
    const pendingCounter = document.getElementById("pendingIntakeCount");
    if (!pendingCounter) return;

    let currentVal = parseInt(pendingCounter.textContent, 10) || 0;
    currentVal = Math.max(0, currentVal + delta);
    pendingCounter.textContent = currentVal < 10 ? `0${currentVal}` : currentVal;
}

/* ==========================================================================
   3. INTAKE LOG CSV EXPORT
   ========================================================================== */
function initExportCSV() {
    const exportBtn = document.getElementById("exportIntakeLogBtn");
    if (!exportBtn) return;

    exportBtn.addEventListener("click", () => {
        const table = document.querySelector(".data-table");
        if (!table) return;

        let csv = [];
        const rows = table.querySelectorAll("tr");

        rows.forEach(row => {
            if (row.style.display === "none") return;

            let rowData = [];
            const cols = row.querySelectorAll("th, td");

            cols.forEach((col, idx) => {
                if (idx !== 5) { // Omit action column
                    let text = col.innerText.replace(/\n/g, " ").trim();
                    text = `"${text.replace(/"/g, '""')}"`;
                    rowData.push(text);
                }
            });

            if (rowData.length > 0) {
                csv.push(rowData.join(","));
            }
        });

        const csvContent = "data:text/csv;charset=utf-8," + csv.join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `LGU_Intake_Log_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

/* ==========================================================================
   4. LOGOUT SESSION HANDLING
   ========================================================================== */
function initLogout() {
    const logoutBtn = document.getElementById("logout-btn");
    if (!logoutBtn) return;

    logoutBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to log out of the LGU Command Center?")) {
            window.location.href = "../src/lgu-login.html";
        }
    });
}