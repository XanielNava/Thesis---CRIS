// =========================================================================
// 📄 iloilo-population.js (Integrated Firestore Write)
// =========================================================================

import { db } from '.,/settings-firebase.js'; 
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Dynamically load SheetJS library so we can inspect Excel sheets without touching the HTML
if (!window.XLSX) {
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    document.head.appendChild(script);
}

// 1. Scope the DOM elements within the Population Card specifically
let populationCardElement = null;
const headings = document.querySelectorAll('h3.card-title');
for (const h3 of headings) {
    if (h3.textContent.includes('Import Iloilo Province Population')) {
        populationCardElement = h3.closest('section.card');
        break;
    }
}

const fileInput = populationCardElement ? populationCardElement.querySelector('#populationDataFile') : null;
const uploadLabel = populationCardElement ? populationCardElement.querySelector('label.file-upload') : null;
const uploadBtn = populationCardElement ? populationCardElement.querySelector('.card-actions .btn-primary') : null;

const originalLabelHTML = `
    📤 Click to upload (CSV, XLSX, max 10MB)
    <input type="file" id="populationDataFile" accept=".csv, .xlsx, .xls" style="display: none;">
`;

let selectedFile = null;

function initializeEventListeners() {
    if (!fileInput || !uploadBtn) return;

    uploadBtn.disabled = true;

    fileInput.addEventListener('click', () => {
        fileInput.value = null;
    });

    fileInput.addEventListener('change', handleFileSelection);
    uploadBtn.addEventListener('click', handleProcessUpload);
}

function handleFileSelection() {
    const file = fileInput.files[0];
    if (!file) return;

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

            const sheetName = workbook.SheetNames[0];
            const firstSheet = workbook.Sheets[sheetName];
            
            const cellB1 = firstSheet['B1'] ? firstSheet['B1'].v : ''; 
            const cellA4 = firstSheet['A4'] ? firstSheet['A4'].v : ''; 

            const isIloiloSheet = sheetName.includes('Iloilo');
            const hasIloiloText = cellB1 && cellB1.includes('Iloilo');
            const hasCorrectHeader = cellA4 && cellA4.includes('Province, City, Municipality');

            if (!isIloiloSheet && !hasIloiloText && !hasCorrectHeader) {
                alert("❌ Validation Failed: This does not appear to be the official Iloilo Population Dataset.");
                resetToEmptyState();
                return;
            }

            // --- VALIDATION SUCCESSFUL ---
            selectedFile = file;
            const formattedSize = formatBytes(file.size);

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

            const newInput = populationCardElement.querySelector('#populationDataFile');
            newInput.addEventListener('click', () => { newInput.value = null; });
            newInput.addEventListener('change', handleFileSelection);

            if (uploadBtn) {
                uploadBtn.disabled = false;
            }

        } catch (err) {
            console.error("Error reading spreadsheet: ", err);
            alert("❌ Error reading file format.");
            resetToEmptyState();
        }
    };

    reader.readAsArrayBuffer(file);
}

function resetToEmptyState() {
    selectedFile = null;
    uploadLabel.innerHTML = originalLabelHTML;
    
    const freshInput = populationCardElement.querySelector('#populationDataFile');
    freshInput.addEventListener('click', () => { freshInput.value = null; });
    freshInput.addEventListener('change', handleFileSelection);

    if (uploadBtn) {
        uploadBtn.disabled = true;
    }
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// =========================================================================
// 🚀 FIRESTORE INTEGRATION & SIGNALING
// =========================================================================
async function handleProcessUpload() {
    if (!selectedFile) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Processing upload...';

    try {
        // 1. Log to the common collection
        await logImportHistory(selectedFile.name, selectedFile.size);
        
        // 2. Dispatch a notification event to trigger the main UI history table to update instantly
        const refreshEvent = new CustomEvent("importHistoryUpdated");
        document.dispatchEvent(refreshEvent);

        alert('Population dataset processed and added to Import History!');
        resetToEmptyState();
        uploadBtn.textContent = 'Upload & Process';

    } catch (error) {
        console.error("Database upload failed: ", error);
        alert('Upload failed: ' + error.message);
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload & Process';
    }
}

async function logImportHistory(filename, size) {
    try {
        // Writes to the primary import_history collection
        // Adjust "import_history" here if your Case Data logging script uses a slightly different collection name!
        await addDoc(collection(db, "import_history"), {
            timestamp: serverTimestamp(),
            fileName: filename,
            fileSize: formatBytes(size),
            status: 'Success',
            type: 'Iloilo Population' // This allows you to easily filter/identify it later
        });
    } catch (e) {
        console.error("Error writing to Firestore: ", e);
        throw e;
    }
}

initializeEventListeners();