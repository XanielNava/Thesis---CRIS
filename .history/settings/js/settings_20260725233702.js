import { db, collection, writeBatch, doc, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from "./settings-firebase.js";

document.addEventListener("DOMContentLoaded", () => {
    console.log("⚙️ CRIS Settings Module Initialized.");

    bindUploadHandler("uploadLegacyBtn", "legacyFileInput", "Legacy Cases", processLegacyData);
    bindUploadHandler("uploadPopulationBtn", "populationFileInput", "Population Data", processPopulationData);

    // Fetch history ONCE on page load (1 query = maximum 20 reads total)
    loadImportHistoryOnce();
});

/**
 * Single-fetch query (Replaces onSnapshot to minimize Firestore reads)
 */
async function loadImportHistoryOnce() {
    const historyTableBody = document.querySelector("#importHistoryTable tbody") || document.querySelector("table tbody");
    if (!historyTableBody) return;

    try {
        // Query only the last 20 imports to save read quota
        const q = query(
            collection(db, "pho_import_history"), 
            orderBy("timestamp", "desc"), 
            limit(20)
        );

        const snapshot = await getDocs(q);

        historyTableBody.innerHTML = "";

        if (snapshot.empty) {
            historyTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">No import history recorded.</td></tr>`;
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
    } catch (err) {
        console.error("Error fetching import history:", err);
    }
}