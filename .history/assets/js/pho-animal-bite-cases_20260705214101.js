/* ================================
   PAGINATION & SEARCH SETTINGS
================================ */
const rowsPerPage = 20;
let currentPage = 1;
let allCases = [];
let filteredCases = [];

/* ================================
   FIREBASE
================================ */
import {
    collection,
    getDocs
} from "firebase/firestore";

import { db } from "./firebase-config.js";

/* ================================
   LOAD DATA
================================ */
async function loadCases() {
    try {
        const snapshot = await getDocs(collection(db, "animal_bite_cases"));
        allCases = [];

        snapshot.forEach(doc => {
            allCases.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Initialize filtered list with full data load
        filteredCases = [...allCases];
        renderTable();
    } catch (error) {
        console.error("Error loading cases:", error);
    }
}

/* ================================
   RENDER TABLE
================================ */
function renderTable() {
    const tbody = document.getElementById("casesTableBody");
    const info = document.getElementById("recordInfo");

    tbody.innerHTML = "";

    const totalRecords = filteredCases.length;
    const totalPages = Math.ceil(totalRecords / rowsPerPage);

    // Empty State Handling
    if (totalRecords === 0) {
        info.textContent = "Showing 0 of 0 records";
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 30px; color: #888;">
                    No Animal Bite Reports Found
                </td>
            </tr>
        `;
        createPagination(0);
        return;
    }

    // Safeguard current page bounds on live filters
    if (currentPage > totalPages) {
        currentPage = Math.max(1, totalPages);
    }

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const records = filteredCases.slice(start, end);

    info.textContent = `Showing ${start + 1}-${Math.min(end, totalRecords)} of ${totalRecords} records`;

    records.forEach(caseData => {
        tbody.innerHTML += `
            <tr>
                <td>${caseData.abtc ?? ""}</td>
                <td>${caseData.male ?? 0}</td>
                <td>${caseData.female ?? 0}</td>
                <td>${caseData.age ?? ""}</td>
                <td>${caseData.category1 ?? 0}</td>
                <td>${caseData.category2 ?? 0}</td>
                <td>${caseData.category3 ?? 0}</td>
            </tr>
        `;
    });

    createPagination(totalPages);
}

/* ================================
   SEARCH FILTER LOGIC
================================ */
document.getElementById("caseSearch").addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();

    filteredCases = allCases.filter(caseData => {
        const abtcField = (caseData.abtc ?? "").toLowerCase();
        // Add additional field checks here if needed (e.g., municipality location matching)
        return abtcField.includes(query);
    });

    currentPage = 1; // Reset to page 1 on active filtering
    renderTable();
});

/* ================================
   PAGINATION BUILDER
================================ */
function createPagination(totalPages) {
    const pagination = document.getElementById("pagination");
    pagination.innerHTML = "";

    if (totalPages <= 1) return; // Hide pagination chrome if data fits entirely on one page

    // Previous Button
    const prev = document.createElement("button");
    prev.textContent = "Previous";
    prev.disabled = currentPage === 1;
    prev.onclick = () => {
        currentPage--;
        renderTable();
    };
    pagination.appendChild(prev);

    // Page Numbers
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement("button");
        btn.textContent = i;
        if (i === currentPage) {
            btn.classList.add("active");
        }
        btn.onclick = () => {
            currentPage = i;
            renderTable();
        };
        pagination.appendChild(btn);
    }

    // Next Button
    const next = document.createElement("button");
    next.textContent = "Next";
    next.disabled = currentPage === totalPages || totalPages === 0;
    next.onclick = () => {
        currentPage++;
        renderTable();
    };
    pagination.appendChild(next);
}

/* ================================
   EXPORTS (Processes Raw Full/Filtered Data Arrays)
================================ */

// 1. CSV Export
document.getElementById("csvBtn").addEventListener("click", () => {
    const headers = ["ABTC", "Male", "Female", "Age", "Category 1", "Category 2", "Category 3"];
    let csvRows = [headers.map(h => `"${h}"`).join(",")];

    filteredCases.forEach(c => {
        const row = [
            c.abtc ?? "",
            c.male ?? 0,
            c.female ?? 0,
            c.age ?? "",
            c.category1 ?? 0,
            c.category2 ?? 0,
            c.category3 ?? 0
        ];
        csvRows.push(row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
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

// 2. Excel Export (SheetJS)
document.getElementById("excelBtn").addEventListener("click", () => {
    const headers = [["ABTC", "Male", "Female", "Age", "Category 1", "Category 2", "Category 3"]];
    
    const rows = filteredCases.map(c => [
        c.abtc ?? "",
        c.male ?? 0,
        c.female ?? 0,
        c.age ?? "",
        c.category1 ?? 0,
        c.category2 ?? 0,
        c.category3 ?? 0
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet(headers.concat(rows));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bite Cases");
    XLSX.writeFile(workbook, "CRIS_Animal_Bite_Cases.xlsx");
});

// 3. PDF Export (jsPDF + AutoTable)
document.getElementById("pdfBtn").addEventListener("click", () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("landscape", "pt", "a4");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Community-Centric Rabies Intelligence System (CRIS)", 40, 40);
    doc.setFontSize(11);
    doc.setFont("Helvetica", "normal");
    doc.text("PHO Module - Animal Bite Cases Dataset Export", 40, 56);

    const headers = [["ABTC", "Male", "Female", "Age", "Category 1", "Category 2", "Category 3"]];
    const data = filteredCases.map(c => [
        c.abtc ?? "",
        c.male ?? 0,
        c.female ?? 0,
        c.age ?? "",
        c.category1 ?? 0,
        c.category2 ?? 0,
        c.category3 ?? 0
    ]);

    doc.autoTable({
        head: headers,
        body: data,
        startY: 75,
        theme: "grid",
        headStyles: { fillColor: [234, 97, 19] },
        styles: { fontSize: 9 }
    });

    doc.save("CRIS_Animal_Bite_Cases.pdf");
});

// 4. Print Table
document.getElementById("printBtn").addEventListener("click", () => {
    const win = window.open("", "", "width=1200,height=700");
    
    let tableRows = filteredCases.map(c => `
        <tr>
            <td>${c.abtc ?? ""}</td>
            <td>${c.male ?? 0}</td>
            <td>${c.female ?? 0}</td>
            <td>${c.age ?? ""}</td>
            <td>${c.category1 ?? 0}</td>
            <td>${c.category2 ?? 0}</td>
            <td>${c.category3 ?? 0}</td>
        </tr>
    `).join("");

    win.document.write(`
        <html>
        <head>
            <title>Animal Bite Cases Printout</title>
            <style>
                body { font-family: sans-serif; padding: 30px; color: #412110; }
                h2 { margin-bottom: 5px; }
                p { margin-top: 0; margin-bottom: 20px; font-size: 14px; color: #666; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 12px; }
                th { background-color: #EA6113; color: white; }
                tr:nth-child(even) { background-color: #f9f9f9; }
            </style>
        </head>
        <body>
            <h2>Community-Centric Rabies Intelligence System (CRIS)</h2>
            <p>Generated Report: PHO Animal Bite Cases Dataset</p>
            <table>
                <thead>
                    <tr>
                        <th>ABTC</th>
                        <th>Male</th>
                        <th>Female</th>
                        <th>Age</th>
                        <th>Category 1</th>
                        <th>Category 2</th>
                        <th>Category 3</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows ? tableRows : '<tr><td colspan="7" style="text-align:center;">No data records available to display.</td></tr>'}
                </tbody>
            </table>
        </body>
        </html>
    `);

    win.document.close();
    win.focus();
    // Tiny runtime timeout ensures CSS styles are processed before rendering the window layout print frame
    setTimeout(() => {
        win.print();
        win.close();
    }, 250);
});

/* ================================
   INITIALIZE APPLICATION FETCH
================================ */
loadCases();