import { db, collection, writeBatch, doc, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "./settings-firebase.js";

document.addEventListener("DOMContentLoaded", () => {
    console.log("⚙️ CRIS Settings Module Initialized.");

    // Bind Event Listeners
    setupImporter("uploadLegacyBtn", "legacyFileInput", "Legacy Cases", processLegacyData);
    setupImporter("uploadPopulationBtn", "populationFileInput", "Population Data", processPopulationData);

    // Listen to real-time Import History
    listenToImportHistory();
});

/**
 * Universal Event Listener setup for File Importers
 */
function setupImporter(buttonId, inputId, importLabel, processFn) {
    const btn = document.getElementById(buttonId);
    const input = document.getElementById(inputId);

    if (!btn || !input) {
        console.error(`❌ Could not attach listener. Target elements not found: #${buttonId}, #${inputId}`);
        return;
    }

    btn.addEventListener("click", async (e) => {
        e.preventDefault();

        const file = input.files[0];
        if (!file) {
            alert(`Please select a ${importLabel} file (.csv or .xlsx) first.`);
            return;
        }

        try {
            console.log(`📄 Reading ${importLabel} file: ${file.name}`);
            const rawRows = await readSpreadsheetData(file);

            if (!rawRows || rawRows.length === 0) {
                alert("The selected file contains no rows or readable data.");
                return;
            }

            const processedCount = await processFn(rawRows);

            await logImportHistory({
                fileName: file.name,
                importType: importLabel,
                recordsCount: processedCount,
                status: "Success"
            });

            alert(`Successfully processed ${importLabel}! (${processedCount} records updated)`);
            input.value = ""; // Reset file input
        } catch (err) {
            console.error(`💥 Error processing ${importLabel}:`, err);

            await logImportHistory({
                fileName: file ? file.name : "Unknown",
                importType: importLabel,
                recordsCount: 0,
                status: "Failed"
            });

            alert(`Failed to import ${importLabel}: ${err.message}`);
        }
    });
}

/**
 * Process Legacy Animal Bite Data
 */
async function processLegacyData(rows) {
    const batch = writeBatch(db);
    const dashboardStore = { labels: [], animalBites: [], abtcCases: [], rabiesDeaths: [] };

    rows.forEach((row, idx) => {
        let year = 0, bites = 0, abtc = 0, deaths = 0;

        Object.keys(row).forEach((col) => {
            const norm = String(col).toLowerCase().replace(/[^a-z0-9]/g, "");
            const val = Number(row[col]) || 0;

            if (norm.includes("year") || norm.includes("yr")) year = val;
            else if (norm.includes("bite") || norm.includes("animalbite")) bites = val;
            else if (norm.includes("abtc")) abtc = val;
            else if (norm.includes("death") || norm.includes("humanrabies") || norm.includes("fatal")) deaths = val;
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

    localStorage.setItem("cris_dashboard_data", JSON.stringify(dashboardStore));
    window.dispatchEvent(new Event("storage"));

    return rows.length;
}

/**
 * Process Iloilo Population Dataset
 */
async function processPopulationData(rows) {
    const batch = writeBatch(db);
    let totalProvincialPop = 0;
    let validRows = 0;

    rows.forEach((row) => {
        let municipality = "";
        let population = 0;

        Object.keys(row).forEach((col) => {
            const norm = String(col).toLowerCase().replace(/[^a-z0-9]/g, "");
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

    const totalRef = doc(db, "pho_population_data", "ILOILO_TOTAL");
    batch.set(totalRef, { totalPopulation: totalProvincialPop, updatedAt: new Date() }, { merge: true });

    await batch.commit();
    return validRows;
}

/**
 * Write log entry to Firestore
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
 * Real-time listener for the Import History table
 */
function listenToImportHistory() {
    const historyTableBody = document.querySelector("#importHistoryTable tbody") || document.querySelector("table tbody");
    if (!historyTableBody) return;

    const q = query(collection(db, "pho_import_history"), orderBy("timestamp", "desc"));

    onSnapshot(q, (snapshot) => {
        historyTableBody.innerHTML = "";

        if (snapshot.empty) {
            historyTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">No import history found.</td></tr>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const tr = document.createElement("tr");
            const isSuccess = data.status === "Success";
            const badgeStyle = isSuccess 
                ? "background:#d4edda; color:#155724; padding:4px 8px; border-radius:4px; font-weight:bold;" 
                : "background:#f8d7da; color:#721c24; padding:4px 8px; border-radius:4px; font-weight:bold;";

            tr.innerHTML = `
                <td><strong>${data.fileName || "File"}</strong></td>
                <td>${data.importType || "Data Upload"}</td>
                <td>${data.recordsCount || 0} rows</td>
                <td><span style="${badgeStyle}">${data.status}</span></td>
                <td>${data.formattedDate || new Date().toLocaleDateString()}</td>
            `;
            historyTableBody.appendChild(tr);
        });
    });
}

/**
 * SheetJS Excel/CSV Reader
 */
function readSpreadsheetData(file) {
    return new Promise((resolve, reject) => {
        if (typeof XLSX === "undefined") {
            return reject(new Error("SheetJS (XLSX) library is missing in settings.html. Include: <script src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'></script>"));
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: "array" });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
                resolve(json);
            } catch (err) {
                reject(new Error("Invalid file format. Please upload a valid CSV or XLSX file."));
            }
        };
        reader.onerror = () => reject(new Error("Failed to read file from local machine."));
        reader.readAsArrayBuffer(file);
    });
}