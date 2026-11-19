/* ==========================================================================
   CRIS PVO MODULE — ANIMAL BITE & RABIES CASES UI CONTROLLER (pvo-AB-ui.js)
   Handles Ledger Rendering, Live Confirmed Human Deaths Merge, Search,
   Pagination, Excel Export, Print, and Logout.
   ========================================================================== */

import {
    fetchPvoAnimalBiteCases,
    subscribeToConfirmedHumanDeathsByMunicipality,
    signOutPvoSession
} from '../db/pvo-AB-db.js';

let rowsPerPage = 43;
let currentPage = 1;
let allCases = [];
let filteredCases = [];
let liveConfirmedDeathsMap = new Map();
let unsubscribeDeaths = null;

const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));

function mergeLiveDeathsIntoCases() {
    allCases = allCases.map((rec) => {
        const cleanMun = String(rec.municipality || '')
            .trim()
            .toLowerCase()
            .replace(/^municipality of\s+/i, '')
            .replace(/\s+city$/i, '')
            .trim();

        let liveCount = 0;
        for (const [munKey, count] of liveConfirmedDeathsMap.entries()) {
            const normKey = munKey
                .replace(/^municipality of\s+/i, '')
                .replace(/\s+city$/i, '')
                .trim();
            if (normKey === cleanMun || cleanMun.includes(normKey) || normKey.includes(cleanMun)) {
                liveCount += count;
            }
        }

        return {
            ...rec,
            humanDeath: Number(rec.baseHumanDeath || 0) + liveCount
        };
    });

    applySearchFilter(false);
}

async function loadCases() {
    const tbody = document.getElementById('casesTableBody');
    const info = document.getElementById('recordInfo');

    if (info) info.textContent = 'Connecting to CRIS Ledger...';
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="12"><div class="table-placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i><strong> Accessing Database Logs...</strong></div></td></tr>`;
    }

    try {
        allCases = await fetchPvoAnimalBiteCases();
        filteredCases = [...allCases];
        renderTable();

        if (unsubscribeDeaths) unsubscribeDeaths();
        unsubscribeDeaths = subscribeToConfirmedHumanDeathsByMunicipality((deathsMap) => {
            liveConfirmedDeathsMap = deathsMap;
            mergeLiveDeathsIntoCases();
        });
    } catch (error) {
        if (info) info.textContent = `Error: ${error.message}`;
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="12"><div class="table-placeholder error"><strong style="color:#D32F2F;">Failed to Load Dataset</strong><p>${esc(error.message)}</p></div></td></tr>`;
        }
    }
}

function applySearchFilter(resetPage = true) {
    const query = (document.getElementById('caseSearch')?.value || '').toLowerCase().trim();
    filteredCases = query
        ? allCases.filter(
              (c) =>
                  String(c.district || '').toLowerCase().includes(query) ||
                  String(c.municipality || '').toLowerCase().includes(query)
          )
        : [...allCases];

    if (resetPage) currentPage = 1;
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('casesTableBody');
    const info = document.getElementById('recordInfo');
    if (!tbody) return;

    tbody.innerHTML = '';
    const totalRecords = filteredCases.length;
    const totalPages = Math.ceil(totalRecords / rowsPerPage);

    if (totalRecords === 0) {
        if (info) info.textContent = 'Showing 0 of 0 records';
        tbody.innerHTML = `<tr><td colspan="12"><div class="table-placeholder"><strong>No Rabies Surveillance Data Found</strong></div></td></tr>`;
        createPagination(0);
        return;
    }

    if (currentPage > totalPages) currentPage = Math.max(1, totalPages);
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const records = filteredCases.slice(start, end);

    if (info) {
        info.textContent = `Showing ${start + 1}-${Math.min(end, totalRecords)} of ${totalRecords} records`;
    }

    const rowHtml = records.map(
        (c) => `
            <tr>
                <td><strong>${esc(c.district)}</strong></td>
                <td>${esc(c.municipality)}</td>
                <td>${c.dogPopulation.toLocaleString()}</td>
                <td>${c.vaccinatedDogs.toLocaleString()}</td>
                <td>${c.vaccinatedCats.toLocaleString()}</td>
                <td>${c.vaccinationPercentage.toFixed(2)}%</td>
                <td>${c.castrated.toLocaleString()}</td>
                <td>${c.spayed.toLocaleString()}</td>
                <td>${c.headSamplesSubmitted.toLocaleString()}</td>
                <td style="${c.rabiesPositive > 0 ? 'color:#DC2626; font-weight:700;' : ''}">${c.rabiesPositive.toLocaleString()}</td>
                <td>${c.rabiesNegative.toLocaleString()}</td>
                <td style="${c.humanDeath > 0 ? 'color:#DC2626; font-weight:800; background:#FEE2E2;' : ''}">${c.humanDeath.toLocaleString()}</td>
            </tr>
        `
    );

    const totals = {
        dog: 0,
        vDogs: 0,
        vCats: 0,
        vPct: 0,
        cast: 0,
        spay: 0,
        head: 0,
        pos: 0,
        neg: 0,
        deaths: 0
    };

    filteredCases.forEach((c) => {
        totals.dog += c.dogPopulation;
        totals.vDogs += c.vaccinatedDogs;
        totals.vCats += c.vaccinatedCats;
        totals.vPct += c.vaccinationPercentage;
        totals.cast += c.castrated;
        totals.spay += c.spayed;
        totals.head += c.headSamplesSubmitted;
        totals.pos += c.rabiesPositive;
        totals.neg += c.rabiesNegative;
        totals.deaths += c.humanDeath;
    });

    const avgVaxPct =
        filteredCases.length > 0 ? (totals.vPct / filteredCases.length).toFixed(2) : '0.00';

    rowHtml.push(`
        <tr style="background-color: #FFE3B3; font-weight: bold; border-top: 2px solid #EA6113; position: sticky; bottom: 0; z-index: 5;">
            <td colspan="2">TOTAL / AVERAGE</td>
            <td>${totals.dog.toLocaleString()}</td>
            <td>${totals.vDogs.toLocaleString()}</td>
            <td>${totals.vCats.toLocaleString()}</td>
            <td>${avgVaxPct}%</td>
            <td>${totals.cast.toLocaleString()}</td>
            <td>${totals.spay.toLocaleString()}</td>
            <td>${totals.head.toLocaleString()}</td>
            <td>${totals.pos.toLocaleString()}</td>
            <td>${totals.neg.toLocaleString()}</td>
            <td style="${totals.deaths > 0 ? 'color:#DC2626; font-weight:800;' : ''}">${totals.deaths.toLocaleString()}</td>
        </tr>
    `);

    tbody.innerHTML = rowHtml.join('\n');
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
    next.disabled = currentPage === totalPages;
    next.onclick = () => {
        currentPage++;
        renderTable();
    };
    pagination.appendChild(next);
}

function exportToExcel() {
    if (typeof XLSX === 'undefined') {
        alert('Excel export library is still loading. Please try again.');
        return;
    }
    if (filteredCases.length === 0) {
        alert('No records available to export.');
        return;
    }

    const rows = filteredCases.map((c) => ({
        District: c.district,
        'Municipality / City': c.municipality,
        'Dog Population': c.dogPopulation,
        'Vaccinated Dogs': c.vaccinatedDogs,
        'Vaccinated Cats': c.vaccinatedCats,
        'Vaccination %': `${c.vaccinationPercentage.toFixed(2)}%`,
        Castrated: c.castrated,
        Spayed: c.spayed,
        'Head Samples Submitted': c.headSamplesSubmitted,
        'Rabies Positive': c.rabiesPositive,
        'Rabies Negative': c.rabiesNegative,
        'Human Deaths': c.humanDeath
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'PVO Rabies Surveillance');
    XLSX.writeFile(
        workbook,
        `PVO_Animal_Bite_Cases_${new Date().toISOString().split('T')[0]}.xlsx`
    );
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('rowsPerPageSelect')?.addEventListener('change', (e) => {
        rowsPerPage = parseInt(e.target.value, 10) || 43;
        currentPage = 1;
        renderTable();
    });

    document.getElementById('caseSearch')?.addEventListener('input', () => applySearchFilter(true));
    document.getElementById('excelBtn')?.addEventListener('click', exportToExcel);
    document.getElementById('printBtn')?.addEventListener('click', () => window.print());

    document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (confirm('Are you sure you want to log out?')) {
            try {
                await signOutPvoSession();
            } catch (err) {
                console.warn('Logout error:', err);
            }
            ['userUid', 'userEmail', 'userRole', 'userDesignation', 'userStatus'].forEach((k) =>
                localStorage.removeItem(k)
            );
            window.location.href = 'pvo-login.html';
        }
    });

    loadCases();
});