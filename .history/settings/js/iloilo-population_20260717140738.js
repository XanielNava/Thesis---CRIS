// 📄 js/iloilo-population.js// 

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

    // Set the button to enabled initially so users can click it to see the warning if no file is selected
    if (uploadBtn) uploadBtn.disabled = false;

    // Reset value on click so choosing the same file twice triggers change event
    fileInput.addEventListener('click', () => {
        fileInput.value = null;
    });

    fileInput.addEventListener('change', handleFileSelection);
    if (uploadBtn) uploadBtn.addEventListener('click', handleProcessUpload);

    function handleFileSelection(e) {
        const file = e.target.files[0];
        if (!file) {
            resetToEmptyState();
            return;
        }

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
                // Cell B2 (index 1, 1) should mention "Iloilo" and Row 5 Column A (index 4, 0) should describe the structure
                const cellB2 = jsonData[1] && jsonData[1][1] ? jsonData[1][1].toString() : '';
                const cellA5 = jsonData[4] && jsonData[4][0] ? jsonData[4][0].toString() : '';

                const hasIloiloText = cellB2.toLowerCase().includes('iloilo');
                const hasCorrectHeader = cellA5.toLowerCase().includes('province, city, municipality');

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

                const formattedSize = (file.size / 1024).toFixed(1);

                // Update label to show button - BUTTON-BASED APPROACH
                uploadLabel.innerHTML = `
                    <button type="button" style="
                        background: none;
                        border: 2px dashed #d0d0d0;
                        padding: 12px 16px;
                        width: 100%;
                        text-align: center;
                        cursor: pointer;
                        border-radius: 6px;
                        font-size: 14px;
                        color: #333;
                        font-weight: 500;
                        transition: all 0.2s ease;
                    " id="populationFileSelectBtn">
                        📥 Change selected file...
                    </button>
                    <input type="file" id="populationDataFile" accept=".csv, .xlsx, .xls" style="display: none;">
                    <div style="
                        margin-top: 12px;
                        padding: 10px 12px;
                        background-color: #f5f5f5;
                        border-radius: 6px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    ">
                        <span style="font-weight: 600; color: #333; font-size: 13px;">${file.name}</span>
                        <span style="font-size: 12px; color: #666;">(${formattedSize} KB)</span>
                    </div>
                `;

                // Re-bind the button and file input
                const newBtn = uploadLabel.querySelector('#populationFileSelectBtn');
                const newInput = uploadLabel.querySelector('#populationDataFile');
                
                newBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    newInput.click();
                });

                newInput.addEventListener('click', () => { 
                    newInput.value = null; 
                });
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

        // Keep button enabled so the user can still trigger the alert if they click upload
        if (uploadBtn) {
            uploadBtn.disabled = false;
        }
    }

    // =========================================================================
    // 🚀 BATCH UPLOAD & IMPORT LOG SYNC
    // =========================================================================
    async function handleProcessUpload() {
        if (!selectedFile || parsedRows.length === 0) {
            alert('Please select a file first.');
            return;
        }

        const originalBtnText = uploadBtn.textContent;
        uploadBtn.disabled = true;
        uploadBtn.textContent = '⏳ Processing...';

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
                status: "Completed"
            });

            console.log(`📤 [CRIS] Writing population documents to Firestore...`);
            await batch.commit();
            console.log("✅ [CRIS] Population upload committed successfully!");

            // Dispatch event to inform dashboard settings.js to refresh its import history list
            const refreshEvent = new CustomEvent("importHistoryUpdated");
            document.dispatchEvent(refreshEvent);

            alert(`Success! Iloilo Population Dataset imported.\n\nFile: ${selectedFile.name}\n👥 Total Population Logged: ${calculatedTotalPopulation.toLocaleString()}\n📍 Municipalities: ${totalMunicipalities}`);
            
            resetToEmptyState();

        } catch (error) {
            console.error("Database upload failed: ", error);
            alert('⚠️ Upload failed: ' + error.message);
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.textContent = originalBtnText;
        }
    }
});