// ============================================================================
// PVO SETTINGS.JS - RABIES SURVEILLANCE DATA IMPORT
// Community-Centric Rabies Intelligence System (CRIS)
// ============================================================================

import { db, collection, writeBatch, doc, getDocs, query, orderBy } from "./settings-firebase.js";

document.addEventListener("DOMContentLoaded", () => {
    const historyTableBody = document.getElementById("uploadHistoryTableBody");

    // Helper: Clean and parse dynamic numeric/percentage inputs safely
    const parseNumeric = (val) => {
        if (val === null || val === undefined) return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        
        const cleaned = val.toString().replace(/[^0-9.-]/g, '');
        if (!cleaned) return 0;
        
        const num = parseFloat(cleaned);
        if (isNaN(num)) return 0;

        // Fix potential floating point weirdness from Excel conversions
        return Number.isInteger(num) ? num : Math.round(num * 10000) / 10000;
    };

    // Helper: Strip carriage returns and leading/trailing whitespace
    const cleanCellString = (val) => {
        if (val === null || val === undefined) return "";
        return val.toString().replace(/\r/g, '').trim();
    };

    // ========================================================================
    // LOAD REQUIRED LIBRARIES
    // ========================================================================
    if (typeof XLSX === 'undefined') {
        console.error("❌ XLSX library not loaded. Ensure CDN script is included in HTML.");
    }

    // ================= SIDEBAR TOGGLE ENGINE =================
    function setupSidebar() {
        const sidebarToggle = document.getElementById("sidebarToggle");
        const sidebar = document.getElementById("sidebar");

        if (sidebar && localStorage.getItem("sidebarCollapsed") === "true") {
            sidebar.classList.add("collapsed");
        }

        if (sidebarToggle && sidebar) {
            sidebarToggle.addEventListener("click", () => {
                sidebar.classList.toggle("collapsed");
                localStorage.setItem("sidebarCollapsed", sidebar.classList.contains("collapsed"));
            });
        }
    }
    setupSidebar();

    // ========================================================================
    // CORE IMPORT SECTION INITIALIZER
    // ========================================================================
    function initImportSection({ fileInputId, collectionName, dataType }) {
        const fileInput = document.getElementById(fileInputId);
        if (!fileInput) return;

        const cardElement = fileInput.closest("section.card");
        if (!cardElement) return;

        const uploadLabel = cardElement.querySelector("label.file-upload");
        const uploadButton = cardElement.querySelector(".card-actions .btn-primary");

        if (!uploadLabel) return;

        const defaultLabelText = "📤 Click to upload (CSV, XLSX)";
        let selectedFile = null;
        let parsedData = null;

        if (uploadButton) uploadButton.disabled = false;

        fileInput.addEventListener("click", () => { fileInput.value = ""; });
        fileInput.addEventListener("change", handleFileSelection);

        function attachLabelClickHandler() {
            uploadLabel.onclick = (event) => {
                if (event.target.closest(".file-clear-trigger-btn") || event.target.closest(".file-change-trigger-btn")) return;
                fileInput.click();
            };
        }
        attachLabelClickHandler();

        if (uploadButton) {
            uploadButton.addEventListener("click", handleProcessUpload);
        }

        function parseCSV(csvText) {
            const lines = csvText.split(/\r?\n/);
            return lines.map(row => {
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
        }

        function handleFileSelection(event) {
            const file = event.target.files[0];
            if (!file) {
                resetToEmptyState();
                return;
            }

            const extension = file.name.split(".").pop().toUpperCase();
            if (!["CSV", "XLS", "XLSX"].includes(extension)) {
                alert("❌ Invalid file format. Please upload CSV, XLS, or XLSX.");
                resetToEmptyState();
                return;
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    let rawRows;
                    if (extension === "CSV") {
                        rawRows = parseCSV(e.target.result);
                    } else {
                        if (typeof XLSX === 'undefined') throw new Error("XLSX library not loaded.");
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: "array" });
                        const firstSheet = workbook.SheetNames[0];
                        rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, defval: "" });
                    }

                    if (rawRows.length < 4) {
                        throw new Error("Insufficient data rows found in file.");
                    }

                    const cleanData = [];
                    for (let rowIndex = 3; rowIndex < rawRows.length; rowIndex++) {
                        const row = rawRows[rowIndex];
                        if (!row || row.length < 2) continue;

                        const district = cleanCellString(row[0]);
                        const municipality = cleanCellString(row[1]);
                        if (!municipality) continue;

                        const lowerMun = municipality.toLowerCase();
                        if (lowerMun === "total" || lowerMun === "grand total") continue;
                        
                        const barangayIndicators = ["barangay", "brgy", "bgy", "poblacion"];
                        if (barangayIndicators.some(keyword => lowerMun.includes(keyword))) continue;

                        if (dataType === "cases") {
                            cleanData.push({
                                district: district || "N/A",
                                municipality: municipality,
                                dogPopulation: parseNumeric(row[2]),
                                vaccinatedDogs: parseNumeric(row[3]),
                                vaccinatedCats: parseNumeric(row[4]),
                                vaccinationPercentage: parseNumeric(row[5]),
                                castrated: parseNumeric(row[6]),
                                spayed: parseNumeric(row[7]),
                                headSamplesSubmitted: parseNumeric(row[8]),
                                rabiesPositive: parseNumeric(row[9]),
                                rabiesNegative: parseNumeric(row[10]),
                                humanDeath: parseNumeric(row[11])
                            });
                        } else if (dataType === "population") {
                            cleanData.push({
                                district: district || "N/A",
                                municipality: municipality,
                                totalPopulation: parseNumeric(row[2])
                            });
                        }
                    }

                    if (cleanData.length === 0) throw new Error("No valid records were parsed.");

                    selectedFile = file;
                    parsedData = { cleanData, recordCount: cleanData.length };
                    renderSelectedFile(file);

                } catch (error) {
                    console.error("Parse Error:", error);
                    alert(`❌ Parse Failed: ${error.message}`);
                    resetToEmptyState();
                }
            };

            if (extension === "CSV") {
                reader.readAsText(file);
            } else {
                reader.readAsArrayBuffer(file);
            }
        }

        function renderSelectedFile(file) {
            const formattedSize = (file.size / 1024).toFixed(1);
            uploadLabel.innerHTML = `
                <button type="button" class="file-change-trigger-btn" style="width:100%; padding:12px; border:2px dashed #d4d4d4; border-radius:8px; background:white; cursor:pointer; font-size:14px; font-weight:600;">
                    📂 Change selected file
                </button>
                <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center; background:#f7f7f7; border-radius:8px; padding:12px; gap:12px;">
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${file.name}</div>
                        <small style="color:#666;">${formattedSize} KB</small>
                    </div>
                    <button type="button" class="file-clear-trigger-btn" style="width:36px; height:36px; border:none; border-radius:6px; background:#d32f2f; color:white; cursor:pointer; font-weight:bold;">✕</button>
                </div>
            `;
            bindFileButtons();
        }

        function bindFileButtons() {
            const changeBtn = uploadLabel.querySelector(".file-change-trigger-btn");
            const clearBtn = uploadLabel.querySelector(".file-clear-trigger-btn");
            if (changeBtn) changeBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fileInput.click(); };
            if (clearBtn) clearBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); resetToEmptyState(); };
        }

        function resetToEmptyState() {
            selectedFile = null;
            parsedData = null;
            if (fileInput) fileInput.value = "";
            uploadLabel.innerHTML = defaultLabelText;
            attachLabelClickHandler();
            if (uploadButton) uploadButton.disabled = false;
        }

        async function handleProcessUpload() {
            if (!selectedFile || !parsedData) {
                alert("Please select a valid file first.");
                return;
            }

            const originalText = uploadButton.textContent;
            uploadButton.disabled = true;
            uploadButton.textContent = "Processing...";

            try {
                const MAX_BATCH_SIZE = 400; // Safe threshold for Firestore limits
                let batch = writeBatch(db);
                let operationCount = 0;
                const uploadTimestamp = new Date();

                for (let index = 0; index < parsedData.cleanData.length; index++) {
                    const row = parsedData.cleanData[index];

                    if (operationCount >= MAX_BATCH_SIZE) {
                        await batch.commit();
                        batch = writeBatch(db);
                        operationCount = 0;
                    }

                    const docRef = doc(collection(db, collectionName));
                    const payload = {
                        ...row,
                        documentOrder: index,
                        uploadedAt: uploadTimestamp
                    };

                    batch.set(docRef, payload);
                    operationCount++;
                }

                if (operationCount > 0) {
                    await batch.commit();
                }

                // Write Audit History Entry
                const historyBatch = writeBatch(db);
                const historyRef = doc(collection(db, "pvo_import_history"));
                const totalVal = dataType === "cases"
                    ? parsedData.cleanData.reduce((s, r) => s + r.dogPopulation, 0)
                    : parsedData.cleanData.reduce((s, r) => s + r.totalPopulation, 0);

                historyBatch.set(historyRef, {
                    fileName: selectedFile.name,
                    totalCases: totalVal,
                    totalFacilities: parsedData.recordCount,
                    timestamp: uploadTimestamp,
                    status: "Completed",
                    importType: dataType
                });

                await historyBatch.commit();

                document.dispatchEvent(new CustomEvent("importHistoryUpdated"));
                alert(`✅ Import Complete!\nFile: ${selectedFile.name}\nRecords Processed: ${parsedData.recordCount}`);
                resetToEmptyState();

            } catch (error) {
                console.error("Upload Error:", error);
                alert(`❌ Upload Failed: ${error.message}`);
            } finally {
                uploadButton.disabled = false;
                uploadButton.textContent = originalText;
            }
        }
    }

    // ========================================================================
    // HISTORY RENDER & INITIALIZATION
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
            const q = query(collection(db, "pvo_import_history"), orderBy("timestamp", "desc"));
            const querySnapshot = await getDocs(q);
            historyTableBody.innerHTML = "";

            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const dateObj = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
                const dateString = dateObj.toLocaleString("en-US", {
                    month: "2-digit", day: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit", hour12: true
                });
                const recordText = data.importType === "population"
                    ? `${data.totalFacilities || 0} Municipalities (Population)`
                    : `${data.totalFacilities || 0} Municipalities`;

                addHistoryRow(dateString, data.fileName || "unknown_file", recordText, data.status || "Completed");
            });
        } catch (error) {
            console.error("Failed to load import history:", error);
        }
    }

    initImportSection({
        fileInputId: "caseDataFile",
        collectionName: "pvo_rabies_cases",
        dataType: "cases"
    });

    initImportSection({
        fileInputId: "populationDataFile",
        collectionName: "pvo_population_data",
        dataType: "population"
    });

    loadImportHistory();
    document.addEventListener("importHistoryUpdated", loadImportHistory);
});