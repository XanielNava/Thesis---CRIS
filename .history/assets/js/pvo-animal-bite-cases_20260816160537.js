let rowsPerPage = 43;
let currentPage = 1;
let allCases = [];
let filteredCases = [];

/* FIREBASE */
// import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// import { db } from "../../settings/js/settings-firebase.js";

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
            const municipalityName = String(data.municipality || "Unknown").trim();

            // ⚠️ Skip any imported summary/total rows stored in Firestore
            if (municipalityName.toLowerCase() === "total") {
                return;
            }
            
            console.log(`📄 Processing document: ${municipalityName}`);
            
            allCases.push({
                id: doc.id,
                district: data.district || "N/A",
                municipality: municipalityName,
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

                // Head Samples Submitted
                headSamplesSubmitted: Number(data.headSamplesSubmitted || 0),

                // Rabies Results
                rabiesPositive: Number(data.rabiesPositive || 0),
                rabiesNegative: Number(data.rabiesNegative || 0),

                // Human Death 
                humanDeath: Number(data.humanDeath || 0),

                // Document order
                documentOrder: Number(data.documentOrder || 0)
            });
        });

        // Sort by documentOrder to preserve upload sequence
        allCases.sort((a, b) => a.documentOrder - b.documentOrder);
        
        filteredCases = [...allCases];

        console.log(`✅ Loaded ${allCases.length} valid municipality records`);
        renderTable();

    } catch (error) {
        console.error("❌ Error loading cases:", error);
        
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

    // Filter out any potential 'Total' row safety check
    const validRecords = filteredCases.filter(c => String(c.municipality).trim().toLowerCase() !== "total");
    const totalRecords = validRecords.length;
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
                        <strong>No Rabies Surveillance Data Found</strong>
                        <p style="font-size:12px; color:#888; margin-top:4px;">Import data from Settings to populate this table.</p>
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
    const records = validRecords.slice(start, end);

    if (info) {
        info.textContent = `Showing ${start + 1}-${Math.min(end, totalRecords)} of ${totalRecords} records`;
    }

    // Render table rows from Firebase data
    records.forEach(caseData => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${caseData.district ?? "N/A"}</strong></td>
                <td>${caseData.municipality ?? "Unknown"}</td>
                <td>${Number(caseData.dogPopulation).toLocaleString()}</td>
                <td>${Number(caseData.vaccinatedDogs).toLocaleString()}</td>
                <td>${Number(caseData.vaccinatedCats).toLocaleString()}</td>
                <td>${(caseData.vaccinationPercentage ?? 0).toFixed(2)}%</td>
                <td>${Number(caseData.castrated).toLocaleString()}</td>
                <td>${Number(caseData.spayed).toLocaleString()}</td>
                <td>${Number(caseData.headSamplesSubmitted).toLocaleString()}</td>
                <td>${Number(caseData.rabiesPositive).toLocaleString()}</td>
                <td>${Number(caseData.rabiesNegative).toLocaleString()}</td>
                <td>${Number(caseData.humanDeath).toLocaleString()}</td>
            </tr>
        `;
    });

    // Calculate totals across valid records
    let totals = { 
        dogPopulation: 0, 
        vaccinatedDogs: 0, 
        vaccinatedCats: 0, 
        vaccinationPercentage: 0,
        castrated: 0, 
        spayed: 0, 
        headSamplesSubmitted: 0,
        rabiesPositive: 0, 
        rabiesNegative: 0,
        humanDeath: 0,
    };

    validRecords.forEach(c => {
        totals.dogPopulation += Number(c.dogPopulation ?? 0);
        totals.vaccinatedDogs += Number(c.vaccinatedDogs ?? 0);
        totals.vaccinatedCats += Number(c.vaccinatedCats ?? 0);
        totals.vaccinationPercentage += Number(c.vaccinationPercentage ?? 0);
        totals.castrated += Number(c.castrated ?? 0);
        totals.spayed += Number(c.spayed ?? 0);
        totals.headSamplesSubmitted += Number(c.headSamplesSubmitted ?? 0);
        totals.rabiesPositive += Number(c.rabiesPositive ?? 0);
        totals.rabiesNegative += Number(c.rabiesNegative ?? 0);
        totals.humanDeath += Number(c.humanDeath ?? 0);
    });

    // Calculate average vaccination percentage
    const avgVaccinationPercentage = validRecords.length > 0 
        ? (totals.vaccinationPercentage / validRecords.length).toFixed(2)
        : 0;

    tbody.innerHTML += `
        <tr style="background-color: #FFE3B3; font-weight: bold; border-top: 2px solid #EA6113; position: sticky; bottom: 0; z-index: 5;">
            <td colspan="2">TOTAL / AVERAGE</td>
            <td>${Number(totals.dogPopulation).toLocaleString()}</td>
            <td>${Number(totals.vaccinatedDogs).toLocaleString()}</td>
            <td>${Number(totals.vaccinatedCats).toLocaleString()}</td>
            <td>${avgVaccinationPercentage}%</td>
            <td>${Number(totals.castrated).toLocaleString()}</td>
            <td>${Number(totals.spayed).toLocaleString()}</td>
            <td>${Number(totals.headSamplesSubmitted).toLocaleString()}</td>
            <td>${Number(totals.rabiesPositive).toLocaleString()}</td>
            <td>${Number(totals.rabiesNegative).toLocaleString()}</td>
            <td>${Number(totals.humanDeath).toLocaleString()}</td>
        </tr>
    `;

    createPagination(totalPages);
    syncStickyHeaderOffset();
}

/* STICKY HEADER OFFSET SYNC */
function syncStickyHeaderOffset() {
    const table = document.getElementById("casesTable");
    if (!table) return;

    const headerRows = table.querySelectorAll("thead tr");
    if (headerRows.length < 2) return;

    const firstRowHeight = headerRows[0].getBoundingClientRect().height;
    if (!firstRowHeight) return;

    headerRows[1].querySelectorAll("th").forEach(th => {
        th.style.top = `${firstRowHeight}px`;
    });
}

window.addEventListener("resize", syncStickyHeaderOffset);
if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncStickyHeaderOffset);
}

/* SEARCH FILTER BEFORE PAGINATION */
const caseSearch = document.getElementById("caseSearch");
if (caseSearch) {
    caseSearch.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();

        filteredCases = allCases.filter(caseData => {
            const districtField = String(caseData.district ?? "").toLowerCase();
            const municipalityField = String(caseData.municipality ?? "").toLowerCase();
            return districtField.includes(query) || municipalityField.includes(query);
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