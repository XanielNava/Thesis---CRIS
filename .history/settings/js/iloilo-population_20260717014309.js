// =========================================================================
// 📄 js/iloilo-population.js
// =========================================================================

import { db, collection, addDoc, writeBatch, doc } from '../js/settings-firebase.js';

// Dynamically load SheetJS library so we can inspect Excel sheets without touching the HTML
if (!window.XLSX) {
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    document.head.appendChild(script);
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Locate the specific card container by searching for its title text
    let populationCardElement = null;
    const headings = document.querySelectorAll('h3.card-title');
    for (const h3 of headings) {
        if (h3.textContent.includes('Import Iloilo Province Population')) {
            populationCardElement = h3.closest('section.card');
            break;
        }
    }

    if (!populationCardElement) {
        console.error("Population card element not found.");
        return;
    }

    // 2. Select DOM Elements scoped strictly within our card
    const fileInput = populationCardElement.querySelector('#populationDataFile');
    const uploadLabel = populationCardElement.querySelector('label.file-upload');
    const uploadBtn = populationCardElement.querySelector('.card-actions .btn-primary');

    const defaultLabelText = "📤 Click to upload (CSV, XLSX, max 10MB)";
    let selectedFile = null;
    let parsedRows = [];
    let calculatedTotalPopulation = 0;
    let totalMunicipalities = 0;

    // Set the initial state of the process button to disabled
    if (uploadBtn) uploadBtn.disabled = true;

    // Reset value on click so choosing the same file twice triggers change event
    fileInput.addEventListener('click', () => {
        fileInput.value = null;
    });

    fileInput.addEventListener('change', handleFileSelection);
    if (uploadBtn) uploadBtn.addEventListener('click', handleProcessUpload);

    function handleFileSelection(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Boundary 1: Basic extension check
        const fileExt = file.name.split('.').pop().toUpperCase();
        if (fileExt !== 'XLSX' && fileExt !== 'XLS' && fileExt !== 'CSV') {
            alert("❌ Invalid File Type: Please upload an Excel (.xlsx, .xls) or CSV file.");
            resetToEmptyState();
            return;
        }

        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                // Boundary 2: Verify sheet name contains 'Iloilo'
                const sheetName = workbook.SheetNames[0];
                if (!sheetName.toLowerCase().includes('iloilo')) {
                    throw new Error("Missing 'Iloilo' sheet signature.");
                }

                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                // Boundary 3: Verify cells relative to PSA table standard
                // Cell B1 should mention "Iloilo" and Row 4 Column A should describe the structure
                const cellB1 = jsonData[0] && jsonData[0][1] ? jsonData[0][1].toString() : '';
                const cellA4 = jsonData[3] && jsonData[3][0] ? jsonData[3][0].toString() : '';

                const hasIloiloText = cellB1.toLowerCase().includes('iloilo');
                const hasCorrectHeader = cellA4.toLowerCase().includes('province, city, municipality');

                if (!hasIloiloText || !hasCorrectHeader) {
                    throw new Error("This does not match the official PSA structure for Iloilo Province.");
                }

                // --- ROBUST PASSER: Extraction of Municipalities ---
                let extractedMunicipalities = [];
                let totalPopulationSum = 0;

                // Process rows starting after headers (row indices 5+)
                for (let i = 5; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!row || row.length < 3) continue;

                    const entityName = row[0] ? row[0].toString().trim() : '';
                    const totalPopVal = parseFloat(row[2]) || 0; // Column C: Total Population

                    // Municipalities are listed in full uppercase in Column A, excluding overall 'ILOILO *'
                    if (entityName && entityName === entityName.toUpperCase() && entityName !== 'ILOILO *') {
                        extractedMunicipalities.push({
                            municipality: entityName,
                            totalPopulation: totalPopVal,
                            householdPopulation: parseFloat(row[3]) || 0, // Column D
                            numberOfHouseholds: parseFloat(row[4]) || 0, // Column E
                        });
                        totalPopulationSum += totalPopVal;
                    }
                }

                if (extractedMunicipalities.length === 0) {
                    throw new Error("No valid municipalities could be parsed from the file.");
                }

                // --- VALIDATION SUCCESSFUL ---
                selectedFile = file;
                parsedRows = extractedMunicipalities;
                calculatedTotalPopulation = totalPopulationSum;
                totalMunicipalities = extractedMunicipalities.length;

                const formattedSize = (file.size / 1024 / 1024).toFixed(2);

                // Dynamically transform label structure
                uploadLabel.innerHTML = `
                    <div style="text-align: center; padding: 10px 0;">
                        <span style="font-size: 1.1rem; margin-right: 6px;">📄</span>
                        <span style="font-weight: bold; color: #111;">${file.name}</span>
                        <div style="margin-top: 4px; font-size: 0.85rem;">
                            <span style="color: #e25c1d; font-weight: bold; margin-right: 4px;">[${fileExt}]</span>
                            <span style="color: #666;">(${formattedSize} MB)</span>
                        </div>
                    </div>
                    
                    <div style="margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px; font-size: 13px; font-weight: 500; color: #333; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        🔄 Change selected file...
                    </div>

                    <input type="file" id="populationDataFile" accept=".csv, .xlsx, .xls" style="display: none;">
                `;

                // Re-bind file inputs inside dynamic label HTML
                const newInput = populationCardElement.querySelector('#populationDataFile');
                newInput.addEventListener('click', () => { newInput.value = null; });
                newInput.addEventListener('change', handleFileSelection);

                if (uploadBtn) {
                    uploadBtn.disabled = false;
                }

            } catch (err) {
                console.error("Error reading spreadsheet: ", err);
                alert(`❌ Validation Failed:\n${err.message}`);
                resetToEmptyState();
            }
        };

        reader.readAsArrayBuffer(file);
    }

    function resetToEmptyState() {
        selectedFile = null;
        parsedRows = [];
        calculatedTotalPopulation = 0;
        totalMunicipalities = 0;

        uploadLabel.innerHTML = defaultLabelText;
        uploadLabel.appendChild(fileInput);

        if (uploadBtn) {
            uploadBtn.disabled = true;
        }
    }

    // =========================================================================
    // 🚀 BATCH UPLOAD & IMPORT LOG SYNC
    // =========================================================================
    async function handleProcessUpload() {
        if (!selectedFile || parsedRows.length === 0) return;

        const originalBtnText = uploadBtn.textContent;
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Processing...';

        try {
            console.log("⚡ [CRIS] Preparing population batch committal...");
            const batch = writeBatch(db);

            // 1. Queue write actions for individual municipality population datasets
            parsedRows.forEach(row => {
                const docRef = doc(collection(db, "population_data"));
                batch.set(docRef, {
                    municipality: row.municipality,
                    totalPopulation: row.totalPopulation,
                    householdPopulation: row.householdPopulation,
                    numberOfHouseholds: row.numberOfHouseholds,
                    uploadedAt: new Date()
                });
            });

            // 2. Synchronize fields with settings.js import history queries!
            // We write to the exact same "import_history" collection, matching the keys settings.js reads.
            const logRef = doc(collection(db, "import_history"));
            batch.set(logRef, {
                fileName: selectedFile.name,
                totalCases: calculatedTotalPopulation, // Mapped to totalCases so settings.js reads it under (data.totalCases)
                totalFacilities: totalMunicipalities,  // Mapped to totalFacilities so settings.js reads it under (data.totalFacilities)
                timestamp: new Date(),
                status: "Completed (Population)"       // Allows the UI badge/text to flag this as population data!
            });

            console.log(`📤 [CRIS] Writing population documents to Firestore...`);
            await batch.commit();
            console.log("✅ [CRIS] Population upload committed successfully!");

            // Dispatch event to inform dashboard settings.js to refresh its import history list
            const refreshEvent = new CustomEvent("importHistoryUpdated");
            document.dispatchEvent(refreshEvent);

            alert(`🎉 Success! Iloilo Population Dataset imported.\n\n📁 File: ${selectedFile.name}\n👥 Total Population Logged: ${calculatedTotalPopulation.toLocaleString()}\n📍 Municipalities: ${totalMunicipalities}`);
            
            resetToEmptyState();

        } catch (error) {
            console.error("Database upload failed: ", error);
            alert('Upload failed: ' + error.message);
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.textContent = originalBtnText;
        }
    }
});