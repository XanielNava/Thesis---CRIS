// ============================================================================
// SETTINGS.JS - CLEAN VERSION
// Community-Centric Rabies Intelligence System (CRIS)
// ============================================================================

import {
    db,
    collection,
    writeBatch,
    doc,
    getDocs,
    query,
    orderBy
} from "../js/settings-firebase.js";

document.addEventListener("DOMContentLoaded", () => {

    const historyTableBody = document.getElementById("uploadHistoryTableBody");

    // ========================================================================
    // CORE IMPORT SECTION INITIALIZER
    // ========================================================================

    function initImportSection({ cardTitle, fileInputId, collectionName, dataType }) {

        // Find card by title
        let cardElement = null;
        const cardHeadings = document.querySelectorAll("h3.card-title");

        console.log(`🔍 [${dataType}] Looking for card: "${cardTitle}"`);

        for (const heading of cardHeadings) {
            console.log(`   Checking heading: "${heading.textContent}"`);
            if (heading.textContent.includes(cardTitle)) {
                cardElement = heading.closest("section.card");
                console.log(`   ✅ FOUND!`);
                break;
            }
        }

        if (!cardElement) {
            console.error(`❌ Card "${cardTitle}" not found.`);
            return;
        }

        // Get all elements within this card
        const fileInput = cardElement.querySelector(`#${fileInputId}`);
        const uploadLabel = cardElement.querySelector("label.file-upload");
        const uploadButton = cardElement.querySelector(".card-actions .btn-primary");

        console.log(`📊 [${dataType}] Elements found:`);
        console.log(`   fileInput (#${fileInputId}): ${fileInput ? "✅" : "❌"}`);
        console.log(`   uploadLabel: ${uploadLabel ? "✅" : "❌"}`);
        console.log(`   uploadButton: ${uploadButton ? "✅" : "❌"}`);

        if (!uploadLabel) {
            console.error(`❌ CRITICAL: uploadLabel not found for ${cardTitle}`);
            return;
        }

        // Local state
        const defaultLabelText = "📤 Click to upload (CSV, XLSX, max 10MB)";
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
        // HANDLE FILE SELECTION
        // ====================================================================

        function handleFileSelection(event) {
            const file = event.target.files[0];

            if (!file) {
                resetToEmptyState();
                return;
            }

            const extension = file.name.split(".").pop().toUpperCase();
            if (!["CSV", "XLS", "XLSX"].includes(extension)) {
                alert("❌ Invalid file.\n\nPlease upload a CSV, XLS or XLSX file.");
                resetToEmptyState();
                return;
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: "array" });
                    const firstSheet = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheet];
                    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                    if (rawRows.length < 5) {
                        throw new Error("The spreadsheet does not contain enough rows.");
                    }

                    const cleanData = [];

                    // Parse data starting from row 3 (index 3)
                    for (let rowIndex = 3; rowIndex < rawRows.length; rowIndex++) {
                        const row = rawRows[rowIndex];
                        if (!row || row.length < 2) continue;

                        const facilityName = row[0] ? row[0].toString().trim() : "";
                        if (!facilityName) continue;

                        // Skip totals
                        const lowerName = facilityName.toLowerCase();
                        if (lowerName === "total" || lowerName === "grand total") continue;

                        // Skip barangays
                        const barangayIndicators = ["barangay", "brgy", "bgy", "poblacion"];
                        if (barangayIndicators.some(keyword => lowerName.includes(keyword))) continue;

                        // Skip indented rows
                        const rawName = row[0] ? row[0].toString() : "";
                        const leadingSpaces = rawName.length - rawName.trimStart().length;
                        if (leadingSpaces > 2) continue;

                        // CASE DATA
                        if (dataType === "cases") {
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
                        }
                        // POPULATION DATA
                        else if (dataType === "population") {
                            cleanData.push({
                                municipality: facilityName,
                                totalPopulation: Number(row[1]) || 0
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
                    console.error(error);
                    alert(`❌ Validation Failed\n\n${error.message}`);
                    resetToEmptyState();
                }
            };

            reader.readAsArrayBuffer(file);
        }

        // ====================================================================
        // RENDER SELECTED FILE UI
        // ====================================================================

        function renderSelectedFile(file) {
            console.log(`🎨 [${dataType}] Rendering selected file: ${file.name}`);
            console.log(`   uploadLabel element: ${uploadLabel}`);
            console.log(`   uploadLabel.innerHTML before: "${uploadLabel.innerHTML.substring(0, 50)}..."`);

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

            console.log(`   uploadLabel.innerHTML after: "${uploadLabel.innerHTML.substring(0, 100)}..."`);
            console.log(`   Looking for .file-clear-trigger-btn...`);
            const clearBtn = uploadLabel.querySelector(".file-clear-trigger-btn");
            console.log(`   .file-clear-trigger-btn found: ${clearBtn ? "✅" : "❌"}`);

            bindFileButtons();
        }

        // ====================================================================
        // BIND FILE BUTTONS
        // ====================================================================

        function bindFileButtons() {
            console.log(`🔗 [${dataType}] Binding file buttons...`);
            const changeButton = uploadLabel.querySelector(".file-change-trigger-btn");
            const clearButton = uploadLabel.querySelector(".file-clear-trigger-btn");

            console.log(`   .file-change-trigger-btn: ${changeButton ? "✅" : "❌"}`);
            console.log(`   .file-clear-trigger-btn: ${clearButton ? "✅" : "❌"}`);

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
            } else {
                console.warn(`⚠️ [${dataType}] Clear button NOT FOUND - X button may not be visible!`);
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
                        batch.set(documentReference, {
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
                    } else {
                        batch.set(documentReference, {
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
                const historyReference = doc(collection(db, "import_history"));

                const totalValue = dataType === "cases"
                    ? parsedData.cleanData.reduce((sum, row) => sum + row.total, 0)
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
                    ? `${parsedData.recordCount} Municipalities (All Columns)`
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
            const q = query(collection(db, "import_history"), orderBy("timestamp", "desc"));
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
                    : `${data.totalFacilities || 0} Municipalities (All Columns)`;

                addHistoryRow(dateString, data.fileName || "unknown_file", recordText, data.status || "Completed");
            });
        } catch (error) {
            console.error("Failed to fetch import history:", error);
        }
    }

    // ========================================================================
    // INITIALIZE BOTH IMPORT CARDS
    // ========================================================================

    initImportSection({
        cardTitle: "Import Case Data",
        fileInputId: "caseDataFile",
        collectionName: "rabies_cases",
        dataType: "cases"
    });

    initImportSection({
        cardTitle: "Import Iloilo Province Population Dataset",
        fileInputId: "populationDataFile",
        collectionName: "population_data",
        dataType: "population"
    });

    // ========================================================================
    // LOAD EXISTING HISTORY & LISTEN FOR UPDATES
    // ========================================================================

    loadImportHistory();

    document.addEventListener("importHistoryUpdated", loadImportHistory);

});