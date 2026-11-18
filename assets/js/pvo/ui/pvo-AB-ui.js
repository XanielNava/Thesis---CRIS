import { fetchPvoAnimalBiteCases } from '../db/pvo-AB-db.js';

let rowsPerPage = 43;
let currentPage = 1;
let allCases = [];
let filteredCases = [];

const rowsPerPageSelect = document.getElementById("rowsPerPageSelect");
if (rowsPerPageSelect) {
    rowsPerPageSelect.addEventListener("change", (e) => {
        rowsPerPage = parseInt(e.target.value, 10);
        currentPage = 1;
        renderTable();
    });
}

async function loadCases() {
    const tbody = document.getElementById("casesTableBody");
    const info = document.getElementById("recordInfo");

    if (info) info.textContent = "Connecting to CRIS Ledger...";
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="12"><div class="table-placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i><strong>Accessing Database Logs</strong></div></td></tr>`;
    }

    try {
        allCases = await fetchPvoAnimalBiteCases();
        filteredCases = [...allCases];
        renderTable();
    } catch (error) {
        if (info) info.textContent = `Error: ${error.message}`;
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="12"><div class="table-placeholder error"><strong style="color:#D32F2F;">Failed to Load Dataset</strong><p>${error.message}</p></div></td></tr>`;
        }
    }
}

function renderTable() {
    const tbody = document.getElementById("casesTableBody");
    const info = document.getElementById("recordInfo");
    if (!tbody) return;

    tbody.innerHTML = "";
    const totalRecords = filteredCases.length;
    const totalPages = Math.ceil(totalRecords / rowsPerPage);

    if (totalRecords === 0) {
        if (info) info.textContent = "Showing 0 of 0 records";
        tbody.innerHTML = `<tr><td colspan="12"><div class="table-placeholder"><strong>No Rabies Surveillance Data Found</strong></div></td></tr>`;
        createPagination(0);
        return;
    }

    if (currentPage > totalPages) currentPage = Math.max(1, totalPages);
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const records = filteredCases.slice(start, end);

    if (info) info.textContent = `Showing ${start + 1}-${Math.min(end, totalRecords)} of ${totalRecords} records`;

    records.forEach(c => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${c.district}</strong></td>
                <td>${c.municipality}</td>
                <td>${c.dogPopulation.toLocaleString()}</td>
                <td>${c.vaccinatedDogs.toLocaleString()}</td>
                <td>${c.vaccinatedCats.toLocaleString()}</td>
                <td>${c.vaccinationPercentage.toFixed(2)}%</td>
                <td>${c.castrated.toLocaleString()}</td>
                <td>${c.spayed.toLocaleString()}</td>
                <td>${c.headSamplesSubmitted.toLocaleString()}</td>
                <td>${c.rabiesPositive.toLocaleString()}</td>
                <td>${c.rabiesNegative.toLocaleString()}</td>
                <td>${c.humanDeath.toLocaleString()}</td>
            </tr>
        `;
    });

    let totals = { dog: 0, vDogs: 0, vCats: 0, vPct: 0, cast: 0, spay: 0, head: 0, pos: 0, neg: 0, deaths: 0 };
    filteredCases.forEach(c => {
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

    const avgVaxPct = filteredCases.length > 0 ? (totals.vPct / filteredCases.length).toFixed(2) : 0;

    tbody.innerHTML += `
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
            <td>${totals.deaths.toLocaleString()}</td>
        </tr>
    `;

    createPagination(totalPages);
}

const caseSearch = document.getElementById("caseSearch");
if (caseSearch) {
    caseSearch.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        filteredCases = allCases.filter(c => c.district.toLowerCase().includes(query) || c.municipality.toLowerCase().includes(query));
        currentPage = 1;
        renderTable();
    });
}

function createPagination(totalPages) {
    const pagination = document.getElementById("pagination");
    if (!pagination) return;
    pagination.innerHTML = "";
    if (totalPages <= 1) return;

    const prev = document.createElement("button");
    prev.innerHTML = `<i class="fa-solid fa-angle-left"></i> Prev`;
    prev.disabled = currentPage === 1;
    prev.onclick = () => { currentPage--; renderTable(); };
    pagination.appendChild(prev);

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement("button");
        btn.textContent = i;
        if (i === currentPage) btn.classList.add("active");
        btn.onclick = () => { currentPage = i; renderTable(); };
        pagination.appendChild(btn);
    }

    const next = document.createElement("button");
    next.innerHTML = `Next <i class="fa-solid fa-angle-right"></i>`;
    next.disabled = currentPage === totalPages;
    next.onclick = () => { currentPage++; renderTable(); };
    pagination.appendChild(next);
}
