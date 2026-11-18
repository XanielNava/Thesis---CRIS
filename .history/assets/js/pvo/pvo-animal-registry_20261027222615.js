/* ==========================================================================
   PVO ANIMAL REGISTRY — page script

   Sections
     1. Reference data (species, statuses, municipalities, sample records)
     2. State
     3. Helpers
     4. Sidebar, toast, and modal control
     5. Municipality dropdowns
     6. Summary statistics
     7. Registry table: filtering, sorting, rendering
     8. Owner file (view modal) and animal profiles
     9. Owner form (add / edit) and validation
    10. Photo upload and camera capture
    11. Export (Excel) and print
    12. Event wiring
    13. Initialization
   ========================================================================== */
(function () {
    'use strict';

    /* ======================================================================
       1. REFERENCE DATA
       ====================================================================== */

    const SPECIES = ['Dog', 'Cat', 'Other'];
    const VAX_STATUSES = ['Vaccinated', 'Unvaccinated', 'Overdue'];
    const REPRO_STATUSES = ['Intact', 'Castrated', 'Spayed'];
    const SEX_OPTIONS = ['Male', 'Female'];
    const REGION_LABEL = 'Region VI';
    const PROVINCE_LABEL = 'Iloilo';

    const MUNICIPALITY_GROUPS = [
        { label: 'Highly Urbanized City', items: ['Iloilo City'] },
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

    // Sample records (in-memory only)
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
                { regId: "REG-2026-1001-A1", name: "Browny", species: "Dog", otherSpecies: "", breed: "Aspin", sex: "Male", neutered: "Castrated", status: "Vaccinated", lastVax: "2026-01-15", microchipId: "TAG-9901" }
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
                { regId: "REG-2026-1002-A1", name: "Mimi", species: "Cat", otherSpecies: "", breed: "Persian", sex: "Female", neutered: "Spayed", status: "Vaccinated", lastVax: "2026-02-10", microchipId: "" },
                { regId: "REG-2026-1002-A2", name: "Tiger", species: "Cat", otherSpecies: "", breed: "Domestic Shorthair", sex: "Male", neutered: "Intact", status: "Overdue", lastVax: "2025-03-12", microchipId: "" }
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
            barangay: "Mandurriao",
            municipality: "Iloilo City",
            zipCode: "5000",
            photo: "",
            animals: [
                { regId: "REG-2026-1003-A1", name: "Coco", species: "Dog", otherSpecies: "", breed: "Poodle", sex: "Female", neutered: "Spayed", status: "Vaccinated", lastVax: "2026-04-01", microchipId: "TAG-1042" }
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
        cameraStream: null
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

    const speciesLabel = (animal) =>
        animal.species === 'Other' ? (animal.otherSpecies || 'Other') : animal.species;

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

    /* ======================================================================
       4. SIDEBAR, TOAST, AND MODAL CONTROL
       ====================================================================== */

    function initSidebar() {
        const sidebar = $('sidebar');
        const toggle = $('sidebarToggle');

        const apply = (collapsed) => {
            sidebar.classList.toggle('collapsed', collapsed);
            toggle.setAttribute('aria-expanded', String(!collapsed));
        };

        apply(localStorage.getItem('sidebarCollapsed') === 'true');

        toggle.addEventListener('click', () => {
            const collapsed = !sidebar.classList.contains('collapsed');
            apply(collapsed);
            localStorage.setItem('sidebarCollapsed', String(collapsed));
        });
    }

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
        el.classList.remove('active');
        el.setAttribute('aria-hidden', 'true');
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
        const species = [...new Set(o.animals.map(speciesLabel))];
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
       8. OWNER FILE (VIEW MODAL) AND ANIMAL PROFILES
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
        const speciesOptions = SPECIES.map((s) =>
            `<option value="${s}" ${animal.species === s ? 'selected' : ''}>${s}</option>`).join('');
        const reproOptions = REPRO_STATUSES.map((s) =>
            `<option value="${s}" ${animal.neutered === s ? 'selected' : ''}>${s}</option>`).join('');
        const vaxOptions = VAX_STATUSES.map((s) =>
            `<option value="${s}" ${animal.status === s ? 'selected' : ''}>${s}</option>`).join('');
        const sexOptions = SEX_OPTIONS.map((s) =>
            `<option value="${s}" ${animal.sex === s ? 'selected' : ''}>${s}</option>`).join('');
        const otherHidden = animal.species === 'Other' ? '' : 'hidden';
        const lastVax = animal.lastVax && animal.lastVax !== 'N/A' ? animal.lastVax : '';

        return `
            <div class="animal-profile-card">
                <div class="animal-profile-title">
                    <span><i class="fa-solid fa-paw"></i> Animal ${index + 1}: ${esc(animal.name || 'Unnamed')}</span>
                    <span class="reg-tag">Reg ID: <strong>${esc(animal.regId)}</strong></span>
                </div>

                <div class="form-grid quad-grid mb-10">
                    <div class="input-group">
                        <label for="pa-name-${index}">Animal Name</label>
                        <input id="pa-name-${index}" type="text" value="${esc(animal.name)}" data-animal-field="name" data-index="${index}">
                    </div>
                    <div class="input-group">
                        <label for="pa-species-${index}">Species</label>
                        <select id="pa-species-${index}" data-species-select data-index="${index}">${speciesOptions}</select>
                    </div>
                    <div class="input-group ${otherHidden}" data-other-group>
                        <label for="pa-other-${index}">Specified Species</label>
                        <input id="pa-other-${index}" type="text" value="${esc(animal.otherSpecies)}" placeholder="e.g. Rabbit" data-animal-field="otherSpecies" data-index="${index}">
                    </div>
                    <div class="input-group">
                        <label for="pa-breed-${index}">Breed</label>
                        <input id="pa-breed-${index}" type="text" value="${esc(animal.breed)}" data-animal-field="breed" data-index="${index}">
                    </div>
                    <div class="input-group">
                        <label for="pa-sex-${index}">Sex</label>
                        <select id="pa-sex-${index}" data-animal-field="sex" data-index="${index}">${sexOptions}</select>
                    </div>
                </div>

                <div class="form-grid quad-grid">
                    <div class="input-group">
                        <label for="pa-repro-${index}">Reproductive Status</label>
                        <select id="pa-repro-${index}" data-animal-field="neutered" data-index="${index}">${reproOptions}</select>
                    </div>
                    <div class="input-group">
                        <label for="pa-vax-${index}">Vaccination Status</label>
                        <select id="pa-vax-${index}" data-animal-field="status" data-index="${index}">${vaxOptions}</select>
                    </div>
                    <div class="input-group">
                        <label for="pa-lastvax-${index}">Last Vaccination Date</label>
                        <input id="pa-lastvax-${index}" type="date" value="${esc(lastVax)}" data-animal-field="lastVax" data-index="${index}">
                    </div>
                    <div class="input-group">
                        <label for="pa-chip-${index}">Microchip / Tag ID</label>
                        <input id="pa-chip-${index}" type="text" value="${esc(animal.microchipId)}" placeholder="Tag ID" data-animal-field="microchipId" data-index="${index}">
                    </div>
                </div>
            </div>`;
    }

    function renderAnimalCards(owner) {
        const container = $('animalProfilesListContainer');
        container.innerHTML = owner.animals.length
            ? owner.animals.map(animalCardHTML).join('')
            : '<p class="muted">No animals registered for this owner yet.</p>';
    }

    function handleAnimalChange(event) {
        const target = event.target;
        const owner = ownerDatabase[state.activeOwnerId];
        if (!owner) return;

        const index = Number(target.dataset.index);
        const animal = owner.animals[index];
        if (!animal) return;

        if (target.hasAttribute('data-species-select')) {
            animal.species = target.value;
            if (target.value !== 'Other') animal.otherSpecies = '';

            const card = target.closest('.animal-profile-card');
            const group = card.querySelector('[data-other-group]');
            const otherInput = group.querySelector('input');
            group.classList.toggle('hidden', target.value !== 'Other');
            otherInput.value = animal.otherSpecies;
        } else if (target.dataset.animalField) {
            const field = target.dataset.animalField;
            const value = target.value.trim();
            animal[field] = field === 'lastVax' ? (value || 'N/A') : value;
        } else {
            return;
        }

        refreshRegistry();
        showToast('Animal profile updated.');
    }

    function addAnimalProfile() {
        const owner = ownerDatabase[state.activeOwnerId];
        if (!owner) return;

        owner.animals.push({
            regId: `${owner.regId}-A${owner.animals.length + 1}`,
            name: '',
            species: 'Dog',
            otherSpecies: '',
            breed: '',
            sex: 'Male',
            neutered: 'Intact',
            status: 'Unvaccinated',
            lastVax: 'N/A',
            microchipId: ''
        });

        renderAnimalCards(owner);
        refreshRegistry();

        const cards = $('animalProfilesListContainer').querySelectorAll('.animal-profile-card');
        const newCard = cards[cards.length - 1];
        if (newCard) {
            newCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            newCard.querySelector('input').focus();
        }
        showToast('New animal profile added.');
    }

    /* ======================================================================
       9. OWNER FORM (ADD / EDIT) AND VALIDATION
       ====================================================================== */

    function showError(fieldId, message) {
        const field = $(fieldId);
        const msg = $(`${fieldId}Error`);
        if (field) field.classList.add('input-error');
        if (msg) msg.textContent = message;
    }

    function clearFormErrors() {
        document.querySelectorAll('#ownerRegistrationForm .input-error')
            .forEach((el) => el.classList.remove('input-error'));
        document.querySelectorAll('#ownerRegistrationForm .error-msg')
            .forEach((el) => { el.textContent = ''; });
    }

    function syncOtherSpecies() {
        const select = $('species');
        const group = $('otherSpeciesGroup');
        const input = $('otherSpecies');
        const isOther = select.value === 'Other';

        group.classList.toggle('hidden', !isOther);
        input.required = isOther;
        if (!isOther) input.value = '';
    }

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
        clearFormErrors();
        $('ownerRegistrationForm').reset();
        $('editingOwnerId').value = '';
        $('addOwnerModalTitle').innerHTML = '<i class="fa-solid fa-id-card"></i> Register New Owner';
        $('saveRecordSubmitBtn').textContent = 'Save Entry';
        $('primaryAnimalSection').hidden = false;
        $('regId').value = nextRegId();
        setPhotoPreview('');
        syncOtherSpecies();
        openOverlay($('addOwnerModal'));
        $('contactNumber').focus();
    }

    function openEditOwnerModal(ownerId) {
        const o = ownerDatabase[ownerId];
        if (!o) return;

        clearFormErrors();
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
        clearFormErrors();

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
            showError(id, message);
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
                otherSpecies: $('otherSpecies').value.trim(),
                breed: $('breed').value.trim(),
                sex: $('sex').value,
                neutered: $('neutered').value,
                status: $('vaccinationStatus').value,
                lastVax: $('lastVaxDate').value || 'N/A',
                microchipId: $('microchipId').value.trim()
            };

            if (!animal.name) fail('animalName', 'Animal name is required.');
            if (animal.species === 'Other' && !animal.otherSpecies) {
                fail('otherSpecies', 'Please specify the animal species.');
            }
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
                    otherSpecies: animal.species === 'Other' ? animal.otherSpecies : '',
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
       10. PHOTO UPLOAD AND CAMERA CAPTURE
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
       11. EXPORT (EXCEL) AND PRINT
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
            'Animal Reg. ID', 'Animal Name', 'Species', 'Other Species', 'Breed', 'Sex',
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
                rows.push([...base, '', '', '', '', '', '', '', '', '', '']);
            }
            o.animals.forEach((a) => {
                rows.push([
                    ...base, a.regId, a.name, a.species, a.otherSpecies, a.breed, a.sex,
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
        link.download = `PVO_Animal_Registry_${new Date().toISOString().slice(0, 10)}.xls`;
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

    /* ======================================================================
       12. EVENT WIRING
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
        $('switchToEditFromViewBtn').addEventListener('click', () => {
            const id = state.activeOwnerId;
            closeOverlay($('ownerProfileModal'));
            if (id) openEditOwnerModal(id);
        });
        $('addAnimalProfileFieldBtn').addEventListener('click', addAnimalProfile);
        $('animalProfilesListContainer').addEventListener('change', handleAnimalChange);

        // Add / edit owner form
        $('closeAddModalBtn').addEventListener('click', () => closeOverlay($('addOwnerModal')));
        $('cancelAddModalBtn').addEventListener('click', () => closeOverlay($('addOwnerModal')));
        $('species').addEventListener('change', syncOtherSpecies);
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
            const stack = ['cameraModal', 'addOwnerModal', 'ownerProfileModal'];
            const top = stack.map((id) => $(id)).find((el) => el.classList.contains('active'));
            if (top) closeOverlay(top);
        });

        // Logout
        $('logout-btn').addEventListener('click', () => {
            window.location.href = 'pvo-login.html';
        });
    }

    /* ======================================================================
       13. INITIALIZATION
       ====================================================================== */

    document.addEventListener('DOMContentLoaded', () => {
        initSidebar();
        populateMunicipalities();
        bindEvents();
        setPhotoPreview('');
        syncOtherSpecies();
        refreshRegistry();
    });
})();