/* ==========================================================================
   CRIS LGU MODULE — ANIMAL REGISTRY UI CONTROLLER
   Municipality-scoped LGU registry
   ========================================================================== */

import { auth } from '../../firebase/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
    fetchCurrentLguOfficer,
    fetchRegisteredMunicipalities,
    fetchAnimalRegistryRecords,
    createOwnerRecord,
    updateOwnerRecord,
    syncOwnerAnimals
} from '../db/lgu-AR-db.js';

/* ======================================================================
   1. STATE & VALIDATION CONSTANTS
   ====================================================================== */

const PH_MOBILE_PATTERN = /^09\d{2}-?\d{3}-?\d{4}$/;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

let ownerDatabase = {};
let registeredMunicipalities = [];
let currentOfficer = null;

const state = {
    activeOwnerId: null,
    sortColumn: -1,
    sortAscending: true,
    formPhoto: '',
    cameraStream: null,
    animalMode: 'add',
    animalIndex: -1,
    vaxIndex: -1,
    deleteIndex: -1
};

/* ======================================================================
   2. HELPERS
   ====================================================================== */

const $ = (id) => document.getElementById(id);

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[c]));

const ownerName = (o) =>
    [`${o.lastName}, ${o.firstName}`, o.middleInitial, o.suffix]
        .filter(Boolean)
        .join(' ');

const initials = (o) =>
    `${(o.firstName || '').charAt(0)}${(o.lastName || '').charAt(0)}`
        .toUpperCase();

const hasDate = (value) => Boolean(value) && value !== 'N/A';

const VAX_CLASS = {
    Vaccinated: 'vax-ok',
    Unvaccinated: 'vax-none',
    Overdue: 'vax-overdue'
};

const vaxBadge = (status) =>
    `<span class="vax-badge ${VAX_CLASS[status] || ''}">${esc(status)}</span>`;

const MUNICIPALITY_CODES = {
    "ajuy": "AJU",
    "alimodian": "ALI",
    "anilao": "ANI",
    "badiangan": "BAD",
    "balasan": "BAL",
    "banate": "BAN",
    "barotac nuevo": "BNU",
    "barotac viejo": "BVI",
    "batad": "BAT",
    "bingawan": "BIN",
    "cabatuan": "CAB",
    "calinog": "CAL",
    "carles": "CAR",
    "concepcion": "CON",
    "dingle": "DIN",
    "duenas": "DUE",
    "dumangas": "DUM",
    "estancia": "EST",
    "guimbal": "GUI",
    "igbaras": "IGB",
    "janiuay": "JAN",
    "lambunao": "LAM",
    "leganes": "LEG",
    "lemery": "LEM",
    "leon": "LEO",
    "maasin": "MAA",
    "miagao": "MIA",
    "mina": "MIN",
    "new lucena": "NLU",
    "oton": "OTO",
    "pavia": "PAV",
    "pototan": "POT",
    "san dionisio": "SDI",
    "san enrique": "SEN",
    "san joaquin": "SJO",
    "san miguel": "SMI",
    "san rafael": "SRA",
    "santa barbara": "STB",
    "sara": "SAR",
    "tigbauan": "TIG",
    "tubungan": "TUB",
    "zarraga": "ZAR"
};

function normalizeMunicipalityName(name) {
    return String(name || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function nextRegId() {
    const municipality =
        currentOfficer?.municipality ||
        currentOfficer?.address?.municipality ||
        "";

    if (!municipality) {
        throw new Error("Officer municipality is not assigned.");
    }

    const normalizedName = normalizeMunicipalityName(municipality);

    const prefix = MUNICIPALITY_CODES[normalizedName];

    if (!prefix) {
        throw new Error(
            `No registration code assigned for municipality: ${municipality}`
        );
    }

    const year = new Date().getFullYear();

    const max = Object.values(ownerDatabase).reduce(
        (highest, owner) => {
            const match = String(owner.regId || "").match(
                new RegExp(`^${prefix}-${year}-(\\d+)$`)
            );

            return match
                ? Math.max(highest, Number(match[1]))
                : highest;
        },
        0
    );

    return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
}

function nextOwnerKey() {
    const max = Object.keys(ownerDatabase).reduce((m, key) => {
        const n = parseInt(String(key).split('-')[1], 10);
        return Number.isNaN(n) ? m : Math.max(m, n);
    }, 0);

    return `OWN-${String(max + 1).padStart(3, '0')}`;
}

function nextAnimalRegId(owner) {
    const max = owner.animals.reduce((m, a) => {
        const n = parseInt(String(a.regId).split('-A').pop(), 10);
        return Number.isNaN(n) ? m : Math.max(m, n);
    }, 0);

    return `${owner.regId}-A${max + 1}`;
}

/* ======================================================================
   3. TOAST & MODAL CONTROLS
   ====================================================================== */

let toastTimer = null;

function showToast(message) {
    const el = $('toast');
    if (!el) return;

    el.textContent = message;
    el.classList.add('show');

    clearTimeout(toastTimer);

    toastTimer = setTimeout(
        () => el.classList.remove('show'),
        2600
    );
}

function openOverlay(el) {
    if (!el) return;

    el.classList.add('active');
    el.setAttribute('aria-hidden', 'false');
}

function closeOverlay(el) {
    if (!el) return;

    if (el.id === 'cameraModal') stopCamera();
    if (el.id === 'animalProfileModal') state.animalIndex = -1;
    if (el.id === 'vaccinationModal') state.vaxIndex = -1;
    if (el.id === 'confirmDeleteModal') state.deleteIndex = -1;

    el.classList.remove('active');
    el.setAttribute('aria-hidden', 'true');
}

function clearErrors(formId) {
    document.querySelectorAll(`#${formId} .input-error`)
        .forEach((el) => el.classList.remove('input-error'));

    document.querySelectorAll(`#${formId} .error-msg`)
        .forEach((el) => {
            el.textContent = '';
        });
}

function showFieldError(fieldId, message) {
    const field = $(fieldId);
    const msg = $(`${fieldId}Error`);

    if (field) field.classList.add('input-error');
    if (msg) msg.textContent = message;
}

/* ======================================================================
   4. DYNAMIC MUNICIPALITY DROPDOWNS & HEADER SESSION
   ====================================================================== */

function populateDynamicMunicipalities() {
    // Only show the municipality assigned to the logged-in officer.
    const officerMuni =
        currentOfficer?.municipality ||
        currentOfficer?.address?.municipality ||
        '';

    ['municipality', 'filterMunicipality'].forEach((id) => {
        const select = $(id);
        if (!select) return;

        select.innerHTML = '';

        if (officerMuni) {
            select.appendChild(
                new Option(officerMuni, officerMuni)
            );

            select.value = officerMuni;
        }
    });
}

function renderOfficerHeader() {
    if (!currentOfficer) return;

    const fullName =
        currentOfficer.fullName ||
        currentOfficer.email ||
        '';

    const role = currentOfficer.designation || '';

    const muni =
        currentOfficer.municipality ||
        currentOfficer.address?.municipality ||
        '';

    const profileStrong = document.querySelector(
        '.user-profile-top .profile-info strong, .header-chip strong'
    );

    const profileSpan = document.querySelector(
        '.user-profile-top .profile-info span, .header-chip small'
    );

    if (profileStrong) {
        profileStrong.textContent = fullName;
    }

    if (profileSpan) {
        profileSpan.textContent = [role, muni]
            .filter(Boolean)
            .join(' · ');
    }
}

/* ======================================================================
   5. SUMMARY STATISTICS & TABLE RENDERING
   ====================================================================== */

function renderStats() {
    const owners = Object.values(ownerDatabase);

    const animals = owners.flatMap(
        (o) => o.animals || []
    );

    const vaccinated = animals.filter(
        (a) => a.status === 'Vaccinated'
    ).length;

    if ($('statOwners')) {
        $('statOwners').textContent = owners.length;
    }

    if ($('statAnimals')) {
        $('statAnimals').textContent = animals.length;
    }

    if ($('statVaccinated')) {
        $('statVaccinated').textContent = vaccinated;
    }

    if ($('statAttention')) {
        $('statAttention').textContent =
            animals.length - vaccinated;
    }
}

function matchesFilters(owner) {
    const q =
        $('searchInput')?.value.trim().toLowerCase() || '';

    const muni =
        $('filterMunicipality')?.value || '';

    const species =
        $('filterSpecies')?.value || '';

    const vax =
        $('filterVaxStatus')?.value || '';

    const searchable = [
        owner.regId,
        owner.lastName,
        owner.firstName,
        owner.middleInitial,
        `${owner.firstName} ${owner.lastName}`
    ].join(' ').toLowerCase();

    return (!q || searchable.includes(q))
        && (!muni || owner.municipality === muni)
        && (!species || owner.animals.some(
            (a) => a.species === species
        ))
        && (!vax || owner.animals.some(
            (a) => a.status === vax
        ));
}

const SORT_VALUE = {
    0: (o) => o.regId,
    1: (o) => ownerName(o).toLowerCase(),
    2: (o) => o.municipality,
    3: (o) => o.animals.length
};

function getVisibleOwnerIds() {
    const ids = Object.keys(ownerDatabase).filter(
        (id) => matchesFilters(ownerDatabase[id])
    );

    if (state.sortColumn !== -1) {
        const value = SORT_VALUE[state.sortColumn];
        const dir = state.sortAscending ? 1 : -1;

        ids.sort((a, b) => {
            const va = value(ownerDatabase[a]);
            const vb = value(ownerDatabase[b]);

            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;

            return 0;
        });
    }

    return ids;
}

function ownerAvatar(owner) {
    return owner.photo
        ? `<img class="avatar-img" src="${esc(owner.photo)}" alt="">`
        : `<span class="avatar-initials" aria-hidden="true">${esc(initials(owner))}</span>`;
}

function rowHTML(id) {
    const o = ownerDatabase[id];
    const name = ownerName(o);

    const species = [
        ...new Set(o.animals.map((a) => a.species))
    ];

    const chips = species.map(
        (s) => `<span class="species-chip">${esc(s)}</span>`
    ).join('');

    return `
        <tr data-owner-id="${esc(id)}">
            <td class="col-reg-id">${esc(o.regId)}</td>

            <td>
                <div class="owner-cell">
                    ${ownerAvatar(o)}

                    <div class="owner-text">
                        <button
                            type="button"
                            class="owner-name-btn"
                            data-action="view"
                            data-id="${esc(id)}"
                            title="Open owner file">
                            ${esc(name)}
                        </button>

                        <small>${esc(o.contact)}</small>
                    </div>
                </div>
            </td>

            <td>${esc(o.municipality)}</td>

            <td class="col-center">
                <span class="badge-count">
                    ${o.animals.length} Animal(s)
                </span>

                <div class="species-chips">
                    ${chips}
                </div>
            </td>

            <td class="col-center">
                <div class="action-btn-group">
                    <button
                        type="button"
                        class="btn-table-action btn-table-view"
                        data-action="view"
                        data-id="${esc(id)}"
                        aria-label="View ${esc(name)}">
                        <i class="fa-solid fa-eye"></i> View
                    </button>

                    <button
                        type="button"
                        class="btn-table-action btn-table-edit"
                        data-action="edit"
                        data-id="${esc(id)}"
                        aria-label="Edit ${esc(name)}">
                        <i class="fa-solid fa-pen-to-square"></i> Edit
                    </button>
                </div>
            </td>
        </tr>`;
}

function updateSortIndicators() {
    document.querySelectorAll('.sort-btn').forEach((btn) => {
        const col = Number(btn.dataset.sort);
        const th = btn.closest('th');
        const icon = btn.querySelector('i');
        const active = col === state.sortColumn;

        if (th) {
            th.setAttribute(
                'aria-sort',
                active
                    ? (state.sortAscending ? 'ascending' : 'descending')
                    : 'none'
            );
        }

        let iconClass = 'fa-sort';

        if (active) {
            iconClass = state.sortAscending
                ? 'fa-sort-up'
                : 'fa-sort-down';
        }

        if (icon) {
            icon.className = `fa-solid ${iconClass} sort-icon`;
        }
    });
}

function renderTable() {
    const tbody = $('registryTableBody');
    if (!tbody) return;

    const ids = getVisibleOwnerIds();
    const total = Object.keys(ownerDatabase).length;

    tbody.innerHTML = ids.length
        ? ids.map(rowHTML).join('')
        : `<tr>
                <td colspan="5" class="empty-row">
                    <i class="fa-solid fa-folder-open"></i>
                    <span>No registered animal owners found in Firestore.</span>
                </td>
           </tr>`;

    if ($('resultCount')) {
        $('resultCount').textContent =
            `Showing ${ids.length} of ${total} record(s)`;
    }

    updateSortIndicators();
}

function refreshRegistry() {
    populateDynamicMunicipalities();
    renderStats();
    renderTable();
}

/* ======================================================================
   6. OWNER FILE (VIEW MODAL) & ANIMAL CARDS
   ====================================================================== */

function openOwnerFile(ownerId) {
    const o = ownerDatabase[ownerId];
    if (!o) return;

    state.activeOwnerId = ownerId;

    const photo = $('profilePhoto');

    if (photo) {
        photo.innerHTML = o.photo
            ? `<img src="${esc(o.photo)}" alt="Owner photo">`
            : '<i class="fa-solid fa-user"></i>';
    }

    if ($('profileName')) {
        $('profileName').textContent = ownerName(o);
    }

    if ($('profileRegId')) {
        $('profileRegId').textContent =
            `Registration ID: ${o.regId}`;
    }

    if ($('viewRegId')) $('viewRegId').value = o.regId;
    if ($('viewContact')) $('viewContact').value = o.contact;
    if ($('viewLastName')) $('viewLastName').value = o.lastName;
    if ($('viewFirstName')) $('viewFirstName').value = o.firstName;

    if ($('viewMiddleInitial')) {
        $('viewMiddleInitial').value = o.middleInitial || '—';
    }

    if ($('viewSuffix')) {
        $('viewSuffix').value = o.suffix || '—';
    }

    if ($('viewStreet')) {
        $('viewStreet').value = o.street || '—';
    }

    if ($('viewBarangay')) {
        $('viewBarangay').value = o.barangay;
    }

    if ($('viewMunicipality')) {
        $('viewMunicipality').value = o.municipality;
    }

    if ($('viewZipCode')) {
        $('viewZipCode').value = o.zipCode || '—';
    }

    renderAnimalCards(o);
    openOverlay($('ownerProfileModal'));
}

function animalCardHTML(animal, index) {
    const lastVax = hasDate(animal.lastVax)
        ? animal.lastVax
        : '—';

    const detail = (label, value) => `
        <div class="detail-item">
            <span class="detail-label">${label}</span>
            <span class="detail-value">${esc(value || '—')}</span>
        </div>`;

    return `
        <div class="animal-profile-card">
            <div class="animal-profile-title">
                <span>
                    <i class="fa-solid fa-paw"></i>
                    Animal ${index + 1}: ${esc(animal.name)}
                </span>

                <div class="animal-card-tools no-print">
                    <span class="reg-tag">
                        Reg ID: <strong>${esc(animal.regId)}</strong>
                    </span>

                    <button
                        type="button"
                        class="btn-animal-action btn-animal-edit"
                        data-action="edit-animal"
                        data-index="${index}">
                        <i class="fa-solid fa-pen-to-square"></i>
                        Edit Animal Profile
                    </button>

                    <button
                        type="button"
                        class="btn-animal-action btn-animal-vax"
                        data-action="update-vax"
                        data-index="${index}">
                        <i class="fa-solid fa-syringe"></i>
                        Update Vaccination
                    </button>

                    <button
                        type="button"
                        class="btn-delete-animal"
                        data-action="delete-animal"
                        data-index="${index}">
                        <i class="fa-solid fa-trash-can"></i>
                        Delete
                    </button>
                </div>
            </div>

            <div class="animal-detail-grid">
                ${detail('Species', animal.species)}
                ${detail('Breed', animal.breed)}
                ${detail('Sex', animal.sex)}
                ${detail('Reproductive Status', animal.neutered)}
                ${detail('Microchip / Tag ID', animal.microchipId)}

                <div class="detail-item">
                    <span class="detail-label">Vaccination Status</span>
                    <span>${vaxBadge(animal.status)}</span>
                </div>

                ${detail('Last Vaccination Date', lastVax)}
            </div>
        </div>`;
}

function renderAnimalCards(owner) {
    const container = $('animalProfilesListContainer');
    if (!container) return;

    container.innerHTML = owner.animals.length
        ? owner.animals.map(animalCardHTML).join('')
        : '<p class="muted">No animals registered for this owner yet.</p>';
}

function handleAnimalAction(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;

    const index = Number(btn.dataset.index);

    switch (btn.dataset.action) {
        case 'edit-animal':
            openAnimalProfileModal('edit', index);
            break;

        case 'update-vax':
            openVaccinationModal(index);
            break;

        case 'delete-animal':
            openDeleteConfirm(index);
            break;

        default:
            break;
    }
}/* ======================================================================
   7. ANIMAL PROFILE, VACCINATION & DELETE MODALS
   ====================================================================== */

function openAnimalProfileModal(mode, index = -1) {
    const owner = ownerDatabase[state.activeOwnerId];
    if (!owner) return;

    const animal = mode === 'edit' ? owner.animals[index] : null;
    if (mode === 'edit' && !animal) return;

    state.animalMode = mode;
    state.animalIndex = index;

    clearErrors('animalProfileForm');
    $('animalProfileForm')?.reset();

    const isEdit = mode === 'edit';

    $('animalProfileModalTitle').innerHTML = isEdit
        ? '<i class="fa-solid fa-pen-to-square"></i> Edit Animal Profile'
        : '<i class="fa-solid fa-plus"></i> Add Animal Profile';

    $('saveAnimalBtn').textContent = isEdit
        ? 'Save Changes'
        : 'Add Animal';

    if (animal) {
        $('apName').value = animal.name || '';
        $('apSpecies').value = animal.species || '';
        $('apBreed').value = animal.breed || '';
        $('apSex').value = animal.sex || '';
        $('apRepro').value = animal.neutered || '';
        $('apMicrochip').value = animal.microchipId || '';
    }

    openOverlay($('animalProfileModal'));
    $('apName').focus();
}

async function saveAnimalProfile(event) {
    event.preventDefault();
    clearErrors('animalProfileForm');

    const ownerId = state.activeOwnerId;
    const owner = ownerDatabase[ownerId];

    if (!owner) return;

    const name = $('apName').value.trim();

    if (!name) {
        showFieldError('apName', 'Animal name is required.');
        $('apName').focus();
        return;
    }

    const data = {
        name,
        species: $('apSpecies').value,
        breed: $('apBreed').value.trim(),
        sex: $('apSex').value,
        neutered: $('apRepro').value,
        microchipId: $('apMicrochip').value.trim()
    };

    const updatedAnimals = [...owner.animals];
    let actionNote = '';

    if (state.animalMode === 'edit') {
        if (!updatedAnimals[state.animalIndex]) return;

        updatedAnimals[state.animalIndex] = {
            ...updatedAnimals[state.animalIndex],
            ...data
        };

        actionNote = `Edited animal ${name}`;
    } else {
        updatedAnimals.push({
            regId: nextAnimalRegId(owner),
            ...data,
            status: 'Unvaccinated',
            lastVax: ''
        });

        actionNote = `Added animal ${name}`;
    }

    try {
        await syncOwnerAnimals(
            ownerId,
            owner.regId,
            updatedAnimals,
            actionNote,
            currentOfficer
        );

        owner.animals = updatedAnimals;

        closeOverlay($('animalProfileModal'));
        renderAnimalCards(owner);
        refreshRegistry();

        showToast(
            state.animalMode === 'edit'
                ? 'Animal profile updated.'
                : 'Animal profile added.'
        );
    } catch (err) {
        console.error('Error saving animal profile:', err);
        showToast('Failed to save animal profile to Firestore.');
    }
}

function openVaccinationModal(index) {
    const owner = ownerDatabase[state.activeOwnerId];
    const animal = owner && owner.animals[index];

    if (!animal) return;

    state.vaxIndex = index;
    clearErrors('vaccinationForm');

    $('vaxAnimalName').textContent =
        `${animal.name} · Reg ID ${animal.regId} · ${animal.species}`;

    $('vaxStatus').value = animal.status;
    $('vaxDate').value = hasDate(animal.lastVax)
        ? animal.lastVax
        : '';

    openOverlay($('vaccinationModal'));
    $('vaxStatus').focus();
}

async function saveVaccination(event) {
    event.preventDefault();
    clearErrors('vaccinationForm');

    const ownerId = state.activeOwnerId;
    const owner = ownerDatabase[ownerId];
    const animal = owner && owner.animals[state.vaxIndex];

    if (!animal) return;

    const status = $('vaxStatus').value;
    const date = $('vaxDate').value;

    if (status === 'Vaccinated' && !date) {
        showFieldError(
            'vaxDate',
            'Enter the date of the latest vaccination.'
        );

        $('vaxDate').focus();
        return;
    }

    const updatedAnimals = [...owner.animals];

    updatedAnimals[state.vaxIndex] = {
        ...animal,
        status,
        lastVax: date || ''
    };

    try {
        await syncOwnerAnimals(
            ownerId,
            owner.regId,
            updatedAnimals,
            `Updated vaccination for ${animal.name} to ${status}`,
            currentOfficer
        );

        owner.animals = updatedAnimals;

        closeOverlay($('vaccinationModal'));
        renderAnimalCards(owner);
        refreshRegistry();

        showToast('Vaccination record updated.');
    } catch (err) {
        console.error('Error updating vaccination:', err);
        showToast('Failed to update vaccination status.');
    }
}

function openDeleteConfirm(index) {
    const owner = ownerDatabase[state.activeOwnerId];
    const animal = owner && owner.animals[index];

    if (!animal) return;

    state.deleteIndex = index;

    const label = animal.name || `Animal ${index + 1}`;

    $('confirmDeleteText').innerHTML =
        `Are you sure you want to delete <strong>${esc(label)}</strong> (Reg ID: ${esc(animal.regId)}) from this owner's file?`;

    openOverlay($('confirmDeleteModal'));
    $('cancelDeleteBtn').focus();
}

async function confirmDeleteAnimal() {
    const ownerId = state.activeOwnerId;
    const owner = ownerDatabase[ownerId];
    const index = state.deleteIndex;
    const animal = owner && owner.animals[index];

    closeOverlay($('confirmDeleteModal'));

    if (!animal) return;

    const updatedAnimals = owner.animals.filter(
        (_, idx) => idx !== index
    );

    try {
        await syncOwnerAnimals(
            ownerId,
            owner.regId,
            updatedAnimals,
            `Deleted animal ${animal.name} (${animal.regId})`,
            currentOfficer
        );

        owner.animals = updatedAnimals;

        renderAnimalCards(owner);
        refreshRegistry();

        showToast('Animal profile deleted.');
    } catch (err) {
        console.error('Error deleting animal:', err);
        showToast('Failed to delete animal profile.');
    }
}

/* ======================================================================
   8. OWNER FORM (ADD / EDIT) & PHOTO CAPTURE
   ====================================================================== */

function setPhotoPreview(src) {
    state.formPhoto = src || '';

    const img = $('photoImg');
    const placeholder = $('photoPlaceholder');

    if (state.formPhoto) {
        img.src = state.formPhoto;
        img.hidden = false;
        placeholder.hidden = true;
    } else {
        img.removeAttribute('src');
        img.hidden = true;
        placeholder.hidden = false;
    }

    if ($('removePhotoBtn')) {
        $('removePhotoBtn').disabled = !state.formPhoto;
    }
}

function openAddOwnerModal() {
    clearErrors('ownerRegistrationForm');
    $('ownerRegistrationForm').reset();

    $('editingOwnerId').value = '';

    $('addOwnerModalTitle').innerHTML =
        '<i class="fa-solid fa-id-card"></i> Register New Owner';

    $('saveRecordSubmitBtn').textContent = 'Save Entry';
    $('primaryAnimalSection').hidden = false;
    $('regId').value = nextRegId();

    const officerMuni =
        currentOfficer?.municipality ||
        currentOfficer?.address?.municipality ||
        '';

    if (officerMuni && $('municipality')) {
        $('municipality').value = officerMuni;
    }

    setPhotoPreview('');

    openOverlay($('addOwnerModal'));
    $('contactNumber').focus();
}

function openEditOwnerModal(ownerId) {
    const o = ownerDatabase[ownerId];
    if (!o) return;

    clearErrors('ownerRegistrationForm');
    $('ownerRegistrationForm').reset();

    $('editingOwnerId').value = ownerId;

    $('addOwnerModalTitle').innerHTML =
        '<i class="fa-solid fa-pen-to-square"></i> Edit Registered Owner';

    $('saveRecordSubmitBtn').textContent = 'Update Record';
    $('primaryAnimalSection').hidden = true;

    $('regId').value = o.regId;
    $('contactNumber').value = o.contact;
    $('lastName').value = o.lastName;
    $('firstName').value = o.firstName;
    $('middleInitial').value = o.middleInitial;
    $('suffix').value = o.suffix;

    $('municipality').value = o.municipality;
    $('barangay').value = o.barangay;

    setPhotoPreview(o.photo);

    openOverlay($('addOwnerModal'));
    $('contactNumber').focus();
}

async function handleFormSubmit(event) {
    event.preventDefault();
    clearErrors('ownerRegistrationForm');

    const editingId = $('editingOwnerId').value;
    const isEditing = editingId !== '';

    const contact = $('contactNumber').value.trim();
    const lastName = $('lastName').value.trim();
    const firstName = $('firstName').value.trim();
    const middleInitial = $('middleInitial').value.trim().toUpperCase();
    const suffix = $('suffix').value;

    const municipality =
        currentOfficer?.municipality ||
        currentOfficer?.address?.municipality ||
        '';

    const barangay = $('barangay').value.trim();

    let valid = true;

    const fail = (id, message) => {
        showFieldError(id, message);
        valid = false;
    };

    if (!contact) {
        fail('contactNumber', 'Contact number is required.');
    } else if (!PH_MOBILE_PATTERN.test(contact)) {
        fail('contactNumber', 'Use the format 09XX-XXX-XXXX.');
    }

    if (!lastName) {
        fail('lastName', 'Last name is required.');
    }

    if (!firstName) {
        fail('firstName', 'First name is required.');
    }

    if (middleInitial.length > 3) {
        fail('middleInitial', 'Maximum of 3 characters.');
    }

    if (!municipality) {
        fail('municipality', 'Your account has no assigned municipality.');
    }

    if (!barangay) {
        fail('barangay', 'Barangay is required.');
    }

    let animal = null;

    if (!isEditing) {
        animal = {
            name: $('animalName').value.trim(),
            species: $('species').value,
            breed: $('breed').value.trim(),
            sex: $('sex').value,
            neutered: $('neutered').value,
            status: $('vaccinationStatus').value,
            lastVax: $('lastVaxDate').value || '',
            microchipId: $('microchipId').value.trim()
        };

        if (!animal.name) {
            fail('animalName', 'Animal name is required.');
        }
    }

    if (!valid) {
        const firstError = document.querySelector(
            '#ownerRegistrationForm .input-error'
        );

        if (firstError) firstError.focus();
        return;
    }

    const submitBtn = $('saveRecordSubmitBtn');

    if (submitBtn) {
        submitBtn.disabled = true;
    }

    try {
        if (isEditing) {
            const updates = {
                contact,
                lastName,
                firstName,
                middleInitial,
                suffix,
                municipality,
                barangay,
                photo: state.formPhoto
            };

            await updateOwnerRecord(
                editingId,
                updates,
                currentOfficer
            );

            if (ownerDatabase[editingId]) {
                Object.assign(ownerDatabase[editingId], updates);
            }

            showToast('Owner record updated.');
        } else {
            const key = nextOwnerKey();
            const regId = $('regId').value;

            const newRecord = {
                regId,
                lastName,
                firstName,
                middleInitial,
                suffix,
                contact,
                street: $('street')?.value.trim() || '',
                barangay,
                municipality,
                province: currentOfficer?.address?.province || '',
                region: currentOfficer?.address?.region || '',
                zipCode: $('zipCode')?.value.trim() || '',
                photo: state.formPhoto,

                animals: [{
                    regId: `${regId}-A1`,
                    name: animal.name,
                    species: animal.species,
                    breed: animal.breed,
                    sex: animal.sex,
                    neutered: animal.neutered,
                    status: animal.status,
                    lastVax: animal.lastVax,
                    microchipId: animal.microchipId
                }]
            };

            await createOwnerRecord(
                key,
                newRecord,
                currentOfficer
            );

            ownerDatabase[key] = newRecord;

            showToast('Owner registered successfully.');
        }

        closeOverlay($('addOwnerModal'));
        refreshRegistry();

    } catch (err) {
        console.error('Error saving owner record:', err);
        showToast('Failed to save owner record to Firestore.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
        }
    }
}

function handlePhotoFile(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Please choose an image file.');
        return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
        showToast('The image must be 5 MB or smaller.');
        return;
    }

    const reader = new FileReader();

    reader.onload = () => {
        setPhotoPreview(reader.result);
    };

    reader.readAsDataURL(file);
}

async function openCamera() {
    const errorEl = $('cameraError');
    errorEl.textContent = '';

    openOverlay($('cameraModal'));

    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {
        errorEl.textContent =
            'This browser cannot access a camera here. Use Upload to add a photo instead.';
        return;
    }

    try {
        state.cameraStream =
            await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: false
            });

        const video = $('cameraVideo');
        video.srcObject = state.cameraStream;

        await video.play();

    } catch {
        stopCamera();

        errorEl.textContent =
            'Camera access was denied or no camera was found. Use Upload to add a photo instead.';
    }
}

function captureCamera() {
    const video = $('cameraVideo');

    if (!state.cameraStream || !video.videoWidth) {
        showToast('The camera is not ready yet.');
        return;
    }

    const canvas = $('cameraCanvas');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    canvas.getContext('2d').drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
    );

    setPhotoPreview(
        canvas.toDataURL('image/jpeg', 0.92)
    );

    closeOverlay($('cameraModal'));
    showToast('Photo captured.');
}

function stopCamera() {
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(
            (track) => track.stop()
        );

        state.cameraStream = null;
    }

    const video = $('cameraVideo');

    if (video) {
        video.srcObject = null;
    }
}/* ======================================================================
   9. EXPORT (EXCEL) & PRINT
   ====================================================================== */

function exportExcel() {
    const ids = getVisibleOwnerIds();

    if (!ids.length) {
        showToast('There are no records to export.');
        return;
    }

    const headers = [
        'Registration ID',
        'Last Name',
        'First Name',
        'Middle Initial',
        'Suffix',
        'Contact No.',
        'Municipality',
        'Barangay',
        'Animal Reg. ID',
        'Animal Name',
        'Species',
        'Breed',
        'Sex',
        'Reproductive Status',
        'Vaccination Status',
        'Last Vaccination Date',
        'Microchip / Tag ID'
    ];

    const rows = [];

    ids.forEach((id) => {
        const o = ownerDatabase[id];

        const base = [
            o.regId,
            o.lastName,
            o.firstName,
            o.middleInitial,
            o.suffix,
            o.contact,
            o.municipality,
            o.barangay
        ];

        if (!o.animals.length) {
            rows.push([
                ...base,
                '', '', '', '', '', '', '', '', ''
            ]);
        }

        o.animals.forEach((a) => {
            rows.push([
                ...base,
                a.regId,
                a.name,
                a.species,
                a.breed,
                a.sex,
                a.neutered,
                a.status,
                a.lastVax,
                a.microchipId
            ]);
        });
    });

    const table = `
        <table>
            <thead>
                <tr>
                    ${headers.map(
                        (h) => `<th>${esc(h)}</th>`
                    ).join('')}
                </tr>
            </thead>

            <tbody>
                ${rows.map((r) => `
                    <tr>
                        ${r.map(
                            (c) => `<td>${esc(c)}</td>`
                        ).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    const html = `
        <html
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:x="urn:schemas-microsoft-com:office:excel"
            xmlns="http://www.w3.org/TR/REC-html40">

            <head>
                <meta charset="UTF-8">

                <style>
                    th {
                        font-weight: bold;
                        background: #FFE3B3;
                    }
                </style>
            </head>

            <body>
                ${table}
            </body>
        </html>
    `;

    const blob = new Blob(
        ['\ufeff', html],
        {
            type: 'application/vnd.ms-excel;charset=utf-8'
        }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download =
        `LGU_Animal_Registry_${new Date().toISOString().slice(0, 10)}.xls`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 0);

    showToast(`Exported ${ids.length} record(s).`);
}

function printRegistry() {
    if ($('printDate')) {
        $('printDate').textContent =
            new Date().toLocaleString();
    }

    window.print();
}

function printOwnerFile() {
    if (!state.activeOwnerId) return;

    if ($('ownerPrintDate')) {
        $('ownerPrintDate').textContent =
            new Date().toLocaleString();
    }

    document.body.classList.add('print-owner-file');
    window.print();
}

/* ======================================================================
   10. EVENT WIRING & INITIALIZATION
   ====================================================================== */

function bindEvents() {

    // Search
    $('searchInput')?.addEventListener(
        'input',
        renderTable
    );

    // Filters
    [
        'filterMunicipality',
        'filterSpecies',
        'filterVaxStatus'
    ].forEach((id) => {
        $(id)?.addEventListener(
            'change',
            renderTable
        );
    });

    // Clear filters
    $('clearFiltersBtn')?.addEventListener('click', () => {
        if ($('searchInput')) {
            $('searchInput').value = '';
        }

        if ($('filterMunicipality')) {
            $('filterMunicipality').value =
                currentOfficer?.municipality ||
                currentOfficer?.address?.municipality ||
                '';
        }

        if ($('filterSpecies')) {
            $('filterSpecies').value = '';
        }

        if ($('filterVaxStatus')) {
            $('filterVaxStatus').value = '';
        }

        renderTable();
    });

    // Table sorting
    document.querySelector('.data-table thead')
        ?.addEventListener('click', (e) => {

            const btn = e.target.closest('.sort-btn');
            if (!btn) return;

            const col = Number(btn.dataset.sort);

            if (state.sortColumn === col) {
                state.sortAscending = !state.sortAscending;
            } else {
                state.sortColumn = col;
                state.sortAscending = true;
            }

            renderTable();
        });

    // Registry table actions
    $('registryTableBody')?.addEventListener(
        'click',
        (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            if (btn.dataset.action === 'view') {
                openOwnerFile(btn.dataset.id);
            }

            if (btn.dataset.action === 'edit') {
                openEditOwnerModal(btn.dataset.id);
            }
        }
    );

    // Main registry actions
    $('openAddOwnerModal')?.addEventListener(
        'click',
        openAddOwnerModal
    );

    $('exportExcel')?.addEventListener(
        'click',
        exportExcel
    );

    $('printRegistry')?.addEventListener(
        'click',
        printRegistry
    );

    // Owner profile modal
    $('closeProfileModalBtn')?.addEventListener(
        'click',
        () => closeOverlay($('ownerProfileModal'))
    );

    $('cancelProfileModalBtn')?.addEventListener(
        'click',
        () => closeOverlay($('ownerProfileModal'))
    );

    $('printOwnerFileBtn')?.addEventListener(
        'click',
        printOwnerFile
    );

    $('switchToEditFromViewBtn')?.addEventListener(
        'click',
        () => {
            const id = state.activeOwnerId;

            closeOverlay($('ownerProfileModal'));

            if (id) {
                openEditOwnerModal(id);
            }
        }
    );

    // Animal profile actions
    $('addAnimalProfileFieldBtn')?.addEventListener(
        'click',
        () => openAnimalProfileModal('add')
    );

    $('animalProfilesListContainer')?.addEventListener(
        'click',
        handleAnimalAction
    );

    // Animal profile modal
    $('closeAnimalModalBtn')?.addEventListener(
        'click',
        () => closeOverlay($('animalProfileModal'))
    );

    $('cancelAnimalModalBtn')?.addEventListener(
        'click',
        () => closeOverlay($('animalProfileModal'))
    );

    $('animalProfileForm')?.addEventListener(
        'submit',
        saveAnimalProfile
    );

    // Vaccination modal
    $('closeVaxModalBtn')?.addEventListener(
        'click',
        () => closeOverlay($('vaccinationModal'))
    );

    $('cancelVaxModalBtn')?.addEventListener(
        'click',
        () => closeOverlay($('vaccinationModal'))
    );

    $('vaccinationForm')?.addEventListener(
        'submit',
        saveVaccination
    );

    // Delete confirmation
    $('cancelDeleteBtn')?.addEventListener(
        'click',
        () => closeOverlay($('confirmDeleteModal'))
    );

    $('confirmDeleteBtn')?.addEventListener(
        'click',
        confirmDeleteAnimal
    );

    // Add/edit owner modal
    $('closeAddModalBtn')?.addEventListener(
        'click',
        () => closeOverlay($('addOwnerModal'))
    );

    $('cancelAddModalBtn')?.addEventListener(
        'click',
        () => closeOverlay($('addOwnerModal'))
    );

    $('ownerRegistrationForm')?.addEventListener(
        'submit',
        handleFormSubmit
    );

    // Photo upload
    $('uploadPhotoBtn')?.addEventListener(
        'click',
        () => $('ownerPhotoInput').click()
    );

    $('ownerPhotoInput')?.addEventListener(
        'change',
        (e) => {
            handlePhotoFile(e.target.files[0]);
            e.target.value = '';
        }
    );

    $('removePhotoBtn')?.addEventListener(
        'click',
        () => setPhotoPreview('')
    );

    // Camera
    $('openCameraBtn')?.addEventListener(
        'click',
        openCamera
    );

    $('captureBtn')?.addEventListener(
        'click',
        captureCamera
    );

    $('cancelCameraBtn')?.addEventListener(
        'click',
        () => closeOverlay($('cameraModal'))
    );

    $('closeCameraBtn')?.addEventListener(
        'click',
        () => closeOverlay($('cameraModal'))
    );

    // Click outside modal to close
    document.querySelectorAll('.modal-overlay')
        .forEach((overlay) => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    closeOverlay(overlay);
                }
            });
        });

    // Escape key closes the topmost modal
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;

        const stack = [
            'confirmDeleteModal',
            'cameraModal',
            'vaccinationModal',
            'animalProfileModal',
            'addOwnerModal',
            'ownerProfileModal'
        ];

        const top = stack
            .map((id) => $(id))
            .find((el) =>
                el && el.classList.contains('active')
            );

        if (top) {
            closeOverlay(top);
        }
    });

    // Restore page class after printing
    window.addEventListener('afterprint', () => {
        document.body.classList.remove('print-owner-file');
    });
}

/* ======================================================================
   11. AUTHENTICATION & MUNICIPALITY-SCOPED DATA LOADING
   ====================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    bindEvents();

    setPhotoPreview('');

    // Clear the table before authenticated data is loaded.
    ownerDatabase = {};
    registeredMunicipalities = [];
    currentOfficer = null;

    refreshRegistry();

    onAuthStateChanged(auth, async (user) => {

        // Clear previously loaded records immediately.
        currentOfficer = null;
        ownerDatabase = {};
        registeredMunicipalities = [];

        refreshRegistry();

        // Do not use localStorage as a substitute for Firebase Auth.
        if (!user) {
            showToast('Please log in to access the LGU Animal Registry.');
            return;
        }

        try {
            // First, identify the authenticated officer.
            const officer = await fetchCurrentLguOfficer(user.uid);

            if (!officer) {
                throw new Error(
                    'No LGU officer profile was found for this account.'
                );
            }

            // Determine the municipality assigned to the officer.
            const municipality =
                officer.municipality ||
                officer.address?.municipality ||
                '';

            if (!municipality) {
                throw new Error(
                    'Your LGU account has no assigned municipality.'
                );
            }

            // Keep the authenticated UID as the officer ID.
            currentOfficer = {
                ...officer,
                id: user.uid,
                municipality
            };

            renderOfficerHeader();

            // Load only the municipality-specific registry records.
            const records = await fetchAnimalRegistryRecords(
                municipality
            );

            ownerDatabase = records;

            // Municipality reference data is not used to broaden access.
            registeredMunicipalities = [];

            refreshRegistry();

            console.log(
                `LGU Animal Registry loaded for: ${municipality}`
            );

        } catch (err) {
            console.error(
                'Error loading Animal Registry records:',
                err
            );

            currentOfficer = null;
            ownerDatabase = {};
            registeredMunicipalities = [];

            refreshRegistry();

            showToast(
                err.message ||
                'Failed to load animal registry records from Firestore.'
            );
        }
    });
});