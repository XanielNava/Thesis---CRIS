import { db, collection, writeBatch, doc, setDoc } from "./settings-firebase.js";

document.addEventListener("DOMContentLoaded", () => {
    setupPopulationImporter();
    setupLegacyImporter();
});

// Helper: Normalized fuzzy matching (Preserved)
function normalizeKey(key) {
    return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * 1. IMPORT POPULATION HANDLER
 */
function setupPopulationImporter() {
    const fileInput = document.getElementById("populationFileInput");
    const uploadBtn = document.getElementById("uploadPopulationBtn");

    if (!uploadBtn || !fileInput) return;

    uploadBtn.addEventListener("click", async () => {
        const file = fileInput.files[0];
        if (!file) return alert("Please select a valid CSV or Excel file.");

        try {
            const data = await readSpreadsheetData(file);
            if (!data || !data.length) return alert("Spreadsheet contains no readable rows.");

            const batch = writeBatch(db);
            let totalProvincialPop = 0;

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

            // Sync aggregate population directly for the Dashboard card
            const totalRef = doc(db, "pho_population_data", "ILOILO_TOTAL");
            batch.set(totalRef, {
                totalPopulation: totalProvincialPop,
                updatedAt: new Date()
            }, { merge: true });

            await batch.commit();
            alert(`Successfully imported population data! Total Provincial Population: ${totalProvincialPop.toLocaleString()}`);
            fileInput.value = "";
        } catch (err) {
            console.error("Population Import Error:", err);
            alert("Error parsing population file: " + err.message);
        }
    });
}

/**
 * 2. IMPORT LEGACY HANDLER
 */
function setupLegacyImporter() {
    const fileInput = document.getElementById("legacyFileInput");
    const uploadBtn = document.getElementById("uploadLegacyBtn");

    if (!uploadBtn || !fileInput) return;

    uploadBtn.addEventListener("click", async () => {
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

                // Target pho_rabies_cases collection directly
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

            // Broadcast data locally for instant UI updates
            localStorage.setItem("cris_dashboard_data", JSON.stringify(dashboardStore));
            window.dispatchEvent(new Event("storage"));

            alert("Legacy data imported and Dashboard metrics updated successfully!");
            fileInput.value = "";
        } catch (err) {
            console.error("Legacy Import Error:", err);
            alert("Failed to process legacy data file: " + err.message);
        }
    });
}

/**
 * FIXED FILE PARSER FUNCTION
 * Safely handles CSV and XLSX without crashing if XLSX library is loading asynchronously.
 */
function readSpreadsheetData(file) {
    return new Promise((resolve, reject) => {
        if (typeof XLSX === "undefined") {
            return reject(new Error("SheetJS (XLSX) library is missing. Make sure <script src='...xlsx.full.min.js'></script> is loaded in settings.html."));
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
                reject(new Error("Unable to parse file. Please verify it is a valid .csv, .xlsx, or .xls document."));
            }
        };
        reader.onerror = () => reject(new Error("File reading error."));
        reader.readAsArrayBuffer(file);
    });
}