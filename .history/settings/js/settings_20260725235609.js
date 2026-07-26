// ============================================================================
// SETTINGS.JS - CLEAN & ENHANCED VERSION
// Community-Centric Rabies Intelligence System (CRIS)
// ============================================================================

import { db, collection, writeBatch, doc, getDocs, query, orderBy } from "../js/settings-firebase.js";

document.addEventListener("DOMContentLoaded", () => {

    const historyTableBody = document.getElementById("uploadHistoryTableBody");

    // ========================================================================
    // CORE IMPORT SECTION INITIALIZER
    // ========================================================================

    function initImportSection({ cardTitle, fileInputId, collectionName, dataType }) {

        console.log(`🔍 [${dataType}] Initializing section for input: #${fileInputId}`);

        const fileInput = document.querySelector(`#${fileInputId}`);
        if (!fileInput) {
            console.error(`❌ File input #${fileInputId} not found.`);
            return;
        }

        const cardElement = fileInput.closest("section.card");
        if (!cardElement) {
            console.error(`❌ Card element not found for #${fileInputId}`);
            return;
        }

        const uploadLabel = cardElement.querySelector("label.file-upload");
        const uploadButton = cardElement.querySelector(".card-actions .btn-primary");

        if (!uploadLabel) {
            console.error(`❌ CRITICAL: uploadLabel not found for ${cardTitle}`);
            return;
        }

        // Local state initialization
        const defaultLabelText = "📤 Click to upload (CSV, XLSX)";
        let selectedFile = null;
        let parsedData = null;

        if (uploadButton) uploadButton.disabled = false;

        // ====================================================================
        // FILE INPUT LISTENERS
        // ====================================================================

        fileInput.addEventListener("click", () => {
            fileInput.value = "";
        });

        fileInput.addEventListener("change", handleFileSelection);

        // ====================================================================
        // LABEL DELEGATED CLICK HANDLER
        // ====================================================================

        uploadLabel.addEventListener("click", (event) => {
            if (event.target.closest(".file-clear-trigger-btn")) {
                event.preventDefault();
                event.stopPropagation();
                resetToEmptyState();
                return;
            }

            if (event.target.closest(".file-change-trigger-btn")) {
                event.preventDefault();
                event.stopPropagation();
                fileInput.click();
                return;
            }

            // Default click on regular label area
            if (!selectedFile) {
                fileInput.click();
            }
        });

        // ====================================================================
        // SETUP UPLOAD BUTTON
        // ====================================================================

        if (uploadButton) {
            uploadButton.addEventListener("click", handleProcessUpload);
        }

        // ====================================================================
        // HANDLE FILE SELECTION & PARSING
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

                    // Parse data starting from row index 3
                    for (let rowIndex = 3; rowIndex < rawRows.length; rowIndex++) {
                        const row = rawRows[rowIndex];
                        if (!row || row.length < 2) continue;

                        const facilityName = row[0] ? row[0].toString().trim() : "";
                        if (!facilityName) continue;

                        const lowerName = facilityName.toLowerCase();

                        // Exclude headers, totals, and barangay-level rows
                        if (lowerName === "total" || lowerName === "grand total") continue;
                        const barangayIndicators = ["barangay", "brgy", "bgy", "poblacion"];
                        if (barangayIndicators.some(keyword => lowerName.includes(keyword))) continue;

                        // Check indentation level
                        const rawName = row[0] ? row[0].toString() : "";
                        const leadingSpaces = rawName.length - rawName.trimStart().length;
                        if (leadingSpaces > 2) continue;

                        // DATA SCHEMAS
                        if (dataType === "cases") {
                            // Extract only primary demographic case metrics
                            const male = Number(row[1]) || 0;
                            const female = Number(row[2]) || 0;

                            cleanData.push({
                                abtc: facilityName,
                                maleCases: male,
                                femaleCases: female,
                                ageLt15: Number(row[3]) || 0,
                                ageGt15: Number(row[4]) || 0,
                                totalCases: male + female
                            });
                        } else if (dataType === "population") {
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

                    if (uploadButton) uploadButton.disabled = false;

                } catch (error) {
                    console.error(`[${dataType}] Processing error:`, error);
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
                        <div 
                            style="
                            font-weight:600; 
                            white-space:nowrap; 
                            overflow:hidden; 
                            text-overflow:ellipsis;
                            ">
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
        }

        // ====================================================================
        // RESET TO EMPTY STATE
        // ====================================================================

        function resetToEmptyState() {
            selectedFile = null;
            parsedData = null;
            if (fileInput) fileInput.value = "";
            uploadLabel.innerHTML = defaultLabelText;
            if (uploadButton) uploadButton.disabled = false;
        }

        // ====================================================================
        // HANDLE FIRESTORE BATCH UPLOAD
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
                console.log(`🚀 Uploading ${cardTitle}...`);

                const MAX_BATCH_SIZE = 500;
                let batch = writeBatch(db);
                let operationCount = 0;

                // 1. Batch write main records
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
                            totalCases: row.totalCases,
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

                // 2. Batch write history log entry
                batch = writeBatch(db);
                const historyReference = doc(collection(db, "pho_import_history"));

                const totalValue = dataType === "cases"
                    ? parsedData.cleanData.reduce((sum, row) => sum + row.totalCases, 0)
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

                // 3. Dispatch global event to refresh history UI
                document.dispatchEvent(new CustomEvent("importHistoryUpdated"));

                alert(`✅ Upload Successful!\n\nFile: ${selectedFile.name}\n\nRecords Imported: ${parsedData.recordCount}`);

                resetToEmptyState();

            } catch (error) {
                console.error(`❌ Upload Failed for ${cardTitle}:`, error);
                alert(`Upload Failed\n\n${error.message}`);
            } finally {
                uploadButton.disabled = false;
                uploadButton.textContent = originalButtonText;
            }
        }
    }

    // ========================================================================
    // HISTORY LOG UI MANAGEMENT
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

    async function loadImportHistory() {
        if (!historyTableBody) return;
        try {
            const q = query(collection(db, "pho_import_history"), orderBy("timestamp", "desc"));
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
                    : `${data.totalFacilities || 0} Municipalities (Cases Demographic Only)`;

                addHistoryRow(dateString, data.fileName || "unknown_file", recordText, data.status || "Completed");
            });
        } catch (error) {
            console.error("Failed to fetch import history:", error);
        }
    }

    // ========================================================================
    // INITIALIZATION & EVENT BINDINGS
    // ========================================================================

    // Case Data Import Section
    initImportSection({
        cardTitle: "Legacy Total Annual Animal Bite Cases",
        fileInputId: "caseDataFile",
        collectionName: "pho_legacy_total_annual_bite_cases",
        dataType: "cases"
    });

    // Population Dataset Import Section
    initImportSection({
        cardTitle: "Iloilo Province Population",
        fileInputId: "populationDataFile",
        collectionName: "pho_population_data",
        dataType: "population"
    });

    // Load initial import history log
    loadImportHistory();

    // Listen for real-time history refresh events
    document.addEventListener("importHistoryUpdated", loadImportHistory);

});