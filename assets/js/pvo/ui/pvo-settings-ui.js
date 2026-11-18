import { auth } from '../../firebase/firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { 
    getOfficerProfile, 
    updateOfficerProfile, 
    changeOfficerPassword,
    batchSaveRabiesCases,
    batchSavePopulationData,
    fetchImportAuditLogs 
} from '../db/pvo-settings-db.js';

document.addEventListener('DOMContentLoaded', () => {
    initAuthWatcher();
    initProfileForm();
    initFileUploaders();
    loadAuditHistory();
    initLogout();
});

let currentUid = null;
let toastTimer = null;

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function initAuthWatcher() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'pvo-login.html';
            return;
        }

        currentUid = user.uid;
        try {
            const profile = await getOfficerProfile(currentUid);
            document.getElementById('firstName').value = profile.firstName || '';
            document.getElementById('lastName').value = profile.lastName || '';
            document.getElementById('userEmail').value = profile.email || user.email;
            document.getElementById('designation').value = profile.designation || 'PVO Officer';
        } catch (err) {
            console.error('Failed to load profile:', err);
            showToast('Failed to load profile information.');
        }
    });
}

function initProfileForm() {
    document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const btn = document.getElementById('saveProfileBtn');

        if (!firstName || !lastName) {
            showToast('Please provide your first and last name.');
            return;
        }

        try {
            btn.disabled = true;
            btn.textContent = 'Updating...';

            await updateOfficerProfile(currentUid, { firstName, lastName });

            if (newPassword) {
                if (newPassword.length < 6) {
                    throw new Error('New password must be at least 6 characters.');
                }
                if (newPassword !== confirmPassword) {
                    throw new Error('Passwords do not match.');
                }
                await changeOfficerPassword(newPassword);
                document.getElementById('newPassword').value = '';
                document.getElementById('confirmPassword').value = '';
            }

            showToast('Officer profile successfully updated.');
        } catch (err) {
            showToast(`Update error: ${err.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Update Account';
        }
    });

    document.getElementById('facilityForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        showToast('Facility details saved locally.');
    });
}

function initFileUploaders() {
    const caseInput = document.getElementById('caseDataFile');
    const popInput = document.getElementById('populationDataFile');

    caseInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) document.getElementById('caseFileName').textContent = file.name;
    });

    popInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) document.getElementById('popFileName').textContent = file.name;
    });

    document.getElementById('uploadCaseDataBtn')?.addEventListener('click', async () => {
        const file = caseInput.files[0];
        if (!file) {
            showToast('Please select a spreadsheet file first.');
            return;
        }

        const btn = document.getElementById('uploadCaseDataBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet);

            if (!json.length) throw new Error('File contains no tabular records.');

            await batchSaveRabiesCases(json, file.name);
            showToast(`Ingested ${json.length} case records to PVO Ledger.`);
            caseInput.value = '';
            document.getElementById('caseFileName').textContent = 'Click to upload case spreadsheet (Max 10MB)';
            loadAuditHistory();
        } catch (err) {
            showToast(`Import failed: ${err.message}`);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-upload"></i> Process Dataset';
        }
    });

    document.getElementById('uploadPopulationBtn')?.addEventListener('click', async () => {
        const file = popInput.files[0];
        if (!file) {
            showToast('Please select a population file first.');
            return;
        }

        const btn = document.getElementById('uploadPopulationBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';

        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet);

            if (!json.length) throw new Error('File contains no records.');

            await batchSavePopulationData(json, file.name);
            showToast(`Updated population records for ${json.length} municipalities.`);
            popInput.value = '';
            document.getElementById('popFileName').textContent = 'Click to upload population data (Max 10MB)';
            loadAuditHistory();
        } catch (err) {
            showToast(`Population sync failed: ${err.message}`);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-upload"></i> Update Population';
        }
    });
}

async function loadAuditHistory() {
    const tbody = document.getElementById('uploadHistoryTableBody');
    if (!tbody) return;

    try {
        const logs = await fetchImportAuditLogs();
        if (!logs.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color:#8B7355;">No import activity logged yet.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(log => {
            const dt = log.uploadedAt?.toDate ? log.uploadedAt.toDate().toLocaleDateString() : 'Today';
            return `
                <tr>
                    <td>${dt}</td>
                    <td><strong>${log.fileName || log.dataset}</strong></td>
                    <td>${Number(log.recordsCount || 0).toLocaleString()} records</td>
                    <td><span class="badge success">${log.status || 'Completed'}</span></td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px; color:#EF4444;">Failed to load audit history: ${err.message}</td></tr>`;
    }
}

function initLogout() {
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await signOut(auth);
        localStorage.clear();
        window.location.href = 'pvo-login.html';
    });
}