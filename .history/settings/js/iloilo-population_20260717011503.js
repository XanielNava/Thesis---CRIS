// =========================================================================
// 📄 iloilo-population.js
// =========================================================================

import { db } from '../jssettings-firebase.js'; 
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// DOM Elements
const fileInput = document.getElementById('populationDataFile');
const emptyState = document.getElementById('popEmptyState');
const selectedState = document.getElementById('popSelectedState');
const changeActionBox = document.getElementById('popChangeActionBox');
const fileNameSpan = document.getElementById('popFileName');
const fileExtSpan = document.getElementById('popFileExt');
const fileSizeSpan = document.getElementById('popFileSize');
const uploadBtn = document.getElementById('btnUploadPopulation');

let selectedFile = null;

function initializeEventListeners() {
    if (!fileInput) return;

    // Reset the input value so selecting the same file again still fires change events
    fileInput.addEventListener('click', () => {
        fileInput.value = null;
    });

    fileInput.addEventListener('change', handleFileSelection);
}

function handleFileSelection() {
    const file = fileInput.files[0];
    if (file) {
        selectedFile = file;

        // Parse file extension (e.g. "spreadsheet.xlsx" -> "XLSX")
        const extension = file.name.split('.').pop().toUpperCase();

        // 1. Swap visual layouts inside the dashed container
        if (emptyState) emptyState.style.display = 'none';
        if (selectedState) selectedState.style.display = 'block';

        // 2. Show the "Change selected file..." box below
        if (changeActionBox) changeActionBox.style.display = 'block';

        // 3. Populate metadata details
        if (fileNameSpan) fileNameSpan.textContent = file.name;
        if (fileExtSpan) fileExtSpan.textContent = `[${extension}]`;
        if (fileSizeSpan) fileSizeSpan.textContent = `(${formatBytes(file.size)})`;

        // 4. Enable the Action Button
        if (uploadBtn) {
            uploadBtn.disabled = false;
        }
    }
}

// Convert file size to readable units
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Processing upload...';

        try {
            await logImportHistory(selectedFile.name, selectedFile.size);
            alert('Population dataset uploaded and processed successfully!');

            // Reset components back to empty state
            selectedFile = null;
            if (selectedState) selectedState.style.display = 'none';
            if (changeActionBox) changeActionBox.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
            
            uploadBtn.textContent = 'Upload & Process';
            uploadBtn.disabled = true;

        } catch (error) {
            console.error("Database upload failed: ", error);
            alert('Upload failed.');
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload & Process';
        }
    });
}

async function logImportHistory(filename, size) {
    try {
        await addDoc(collection(db, "population_import_history"), {
            timestamp: new Date(),
            fileName: filename,
            fileSize: formatBytes(size),
            status: 'Success'
        });
    } catch (e) {
        console.error("Error writing log history: ", e);
    }
}

initializeEventListeners();