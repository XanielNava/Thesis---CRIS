// js/settings.js

import { db, collection, writeBatch, doc, getDocs, query, orderBy } from '../js/settings-firebase.js';

document.addEventListener('DOMContentLoaded', () => {

    const historyTableBody = document.getElementById('uploadHistoryTableBody');

    // =========================================================================
    // 🛠️ CORE REUSABLE IMPORT INITIALIZER
    // =========================================================================
    function initImportSection({ cardTitle, fileInputId, collectionName, dataType }) {
        // Locate the specific card container dynamically by its h3 title text
        let cardElement = null;
        const headings = document.querySelectorAll('h3.card-title');

        for (const h3 of headings) {
            if (h3.textContent.includes(cardTitle)) {
                cardElement = h3.closest('section.card');
                break;
            }
        }

        if (!cardElement) {
            console.error(`"${cardTitle}" card element not found.`);
            return;
        }

        // Elements scoped strictly within this specific card instance
        const fileInput = cardElement.querySelector(`#${fileInputId}`);
        const uploadLabel = cardElement.querySelector('label.file-upload');
        const uploadBtn = cardElement.querySelector('.card-actions .btn-primary');

        const defaultLabelText = "📤 Click to upload (CSV, XLSX, max 10MB)";
        let selectedFile = null;
        let parsedData = null;

        if (uploadBtn) uploadBtn.disabled = false;

        // Reset value on click so choosing the same file twice triggers change event
        if (fileInput) {
            fileInput.addEventListener('click', () => {
                fileInput.value = null;
            });
            fileInput.addEventListener('change', handleFileSelection);
        }

        // =====================================================================
        // FIX: Helper function to attach click handler to label
        // =====================================================================
        function attachLabelClickHandler() {
            if (!uploadLabel) return;
            uploadLabel.addEventListener('click', (e) => {
                // Only trigger if clicking on the label itself, not nested buttons
                if (e.target === uploadLabel || e.target.closest('label.file-upload') === uploadLabel) {
                    if (fileInput && !e.target.classList.contains('file-clear-trigger-btn')) {
                        fileInput.click();
                    }
                }
            });
        }

        // Attach the initial handler
        attachLabelClickHandler();

        if (uploadBtn) {
            uploadBtn.addEventListener('click', handleProcessUpload);
        }

        function handleFileSelection(e) {
            const file = e.target.files[0];
            if (!file) {
                resetToEmptyState();
                return;
            }

            const fileExt = file.name.split('.').pop().toUpperCase();
            if (fileExt !== 'XLSX' && fileExt !== 'XLS' && fileExt !== 'CSV') {
                alert("❌ Invalid File Type: Please upload an Excel (.xlsx, .xls) or CSV file.");
                resetToEmptyState();
                return;
            }

            const reader = new FileReader();
            reader.onload = function (evt) {
                try {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];

                    // Read raw rows (PSA document has 3 header rows)
                    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                    if (rawRows.length < 5) {
                        throw new Error("The selected spreadsheet is too short.");
                    }

                    const cleanData = [];

                    // Parse data rows (Data starts at row 4 = index 3)
                    for (let rowIdx = 3; rowIdx < rawRows.length; rowIdx++) {
                        const row = rawRows[rowIdx];
                        if (!row || row.length < 2) continue;

                        const facilityName = row[0] ? row[0].toString().trim() : "";
                        if (!facilityName) continue;

                        // Skip total rows
                        if (facilityName.toLowerCase() === "total" || facilityName.toLowerCase() === "grand total") {
                            continue;
                        }

                        // Skip barangay-level rows
                        const barangayIndicators = ['barangay', 'brgy', 'bgy', 'poblacion'];
                        const isBrgy = barangayIndicators.some(ind => facilityName.toLowerCase().includes(ind));
                        if (isBrgy) continue;

                        // Check for leading spaces (indented = likely barangay)
                        const rawStr = row[0] ? row[0].toString() : "";
                        const leadingSpaces = rawStr.length - rawStr.trimStart().length;
                        if (leadingSpaces > 2) continue;

                        // Map payload objects contextually based on the data type parameter
                        if (dataType === 'cases') {
                            cleanData.push({
                                abtc: facilityName,
                                maleCases: Number(row[1]) || 0,
                                femaleCases: Number(row[2]) || 0,
                                ageLt15: Number(row[3]) || 0,
                                ageGt15: Number(row[4]) || 0,
                                bitingDog: Number(row[5]) || 0,
                                bitingCat: Number(row[6]) || 0,
                                bitingOthers: Number(row[7]) || 0,
                                humanCat1: Number(row[8]) || 0,
                                humanCat2: Number(row[9]) || 0,
                                humanCatNew: Number(row[10]) || 0,
                                humanCatBooster: Number(row[11]) || 0,
                                hr: Number(row[12]) || 0,
                                petTcv: Number(row[13]) || 0,
                                petHrig: Number(row[14]) || 0,
                                petErig: Number(row[15]) || 0,
                                total: Number(row[16]) || 0,
                                remarksCompII: Number(row[17]) || 0,
                                remarksCompIII: Number(row[18]) || 0,
                                remarksIncompleteII: Number(row[19]) || 0,
                                remarksIncompleteIII: Number(row[20]) || 0,
                                remarksNoneII: Number(row[21]) || 0,
                                remarksNoneIII: Number(row[22]) || 0,
                                rep: Number(row[23]) || 0
                            });
                        } else if (dataType === 'population') {
                            // Expected layout for Population spreadsheet:
                            // Column A(0): Municipality/City Name, Column B(1): Total Population
                            cleanData.push({
                                municipality: facilityName,
                                totalPopulation: Number(row[1]) || 0
                            });
                        }
                    }

                    if (cleanData.length === 0) {
                        throw new Error("No valid data rows found in the spreadsheet.");
                    }

                    selectedFile = file;
                    parsedData = {
                        cleanData,
                        recordCount: cleanData.length
                    };

                    const formattedSize = (file.size / 1024).toFixed(1);

                    // Update label dynamically with downsized, cleaner ✕ button styles
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
                        " class="file-change-trigger-btn">
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
                            <div style="flex: 1; min-width: 0; padding-right: 8px;">
                                <span style="font-weight: 600; color: #333; font-size: 13px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}</span>
                                <span style="font-size: 12px; color: #666;">(${formattedSize} KB)</span>
                            </div>
                            <button type="button" style="
                                background: #D32F2F;
                                color: white;
                                border: none;
                                padding: 4px 8px;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 12px;
                                font-weight: bold;
                                line-height: 1;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            " class="file-clear-trigger-btn">
                                ✕
                            </button>
                        </div>
                    `;

                    // Bind active trigger handlers to the locally scoped custom buttons
                    cardElement.querySelector('.file-change-trigger-btn').addEventListener('click', (e) => {
                        e.preventDefault();
                        fileInput.click();
                    });

                    cardElement.querySelector('.file-clear-trigger-btn').addEventListener('click', (e) => {
                        e.preventDefault();
                        resetToEmptyState();
                    });

                    if (uploadBtn) uploadBtn.disabled = false;

                } catch (err) {
                    console.error("Error reading spreadsheet: ", err);
                    alert(`❌ Validation Failed:\n${err.message}`);
                    resetToEmptyState();
                }
            };

            reader.readAsArrayBuffer(file);
        }

        // =====================================================================
        // FIX: Improved resetToEmptyState to properly restore clickability
        // =====================================================================
        function resetToEmptyState() {
            selectedFile = null;
            parsedData = null;
            
            // Reset the label to default text
            uploadLabel.innerHTML = defaultLabelText;
            
            // Re-attach the click handler to the newly rendered label
            // This ensures users can click again to select a file
            setTimeout(() => {
                attachLabelClickHandler();
            }, 0);
            
            if (fileInput) fileInput.value = null;
            if (uploadBtn) uploadBtn.disabled = false;
        }

        async function handleProcessUpload() {
            if (!selectedFile || !parsedData) {
                alert('Please select a file first.');
                return;
            }

            const originalBtnText = uploadBtn.textContent;
            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Processing...';

            try {
                console.log(`⚡ Preparing chunked transaction batches for ${cardTitle}...`);

                const batchLimit = 500;
                let batch = writeBatch(db);
                let opCount = 0;

                // 1. Process data points inside writing batches
                for (let index = 0; index < parsedData.cleanData.length; index++) {
                    const row = parsedData.cleanData[index];

                    if (opCount >= batchLimit) {
                        await batch.commit();
                        batch = writeBatch(db);
                        opCount = 0;
                    }

                    const docRef = doc(collection(db, collectionName));

                    // Build data document according to dataset properties
                    if (dataType === 'cases') {
                        batch.set(docRef, {
                            facilityName: row.abtc,
                            year: new Date().getFullYear(),
                            maleCases: row.maleCases,
                            femaleCases: row.femaleCases,
                            ageLessThan15: row.ageLt15,
                            ageGreaterThan15: row.ageGt15,
                            bitingDog: row.bitingDog,
                            bitingCat: row.bitingCat,
                            bitingOthers: row.bitingOthers,
                            humanCat1: row.humanCat1,
                            humanCat2: row.humanCat2,
                            humanCatNew: row.humanCatNew,
                            humanCatBooster: row.humanCatBooster,
                            hr: row.hr,
                            petTcv: row.petTcv,
                            petHrig: row.petHrig,
                            petErig: row.petErig,
                            totalCases: row.total || (row.maleCases + row.femaleCases),
                            remarksCompII: row.remarksCompII,
                            remarksCompIII: row.remarksCompIII,
                            remarksIncompleteII: row.remarksIncompleteII,
                            remarksIncompleteIII: row.remarksIncompleteIII,
                            remarksNoneII: row.remarksNoneII,
                            remarksNoneIII: row.remarksNoneIII,
                            rep: row.rep,
                            documentOrder: index,
                            uploadedAt: new Date()
                        });
                    } else if (dataType === 'population') {
                        batch.set(docRef, {
                            municipality: row.municipality,
                            year: new Date().getFullYear(),
                            totalPopulation: row.totalPopulation,
                            documentOrder: index,
                            uploadedAt: new Date()
                        });
                    }

                    opCount++;
                }

                if (opCount > 0) {
                    await batch.commit();
                }

                // 2. Compute total metrics and queue upload history log entry
                batch = writeBatch(db);
                const logRef = doc(collection(db, "import_history"));
                
                const calculatedTotalSum = dataType === 'cases' 
                    ? parsedData.cleanData.reduce((sum, row) => sum + row.total, 0)
                    : parsedData.cleanData.reduce((sum, row) => sum + row.totalPopulation, 0);

                batch.set(logRef, {
                    fileName: selectedFile.name,
                    totalCases: calculatedTotalSum,
                    totalFacilities: parsedData.recordCount,
                    timestamp: new Date(),
                    status: "Completed",
                    importType: dataType // Distinguishes types inside the DB records
                });

                await batch.commit();

                // Dispatch global event notifications to syncing elements
                document.dispatchEvent(new CustomEvent("importHistoryUpdated"));

                const uploadTime = new Date().toLocaleString('en-US', {
                    month: '2-digit', day: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: true
                });

                // Display tracking log summary in UI tables
                const recordLabelText = dataType === 'cases' 
                    ? `${parsedData.recordCount} Municipalities (All columns)`
                    : `${parsedData.recordCount} Municipalities (Population)`;

                addHistoryRow(uploadTime, selectedFile.name, recordLabelText, 'Completed');

                alert(`✅ Success! Data uploaded to database storage.\n\nFile: ${selectedFile.name}\nRecords: ${parsedData.recordCount}`);
                resetToEmptyState();

            } catch (error) {
                console.error("Database upload failed: ", error);
                alert('Upload failed: ' + error.message);
            } finally {
                uploadBtn.disabled = false;
                uploadBtn.textContent = originalBtnText;
            }
        }
    }

    // =========================================================================
    // 📋 HISTORY LOG HANDLING & INITIAL LOAD
    // =========================================================================
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
                    month: '2-digit', day: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: true
                });

                const recordLabelText = data.importType === 'population'
                    ? `${(data.totalFacilities || 0)} Municipalities (Population)`
                    : `${(data.totalFacilities || 0)} Municipalities (All columns)`;

                addHistoryRow(
                    dateString,
                    data.fileName || 'unknown_file',
                    recordLabelText,
                    data.status || 'Completed'
                );
            });
        } catch (error) {
            console.error("Failed to fetch initial import logs:", error);
        }
    }

    // =========================================================================
    // 🚀 INITIALIZE SECTIONS ON PAGE LOAD
    // =========================================================================
    
    // 1. Initialize Case Data Section
    initImportSection({
        cardTitle: 'Import Case Data',
        fileInputId: 'caseDataFile',
        collectionName: 'rabies_cases',
        dataType: 'cases'
    });

    // 2. Initialize Population Data Section
    initImportSection({
        cardTitle: 'Import Iloilo Population Data',
        fileInputId: 'populationDataFile', // Assumes your HTML element uses this ID layout
        collectionName: 'population_data',
        dataType: 'population'
    });

    // Boot up the log loader
    loadImportHistory();
});