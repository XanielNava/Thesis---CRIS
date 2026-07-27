let rowsPerPage = 36;
let currentPage = 1;
let allCases = [];
let filteredCases = [];

/* FIREBASE IMPORT */
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "../../settings/js/settings-firebase.js";

/* ROWS PER PAGE SELECTOR */
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
            <td colspan="12">
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
            
            console.log(`📄 Processing document: ${data.municipality || data.facilityName || "Unknown"}`);
            
            allCases.push({
                id: doc.id,
                district: data.district || "N/A",
                municipality: data.municipality || data.facilityName || "Unknown",
                year: data.year || new Date().getFullYear(),

                // Dog Population
                dogPopulation: Number(data.dogPopulation || 0),

                // Vaccinated Animals
                vaccinatedDogs: Number(data.vaccinatedDogs || 0),
                vaccinatedCats: Number(data.vaccinatedCats || 0),

                // Vaccination Percentage
                vaccinationPercentage: Number(data.vaccinationPercentage || 0),

                // Neutered and Spayed
                castrated: Number(data.castrated || 0),
                spayed: Number(data.spayed || 0),

                // Head Samples
                headSamples: Number(data.headSamples || 0),

                // Rabies Results
                rabiesPositive: Number(data.rabiesPositive || 0),
                rabiesNegative: Number(data.rabiesNegative || 0),

                // Human Death 
                humanDeath: Number(data.humanDeath || 0),

                // Document order
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
                <td colspan="12">
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
                <td colspan="12">
                    <div class="table-placeholder">
                        <i class="fa-solid fa-folder-open" style="opacity:0.6;"></i>
                        <strong>No Rabies Metric Reports Found</strong>
                        <p style="font-size:12px; color:#888; margin-top:4px;">Import PVO case data from Settings to populate this table.</p>
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

    // Render table rows matching all 12 HTML columns
    records.forEach(caseData => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${caseData.district}</strong></td>
                <td>${caseData.municipality}</td>
                <td>${caseData.dogPopulation.toLocaleString()}</td>
                <td>${caseData.vaccinatedDogs.toLocaleString()}</td>
                <td>${caseData.vaccinatedCats.toLocaleString()}</td>
                <td>${caseData.vaccinationPercentage.toFixed(2)}%</td>
                <td>${caseData.castrated.toLocaleString()}</td>
                <td>${caseData.spayed.toLocaleString()}</td>
                <td>${caseData.headSamples.toLocaleString()}</td>
                <td>${caseData.rabiesPositive.toLocaleString()}</td>
                <td>${caseData.rabiesNegative.toLocaleString()}</td>
                <td>${caseData.humanDeath.toLocaleString()}</td>
            </tr>
        `;
    });

    // Calculate PVO Totals
    let totals = {
        dogPopulation: 0,
        vaccinatedDogs: 0,
        vaccinatedCats: 0,
        castrated: 0,
        spayed: 0,
        headSamples: 0,
        rabiesPositive: 0,
        rabiesNegative: 0,
        humanDeath: 0
    };

    filteredCases.forEach(c => {
        totals.dogPopulation += c.dogPopulation;
        totals.vaccinatedDogs += c.vaccinatedDogs;
        totals.vaccinatedCats += c.vaccinatedCats;
        totals.castrated += c.castrated;
        totals.spayed += c.spayed;
        totals.headSamples += c.headSamples;
        totals.rabiesPositive += c.rabiesPositive;
        totals.rabiesNegative += c.rabiesNegative;
        totals.humanDeath += c.humanDeath;
    });

    // Calculate average vaccination percentage for summary
    const avgVaccinationPerc = totals.dogPopulation > 0 
        ? ((totals.vaccinatedDogs / totals.dogPopulation) * 100).toFixed(2) 
        : "0.00";

    tbody.innerHTML += `
        <tr style="background-color: #FFE3B3; font-weight: bold; border-top: 2px solid #EA6113; position: sticky; bottom: 0; z-index: 5;">
            <td colspan="2">TOTAL</td>
            <td>${totals.dogPopulation.toLocaleString()}</td>
            <td>${totals.vaccinatedDogs.toLocaleString()}</td>
            <td>${totals.vaccinatedCats.toLocaleString()}</td>
            <td>${avgVaccinationPerc}%</td>
            <td>${totals.castrated.toLocaleString()}</td>
            <td>${totals.spayed.toLocaleString()}</td>
            <td>${totals.headSamples.toLocaleString()}</td>
            <td>${totals.rabiesPositive.toLocaleString()}</td>
            <td>${totals.rabiesNegative.toLocaleString()}</td>
            <td>${totals.humanDeath.toLocaleString()}</td>
        </tr>
    `;

    createPagination(totalPages);
}

/* SEARCH FILTER */
const caseSearch = document.getElementById("caseSearch");
if (caseSearch) {
    caseSearch.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();

        filteredCases = allCases.filter(caseData => {
            const districtField = String(caseData.district ?? "").toLowerCase();
            const municipalityField = String(caseData.municipality ?? "").toLowerCase();
            const yearField = String(caseData.year ?? "").toLowerCase();
            
            return districtField.includes(query) || 
                   municipalityField.includes(query) || 
                   yearField.includes(query);
        });

        currentPage = 1;
        renderTable();
    });
}

/* PAGINATION GENERATOR */
function createPagination(totalPages) {
    const pagination = document.getElementById("pagination");
    if (!pagination) return;
    
    pagination.innerHTML = "";

    if (totalPages <= 1) return;

    // Previous Button
    const prev = document.createElement("button");
    prev.innerHTML = `<i class="fa-solid fa-angle-left"></i> Prev`;
    prev.disabled = currentPage === 1;
    prev.onclick = () => { currentPage--; renderTable(); };
    pagination.appendChild(prev);

    // Dynamic Sliding Window logic
    const maxVisibleButtons = 5; 
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisibleButtons - 1);

    if (endPage - startPage + 1 < maxVisibleButtons) {
        startPage = Math.max(1, endPage - maxVisibleButtons + 1);
    }

    // First Page Anchor
    if (startPage > 1) {
        appendPageButton(1, pagination);
        if (startPage > 2) {
            const ellipsis = document.createElement("span");
            ellipsis.className = "pagination-ellipsis";
            ellipsis.textContent = "...";
            pagination.appendChild(ellipsis);
        }
    }

    // Sliding Window
    for (let i = startPage; i <= endPage; i++) {
        appendPageButton(i, pagination);
    }

    // Last Page Anchor
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement("span");
            ellipsis.className = "pagination-ellipsis";
            ellipsis.textContent = "...";
            pagination.appendChild(ellipsis);
        }
        appendPageButton(totalPages, pagination);
    }

    // Next Button
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

/* INITIALIZATION */
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Page loaded. Starting data load...");
    loadCases();
});