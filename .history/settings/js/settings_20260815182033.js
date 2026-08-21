// ==============================================================================
// settings.js - Master PHO Settings Controller (Unified Collection Architecture)
// ==============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    connectFirestoreEmulator, 
    collection, 
    writeBatch, 
    doc, 
    getDoc,
    setDoc,
    getDocs, 
    query, 
    orderBy, 
    limit 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged,
    updatePassword,
    signOut,
    connectAuthEmulator 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBfqjfJoGz591aI8TJjhIS3T4OEvQxX11Y",
    authDomain: "cris-database-da989.firebaseapp.com",
    databaseURL: "https://cris-database-da989-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "cris-database-da989",
    storageBucket: "cris-database-da989.firebasestorage.app",
    messagingSenderId: "627885439681",
    appId: "1:627885439681:web:3c657d64c0aad9b4913240",
    measurementId: "G-0X99BH7GW4"
};

// Initialize Services
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 🧪 CONNECT TO LOCAL EMULATOR
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');

let currentUserId = null;
let processedLogoBase64 = null;

document.addEventListener("DOMContentLoaded", () => {
    
    // Auth Watcher
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserId = user.uid;
            await loadFacilityData();
            await loadUserData(user);
            await loadImportHistory();
        }
    });

    // Dynamic File Display Feedback
    const popInput = document.getElementById("populationFileInput");
    const popText = document.getElementById("popFileText");
    if (popInput && popText) {
        popInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                popText.innerHTML = `📄 Selected: <strong>${e.target.files[0].name}</strong>`;
            } else {
                popText.innerHTML = "📤 Click to upload (CSV, XLSX)";
            }
        });
    }

    const legacyInput = document.getElementById("legacyFileInput");
    const legacyText = document.getElementById("legacyFileText");
    if (legacyInput && legacyText) {
        legacyInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                legacyText.innerHTML = `📄 Selected: <strong>${e.target.files[0].name}</strong>`;
            } else {
                legacyText.innerHTML = "📤 Click to upload (CSV, XLSX)";
            }
        });
    }

    const phoLogoInput = document.getElementById("phoLogo");
    const logoFileText = document.getElementById("logoFileText");
    if (phoLogoInput) {
        phoLogoInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) {
                if (logoFileText) logoFileText.innerHTML = "📤 Click to upload logo (PNG or JPG, max 2MB)";
                return;
            }
            if (file.size > 2 * 1024 * 1024) {
                alert("File size limit exceeded: Please choose a logo under 2MB.");
                phoLogoInput.value = "";
                if (logoFileText) logoFileText.innerHTML = "📤 Click to upload logo (PNG or JPG, max 2MB)";
                return;
            }
            if (logoFileText) logoFileText.innerHTML = `🖼️ Selected: <strong>${file.name}</strong>`;
            const reader = new FileReader();
            reader.onload = (event) => { processedLogoBase64 = event.target.result; };
            reader.readAsDataURL(file);
        });
    }

    // -------------------------------------------------------------
    // 1. SAVE FACILITY INFORMATION
    // -------------------------------------------------------------
    const saveFacilityBtn = document.getElementById("saveFacilityBtn");
    if (saveFacilityBtn) {
        saveFacilityBtn.addEventListener("click", async () => {
            saveFacilityBtn.disabled = true;
            saveFacilityBtn.innerText = "Saving...";

            try {
                const facilityPayload = {
                    phoName: document.getElementById("phoName").value.trim(),
                    phoCode: document.getElementById("phoCode").value.trim(),
                    province: document.getElementById("province").value.trim(),
                    municipality: document.getElementById("municipality").value.trim(),
                    address: document.getElementById("address").value.trim(),
                    contactNumber: document.getElementById("contactNumber").value.trim(),
                    phoEmail: document.getElementById("phoEmail").value.trim(),
                    lastUpdated: new Date().toISOString()
                };

                if (processedLogoBase64) {
                    facilityPayload.logoData = processedLogoBase64;
                }

                // Stored in: pho-database/main/facility-info/config
                await setDoc(doc(db, "pho-database", "main", "facility-info", "config"), facilityPayload, { merge: true });
                alert("Facility information updated successfully!");
                await logSystemActivity("Facility Updated", "Updated PHO contact & workspace details");
            } catch (error) {
                console.error("Error saving facility info:", error);
                alert("Failed to save facility info: " + error.message);
            } finally {
                saveFacilityBtn.disabled = false;
                saveFacilityBtn.innerText = "Save Changes";
            }
        });
    }

    // -------------------------------------------------------------
    // 2. UPDATE USER ACCOUNT
    // -------------------------------------------------------------
    const updateAccountBtn = document.getElementById("updateAccountBtn");
    if (updateAccountBtn) {
        updateAccountBtn.addEventListener("click", async () => {
            const newPassword = document.getElementById("changePassword").value;
            const confirmPassword = document.getElementById("confirmPassword").value;

            if (newPassword || confirmPassword) {
                if (newPassword !== confirmPassword) {
                    alert("Passwords do not match. Please verify and try again.");
                    return;
                }
                if (newPassword.length < 6) {
                    alert("Password must be at least 6 characters long.");
                    return;
                }
            }

            updateAccountBtn.disabled = true;
            updateAccountBtn.innerText = "Updating...";

            try {
                if (newPassword && auth.currentUser) {
                    await updatePassword(auth.currentUser, newPassword);
                }

                if (currentUserId) {
                    const profilePayload = {
                        firstName: document.getElementById("firstName").value.trim(),
                        middleName: document.getElementById("middleName").value.trim(),
                        lastName: document.getElementById("lastName").value.trim(),
                        suffix: document.getElementById("suffix").value.trim(),
                        email: document.getElementById("userEmail").value.trim(),
                        position: document.getElementById("position").value.trim(),
                        lastUpdated: new Date().toISOString()
                    };

                    await setDoc(doc(db, "users", currentUserId), profilePayload, { merge: true });
                }

                alert("User account updated successfully!");
                document.getElementById("changePassword").value = "";
                document.getElementById("confirmPassword").value = "";
                await logSystemActivity("User Updated", "Updated account profile details");
            } catch (error) {
                console.error("Error updating account:", error);
                alert("Account update failed: " + error.message);
            } finally {
                updateAccountBtn.disabled = false;
                updateAccountBtn.innerText = "Update Account";
            }
        });
    }

    // -------------------------------------------------------------
    // 3. POPULATION & LEGACY DATA IMPORTERS
    // -------------------------------------------------------------
    const populationForm = document.getElementById("importPopulationForm");
    const legacyForm = document.getElementById("importLegacyForm");

    if (populationForm) {
        populationForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const input = document.getElementById("populationFileInput");
            const btn = document.getElementById("importPopulationBtn");
            const file = input ? input.files[0] : null;

            if (!file) return alert("Please select an Excel file for population data first.");

            btn.disabled = true;
            btn.innerText = "Processing...";

            try {
                await processPopulationFile(file);
                alert("Population dataset successfully imported!");
                input.value = "";
                if (popText) popText.innerHTML = "📤 Click to upload (CSV, XLSX)";
            } catch (err) {
                console.error("Population import error:", err);
                alert("Import error: " + err.message);
            } finally {
                btn.disabled = false;
                btn.innerText = "Import Population";
            }
        });
    }

    if (legacyForm) {
        legacyForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const input = document.getElementById("legacyFileInput");
            const btn = document.getElementById("importLegacyBtn");
            const file = input ? input.files[0] : null;

            if (!file) return alert("Please select an Excel file for legacy dataset first.");

            btn.disabled = true;
            btn.innerText = "Processing...";

            try {
                await processLegacyFile(file);
                alert("Legacy dataset successfully imported!");
                input.value = "";
                if (legacyText) legacyText.innerHTML = "📤 Click to upload (CSV, XLSX)";
            } catch (err) {
                console.error("Legacy import error:", err);
                alert("Import error: " + err.message);
            } finally {
                btn.disabled = false;
                btn.innerText = "Import Legacy Data";
            }
        });
    }

    // Logout
    document.getElementById("logout-btn")?.addEventListener("click", async () => {
        if (confirm("Are you sure you want to log out?")) {
            await signOut(auth);
            window.location.href = "../../src/pho/pho-login.html";
        }
    });
});

// Helper: Fetch Facility Config
async function loadFacilityData() {
    try {
        const snap = await getDoc(doc(db, "pho-database", "main", "facility-info", "config"));
        if (snap.exists()) {
            const data = snap.data();
            if (document.getElementById("phoName")) document.getElementById("phoName").value = data.phoName || "";
            if (document.getElementById("phoCode")) document.getElementById("phoCode").value = data.phoCode || "";
            if (document.getElementById("province")) document.getElementById("province").value = data.province || "";
            if (document.getElementById("municipality")) document.getElementById("municipality").value = data.municipality || "";
            if (document.getElementById("address")) document.getElementById("address").value = data.address || "";
            if (document.getElementById("contactNumber")) document.getElementById("contactNumber").value = data.contactNumber || "";
            if (document.getElementById("phoEmail")) document.getElementById("phoEmail").value = data.phoEmail || "";
        }
    } catch (err) {
        console.error("Failed loading facility data:", err);
    }
}

// Helper: Fetch User Profile
async function loadUserData(user) {
    try {
        if (document.getElementById("userEmail")) document.getElementById("userEmail").value = user.email || "";
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
            const data = snap.data();
            if (document.getElementById("firstName")) document.getElementById("firstName").value = data.firstName || "";
            if (document.getElementById("middleName")) document.getElementById("middleName").value = data.middleName || "";
            if (document.getElementById("lastName")) document.getElementById("lastName").value = data.lastName || "";
            if (document.getElementById("suffix")) document.getElementById("suffix").value = data.suffix || "";
            if (document.getElementById("position")) document.getElementById("position").value = data.position || "";
        }
    } catch (err) {
        console.error("Failed loading user profile:", err);
    }
}

// File Processor: Population -> Stored in subcollection path: pho-database/main/population-data
async function processPopulationFile(file) {
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
                    if (val0.toUpperCase().includes("ILOILO")) val0 = "ILOILO";

                    const lowerName = val0.toLowerCase();
                    if (["total", "grand total"].includes(lowerName) || lowerName.startsWith("*") || lowerName.startsWith("notes")) continue;

                    const totalPopulation = parseNumber(row[2]);
                    if (totalPopulation === 0) continue;

                    cleanData.push({ facilityName: val0, totalPopulation });
                }

                if (cleanData.length === 0) throw new Error("No valid population records found.");

                const batch = writeBatch(db);
                cleanData.forEach(item => {
                    const docRef = doc(db, "pho-database", "main", "population-data", item.facilityName);
                    batch.set(docRef, { facilityName: item.facilityName, totalPopulation: item.totalPopulation, lastUpdated: new Date() }, { merge: true });
                });

                const historyRef = doc(collection(db, "pho-database", "main", "import-history"));
                const historyRecord = { timestamp: new Date(), fileName: file.name, importType: "population", totalFacilities: cleanData.length, status: "Completed" };
                batch.set(historyRef, historyRecord);

                await batch.commit();
                addHistoryRow(formatDateTime(historyRecord.timestamp), file.name, `${cleanData.length} Records (Incl. ILOILO Total)`, "Completed");
                await logSystemActivity("Data Imported", `Imported population file ${file.name}`);
                resolve();
            } catch (err) { reject(err); }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

// File Processor: Legacy -> Stored in subcollection path: pho-database/main/legacy-summary
async function processLegacyFile(file) {
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
                    if (!facilityName || ["total", "grand total"].includes(facilityName.toLowerCase())) continue;

                    cleanData.push({ facilityName, rawData: row, lastUpdated: new Date() });
                }

                if (cleanData.length === 0) throw new Error("No valid legacy data rows found.");

                const batch = writeBatch(db);
                cleanData.forEach(item => {
                    const docRef = doc(db, "pho-database", "main", "legacy-summary", item.facilityName);
                    batch.set(docRef, item, { merge: true });
                });

                const historyRef = doc(collection(db, "pho-database", "main", "import-history"));
                const historyRecord = { timestamp: new Date(), fileName: file.name, importType: "legacy", totalFacilities: cleanData.length, status: "Completed" };
                batch.set(historyRef, historyRecord);

                await batch.commit();
                addHistoryRow(formatDateTime(historyRecord.timestamp), file.name, `${cleanData.length} Municipalities`, "Completed");
                await logSystemActivity("Data Imported", `Imported legacy file ${file.name}`);
                resolve();
            } catch (err) { reject(err); }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

// Log System Actions
async function logSystemActivity(action, details) {
    try {
        const userEmail = auth.currentUser?.email || "system";
        await setDoc(doc(collection(db, "pho-database", "main", "audit-logs")), {
            timestamp: new Date(),
            action,
            details,
            user: userEmail
        });
    } catch (e) { console.error("Audit log error:", e); }
}

async function loadImportHistory() {
    const tableBody = document.querySelector("#uploadHistoryTable tbody");
    if (!tableBody) return;
    try {
        const q = query(collection(db, "pho-database", "main", "import-history"), orderBy("timestamp", "desc"), limit(15));
        const snap = await getDocs(q);
        tableBody.innerHTML = "";
        snap.forEach((docSnap) => {
            const data = docSnap.data();
            const recordText = data.importType === "population"
                ? `${data.totalFacilities || 0} Municipalities (Population)`
                : `${data.totalFacilities || 0} Municipalities (All Columns)`;
            addHistoryRow(formatDateTime(data.timestamp), data.fileName || "file", recordText, data.status || "Completed");
        });
    } catch (err) { console.error("Failed loading history:", err); }
}

function addHistoryRow(dateTime, fileName, recordType, status) {
    const tableBody = document.querySelector("#uploadHistoryTable tbody");
    if (!tableBody) return;
    const row = document.createElement("tr");
    row.innerHTML = `
        <td>${dateTime}</td>
        <td>${fileName}</td>
        <td>${recordType}</td>
        <td><span class="badge bg-success">${status}</span></td>
    `;
    tableBody.prepend(row);
}

function parseNumber(val) {
    if (typeof val === "number") return val;
    if (!val) return 0;
    const parsed = parseFloat(String(val).replace(/,/g, "").trim());
    return isNaN(parsed) ? 0 : parsed;
}

function formatDateTime(timestamp) {
    let dateObj = new Date();
    if (timestamp?.toDate) dateObj = timestamp.toDate();
    else if (timestamp?.seconds) dateObj = new Date(timestamp.seconds * 1000);
    else if (timestamp instanceof Date) dateObj = timestamp;

    return dateObj.toLocaleString("en-US", {
        month: "2-digit", day: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true
    });
}