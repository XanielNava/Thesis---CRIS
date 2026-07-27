import { db, collection, getDocs, writeBatch, doc } from "./settings-firebase.js";

document.addEventListener("DOMContentLoaded", () => {
    initHeatmapPopulationImporter();
});

function initHeatmapPopulationImporter() {
    const uploadBtn = document.getElementById("heatmapPopUploadBtn");
    const fileInput = document.getElementById("heatmapPopFileInput");

    if (!uploadBtn || !fileInput) return;

    uploadBtn.addEventListener("click", async () => {
        const file = fileInput.files[0];
        if (!file) return alert("Please select a population spreadsheet.");

        try {
            const data = await readSpreadsheet(file);
            const batch = writeBatch(db);
            let provincialTotal = 0;

            data.forEach(row => {
                let muni = "";
                let pop = 0;

                Object.keys(row).forEach(col => {
                    const norm = col.toLowerCase().replace(/[^a-z0-9]/g, "");
                    if (norm.includes("muni") || norm.includes("city")) muni = String(row[col]).trim();
                    if (norm.includes("pop") || norm.includes("count")) pop = Number(row[col]) || 0;
                });

                if (muni) {
                    provincialTotal += pop;
                    const ref = doc(db, "pho_population_data", muni.toUpperCase().replace(/\s+/g, "_"));
                    batch.set(ref, { municipality: muni, totalPopulation: pop, updatedAt: new Date() }, { merge: true });
                }
            });

            // Sync total to sync dashboard
            const totalRef = doc(db, "pho_population_data", "ILOILO_TOTAL");
            batch.set(totalRef, { totalPopulation: provincialTotal, updatedAt: new Date() }, { merge: true });

            await batch.commit();
            alert("Heatmap & Dashboard population synced successfully!");
            location.reload();
        } catch (err) {
            alert("Import failed: " + err.message);
        }
    });
}

function readSpreadsheet(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const workbook = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
                const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                resolve(json);
            } catch (err) { reject(err); }
        };
        reader.readAsArrayBuffer(file);
    });
}