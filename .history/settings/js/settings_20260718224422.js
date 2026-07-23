// js/settings.js

import { db, collection, writeBatch, doc, getDocs, query, orderBy, deleteDoc } from '../js/settings-firebase.js';

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

    if (uploadBtn) uploadBtn.disabled = false;

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
                
                // ===== PSA DOCUMENT HAS 3-ROW HEADERS, SO READ RAW ROWS =====
                const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                if (rawRows.length < 5) {
                    throw new Error("The selected spreadsheet is too short (needs headers + at least 1 data row).");
                }

                console.log(`📊 Raw rows count: ${rawRows.length}`);
                console.log(`Row 1 (Headers): ${rawRows[0].slice(0, 10).join(" | ")}`);
                console.log(`Row 4 (First data): ${rawRows[3].slice(0, 10).join(" | ")}`);

                // ===== PARSE DATA ROWS (Starting from row 4, index 3) =====
                // PSA format: Rows 1-3 are headers, Data starts at row 4
                const cleanData = [];
                const documentOrder = [];

                for (let rowIdx = 3; rowIdx < rawRows.length; rowIdx++) {
                    const row = rawRows[rowIdx];
                    if (!row || row.length < 2) continue;

                    const facilityName = row[0] ? row[0].toString().trim() : "";
                    
                    // Skip empty rows and total rows
                    if (!facilityName || facilityName === "" || facilityName.toLowerCase().includes("total")) {
                        continue;
                    }

                    // Skip barangay-level rows
                    const barangayIndicators = ['barangay', 'brgy', 'bgy', 'district', 'poblacion'];
                    const isBrgy = barangayIndicators.some(ind => facilityName.toLowerCase().includes(ind));
                    if (isBrgy) {
                        console.log(`⏭️ Skipping barangay: ${facilityName}`);
                        continue;
                    }

                    // Check leading spaces (indented = likely barangay)
                    const rawStr = row[0] ? row[0].toString() : "";
                    const leadingSpaces = rawStr.length - rawStr.trimStart().length;
                    if (leadingSpaces > 2) {
                        console.log(`⏭️ Skipping indented row: ${facilityName}`);
                        continue;
                    }

                    // EXTRACT ALL COLUMNS BY POSITION (PSA standard positions)
                    // Col 0: ABTC
                    // Col 1: Male
                    // Col 2: Female
                    // Col 3: Age < 15
                    // Col 4: Age > 15
                    // Col 5: Dog
                    // Col 6: Cat
                    // Col 7: Others
                    // Col 8: Cat 1
                    // Col 9: Cat 2
                    // Col 10: Cat (New)
                    // Col 11: Cat (Booster)
                    // Col 12: HR
                    // Col 13: TCV
                    // Col 14: HRIG
                    // Col 15: ERIG
                    // Col 16: TOTAL
                    // Col 17: Remarks Comp II
                    // Col 18: Remarks Comp III
                    // Col 19: Remarks Incomplete II
                    // Col 20: Remarks Incomplete III
                    // Col 21: Remarks None II
                    // Col 22: Remarks None III
                    // Col 23: REP

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

                    documentOrder.push(facilityName);
                }

                if (cleanData.length === 0) {
                    throw new Error("No valid municipality data rows found in the spreadsheet.");
                }

                console.log(`✅ Parsed ${cleanData.length} valid municipalities`);

                selectedFile = file;
                parsedData = {
                    cleanData,
                    documentOrder,
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

        uploadLabel.innerHTML = defaultLabelText;
        if (fileInput) {
            fileInput.value = null;
        }

        if (uploadBtn) {
            uploadBtn.disabled = false;
        }
    }

    // =========================================================================
    // 🚀 BATCH UPLOAD WITH ALL COLUMNS
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
            // ⚠️ CLEAR OLD DATA FIRST (Prevent duplicates)
            console.log("🗑️ Clearing old data from rabies_cases...");
            const existingDocs = await getDocs(collection(db, "rabies_cases"));
            
            const deleteBatch = writeBatch(db);
            let deleteCount = 0;
            
            existingDocs.forEach(doc => {
                deleteBatch.delete(doc.ref);
                deleteCount++;
                
                // Batch delete in chunks of 500
                if (deleteCount % 500 === 0) {
                    deleteBatch.commit();
                }
            });
            
            if (deleteCount > 0) {
                await deleteBatch.commit();
                console.log(`✅ Deleted ${deleteCount} old records`);
            }

            console.log("⚡ [CRIS] Uploading new case data...");
            
            const batchLimit = 500;
            let batch = writeBatch(db);
            let opCount = 0;

            for (let index = 0; index < parsedData.cleanData.length; index++) {
                const row = parsedData.cleanData[index];

                if (opCount >= batchLimit) {
                    console.log("⚡ Batch limit reached. Committing...");
                    await batch.commit();
                    batch = writeBatch(db);
                    opCount = 0;
                }

                const docRef = doc(collection(db, "rabies_cases"));

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

                opCount++;
            }

            if (opCount > 0) {
                await batch.commit();
            }

            // Log upload history
            const logRef = doc(collection(db, "import_history"));
            batch = writeBatch(db);
            batch.set(logRef, {
                fileName: selectedFile.name,
                totalCases: parsedData.cleanData.reduce((sum, row) => sum + row.total, 0),
                totalFacilities: parsedData.facilityCount,
                timestamp: new Date(),
                status: "Completed"
            });
            await batch.commit();

            console.log("✅ Upload complete!");

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

            addHistoryRow(uploadTime, selectedFile.name, `${parsedData.facilityCount} Municipalities (All columns)`, 'Completed');

            alert(`✅ Success! Case data replaced and uploaded.\n\nFile: ${selectedFile.name}\nFacilities: ${parsedData.facilityCount}\nAll columns populated.`);
            resetToEmptyState();

        } catch (error) {
            console.error("Upload failed: ", error);
            alert('Upload failed: ' + error.message);
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.textContent = originalBtnText;
        }
    }

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
                    `${(data.totalFacilities || 0)} Municipalities (All columns)`, 
                    data.status || 'Completed'
                );
            });
        } catch (error) {
            console.error("Failed to fetch import logs:", error);
        }
    }

    loadImportHistory();
});