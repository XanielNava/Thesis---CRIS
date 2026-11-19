/* ==========================================================================
   CRIS ABTC MODULE — PATIENT REGISTRY UI CONTROLLER (abtc-reg-ui.js)
   Handles Registry Table, Record Drawer, QR Pre-Fill Queue Modal, & Facility QR
   ========================================================================== */

import {
    resolveActiveFacilitySession,
    fetchFacilityName,
    deriveFacilityCode,
    subscribeToFacilityPatients,
    deletePatientRecord,
    updatePatientRecord
} from '../db/abtc-reg-db.js';

const $ = (id) => document.getElementById(id);

let activeFacilityId = sessionStorage.getItem('activeFacilityId') || null;
let activeFacilityName = sessionStorage.getItem('activeFacilityName') || 'ABTC FACILITY';
let activeFacilityAcronym =
    sessionStorage.getItem('activeFacilityAcronym') ||
    sessionStorage.getItem('activeFacilityCode') ||
    deriveFacilityCode(activeFacilityName);
let libraryCache = [];
let currentActiveDocId = null;
let isEditMode = false;
let unsubscribePatients = null;

const tableBody = $('patientRegistryTableBody');
const searchBox = $('searchRegistryInput');
const filterExposure = $('filterExposureType');
const filterCategory = $('filterBiteCategory');

const drawer = $('recordDrawer');
const overlay = $('drawerOverlay');
const closeBtn = $('drawerCloseBtn');
const closeBtnFooter = $('drawerCloseBtnFooter');
const printBtn = $('printRecordBtn');
const profileContainer = $('profileInfoText');

const woundLightbox = $('woundLightbox');
const lightboxImg = $('lightboxImg');
const closeLightboxBtn = $('closeLightboxBtn');

const toggleEditBtn = $('toggleEditBtn');
const saveRecordBtn = $('saveRecordBtn');
const modeBadge = $('drawerModeBadge');

function safeSetText(id, value) {
    const el = $(id);
    if (el) el.innerText = value !== undefined && value !== null && value !== '' ? value : 'N/A';
}

const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));

function formatAddressDisplay(file) {
    if (file.address && typeof file.address === 'object') {
        if (file.address.fullAddress) return file.address.fullAddress;
        const parts = [
            file.address.houseStreet,
            file.address.barangay,
            file.address.cityMunicipality,
            file.address.province
        ].filter(Boolean);
        if (parts.length) return parts.join(', ');
    }
    if (typeof file.address === 'string' && file.address.trim()) {
        return file.address.trim();
    }
    const fallback = [file.houseStreet, file.barangay, file.cityMunicipality || file.municipality, file.province]
        .filter(Boolean)
        .join(', ');
    return fallback || '';
}

/* ==========================================================================
   1. HEADER, QR PRE-FILL QUEUE MODAL, & PRINTABLE FACILITY QR MODAL
   ========================================================================== */

async function initRegistryHeader() {
    const userRole = sessionStorage.getItem('activeDesignation') || 'Nurse';
    const activePersonnel = sessionStorage.getItem('activePersonnelName') || 'Attending Personnel';

    if (!activeFacilityName || activeFacilityName === 'ABTC FACILITY') {
        activeFacilityName = await fetchFacilityName(activeFacilityId);
    }

    if (!activeFacilityAcronym || activeFacilityAcronym === 'ABTC') {
        activeFacilityAcronym =
            sessionStorage.getItem('activeFacilityAcronym') ||
            deriveFacilityCode(activeFacilityName);
    }

    const titleElement = $('dashboardTitle');
    if (titleElement && activeFacilityName) {
        titleElement.innerText = `${activeFacilityName.toUpperCase()} PATIENT REGISTRY`;
    }

    const printFacilityEl = $('drawerPrintFacility');
    if (printFacilityEl && activeFacilityName) {
        printFacilityEl.innerText = `${activeFacilityName} — Animal Bite Treatment Center`;
    }

    if (profileContainer) {
        profileContainer.innerHTML = `<strong>${esc(activePersonnel)}</strong><br><span>${esc(userRole)}</span>`;
    }
}

function wireQrModals() {
    const prefillModal = $('qrPrefillModal');
    const posterModal = $('facilityQrPosterModal');

    $('btnOpenQrPrefillModal')?.addEventListener('click', () => {
        renderPendingPrefillModalList();
        prefillModal?.classList.add('open');
    });

    $('btnCloseQrPrefillModal')?.addEventListener('click', () => {
        prefillModal?.classList.remove('open');
    });

    prefillModal?.addEventListener('click', (e) => {
        if (e.target === prefillModal) prefillModal.classList.remove('open');
    });

    $('qrPrefillListContainer')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-qr-action]');
        if (!btn) return;

        const action = btn.dataset.qrAction;
        const docId = btn.dataset.id;
        const patientName = btn.dataset.name || 'this patient';

        if (action === 'accept') {
            window.location.href = `itr.html?prefillId=${encodeURIComponent(docId)}`;
        } else if (action === 'delete') {
            if (!confirm(`Delete pre-fill form for ${patientName}? Use this if the patient will not continue with their checkup.`)) {
                return;
            }
            btn.disabled = true;
            try {
                await deletePatientRecord(docId);
            } catch (err) {
                alert('Failed to delete form: ' + err.message);
                btn.disabled = false;
            }
        }
    });

    $('btnOpenFacilityQrPoster')?.addEventListener('click', () => {
        renderFacilityQrPosterContent();
        posterModal?.classList.add('open');
    });

    $('btnCloseFacilityQrPoster')?.addEventListener('click', () => {
        posterModal?.classList.remove('open');
    });

    $('btnCloseFacilityQrFooter')?.addEventListener('click', () => {
        posterModal?.classList.remove('open');
    });

    posterModal?.addEventListener('click', (e) => {
        if (e.target === posterModal) posterModal.classList.remove('open');
    });

    $('btnPrintFacilityQrPoster')?.addEventListener('click', () => {
        const posterHtml = $('printableFacilityQrPoster')?.outerHTML || '';
        const printWin = window.open('', '_blank', 'width=520,height=680');
        if (!printWin) return;
        printWin.document.write(`
            <html>
                <head>
                    <title>${esc(activeFacilityName)} — Facility QR</title>
                    <link rel="stylesheet" href="../../assets/css/abtc/abtc-reg.css">
                </head>
                <body style="display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#fff;">
                    <div style="max-width:380px; width:100%;">${posterHtml}</div>
                    <script>window.onload = () => { window.print(); window.close(); };<\/script>
                </body>
            </html>
        `);
        printWin.document.close();
    });
}

function renderFacilityQrPosterContent() {
    const fId = activeFacilityId || sessionStorage.getItem('activeFacilityId') || 'UNASSIGNED';
    const fName = activeFacilityName || sessionStorage.getItem('activeFacilityName') || 'ABTC Facility';
    const fAcronym = (
        activeFacilityAcronym ||
        sessionStorage.getItem('activeFacilityAcronym') ||
        sessionStorage.getItem('activeFacilityCode') ||
        deriveFacilityCode(fName)
    ).toUpperCase();

    safeSetText('qrPosterFacilityName', fName);
    safeSetText('qrPosterFacilityId', `${fAcronym} • Facility ID: ${fId}`);

    const qrPayload = JSON.stringify({
        system: 'CRIS-ABTC',
        type: 'FACILITY_ITR',
        facilityId: fId,
        facilityAcronym: fAcronym,
        facilityName: fName
    });

    const box = $('facilityQrImageBox');
    if (box) {
        const encoded = encodeURIComponent(qrPayload);
        box.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=210x210&data=${encoded}" alt="Facility QR Code">`;
    }
}

function renderPendingPrefillModalList() {
    const pendingList = libraryCache.filter((item) => item.isPending);
    const badge = $('qrPrefillBadge');
    const container = $('qrPrefillListContainer');

    if (badge) {
        badge.textContent = String(pendingList.length);
        badge.hidden = pendingList.length === 0;
    }

    if (!container) return;

    if (pendingList.length === 0) {
        container.innerHTML = `
            <div class="qr-prefill-empty">
                <i class="fa-solid fa-inbox"></i>
                <p>No pending patient pre-fill forms</p>
                <span>When a patient scans your Facility QR and submits their personal info, it will appear here.</span>
            </div>
        `;
        return;
    }

    container.innerHTML = pendingList
        .map((rec) => {
            const patientObj = rec.patient || {};
            const addr = formatAddressDisplay(rec) || 'No address provided';

            const caseTag = rec.itrDisplayNo || rec.caseId || rec.id;
            const dobDisplay = rec.birthday || patientObj.dateOfBirth || rec.dateOfBirth || 'N/A';
            const contactDisplay =
                rec.contactNo || patientObj.mobileNumber || rec.mobileNumber || 'N/A';

            return `
                <div class="qr-prefill-item">
                    <div class="qr-prefill-info">
                        <div class="qr-prefill-name">
                            ${esc(rec.fullName)}
                            <span style="font-size:11px; color:#EA6113; font-weight:700; margin-left:6px;">(${esc(caseTag)})</span>
                        </div>
                        <div class="qr-prefill-meta">
                            <strong>Sex / Age:</strong> ${esc(rec.sex || 'N/A')} &bull; ${esc(rec.age !== '' ? rec.age : 'N/A')} yrs &bull; <strong>DOB:</strong> ${esc(dobDisplay)}
                        </div>
                        <div class="qr-prefill-meta">
                            <strong>Contact:</strong> ${esc(contactDisplay)}
                        </div>
                        <div class="qr-prefill-meta">
                            <strong>Address:</strong> ${esc(addr)}
                        </div>
                    </div>
                    <div class="qr-prefill-actions">
                        <button type="button" class="btn-qr-accept" data-qr-action="accept" data-id="${esc(rec.id)}" data-name="${esc(rec.fullName)}">
                            <i class="fa-solid fa-user-plus"></i> Add Patient
                        </button>
                        <button type="button" class="btn-qr-delete" data-qr-action="delete" data-id="${esc(rec.id)}" data-name="${esc(rec.fullName)}">
                            <i class="fa-solid fa-trash"></i> Delete Form
                        </button>
                    </div>
                </div>
            `;
        })
        .join('');
}

/* ==========================================================================
   2. PATIENT REGISTRY TABLE & FILTERS
   ========================================================================== */

function renderLibraryTable(dataList) {
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (dataList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#888; padding:20px;">No matching patient records found.</td></tr>`;
        return;
    }

    dataList.forEach((record) => {
        const row = document.createElement('tr');
        row.className = 'clickable-req-row';

        let dateString = 'N/A';
        if (record.createdAt && record.createdAt.seconds) {
            dateString = new Date(record.createdAt.seconds * 1000).toLocaleDateString();
        } else if (record.consultDateTime) {
            dateString = new Date(record.consultDateTime).toLocaleDateString();
        } else if (record.submittedAt) {
            dateString = new Date(record.submittedAt).toLocaleDateString();
        } else if (record.exposureDate) {
            dateString = new Date(record.exposureDate).toLocaleDateString();
        }

        const caseIdDisplay =
            record.itrDisplayNo || record.caseId || record.recordNo || record.patientId || record.id;
        const patientNameDisplay = record.fullName || 'Unknown Patient';
        const exposureTypeDisplay = record.exposureType;
        const categoryDisplay = record.classification;

        const isPending = record.isPending;
        const actionButtonText = isPending ? 'Process Intake' : 'View Record';

        row.innerHTML = `
            <td><strong>${esc(caseIdDisplay)}</strong> ${isPending ? '<span style="color:#f88f22; font-size:10px; font-weight:bold; margin-left:4px;">[APP PENDING]</span>' : ''}</td>
            <td>${esc(patientNameDisplay)}</td>
            <td>${esc(exposureTypeDisplay)}</td>
            <td>${esc(categoryDisplay)}</td>
            <td>${esc(dateString)}</td>
            <td style="text-align: center;">
                <button class="btn-enable btn-open-file" data-id="${esc(record.id)}">${actionButtonText}</button>
                <button class="btn-disable btn-delete-file" data-id="${esc(record.id)}" data-name="${esc(patientNameDisplay)}">Delete</button>
            </td>
        `;

        row.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            if (isPending) {
                window.location.href = `itr.html?prefillId=${record.id}`;
            } else {
                openDocumentDrawer(record.id);
            }
        });

        row.querySelector('.btn-open-file')?.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-id');
            const item = libraryCache.find((r) => r.id === targetId);
            if (item && item.isPending) {
                window.location.href = `itr.html?prefillId=${targetId}`;
            } else {
                openDocumentDrawer(targetId);
            }
        });

        row.querySelector('.btn-delete-file')?.addEventListener('click', async (e) => {
            const targetId = e.currentTarget.getAttribute('data-id');
            const targetName = e.currentTarget.getAttribute('data-name');

            if (confirm(`Are you sure you want to delete record for ${targetName}?`)) {
                try {
                    await deletePatientRecord(targetId);
                    alert('Patient record deleted successfully.');
                } catch (err) {
                    alert('Delete Error: ' + err.message);
                }
            }
        });

        tableBody.appendChild(row);
    });
}

function executeCombinedFilters() {
    const searchValue = searchBox ? searchBox.value.toLowerCase().trim() : '';
    const selectedType = filterExposure ? filterExposure.value : '';
    const selectedCategory = filterCategory ? filterCategory.value : '';

    const filtered = libraryCache.filter((item) => {
        const fullName = (item.fullName || '').toLowerCase();
        const firstName = (item.firstName || '').toLowerCase();
        const lastName = (item.lastName || '').toLowerCase();
        const recordId = (
            item.itrDisplayNo ||
            item.caseId ||
            item.recordNo ||
            item.patientId ||
            item.id ||
            ''
        ).toLowerCase();

        const combinedNameString = `${firstName} ${lastName} ${fullName}`;

        const matchesSearch =
            !searchValue ||
            combinedNameString.includes(searchValue) ||
            recordId.includes(searchValue);
        const matchesType =
            !selectedType ||
            (item.exposureType || '').includes(selectedType) ||
            (item.animalType && selectedType.includes(item.animalType));
        const matchesCategory =
            !selectedCategory || (item.classification || '').includes(selectedCategory);

        if (searchValue === '' && item.isPending) {
            return false;
        }

        return matchesSearch && matchesType && matchesCategory;
    });

    renderLibraryTable(filtered);
    renderPendingPrefillModalList();
}

/* ==========================================================================
   3. RECORD VIEW / EDIT DRAWER ENGINE
   ========================================================================== */

const DETAILS = [{ name: 'details', label: 'Details', type: 'text' }];
const CONSENT = { name: 'consentBy', label: 'Consent from', type: 'text', placeholder: 'Name' };

const CHECK_DEFS = {
    phic: [
        { key: 'nhts', label: 'NHTS' },
        { key: 'fourPs', label: '4Ps' },
        { key: 'seniorCitizen', label: 'Senior citizen' },
        { key: 'lguSponsored', label: 'LGU sponsored' },
        { key: 'others', label: 'Others', fields: DETAILS }
    ],
    woundType: [
        { key: 'Punctured', label: 'Punctured' },
        { key: 'Lacerated', label: 'Lacerated' },
        { key: 'Abrasion', label: 'Abrasion' },
        { key: 'Scratch', label: 'Scratch' },
        { key: 'Multiple', label: 'Multiple', fields: DETAILS },
        { key: 'Others', label: 'Others', fields: DETAILS }
    ],
    pastHistory: [
        { key: 'hospitalization', label: 'Hospitalization', fields: DETAILS },
        { key: 'allergy', label: 'Food / drug allergy', fields: DETAILS },
        { key: 'immunization', label: 'Previous immunization', fields: DETAILS },
        { key: 'medicalProblems', label: 'Medical problems / medications', fields: DETAILS },
        { key: 'others', label: 'Others', fields: DETAILS }
    ],
    physicianOrder: [
        {
            key: 'tetanusToxoid',
            label: 'Tetanus toxoid / TD 0.5 mL IM',
            fields: [
                { name: 'details', label: 'Remarks', type: 'text' },
                { name: 'givenAt', label: 'Given on', type: 'datetime-local' }
            ]
        },
        {
            key: 'htig',
            label: 'HTIG 250 U IM',
            fields: [
                { name: 'details', label: 'Remarks', type: 'text' },
                { name: 'givenAt', label: 'Given on', type: 'datetime-local' }
            ]
        },
        {
            key: 'pcecvPvrv',
            label: 'PCECV / PVRV',
            fields: [
                { name: 'brand', label: 'Brand / type', type: 'text' },
                { name: 'route', label: 'Route', type: 'select', options: ['Intramuscular', 'Intradermal'] }
            ]
        },
        {
            key: 'skinTest',
            label: 'ERIG skin test (0.1 mL ERIG + 0.9 mL sterile water)',
            fields: [
                { name: 'injectedAt', label: 'Injected at', type: 'datetime-local' },
                { name: 'dueAt', label: 'Due on', type: 'datetime-local' },
                { name: 'result', label: 'Result', type: 'select', options: ['Negative', 'Positive'] },
                CONSENT
            ]
        },
        {
            key: 'erig',
            label: 'ERIG 200 IU/mL, to infiltrate wound, ANST',
            fields: [
                { name: 'maxDose', label: 'Max dose (mL)', type: 'number' },
                { name: 'amountGiven', label: 'Amount infiltrated', type: 'text' },
                CONSENT
            ]
        },
        {
            key: 'hrig',
            label: 'HRIG 150 IU/mL, to infiltrate wound, ANST',
            fields: [{ name: 'maxDose', label: 'Max dose (mL)', type: 'number' }]
        },
        {
            key: 'antibiotics',
            label: 'Antibiotics',
            fields: [{ name: 'details', label: 'Drug, dose, frequency', type: 'text' }]
        },
        { key: 'dailyDressing', label: 'Daily wound dressing' },
        { key: 'observeAnimal', label: 'Observe animal for 14 days' }
    ]
};

const CHECK_CONTAINERS = {
    phic: ['lblPhic', 'editPhic'],
    woundType: ['lblWoundTypes', 'editWoundTypes'],
    pastHistory: ['lblPastHistory', 'editPastHistory'],
    physicianOrder: ['lblOrders', 'editOrders']
};

const PEP_DAYS = [0, 3, 7, 14, 28];

function setEditVal(id, value) {
    const el = $(id);
    if (el) el.value = value ?? '';
}

function getEditVal(id) {
    return $(id)?.value.trim() ?? '';
}

function renderCheckView(group, map) {
    const el = $(CHECK_CONTAINERS[group][0]);
    if (!el) return;

    const items = CHECK_DEFS[group]
        .filter((def) => map && map[def.key])
        .map((def) => {
            const vals = map[def.key] || {};
            const details = (def.fields || [])
                .filter((f) => vals[f.name])
                .map((f) => {
                    const shown =
                        f.type === 'datetime-local'
                            ? String(vals[f.name]).replace('T', ' ')
                            : vals[f.name];
                    return `<span class="check-detail"><em>${esc(f.label)}:</em> ${esc(shown)}</span>`;
                })
                .join('');
            return `<li><i class="fa-solid fa-square-check"></i><div><strong>${esc(def.label)}</strong>${details}</div></li>`;
        });

    el.innerHTML = items.length
        ? `<ul class="drawer-check-view">${items.join('')}</ul>`
        : `<span class="drawer-none">None recorded</span>`;
}

function buildFieldControl(f, value, enabled) {
    const disabled = enabled ? '' : 'disabled';
    if (f.type === 'select') {
        const opts = ['', ...f.options]
            .map((o) => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o || 'Select')}</option>`)
            .join('');
        return `<select data-field="${f.name}" ${disabled}>${opts}</select>`;
    }
    const extra = f.type === 'number' ? 'step="0.1" min="0"' : '';
    return `<input type="${f.type || 'text'}" data-field="${f.name}" value="${esc(value)}" placeholder="${esc(f.placeholder || '')}" ${extra} ${disabled}>`;
}

function renderCheckEdit(group, map) {
    const el = $(CHECK_CONTAINERS[group][1]);
    if (!el) return;

    el.innerHTML = CHECK_DEFS[group]
        .map((def) => {
            const checked = !!(map && map[def.key]);
            const vals = (map && map[def.key]) || {};
            const fields = (def.fields || [])
                .map(
                    (f) =>
                        `<label class="drawer-sub-field"><span>${esc(f.label)}</span>${buildFieldControl(f, vals[f.name], checked)}</label>`
                )
                .join('');
            return `
            <div class="drawer-check-row" data-value="${def.key}">
                <label class="drawer-check"><input type="checkbox" ${checked ? 'checked' : ''}><span>${esc(def.label)}</span></label>
                ${fields ? `<div class="drawer-check-fields">${fields}</div>` : ''}
            </div>`;
        })
        .join('');
}

function collectCheckGroup(group) {
    const result = {};
    document.querySelectorAll(`#${CHECK_CONTAINERS[group][1]} .drawer-check-row`).forEach((row) => {
        if (!row.querySelector('input[type="checkbox"]').checked) return;
        const fields = {};
        row.querySelectorAll('[data-field]').forEach((el) => {
            fields[el.dataset.field] = el.value.trim();
        });
        result[row.dataset.value] = fields;
    });
    return result;
}

Object.values(CHECK_CONTAINERS).forEach(([, editId]) => {
    $(editId)?.addEventListener('change', (e) => {
        if (!e.target.matches('input[type="checkbox"]')) return;
        const row = e.target.closest('.drawer-check-row');
        row.querySelectorAll('[data-field]').forEach((el) => {
            el.disabled = !e.target.checked;
            if (!e.target.checked) el.value = '';
        });
    });
});

const editAnimalTypeEl = $('editAnimalType');
const editAnimalOtherEl = $('editAnimalOther');
if (editAnimalTypeEl && editAnimalOtherEl) {
    editAnimalTypeEl.addEventListener('change', () => {
        editAnimalOtherEl.hidden = editAnimalTypeEl.value !== 'Other';
    });
}

$('editBirthday')?.addEventListener('change', (e) => {
    const dob = e.target.value;
    if (!dob) return;
    const [y, m, d] = dob.split('-').map(Number);
    if (!y || !m || !d) return;
    const today = new Date();
    let years = today.getFullYear() - y;
    const hadBirthday = (today.getMonth() + 1 > m) || (today.getMonth() + 1 === m && today.getDate() >= d);
    if (!hadBirthday) years--;
    setEditVal('editAge', Math.max(years, 0));
});

function getPastHistoryMap(file) {
    if (file.pastMedicalHistory) return file.pastMedicalHistory;
    const map = {};
    if (String(file.priorVaccination).toLowerCase() === 'yes') map.immunization = { details: '' };
    if (file.allergies) map.allergy = { details: file.allergies };
    const problems = [file.comorbidities, file.medications].filter(Boolean).join('; ');
    if (problems) map.medicalProblems = { details: problems };
    return map;
}

function getOrdersMap(file) {
    if (file.physicianOrders) return file.physicianOrders;
    const map = {};
    if (file.vaccineBrand || file.route) {
        map.pcecvPvrv = { brand: file.vaccineBrand || '', route: file.route || '' };
    }
    return map;
}

function getCategoryCode(file) {
    if (file.exposureCategory) return file.exposureCategory;
    const m = String(file.classification || '').match(/Category (I{1,3})$/);
    return m ? m[1] : '';
}

function openDocumentDrawer(docId) {
    const file = libraryCache.find((item) => item.id === docId);
    if (!file) return;

    currentActiveDocId = docId;
    toggleMode(false);

    const hasNameParts = !!(file.lastName || file.firstName);
    const hasAddressParts = !!(
        file.address?.houseStreet ||
        file.address?.barangay ||
        file.address?.cityMunicipality ||
        file.houseStreet ||
        file.barangay
    );
    const orders = getOrdersMap(file);
    const category = getCategoryCode(file);
    const schedule = file.pepScheduleDates || {};

    const caseId = file.itrDisplayNo || file.caseId || file.recordNo || file.patientId || file.id;
    const withUnit = (v, unit) => (v !== undefined && v !== null && v !== '' ? `${v}${unit}` : 'N/A');
    const formattedAddress = formatAddressDisplay(file);

    safeSetText('drawerIdLabel', `RECORD: ${caseId}`);
    safeSetText('lblRecordNo', caseId);
    safeSetText('lblConsultDateTime', file.consultDateTime ? file.consultDateTime.replace('T', ' ') : '');
    safeSetText('lblPhysician', file.physician || file.recordedBy || '');

    safeSetText('lblFullName', file.fullName);
    safeSetText('lblBirthday', file.birthday);
    safeSetText('lblAgeSex', `${file.age ?? 'N/A'} Yrs / ${file.sex ?? 'N/A'}`);
    safeSetText('lblCivilStatus', file.civilStatus);
    safeSetText('lblReligion', file.religion);
    safeSetText('lblContact', file.contactNo || file.mobileNumber);
    safeSetText('lblSpouse', file.spouseName);
    safeSetText('lblParent', file.parentName);
    safeSetText('lblAddress', formattedAddress);

    renderCheckView('phic', file.phic?.categories);
    safeSetText('lblPhicMembership', file.phic?.membership);

    const vitals = file.vitalSigns || {};
    safeSetText('lblWeight', withUnit(vitals.weightKg ?? file.weight, ' kg'));
    safeSetText('lblHeight', withUnit(vitals.heightFt ?? file.height, ' ft'));
    safeSetText('lblTemp', withUnit(vitals.tempC ?? file.temp, ' °C'));
    safeSetText('lblPulse', withUnit(vitals.pulseBpm ?? file.pulse, ' bpm'));
    safeSetText('lblResp', withUnit(vitals.respCpm ?? file.resp, ' cpm'));
    safeSetText('lblBp', vitals.bp || file.bp);
    safeSetText('lblO2', withUnit(vitals.o2sat ?? file.o2sat, '%'));

    safeSetText('lblAnimalType', file.exposure?.animalType || file.animalType);
    safeSetText('lblAnimalStatus', file.exposure?.animalStatus || file.animalStatus);
    renderCheckView('woundType', file.exposure?.woundTypes || file.woundTypes);
    safeSetText('lblExposureDate', file.exposure?.date || file.exposureDate);
    safeSetText('lblExposureTime', file.exposure?.time || file.incidentTime);
    safeSetText('lblIncidentPlace', file.exposure?.place || file.incidentPlace);
    safeSetText(
        'lblBiteArea',
        Array.isArray(file.exposure?.biteArea) ? file.exposure.biteArea.join(', ') : file.biteArea || 'N/A'
    );

    renderCheckView('pastHistory', getPastHistoryMap(file));

    safeSetText('lblDiagnosis', file.diagnosis);
    safeSetText('lblCategory', category ? `Category ${category}` : 'Unclassified');
    renderCheckView('physicianOrder', orders);
    safeSetText('lblWoundCare', file.woundCare);
    safeSetText('lblRemarks', file.remarks || 'None');

    const legacyRigField = $('legacyRigField');
    const isLegacyRecord = !file.physicianOrders;
    const legacyRig = file.immunoglobulin && file.immunoglobulin !== 'None' ? file.immunoglobulin : '';
    if (legacyRigField) legacyRigField.hidden = !(isLegacyRecord && legacyRig);
    safeSetText('lblLegacyRig', legacyRig);

    PEP_DAYS.forEach((d) => {
        safeSetText(`lblDay${d}`, schedule[`day${d}`] || '---');
        $(`cardSchedDay${d}`)?.classList.toggle('disabled', category === 'I');
    });

    let completedDosesText = 'None';
    if (Array.isArray(file.completedDoses)) {
        const validDoses = file.completedDoses.filter((d) => d && d.trim() !== '');
        if (validDoses.length > 0) completedDosesText = validDoses.join(', ');
    }
    safeSetText('lblCompletedDoses', completedDosesText);

    const imgElement = $('imgWoundPhoto');
    const noPhotoText = $('noPhotoText');
    if (imgElement && noPhotoText) {
        if (file.woundPhotoData && file.woundPhotoData.trim() !== '') {
            imgElement.src = file.woundPhotoData;
            imgElement.style.display = 'inline-block';
            noPhotoText.style.display = 'none';

            imgElement.onclick = () => {
                if (woundLightbox && lightboxImg) {
                    lightboxImg.src = file.woundPhotoData;
                    woundLightbox.style.display = 'flex';
                }
            };
        } else {
            imgElement.style.display = 'none';
            noPhotoText.style.display = 'block';
        }
    }

    const timelineContainer = $('lblHistoryTimeline');
    if (timelineContainer) {
        timelineContainer.innerHTML = '';
        if (Array.isArray(file.historyLogs) && file.historyLogs.length > 0) {
            file.historyLogs.forEach((log) => {
                const item = document.createElement('div');
                item.className = 'history-item';

                const rawTime = log.timestamp || log.createdAt || log.date || log.time;
                let logTime = 'N/A';

                if (rawTime) {
                    if (typeof rawTime.seconds === 'number') {
                        logTime = new Date(rawTime.seconds * 1000).toLocaleString();
                    } else {
                        const parsedDate = new Date(rawTime);
                        logTime = !isNaN(parsedDate) ? parsedDate.toLocaleString() : rawTime;
                    }
                }

                item.innerHTML = `
                    <div class="history-item-header">
                        <span class="history-item-action">${esc(log.action || log.type || 'Record Activity')}</span>
                        <span class="history-item-meta">${esc(logTime)}</span>
                    </div>
                    <div style="color: var(--text-dark); margin-top: 2px;">${esc(log.details || log.description || '')}</div>
                    <div class="history-item-meta" style="margin-top: 4px; font-style: italic;">By: ${esc(log.personnel || log.staff || 'System')}</div>
                `;
                timelineContainer.appendChild(item);
            });
        } else {
            timelineContainer.innerHTML = `<p style="color:var(--text-muted); font-style: italic; font-size: 13px;">No activity logs recorded.</p>`;
        }
    }

    setEditVal('editConsultDateTime', file.consultDateTime);
    setEditVal('editPhysician', file.physician || file.recordedBy);

    setEditVal('editLastName', file.lastName);
    setEditVal('editFirstName', hasNameParts ? file.firstName : file.fullName !== 'Unknown Patient' ? file.fullName : '');
    setEditVal('editMiddleName', file.middleName);
    setEditVal('editSuffix', file.suffix);
    setEditVal('editBirthday', file.birthday);
    setEditVal('editAge', file.age);
    setEditVal('editSex', file.sex || 'Male');
    setEditVal('editCivilStatus', file.civilStatus);
    setEditVal('editReligion', file.religion);
    setEditVal('editContact', file.contactNo || file.mobileNumber);
    setEditVal('editSpouse', file.spouseName);
    setEditVal('editParent', file.parentName);
    setEditVal(
        'editHouseStreet',
        file.address?.houseStreet || (hasAddressParts ? file.houseStreet : typeof file.address === 'string' ? file.address : '')
    );
    setEditVal('editBarangay', file.address?.barangay || file.barangay);
    setEditVal('editCity', file.address?.cityMunicipality || file.cityMunicipality);
    setEditVal('editProvince', file.address?.province || file.province);

    renderCheckEdit('phic', file.phic?.categories);
    setEditVal('editPhicMembership', file.phic?.membership);

    setEditVal('editWeight', vitals.weightKg ?? file.weight);
    setEditVal('editHeight', vitals.heightFt ?? file.height);
    setEditVal('editTemp', vitals.tempC ?? file.temp);
    setEditVal('editPulse', vitals.pulseBpm ?? file.pulse);
    setEditVal('editResp', vitals.respCpm ?? file.resp);
    setEditVal('editBp', vitals.bp || file.bp);
    setEditVal('editO2', vitals.o2sat ?? file.o2sat);

    const rawAnimalType = file.exposure?.animalType || file.animalType;
    const knownAnimal = ['Dog', 'Cat'].includes(rawAnimalType);
    setEditVal('editAnimalType', knownAnimal || !rawAnimalType ? rawAnimalType || 'Dog' : 'Other');
    setEditVal('editAnimalOther', knownAnimal || !rawAnimalType ? '' : rawAnimalType);
    if (editAnimalOtherEl) editAnimalOtherEl.hidden = !!(knownAnimal || !rawAnimalType);
    setEditVal('editAnimalStatus', file.exposure?.animalStatus || file.animalStatus);
    renderCheckEdit('woundType', file.exposure?.woundTypes || file.woundTypes);
    setEditVal('editExposureDate', file.exposure?.date || file.exposureDate);
    setEditVal('editExposureTime', file.exposure?.time || file.incidentTime);
    setEditVal('editIncidentPlace', file.exposure?.place || file.incidentPlace);
    setEditVal(
        'editBiteArea',
        Array.isArray(file.exposure?.biteArea) ? file.exposure.biteArea.join(', ') : file.biteArea || ''
    );

    renderCheckEdit('pastHistory', getPastHistoryMap(file));

    setEditVal('editDiagnosis', file.diagnosis);
    setEditVal('editCategory', category);
    renderCheckEdit('physicianOrder', orders);
    setEditVal('editWoundCare', file.woundCare);
    setEditVal('editRemarks', file.remarks);
    PEP_DAYS.forEach((d) => setEditVal(`editDay${d}`, schedule[`day${d}`]));

    if (drawer && overlay) {
        drawer.classList.add('open');
        overlay.classList.add('open');
    }
}

function toggleMode(forceEdit = null) {
    isEditMode = forceEdit !== null ? forceEdit : !isEditMode;
    if (isEditMode) {
        drawer?.classList.add('edit-mode');
        if (modeBadge) modeBadge.innerText = 'EDIT MODE';
        if (saveRecordBtn) saveRecordBtn.style.display = 'inline-flex';
        if (toggleEditBtn) toggleEditBtn.innerHTML = '<i class="fa-solid fa-eye"></i> View';
    } else {
        drawer?.classList.remove('edit-mode');
        if (modeBadge) modeBadge.innerText = 'VIEW MODE';
        if (saveRecordBtn) saveRecordBtn.style.display = 'none';
        if (toggleEditBtn) toggleEditBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit';
    }
}

function closeDrawer() {
    if (drawer && overlay) {
        drawer.classList.remove('open');
        overlay.classList.remove('open');
    }
}

async function handleSaveRecord() {
    if (!currentActiveDocId) return;

    const file = libraryCache.find((item) => item.id === currentActiveDocId) || {};
    const isLegacyRecord = !file.physicianOrders;

    const lName = getEditVal('editLastName');
    const fName = getEditVal('editFirstName');
    const mName = getEditVal('editMiddleName');
    const suffix = getEditVal('editSuffix');
    const givenPart = `${fName}${mName ? ' ' + mName : ''}${suffix ? ' ' + suffix : ''}`.trim();
    const parsedFullName = [lName, givenPart].filter(Boolean).join(', ');

    if (!lName || !fName) {
        alert('Last Name and First Name are required.');
        return;
    }

    const rawAgeStr = getEditVal('editAge');
    const parsedAge = rawAgeStr !== '' && !isNaN(Number(rawAgeStr)) ? Number(rawAgeStr) : null;

    const houseStr = getEditVal('editHouseStreet');
    const brgy = getEditVal('editBarangay');
    const city = getEditVal('editCity');
    const prov = getEditVal('editProvince');
    const parsedAddress = [houseStr, brgy, city, prov].filter(Boolean).join(', ');

    const animalSelect = getEditVal('editAnimalType');
    const selectedAnimal = animalSelect === 'Other' ? getEditVal('editAnimalOther') : animalSelect;
    const categoryCode = getEditVal('editCategory');
    const biteAreaStr = getEditVal('editBiteArea');

    const pastHistory = collectCheckGroup('pastHistory');
    const physicianOrders = collectCheckGroup('physicianOrder');

    const updatedData = {
        consultDateTime: getEditVal('editConsultDateTime'),
        physician: getEditVal('editPhysician'),
        lastName: lName,
        firstName: fName,
        middleName: mName,
        suffix: suffix,
        fullName: parsedFullName,
        name: parsedFullName,
        birthday: getEditVal('editBirthday') || null,
        age: parsedAge,
        sex: getEditVal('editSex') || 'Male',
        civilStatus: getEditVal('editCivilStatus'),
        religion: getEditVal('editReligion'),
        contactNo: getEditVal('editContact'),
        spouseName: getEditVal('editSpouse'),
        parentName: getEditVal('editParent'),
        address: {
            houseStreet: houseStr,
            barangay: brgy,
            cityMunicipality: city,
            province: prov,
            fullAddress: parsedAddress
        },
        phic: {
            categories: collectCheckGroup('phic'),
            membership: getEditVal('editPhicMembership') || 'None'
        },
        vitalSigns: {
            weightKg: parseFloat(getEditVal('editWeight')) || null,
            heightFt: parseFloat(getEditVal('editHeight')) || null,
            tempC: parseFloat(getEditVal('editTemp')) || null,
            pulseBpm: parseInt(getEditVal('editPulse'), 10) || null,
            respCpm: parseInt(getEditVal('editResp'), 10) || null,
            bp: getEditVal('editBp') || null,
            o2sat: parseInt(getEditVal('editO2'), 10) || null
        },
        exposure: {
            animalType: selectedAnimal || 'Unknown',
            animalStatus: getEditVal('editAnimalStatus'),
            woundTypes: collectCheckGroup('woundType'),
            date: getEditVal('editExposureDate'),
            time: getEditVal('editExposureTime'),
            place: getEditVal('editIncidentPlace'),
            biteArea: biteAreaStr,
            category: categoryCode ? `Category ${categoryCode}` : 'Unclassified'
        },
        animalType: selectedAnimal,
        exposureType: selectedAnimal ? `${selectedAnimal} Exposure` : 'Animal Exposure',
        animalStatus: getEditVal('editAnimalStatus'),
        exposureDate: getEditVal('editExposureDate'),
        biteArea: biteAreaStr,
        pastMedicalHistory: pastHistory,
        allergies: pastHistory.allergy?.details || '',
        comorbidities: pastHistory.medicalProblems?.details || '',
        priorVaccination: pastHistory.immunization ? 'Yes' : '',
        diagnosis: getEditVal('editDiagnosis'),
        exposureCategory: categoryCode,
        classification: categoryCode ? `Category ${categoryCode}` : 'Unclassified',
        physicianOrders: physicianOrders,
        vaccineBrand: physicianOrders.pcecvPvrv?.brand || '',
        route: physicianOrders.pcecvPvrv?.route || '',
        woundCare: getEditVal('editWoundCare'),
        remarks: getEditVal('editRemarks'),
        pepScheduleDates: Object.fromEntries(PEP_DAYS.map((d) => [`day${d}`, getEditVal(`editDay${d}`)]))
    };

    const rigOrders = [
        ['erig', 'ERIG'],
        ['hrig', 'HRIG']
    ].filter(([key]) => physicianOrders[key]);

    if (rigOrders.length || !isLegacyRecord) {
        const rigType = rigOrders.map(([, label]) => label).join(' + ');
        const rigDose = rigOrders
            .map(([key]) => (physicianOrders[key].maxDose ? `${physicianOrders[key].maxDose} mL` : ''))
            .filter(Boolean)
            .join(' + ');
        updatedData.rigType = rigType;
        updatedData.rigDose = rigDose;
        updatedData.immunoglobulin = rigType ? `${rigType}${rigDose ? ' - ' + rigDose : ''}` : rigDose || 'None';
    }

    const editor = sessionStorage.getItem('activePersonnelName') || 'Attending Personnel';

    if (saveRecordBtn) {
        saveRecordBtn.disabled = true;
    }

    try {
        await updatePatientRecord(currentActiveDocId, updatedData, editor);
        alert('Patient record updated successfully!');
        toggleMode(false);
        openDocumentDrawer(currentActiveDocId);
    } catch (err) {
        alert('Failed to update record: ' + err.message);
    } finally {
        if (saveRecordBtn) {
            saveRecordBtn.disabled = false;
        }
    }
}

/* ==========================================================================
   4. INITIALIZATION & EVENT LISTENERS
   ========================================================================== */

toggleEditBtn?.addEventListener('click', () => toggleMode());
closeBtn?.addEventListener('click', closeDrawer);
closeBtnFooter?.addEventListener('click', closeDrawer);
overlay?.addEventListener('click', closeDrawer);

printBtn?.addEventListener('click', () => {
    toggleMode(false);
    window.print();
});

closeLightboxBtn?.addEventListener('click', () => {
    if (woundLightbox) woundLightbox.style.display = 'none';
});

saveRecordBtn?.addEventListener('click', handleSaveRecord);

searchBox?.addEventListener('input', executeCombinedFilters);
filterExposure?.addEventListener('change', executeCombinedFilters);
filterCategory?.addEventListener('change', executeCombinedFilters);

wireQrModals();

resolveActiveFacilitySession(async ({ facilityId, facilityAcronym, facilityName }) => {
    activeFacilityId = facilityId;
    activeFacilityName = facilityName || (await fetchFacilityName(activeFacilityId));
    activeFacilityAcronym = facilityAcronym || deriveFacilityCode(activeFacilityName);

    await initRegistryHeader();

    if ($('facilityQrPosterModal')?.classList.contains('open')) {
        renderFacilityQrPosterContent();
    }

    if (unsubscribePatients) unsubscribePatients();
    unsubscribePatients = subscribeToFacilityPatients(
        {
            facilityId: activeFacilityId,
            facilityAcronym: activeFacilityAcronym,
            facilityName: activeFacilityName
        },
        (records) => {
            libraryCache = records;
            executeCombinedFilters();
            if (currentActiveDocId && drawer?.classList.contains('open') && !isEditMode) {
                openDocumentDrawer(currentActiveDocId);
            }
        }
    );
});