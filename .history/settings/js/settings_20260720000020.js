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

        reader.onload = function (evt) {

            try {

                const data = new Uint8Array(evt.target.result);

                const workbook = XLSX.read(data, { type: 'array' });



                const firstSheetName = workbook.SheetNames[0];

                const worksheet = workbook.Sheets[firstSheetName];



                // ===== READ RAW ROWS (PSA document has 3 header rows) =====

                const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });



                if (rawRows.length < 5) {

                    throw new Error("The selected spreadsheet is too short.");

                }



                console.log(`📊 Total rows: ${rawRows.length}`);

                console.log(`Row 4 (First data): ${JSON.stringify(rawRows[3].slice(0, 10))}`);



                // ===== PARSE DATA ROWS (Data starts at row 4 = index 3) =====

                const cleanData = [];



                for (let rowIdx = 3; rowIdx < rawRows.length; rowIdx++) {

                    const row = rawRows[rowIdx];

                    if (!row || row.length < 2) continue;



                    const facilityName = row[0] ? row[0].toString().trim() : "";



                    if (!facilityName || facilityName === "") continue;



                    // Skip total rows

                    if (facilityName.toLowerCase() === "total" || facilityName.toLowerCase() === "grand total") {

                        continue;

                    }



                    // Skip barangay-level rows (but NOT "District Hospital" which contains "District")

                    const barangayIndicators = ['barangay', 'brgy', 'bgy', 'poblacion'];

                    const isBrgy = barangayIndicators.some(ind => facilityName.toLowerCase().includes(ind));

                    if (isBrgy) {

                        console.log(`⏭️ Skipping barangay: ${facilityName}`);

                        continue;

                    }



                    // Check for leading spaces (indented = likely barangay)

                    const rawStr = row[0] ? row[0].toString() : "";

                    const leadingSpaces = rawStr.length - rawStr.trimStart().length;

                    if (leadingSpaces > 2) {

                        console.log(`⏭️ Skipping indented row: ${facilityName}`);

                        continue;

                    }



                    // ===== EXTRACT BY COLUMN POSITION (PSA standard) =====

                    // Column positions verified from actual Excel file:

                    // A(0): ABTC

                    // B(1): Male, C(2): Female

                    // D(3): <15, E(4): >15

                    // F(5): Dog, G(6): Cat, H(7): Others

                    // I(8): Cat1, J(9): Cat2, K(10): Cat New, L(11): Cat Booster

                    // M(12): HR

                    // N(13): TCV, O(14): HRIG, P(15): ERIG

                    // Q(16): TOTAL

                    // R(17): Comp II, S(18): Comp III

                    // T(19): Incomplete II, U(20): Incomplete III

                    // V(21): None II, W(22): None III

                    // X(23): REP ✅



                    cleanData.push({

                        abtc: facilityName,

                        maleCases: Number(row[1]) || 0,                  // B: Male

                        femaleCases: Number(row[2]) || 0,                // C: Female

                        ageLt15: Number(row[3]) || 0,                    // D: < 15

                        ageGt15: Number(row[4]) || 0,                    // E: > 15

                        bitingDog: Number(row[5]) || 0,                  // F: Dog

                        bitingCat: Number(row[6]) || 0,                  // G: Cat

                        bitingOthers: Number(row[7]) || 0,               // H: Others

                        humanCat1: Number(row[8]) || 0,                  // I: Cat 1

                        humanCat2: Number(row[9]) || 0,                  // J: Cat 2

                        humanCatNew: Number(row[10]) || 0,               // K: Cat New

                        humanCatBooster: Number(row[11]) || 0,           // L: Cat Booster

                        hr: Number(row[12]) || 0,                        // M: HR

                        petTcv: Number(row[13]) || 0,                    // N: TCV

                        petHrig: Number(row[14]) || 0,                   // O: HRIG

                        petErig: Number(row[15]) || 0,                   // P: ERIG

                        total: Number(row[16]) || 0,                     // Q: TOTAL

                        remarksCompII: Number(row[17]) || 0,             // R: Comp II

                        remarksCompIII: Number(row[18]) || 0,            // S: Comp III

                        remarksIncompleteII: Number(row[19]) || 0,       // T: Incomplete II

                        remarksIncompleteIII: Number(row[20]) || 0,      // U: Incomplete III

                        remarksNoneII: Number(row[21]) || 0,             // V: None II

                        remarksNoneIII: Number(row[22]) || 0,            // W: None III

                        rep: Number(row[23]) || 0                        // X: REP ✅ FIXED

                    });



                    console.log(`✅ Added: ${facilityName} | REP=${row[23]}`);

                }



                if (cleanData.length === 0) {

                    throw new Error("No valid municipality data rows found in the spreadsheet.");

                }



                console.log(`✅ Parsed ${cleanData.length} valid municipalities`);



                selectedFile = file;

                parsedData = {

                    cleanData,

                    facilityCount: cleanData.length

                };



                const formattedSize = (file.size / 1024).toFixed(1);



                // Update label dynamically without destroying the original hidden file input DOM element

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
        <div style="flex: 1;">
            <span style="font-weight: 600; color: #333; font-size: 13px;">${file.name}</span>
            <span style="font-size: 12px; color: #666; margin-left: 8px;">(${formattedSize} KB)</span>
        </div>
        <button type="button" style="
            background: #D32F2F;
            color: white;
            border: none;
            padding: 6px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 18px;
            font-weight: bold;
        " id="clearFileBtn">
            ✕
        </button>
    </div>
`;

                // Re-bind the active trigger to the original hidden file input element
                const changeBtn = uploadLabel.querySelector('#caseFileSelectBtn');
                changeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    fileInput.click();
                });

                // ✅ NEW: Add clear file button
                const clearBtn = uploadLabel.querySelector('#clearFileBtn');
                clearBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    resetToEmptyState();
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



        // Restore original UI state safely

        uploadLabel.innerHTML = defaultLabelText;

        if (fileInput) {

            fileInput.value = null;

        }



        if (uploadBtn) {

            uploadBtn.disabled = false;

        }

    }



    // =========================================================================

    // 🚀 BATCH UPLOAD (With 500 Firestore Limit Bypass Chunking) & IMPORT LOG SYNC

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

            console.log("⚡ [CRIS] Preparing chunked database transaction batches for Case Data...");



            const batchLimit = 500;

            let batch = writeBatch(db);

            let opCount = 0;



            // 1. Process and upload facility cases in chunks of 500

            for (let index = 0; index < parsedData.cleanData.length; index++) {

                const row = parsedData.cleanData[index];



                if (opCount >= batchLimit) {

                    console.log("⚡ [CRIS] Batch limit reached. Committing chunk...");

                    await batch.commit();

                    batch = writeBatch(db);

                    opCount = 0;

                }



                const docRef = doc(collection(db, "rabies_cases"));



                batch.set(docRef, {

                    facilityName: row.abtc,

                    year: new Date().getFullYear(),



                    // Sex

                    maleCases: row.maleCases,

                    femaleCases: row.femaleCases,



                    // Age

                    ageLessThan15: row.ageLt15,

                    ageGreaterThan15: row.ageGt15,



                    // Biting Animal

                    bitingDog: row.bitingDog,

                    bitingCat: row.bitingCat,

                    bitingOthers: row.bitingOthers,



                    // Human Bite Case

                    humanCat1: row.humanCat1,

                    humanCat2: row.humanCat2,

                    humanCatNew: row.humanCatNew,

                    humanCatBooster: row.humanCatBooster,



                    // HR

                    hr: row.hr,



                    // Post Exposure Treatment

                    petTcv: row.petTcv,

                    petHrig: row.petHrig,

                    petErig: row.petErig,



                    // Total

                    totalCases: row.total || (row.maleCases + row.femaleCases),



                    // Remarks

                    remarksCompII: row.remarksCompII,

                    remarksCompIII: row.remarksCompIII,

                    remarksIncompleteII: row.remarksIncompleteII,

                    remarksIncompleteIII: row.remarksIncompleteIII,

                    remarksNoneII: row.remarksNoneII,

                    remarksNoneIII: row.remarksNoneIII,



                    // REP ✅ FIXED

                    rep: row.rep,



                    // Document order

                    documentOrder: index,



                    uploadedAt: new Date()

                });



                opCount++;

            }



            // If we have remaining operations, write them

            if (opCount > 0) {

                await batch.commit();

            }



            // 2. Queue upload history log entry

            batch = writeBatch(db);

            const logRef = doc(collection(db, "import_history"));

            batch.set(logRef, {

                fileName: selectedFile.name,

                totalCases: parsedData.cleanData.reduce((sum, row) => sum + row.total, 0),

                totalFacilities: parsedData.facilityCount,

                timestamp: new Date(),

                status: "Completed"

            });



            console.log(`📤 [CRIS] Uploading final batch with history log...`);

            await batch.commit();

            console.log("✅ [CRIS] All transaction batches committed successfully!");



            // Dispatch event to inform any listeners to refresh import history

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

            // Add to live UI history table directly
            addHistoryRow(uploadTime, selectedFile.name, `${parsedData.facilityCount} Municipalities (All columns)`, 'Completed');

            alert(`✅ Success! Case data uploaded to Firestore.\n\nFile: ${selectedFile.name}\nFacilities: ${parsedData.facilityCount}\nAll columns populated`);

            resetToEmptyState();

        } catch (error) {
            console.error("Database upload failed: ", error);
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

            // Clear existing static mockup logs from the HTML first, if any
            historyTableBody.innerHTML = '';

            querySnapshot.forEach((docSnapshot) => {
                const data = docSnapshot.data();

                // Safe Timestamp converter logic
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
            console.error("Failed to fetch initial import logs:", error);
        }
    }

    // Boot up the log loader
    loadImportHistory();

});

