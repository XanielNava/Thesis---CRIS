/* ================================
   PAGINATION SETTINGS
================================ */
const rowsPerPage = 20;
let currentPage = 1;
let allCases = [];

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

    const totalRecords = allCases.length;
    const totalPages = Math.ceil(totalRecords / rowsPerPage);

    // Empty State
    if (totalRecords === 0) {

        info.textContent = "Showing 0 of 0 records";

        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty">
                    No Animal Bite Reports Submitted
                </td>
            </tr>
        `;

        createPagination(0);
        return;
    }

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    const records = allCases.slice(start, end);

    info.textContent =
        `Showing ${start + 1}-${Math.min(end, totalRecords)} of ${totalRecords} records`;

    records.forEach(caseData => {

        tbody.innerHTML += `
            <tr>
                <td>${caseData.abtc ?? ""}</td>
                <td>${caseData.male ?? ""}</td>
                <td>${caseData.female ?? ""}</td>
                <td>${caseData.age ?? ""}</td>
                <td>${caseData.category1 ?? ""}</td>
                <td>${caseData.category2 ?? ""}</td>
                <td>${caseData.category3 ?? ""}</td>
            </tr>
        `;

    });

    createPagination(totalPages);

}

/* ================================
   PAGINATION
================================ */
function createPagination(totalPages) {

    const pagination = document.getElementById("pagination");

    pagination.innerHTML = "";

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

document.getElementById("csvBtn").addEventListener("click", exportCSV);

function exportCSV() {

    const table = document.getElementById("casesTable");

    let csv = [];

    for (const row of table.rows) {

        let cols = [];

        for (const cell of row.cells) {

            cols.push('"' + cell.innerText.replace(/"/g, '""') + '"');

        }

        csv.push(cols.join(","));

    }

    const blob = new Blob([csv.join("\n")], {
        type: "text/csv"
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = "Animal_Bite_Cases.csv";

    a.click();

    URL.revokeObjectURL(url);

}

document.getElementById("excelBtn").addEventListener("click", exportExcel);

function exportExcel() {

    const table = document.getElementById("casesTable");

    const workbook = XLSX.utils.table_to_book(table, {
        sheet: "Animal Bite Cases"
    });

    XLSX.writeFile(workbook, "Animal_Bite_Cases.xlsx");

}

document.getElementById("pdfBtn").addEventListener("click", exportPDF);

function exportPDF() {

    const { jsPDF } = window.jspdf;

    const doc = new jsPDF("landscape");

    doc.setFontSize(18);

    doc.text("Animal Bite Cases", 14, 15);

    doc.autoTable({
        html: "#casesTable",
        startY: 25,
        theme: "grid",
        styles: {
            fontSize: 9
        },
        headStyles: {
            fillColor: [234, 97, 19]
        }
    });

    doc.save("Animal_Bite_Cases.pdf");

}

/* ================================
   INITIALIZE
================================ */
loadCases();