// ============================================================================
// PVO SETTINGS.JS - RABIES SURVEILLANCE DATA IMPORT
// Community-Centric Rabies Intelligence System (CRIS)
// ============================================================================

// import { db, collection, writeBatch, doc, getDocs, query, orderBy } from "../js/settings-firebase.js";

document.addEventListener("DOMContentLoaded", () => {

    const historyTableBody = document.getElementById("uploadHistoryTableBody");

    // ========================================================================
    // LOAD REQUIRED LIBRARIES
    // ========================================================================
    
    if (typeof XLSX === 'undefined') {
        console.error("❌ XLSX library not loaded. Add this to your HTML:");
        console.error(`<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.min.js"></script>`);
    }

    // ========================================================================
    // CORE IMPORT SECTION INITIALIZER
    // ========================================================================

    function initImportSection({ cardTitle, fileInputId, collectionName, dataType }) {

        console.log(`🔍 [${dataType}] Looking for card with file input ID: #${fileInputId}`);
        
        const fileInput = document.querySelector(`#${fileInputId}`);
        
        if (!fileInput) {
            console.error(`❌ File input #${fileInputId} not found.`);
            return;
        }
        
        console.log(`✅ Found file input #${fileInputId}`);
        
        let cardElement = fileInput.closest("section.card");
        
        if (!cardElement) {
            console.error(`❌ Card element not found for #${fileInputId}`);
            return;
        }
        
        console.log(`✅ Found card element for ${cardTitle}`);

        const uploadLabel = cardElement.querySelector("label.file-upload");
        const uploadButton = cardElement.querySelector(".card-actions .btn-primary");

        console.log(`📊 [${dataType}] Elements found:`);
        console.log(`   fileInput (#${fileInputId}): ✅`);
        console.log(`   uploadLabel: ${uploadLabel ? "✅" : "❌"}`);
        console.log(`   uploadButton: ${uploadButton ? "✅" : "❌"}`);

        if (!uploadLabel) {
            console.error(`❌ CRITICAL: uploadLabel not found for ${cardTitle}`);
            return;
        }

        const defaultLabelText = "📤 Click to upload (CSV, XLSX)";
        let selectedFile = null;
        let parsedData = null;

        if (uploadButton) uploadButton.disabled = false;

        // ====================================================================
        // SETUP FILE INPUT
        // ====================================================================
        
        if (fileInput) {
            fileInput.addEventListener("click", () => {
                fileInput.value = "";
            });
            fileInput.addEventListener("change", handleFileSelection);
        }

        // ====================================================================
        // MAKE LABEL CLICKABLE
        // ====================================================================

        function attachLabelClickHandler() {
            if (!uploadLabel) return;
            uploadLabel.onclick = (event) => {
                if (event.target.closest(".file-clear-trigger-btn")) {
                    return;
                }
                if (fileInput) {
                    fileInput.click();
                }
            };
        }

        attachLabelClickHandler();

        // ====================================================================
        // SETUP UPLOAD BUTTON
        // ====================================================================

        if (uploadButton) {
            uploadButton.addEventListener("click", handleProcessUpload);
        }

        // ====================================================================
        // PARSE CSV DATA
        // ====================================================================

        function parseCSV(csvText) {
            console.log("📖 Parsing CSV file...");
            const rows = csvText.split('\n').map(row => {
                const result = [];
                let current = '';
                let insideQuotes = false;

                for (let i = 0; i < row.length; i++) {
                    const char = row[i];
                    const nextChar = row[i + 1];

                    if (char === '"') {
                        if (insideQuotes && nextChar === '"') {
                            current += '"';
                            i++;
                        } else {
                            insideQuotes = !insideQuotes;
                        }
                    } else if (char === ',' && !insideQuotes) {
                        result.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                result.push(current.trim());
                return result;
            });

            return rows;
        }

        // ====================================================================
        // HANDLE FILE SELECTION
        // ====================================================================

        function handleFileSelection(event) {
            const file = event.target.files[0];

            if (!file) {
                resetToEmptyState();
                return;
            }

            console.log(`📁 File selected: ${file.name} (${file.type})`);

            const extension = file.name.split(".").pop().toUpperCase();
            console.log(`📌 File extension: ${extension}`);

            if (!["CSV", "XLS", "XLSX"].includes(extension)) {
                alert("❌ Invalid file.\n\nPlease upload a CSV, XLS or XLSX file.");
                resetToEmptyState();
                return;
            }

            const reader = new FileReader();

            reader.onload = function (e) {
                try {
                    let rawRows;

                    // ========================================================
                    // HANDLE CSV FILES
                    // ========================================================
                    if (extension === "CSV") {
                        console.log("🔄 Processing as CSV...");
                        const csvText = e.target.result;
                        rawRows = parseCSV(csvText);
                        console.log(`✅ CSV parsed: ${rawRows.length} rows`);
                    }
                    // ========================================================
                    // HANDLE EXCEL FILES (XLS, XLSX)
                    // ========================================================
                    else {
                        console.log("🔄 Processing as Excel...");
                        const data = new Uint8Array(e.target.result);
                        
                        if (typeof XLSX === 'undefined') {
                            throw new Error("XLSX library is not loaded. Please ensure the XLSX script tag is included in your HTML.");
                        }

                        const workbook = XLSX.read(data, { type: "array" });
                        const firstSheet = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[firstSheet];
                        rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                        console.log(`✅ Excel parsed: ${rawRows.length} rows`);
                    }

                    if (rawRows.length < 5) {
                        throw new Error("The spreadsheet does not contain enough rows.");
                    }

                    const cleanData = [];

                    // ========================================================
                    // PVO FORMAT: Parse data starting from row 3 (index 3)
                    // Row 0: Headers
                    // Row 1-2: Empty/formatting
                    // Row 3+: Data
                    // ========================================================
                    
                    console.log(`📋 [${dataType}] Parsing PVO format (starting from row 3)...`);
                    
                    for (let rowIndex = 3; rowIndex < rawRows.length; rowIndex++) {
                        const row = rawRows[rowIndex];
                        if (!row || row.length < 2) continue;

                        // Column 0: District (can be empty for sub-rows)
                        const district = row[0] ? row[0].toString().trim() : "";
                        
                        // Column 1: Municipality/City (Main identifier - REQUIRED)
                        const municipality = row[1] ? row[1].toString().trim() : "";
                        if (!municipality) continue; // Skip if no municipality

                        // Skip totals
                        const lowerMun = municipality.toLowerCase();
                        if (lowerMun === "total" || lowerMun === "grand total") continue;

                        // Skip barangays
                        const barangayIndicators = ["barangay", "brgy", "bgy", "poblacion"];
                        if (barangayIndicators.some(keyword => lowerMun.includes(keyword))) continue;

                        // ====================================================
                        // PVO SURVEILLANCE DATA (12 columns)
                        // ====================================================
                        if (dataType === "cases") {
                            cleanData.push({
                                district: district || "N/A",              // Column 0
                                municipality: municipality,               // Column 1
                                dogPopulation: Number(row[2]) || 0,      // Column 2
                                vaccinatedDogs: Number(row[3]) || 0,     // Column 3
                                vaccinatedCats: Number(row[4]) || 0,     // Column 4
                                vaccinationPercentage: Number(row[5]) || 0, // Column 5 (% of Vaccination)
                                castrated: Number(row[6]) || 0,          // Column 6
                                spayed: Number(row[7]) || 0,             // Column 7
                                headSamplesSubmitted: Number(row[8]) || 0, // Column 8
                                rabiesPositive: Number(row[9]) || 0,     // Column 9
                                rabiesNegative: Number(row[10]) || 0,    // Column 10
                                humanDeath: Number(row[11]) || 0         // Column 11
                            });
                        }
                        // ====================================================
                        // POPULATION DATA (if needed for PVO)
                        // ====================================================
                        else if (dataType === "population") {
                            cleanData.push({
                                district: district || "N/A",
                                municipality: municipality,
                                totalPopulation: Number(row[2]) || 0
                            });
                        }
                    }

                    if (cleanData.length === 0) {
                        throw new Error("No valid data rows were found.");
                    }

                    selectedFile = file;
                    parsedData = { cleanData, recordCount: cleanData.length };

                    renderSelectedFile(file);

                    if (uploadButton) {
                        uploadButton.disabled = false;
                    }

                } catch (error) {
                    console.error("❌ Parse Error:", error);
                    alert(`❌ Validation Failed\n\n${error.message}`);
                    resetToEmptyState();
                }
            };

            reader.onerror = function() {
                console.error("❌ File read error");
                alert("❌ Error reading file. Please try again.");
                resetToEmptyState();
            };

            if (extension === "CSV") {
                reader.readAsText(file);
            } else {
                reader.readAsArrayBuffer(file);
            }
        }

        // ====================================================================
        // RENDER SELECTED FILE UI
        // ====================================================================

        function renderSelectedFile(file) {
            console.log(`🎨 [${dataType}] Rendering selected file: ${file.name}`);

            const formattedSize = (file.size / 1024).toFixed(1);

            uploadLabel.innerHTML = `
                <button
                    type="button"
                    class="file-change-trigger-btn"
                    style="
                        width:100%;
                        padding:12px;
                        border:2px dashed #d4d4d4;
                        border-radius:8px;
                        background:white;
                        cursor:pointer;
                        font-size:14px;
                        font-weight:600;
                        transition:.25s;
                    ">
                    📂 Change selected file
                </button>

                <div
                    style="
                        margin-top:12px;
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        background:#f7f7f7;
                        border-radius:8px;
                        padding:12px;
                        gap:12px;
                    ">
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${file.name}
                        </div>
                        <small style="color:#666;">
                            ${formattedSize} KB
                        </small>
                    </div>

                    <button
                        type="button"
                        class="file-clear-trigger-btn"
                        style="
                            width:36px;
                            height:36px;
                            border:none;
                            border-radius:6px;
                            background:#d32f2f;
                            color:white;
                            cursor:pointer;
                            font-size:16px;
                            font-weight:bold;
                            flex-shrink:0;
                        ">
                        ✕
                    </button>
                </div>
            `;

            bindFileButtons();
        }

        // ====================================================================
        // BIND FILE BUTTONS
        // ====================================================================

        function bindFileButtons() {
            console.log(`🔗 [${dataType}] Binding file buttons...`);
            const changeButton = uploadLabel.querySelector(".file-change-trigger-btn");
            const clearButton = uploadLabel.querySelector(".file-clear-trigger-btn");

            if (changeButton) {
                changeButton.onclick = (e) => {
                    e.preventDefault();
                    fileInput.click();
                };
            }

            if (clearButton) {
                clearButton.onclick = (e) => {
                    e.preventDefault();
                    resetToEmptyState();
                };
            }
        }

        // ====================================================================
        // RESET TO EMPTY STATE
        // ====================================================================

        function resetToEmptyState() {
            selectedFile = null;
            parsedData = null;
            if (fileInput) fileInput.value = "";
            uploadLabel.innerHTML = defaultLabelText;
            attachLabelClickHandler();
            if (uploadButton) uploadButton.disabled = false;
        }

        // ====================================================================
        // HANDLE UPLOAD PROCESS
        // ====================================================================

        async function handleProcessUpload() {
            if (!selectedFile || !parsedData) {
                alert("Please select a file first.");
                return;
            }

            const originalButtonText = uploadButton.textContent;
            uploadButton.disabled = true;
            uploadButton.textContent = "Processing...";

            try {
                console.log(`Uploading ${cardTitle}...`);

                const MAX_BATCH_SIZE = 500;
                let batch = writeBatch(db);
                let operationCount = 0;

                // BATCH WRITE: Main data
                for (let index = 0; index < parsedData.cleanData.length; index++) {
                    const row = parsedData.cleanData[index];

                    if (operationCount >= MAX_BATCH_SIZE) {
                        await batch.commit();
                        batch = writeBatch(db);
                        operationCount = 0;
                    }

                    const documentReference = doc(collection(db, collectionName));

                    if (dataType === "cases") {
                        // ====================================================
                        // PVO RABIES SURVEILLANCE DATA
                        // ====================================================
                        batch.set(documentReference, {
                            district: row.district,
                            municipality: row.municipality,
                            year: new Date().getFullYear(),
                            dogPopulation: row.dogPopulation,
                            vaccinatedDogs: row.vaccinatedDogs,
                            vaccinatedCats: row.vaccinatedCats,
                            vaccinationPercentage: row.vaccinationPercentage,
                            castrated: row.castrated,
                            spayed: row.spayed,
                            headSamplesSubmitted: row.headSamplesSubmitted,
                            rabiesPositive: row.rabiesPositive,
                            rabiesNegative: row.rabiesNegative,
                            humanDeath: row.humanDeath,
                            documentOrder: index,
                            uploadedAt: new Date()
                        });
                    } else {
                        // Population data (if used)
                        batch.set(documentReference, {
                            district: row.district,
                            municipality: row.municipality,
                            year: new Date().getFullYear(),
                            totalPopulation: row.totalPopulation,
                            documentOrder: index,
                            uploadedAt: new Date()
                        });
                    }

                    operationCount++;
                }

                if (operationCount > 0) {
                    await batch.commit();
                }

                // BATCH WRITE: History log
                batch = writeBatch(db);
                const historyReference = doc(collection(db, "pvo_import_history"));

                // Calculate total from uploaded data
                const totalValue = dataType === "cases"
                    ? parsedData.cleanData.reduce((sum, row) => sum + row.dogPopulation, 0)
                    : parsedData.cleanData.reduce((sum, row) => sum + row.totalPopulation, 0);

                batch.set(historyReference, {
                    fileName: selectedFile.name,
                    totalCases: totalValue,
                    totalFacilities: parsedData.recordCount,
                    timestamp: new Date(),
                    status: "Completed",
                    importType: dataType
                });

                await batch.commit();

                // Refresh other components
                document.dispatchEvent(new CustomEvent("importHistoryUpdated"));

                // Add to history table
                const uploadTime = new Date().toLocaleString("en-US", {
                    month: "2-digit",
                    day: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true
                });

                const recordText = dataType === "cases"
                    ? `${parsedData.recordCount} Municipalities`
                    : `${parsedData.recordCount} Municipalities (Population)`;

                addHistoryRow(uploadTime, selectedFile.name, recordText, "Completed");

                alert(`✅ Upload Successful!\n\nFile: ${selectedFile.name}\n\nRecords Imported: ${parsedData.recordCount}`);

                resetToEmptyState();

            } catch (error) {
                console.error(error);
                alert(`Upload Failed\n\n${error.message}`);
            } finally {
                uploadButton.disabled = false;
                uploadButton.textContent = originalButtonText;
            }
        }
    }

    // ========================================================================
    // ADD HISTORY ROW
    // ========================================================================

    function addHistoryRow(date, fileName, records, status) {
        if (!historyTableBody) return;

        const row = document.createElement("tr");
        const badgeClass = status.toLowerCase() === "completed" ? "success" : "danger";

        row.innerHTML = `
            <td>${date}</td>
            <td style="font-family: monospace;">${fileName}</td>
            <td><strong>${records}</strong></td>
            <td><span class="badge ${badgeClass}">${status}</span></td>
        `;

        historyTableBody.prepend(row);
    }

    // ========================================================================
    // LOAD HISTORY TABLE
    // ========================================================================

    async function loadImportHistory() {
        if (!historyTableBody) return;
        try {
            const q = query(collection(db, "pvo_import_history"), orderBy("timestamp", "desc"));
            const querySnapshot = await getDocs(q);

            historyTableBody.innerHTML = "";

            querySnapshot.forEach((docSnapshot) => {
                const data = docSnapshot.data();
                let dateObj;

                if (data.timestamp && typeof data.timestamp.toDate === "function") {
                    dateObj = data.timestamp.toDate();
                } else if (data.timestamp instanceof Date) {
                    dateObj = data.timestamp;
                } else if (data.timestamp && data.timestamp.seconds) {
                    dateObj = new Date(data.timestamp.seconds * 1000);
                } else {
                    dateObj = new Date();
                }

                const dateString = dateObj.toLocaleString("en-US", {
                    month: "2-digit",
                    day: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true
                });

                const recordText = data.importType === "population"
                    ? `${data.totalFacilities || 0} Municipalities (Population)`
                    : `${data.totalFacilities || 0} Municipalities`;

                addHistoryRow(dateString, data.fileName || "unknown_file", recordText, data.status || "Completed");
            });
        } catch (error) {
            console.error("Failed to fetch import history:", error);
        }
    }

    // ========================================================================
    // INITIALIZE IMPORT CARDS FOR PVO
    // ========================================================================

    initImportSection({
        cardTitle: "Import Rabies Surveillance Data",
        fileInputId: "caseDataFile",
        collectionName: "pvo_rabies_cases",
        dataType: "cases"
    });

    initImportSection({
        cardTitle: "Import Iloilo Province Population Dataset",
        fileInputId: "populationDataFile",
        collectionName: "pvo_population_data",
        dataType: "population"
    });

    // ========================================================================
    // LOAD EXISTING HISTORY & LISTEN FOR UPDATES
    // ========================================================================

    loadImportHistory();

    document.addEventListener("importHistoryUpdated", loadImportHistory);

});