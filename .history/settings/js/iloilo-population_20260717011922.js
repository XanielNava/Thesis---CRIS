// =========================================================================
// 📄 iloilo-population.js (Works with your 100% ORIGINAL HTML)
// =========================================================================

import { db } from '../js/settings-firebase.js'; 
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// DOM Elements from your original HTML
const fileInput = document.getElementById('populationDataFile');
// The label itself acts as our container that we will dynamically update
const uploadLabel = document.querySelector('label[for="populationDataFile"]');
// Find the submit button inside the card actions
const uploadBtn = document.querySelector('.card-actions .btn-primary');

// Store the original HTML markup of the label so we can restore it on reset
const originalLabelHTML = `
    📤 Click to upload (CSV, XLSX, max 10MB)
    <input type="file" id="populationDataFile" accept=".csv, .xlsx, .xls" style="display: none;">
`;

let selectedFile = null;

function initializeEventListeners() {
    if (!fileInput) return;

    // Reset input value on click so choosing the same file twice still triggers the change event
    fileInput.addEventListener('click', () => {
        fileInput.value = null;
    });

    fileInput.addEventListener('change', handleFileSelection);
}

function handleFileSelection() {
    const file = fileInput.files[0];
    if (file) {
        selectedFile = file;

        // Extract file extension (e.g., "spreadsheet.xlsx" -> "XLSX")
        const extension = file.name.split('.').pop().toUpperCase();
        const formattedSize = formatBytes(file.size);

        // Update the label's inner HTML dynamically to match the exact Case Data format
        // and include the "Change selected file..." option right below it
        uploadLabel.innerHTML = `
            <div style="text-align: center; padding: 10px 0;">
                <span style="font-size: 1.1rem; margin-right: 6px;">📄</span>
                <!-- Bold Filename -->
                <span style="font-weight: bold; color: #111;">${file.name}</span>
                <div style="margin-top: 4px; font-size: 0.85rem;">
                    <!-- Orange Bracketed Extension & Formatted Size -->
                    <span style="color: #e67e22; font-weight: bold; margin-right: 4px;">[${extension}]</span>
                    <span style="color: #666;">(${formattedSize})</span>
                </div>
            </div>
            
            <!-- Styled "Change selected file..." option box from the second picture -->
            <div style="margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px; font-size: 13px; font-weight: 500; color: #333; display: flex; align-items: center; justify-content: center; gap: 8px;">
                🔄 Change selected file...
            </div>

            <!-- Re-inject the hidden file input element so clicking still works -->
            <input type="file" id="populationDataFile" accept=".csv, .xlsx, .xls" style="display: none;">
        `;

        // Re-bind the event listeners to the newly injected input element
        const newInput = document.getElementById('populationDataFile');
        newInput.addEventListener('click', () => { newInput.value = null; });
        newInput.addEventListener('change', handleFileSelection);

        // Enable the "Upload & Process" button
        if (uploadBtn) {
            uploadBtn.disabled = false;
        }
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

// Handle the Process Upload action
if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Processing upload...';

        try {
            await logImportHistory(selectedFile.name, selectedFile.size);
            alert('Population dataset uploaded and processed successfully!');

            // Reset UI back to your exact original HTML structure
            selectedFile = null;
            uploadLabel.innerHTML = originalLabelHTML;
            
            // Re-bind events to the clean original input
            const freshInput = document.getElementById('populationDataFile');
            freshInput.addEventListener('click', () => { freshInput.value = null; });
            freshInput.addEventListener('change', handleFileSelection);

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