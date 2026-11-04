/* ==========================================================================
   LGU ANIMAL REGISTRY — page script

   Sections
     1. Reference data
     2. State
     3. Helpers
     4. Sidebar, toast, and modal control
     5. Municipality dropdowns
     6. Summary statistics
     7. Registry table: filtering, sorting, rendering
     8. Owner file (view modal) and animal cards
     9. Animal profile modal (add / edit animal)
    10. Update vaccination modal
    11. Delete confirmation
    12. Owner form (add / edit) and validation
    13. Photo upload and camera capture
    14. Export (Excel) and print
    15. Event wiring
    16. Initialization
   ========================================================================== */
(function () {
    'use strict';

    /* ======================================================================
       1. REFERENCE DATA
       ====================================================================== */

    const SPECIES = ['Dog', 'Cat'];
    const VAX_STATUSES = ['Vaccinated', 'Unvaccinated', 'Overdue'];
    const REPRO_STATUSES = ['Intact', 'Castrated', 'Spayed'];
    const SEX_OPTIONS = ['Male', 'Female'];
    const REGION_LABEL = 'Region VI';
    const PROVINCE_LABEL = 'Iloilo';

    const MUNICIPALITY_GROUPS = [
        { label: 'Component City', items: ['Passi City'] },
        {
            label: 'Municipalities',
            items: [
                'Ajuy', 'Alimodian', 'Anilao', 'Badiangan', 'Balasan', 'Banate',
                'Barotac Nuevo', 'Barotac Viejo', 'Batad', 'Bingawan', 'Cabatuan',
                'Calinog', 'Carles', 'Concepcion', 'Dingle', 'Dueñas', 'Dumangas',
                'Estancia', 'Guimbal', 'Igbaras', 'Janiuay', 'Lambunao', 'Leganes',
                'Lemery', 'Leon', 'Maasin', 'Miagao', 'Mina', 'New Lucena', 'Oton',
                'Pavia', 'Pototan', 'San Dionisio', 'San Enrique', 'San Joaquin',
                'San Miguel', 'San Rafael', 'Santa Barbara', 'Sara', 'Tigbauan',
                'Tubungan', 'Zarraga'
            ]
        }
    ];

    const PH_MOBILE_PATTERN = /^09\d{2}-?\d{3}-?\d{4}$/;
    const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

    // Sample records (in-memory only; nothing is saved to a server)
    const ownerDatabase = {
        "OWN-001": {
            regId: "REG-2026-1001",
            lastName: "Dela Cruz",
            firstName: "Juan",
            middleInitial: "S.",
            suffix: "",
            contact: "0917-123-4567",
            street: "Block 4 Lot 12",
            barangay: "Poblacion Zone 1",
            municipality: "Santa Barbara",
            zipCode: "5002",
            photo: "",
            animals: [
                { regId: "REG-2026-1001-A1", name: "Browny", species: "Dog", breed: "Aspin", sex: "Male", neutered: "Castrated", status: "Vaccinated", lastVax: "2026-01-15", microchipId: "TAG-9901" }
            ]
        },
        "OWN-002": {
            regId: "REG-2026-1002",
            lastName: "Limosnero",
            firstName: "John Rheb",
            middleInitial: "B.",
            suffix: "",
            contact: "0928-555-0192",
            street: "Purok 3",
            barangay: "Ungka",
            municipality: "Pavia",
            zipCode: "5001",
            photo: "",
            animals: [
                { regId: "REG-2026-1002-A1", name: "Mimi", species: "Cat", breed: "Persian", sex: "Female", neutered: "Spayed", status: "Vaccinated", lastVax: "2026-02-10", microchipId: "" },
                { regId: "REG-2026-1002-A2", name: "Tiger", species: "Cat", breed: "Domestic Shorthair", sex: "Male", neutered: "Intact", status: "Overdue", lastVax: "2025-03-12", microchipId: "" }
            ]
        },
        "OWN-003": {
            regId: "REG-2026-1003",
            lastName: "Guancia",
            firstName: "Shenna Jane",
            middleInitial: "M.",
            suffix: "",
            contact: "0919-888-3411",
            street: "St. Jude Village",
            barangay: "Poblacion",
            municipality: "Oton",
            zipCode: "5020",
            photo: "",
            animals: [
                { regId: "REG-2026-1003-A1", name: "Coco", species: "Dog", breed: "Poodle", sex: "Female", neutered: "Spayed", status: "Vaccinated", lastVax: "2026-04-01", microchipId: "TAG-1042" }
            ]
        }
    };

    /* ======================================================================
       2. STATE
       ====================================================================== */

    const state = {
        activeOwnerId: null,
        sortColumn: -1,
        sortAscending: true,
        formPhoto: '',
        cameraStream: null,
        animalMode: 'add',   // 'add' or 'edit' for the animal profile modal
        animalIndex: -1,     // animal being edited
        vaxIndex: -1,        // animal whose vaccination is being updated
        deleteIndex: -1      // animal pending deletion
    };

    /* ======================================================================
       3. HELPERS
       ====================================================================== */

    const $ = (id) => document.getElementById(id);

    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const ownerName = (o) =>
        [`${o.lastName}, ${o.firstName}`, o.middleInitial, o.suffix].filter(Boolean).join(' ');

    const initials = (o) =>
        `${(o.firstName || '').charAt(0)}${(o.lastName || '').charAt(0)}`.toUpperCase();

    const hasDate = (value) => Boolean(value) && value !== 'N/A';

    const VAX_CLASS = { Vaccinated: 'vax-ok', Unvaccinated: 'vax-none', Overdue: 'vax-overdue' };
    const vaxBadge = (status) => `<span class="vax-badge ${VAX_CLASS[status] || ''}">${esc(status)}</span>`;

    function nextRegId() {
        const max = Object.values(ownerDatabase).reduce((m, o) => {
            const n = parseInt(o.regId.split('-').pop(), 10);
            return Number.isNaN(n) ? m : Math.max(m, n);
        }, 1000);
        return `REG-${new Date().getFullYear()}-${max + 1}`;
    }

    function nextOwnerKey() {
        const max = Object.keys(ownerDatabase).reduce((m, key) => {
            const n = parseInt(key.split('-')[1], 10);
            return Number.isNaN(n) ? m : Math.max(m, n);
        }, 0);
        return `OWN-${String(max + 1).padStart(3, '0')}`;
    }

    // Next animal Registration ID, based on the highest existing number.
    // Stays unique after a profile has been deleted.
    function nextAnimalRegId(owner) {
        const max = owner.animals.reduce((m, a) => {
            const n = parseInt(String(a.regId).split('-A').pop(), 10);
            return Number.isNaN(n) ? m : Math.max(m, n);
        }, 0);
        return `${owner.regId}-A${max + 1}`;
    }

    /* ======================================================================
       4. SIDEBAR, TOAST, AND MODAL CONTROL
       ====================================================================== */
       
    let toastTimer = null;

    function showToast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
    }

    function openOverlay(el) {
        el.classList.add('active');
        el.setAttribute('aria-hidden', 'false');
    }

    function closeOverlay(el) {
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
            .forEach((el) => { el.textContent = ''; });
    }

    function showFieldError(fieldId, message) {
        const field = $(fieldId);
        const msg = $(`${fieldId}Error`);
        if (field) field.classList.add('input-error');
        if (msg) msg.textContent = message;
    }

    /* ======================================================================
       5. MUNICIPALITY DROPDOWNS
       ====================================================================== */

    function populateMunicipalities() {
        ['municipality', 'filterMunicipality'].forEach((id) => {
            const select = $(id);
            MUNICIPALITY_GROUPS.forEach((group) => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = group.label;
                group.items.forEach((name) => optgroup.appendChild(new Option(name, name)));
                select.appendChild(optgroup);
            });
        });
    }

    /* ======================================================================
       6. SUMMARY STATISTICS
       ====================================================================== */

    function renderStats() {
        const owners = Object.values(ownerDatabase);
        const animals = owners.flatMap((o) => o.animals);
        const vaccinated = animals.filter((a) => a.status === 'Vaccinated').length;

        $('statOwners').textContent = owners.length;
        $('statAnimals').textContent = animals.length;
        $('statVaccinated').textContent = vaccinated;
        $('statAttention').textContent = animals.length - vaccinated;
    }

    /* ======================================================================
       7. REGISTRY TABLE: FILTERING, SORTING, RENDERING
       ====================================================================== */

    function matchesFilters(owner) {
        const q = $('searchInput').value.trim().toLowerCase();
        const muni = $('filterMunicipality').value;
        const species = $('filterSpecies').value;
        const vax = $('filterVaxStatus').value;

        const searchable = [
            owner.regId, owner.lastName, owner.firstName, owner.middleInitial,
            `${owner.firstName} ${owner.lastName}`
        ].join(' ').toLowerCase();

        return (!q || searchable.includes(q))
            && (!muni || owner.municipality === muni)
            && (!species || owner.animals.some((a) => a.species === species))
            && (!vax || owner.animals.some((a) => a.status === vax));
    }

    const SORT_VALUE = {
        0: (o) => o.regId,
        1: (o) => ownerName(o).toLowerCase(),
        2: (o) => o.municipality,
        3: (o) => o.animals.length
    };

    function getVisibleOwnerIds() {
        const ids = Object.keys(ownerDatabase).filter((id) => matchesFilters(ownerDatabase[id]));

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
        const species = [...new Set(o.animals.map((a) => a.species))];
        const chips = species.map((s) => `<span class="species-chip">${esc(s)}</span>`).join('');

        return `
            <tr data-owner-id="${esc(id)}">
                <td class="col-reg-id">${esc(o.regId)}</td>
                <td>
                    <div class="owner-cell">
                        ${ownerAvatar(o)}
                        <div class="owner-text">
                            <button type="button" class="owner-name-btn" data-action="view" data-id="${esc(id)}" title="Open owner file">${esc(name)}</button>
                            <small>${esc(o.contact)}</small>
                        </div>
                    </div>
                </td>
                <td>${esc(o.municipality)}</td>
                <td class="col-center">
                    <span class="badge-count">${o.animals.length} Animal(s)</span>
                    <div class="species-chips">${chips}</div>
                </td>
                <td class="col-center">
                    <div class="action-btn-group">
                        <button type="button" class="btn-table-action btn-table-view" data-action="view" data-id="${esc(id)}" aria-label="View ${esc(name)}">
                            <i class="fa-solid fa-eye"></i> View
                        </button>
                        <button type="button" class="btn-table-action btn-table-edit" data-action="edit" data-id="${esc(id)}" aria-label="Edit ${esc(name)}">
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

            th.setAttribute('aria-sort', active ? (state.sortAscending ? 'ascending' : 'descending') : 'none');

            let iconClass = 'fa-sort';
            if (active) iconClass = state.sortAscending ? 'fa-sort-up' : 'fa-sort-down';
            icon.className = `fa-solid ${iconClass} sort-icon`;
        });
    }

    function renderTable() {
        const tbody = $('registryTableBody');
        const ids = getVisibleOwnerIds();
        const total = Object.keys(ownerDatabase).length;

        tbody.innerHTML = ids.length
            ? ids.map(rowHTML).join('')
            : `<tr><td colspan="5" class="empty-row">
                    <i class="fa-solid fa-folder-open"></i>
                    <span>No owner records match the current search or filters.</span>
               </td></tr>`;

        $('resultCount').textContent = `Showing ${ids.length} of ${total} record(s)`;
        updateSortIndicators();
    }

    function refreshRegistry() {
        renderStats();
        renderTable();
    }

    /* ======================================================================
       8. OWNER FILE (VIEW MODAL) AND ANIMAL CARDS
       ====================================================================== */

    function openOwnerFile(ownerId) {
        const o = ownerDatabase[ownerId];
        if (!o) return;

        state.activeOwnerId = ownerId;

        const photo = $('profilePhoto');
        photo.innerHTML = o.photo
            ? `<img src="${esc(o.photo)}" alt="Owner photo">`
            : '<i class="fa-solid fa-user"></i>';

        $('profileName').textContent = ownerName(o);
        $('profileRegId').textContent = `Registration ID: ${o.regId}`;

        $('viewRegId').value = o.regId;
        $('viewContact').value = o.contact;
        $('viewLastName').value = o.lastName;
        $('viewFirstName').value = o.firstName;
        $('viewMiddleInitial').value = o.middleInitial || 'N/A';
        $('viewSuffix').value = o.suffix || 'N/A';
        $('viewStreet').value = o.street;
        $('viewBarangay').value = o.barangay;
        $('viewMunicipality').value = o.municipality;
        $('viewZipCode').value = o.zipCode;

        renderAnimalCards(o);
        openOverlay($('ownerProfileModal'));
    }

    function animalCardHTML(animal, index) {
        const lastVax = hasDate(animal.lastVax) ? animal.lastVax : '—';
        const detail = (label, value) => `
            <div class="detail-item">
                <span class="detail-label">${label}</span>
                <span class="detail-value">${esc(value || '—')}</span>
            </div>`;

        return `
            <div class="animal-profile-card">
                <div class="animal-profile-title">
                    <span><i class="fa-solid fa-paw"></i> Animal ${index + 1}: ${esc(animal.name || 'Unnamed')}</span>
                    <div class="animal-card-tools no-print">
                        <span class="reg-tag">Reg ID: <strong>${esc(animal.regId)}</strong></span>
                        <button type="button" class="btn-animal-action btn-animal-edit" data-action="edit-animal" data-index="${index}"
                                aria-label="Edit profile of animal ${index + 1}">
                            <i class="fa-solid fa-pen-to-square"></i> Edit Animal Profile
                        </button>
                        <button type="button" class="btn-animal-action btn-animal-vax" data-action="update-vax" data-index="${index}"
                                aria-label="Update vaccination of animal ${index + 1}">
                            <i class="fa-solid fa-syringe"></i> Update Vaccination
                        </button>
                        <button type="button" class="btn-delete-animal" data-action="delete-animal" data-index="${index}"
                                aria-label="Delete animal profile ${index + 1}">
                            <i class="fa-solid fa-trash-can"></i> Delete
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
        container.innerHTML = owner.animals.length
            ? owner.animals.map(animalCardHTML).join('')
            : '<p class="muted">No animals registered for this owner yet.</p>';
    }

    // Routes the Edit Animal Profile, Update Vaccination, and Delete buttons.
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
    }

    /* ======================================================================
       9. ANIMAL PROFILE MODAL (ADD / EDIT ANIMAL)
       ====================================================================== */

    function openAnimalProfileModal(mode, index = -1) {
        const owner = ownerDatabase[state.activeOwnerId];
        if (!owner) return;

        const animal = mode === 'edit' ? owner.animals[index] : null;
        if (mode === 'edit' && !animal) return;

        state.animalMode = mode;
        state.animalIndex = index;

        clearErrors('animalProfileForm');
        $('animalProfileForm').reset();

        const isEdit = mode === 'edit';
        $('animalProfileModalTitle').innerHTML = isEdit
            ? '<i class="fa-solid fa-pen-to-square"></i> Edit Animal Profile'
            : '<i class="fa-solid fa-plus"></i> Add Animal Profile';
        $('saveAnimalBtn').textContent = isEdit ? 'Save Changes' : 'Add Animal';

        $('apName').value = animal ? animal.name : '';
        $('apSpecies').value = animal ? animal.species : 'Dog';
        $('apBreed').value = animal ? animal.breed : '';
        $('apSex').value = animal ? animal.sex : 'Male';
        $('apRepro').value = animal ? animal.neutered : 'Intact';
        $('apMicrochip').value = animal ? animal.microchipId : '';

        openOverlay($('animalProfileModal'));
        $('apName').focus();
    }

    function saveAnimalProfile(event) {
        event.preventDefault();
        clearErrors('animalProfileForm');

        const owner = ownerDatabase[state.activeOwnerId];
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

        if (state.animalMode === 'edit') {
            const animal = owner.animals[state.animalIndex];
            if (!animal) return;
            Object.assign(animal, data);
            showToast('Animal profile updated.');
        } else {
            owner.animals.push({
                regId: nextAnimalRegId(owner),
                ...data,
                breed: data.breed || 'Mixed',
                status: 'Unvaccinated',
                lastVax: 'N/A'
            });
            showToast('Animal profile added.');
        }

        closeOverlay($('animalProfileModal'));
        renderAnimalCards(owner);
        refreshRegistry();
    }

    /* ======================================================================
       10. UPDATE VACCINATION MODAL
       ====================================================================== */

    function openVaccinationModal(index) {
        const owner = ownerDatabase[state.activeOwnerId];
        const animal = owner && owner.animals[index];
        if (!animal) return;

        state.vaxIndex = index;
        clearErrors('vaccinationForm');

        $('vaxAnimalName').textContent = `${animal.name || 'Unnamed'} · Reg ID ${animal.regId} · ${animal.species}`;
        $('vaxStatus').value = animal.status;
        $('vaxDate').value = hasDate(animal.lastVax) ? animal.lastVax : '';

        openOverlay($('vaccinationModal'));
        $('vaxStatus').focus();
    }

    function saveVaccination(event) {
        event.preventDefault();
        clearErrors('vaccinationForm');

        const owner = ownerDatabase[state.activeOwnerId];
        const animal = owner && owner.animals[state.vaxIndex];
        if (!animal) return;

        const status = $('vaxStatus').value;
        const date = $('vaxDate').value;

        if (status === 'Vaccinated' && !date) {
            showFieldError('vaxDate', 'Enter the date of the latest vaccination.');
            $('vaxDate').focus();
            return;
        }

        animal.status = status;
        animal.lastVax = date || 'N/A';

        closeOverlay($('vaccinationModal'));
        renderAnimalCards(owner);
        refreshRegistry();
        showToast('Vaccination record updated.');
    }

    /* ======================================================================
       11. DELETE CONFIRMATION
       ====================================================================== */

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

    function confirmDeleteAnimal() {
        const owner = ownerDatabase[state.activeOwnerId];
        const index = state.deleteIndex;
        const animal = owner && owner.animals[index];

        closeOverlay($('confirmDeleteModal'));
        if (!animal) return;

        owner.animals.splice(index, 1);
        renderAnimalCards(owner);
        refreshRegistry();
        showToast('Animal profile deleted.');
    }

    /* ======================================================================
       12. OWNER FORM (ADD / EDIT) AND VALIDATION
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
        $('removePhotoBtn').disabled = !state.formPhoto;
    }

    function openAddOwnerModal() {
        clearErrors('ownerRegistrationForm');
        $('ownerRegistrationForm').reset();
        $('editingOwnerId').value = '';
        $('addOwnerModalTitle').innerHTML = '<i class="fa-solid fa-id-card"></i> Register New Owner';
        $('saveRecordSubmitBtn').textContent = 'Save Entry';
        $('primaryAnimalSection').hidden = false;
        $('regId').value = nextRegId();
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
        $('addOwnerModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Registered Owner';
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

    function handleFormSubmit(event) {
        event.preventDefault();
        clearErrors('ownerRegistrationForm');

        const editingId = $('editingOwnerId').value;
        const isEditing = editingId !== '';

        const contact = $('contactNumber').value.trim();
        const lastName = $('lastName').value.trim();
        const firstName = $('firstName').value.trim();
        const middleInitial = $('middleInitial').value.trim().toUpperCase();
        const suffix = $('suffix').value;
        const municipality = $('municipality').value;
        const barangay = $('barangay').value.trim();

        let valid = true;
        const fail = (id, message) => {
            showFieldError(id, message);
            valid = false;
        };

        if (!contact) fail('contactNumber', 'Contact number is required.');
        else if (!PH_MOBILE_PATTERN.test(contact)) fail('contactNumber', 'Use the format 09XX-XXX-XXXX.');
        if (!lastName) fail('lastName', 'Last name is required.');
        if (!firstName) fail('firstName', 'First name is required.');
        if (middleInitial.length > 3) fail('middleInitial', 'Maximum of 3 characters.');
        if (!municipality) fail('municipality', 'Select a municipality.');
        if (!barangay) fail('barangay', 'Barangay is required.');

        let animal = null;
        if (!isEditing) {
            animal = {
                name: $('animalName').value.trim(),
                species: $('species').value,
                breed: $('breed').value.trim(),
                sex: $('sex').value,
                neutered: $('neutered').value,
                status: $('vaccinationStatus').value,
                lastVax: $('lastVaxDate').value || 'N/A',
                microchipId: $('microchipId').value.trim()
            };

            if (!animal.name) fail('animalName', 'Animal name is required.');
        }

        if (!valid) {
            const firstError = document.querySelector('#ownerRegistrationForm .input-error');
            if (firstError) firstError.focus();
            return;
        }

        if (isEditing) {
            const o = ownerDatabase[editingId];
            if (o) {
                Object.assign(o, {
                    contact, lastName, firstName, middleInitial, suffix,
                    municipality, barangay, photo: state.formPhoto
                });
            }
            showToast('Owner record updated.');
        } else {
            const key = nextOwnerKey();
            const regId = $('regId').value;

            ownerDatabase[key] = {
                regId,
                lastName,
                firstName,
                middleInitial,
                suffix,
                contact,
                street: 'N/A',
                barangay,
                municipality,
                zipCode: '5000',
                photo: state.formPhoto,
                animals: [{
                    regId: `${regId}-A1`,
                    name: animal.name,
                    species: animal.species,
                    breed: animal.breed || 'Mixed',
                    sex: animal.sex,
                    neutered: animal.neutered,
                    status: animal.status,
                    lastVax: animal.lastVax,
                    microchipId: animal.microchipId
                }]
            };
            showToast('Owner registered successfully.');
        }

        closeOverlay($('addOwnerModal'));
        refreshRegistry();
    }

    /* ======================================================================
       13. PHOTO UPLOAD AND CAMERA CAPTURE
       ====================================================================== */

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
        reader.onload = () => setPhotoPreview(reader.result);
        reader.readAsDataURL(file);
    }

    async function openCamera() {
        const errorEl = $('cameraError');
        errorEl.textContent = '';
        openOverlay($('cameraModal'));

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            errorEl.textContent = 'This browser cannot access a camera here. Use Upload to add a photo instead.';
            return;
        }

        try {
            state.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: false
            });
            const video = $('cameraVideo');
            video.srcObject = state.cameraStream;
            await video.play();
        } catch (err) {
            stopCamera();
            errorEl.textContent = 'Camera access was denied or no camera was found. Use Upload to add a photo instead.';
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
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

        setPhotoPreview(canvas.toDataURL('image/jpeg', 0.92));
        closeOverlay($('cameraModal'));
        showToast('Photo captured.');
    }

    function stopCamera() {
        if (state.cameraStream) {
            state.cameraStream.getTracks().forEach((track) => track.stop());
            state.cameraStream = null;
        }
        const video = $('cameraVideo');
        if (video) video.srcObject = null;
    }

    /* ======================================================================
       14. EXPORT (EXCEL) AND PRINT
       ====================================================================== */

    function exportExcel() {
        const ids = getVisibleOwnerIds();
        if (!ids.length) {
            showToast('There are no records to export.');
            return;
        }

        const headers = [
            'Registration ID', 'Last Name', 'First Name', 'Middle Initial', 'Suffix',
            'Contact No.', 'Region', 'Province', 'Municipality', 'Barangay',
            'Animal Reg. ID', 'Animal Name', 'Species', 'Breed', 'Sex',
            'Reproductive Status', 'Vaccination Status', 'Last Vaccination Date', 'Microchip / Tag ID'
        ];

        const rows = [];
        ids.forEach((id) => {
            const o = ownerDatabase[id];
            const base = [
                o.regId, o.lastName, o.firstName, o.middleInitial, o.suffix,
                o.contact, REGION_LABEL, PROVINCE_LABEL, o.municipality, o.barangay
            ];

            if (!o.animals.length) {
                rows.push([...base, '', '', '', '', '', '', '', '', '']);
            }
            o.animals.forEach((a) => {
                rows.push([
                    ...base, a.regId, a.name, a.species, a.breed, a.sex,
                    a.neutered, a.status, a.lastVax, a.microchipId
                ]);
            });
        });

        const table = `
            <table>
                <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
                <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>`;

        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
                xmlns:x="urn:schemas-microsoft-com:office:excel"
                xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="UTF-8">
            <style>th { font-weight: bold; background: #FFE3B3; }</style>
            </head><body>${table}</body></html>`;

        const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `LGU_Animal_Registry_${new Date().toISOString().slice(0, 10)}.xls`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);

        showToast(`Exported ${ids.length} record(s).`);
    }

    function printRegistry() {
        $('printDate').textContent = new Date().toLocaleString();
        window.print();
    }

    // Prints only the open owner file (the Print button in its header).
    function printOwnerFile() {
        if (!state.activeOwnerId) return;
        $('ownerPrintDate').textContent = new Date().toLocaleString();
        document.body.classList.add('print-owner-file');
        window.print();
    }

    /* ======================================================================
       15. EVENT WIRING
       ====================================================================== */

    function bindEvents() {
        // Search, filters, and sorting
        $('searchInput').addEventListener('input', renderTable);
        ['filterMunicipality', 'filterSpecies', 'filterVaxStatus'].forEach((id) => {
            $(id).addEventListener('change', renderTable);
        });

        $('clearFiltersBtn').addEventListener('click', () => {
            $('searchInput').value = '';
            $('filterMunicipality').value = '';
            $('filterSpecies').value = '';
            $('filterVaxStatus').value = '';
            renderTable();
        });

        document.querySelector('.data-table thead').addEventListener('click', (e) => {
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

        // Table row actions
        $('registryTableBody').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            if (btn.dataset.action === 'view') openOwnerFile(btn.dataset.id);
            if (btn.dataset.action === 'edit') openEditOwnerModal(btn.dataset.id);
        });

        // Toolbar actions
        $('openAddOwnerModal').addEventListener('click', openAddOwnerModal);
        $('exportExcel').addEventListener('click', exportExcel);
        $('printRegistry').addEventListener('click', printRegistry);

        // Owner file modal
        $('closeProfileModalBtn').addEventListener('click', () => closeOverlay($('ownerProfileModal')));
        $('cancelProfileModalBtn').addEventListener('click', () => closeOverlay($('ownerProfileModal')));
        $('printOwnerFileBtn').addEventListener('click', printOwnerFile);
        $('switchToEditFromViewBtn').addEventListener('click', () => {
            const id = state.activeOwnerId;
            closeOverlay($('ownerProfileModal'));
            if (id) openEditOwnerModal(id);
        });
        $('addAnimalProfileFieldBtn').addEventListener('click', () => openAnimalProfileModal('add'));
        $('animalProfilesListContainer').addEventListener('click', handleAnimalAction);

        // Animal profile modal
        $('closeAnimalModalBtn').addEventListener('click', () => closeOverlay($('animalProfileModal')));
        $('cancelAnimalModalBtn').addEventListener('click', () => closeOverlay($('animalProfileModal')));
        $('animalProfileForm').addEventListener('submit', saveAnimalProfile);

        // Update vaccination modal
        $('closeVaxModalBtn').addEventListener('click', () => closeOverlay($('vaccinationModal')));
        $('cancelVaxModalBtn').addEventListener('click', () => closeOverlay($('vaccinationModal')));
        $('vaccinationForm').addEventListener('submit', saveVaccination);

        // Delete confirmation
        $('cancelDeleteBtn').addEventListener('click', () => closeOverlay($('confirmDeleteModal')));
        $('confirmDeleteBtn').addEventListener('click', confirmDeleteAnimal);

        // Add / edit owner form
        $('closeAddModalBtn').addEventListener('click', () => closeOverlay($('addOwnerModal')));
        $('cancelAddModalBtn').addEventListener('click', () => closeOverlay($('addOwnerModal')));
        $('ownerRegistrationForm').addEventListener('submit', handleFormSubmit);

        // Photo controls
        $('uploadPhotoBtn').addEventListener('click', () => $('ownerPhotoInput').click());
        $('ownerPhotoInput').addEventListener('change', (e) => {
            handlePhotoFile(e.target.files[0]);
            e.target.value = '';
        });
        $('removePhotoBtn').addEventListener('click', () => setPhotoPreview(''));
        $('openCameraBtn').addEventListener('click', openCamera);
        $('captureBtn').addEventListener('click', captureCamera);
        $('cancelCameraBtn').addEventListener('click', () => closeOverlay($('cameraModal')));
        $('closeCameraBtn').addEventListener('click', () => closeOverlay($('cameraModal')));

        // Backdrop click closes the modal
        document.querySelectorAll('.modal-overlay').forEach((overlay) => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeOverlay(overlay);
            });
        });

        // Escape closes the topmost modal
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const stack = [
                'confirmDeleteModal', 'cameraModal', 'vaccinationModal',
                'animalProfileModal', 'addOwnerModal', 'ownerProfileModal'
            ];
            const top = stack.map((id) => $(id)).find((el) => el.classList.contains('active'));
            if (top) closeOverlay(top);
        });

        // Clear the owner-file print mode after printing
        window.addEventListener('afterprint', () => {
            document.body.classList.remove('print-owner-file');
        });

        // Logout
        $('logout-btn').addEventListener('click', () => {
            window.location.href = 'lgu-login.html';
        });
    }

    /* ======================================================================
       16. INITIALIZATION
       ====================================================================== */

    document.addEventListener('DOMContentLoaded', () => {
        populateMunicipalities();
        bindEvents();
        setPhotoPreview('');
        refreshRegistry();
    });
})();