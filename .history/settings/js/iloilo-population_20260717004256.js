// =========================================================================
// 📄 iloilo-population.js (Mapped to your exact HTML)
// =========================================================================

import { db } from './settings-firebase.js'; 
import { 
    collection, 
    addDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// DOM Elements mapped to your exact HTML structure
const fileInput = document.getElementById('populationDataFile');
const uploadLabel = document.getElementById('popUploadLabel');
const uploadLabelText = document.getElementById('uploadLabelText');
const fileInfo = document.getElementById('popFileInfo');
const fileNameSpan = document.getElementById('popFileName');
const fileSizeSpan = document.getElementById('popFileSize');
const uploadBtn = document.getElementById('btnUploadPopulation');

let selectedFile = null;

// =========================================================================
// 1. File Selection Event Handlers
// =========================================================================
function initializeEventListeners() {
    if (!fileInput) {
        console.warn("⚠️ Element 'populationDataFile' not found on this page. Skipping initialization.");
        return;
    }

    // Clear input value on click so 'change' fires even if selecting the same file twice
    fileInput.addEventListener('click', () => {
        fileInput.value = null;
    });

    fileInput.addEventListener('change', handleFileSelection);
}

// =========================================================================
// 2. Display Selected File Name & Size
// =========================================================================
function handleFileSelection() {
    const file = fileInput.files[0];
    if (file) {
        selectedFile = file;

        // Update the custom label text to show selection
        if (uploadLabelText) {
            uploadLabelText.textContent = "Change selected file...";
        }

        // Display metadata box
        if (fileNameSpan && fileSizeSpan && fileInfo) {
            fileNameSpan.textContent = file.name;
            fileNameSpan.style.wordBreak = 'break-all';
            fileSizeSpan.textContent = `(${formatBytes(file.size)})`;
            fileInfo.style.display = 'block';
        }

        // Enable the upload process button
        if (uploadBtn) {
            uploadBtn.disabled = false;
        }
    }
}

// Helper to format bytes cleanly
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// =========================================================================
// 3. Document Import execution
// =========================================================================
if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Processing upload...';

        try {
            // --- PARSING PLACEHOLDER ---
            // (You can run PapaParse or custom extraction on selectedFile here)

            // Save transaction record to Firestore
            await logImportHistory(selectedFile.name, selectedFile.size, 'Success');
            
            alert('Population dataset uploaded and processed successfully!');

            // Reset UI State
            selectedFile = null;
            if (fileInfo) fileInfo.style.display = 'none';
            if (uploadLabelText) uploadLabelText.textContent = 'Click to upload (CSV, XLSX, max 10MB)';
            uploadBtn.textContent = 'Upload & Process';
            uploadBtn.disabled = true;

        } catch (error) {
            console.error("Database upload failed: ", error);
            await logImportHistory(selectedFile.name, selectedFile.size, 'Failed');
            alert('Upload failed. Please ensure your file structure is valid.');
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload & Process';
        }
    });
}

// =========================================================================
// 4. Save Record to Firestore History
// =========================================================================
async function logImportHistory(filename, size, status) {
    try {
        await addDoc(collection(db, "population_import_history"), {
            timestamp: new Date(),
            fileName: filename,
            fileSize: formatBytes(size),
            status: status
        });
    } catch (e) {
        console.error("Error writing to import log: ", e);
    }
}

// Run initial configurations safely
initializeEventListeners();