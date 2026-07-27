let rowsPerPage = 43;
let currentPage = 1;
let allCases = [];
let filteredCases = [];

/* FIREBASE IMPORTS */
import { 
    collection, 
    getDocs, 
    writeBatch, 
    doc, 
    setDoc 
} from "../../settings/js/settings-firebase.js";
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

/* ==========================================================================
   DATASET UPLOAD & CONFLICT RESOLUTION HANDLER (REPLACE vs MERGE)
   ========================================================================== */

/**
 * Wipes out all existing documents in pvo_rabies_cases
 */
async function clearCurrentDataset() {
    console.log("🧹 Clearing existing dataset from pvo_rabies_cases...");
    const querySnapshot = await getDocs(collection(db, "pvo_rabies_cases"));
    const batch = writeBatch(db);

    querySnapshot.forEach((document) => {
        batch.delete(doc(db, "pvo_rabies_cases", document.id));
    });

    await batch.commit();
    console.log("✅ Previous dataset purged successfully.");
}

/**
 * Uploads dataset array to Firestore based on user mode preference
 * @param {Array} parsedExcelRows - Parsed Excel row objects
 * @param {'replace' | 'merge'} mode - Mode chosen by user
 */
export async function uploadCasesDataset(parsedExcelRows, mode = "replace") {
    try {
        if (!parsedExcelRows || parsedExcelRows.length === 0) {
            alert("⚠️ No valid rows found in the uploaded file.");
            return;
        }

        // 1. Purge database if 'replace' mode selected
        if (mode === "replace") {
            await clearCurrentDataset();
        }

        console.log(`🚀 Uploading dataset in '${mode}' mode...`);
        const batch = writeBatch(db);
        let validRowsCount = 0;

        parsedExcelRows.forEach((row, index) => {
            const municipalityName = String(row["Mun/City"] || row.municipality || "").trim();

            // Ignore blank or "Total" rows
            if (!municipalityName || municipalityName.toLowerCase() === "total") {
                return;
            }

            validRowsCount++;

            // Create deterministic document ID from municipality (e.g., 'san_joaquin')
            const docId = municipalityName.toLowerCase().replace(/[^a-z0-9]/g, "_");
            const docRef = doc(db, "pvo_rabies_cases", docId);

            const recordData = {
                district: row.district || row["District"] || "N/A",
                municipality: municipalityName,
                year: Number(row.year) || new Date().getFullYear(),
                dogPopulation: Number(row.dogPopulation || row["Dog \nPopulation"] || row["Dog Population"] || 0),
                vaccinatedDogs: Number(row.vaccinatedDogs || row["Vaccinated \nDogs"] || row["Vaccinated Dogs"] || 0),
                vaccinatedCats: Number(row.vaccinatedCats || row["Vaccinated\nCats"] || row["Vaccinated Cats"] || 0),
                vaccinationPercentage: Number(row.vaccinationPercentage || row["% of \nVaccination"] || row["% of Vaccination"] || 0),
                castrated: Number(row.castrated || row["Castrated"] || 0),
                spayed: Number(row.spayed || row["Spayed"] || 0),
                headSamplesSubmitted: Number(row.headSamplesSubmitted || row["No. of head \nsamples submitted to"] || row["No. of head samples submitted to"] || 0),
                rabiesPositive: Number(row.rabiesPositive || row["Rabies\nPositive"] || row["Rabies Positive"] || 0),
                rabiesNegative: Number(row.rabiesNegative || row["Rabies \nNegative"] || row["Rabies Negative"] || 0),
                humanDeath: Number(row.humanDeath || row["Human\nDeath"] || row["Human Death"] || 0),
                documentOrder: index + 1,
                updatedAt: new Date().toISOString()
            };

            // setDoc with merge: true overwrites existing municipality or appends if new
            batch.set(docRef, recordData, { merge: true });
        });

        await batch.commit();
        console.log(`✅ Upload complete: ${validRowsCount} records processed.`);
        alert(`Success! Dataset uploaded using '${mode.toUpperCase()}' mode.`);

        // Reload data into table
        await loadCases();

    } catch (error) {
        console.error("❌ Dataset upload failed:", error);
        alert(`Upload failed: ${error.message}`);
    }
}

/**
 * Triggers modal or prompt asking user for Replace vs Merge choice
 * @param {Array} parsedExcelRows 
 */
export async function handleFileUploadPrompt(parsedExcelRows) {
    const existingSnapshot = await getDocs(collection(db, "pvo_rabies_cases"));

    // If database already contains records, ask user
    if (!existingSnapshot.empty) {
        const userChoice = confirm(
            "Existing rabies dataset found in database!\n\n" +
            "• Click 'OK' to REPLACE current dataset (overwrites everything).\n" +
            "• Click 'Cancel' to MERGE/UPDATE with existing dataset."
        );

        const chosenMode = userChoice ? "replace" : "merge";
        await uploadCasesDataset(parsedExcelRows, chosenMode);
    } else {
        // No existing records, default to upload
        await uploadCasesDataset(parsedExcelRows, "replace");
    }
}


/* ==========================================================================
   LOAD DATA FROM FIRESTORE
   ========================================================================== */
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
        const seenMunicipalities = new Set();
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            const municipalityName = String(data.municipality || "Unknown").trim();

            // Skip summary 'Total' rows
            if (municipalityName.toLowerCase() === "total") {
                return;
            }

            // Skip duplicates if any exist
            if (seenMunicipalities.has(municipalityName.toLowerCase())) {
                return;
            }
            seenMunicipalities.add(municipalityName.toLowerCase());
            
            allCases.push({
                id: doc.id,
                district: data.district || "N/A",
                municipality: municipalityName,
                year: data.year || new Date().getFullYear(),

                dogPopulation: Number(data.dogPopulation || 0),
                vaccinatedDogs: Number(data.vaccinatedDogs || 0),
                vaccinatedCats: Number(data.vaccinatedCats || 0),
                vaccinationPercentage: Number(data.vaccinationPercentage || 0),
                castrated: Number(data.castrated || 0),
                spayed: Number(data.spayed || 0),
                headSamplesSubmitted: Number(data.headSamplesSubmitted || 0),
                rabiesPositive: Number(data.rabiesPositive || 0),
                rabiesNegative: Number(data.rabiesNegative || 0),
                humanDeath: Number(data.humanDeath || 0),
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
                    </div>
                </td>
            </tr>
        `;
    }
}

/* ==========================================================================
   RENDER TABLE
   ========================================================================== */
function renderTable() {
    const tbody = document.getElementById("casesTableBody");
    const info = document.getElementById("recordInfo");

    if (!tbody) {
        console.error("❌ casesTableBody not found");
        return;
    }

    tbody.innerHTML = "";

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

/* SEARCH FILTER */
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
    console.log("🚀 Page loaded. Starting data load...");
    loadCases();
});