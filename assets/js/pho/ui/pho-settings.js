// ==============================================================================
// pho-settings.js - PHO Settings UI Controller
// ==============================================================================

import { 
    listenToAuth,
    fetchPhoProfile,
    savePhoProfile,
    fetchUserData,
    updateUserData,
    fetchAuditLogs,
    fetchImportHistory,
    saveDatasetBatch
} from '../db/pho_settings-db.js';

let currentUserId = null;
let processedLogoBase64 = null;

document.addEventListener("DOMContentLoaded", () => {
    // Dynamic File Display Feedback
    setupFileInputDisplay("populationFileInput", "popFileText", "📤 Click to upload (CSV, XLSX)");
    setupFileInputDisplay("legacyFileInput", "legacyFileText", "📤 Click to upload (CSV, XLSX)");

    // Logo Upload Listener
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
                return;
            }
            if (logoFileText) logoFileText.innerHTML = `🖼️ Selected: <strong>${escapeHtml(file.name)}</strong>`;
            const reader = new FileReader();
            reader.onload = (event) => { processedLogoBase64 = event.target.result; };
            reader.readAsDataURL(file);
        });
    }

    // 1. Save PHO Facility Profile
    const saveFacilityBtn = document.getElementById("saveFacilityBtn");
    if (saveFacilityBtn) {
        saveFacilityBtn.addEventListener("click", async () => {
            saveFacilityBtn.disabled = true;
            saveFacilityBtn.innerText = "Saving...";

            try {
                const payload = {
                    phoName: document.getElementById("phoName")?.value.trim() || "",
                    phoCode: document.getElementById("phoCode")?.value.trim() || "",
                    province: document.getElementById("province")?.value.trim() || "",
                    municipality: document.getElementById("municipality")?.value.trim() || "",
                    address: document.getElementById("address")?.value.trim() || "",
                    contactNumber: document.getElementById("contactNumber")?.value.trim() || "",
                    phoEmail: document.getElementById("phoEmail")?.value.trim() || ""
                };

                if (processedLogoBase64) payload.logoData = processedLogoBase64;

                await savePhoProfile(payload);
                alert("PHO Workspace profile updated successfully!");
                await renderAuditLogs();
            } catch (error) {
                alert("Failed to save facility profile: " + error.message);
            } finally {
                saveFacilityBtn.disabled = false;
                saveFacilityBtn.innerText = "Save Changes";
            }
        });
    }

    // 2. User Account Settings
    const updateAccountBtn = document.getElementById("updateAccountBtn");
    if (updateAccountBtn) {
        updateAccountBtn.addEventListener("click", async () => {
            const newPassword = document.getElementById("changePassword")?.value || "";
            const confirmPassword = document.getElementById("confirmPassword")?.value || "";

            if (newPassword || confirmPassword) {
                if (newPassword !== confirmPassword) return alert("Passwords do not match.");
                if (newPassword.length < 6) return alert("Password must be at least 6 characters.");
            }

            updateAccountBtn.disabled = true;
            updateAccountBtn.innerText = "Updating...";

            try {
                const firstName = document.getElementById("firstName")?.value.trim() || "";
                const lastName = document.getElementById("lastName")?.value.trim() || "";
                const middleInitial = document.getElementById("middleName")?.value.trim() || "";
                const suffix = document.getElementById("suffix")?.value.trim() || "";

                const profilePayload = {
                    firstName,
                    lastName,
                    middleInitial,
                    suffix,
                    fullName: `${firstName} ${middleInitial ? middleInitial + '.' : ''} ${lastName} ${suffix}`.trim(),
                    email: document.getElementById("userEmail")?.value.trim() || "",
                    designation: document.getElementById("position")?.value.trim() || "Health Officer"
                };

                await updateUserData(currentUserId, profilePayload, newPassword || null);
                alert("Account updated successfully!");
                document.getElementById("changePassword").value = "";
                document.getElementById("confirmPassword").value = "";
                await renderAuditLogs();
            } catch (error) {
                alert("Account update failed: " + error.message);
            } finally {
                updateAccountBtn.disabled = false;
                updateAccountBtn.innerText = "Update Profile";
            }
        });
    }

    // 3. Dataset Importers
    setupDatasetForm("importPopulationForm", "populationFileInput", "importPopulationBtn", "popFileText", "population");
    setupDatasetForm("importLegacyForm", "legacyFileInput", "importLegacyBtn", "legacyFileText", "legacy");

    // Initialize Auth & Data
    listenToAuth(async (user) => {
        if (!user) {
            window.location.href = "pho-login.html";
            return;
        }
        currentUserId = user.uid;
        await Promise.all([
            loadFacilityData(),
            loadUserData(user),
            renderAuditLogs(),
            renderImportHistory()
        ]);
    });
});

async function loadFacilityData() {
    const data = await fetchPhoProfile();
    if (!data) return;
    setInputValue("phoName", data.phoName);
    setInputValue("phoCode", data.phoCode);
    setInputValue("province", data.province);
    setInputValue("municipality", data.municipality);
    setInputValue("address", data.address);
    setInputValue("contactNumber", data.contactNumber);
    setInputValue("phoEmail", data.phoEmail);
}

async function loadUserData(user) {
    setInputValue("userEmail", user.email);
    const data = await fetchUserData(user.uid);
    if (!data) return;
    setInputValue("firstName", data.firstName);
    setInputValue("middleName", data.middleInitial || data.middleName);
    setInputValue("lastName", data.lastName);
    setInputValue("suffix", data.suffix);
    setInputValue("position", data.designation || data.role || data.position);
}

async function renderAuditLogs() {
    const container = document.getElementById("auditLogContainer");
    if (!container) return;

    const logs = await fetchAuditLogs(10);
    if (logs.length === 0) {
        container.innerHTML = `<div class="log-entry"><div class="log-details">No recent system activity.</div></div>`;
        return;
    }

    container.innerHTML = logs.map(l => `
        <div class="log-entry">
            <div class="log-time">${formatDate(l.timestamp)}</div>
            <div class="log-action">${escapeHtml(l.action || "Activity")}</div>
            <div class="log-details">${escapeHtml(l.details || "")}</div>
            <div class="log-user">By: ${escapeHtml(l.performedBy || "System")}</div>
        </div>
    `).join('');
}

async function renderImportHistory() {
    const tbody = document.querySelector("#uploadHistoryTable tbody");
    if (!tbody) return;

    const list = await fetchImportHistory(15);
    tbody.innerHTML = list.map(item => `
        <tr>
            <td>${formatDate(item.timestamp)}</td>
            <td>${escapeHtml(item.fileName || "File")}</td>
            <td>${escapeHtml(item.totalFacilities || 0)} Municipalities (${item.importType})</td>
            <td><span class="badge bg-success">${escapeHtml(item.status || "Completed")}</span></td>
        </tr>
    `).join('');
}

function setupDatasetForm(formId, inputId, btnId, textId, type) {
    const form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById(inputId);
        const btn = document.getElementById(btnId);
        const file = input?.files[0];
        if (!file) return alert(`Please select an Excel file for ${type} import.`);

        btn.disabled = true;
        btn.innerText = "Processing...";

        try {
            const records = type === "population" 
                ? await parsePopulationExcel(file) 
                : await parseLegacyExcel(file);

            const targetCol = type === "population" ? "population-data" : "legacy-summary";
            await saveDatasetBatch(targetCol, records, { name: file.name, type });

            alert(`${type === "population" ? "Population" : "Legacy"} dataset imported successfully!`);
            input.value = "";
            document.getElementById(textId).innerHTML = "📤 Click to upload (CSV, XLSX)";
            await renderImportHistory();
            await renderAuditLogs();
        } catch (err) {
            alert("Import error: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerText = type === "population" ? "Import Population" : "Import Legacy Masterlist";
        }
    });
}

function parsePopulationExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const workbook = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: 0 });
                const data = [];
                for (let i = 3; i < rows.length; i++) {
                    const r = rows[i];
                    if (!r || !r[0]) continue;
                    let name = String(r[0]).trim();
                    if (["total", "grand total"].includes(name.toLowerCase())) continue;
                    const pop = parseFloat(String(r[2]).replace(/,/g, "")) || 0;
                    if (pop > 0) data.push({ facilityName: name, totalPopulation: pop });
                }
                resolve(data);
            } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function parseLegacyExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const workbook = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: 0 });
                const data = [];
                for (let i = 1; i < rows.length; i++) {
                    const r = rows[i];
                    if (!r || !r[0]) continue;
                    const name = String(r[0]).trim();
                    if (["total", "grand total"].includes(name.toLowerCase())) continue;
                    const sanitized = Array.from({ length: 24 }, (_, idx) => {
                        const val = r[idx];
                        return idx === 0 ? name : (isNaN(Number(val)) ? 0 : Number(val));
                    });
                    data.push({ facilityName: name, rawData: sanitized });
                }
                resolve(data);
            } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function setupFileInputDisplay(inputId, textId, defaultText) {
    const input = document.getElementById(inputId);
    const text = document.getElementById(textId);
    if (input && text) {
        input.addEventListener("change", (e) => {
            text.innerHTML = e.target.files?.length 
                ? `📄 Selected: <strong>${escapeHtml(e.target.files[0].name)}</strong>` 
                : defaultText;
        });
    }
}

function setInputValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? "";
}

function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate(ts) {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
    return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}