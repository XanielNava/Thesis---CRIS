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
    const uploadForm = document.getElementById("importPopulationForm");
    const fileInput = document.getElementById("populationFileInput");
    const submitBtn = document.getElementById("importPopulationBtn");
    const historyTableBody = document.querySelector("#uploadHistoryTable tbody");

    // Load initial 15 history logs on page load
    loadImportHistory();

    if (uploadForm) {
        uploadForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const selectedFile = fileInput ? fileInput.files[0] : null;
            if (!selectedFile) {
                alert("Please select an Excel file first.");
                return;
            }

            // Disable button during process
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = "Processing...";
            }

            try {
                await handleProcessUpload(selectedFile);
                alert("Data successfully imported!");
                if (fileInput) fileInput.value = ""; // Reset input file
            } catch (error) {
                console.error("Error during import process:", error);
                alert("An error occurred during import: " + error.message);
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = "Import Population";
                }
            }
        });
    }

    /**
     * Process the uploaded Excel file using SheetJS (XLSX)
     */
    async function handleProcessUpload(selectedFile) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: "array" });

                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];

                    // Convert sheet to 2D array matrix
                    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    const cleanData = [];

                    // Skip headers and parse spreadsheet rows
                    for (let i = 3; i < rawRows.length; i++) {
                        const row = rawRows[i];
                        if (!row || !row[0]) continue;

                        const val0 = String(row[0]);
                        const facilityName = val0.trim();
                        if (!facilityName) continue;

                        const lowerName = facilityName.toLowerCase();
                        if (lowerName === "total" || lowerName === "grand total") continue;

                        // Filter out barangay rows
                        const barangayIndicators = ["barangay", "brgy", "bgy", "poblacion"];
                        if (barangayIndicators.some(keyword => lowerName.includes(keyword))) continue;

                        // Check indentations (spaces)
                        const leadingSpaces = val0.length - val0.trimStart().length;
                        if (leadingSpaces > 2) continue;

                        // Extract column values
                        const totalPopulation = parseNumber(row[2]);
                        const householdPopulation = parseNumber(row[3]);
                        const numberOfHouseholds = parseNumber(row[4]);

                        cleanData.push({
                            facilityName,
                            totalPopulation,
                            householdPopulation,
                            numberOfHouseholds
                        });
                    }

                    if (cleanData.length === 0) {
                        throw new Error("No valid municipality population data found in the spreadsheet.");
                    }

                    // Save batch to Firestore
                    const batch = writeBatch(db);

                    cleanData.forEach(item => {
                        const docRef = doc(db, "pho_population_data", item.facilityName);
                        batch.set(docRef, {
                            facilityName: item.facilityName,
                            totalPopulation: item.totalPopulation,
                            householdPopulation: item.householdPopulation,
                            numberOfHouseholds: item.numberOfHouseholds,
                            lastUpdated: new Date()
                        }, { merge: true });
                    });

                    // Log history entry
                    const historyRef = doc(collection(db, "pho_import_history"));
                    const historyRecord = {
                        timestamp: new Date(),
                        fileName: selectedFile.name,
                        importType: "population",
                        totalFacilities: cleanData.length,
                        status: "Completed"
                    };

                    batch.set(historyRef, historyRecord);

                    // Commit writes
                    await batch.commit();

                    // Prepend new row directly into UI without making extra read calls
                    const dateString = historyRecord.timestamp.toLocaleString("en-US", {
                        month: "2-digit",
                        day: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true
                    });
                    const recordText = `${cleanData.length} Municipalities (Population)`;

                    addHistoryRow(dateString, selectedFile.name, recordText, "Completed");

                    resolve();
                } catch (err) {
                    reject(err);
                }
            };

            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(selectedFile);
        });
    }

    /**
     * Parse cell numeric values safely
     */
    function parseNumber(val) {
        if (typeof val === "number") return val;
        if (!val) return 0;
        const cleaned = String(val).replace(/,/g, "").trim();
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
    }

    /**
     * Load top 15 recent import history records from Firestore
     */
    async function loadImportHistory() {
        if (!historyTableBody) return;
        try {
            // Limited to 15 recent records to prevent unnecessary reads
            const q = query(
                collection(db, "pho_import_history"), 
                orderBy("timestamp", "desc"),
                limit(15)
            );
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

    /**
     * Insert a row into the history table UI
     */
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