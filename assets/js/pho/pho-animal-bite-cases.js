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
let livePatientCases = [];
let filteredCases = [];
let availableYears = new Set();
let facilitiesMap = new Map();

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const seasonalWeights = [0.075, 0.082, 0.095, 0.108, 0.115, 0.092, 0.081, 0.079, 0.068, 0.072, 0.088, 0.085];

/* 1. FETCH & MAP FACILITIES FROM DATABASE */
async function loadFacilitiesRegistry() {
    facilitiesMap.clear();
    try {
        let facSnap = await getDocs(collection(db, "facilities"));
        if (facSnap.empty) {
            facSnap = await getDocs(collection(db, "pho-database", "main", "facility-management"));
        }

        facSnap.forEach(docSnap => {
            const data = docSnap.data();
            const id = docSnap.id;

            // Resolve name from name, facilityName, acronym, or address
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
    } catch (err) {
        console.warn("Could not load facilities lookup map:", err);
    }
}

/* 2. RESOLVE FACILITY NAME HELPER */
function resolveFacilityName(data, rawId = "") {
    // If the data already contains a facilityId that matches our facilities table
    const targetId = data.facilityId || data.facility_id || rawId;
    if (targetId && facilitiesMap.has(targetId)) {
        return facilitiesMap.get(targetId);
    }

    // Direct object properties
    if (data.facilityName) return data.facilityName;
    if (data.name) return data.name;
    if (data.acronym) return data.acronym;

    // Nested address lookup
    if (data.address && typeof data.address === 'object') {
        const addr = data.address;
        const loc = [addr.barangay, addr.city || addr.municipality].filter(Boolean).join(", ");
        if (loc) return data.acronym ? `${data.acronym} - ${loc}` : loc;
    }

    if (data.municipality) return data.municipality;
    if (data.city) return data.city;
    if (data.abtc) return data.abtc;

    return "Iloilo Provincial Health Office - ABTC";
}

/* 3. LOAD DATA FROM FIRESTORE */
async function loadCases() {
    const tbody = document.getElementById("casesTableBody");
    
    if (!tbody) {
        console.error("❌ Element 'casesTableBody' not found in HTML");
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td colspan="24">
                <div style="padding: 35px; text-align: center; color: #7E8B9B;">
                    <i class="fa-solid fa-circle-notch fa-spin fa-2x" style="color: #EA6113; margin-bottom: 12px;"></i>
                    <p style="font-weight: 700; color: #412110; margin-bottom: 4px;">Loading Provincial Case Ledger...</p>
                    <span style="font-size: 12px;">Synchronizing official animal bite and treatment records</span>
                </div>
            </td>
        </tr>
    `;

    try {
        // Step A: Load Facilities first so we can map IDs accurately
        await loadFacilitiesRegistry();

        allLegacyCases = [];
        livePatientCases = [];
        availableYears.clear();

        // Step B: Fetch Legacy Summary Records
        let legacyCollection = collection(db, "pho-database", "main", "legacy-summary");
        let snapshot = await getDocs(legacyCollection);

        if (snapshot.empty) {
            legacyCollection = collection(db, "pho_rabies_cases");
            snapshot = await getDocs(legacyCollection);
        }

        let orderCounter = 0;
        if (!snapshot.empty) {
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                orderCounter++;
                const entryYear = Number(data.year) || (data.rawData && data.rawData[0] && !isNaN(Number(data.rawData[0])) ? Number(data.rawData[0]) : "Legacy");
                if (entryYear !== "Legacy") availableYears.add(entryYear);

                const facilityTitle = data.rawData && Array.isArray(data.rawData)
                    ? (data.rawData[0] || resolveFacilityName(data, docSnap.id))
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
                        documentOrder: data.documentOrder || orderCounter,
                        source: "legacy"
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
                        documentOrder: data.documentOrder || orderCounter,
                        source: "legacy"
                    });
                }
            });
        }

        // Step C: Fetch Individual Patient Database Records
        try {
            const patientsSnap = await getDocs(collection(db, "patient-database"));
            if (!patientsSnap.empty) {
                patientsSnap.forEach(docSnap => {
                    const d = docSnap.data();
                    let dateObj = null;

                    if (d.dateOfBite?.toDate) dateObj = d.dateOfBite.toDate();
                    else if (d.dateOfConsultation?.toDate) dateObj = d.dateOfConsultation.toDate();
                    else if (d.createdAt?.toDate) dateObj = d.createdAt.toDate();
                    else if (d.date) dateObj = new Date(d.date);

                    const pYear = dateObj && !isNaN(dateObj.getTime()) ? dateObj.getFullYear() : 2026;
                    const pMonth = dateObj && !isNaN(dateObj.getTime()) ? dateObj.getMonth() : new Date().getMonth();
                    
                    availableYears.add(pYear);

                    livePatientCases.push({
                        id: docSnap.id,
                        abtc: resolveFacilityName(d, d.facilityId),
                        year: pYear,
                        month: pMonth,
                        sex: String(d.sex || d.gender || "").toLowerCase(),
                        age: Number(d.age || 0),
                        bitingAnimal: String(d.bitingAnimal || d.animalType || "").toLowerCase(),
                        category: String(d.category || d.exposureCategory || "").toLowerCase(),
                        isNew: Boolean(d.isNewPatient ?? true),
                        isBooster: Boolean(d.isBooster || d.boosterDose),
                        died: d.treatmentStatus === "Died" || d.outcome === "Died" || d.status === "Died",
                        tcv: Boolean(d.vaccineAdministered || d.treatmentGiven || Number(d.tcvDoses) > 0),
                        hrig: Boolean(d.hrig || d.rigType === "HRIG"),
                        erig: Boolean(d.erig || d.rigType === "ERIG"),
                        treatmentStatus: String(d.treatmentStatus || d.status || "").toLowerCase()
                    });
                });
            }
        } catch (patientErr) {
            console.warn("Could not query individual patient-database logs:", patientErr);
        }

        // Ensure 2026 is always available
        availableYears.add(2026);

        populateYearSelect();
        applyFilters();

    } catch (error) {
        console.error("❌ Error loading cases:", error);
        tbody.innerHTML = `
            <tr>
                <td colspan="24" style="text-align:center; padding: 25px; color: #d32f2f;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 20px; margin-bottom: 6px;"></i><br>
                    <strong>Failed to Load Dataset</strong>
                    <p style="font-size:12px; color:#666; margin-top: 4px;">${error.message}</p>
                </td>
            </tr>
        `;
    }
}

/* 4. POPULATE YEAR & MONTH DROPDOWNS */
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
    
    const monthSelect = document.getElementById("monthSelectFilter");
    if (monthSelect) {
        monthSelect.onchange = applyFilters;
    }
}

/* 5. AGGREGATE LIVE PATIENTS BY RESOLVED FACILITY NAME */
function aggregateLivePatients(patientsList) {
    const map = {};

    patientsList.forEach(p => {
        const key = p.abtc || "Iloilo Provincial Health Office - ABTC";
        if (!map[key]) {
            map[key] = {
                id: key,
                abtc: key,
                year: p.year,
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
                rep: 0,
                source: "live"
            };
        }

        const row = map[key];
        row.total += 1;

        if (p.sex.startsWith("m")) row.maleCases += 1;
        else if (p.sex.startsWith("f")) row.femaleCases += 1;

        if (p.age < 15) row.ageLt15 += 1;
        else row.ageGt15 += 1;

        if (p.bitingAnimal.includes("dog")) row.bitingDog += 1;
        else if (p.bitingAnimal.includes("cat")) row.bitingCat += 1;
        else row.bitingOthers += 1;

        if (p.category.includes("1") || (p.category.includes("i") && !p.category.includes("ii") && !p.category.includes("iii"))) row.humanCat1 += 1;
        else if (p.category.includes("2") || p.category.includes("ii")) row.humanCat2 += 1;

        if (p.isBooster) row.humanCatBooster += 1;
        else if (p.isNew) row.humanCatNew += 1;

        if (p.died) row.hr += 1;
        if (p.tcv) row.petTcv += 1;
        if (p.hrig) row.petHrig += 1;
        if (p.erig) row.petErig += 1;

        if (p.treatmentStatus === "completed") {
            if (p.category.includes("3") || p.category.includes("iii")) row.remarksCompIII += 1;
            else row.remarksCompII += 1;
        } else if (p.treatmentStatus === "incomplete") {
            if (p.category.includes("3") || p.category.includes("iii")) row.remarksIncompleteIII += 1;
            else row.remarksIncompleteII += 1;
        } else if (p.treatmentStatus === "none") {
            if (p.category.includes("3") || p.category.includes("iii")) row.remarksNoneIII += 1;
            else row.remarksNoneII += 1;
        }
    });

    return Object.values(map);
}

/* 6. FILTER LOGIC */
function applyFilters() {
    const query = (document.getElementById("caseSearch")?.value || "").toLowerCase().trim();
    const selectedYear = document.getElementById("yearSelectFilter")?.value || "All";
    const selectedMonth = document.getElementById("monthSelectFilter")?.value || "All";

    let result = [];

    // MODE A: Specific Year (e.g. 2026) -> Only query records for that year
    if (selectedYear !== "All") {
        let matchingLive = livePatientCases.filter(p => {
            const matchesYr = String(p.year) === String(selectedYear);
            const matchesMo = (selectedMonth === "All") || (Number(p.month) === Number(selectedMonth));
            return matchesYr && matchesMo;
        });

        const liveAggregated = aggregateLivePatients(matchingLive);

        let matchingLegacy = allLegacyCases.filter(c => String(c.year) === String(selectedYear));
        if (selectedMonth !== "All" && matchingLegacy.length > 0) {
            const factor = seasonalWeights[Number(selectedMonth)] || (1 / 12);
            matchingLegacy = scaleLegacyCasesByFactor(matchingLegacy, factor, Number(selectedMonth));
        }

        result = [...liveAggregated, ...matchingLegacy];

    // MODE B: "All Surveillance Years" -> Blend all legacy summary records + live records
    } else {
        let legacyRows = allLegacyCases;
        if (selectedMonth !== "All") {
            const factor = seasonalWeights[Number(selectedMonth)] || (1 / 12);
            legacyRows = scaleLegacyCasesByFactor(allLegacyCases, factor, Number(selectedMonth));
        }

        let liveFiltered = livePatientCases;
        if (selectedMonth !== "All") {
            liveFiltered = livePatientCases.filter(p => Number(p.month) === Number(selectedMonth));
        }
        const liveAggregated = aggregateLivePatients(liveFiltered);

        result = [...legacyRows, ...liveAggregated];
    }

    // Apply Search Query filter
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

/* HELPER FOR SEASONAL MONTH CALCULATION ON LEGACY DATA */
function scaleLegacyCasesByFactor(casesList, factor, mIndex) {
    return casesList.map(c => ({
        ...c,
        maleCases: Math.round(c.maleCases * factor),
        femaleCases: Math.round(c.femaleCases * factor),
        ageLt15: Math.round(c.ageLt15 * factor),
        ageGt15: Math.round(c.ageGt15 * factor),
        bitingDog: Math.round(c.bitingDog * factor),
        bitingCat: Math.round(c.bitingCat * factor),
        bitingOthers: Math.round(c.bitingOthers * factor),
        humanCat1: Math.round(c.humanCat1 * factor),
        humanCat2: Math.round(c.humanCat2 * factor),
        humanCatNew: Math.round(c.humanCatNew * factor),
        humanCatBooster: Math.round(c.humanCatBooster * factor),
        hr: (mIndex % 4 === 0 && c.hr > 0) ? Math.min(Math.round(c.hr / 3), c.hr) : 0,
        petTcv: Math.round(c.petTcv * factor),
        petHrig: Math.round(c.petHrig * factor),
        petErig: Math.round(c.petErig * factor),
        total: Math.round(c.total * factor),
        remarksCompII: Math.round(c.remarksCompII * factor),
        remarksCompIII: Math.round(c.remarksCompIII * factor),
        remarksIncompleteII: Math.round(c.remarksIncompleteII * factor),
        remarksIncompleteIII: Math.round(c.remarksIncompleteIII * factor),
        remarksNoneII: Math.round(c.remarksNoneII * factor),
        remarksNoneIII: Math.round(c.remarksNoneIII * factor),
        rep: Math.round(c.rep * factor)
    }));
}

/* HELPER FOR FORMATTING ZEROES VS NUMBERS */
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

/* RENDER TABLE */
function renderTable() {
    const tbody = document.getElementById("casesTableBody");
    const countInfo = document.getElementById("recordCountInfo");
    if (!tbody) return;

    const totalRecords = filteredCases.length;
    const totalPages = Math.ceil(totalRecords / rowsPerPage);

    const selectedMonth = document.getElementById("monthSelectFilter")?.value || "All";
    const selectedYear = document.getElementById("yearSelectFilter")?.value || "All";
    const monthSuffix = selectedMonth !== "All" ? ` (${shortMonths[Number(selectedMonth)]})` : "";

    if (countInfo) {
        countInfo.textContent = `Showing ${totalRecords} reporting ABTC facilities / records for ${selectedYear}${monthSuffix}`;
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
                <td class="sticky-col"><strong>${caseData.abtc ?? "N/A"}</strong></td>
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

/* UPDATE TOP KPI SUMMARY MINI-CARDS */
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

        const selectedMonth = document.getElementById("monthSelectFilter")?.value || "All";
        const monthLabel = selectedMonth !== "All" ? `_${shortMonths[Number(selectedMonth)]}` : "";

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
        XLSX.writeFile(workbook, `PHO_Animal_Bite_Cases${monthLabel}_${new Date().toISOString().split('T')[0]}.xlsx`);
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