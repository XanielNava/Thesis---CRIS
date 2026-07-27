// ==============================================================================
// pho-animal-bite-cases.js - PHO Animal Bite Cases Ledger Controller
// ==============================================================================

// 1. Direct CDN Imports from Firebase Web SDK 10.8.0
// import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
// import { 
//     getFirestore, 
//     collection, 
//     getDocs, 
//     connectFirestoreEmulator 
// } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// import { 
//     getAuth, 
//     connectAuthEmulator 
// } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// // 2. Firebase Configuration
// const firebaseConfig = {
//     apiKey: "AIzaSyBfqjfJoGz591aI8TJjhIS3T4OEvQxX11Y",
//     authDomain: "cris-database-da989.firebaseapp.com",
//     databaseURL: "https://cris-database-da989-default-rtdb.asia-southeast1.firebasedatabase.app",
//     projectId: "cris-database-da989",
//     storageBucket: "cris-database-da989.firebasestorage.app",
//     messagingSenderId: "627885439681",
//     appId: "1:627885439681:web:3c657d64c0aad9b4913240",
//     measurementId: "G-0X99BH7GW4"
// };

// 3. Initialize Firebase Services
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 🧪 4. DIRECT LOCAL EMULATOR CONNECTION
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');

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
        console.log("🔄 Loading cases from pho-database/main/legacy-summary...");
        
        // Fetch from new structured subcollection
        let legacyCollection = collection(db, "pho-database", "main", "legacy-summary");
        let snapshot = await getDocs(legacyCollection);

        // Fallback to legacy collection path if subcollection is empty
        if (snapshot.empty) {
            console.warn("⚠️ Subcollection empty, trying top-level pho_rabies_cases...");
            legacyCollection = collection(db, "pho_rabies_cases");
            snapshot = await getDocs(legacyCollection);
        }
        
        console.log(`📊 Firestore returned ${snapshot.size} documents`);
        
        if (snapshot.empty) {
            console.warn("⚠️ No cases found in legacy summary dataset");
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
            
            // Check if stored as rawData array or standard object fields
            if (data.rawData && Array.isArray(data.rawData)) {
                const row = data.rawData;
                allCases.push({
                    id: docSnap.id,
                    abtc: row[0] || docSnap.id || "Unknown",
                    year: data.year || new Date().getFullYear(),
                    
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
                allCases.push({
                    id: docSnap.id,
                    abtc: data.facilityName || data.municipality || docSnap.id || "Unknown",
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
            }
        });

        // Preserve upload sequence
        allCases.sort((a, b) => a.documentOrder - b.documentOrder);
        filteredCases = [...allCases];

        console.log(`✅ Loaded ${allCases.length} facility records`);
        renderTable();

    } catch (error) {
        console.error("❌ Error loading cases:", error);
        
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
                        <p style="font-size:12px; color:#888; margin-top:4px;">Import legacy data from Settings to populate this table.</p>
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

    // Render table rows
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

    // Calculate totals across filtered dataset
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
    console.log("🚀 Animal Bite Cases ledger initializing...");
    loadCases();
});