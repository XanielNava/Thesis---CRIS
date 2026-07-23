// iloilo-population.js

import { db } from './settings-firebase.js'; 
import { collection, addDoc, getDocs, orderBy, query, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// DOM Elements
const uploadZone = document.getElementById('popUploadZone');
const fileInput = document.getElementById('popFileInput');
const browseBtn = document.getElementById('popBrowseBtn');
const fileInfo = document.getElementById('popFileInfo');
const fileNameSpan = document.getElementById('popFileName');
const fileSizeSpan = document.getElementById('popFileSize');
const importBtn = document.getElementById('btnImportPopulation');
const historyBody = document.getElementById('popHistoryBody');

let selectedFile = null;

// 1. Trigger File Inputs
browseBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', handleFileSelection);

// Drag & Drop Handlers
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = 'var(--primary-color, #007bff)';
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.style.borderColor = '#ccc';
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '#ccc';
    if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelection();
    }
});

// 2. Handle Selected File & Display Name/Size
function handleFileSelection() {
    const file = fileInput.files[0];
    if (file) {
        selectedFile = file;
        fileNameSpan.textContent = file.name;
        fileSizeSpan.textContent = `(${formatBytes(file.size)})`;
        
        fileInfo.style.display = 'block';
        importBtn.disabled = false; // Enable import button
    }
}

// Helper to format file sizes nicely
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 3. Handle the Data Import & Log to History Collection
importBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    // Change button UI to show progress
    importBtn.disabled = true;
    importBtn.textContent = 'Importing...';

    try {
        // --- PARSING PLACEHOLDER ---
        // Insert PapaParse (for CSV) or SheetJS (for XLSX) parsing logic here.
        // e.g., const parsedData = await parseFile(selectedFile);
        
        // --- FIRESTORE WRITING ---
        // Batch write parsed population data to 'iloilo_population' collection
        
        // Log this transaction to the Import History collection
        await logImportHistory(selectedFile.name, selectedFile.size, 'Success');
        
        alert('Population data imported successfully!');
        
        // Reset UI
        fileInfo.style.display = 'none';
        selectedFile = null;
        importBtn.textContent = 'Import Population Data';
        
        // Reload the history log
        loadImportHistory();

    } catch (error) {
        console.error("Import failed: ", error);
        await logImportHistory(selectedFile.name, selectedFile.size, 'Failed');
        alert('Import failed. Please check the file format.');
        importBtn.disabled = false;
        importBtn.textContent = 'Import Population Data';
    }
});

// 4. Save Transaction to Firestore History
async function logImportHistory(filename, size, status) {
    try {
        await addDoc(collection(db, "population_import_history"), {
            timestamp: new Date(),
            fileName: filename,
            fileSize: formatBytes(size),
            status: status
        });
    } catch (e) {
        console.error("Error logging history: ", e);
    }
}

// 5. Load History on Page Load
async function loadImportHistory() {
    try {
        const q = query(collection(db, "population_import_history"), orderBy("timestamp", "desc"), limit(5));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            historyBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 15px; color: #888;">No import history found.</td></tr>`;
            return;
        }

        historyBody.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const dateStr = data.timestamp.toDate().toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            
            const statusColor = data.status === 'Success' ? '#28a745' : '#dc3545';

            historyBody.innerHTML += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 8px;">${dateStr}</td>
                    <td style="padding: 8px; font-weight: 500;">${data.fileName}</td>
                    <td style="padding: 8px; color: #555;">${data.fileSize}</td>
                    <td style="padding: 8px; font-weight: bold; color: ${statusColor};">${data.status}</td>
                </tr>
            `;
        });
    } catch (e) {
        console.error("Error loading history: ", e);
    }
}

// Initialize history on load
loadImportHistory();