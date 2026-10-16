// ==============================================================================
// pho-animal-bite-cases.js - PHO Animal Bite Cases Ledger Controller
// ==============================================================================

import { auth, db } from '../firebase/firebase-config.js';
import { 
    collection, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Global App Variables
let rowsPerPage = 40;
let currentPage = 1;
let allLegacyCases = [];
let filteredCases = [];
let availableYears = new Set();
let facilitiesMap = new Map();

/* 1. FETCH & MAP FACILITIES FROM DATABASE */
async function loadFacilitiesRegistry() {
    facilitiesMap.clear();
    try {
        let facSnap = await getDocs(collection(db, "facilities"));
        if (facSnap.empty) {
            facSnap = await getDocs(collection(db, "pho-database", "main", "facility-management"));
        }

        if (facSnap && !facSnap.empty) {
            facSnap.forEach(docSnap => {
                const data = docSnap.data();
                const id = docSnap.id;

                let displayName = data.facilityName || data.name || data.abtcName || "";

                if (!displayName && data.acronym) {
                    displayName = data.acronym;
                }

                if (data.address && typeof data.address === 'object') {
                    const addr = data.address;
                    const locParts = [addr.barangay, addr.city || addr.municipality].filter(Boolean).join(", ");
                    if (displayName && data.acronym) {
                        displayName = `${displayName} (${data.acronym})`;
                    } else if (!displayName && locParts) {
                        displayName = data.acronym ? `${data.acronym} - ${locParts}` : locParts;
                    }
                }

                if (!displayName) {
                    displayName = data.municipality || data.city || id;
                }

                facilitiesMap.set(id, displayName);
            });
        }
    } catch (err) {
        // Handled
    }
}

/* 2. RESOLVE FACILITY NAME HELPER */
function resolveFacilityName(data, rawId = "") {
    const targetId = data.facilityId || data.facility_id || rawId;
    if (targetId && facilitiesMap.has(targetId)) {
        return facilitiesMap.get(targetId);
    }

    if (data.facilityName) return data.facilityName;
    if (data.name) return data.name;
    if (data.acronym) return data.acronym;

    if (data.address && typeof data.address === 'object') {
        const addr = data.address;
        const loc = [addr.barangay, addr.city || addr.municipality].filter(Boolean).join(", ");
        if (loc) return data.acronym ? `${data.acronym} - ${loc}` : loc;
    }

    if (data.municipality) return data.municipality;
    if (data.city) return data.city;
    if (data.abtc) return data.abtc;

    return rawId || "Unassigned Facility";
}

/* 3. LOAD DATA FROM FIRESTORE */
async function loadCases() {
    const tbody = document.getElementById("casesTableBody");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="24">
                <div style="padding: 35px; text-align: center; color: #7E8B9B;">
                    <i class="fa-solid fa-circle-notch fa-spin fa-2x" style="color: #EA6113; margin-bottom: 12px;"></i>
                    <p style="font-weight: 700; color: #412110; margin-bottom: 4px;">Loading Provincial Case Ledger...</p>
                    <span style="font-size: 12px;">Synchronizing official animal bite records</span>
                </div>
            </td>
        </tr>
    `;

    try {
        await loadFacilitiesRegistry();

        allLegacyCases = [];
        availableYears.clear();

        let legacyCollection = collection(db, "pho-database", "main", "legacy-summary");
        let snapshot = await getDocs(legacyCollection);

        if (snapshot.empty) {
            legacyCollection = collection(db, "pho_rabies_cases");
            snapshot = await getDocs(legacyCollection);
        }

        let orderCounter = 0;
        if (snapshot && !snapshot.empty) {
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();

                const rawName = (data.rawData && data.rawData[0]) || data.abtc || data.facilityName || "";
                if (!rawName || typeof rawName !== "string") return;
                
                const cleanName = rawName.trim();
                if (
                    cleanName === "" || 
                    cleanName.toLowerCase().includes("abtc / health") || 
                    cleanName.toLowerCase() === "abtc" ||
                    cleanName.toLowerCase() === "facility" ||
                    cleanName.toLowerCase().includes("health facility")
                ) {
                    return;
                }

                orderCounter++;
                const entryYear = Number(data.year) || (data.rawData && data.rawData[0] && !isNaN(Number(data.rawData[0])) ? Number(data.rawData[0]) : null);
                if (entryYear) availableYears.add(entryYear);

                const facilityTitle = data.rawData && Array.isArray(data.rawData)
                    ? (cleanName || resolveFacilityName(data, docSnap.id))
                    : resolveFacilityName(data, docSnap.id);

                if (data.rawData && Array.isArray(data.rawData)) {
                    const row = data.rawData;
                    allLegacyCases.push({
                        id: docSnap.id,
                        abtc: facilityTitle,
                        year: entryYear,
                        maleCases: Number(row[1] || 0),
                        femaleCases: Number(row[2] || 0),
                        ageLt15: Number(row[3] || 0),
                        ageGt15: Number(row[4] || 0),
                        bitingDog: Number(row[5] || 0),
                        bitingCat: Number(row[6] || 0),
                        bitingOthers: Number(row[7] || 0),
                        humanCat1: Number(row[8] || 0),
                        humanCat2: Number(row[9] || 0),
                        humanCatNew: Number(row[10] || 0),
                        humanCatBooster: Number(row[11] || 0),
                        hr: Number(row[12] || 0),
                        petTcv: Number(row[13] || 0),
                        petHrig: Number(row[14] || 0),
                        petErig: Number(row[15] || 0),
                        total: Number(row[16] || 0),
                        remarksCompII: Number(row[17] || 0),
                        remarksCompIII: Number(row[18] || 0),
                        remarksIncompleteII: Number(row[19] || 0),
                        remarksIncompleteIII: Number(row[20] || 0),
                        remarksNoneII: Number(row[21] || 0),
                        remarksNoneIII: Number(row[22] || 0),
                        rep: Number(row[23] || 0),
                        documentOrder: data.documentOrder || orderCounter
                    });
                } else {
                    allLegacyCases.push({
                        id: docSnap.id,
                        abtc: facilityTitle,
                        year: entryYear,
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
                        hr: Number(data.hr || data.humanDeaths || 0),
                        petTcv: Number(data.petTcv || data.tcv || 0),
                        petHrig: Number(data.petHrig || data.hrig || 0),
                        petErig: Number(data.petErig || data.erig || 0),
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
                }
            });
        }

        populateYearSelect();
        applyFilters();

    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="24" style="text-align:center; padding: 35px; color: #64748b;">
                    <i class="fa-solid fa-folder-open" style="font-size:26px; opacity:0.4; margin-bottom: 8px;"></i>
                    <p style="font-weight: 700; color: #412110;">No matching bite records found</p>
                    <span style="font-size: 12px;">Database is empty or disconnected</span>
                </td>
            </tr>
        `;
        updateKpiSummary({ total: 0, tcv: 0, hr: 0, compII: 0, compIII: 0 });
    }
}

/* 4. POPULATE YEAR DROPDOWN */
function populateYearSelect() {
    const yearSelect = document.getElementById("yearSelectFilter");
    if (!yearSelect) return;

    const sortedYears = Array.from(availableYears).sort((a, b) => b - a);
    yearSelect.innerHTML = `<option value="All">All Surveillance Years</option>`;
    
    sortedYears.forEach(year => {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = `${year}`;
        yearSelect.appendChild(option);
    });

    yearSelect.onchange = applyFilters;
}

/* 5. FILTER LOGIC */
function applyFilters() {
    const query = (document.getElementById("caseSearch")?.value || "").toLowerCase().trim();
    const selectedYear = document.getElementById("yearSelectFilter")?.value || "All";

    let result = allLegacyCases;

    if (selectedYear !== "All") {
        result = result.filter(c => String(c.year) === String(selectedYear));
    }

    if (query) {
        result = result.filter(c => {
            const name = String(c.abtc || "").toLowerCase();
            const yr = String(c.year || "");
            return name.includes(query) || yr.includes(query);
        });
    }

    filteredCases = result;
    currentPage = 1;
    renderTable();
}

/* 6. FORMAT CELLS */
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

/* 7. RENDER TABLE */
function renderTable() {
    const tbody = document.getElementById("casesTableBody");
    const countInfo = document.getElementById("recordCountInfo");
    if (!tbody) return;

    const totalRecords = filteredCases.length;
    const totalPages = Math.ceil(totalRecords / rowsPerPage);
    const selectedYear = document.getElementById("yearSelectFilter")?.value || "All";

    if (countInfo) {
        countInfo.textContent = `Showing ${totalRecords} reporting ABTC facilities / records for ${selectedYear}`;
    }

    if (totalRecords === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="24" style="text-align:center; padding: 35px; color: #64748b;">
                    <i class="fa-solid fa-folder-open" style="font-size:26px; opacity:0.4; margin-bottom: 8px;"></i>
                    <p style="font-weight: 700; color: #412110;">No matching bite records found</p>
                    <span style="font-size: 12px;">Try adjusting your search query or year filter</span>
                </td>
            </tr>
        `;
        updateKpiSummary({ total: 0, tcv: 0, hr: 0, compII: 0, compIII: 0 });
        createPagination(0);
        return;
    }

    if (currentPage > totalPages) {
        currentPage = Math.max(1, totalPages);
    }

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const records = filteredCases.slice(start, end);

    let tableRows = [];

    records.forEach(caseData => {
        tableRows.push(`
            <tr>
                <td class="sticky-col"><strong>${caseData.abtc || "N/A"}</strong></td>
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
        `);
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

    tbody.innerHTML = tableRows.join("\n");
    updateKpiSummary(totals);
    createPagination(totalPages);
}

/* 8. UPDATE TOP KPI SUMMARY MINI-CARDS */
function updateKpiSummary(totals) {
    const kpiBites = document.getElementById("kpiTotalBites");
    const kpiTcv = document.getElementById("kpiTotalTcv");
    const kpiHr = document.getElementById("kpiTotalHr");
    const kpiPep = document.getElementById("kpiPepRate");

    if (kpiBites) kpiBites.textContent = (totals.total || 0).toLocaleString();
    if (kpiTcv) kpiTcv.textContent = (totals.tcv || 0).toLocaleString();
    if (kpiHr) kpiHr.textContent = (totals.hr || 0).toLocaleString();
    
    if (kpiPep) {
        const completed = (totals.compII || 0) + (totals.compIII || 0);
        const totalBites = totals.total || 0;
        const rate = totalBites > 0 ? ((completed / totalBites) * 100).toFixed(1) : "0.0";
        kpiPep.textContent = `${rate}%`;
    }
}

/* SEARCH EVENT LISTENER */
const caseSearchInput = document.getElementById("caseSearch");
if (caseSearchInput) {
    caseSearchInput.addEventListener("input", applyFilters);
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

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement("button");
        btn.textContent = i;
        if (i === currentPage) btn.classList.add("active");
        btn.onclick = () => { currentPage = i; renderTable(); };
        pagination.appendChild(btn);
    }

    const next = document.createElement("button");
    next.innerHTML = `Next <i class="fa-solid fa-angle-right"></i>`;
    next.disabled = currentPage === totalPages || totalPages === 0;
    next.onclick = () => { currentPage++; renderTable(); };
    pagination.appendChild(next);
}

/* EXPORT TO EXCEL */
const excelBtn = document.getElementById("excelBtn");
if (excelBtn) {
    excelBtn.addEventListener("click", () => {
        if (typeof XLSX === "undefined") {
            alert("SheetJS library is loading. Please try again.");
            return;
        }

        if (filteredCases.length === 0) {
            alert("No data available to export.");
            return;
        }

        const exportData = filteredCases.map(item => ({
            "ABTC / Health Facility": item.abtc,
            "Surveillance Year": item.year,
            "Male": item.maleCases,
            "Female": item.femaleCases,
            "Age <15": item.ageLt15,
            "Age >=15": item.ageGt15,
            "Dog Bites": item.bitingDog,
            "Cat Bites": item.bitingCat,
            "Other Bites": item.bitingOthers,
            "Category I": item.humanCat1,
            "Category II": item.humanCat2,
            "New Patients": item.humanCatNew,
            "Booster": item.humanCatBooster,
            "Human Rabies (HR)": item.hr,
            "TCV Administered": item.petTcv,
            "RIG (HRIG)": item.petHrig,
            "RIG (ERIG)": item.petErig,
            "Total Cases": item.total,
            "Completed Cat II": item.remarksCompII,
            "Completed Cat III": item.remarksCompIII,
            "Incomplete Cat II": item.remarksIncompleteII,
            "Incomplete Cat III": item.remarksIncompleteIII,
            "No Tx Cat II": item.remarksNoneII,
            "No Tx Cat III": item.remarksNoneIII,
            "REP": item.rep
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Animal Bite Registry");
        XLSX.writeFile(workbook, `PHO_Animal_Bite_Cases_${new Date().toISOString().split('T')[0]}.xlsx`);
    });
}

/* PRINT HANDLER */
const printBtn = document.getElementById("printBtn");
if (printBtn) {
    printBtn.addEventListener("click", () => {
        window.print();
    });
}

/* INITIAL LOAD */
document.addEventListener('DOMContentLoaded', () => {
    loadCases();
});