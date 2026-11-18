/* ==========================================================================
   CRIS PHO MODULE — ANIMAL BITE CASES UI CONTROLLER (pho-animal-bite-cases-ui.js)
   Handles Provincial Ledger Rendering, Facility Roll-Up Aggregation across
   Year/Month Filters, Pagination, Excel Export, Print, and Logout Modal.
   ========================================================================== */

import {
    loadFacilitiesRegistry,
    fetchLegacyProvincialRows,
    subscribeToLiveProvincialCases,
    signOutPhoSession
} from '../db/pho-abc-db.js';

const rowsPerPage = 40;
let currentPage = 1;
let facilitiesMap = new Map();
let legacyCases = [];
let liveCases = [];
let aggregatedFacilityRows = [];
let availableYears = new Set();
let unsubscribeLive = null;

const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
];

const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));

/* ==========================================================================
   1. INITIALIZATION & LIVE STREAM BINDING
   ========================================================================== */

async function initProvincialLedger() {
    const tbody = document.getElementById('casesTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="24">
                    <div style="padding: 35px; text-align: center; color: #7E8B9B;">
                        <i class="fa-solid fa-circle-notch fa-spin fa-2x" style="color: #EA6113; margin-bottom: 12px;"></i>
                        <p style="font-weight: 700; color: #412110; margin-bottom: 4px;">Loading Provincial Case Ledger...</p>
                        <span style="font-size: 12px;">Synchronizing live ABTC bite case records</span>
                    </div>
                </td>
            </tr>
        `;
    }

    facilitiesMap = await loadFacilitiesRegistry();
    legacyCases = await fetchLegacyProvincialRows(facilitiesMap);

    if (unsubscribeLive) unsubscribeLive();
    unsubscribeLive = subscribeToLiveProvincialCases(
        facilitiesMap,
        (liveRows) => {
            liveCases = liveRows;
            rebuildYearsAndFilters();
        },
        () => {
            liveCases = [];
            rebuildYearsAndFilters();
        }
    );
}

/* ==========================================================================
   2. YEAR/MONTH FILTERS & PER-FACILITY ROLL-UP
   ========================================================================== */

function rebuildYearsAndFilters() {
    const yearSelect = document.getElementById('yearSelectFilter');
    const prevSelectedYear = yearSelect ? yearSelect.value : 'All';

    availableYears.clear();
    [...legacyCases, ...liveCases].forEach((row) => {
        if (row.year) availableYears.add(Number(row.year));
    });

    if (yearSelect) {
        const sortedYears = Array.from(availableYears).sort((a, b) => b - a);
        yearSelect.innerHTML = `<option value="All">All Surveillance Years</option>`;
        sortedYears.forEach((yr) => {
            const opt = document.createElement('option');
            opt.value = String(yr);
            opt.textContent = String(yr);
            yearSelect.appendChild(opt);
        });

        if (
            prevSelectedYear !== 'All' &&
            sortedYears.includes(Number(prevSelectedYear))
        ) {
            yearSelect.value = prevSelectedYear;
        }
    }

    applyFilters();
}

function applyFilters() {
    const searchQuery = (document.getElementById('caseSearch')?.value || '')
        .toLowerCase()
        .trim();
    const selectedYear = document.getElementById('yearSelectFilter')?.value || 'All';
    const selectedMonth = document.getElementById('monthSelectFilter')?.value || 'All';

    const combinedRaw = [...legacyCases, ...liveCases];

    const matchingSlices = combinedRaw.filter((c) => {
        if (selectedYear !== 'All' && String(c.year) !== String(selectedYear)) {
            return false;
        }
        if (
            selectedMonth !== 'All' &&
            (c.month === null ||
                c.month === undefined ||
                String(c.month) !== String(selectedMonth))
        ) {
            return false;
        }
        if (searchQuery) {
            const name = String(c.abtc || '').toLowerCase();
            const yr = String(c.year || '');
            if (!name.includes(searchQuery) && !yr.includes(searchQuery)) {
                return false;
            }
        }
        return true;
    });

    // Roll up monthly slices into one clean row per ABTC / Health Facility
    const byFacility = new Map();
    matchingSlices.forEach((slice) => {
        const key = String(slice.abtc || slice.facilityId || 'Unassigned').trim();
        if (!byFacility.has(key)) {
            byFacility.set(key, {
                abtc: key,
                maleCases: 0,
                femaleCases: 0,
                ageLt15: 0,
                ageGt15: 0,
                bitingDog: 0,
                bitingCat: 0,
                bitingOthers: 0,
                humanCat1: 0,
                humanCat2: 0,
                humanCatNew: 0,
                humanCatBooster: 0,
                hr: 0,
                petTcv: 0,
                petHrig: 0,
                petErig: 0,
                total: 0,
                remarksCompII: 0,
                remarksCompIII: 0,
                remarksIncompleteII: 0,
                remarksIncompleteIII: 0,
                remarksNoneII: 0,
                remarksNoneIII: 0,
                rep: 0
            });
        }

        const target = byFacility.get(key);
        target.maleCases += Number(slice.maleCases || 0);
        target.femaleCases += Number(slice.femaleCases || 0);
        target.ageLt15 += Number(slice.ageLt15 || 0);
        target.ageGt15 += Number(slice.ageGt15 || 0);
        target.bitingDog += Number(slice.bitingDog || 0);
        target.bitingCat += Number(slice.bitingCat || 0);
        target.bitingOthers += Number(slice.bitingOthers || 0);
        target.humanCat1 += Number(slice.humanCat1 || 0);
        target.humanCat2 += Number(slice.humanCat2 || 0);
        target.humanCatNew += Number(slice.humanCatNew || 0);
        target.humanCatBooster += Number(slice.humanCatBooster || 0);
        target.hr += Number(slice.hr || 0);
        target.petTcv += Number(slice.petTcv || 0);
        target.petHrig += Number(slice.petHrig || 0);
        target.petErig += Number(slice.petErig || 0);
        target.total += Number(slice.total || 0);
        target.remarksCompII += Number(slice.remarksCompII || 0);
        target.remarksCompIII += Number(slice.remarksCompIII || 0);
        target.remarksIncompleteII += Number(slice.remarksIncompleteII || 0);
        target.remarksIncompleteIII += Number(slice.remarksIncompleteIII || 0);
        target.remarksNoneII += Number(slice.remarksNoneII || 0);
        target.remarksNoneIII += Number(slice.remarksNoneIII || 0);
        target.rep += Number(slice.rep || 0);
    });

    aggregatedFacilityRows = Array.from(byFacility.values()).sort((a, b) =>
        a.abtc.localeCompare(b.abtc)
    );

    currentPage = 1;
    renderTable();
}

/* ==========================================================================
   3. TABLE RENDERING & PAGINATION
   ========================================================================== */

function formatCell(val, isAlert = false) {
    const num = Number(val || 0);
    if (num === 0) {
        return `<span class="val-zero">0</span>`;
    }
    if (isAlert && num > 0) {
        return `<span class="val-alert">${num.toLocaleString()}</span>`;
    }
    return `<span class="val-nonzero">${num.toLocaleString()}</span>`;
}

function renderTable() {
    const tbody = document.getElementById('casesTableBody');
    const countInfo = document.getElementById('recordCountInfo');
    if (!tbody) return;

    const totalRecords = aggregatedFacilityRows.length;
    const totalPages = Math.ceil(totalRecords / rowsPerPage);
    const selectedYear = document.getElementById('yearSelectFilter')?.value || 'All';
    const selectedMonth = document.getElementById('monthSelectFilter')?.value || 'All';

    const periodLabel =
        selectedMonth !== 'All'
            ? `${MONTH_NAMES[Number(selectedMonth)]} ${selectedYear === 'All' ? '(All Years)' : selectedYear}`
            : selectedYear;

    if (countInfo) {
        countInfo.textContent = `Showing ${totalRecords} reporting ABTC facilities / records for ${periodLabel}`;
    }

    if (totalRecords === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="24" style="text-align:center; padding: 35px; color: #64748b;">
                    <i class="fa-solid fa-folder-open" style="font-size:26px; opacity:0.4; margin-bottom: 8px;"></i>
                    <p style="font-weight: 700; color: #412110;">No matching bite records found</p>
                    <span style="font-size: 12px;">Try adjusting your search query, year, or month filter</span>
                </td>
            </tr>
        `;
        createPagination(0);
        return;
    }

    if (currentPage > totalPages) {
        currentPage = Math.max(1, totalPages);
    }

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const records = aggregatedFacilityRows.slice(start, end);

    const tableRows = records.map(
        (caseData) => `
            <tr>
                <td class="sticky-col"><strong>${esc(caseData.abtc || 'N/A')}</strong></td>
                <td>${formatCell(caseData.maleCases)}</td>
                <td>${formatCell(caseData.femaleCases)}</td>
                <td>${formatCell(caseData.ageLt15)}</td>
                <td>${formatCell(caseData.ageGt15)}</td>
                <td>${formatCell(caseData.bitingDog)}</td>
                <td>${formatCell(caseData.bitingCat)}</td>
                <td>${formatCell(caseData.bitingOthers)}</td>
                <td>${formatCell(caseData.humanCat1)}</td>
                <td>${formatCell(caseData.humanCat2)}</td>
                <td>${formatCell(caseData.humanCatNew)}</td>
                <td>${formatCell(caseData.humanCatBooster)}</td>
                <td>${formatCell(caseData.hr, true)}</td>
                <td>${formatCell(caseData.petTcv)}</td>
                <td>${formatCell(caseData.petHrig)}</td>
                <td>${formatCell(caseData.petErig)}</td>
                <td><strong>${formatCell(caseData.total)}</strong></td>
                <td>${formatCell(caseData.remarksCompII)}</td>
                <td>${formatCell(caseData.remarksCompIII)}</td>
                <td>${formatCell(caseData.remarksIncompleteII)}</td>
                <td>${formatCell(caseData.remarksIncompleteIII)}</td>
                <td>${formatCell(caseData.remarksNoneII)}</td>
                <td>${formatCell(caseData.remarksNoneIII)}</td>
                <td>${formatCell(caseData.rep)}</td>
            </tr>
        `
    );

    const totals = {
        male: 0,
        female: 0,
        ageLt15: 0,
        ageGt15: 0,
        dog: 0,
        cat: 0,
        others: 0,
        cat1: 0,
        cat2: 0,
        catNew: 0,
        catBooster: 0,
        hr: 0,
        tcv: 0,
        hrig: 0,
        erig: 0,
        total: 0,
        compII: 0,
        compIII: 0,
        incII: 0,
        incIII: 0,
        noneII: 0,
        noneIII: 0,
        rep: 0
    };

    aggregatedFacilityRows.forEach((c) => {
        totals.male += Number(c.maleCases || 0);
        totals.female += Number(c.femaleCases || 0);
        totals.ageLt15 += Number(c.ageLt15 || 0);
        totals.ageGt15 += Number(c.ageGt15 || 0);
        totals.dog += Number(c.bitingDog || 0);
        totals.cat += Number(c.bitingCat || 0);
        totals.others += Number(c.bitingOthers || 0);
        totals.cat1 += Number(c.humanCat1 || 0);
        totals.cat2 += Number(c.humanCat2 || 0);
        totals.catNew += Number(c.humanCatNew || 0);
        totals.catBooster += Number(c.humanCatBooster || 0);
        totals.hr += Number(c.hr || 0);
        totals.tcv += Number(c.petTcv || 0);
        totals.hrig += Number(c.petHrig || 0);
        totals.erig += Number(c.petErig || 0);
        totals.total += Number(c.total || 0);
        totals.compII += Number(c.remarksCompII || 0);
        totals.compIII += Number(c.remarksCompIII || 0);
        totals.incII += Number(c.remarksIncompleteII || 0);
        totals.incIII += Number(c.remarksIncompleteIII || 0);
        totals.noneII += Number(c.remarksNoneII || 0);
        totals.noneIII += Number(c.remarksNoneIII || 0);
        totals.rep += Number(c.rep || 0);
    });

    tableRows.push(`
        <tr class="total-row">
            <td class="sticky-col">PROVINCIAL TOTAL</td>
            <td>${totals.male.toLocaleString()}</td>
            <td>${totals.female.toLocaleString()}</td>
            <td>${totals.ageLt15.toLocaleString()}</td>
            <td>${totals.ageGt15.toLocaleString()}</td>
            <td>${totals.dog.toLocaleString()}</td>
            <td>${totals.cat.toLocaleString()}</td>
            <td>${totals.others.toLocaleString()}</td>
            <td>${totals.cat1.toLocaleString()}</td>
            <td>${totals.cat2.toLocaleString()}</td>
            <td>${totals.catNew.toLocaleString()}</td>
            <td>${totals.catBooster.toLocaleString()}</td>
            <td class="${totals.hr > 0 ? 'text-danger' : ''}">${totals.hr.toLocaleString()}</td>
            <td>${totals.tcv.toLocaleString()}</td>
            <td>${totals.hrig.toLocaleString()}</td>
            <td>${totals.erig.toLocaleString()}</td>
            <td>${totals.total.toLocaleString()}</td>
            <td>${totals.compII.toLocaleString()}</td>
            <td>${totals.compIII.toLocaleString()}</td>
            <td>${totals.incII.toLocaleString()}</td>
            <td>${totals.incIII.toLocaleString()}</td>
            <td>${totals.noneII.toLocaleString()}</td>
            <td>${totals.noneIII.toLocaleString()}</td>
            <td>${totals.rep.toLocaleString()}</td>
        </tr>
    `);

    tbody.innerHTML = tableRows.join('\n');
    createPagination(totalPages);
}

function createPagination(totalPages) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;

    pagination.innerHTML = '';
    if (totalPages <= 1) return;

    const prev = document.createElement('button');
    prev.innerHTML = `<i class="fa-solid fa-angle-left"></i> Prev`;
    prev.disabled = currentPage === 1;
    prev.onclick = () => {
        currentPage--;
        renderTable();
    };
    pagination.appendChild(prev);

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        if (i === currentPage) btn.classList.add('active');
        btn.onclick = () => {
            currentPage = i;
            renderTable();
        };
        pagination.appendChild(btn);
    }

    const next = document.createElement('button');
    next.innerHTML = `Next <i class="fa-solid fa-angle-right"></i>`;
    next.disabled = currentPage === totalPages || totalPages === 0;
    next.onclick = () => {
        currentPage++;
        renderTable();
    };
    pagination.appendChild(next);
}

/* ==========================================================================
   4. TOOLBAR LISTENERS, EXCEL EXPORT, PRINT, & LOGOUT MODAL
   ========================================================================== */

document.getElementById('caseSearch')?.addEventListener('input', applyFilters);
document.getElementById('yearSelectFilter')?.addEventListener('change', applyFilters);
document.getElementById('monthSelectFilter')?.addEventListener('change', applyFilters);

document.getElementById('excelBtn')?.addEventListener('click', () => {
    if (typeof XLSX === 'undefined') {
        alert('SheetJS library is loading. Please try again.');
        return;
    }

    if (aggregatedFacilityRows.length === 0) {
        alert('No data available to export.');
        return;
    }

    const selectedYear = document.getElementById('yearSelectFilter')?.value || 'All';
    const selectedMonth = document.getElementById('monthSelectFilter')?.value || 'All';
    const periodLabel =
        selectedMonth !== 'All'
            ? `${MONTH_NAMES[Number(selectedMonth)]} ${selectedYear}`
            : selectedYear;

    const exportData = aggregatedFacilityRows.map((item) => ({
        'ABTC / Health Facility': item.abtc,
        'Surveillance Period': periodLabel,
        Male: item.maleCases,
        Female: item.femaleCases,
        'Age <15': item.ageLt15,
        'Age >=15': item.ageGt15,
        'Dog Bites': item.bitingDog,
        'Cat Bites': item.bitingCat,
        'Other Bites': item.bitingOthers,
        'Category I': item.humanCat1,
        'Category II': item.humanCat2,
        'New Patients': item.humanCatNew,
        Booster: item.humanCatBooster,
        'Human Rabies (HR)': item.hr,
        'TCV Administered': item.petTcv,
        'RIG (HRIG)': item.petHrig,
        'RIG (ERIG)': item.petErig,
        'Total Cases': item.total,
        'Completed Cat II': item.remarksCompII,
        'Completed Cat III': item.remarksCompIII,
        'Incomplete Cat II': item.remarksIncompleteII,
        'Incomplete Cat III': item.remarksIncompleteIII,
        'No Tx Cat II': item.remarksNoneII,
        'No Tx Cat III': item.remarksNoneIII,
        REP: item.rep
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Animal Bite Registry');
    XLSX.writeFile(
        workbook,
        `PHO_Animal_Bite_Cases_${new Date().toISOString().split('T')[0]}.xlsx`
    );
});

document.getElementById('printBtn')?.addEventListener('click', () => {
    window.print();
});

export function setupLogoutModal() {
    const logoutBtn = document.getElementById('logoutBtn') || document.getElementById('logout-btn');
    const logoutModal = document.getElementById('logoutModal');
    const cancelBtn = document.getElementById('logoutCancelBtn');
    const confirmBtn = document.getElementById('logoutConfirmBtn');

    if (!logoutModal) {
        logoutBtn?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (confirm('Are you sure you want to log out?')) {
                try {
                    await signOutPhoSession();
                } catch (err) {
                    console.warn('Logout warning:', err);
                }
                localStorage.removeItem('userUid');
                localStorage.removeItem('userEmail');
                localStorage.removeItem('userRole');
                localStorage.removeItem('userDesignation');
                localStorage.removeItem('userStatus');
                window.location.href = 'pho-login.html';
            }
        });
        return;
    }

    const openLogout = () => {
        logoutModal.classList.add('open');
        logoutModal.setAttribute('aria-hidden', 'false');
    };

    const closeLogout = () => {
        logoutModal.classList.remove('open');
        logoutModal.setAttribute('aria-hidden', 'true');
    };

    logoutBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        openLogout();
    });

    cancelBtn?.addEventListener('click', closeLogout);

    logoutModal.addEventListener('click', (e) => {
        if (e.target === logoutModal) closeLogout();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && logoutModal.classList.contains('open')) {
            closeLogout();
        }
    });

    confirmBtn?.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Logging out...';

        try {
            await signOutPhoSession();
        } catch (err) {
            console.error('Logout error:', err);
        } finally {
            localStorage.removeItem('userUid');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('userRole');
            localStorage.removeItem('userDesignation');
            localStorage.removeItem('userStatus');
            window.location.href = 'pho-login.html';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupLogoutModal();
    initProvincialLedger();
});