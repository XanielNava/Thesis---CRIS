let rowsPerPage = 36;
let currentPage = 1;
let allCases = [];
let filteredCases = [];

/* FIREBASE */
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db } from "../../settings/js/settings-firebase.js";

/* ROWS PER PAGE */
const rowsPerPageSelect = document.getElementById("rowsPerPageSelect");
if (rowsPerPageSelect) {
    rowsPerPageSelect.addEventListener("change", (e) => {
        rowsPerPage = parseInt(e.target.value, 10);
        currentPage = 1;
        renderTable();
    });
}

/* LOAD DATA FROM FIRESTORE */
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
                    <p style="font-size:12px; color:#888; margin-top:4px;">Retrieving provincial medical metrics over secure socket...</p>
                </div>
            </td>
        </tr>
    `;

    try {
        console.log("🔄 Loading cases from pvo_rabies_cases collection...");
        
        // Simple getDocs without orderBy (no index required)
        const snapshot = await getDocs(collection(db, "pvo_rabies_cases"));
        
        console.log(`📊 Firestore returned ${snapshot.size} documents`);
        
        if (snapshot.empty) {
            console.warn("⚠️ No cases found in pvo_rabies_cases collection");
            allCases = [];
            filteredCases = [];
            renderTable();
            return;
        }

        allCases = [];
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            
            console.log(`📄 Processing document: ${data.facilityName || "Unknown"} | REP=${data.rep}`);
            
            allCases.push({
                id: doc.id,
                abtc: data.facilityName || "Unknown",
                year: data.year || new Date().getFullYear(),

                // Dog Population
                dogPopulation: Number(data.dogPopulation || 0),

                // Vaccinated Animals
                vaccinatedDogs: Number(data.vaccinatedDogs || 0),
                vaccinatedCats: Number(data.vaccinatedCats || 0),

                // Vaccination Percentage
                vaccinationPercentage: Number(data.vaccinationPercentage || 0),

                //Neutered and Spayed
                castrated: Number(data.castrated || 0),
                spayed: Number(data.spayed || 0),

                //Head Samples
                headSamples: Number(data.headSamples || 0),

                //Rabies Results
                rabiesPositive: Number(data.rabiesPositive || 0),
                rabiesNegative: Number(data.rabiesNegative || 0),

                //Human Death 
                humanDeath: Number(data.humanDeath || 0),

                // Document order (if exists, otherwise use insertion order)
                documentOrder: data.documentOrder || 0
            });
        });

        // Sort by documentOrder to preserve upload sequence
        allCases.sort((a, b) => a.documentOrder - b.documentOrder);
        
        filteredCases = [...allCases];

        console.log(`✅ Loaded ${allCases.length} facility records`);
        renderTable();

    } catch (error) {
        console.error("❌ Error loading cases:", error);
        console.error("Error message:", error.message);
        console.error("Error code:", error.code);
        
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
                        <p style="font-size:11px; color:#666; margin-top:4px;">Check browser console (F12) for details. This may be a Firebase quota issue.</p>
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

    if (!tbody) {
        console.error("❌ casesTableBody not found");
        return;
    }

    tbody.innerHTML = "";

    const totalRecords = filteredCases.length;
    const totalPages = Math.ceil(totalRecords / rowsPerPage);

    if (totalRecords === 0) {
        if (info) {
            info.textContent = "Showing 0 of 0 records";
        }
        tbody.innerHTML = `
            <tr>
                <td colspan="24">
                    <div class="table-placeholder">
                        <i class="fa-solid fa-folder-open" style="opacity:0.6;"></i>
                        <strong>No Bite Reports Found</strong>
                        <p style="font-size:12px; color:#888; margin-top:4px;">Import case data from Settings to populate this table.</p>
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

    // Render table rows from Firebase data
    records.forEach(caseData => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${caseData.district ?? ""}</strong></td>
                <td>${caseData.municipality ?? "Municipality/District"}</td>
                <td>${caseData.dogPopulation ?? "Dog Population"}</td>
                <td>${caseData.vaccinatedDogs ?? "Vaccinated Dogs"}</td>
                <td>${caseData.vaccinatedCats ?? "Vaccinated Cats"}</td>
                <td>${caseData.castrated ?? "Neutered"}</td>
                <td>${caseData.spayed ?? "Spayed"}</td>
                <td>${caseData.headSample ?? "No. of head samples submitted to"}</td>
                <td>${caseData.rabiesPositive ?? "Rabies Positive"}</td>
                <td>${caseData.rabiesNegative ?? "Rabies Negative"}</td>
                <td>${caseData.humanDeath ?? "Human Death"}</td>
            </tr>
        `;
    });

    // Calculate totals
    let totals = {
        male: 0, 
        female: 0, 
        ageLt15: 0, 
        ageGt15: 0,
        dog: 0, cat: 0, others: 0,
        cat1: 0, cat2: 0, catNew: 0, catBooster: 0,
        hr: 0, tcv: 0, hrig: 0, erig: 0,
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
            <td>${totals.male}</td>
            <td>${totals.female}</td>
            <td>${totals.ageLt15}</td>
            <td>${totals.ageGt15}</td>
            <td>${totals.dog}</td>
            <td>${totals.cat}</td>
            <td>${totals.others}</td>
            <td>${totals.cat1}</td>
            <td>${totals.cat2}</td>
            <td>${totals.catNew}</td>
            <td>${totals.catBooster}</td>
            <td>${totals.hr}</td>
            <td>${totals.tcv}</td>
            <td>${totals.hrig}</td>
            <td>${totals.erig}</td>
            <td>${totals.total}</td>
            <td>${totals.compII}</td>
            <td>${totals.compIII}</td>
            <td>${totals.incII}</td>
            <td>${totals.incIII}</td>
            <td>${totals.noneII}</td>
            <td>${totals.noneIII}</td>
            <td>${totals.rep}</td>
        </tr>
    `;

    createPagination(totalPages);
}

/* SEARCH FILTER BEFORE PAGINATION */
const caseSearch = document.getElementById("caseSearch");
if (caseSearch) {
    caseSearch.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();

        filteredCases = allCases.filter(caseData => {
            const abtcField = String(caseData.abtc ?? "").toLowerCase();
            const yearField = String(caseData.year ?? "").toLowerCase();
            return abtcField.includes(query) || yearField.includes(query);
        });

        currentPage = 1;
        renderTable();
    });
}

/* PAGINATION BLOCK */
function createPagination(totalPages) {
    const pagination = document.getElementById("pagination");
    if (!pagination) return;
    
    pagination.innerHTML = "";

    if (totalPages <= 1) return;

    // Previous Navigation Pointer
    const prev = document.createElement("button");
    prev.innerHTML = `<i class="fa-solid fa-angle-left"></i> Prev`;
    prev.disabled = currentPage === 1;
    prev.onclick = () => { currentPage--; renderTable(); };
    pagination.appendChild(prev);

    // Dynamic Sliding Boundary Window logic
    const maxVisibleButtons = 5; 
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisibleButtons - 1);

    if (endPage - startPage + 1 < maxVisibleButtons) {
        startPage = Math.max(1, endPage - maxVisibleButtons + 1);
    }

    // Always Render First Page Button Anchor
    if (startPage > 1) {
        appendPageButton(1, pagination);
        if (startPage > 2) {
            const ellipsis = document.createElement("span");
            ellipsis.className = "pagination-ellipsis";
            ellipsis.textContent = "...";
            pagination.appendChild(ellipsis);
        }
    }

    // Window Run Build Loop
    for (let i = startPage; i <= endPage; i++) {
        appendPageButton(i, pagination);
    }

    // Always Render Terminating Page Button Anchor
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement("span");
            ellipsis.className = "pagination-ellipsis";
            ellipsis.textContent = "...";
            pagination.appendChild(ellipsis);
        }
        appendPageButton(totalPages, pagination);
    }

    // Next Navigation Pointer
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

/* LOAD INITIAL CASE DATA */
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Page loaded. Starting data load...");
    loadCases();
});