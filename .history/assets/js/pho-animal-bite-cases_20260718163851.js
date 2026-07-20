let rowsPerPage = 20;
let currentPage = 1;
let allCases = [];
let filteredCases = [];

/* FIREBASE */
import {
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

/* LOAD DATA FROM FIRESTORE - rabies_cases COLLECTION */
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
            <td colspan="20">
                <div class="table-placeholder">
                    <i class="fa-solid fa-circle-notch fa-spin"></i>
                    <strong>Accessing Database Logs</strong>
                    <p style="font-size:12px; color:#888; margin-top:4px;">Retrieving provincial medical metrics over secure socket...</p>
                </div>
            </td>
        </tr>
    `;

    try {
        console.log("🔄 Loading cases from rabies_cases collection...");
        const snapshot = await getDocs(collection(db, "rabies_cases"));
        
        if (snapshot.empty) {
            console.warn("⚠️ No cases found in rabies_cases collection");
            allCases = [];
            filteredCases = [];
            renderTable();
            return;
        }

        allCases = [];
        
        // Group data by facility and year
        const facilitiesMap = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Map Firebase fields to UI expected fields
            const facility = data.facilityName || "Unknown";
            const year = data.year || new Date().getFullYear();
            const key = `${facility}_${year}`;
            
            if (!facilitiesMap[key]) {
                facilitiesMap[key] = {
                    id: doc.id,
                    abtc: facility,
                    year: year,
                    male: 0,
                    female: 0,
                    maleCasesBreakdown: {},
                    femaleCasesBreakdown: {},
                    totalCases: 0
                };
            }

            // Accumulate male and female cases
            facilitiesMap[key].male += Number(data.maleCases || 0);
            facilitiesMap[key].female += Number(data.femaleCases || 0);
            facilitiesMap[key].totalCases += Number(data.totalCases || 0);
        });

        // Convert map to array
        allCases = Object.values(facilitiesMap);
        filteredCases = [...allCases];

        console.log(`✅ Loaded ${allCases.length} facility records`);
        renderTable();

    } catch (error) {
        console.error("❌ Error loading cases:", error);
        if (info) {
            info.textContent = "Error running query";
        }
        tbody.innerHTML = `
            <tr>
                <td colspan="20">
                    <div class="table-placeholder error">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <strong style="color:#D32F2F;">Failed to Load Dataset</strong>
                        <p style="font-size:12px; color:#888; margin-top:4px;">Please check network connection or Firebase security rules.</p>
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
                <td colspan="20">
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
                <td><strong>${caseData.abtc ?? "N/A"}</strong></td>
                <td>${caseData.male ?? 0}</td>
                <td>${caseData.female ?? 0}</td>
                <td>${caseData.year ?? "—"}</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
            </tr>
        `;
    });

    // Calculate totals
    let sumMale = 0, sumFemale = 0;
    filteredCases.forEach(c => {
        sumMale += Number(c.male ?? 0);
        sumFemale += Number(c.female ?? 0);
    });

    tbody.innerHTML += `
        <tr style="background-color: #FFE3B3; font-weight: bold; border-top: 2px solid #EA6113; position: sticky; bottom: 0; z-index: 5;">
            <td>TOTAL (Filtered Summary)</td>
            <td>${sumMale}</td>
            <td>${sumFemale}</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
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

/* EXPORT BUTTONS */

// CSV
const csvBtn = document.getElementById("csvBtn");
if (csvBtn) {
    csvBtn.addEventListener("click", () => {
        const headers = ["ABTC", "Male", "Female", "Year"];
        let csvRows = [headers.map(h => `"${h}"`).join(",")];

        filteredCases.forEach(c => {
            csvRows.push([
                `"${String(c.abtc ?? "").replace(/"/g, '""')}"`,
                c.male ?? 0,
                c.female ?? 0,
                c.year ?? ""
            ].join(","));
        });

        const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "CRIS_Animal_Bite_Cases.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

// Excel
const excelBtn = document.getElementById("excelBtn");
if (excelBtn) {
    excelBtn.addEventListener("click", () => {
        const headers = [["ABTC", "Male", "Female", "Year"]];
        const dataRows = filteredCases.map(c => [
            c.abtc ?? "", c.male ?? 0, c.female ?? 0, c.year ?? ""
        ]);
        const worksheet = XLSX.utils.aoa_to_sheet(headers.concat(dataRows));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Bite Metrics Ledger");
        XLSX.writeFile(workbook, "CRIS_Animal_Bite_Cases.xlsx");
    });
}

// PDF
const pdfBtn = document.getElementById("pdfBtn");
if (pdfBtn) {
    pdfBtn.addEventListener("click", () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF("portrait", "pt", "a4");

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(14);
        doc.text("Community-Centric Rabies Intelligence System (CRIS)", 40, 40);
        doc.setFontSize(10);
        doc.setFont("Helvetica", "normal");
        doc.text("PHO Module - Animal Bite Aggregation Cases Summary", 40, 54);

        const headers = [["ABTC", "Male", "Female", "Year"]];
        const bodyRows = filteredCases.map(c => [
            c.abtc ?? "", c.male ?? 0, c.female ?? 0, c.year ?? ""
        ]);

        doc.autoTable({
            head: headers,
            body: bodyRows,
            startY: 70,
            theme: "striped",
            headStyles: { fillColor: [234, 97, 19] },
            styles: { fontSize: 9 }
        });

        doc.save("CRIS_Animal_Bite_Cases.pdf");
    });
}

// Print
const printBtn = document.getElementById("printBtn");
if (printBtn) {
    printBtn.addEventListener("click", () => {
        const win = window.open("", "", "width=1200,height=700");
        let tableRows = filteredCases.map(c => `
            <tr>
                <td><strong>${c.abtc ?? ""}</strong></td>
                <td>${c.male ?? 0}</td>
                <td>${c.female ?? 0}</td>
                <td>${c.year ?? ""}</td>
            </tr>
        `).join("");

        win.document.write(`
            <html>
            <head>
                <title>CRIS - Bite Cases Extract</title>
                <style>
                    body { font-family: sans-serif; padding: 25px; color: #412110; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 11px; }
                    th { background-color: #EA6113; color: white; }
                    tr:nth-child(even) { background-color: #f9f9f9; }
                </style>
            </head>
            <body>
                <h3>Community-Centric Rabies Intelligence System (CRIS)</h3>
                <p style="font-size: 12px; color: #666;">Dataset Ledger Extract: Provincial Health Office (PHO)</p>
                <table>
                    <thead>
                        <tr>
                        <th>ABTC</th><th>Male</th><th>Female</th><th>Year</th></tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </body>
            </html>
        `);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 250);
    });
}

/* LOAD INITIAL CASE DATA */
document.addEventListener('DOMContentLoaded', () => {
    loadCases();
});