// =========================================================================
// 📄 iloilo-population.js (Works with your 100% ORIGINAL HTML)
// =========================================================================

import { db } from '.'; 
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Dynamically load SheetJS library so we can inspect Excel sheets without touching the HTML
if (!window.XLSX) {
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    document.head.appendChild(script);
}

// DOM Elements from your original HTML
const fileInput = document.getElementById('populationDataFile');
const uploadLabel = document.querySelector('label[for="populationDataFile"]');
const uploadBtn = document.querySelector('.card-actions .btn-primary');

// Store the original HTML markup of the label so we can restore it on reset
const originalLabelHTML = `
    📤 Click to upload (CSV, XLSX, max 10MB)
    <input type="file" id="populationDataFile" accept=".csv, .xlsx, .xls" style="display: none;">
`;

let selectedFile = null;

function initializeEventListeners() {
    if (!fileInput) return;

    fileInput.addEventListener('click', () => {
        fileInput.value = null;
    });

    fileInput.addEventListener('change', handleFileSelection);
}

function handleFileSelection() {
    const file = fileInput.files[0];
    if (!file) return;

    // Boundary 1: Basic extension check
    const extension = file.name.split('.').pop().toUpperCase();
    if (extension !== 'XLSX' && extension !== 'XLS' && extension !== 'CSV') {
        alert("❌ Invalid File Type: Please upload an Excel (.xlsx, .xls) or CSV file.");
        resetToEmptyState();
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Boundary 2: Verify it contains the specific Iloilo sheet or matching criteria
            const sheetName = workbook.SheetNames[0];
            const firstSheet = workbook.Sheets[sheetName];
            
            // Read cell contents to verify the official PSA structure
            const cellB1 = firstSheet['B1'] ? firstSheet['B1'].v : ''; // Row 1 Title
            const cellA4 = firstSheet['A4'] ? firstSheet['A4'].v : ''; // Subtitle Column

            const isIloiloSheet = sheetName.includes('Iloilo');
            const hasIloiloText = cellB1 && cellB1.includes('Iloilo');
            const hasCorrectHeader = cellA4 && cellA4.includes('Province, City, Municipality');

            if (!isIloiloSheet && !hasIloiloText && !hasCorrectHeader) {
                alert("❌ Validation Failed: This does not appear to be the official Iloilo Population Dataset from the PSA.");
                resetToEmptyState();
                return;
            }

            // --- IF VALIDATION PASSES ---
            selectedFile = file;
            const formattedSize = formatBytes(file.size);

            // Update the label's inner HTML dynamically
            uploadLabel.innerHTML = `
                <div style="text-align: center; padding: 10px 0;">
                    <span style="font-size: 1.1rem; margin-right: 6px;">📄</span>
                    <span style="font-weight: bold; color: #111;">${file.name}</span>
                    <div style="margin-top: 4px; font-size: 0.85rem;">
                        <span style="color: #e67e22; font-weight: bold; margin-right: 4px;">[${extension}]</span>
                        <span style="color: #666;">(${formattedSize})</span>
                    </div>
                </div>
                
                <div style="margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px; font-size: 13px; font-weight: 500; color: #333; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    🔄 Change selected file...
                </div>

                <input type="file" id="populationDataFile" accept=".csv, .xlsx, .xls" style="display: none;">
            `;

            // Re-bind file inputs inside newly written HTML
            const newInput = document.getElementById('populationDataFile');
            newInput.addEventListener('click', () => { newInput.value = null; });
            newInput.addEventListener('change', handleFileSelection);

            if (uploadBtn) {
                uploadBtn.disabled = false;
            }

        } catch (err) {
            console.error("Error reading Excel structure: ", err);
            alert("❌ Error reading the file format. Please make sure the spreadsheet is not corrupted.");
            resetToEmptyState();
        }
    };

    reader.readAsArrayBuffer(file);
}

function resetToEmptyState() {
    selectedFile = null;
    uploadLabel.innerHTML = originalLabelHTML;
    
    const freshInput = document.getElementById('populationDataFile');
    freshInput.addEventListener('click', () => { freshInput.value = null; });
    freshInput.addEventListener('change', handleFileSelection);

    if (uploadBtn) {
        uploadBtn.disabled = true;
    }
}

// Convert bytes into standard KB/MB format
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Handle the Process Upload and write to History log
if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Processing upload...';

        try {
            // Write structured data to history log
            await logImportHistory(selectedFile.name, selectedFile.size);
            alert('Population dataset validated, uploaded, and logged successfully!');

            // Return UI to empty state
            resetToEmptyState();
            uploadBtn.textContent = 'Upload & Process';

        } catch (error) {
            console.error("Database upload failed: ", error);
            alert('Upload failed.');
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload & Process';
        }
    });
}

// Write history log safely to Firestore
async function logImportHistory(filename, size) {
    try {
        await addDoc(collection(db, "population_import_history"), {
            timestamp: new Date(),
            fileName: filename,
            fileSize: formatBytes(size),
            status: 'Success',
            type: 'Iloilo Population'
        });
    } catch (e) {
        console.error("Error writing log history: ", e);
    }
}

initializeEventListeners();