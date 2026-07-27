import { 
  db, 
  collection, 
  writeBatch, 
  doc, 
  getDocs, 
  query, 
  orderBy, 
  limit 
} from "../js/settings-firebase.js";

document.addEventListener("DOMContentLoaded", () => {
    // Population Form Elements
    const populationForm = document.getElementById("importPopulationForm");
    const populationInput = document.getElementById("populationFileInput");
    const populationBtn = document.getElementById("importPopulationBtn");

    // Legacy / Annual Summary Form Elements
    const legacyForm = document.getElementById("importLegacyForm");
    const legacyInput = document.getElementById("legacyFileInput");
    const legacyBtn = document.getElementById("importLegacyBtn");

    const historyTableBody = document.querySelector("#uploadHistoryTable tbody");

    // Load initial 15 history logs on page load
    loadImportHistory();

    // -------------------------------------------------------------
    // 1. POPULATION IMPORT EVENT LISTENER
    // -------------------------------------------------------------
    if (populationForm) {
        populationForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const selectedFile = populationInput ? populationInput.files[0] : null;
            if (!selectedFile) {
                alert("Please select an Excel file for population data first.");
                return;
            }

            if (populationBtn) {
                populationBtn.disabled = true;
                populationBtn.innerText = "Processing...";
            }

            try {
                await handleProcessPopulationUpload(selectedFile);
                alert("Population data successfully imported!");
                if (populationInput) populationInput.value = "";
            } catch (error) {
                console.error("Error during population import:", error);
                alert("An error occurred during population import: " + error.message);
            } finally {
                if (populationBtn) {
                    populationBtn.disabled = false;
                    populationBtn.innerText = "Import Population";
                }
            }
        });
    }

    // -------------------------------------------------------------
    // 2. LEGACY / ANNUAL SUMMARY IMPORT EVENT LISTENER
    // -------------------------------------------------------------
    if (legacyForm) {
        legacyForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const selectedFile = legacyInput ? legacyInput.files[0] : null;
            if (!selectedFile) {
                alert("Please select an Excel file for legacy dataset first.");
                return;
            }

            if (legacyBtn) {
                legacyBtn.disabled = true;
                legacyBtn.innerText = "Processing...";
            }

            try {
                await handleProcessLegacyUpload(selectedFile);
                alert("Legacy dataset successfully imported!");
                if (legacyInput) legacyInput.value = "";
            } catch (error) {
                console.error("Error during legacy import:", error);
                alert("An error occurred during legacy import: " + error.message);
            } finally {
                if (legacyBtn) {
                    legacyBtn.disabled = false;
                    legacyBtn.innerText = "Import Legacy Data";
                }
            }
        });
    }

    // -------------------------------------------------------------
    // POPULATION FILE PROCESSOR
    // -------------------------------------------------------------
    async function handleProcessPopulationUpload(selectedFile) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: "array" });
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    const cleanData = [];

                    for (let i = 3; i < rawRows.length; i++) {
                        const row = rawRows[i];
                        if (!row || !row[0]) continue;

                        let val0 = String(row[0]).trim();
                        if (!val0) continue;

                        // Clean asterisk off "ILOILO *" so it stores as "ILOILO"
                        if (val0.toUpperCase().includes("ILOILO")) {
                            val0 = "ILOILO";
                        }

                        const lowerName = val0.toLowerCase();

                        // 1. Skip non-data labels & footer notes
                        if (
                            lowerName === "total" || 
                            lowerName === "grand total" || 
                            lowerName.startsWith("notes") || 
                            lowerName.startsWith("*") || 
                            lowerName.startsWith("source") || 
                            lowerName.startsWith("philippine statistics")
                        ) continue;

                        // 2. Skip barangay rows if present
                        const barangayIndicators = ["barangay", "brgy", "bgy", "poblacion"];
                        if (barangayIndicators.some(keyword => lowerName.includes(keyword))) continue;

                        // Parse Total Population from Column 3 (Index 2)
                        const totalPopulation = parseNumber(row[2]);
                        if (totalPopulation === 0) continue;

                        cleanData.push({
                            facilityName: val0,
                            totalPopulation
                        });
                    }

                    if (cleanData.length === 0) {
                        throw new Error("No valid municipality population data found in the file.");
                    }

                    const batch = writeBatch(db);

                    cleanData.forEach(item => {
                        const docRef = doc(db, "pho_population_data", item.facilityName);
                        batch.set(docRef, {
                            facilityName: item.facilityName,
                            totalPopulation: item.totalPopulation,
                            lastUpdated: new Date()
                        }, { merge: true });
                    });

                    const historyRef = doc(collection(db, "pho_import_history"));
                    const historyRecord = {
                        timestamp: new Date(),
                        fileName: selectedFile.name,
                        importType: "population",
                        totalFacilities: cleanData.length,
                        status: "Completed"
                    };

                    batch.set(historyRef, historyRecord);
                    await batch.commit();

                    // Prepend to UI locally
                    const dateString = formatDateTime(historyRecord.timestamp);
                    addHistoryRow(dateString, selectedFile.name, `${cleanData.length} Records (Incl. ILOILO Total)`, "Completed");

                    resolve();
                } catch (err) {
                    reject(err);
                }
            };

            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(selectedFile);
        });
    }

    // -------------------------------------------------------------
    // LEGACY / ANNUAL SUMMARY FILE PROCESSOR
    // -------------------------------------------------------------
    async function handleProcessLegacyUpload(selectedFile) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: "array" });
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    const cleanData = [];

                    for (let i = 1; i < rawRows.length; i++) {
                        const row = rawRows[i];
                        if (!row || !row[0]) continue;

                        const facilityName = String(row[0]).trim();
                        if (!facilityName) continue;

                        const lowerName = facilityName.toLowerCase();
                        if (lowerName === "total" || lowerName === "grand total") continue;

                        cleanData.push({
                            facilityName,
                            rawData: row,
                            lastUpdated: new Date()
                        });
                    }

                    if (cleanData.length === 0) {
                        throw new Error("No valid legacy data rows found in the file.");
                    }

                    const batch = writeBatch(db);

                    cleanData.forEach(item => {
                        const docRef = doc(db, "pho_legacy_annual_summary", item.facilityName);
                        batch.set(docRef, item, { merge: true });
                    });

                    const historyRef = doc(collection(db, "pho_import_history"));
                    const historyRecord = {
                        timestamp: new Date(),
                        fileName: selectedFile.name,
                        importType: "legacy",
                        totalFacilities: cleanData.length,
                        status: "Completed"
                    };

                    batch.set(historyRef, historyRecord);
                    await batch.commit();

                    // Prepend to UI locally
                    const dateString = formatDateTime(historyRecord.timestamp);
                    addHistoryRow(dateString, selectedFile.name, `${cleanData.length} Municipalities (All Columns)`, "Completed");

                    resolve();
                } catch (err) {
                    reject(err);
                }
            };

            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(selectedFile);
        });
    }

    // -------------------------------------------------------------
    // HELPER FUNCTIONS
    // -------------------------------------------------------------
    function parseNumber(val) {
        if (typeof val === "number") return val;
        if (!val) return 0;
        const cleaned = String(val).replace(/,/g, "").trim();
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
    }

    function formatDateTime(timestamp) {
        let dateObj;
        if (timestamp && typeof timestamp.toDate === "function") {
            dateObj = timestamp.toDate();
        } else if (timestamp instanceof Date) {
            dateObj = timestamp;
        } else if (timestamp && timestamp.seconds) {
            dateObj = new Date(timestamp.seconds * 1000);
        } else {
            dateObj = new Date();
        }

        return dateObj.toLocaleString("en-US", {
            month: "2-digit",
            day: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        });
    }

    async function loadImportHistory() {
        if (!historyTableBody) return;
        try {
            const q = query(
                collection(db, "pho_import_history"), 
                orderBy("timestamp", "desc"),
                limit(15)
            );
            const querySnapshot = await getDocs(q);

            historyTableBody.innerHTML = "";

            querySnapshot.forEach((docSnapshot) => {
                const data = docSnapshot.data();
                const dateString = formatDateTime(data.timestamp);

                const recordText = data.importType === "population"
                    ? `${data.totalFacilities || 0} Municipalities (Population)`
                    : `${data.totalFacilities || 0} Municipalities (All Columns)`;

                addHistoryRow(dateString, data.fileName || "unknown_file", recordText, data.status || "Completed");
            });
        } catch (error) {
            console.error("Failed to fetch import history:", error);
        }
    }

    function addHistoryRow(dateTime, fileName, recordType, status) {
        if (!historyTableBody) return;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${dateTime}</td>
            <td>${fileName}</td>
            <td>${recordType}</td>
            <td><span class="badge bg-success">${status}</span></td>
        `;
        historyTableBody.prepend(row);
    }
});