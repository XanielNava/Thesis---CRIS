// js/settings.js

import { db, collection, writeBatch, doc, getDocs, query, orderBy } from '../js/settings-firebase.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Locate the specific card container for CASE DATA by searching for its title text
    let caseCardElement = null;
    const headings = document.querySelectorAll('h3.card-title');
    for (const h3 of headings) {
        if (h3.textContent.includes('Import Case Data')) {
            caseCardElement = h3.closest('section.card');
            break;
        }
    }

    if (!caseCardElement) {
        console.error("Case data card element not found.");
        return;
    }

    // 2. Select DOM Elements scoped strictly within the case data card
    const fileInput = caseCardElement.querySelector('#caseDataFile');
    const uploadLabel = caseCardElement.querySelector('label.file-upload');
    const uploadBtn = caseCardElement.querySelector('.card-actions .btn-primary');

    const defaultLabelText = "📤 Click to upload (CSV, XLSX, max 10MB)";
    let selectedFile = null;
    let parsedData = null;
    let historyTableBody = document.getElementById('uploadHistoryTableBody');
    let documentOrder = []; // PRESERVE DOCUMENT ORDER

    // Set the initial state of the process button to enabled so it can be clicked
    if (uploadBtn) uploadBtn.disabled = false;

    // Reset value on click so choosing the same file twice triggers change event
    if (fileInput) {
        fileInput.addEventListener('click', () => {
            fileInput.value = null;
        });
        fileInput.addEventListener('change', handleFileSelection);
    }
    
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

                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Parse spreadsheet to JSON (preserve row order)
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                if (jsonData.length === 0) {
                    throw new Error("The selected spreadsheet is empty.");
                }

                // --- EXTRACT ALL COLUMNS (NOT JUST MALE/FEMALE) ---
                // The PSA document structure has these columns:
                // ABTC | Male | Female | <15 | >15 | Dog | Cat | Others | Cat1 | Cat2 | CatNew | CatBooster | HR | TCV | HRIG | ERIG | TOTAL | CompII | CompIII | IncompleteII | IncompleteIII | NoneII | NoneIII | REP

                let rawHeaders = Object.keys(jsonData[0]);
                
                // Column mapping for the PSA document format
                const columnMapping = {
                    abtc: null,
                    sexMale: null,
                    sexFemale: null,
                    ageLt15: null,
                    ageGt15: null,
                    bitingDog: null,
                    bitingCat: null,
                    bitingOthers: null,
                    humanCat1: null,
                    humanCat2: null,
                    humanCatNew: null,
                    humanCatBooster: null,
                    hr: null,
                    petTcv: null,
                    petHrig: null,
                    petErig: null,
                    total: null,
                    remarksCompII: null,
                    remarksCompIII: null,
                    remarksIncompleteII: null,
                    remarksIncompleteIII: null,
                    remarksNoneII: null,
                    remarksNoneIII: null,
                    rep: null,
                    year: null
                };

                // Normalize strings for matching
                const normalize = (str) => str.toString().toLowerCase().replace(/[^a-z0-9]/g, '');

                // MAP COLUMNS BY POSITION AND HEADER NAMES
                rawHeaders.forEach((header, index) => {
                    const hNorm = normalize(header);
                    
                    // Match ABTC
                    if (hNorm === 'abtc' || hNorm.includes('facility') || hNorm.includes('hospital')) {
                        columnMapping.abtc = header;
                    }
                    // Match Sex
                    else if (hNorm === 'male') columnMapping.sexMale = header;
                    else if (hNorm === 'female') columnMapping.sexFemale = header;
                    // Match Age
                    else if (hNorm.includes('15') && hNorm.includes('lt')) columnMapping.ageLt15 = header;
                    else if (hNorm.includes('15') && hNorm.includes('gt')) columnMapping.ageGt15 = header;
                    // Match Biting Animal
                    else if (hNorm === 'dog') columnMapping.bitingDog = header;
                    else if (hNorm === 'cat') columnMapping.bitingCat = header;
                    else if (hNorm === 'others') columnMapping.bitingOthers = header;
                    // Match Human Bite Case
                    else if (hNorm.includes('cat1')) columnMapping.humanCat1 = header;
                    else if (hNorm.includes('cat2')) columnMapping.humanCat2 = header;
                    else if (hNorm.includes('catnew') || hNorm.includes('new')) columnMapping.humanCatNew = header;
                    else if (hNorm.includes('catbooster') || hNorm.includes('booster')) columnMapping.humanCatBooster = header;
                    // Match HR
                    else if (hNorm === 'hr') columnMapping.hr = header;
                    // Match Post Exposure Treatment
                    else if (hNorm.includes('tcv')) columnMapping.petTcv = header;
                    else if (hNorm.includes('hrig')) columnMapping.petHrig = header;
                    else if (hNorm.includes('erig')) columnMapping.petErig = header;
                    // Match Total
                    else if (hNorm === 'total') columnMapping.total = header;
                    // Match Remarks
                    else if (hNorm.includes('compii')) columnMapping.remarksCompII = header;
                    else if (hNorm.includes('compiii')) columnMapping.remarksCompIII = header;
                    else if (hNorm.includes('incompleteii')) columnMapping.remarksIncompleteII = header;
                    else if (hNorm.includes('incompleteiii')) columnMapping.remarksIncompleteIII = header;
                    else if (hNorm.includes('noneii')) columnMapping.remarksNoneII = header;
                    else if (hNorm.includes('noneiii')) columnMapping.remarksNoneIII = header;
                    // Match REP
                    else if (hNorm === 'rep') columnMapping.rep = header;
                    // Match Year
                    else if (hNorm.includes('year')) columnMapping.year = header;
                });

                // FALLBACK: If automatic mapping fails, use column positions
                if (!columnMapping.abtc) columnMapping.abtc = rawHeaders[0];
                if (!columnMapping.sexMale) columnMapping.sexMale = rawHeaders[1];
                if (!columnMapping.sexFemale) columnMapping.sexFemale = rawHeaders[2];
                if (!columnMapping.ageLt15) columnMapping.ageLt15 = rawHeaders[3];
                if (!columnMapping.ageGt15) columnMapping.ageGt15 = rawHeaders[4];
                if (!columnMapping.bitingDog) columnMapping.bitingDog = rawHeaders[5];
                if (!columnMapping.bitingCat) columnMapping.bitingCat = rawHeaders[6];
                if (!columnMapping.bitingOthers) columnMapping.bitingOthers = rawHeaders[7];
                if (!columnMapping.humanCat1) columnMapping.humanCat1 = rawHeaders[8];
                if (!columnMapping.humanCat2) columnMapping.humanCat2 = rawHeaders[9];
                if (!columnMapping.humanCatNew) columnMapping.humanCatNew = rawHeaders[10];
                if (!columnMapping.humanCatBooster) columnMapping.humanCatBooster = rawHeaders[11];
                if (!columnMapping.hr) columnMapping.hr = rawHeaders[12];
                if (!columnMapping.petTcv) columnMapping.petTcv = rawHeaders[13];
                if (!columnMapping.petHrig) columnMapping.petHrig = rawHeaders[14];
                if (!columnMapping.petErig) columnMapping.petErig = rawHeaders[15];
                if (!columnMapping.total) columnMapping.total = rawHeaders[16];
                if (!columnMapping.remarksCompII) columnMapping.remarksCompII = rawHeaders[17];
                if (!columnMapping.remarksCompIII) columnMapping.remarksCompIII = rawHeaders[18];
                if (!columnMapping.remarksIncompleteII) columnMapping.remarksIncompleteII = rawHeaders[19];
                if (!columnMapping.remarksIncompleteIII) columnMapping.remarksIncompleteIII = rawHeaders[20];
                if (!columnMapping.remarksNoneII) columnMapping.remarksNoneII = rawHeaders[21];
                if (!columnMapping.remarksNoneIII) columnMapping.remarksNoneIII = rawHeaders[22];
                if (!columnMapping.rep) columnMapping.rep = rawHeaders[23];

                // Add year if missing
                if (!columnMapping.year) {
                    columnMapping.year = "Assigned Year (Default)";
                }

                // --- FILTER OUT BARANGAYS & PRESERVE DOCUMENT ORDER ---
                const cleanData = [];
                documentOrder = [];

                jsonData.forEach((row, index) => {
                    const val = row[columnMapping.abtc];
                    if (!val) return;
                    
                    const strVal = val.toString().trim();
                    const cleanVal = strVal.toLowerCase();

                    // Filter out header rows and totals
                    if (cleanVal === 'abtc' || cleanVal === 'total' || cleanVal === 'grand total' || cleanVal === '') {
                        return;
                    }

                    // Filter out barangay-level rows
                    const barangayIndicators = ['barangay', 'brgy', 'bgy', 'district', 'poblacion'];
                    const hasBarangayIndicator = barangayIndicators.some(indicator => cleanVal.includes(indicator));
                    
                    if (hasBarangayIndicator) {
                        console.log(`⏭️ Skipping barangay: "${strVal}"`);
                        return;
                    }

                    // Check for leading spaces
                    const rawStr = val.toString();
                    const leadingSpaces = rawStr.length - rawStr.trimStart().length;
                    if (leadingSpaces > 2) {
                        console.log(`⏭️ Skipping indented row: "${strVal}"`);
                        return;
                    }

                    // ADD TO CLEAN DATA & TRACK ORDER
                    cleanData.push(row);
                    documentOrder.push(strVal);
                });

                if (cleanData.length === 0) {
                    throw new Error("No valid data rows found.");
                }

                // --- VALIDATION SUCCESSFUL ---
                selectedFile = file;
                parsedData = {
                    cleanData,
                    documentOrder,
                    columnMapping,
                    facilityCount: cleanData.length
                };

                const formattedSize = (file.size / 1024).toFixed(1);

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
                    " id="caseFileSelectBtn">
                        📥 Change selected file...
                    </button>
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

                const changeBtn = uploadLabel.querySelector('#caseFileSelectBtn');
                changeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    fileInput.click();
                });

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
        parsedData = null;
        documentOrder = [];

        uploadLabel.innerHTML = defaultLabelText;
        if (fileInput) {
            fileInput.value = null;
        }

        if (uploadBtn) {
            uploadBtn.disabled = false;
        }
    }

    // =========================================================================
    // 🚀 BATCH UPLOAD WITH ALL COLUMNS & DOCUMENT ORDER
    // =========================================================================
    async function handleProcessUpload() {
        if (!selectedFile || !parsedData) {
            alert('Please select a file first.');
            return;
        }

        const originalBtnText = uploadBtn.textContent;
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Processing...';

        try {
            console.log("⚡ [CRIS] Preparing batch upload with ALL columns...");
            
            const batchLimit = 500;
            let batch = writeBatch(db);
            let opCount = 0;

            // Upload each row, preserving document order
            for (let index = 0; index < parsedData.cleanData.length; index++) {
                const row = parsedData.cleanData[index];

                if (opCount >= batchLimit) {
                    console.log("⚡ [CRIS] Batch limit reached. Committing chunk...");
                    await batch.commit();
                    batch = writeBatch(db);
                    opCount = 0;
                }

                const cm = parsedData.columnMapping;
                const docRef = doc(collection(db, "rabies_cases"));

                // Extract all column values
                batch.set(docRef, {
                    // Basic info
                    facilityName: (row[cm.abtc] || "").toString().trim(),
                    year: row[cm.year] || new Date().getFullYear(),
                    
                    // Sex breakdown
                    maleCases: Number(row[cm.sexMale]) || 0,
                    femaleCases: Number(row[cm.sexFemale]) || 0,
                    
                    // Age breakdown
                    ageLessThan15: Number(row[cm.ageLt15]) || 0,
                    ageGreaterThan15: Number(row[cm.ageGt15]) || 0,
                    
                    // Biting Animal breakdown
                    bitingDog: Number(row[cm.bitingDog]) || 0,
                    bitingCat: Number(row[cm.bitingCat]) || 0,
                    bitingOthers: Number(row[cm.bitingOthers]) || 0,
                    
                    // Human Bite Case breakdown
                    humanCat1: Number(row[cm.humanCat1]) || 0,
                    humanCat2: Number(row[cm.humanCat2]) || 0,
                    humanCatNew: Number(row[cm.humanCatNew]) || 0,
                    humanCatBooster: Number(row[cm.humanCatBooster]) || 0,
                    
                    // HR
                    hr: Number(row[cm.hr]) || 0,
                    
                    // Post Exposure Treatment
                    petTcv: Number(row[cm.petTcv]) || 0,
                    petHrig: Number(row[cm.petHrig]) || 0,
                    petErig: Number(row[cm.petErig]) || 0,
                    
                    // Total
                    totalCases: Number(row[cm.total]) || (Number(row[cm.sexMale]) + Number(row[cm.sexFemale])) || 0,
                    
                    // Remarks
                    remarksCompII: Number(row[cm.remarksCompII]) || 0,
                    remarksCompIII: Number(row[cm.remarksCompIII]) || 0,
                    remarksIncompleteII: Number(row[cm.remarksIncompleteII]) || 0,
                    remarksIncompleteIII: Number(row[cm.remarksIncompleteIII]) || 0,
                    remarksNoneII: Number(row[cm.remarksNoneII]) || 0,
                    remarksNoneIII: Number(row[cm.remarksNoneIII]) || 0,
                    
                    // REP
                    rep: Number(row[cm.rep]) || 0,
                    
                    // Document order (for sorting)
                    documentOrder: index,
                    
                    uploadedAt: new Date()
                });

                opCount++;
            }

            // Commit remaining operations
            if (opCount > 0) {
                await batch.commit();
                batch = writeBatch(db);
            }

            // Log upload history
            const logRef = doc(collection(db, "import_history"));
            batch.set(logRef, {
                fileName: selectedFile.name,
                totalCases: parsedData.cleanData.length,
                totalFacilities: parsedData.facilityCount,
                timestamp: new Date(),
                status: "Completed"
            });

            await batch.commit();
            console.log("✅ [CRIS] All data uploaded successfully!");

            const refreshEvent = new CustomEvent("importHistoryUpdated");
            document.dispatchEvent(refreshEvent);

            const uploadTime = new Date().toLocaleString('en-US', { 
                month: '2-digit', 
                day: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true 
            });

            addHistoryRow(uploadTime, selectedFile.name, `${parsedData.facilityCount} Facilities (All columns)`, 'Completed');

            alert(`✅ Success! Case data uploaded.\n\nFile: ${selectedFile.name}\nFacilities: ${parsedData.facilityCount}\nAll columns mapped and preserved in document order.`);
            resetToEmptyState();

        } catch (error) {
            console.error("Upload failed: ", error);
            alert('Upload failed: ' + error.message);
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.textContent = originalBtnText;
        }
    }

    // Helper: Add a row to the history table
    function addHistoryRow(date, fileName, records, status) {
        if (!historyTableBody) return;

        const tr = document.createElement('tr');
        const statusClass = status.toLowerCase() === 'completed' ? 'success' : 'danger';

        tr.innerHTML = `
            <td>${date}</td>
            <td style="font-family: monospace;">${fileName}</td>
            <td><strong>${records}</strong></td>
            <td><span class="badge ${statusClass}">${status}</span></td>
        `;

        historyTableBody.insertBefore(tr, historyTableBody.firstChild);
    }

    // Load and display history entries dynamically on page boot
    async function loadImportHistory() {
        if (!historyTableBody) return;
        try {
            const q = query(collection(db, "import_history"), orderBy("timestamp", "desc"));
            const querySnapshot = await getDocs(q);
            
            historyTableBody.innerHTML = '';

            querySnapshot.forEach((docSnapshot) => {
                const data = docSnapshot.data();
                
                let dateObj;
                if (data.timestamp && typeof data.timestamp.toDate === 'function') {
                    dateObj = data.timestamp.toDate(); 
                } else if (data.timestamp instanceof Date) {
                    dateObj = data.timestamp;
                } else if (data.timestamp && data.timestamp.seconds) {
                    dateObj = new Date(data.timestamp.seconds * 1000);
                } else {
                    dateObj = new Date();
                }

                const dateString = dateObj.toLocaleString('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
                
                addHistoryRow(
                    dateString, 
                    data.fileName || 'unknown_file', 
                    `${(data.totalFacilities || 0)} Facilities (All columns)`, 
                    data.status || 'Completed'
                );
            });
        } catch (error) {
            console.error("Failed to fetch import logs:", error);
        }
    }

    loadImportHistory();
});