// ==============================================================================
// pho-animal-bite-cases.js - PHO Animal Bite Cases Ledger Controller (Centralized abtc-reports Stream)
// ==============================================================================

import { 
    collection, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Import shared central instances from firebase-config.js
import { auth, db } from './firebase-config.js';

// --- Global App Variables ---
let rowsPerPage = 36;
let currentPage = 1;
let allCases = [];
let filteredCases = [];

/* ROWS PER PAGE HANDLER */
const rowsPerPageSelect = document.getElementById("rowsPerPageSelect");
if (rowsPerPageSelect) {
    rowsPerPageSelect.addEventListener("change", (e) => {
        rowsPerPage = parseInt(e.target.value, 10);
        currentPage = 1;
        renderTable();
    });
}

/* LOAD DATA FROM THE CENTRALIZED abtc-reports COLLECTION */
async function loadCases() {
    const tbody = document.getElementById("casesTableBody");
    const info = document.getElementById("recordInfo");
    
    if (!tbody) {
        console.error("❌ Element 'casesTableBody' not found in HTML");
        return;
    }

    if (info) {
        info.textContent = "Connecting to CRIS Ledger...";
    }

    tbody.innerHTML = `
        <tr>
            <td colspan="24">
                <div class="table-placeholder">
                    <i class="fa-solid fa-circle-notch fa-spin"></i>
                    <strong>Accessing Database Logs</strong>
                    <p style="font-size:12px; color:#888; margin-top:4px;">Retrieving provincial medical metrics from central repository...</p>
                </div>
            </td>
        </tr>
    `;

    try {
        console.log("🔄 Loading submitted reports from centralized abtc-reports collection...");
        
        // Single fast read from the dedicated central collection
        const snapshot = await getDocs(collection(db, "abtc-reports"));
        
        console.log(`📊 Firestore returned ${snapshot.size} submitted reports`);
        
        if (snapshot.empty) {
            console.warn("⚠️ No submitted reports found in abtc-reports collection.");
            allCases = [];
            filteredCases = [];
            renderTable();
            return;
        }

        allCases = [];
        let orderCounter = 0;
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            orderCounter++;
            
            allCases.push({
                id: docSnap.id,
                abtc: data.facilityName || data.municipality || data.abtc || "Unknown Facility",
                year: data.year || new Date().getFullYear(),
                
                maleCases: Number(data.maleCases || 0),
                femaleCases: Number(data.femaleCases || 0),
                ageLt15: Number(data.ageLessThan15 || data.ageLt15 || 0),
                ageGt15: Number(data.ageGreaterThan15 || data.ageGt15 || 0),
                
                bitingDog: Number(data.bitingDog || 0),
                bitingCat: Number(data.bitingCat || 0),
                bitingOthers: Number(data.bitingOthers || 0),
                
                humanCat1: Number(data.humanCat1 || 0),
                humanCat2: Number(data.humanCat2 || 0),
                humanCatNew: Number(data.humanCatNew || 0),
                humanCatBooster: Number(data.humanCatBooster || 0),
                
                hr: Number(data.hr || 0),
                petTcv: Number(data.petTcv || 0),
                petHrig: Number(data.petHrig || 0),
                petErig: Number(data.petErig || 0),
                
                total: Number(data.total || data.totalCases || 0),
                
                remarksCompII: Number(data.remarksCompII || 0),
                remarksCompIII: Number(data.remarksCompIII || 0),
                remarksIncompleteII: Number(data.remarksIncompleteII || 0),
                remarksIncompleteIII: Number(data.remarksIncompleteIII || 0),
                remarksNoneII: Number(data.remarksNoneII || 0),
                remarksNoneIII: Number(data.remarksNoneIII || 0),
                
                rep: Number(data.rep || 0),
                documentOrder: data.documentOrder || orderCounter
            });
        });

        allCases.sort((a, b) => a.documentOrder - b.documentOrder);
        filteredCases = [...allCases];

        console.log(`✅ Loaded ${allCases.length} facility report records into ledger`);
        renderTable();

    } catch (error) {
        console.error("❌ Error loading submitted reports:", error);
        
        if (info) {
            info.textContent = `Error running query: ${error.message}`;
        }
        tbody.innerHTML = `
            <tr>
                <td colspan="24">
                    <div class="table-placeholder error">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <strong style="color:#D32F2F;">Failed to Load Dataset</strong>
                        <p style="font-size:12px; color:#888; margin-top:4px;">Error: ${error.message}</p>
                    </div>
                </td>
            </tr>
        `;
    }
}

/* RENDER TABLE */
function renderTable() {
    const tbody = document.getElementById("casesTableBody");
    const info = document.getElementById("recordInfo");

    if (!tbody) return;

    tbody.innerHTML = "";

    const totalRecords = filteredCases.length;
    const totalPages = Math.ceil(totalRecords / rowsPerPage);

    if (totalRecords === 0) {
        if (info) info.textContent = "Showing 0 of 0 records";
        tbody.innerHTML = `
            <tr>
                <td colspan="24">
                    <div class="table-placeholder">
                        <i class="fa-solid fa-folder-open" style="opacity:0.6;"></i>
                        <strong>No Bite Reports Found</strong>
                        <p style="font-size:12px; color:#888; margin-top:4px;">Submitted facility reports will appear here automatically.</p>
                    </div>
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
    const records = filteredCases.slice(start, end);

    if (info) {
        info.textContent = `Showing ${start + 1}-${Math.min(end, totalRecords)} of ${totalRecords} records`;
    }

    records.forEach(caseData => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${caseData.abtc ?? "N/A"}</strong></td>
                <td>${caseData.maleCases ?? 0}</td>
                <td>${caseData.femaleCases ?? 0}</td>
                <td>${caseData.ageLt15 ?? 0}</td>
                <td>${caseData.ageGt15 ?? 0}</td>
                <td>${caseData.bitingDog ?? 0}</td>
                <td>${caseData.bitingCat ?? 0}</td>
                <td>${caseData.bitingOthers ?? 0}</td>
                <td>${caseData.humanCat1 ?? 0}</td>
                <td>${caseData.humanCat2 ?? 0}</td>
                <td>${caseData.humanCatNew ?? 0}</td>
                <td>${caseData.humanCatBooster ?? 0}</td>
                <td>${caseData.hr ?? 0}</td>
                <td>${caseData.petTcv ?? 0}</td>
                <td>${caseData.petHrig ?? 0}</td>
                <td>${caseData.petErig ?? 0}</td>
                <td>${caseData.total ?? 0}</td>
                <td>${caseData.remarksCompII ?? 0}</td>
                <td>${caseData.remarksCompIII ?? 0}</td>
                <td>${caseData.remarksIncompleteII ?? 0}</td>
                <td>${caseData.remarksIncompleteIII ?? 0}</td>
                <td>${caseData.remarksNoneII ?? 0}</td>
                <td>${caseData.remarksNoneIII ?? 0}</td>
                <td>${caseData.rep ?? 0}</td>
            </tr>
        `;
    });

    let totals = {
        male: 0, female: 0, ageLt15: 0, ageGt15: 0,
        dog: 0, cat: 0, others: 0,
        cat1: 0, cat2: 0, catNew: 0, catBooster: 0,
        hr: 0, tcv: 0, hrig: 0, erig: 0, total: 0,
        compII: 0, compIII: 0, incII: 0, incIII: 0, noneII: 0, noneIII: 0, 
        rep: 0
    };

    filteredCases.forEach(c => {
        totals.male += Number(c.maleCases ?? 0);
        totals.female += Number(c.femaleCases ?? 0);
        totals.ageLt15 += Number(c.ageLt15 ?? 0);
        totals.ageGt15 += Number(c.ageGt15 ?? 0);
        totals.dog += Number(c.bitingDog ?? 0);
        totals.cat += Number(c.bitingCat ?? 0);
        totals.others += Number(c.bitingOthers ?? 0);
        totals.cat1 += Number(c.humanCat1 ?? 0);
        totals.cat2 += Number(c.humanCat2 ?? 0);
        totals.catNew += Number(c.humanCatNew ?? 0);
        totals.catBooster += Number(c.humanCatBooster ?? 0);
        totals.hr += Number(c.hr ?? 0);
        totals.tcv += Number(c.petTcv ?? 0);
        totals.hrig += Number(c.petHrig ?? 0);
        totals.erig += Number(c.petErig ?? 0);
        totals.total += Number(c.total ?? 0);
        totals.compII += Number(c.remarksCompII ?? 0);
        totals.compIII += Number(c.remarksCompIII ?? 0);
        totals.incII += Number(c.remarksIncompleteII ?? 0);
        totals.incIII += Number(c.remarksIncompleteIII ?? 0);
        totals.noneII += Number(c.remarksNoneII ?? 0);
        totals.noneIII += Number(c.remarksNoneIII ?? 0);
        totals.rep += Number(c.rep ?? 0);
    });

    tbody.innerHTML += `
        <tr style="background-color: #FFE3B3; font-weight: bold; border-top: 2px solid #EA6113; position: sticky; bottom: 0; z-index: 5;">
            <td>TOTAL</td>
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
            <td>${totals.hr.toLocaleString()}</td>
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
    `;

    createPagination(totalPages);
}

/* SEARCH FILTER */
const caseSearch = document.getElementById("caseSearch");
if (caseSearch) {
    caseSearch.addEventListener("input", (e) => {
        const queryText = e.target.value.toLowerCase().trim();

        filteredCases = allCases.filter(caseData => {
            const abtcField = String(caseData.abtc ?? "").toLowerCase();
            const yearField = String(caseData.year ?? "").toLowerCase();
            return abtcField.includes(queryText) || yearField.includes(queryText);
        });

        currentPage = 1;
        renderTable();
    });
}

/* PAGINATION BUILDER */
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

    const maxVisibleButtons = 5; 
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisibleButtons - 1);

    if (endPage - startPage + 1 < maxVisibleButtons) {
        startPage = Math.max(1, endPage - maxVisibleButtons + 1);
    }

    if (startPage > 1) {
        appendPageButton(1, pagination);
        if (startPage > 2) {
            const ellipsis = document.createElement("span");
            ellipsis.className = "pagination-ellipsis";
            ellipsis.textContent = "...";
            pagination.appendChild(ellipsis);
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        appendPageButton(i, pagination);
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement("span");
            ellipsis.className = "pagination-ellipsis";
            ellipsis.textContent = "...";
            pagination.appendChild(ellipsis);
        }
        appendPageButton(totalPages, pagination);
    }

    const next = document.createElement("button");
    next.innerHTML = `Next <i class="fa-solid fa-angle-right"></i>`;
    next.disabled = currentPage === totalPages || totalPages === 0;
    next.onclick = () => { currentPage++; renderTable(); };
    pagination.appendChild(next);
}

function appendPageButton(pageNumber, container) {
    const btn = document.createElement("button");
    btn.textContent = pageNumber;
    if (pageNumber === currentPage) btn.classList.add("active");
    btn.onclick = () => { currentPage = pageNumber; renderTable(); };
    container.appendChild(btn);
}

/* INITIAL LOAD */
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Animal Bite Cases ledger initializing from abtc-reports...");
    loadCases();
});