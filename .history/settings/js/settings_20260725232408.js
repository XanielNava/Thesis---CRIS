import { db, collection, writeBatch, doc, setDoc, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "./settings-firebase.js";

document.addEventListener("DOMContentLoaded", () => {
    setupPopulationImporter();
    setupLegacyImporter();
    listenToImportHistory(); // Real-time listener for Import History table
});

// Helper for column matching
function normalizeKey(key) {
    return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * 1. IMPORT POPULATION HANDLER
 */
function setupPopulationImporter() {
    // Try primary ID or fallback to standard class/attribute if ID differs
    const fileInput = document.getElementById("populationFileInput") || document.querySelector("input[type='file']");
    const uploadBtn = document.getElementById("uploadPopulationBtn") || document.querySelector("#populationUploadBtn");

    if (!uploadBtn || !fileInput) {
        console.warn("Population import elements not found in DOM.");
        return;
    }

    uploadBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const file = fileInput.files[0];
        if (!file) return alert("Please select a valid CSV or Excel file first.");

        try {
            const data = await readSpreadsheetData(file);
            if (!data || !data.length) return alert("Spreadsheet contains no readable rows.");

            const batch = writeBatch(db);
            let totalProvincialPop = 0;
            let validRows = 0;

            data.forEach((row) => {
                let municipality = "";
                let population = 0;

                Object.keys(row).forEach((col) => {
                    const norm = normalizeKey(col);
                    if (norm.includes("muni") || norm.includes("city") || norm.includes("location")) {
                        municipality = String(row[col]).trim();
                    }
                    if (norm.includes("pop") || norm.includes("human") || norm.includes("count")) {
                        population = Number(row[col]) || 0;
                    }
                });

                if (municipality) {
                    validRows++;
                    totalProvincialPop += population;
                    const docId = municipality.toUpperCase().replace(/\s+/g, "_");
                    const ref = doc(db, "pho_population_data", docId);
                    batch.set(ref, {
                        municipality: municipality,
                        totalPopulation: population,
                        updatedAt: new Date()
                    }, { merge: true });
                }
            });

            // Update ILOILO_TOTAL aggregate document
            const totalRef = doc(db, "pho_population_data", "ILOILO_TOTAL");
            batch.set(totalRef, {
                totalPopulation: totalProvincialPop,
                updatedAt: new Date()
            }, { merge: true });

            await batch.commit();

            // Log entry into Import History
            await logImportHistory({
                fileName: file.name,
                importType: "Population Data",
                recordsCount: validRows,
                status: "Success"
            });

            alert(`Successfully imported population data! Total Population: ${totalProvincialPop.toLocaleString()}`);
            fileInput.value = "";
        } catch (err) {
            console.error("Population Import Error:", err);
            await logImportHistory({
                fileName: file ? file.name : "Unknown",
                importType: "Population Data",
                recordsCount: 0,
                status: "Failed"
            });
            alert("Error uploading population file: " + err.message);
        }
    });
}

/**
 * 2. IMPORT LEGACY HANDLER
 */
function setupLegacyImporter() {
    const fileInput = document.getElementById("legacyFileInput") || document.querySelectorAll("input[type='file']")[1];
    const uploadBtn = document.getElementById("uploadLegacyBtn") || document.querySelector("#legacyUploadBtn");

    if (!uploadBtn || !fileInput) {
        console.warn("Legacy import elements not found in DOM.");
        return;
    }

    uploadBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const file = fileInput.files[0];
        if (!file) return alert("Please select a legacy file (.csv, .xlsx, .xls).");

        try {
            const rawRows = await readSpreadsheetData(file);
            if (!rawRows || !rawRows.length) return alert("File is empty or formatted incorrectly.");

            const batch = writeBatch(db);
            const dashboardStore = { labels: [], animalBites: [], abtcCases: [], rabiesDeaths: [] };

            rawRows.forEach((row, idx) => {
                let year = 0;
                let bites = 0;
                let abtc = 0;
                let deaths = 0;

                Object.keys(row).forEach((col) => {
                    const norm = normalizeKey(col);
                    const val = Number(row[col]) || 0;

                    if (norm.includes("year") || norm.includes("yr")) {
                        year = val;
                    } else if (norm.includes("bite") || norm.includes("animalbite")) {
                        bites = val;
                    } else if (norm.includes("abtc")) {
                        abtc = val;
                    } else if (norm.includes("death") || norm.includes("humanrabies") || norm.includes("fatal")) {
                        deaths = val;
                    }
                });

                const targetYear = year || (2020 + idx);
                dashboardStore.labels.push(targetYear);
                dashboardStore.animalBites.push(bites);
                dashboardStore.abtcCases.push(abtc);
                dashboardStore.rabiesDeaths.push(deaths);

                const docRef = doc(db, "pho_rabies_cases", `YEAR_${targetYear}`);
                batch.set(docRef, {
                    year: targetYear,
                    totalCases: bites,
                    biteCases: bites,
                    abtcCount: abtc,
                    humanDeaths: deaths,
                    updatedAt: new Date()
                }, { merge: true });
            });

            await batch.commit();

            // Store locally for real-time dashboard responsiveness
            localStorage.setItem("cris_dashboard_data", JSON.stringify(dashboardStore));
            window.dispatchEvent(new Event("storage"));

            // Log entry into Import History
            await logImportHistory({
                fileName: file.name,
                importType: "Legacy Cases",
                recordsCount: rawRows.length,
                status: "Success"
            });

            alert("Legacy data imported and Dashboard metrics updated successfully!");
            fileInput.value = "";
        } catch (err) {
            console.error("Legacy Import Error:", err);
            await logImportHistory({
                fileName: file ? file.name : "Unknown",
                importType: "Legacy Cases",
                recordsCount: 0,
                status: "Failed"
            });
            alert("Failed to process legacy data file: " + err.message);
        }
    });
}

/**
 * 3. RECORD IMPORT HISTORY TO FIRESTORE
 */
async function logImportHistory({ fileName, importType, recordsCount, status }) {
    try {
        await addDoc(collection(db, "pho_import_history"), {
            fileName: fileName,
            importType: importType,
            recordsCount: recordsCount,
            status: status,
            timestamp: serverTimestamp(),
            formattedDate: new Date().toLocaleString()
        });
    } catch (e) {
        console.error("Failed to log import history:", e);
    }
}

/**
 * 4. REAL-TIME IMPORT HISTORY UI RENDERER
 * Listens to "pho_import_history" and updates your settings table automatically.
 */
function listenToImportHistory() {
    const historyTableBody = document.querySelector("#importHistoryTable tbody") || document.querySelector("table tbody");
    if (!historyTableBody) return;

    const q = query(collection(db, "pho_import_history"), orderBy("timestamp", "desc"));
    
    onSnapshot(q, (snapshot) => {
        historyTableBody.innerHTML = ""; // Clear existing rows

        if (snapshot.empty) {
            historyTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">No import history found.</td></tr>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const tr = document.createElement("tr");

            const badgeClass = data.status === "Success" ? "background:#d4edda; color:#155724;" : "background:#f8d7da; color:#721c24;";

            tr.innerHTML = `
                <td><strong>${data.fileName || "File"}</strong></td>
                <td>${data.importType || "Data Upload"}</td>
                <td>${data.recordsCount || 0} rows</td>
                <td><span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; ${badgeClass}">${data.status}</span></td>
                <td>${data.formattedDate || new Date().toLocaleDateString()}</td>
            `;
            historyTableBody.appendChild(tr);
        });
    });
}

/**
 * FILE READER UTILITY (USES XLSX SHEETJS)
 */
function readSpreadsheetData(file) {
    return new Promise((resolve, reject) => {
        if (typeof XLSX === "undefined") {
            return reject(new Error("SheetJS (XLSX) library is missing. Ensure <script src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'></script> is present in settings.html."));
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: "array" });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                resolve(json);
            } catch (err) {
                reject(new Error("File format unreadable. Please upload a valid .csv, .xlsx, or .xls file."));
            }
        };
        reader.onerror = () => reject(new Error("Error reading file from disk."));
        reader.readAsArrayBuffer(file);
    });
}