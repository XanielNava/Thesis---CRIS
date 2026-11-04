import { 
    fetchAllOwners, 
    saveNewOwner, 
    updateOwner, 
    updateOwnerAnimals 
} from '../db/pvo-AR-db.js';

(function () {
    'use strict';

    /* ======================================================================
       1. REFERENCE CONSTANTS
       ====================================================================== */

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
    const REGION_LABEL = 'Region VI';
    const PROVINCE_LABEL = 'Iloilo';

    // Live store populated dynamically from Firestore
    let ownerDatabase = {};

    /* ======================================================================
       2. STATE
       ====================================================================== */

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
       3. HELPERS
       ====================================================================== */

    const $ = (id) => document.getElementById(id);
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const ownerName = (o) => [`${o.lastName}, ${o.firstName}`, o.middleInitial, o.suffix].filter(Boolean).join(' ');
    const initials = (o) => `${(o.firstName || '').charAt(0)}${(o.lastName || '').charAt(0)}`.toUpperCase();
    const hasDate = (value) => Boolean(value) && value !== 'N/A';
    const VAX_CLASS = { Vaccinated: 'vax-ok', Unvaccinated: 'vax-none', Overdue: 'vax-overdue' };
    const vaxBadge = (status) => `<span class="vax-badge ${VAX_CLASS[status] || ''}">${esc(status)}</span>`;

    function nextRegId() {
        const max = Object.values(ownerDatabase).reduce((m, o) => {
            const parts = String(o.regId || '').split('-');
            const n = parseInt(parts[parts.length - 1], 10);
            return Number.isNaN(n) ? m : Math.max(m, n);
        }, 1000);
        return `REG-${new Date().getFullYear()}-${max + 1}`;
    }

    function nextAnimalRegId(owner) {
        const animals = owner.animals || [];
        const max = animals.reduce((m, a) => {
            const n = parseInt(String(a.regId).split('-A').pop(), 10);
            return Number.isNaN(n) ? m : Math.max(m, n);
        }, 0);
        return `${owner.regId}-A${max + 1}`;
    }

    /* ======================================================================
       4. OVERLAYS, MODALS, AND TOASTS
       ====================================================================== */

    let toastTimer = null;
    function showToast(message) {
        const el = $('toast');
        if (!el) return;
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
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
        document.querySelectorAll(`#${formId} .input-error`).forEach((el) => el.classList.remove('input-error'));
        document.querySelectorAll(`#${formId} .error-msg`).forEach((el) => { el.textContent = ''; });
    }

    function showFieldError(fieldId, message) {
        const field = $(fieldId);
        const msg = $(`${fieldId}Error`);
        if (field) field.classList.add('input-error');
        if (msg) msg.textContent = message;
    }

    /* ======================================================================
       5. SUMMARY STATS & FILTERS
       ====================================================================== */

    function populateMunicipalities() {
        ['municipality', 'filterMunicipality'].forEach((id) => {
            const select = $(id);
            if (!select) return;
            MUNICIPALITY_GROUPS.forEach((group) => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = group.label;
                group.items.forEach((name) => optgroup.appendChild(new Option(name, name)));
                select.appendChild(optgroup);
            });
        });
    }

    function renderStats() {
        const owners = Object.values(ownerDatabase);
        const animals = owners.flatMap((o) => o.animals || []);
        const vaccinated = animals.filter((a) => a.status === 'Vaccinated').length;

        if ($('statOwners')) $('statOwners').textContent = owners.length;
        if ($('statAnimals')) $('statAnimals').textContent = animals.length;
        if ($('statVaccinated')) $('statVaccinated').textContent = vaccinated;
        if ($('statAttention')) $('statAttention').textContent = animals.length - vaccinated;
    }

    function matchesFilters(owner) {
        const q = $('searchInput') ? $('searchInput').value.trim().toLowerCase() : '';
        const muni = $('filterMunicipality') ? $('filterMunicipality').value : '';
        const species = $('filterSpecies') ? $('filterSpecies').value : '';
        const vax = $('filterVaxStatus') ? $('filterVaxStatus').value : '';

        const searchable = [
            owner.regId, owner.lastName, owner.firstName, owner.middleInitial,
            `${owner.firstName} ${owner.lastName}`
        ].join(' ').toLowerCase();

        const animals = owner.animals || [];
        return (!q || searchable.includes(q))
            && (!muni || owner.municipality === muni)
            && (!species || animals.some((a) => a.species === species))
            && (!vax || animals.some((a) => a.status === vax));
    }

    const SORT_VALUE = {
        0: (o) => o.regId || '',
        1: (o) => ownerName(o).toLowerCase(),
        2: (o) => o.municipality || '',
        3: (o) => (o.animals || []).length
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
        const animals = o.animals || [];
        const species = [...new Set(animals.map((a) => a.species))];
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
                    <span class="badge-count">${animals.length} Animal(s)</span>
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

            if (th) th.setAttribute('aria-sort', active ? (state.sortAscending ? 'ascending' : 'descending') : 'none');
            if (icon) {
                let iconClass = 'fa-sort';
                if (active) iconClass = state.sortAscending ? 'fa-sort-up' : 'fa-sort-down';
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
            : `<tr><td colspan="5" class="empty-row">
                    <i class="fa-solid fa-folder-open"></i>
                    <span>No owner records found in the registry.</span>
               </td></tr>`;

        if ($('resultCount')) $('resultCount').textContent = `Showing ${ids.length} of ${total} record(s)`;
        updateSortIndicators();
    }

    async function reloadFromFirestore() {
        const tbody = $('registryTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-row"><i class="fa-solid fa-spinner fa-spin"></i><span>Loading live records from CRIS Registry...</span></td></tr>`;
        }
        try {
            ownerDatabase = await fetchAllOwners();
            renderStats();
            renderTable();
        } catch (err) {
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="5" class="empty-row error-msg"><span>Failed to load registry: ${esc(err.message)}</span></td></tr>`;
            }
        }
    }

    /* ======================================================================
       6. OWNER PROFILE & ANIMAL CARDS
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

        if ($('profileName')) $('profileName').textContent = ownerName(o);
        if ($('profileRegId')) $('profileRegId').textContent = `Registration ID: ${o.regId}`;

        if ($('viewRegId')) $('viewRegId').value = o.regId;
        if ($('viewContact')) $('viewContact').value = o.contact;
        if ($('viewLastName')) $('viewLastName').value = o.lastName;
        if ($('viewFirstName')) $('viewFirstName').value = o.firstName;
        if ($('viewMiddleInitial')) $('viewMiddleInitial').value = o.middleInitial || 'N/A';
        if ($('viewSuffix')) $('viewSuffix').value = o.suffix || 'N/A';
        if ($('viewStreet')) $('viewStreet').value = o.street || 'N/A';
        if ($('viewBarangay')) $('viewBarangay').value = o.barangay;
        if ($('viewMunicipality')) $('viewMunicipality').value = o.municipality;
        if ($('viewZipCode')) $('viewZipCode').value = o.zipCode || '5000';

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
                        <button type="button" class="btn-animal-action btn-animal-edit" data-action="edit-animal" data-index="${index}" aria-label="Edit profile">
                            <i class="fa-solid fa-pen-to-square"></i> Edit Profile
                        </button>
                        <button type="button" class="btn-animal-action btn-animal-vax" data-action="update-vax" data-index="${index}" aria-label="Update vaccination">
                            <i class="fa-solid fa-syringe"></i> Update Vaccination
                        </button>
                        <button type="button" class="btn-delete-animal" data-action="delete-animal" data-index="${index}" aria-label="Delete animal profile">
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
        if (!container) return;
        const animals = owner.animals || [];
        container.innerHTML = animals.length
            ? animals.map(animalCardHTML).join('')
            : '<p class="muted">No animals registered for this owner yet.</p>';
    }

    function handleAnimalAction(event) {
        const btn = event.target.closest('[data-action]');
        if (!btn) return;
        const index = Number(btn.dataset.index);
        switch (btn.dataset.action) {
            case 'edit-animal': openAnimalProfileModal('edit', index); break;
            case 'update-vax': openVaccinationModal(index); break;
            case 'delete-animal': openDeleteConfirm(index); break;
        }
    }

    /* ======================================================================
       7. ANIMAL PROFILE MODAL (ADD / EDIT)
       ====================================================================== */

    function openAnimalProfileModal(mode, index = -1) {
        const owner = ownerDatabase[state.activeOwnerId];
        if (!owner) return;
        const animal = mode === 'edit' ? owner.animals[index] : null;

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

    async function saveAnimalProfile(event) {
        event.preventDefault();
        clearErrors('animalProfileForm');

        const owner = ownerDatabase[state.activeOwnerId];
        if (!owner) return;

        const name = $('apName').value.trim();
        if (!name) {
            showFieldError('apName', 'Animal name is required.');
            return;
        }

        const data = {
            name,
            species: $('apSpecies').value,
            breed: $('apBreed').value.trim() || 'Mixed',
            sex: $('apSex').value,
            neutered: $('apRepro').value,
            microchipId: $('apMicrochip').value.trim()
        };

        const animals = [...(owner.animals || [])];
        if (state.animalMode === 'edit') {
            Object.assign(animals[state.animalIndex], data);
        } else {
            animals.push({
                regId: nextAnimalRegId(owner),
                ...data,
                status: 'Unvaccinated',
                lastVax: 'N/A'
            });
        }

        try {
            $('saveAnimalBtn').disabled = true;
            await updateOwnerAnimals(state.activeOwnerId, animals);
            owner.animals = animals;
            closeOverlay($('animalProfileModal'));
            renderAnimalCards(owner);
            renderStats();
            renderTable();
            showToast(state.animalMode === 'edit' ? 'Animal profile updated.' : 'Animal profile added.');
        } catch (err) {
            showToast(`Save failed: ${err.message}`);
        } finally {
            $('saveAnimalBtn').disabled = false;
        }
    }

    /* ======================================================================
       8. VACCINATION & DELETE MODALS
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
    }

    async function saveVaccination(event) {
        event.preventDefault();
        clearErrors('vaccinationForm');

        const owner = ownerDatabase[state.activeOwnerId];
        const animal = owner && owner.animals[state.vaxIndex];
        if (!animal) return;

        const status = $('vaxStatus').value;
        const date = $('vaxDate').value;

        if (status === 'Vaccinated' && !date) {
            showFieldError('vaxDate', 'Enter the date of vaccination.');
            return;
        }

        const animals = [...owner.animals];
        animals[state.vaxIndex].status = status;
        animals[state.vaxIndex].lastVax = date || 'N/A';

        try {
            $('saveVaxBtn').disabled = true;
            await updateOwnerAnimals(state.activeOwnerId, animals);
            owner.animals = animals;
            closeOverlay($('vaccinationModal'));
            renderAnimalCards(owner);
            renderStats();
            renderTable();
            showToast('Vaccination updated.');
        } catch (err) {
            showToast(`Update failed: ${err.message}`);
        } finally {
            $('saveVaxBtn').disabled = false;
        }
    }

    function openDeleteConfirm(index) {
        const owner = ownerDatabase[state.activeOwnerId];
        const animal = owner && owner.animals[index];
        if (!animal) return;

        state.deleteIndex = index;
        $('confirmDeleteText').innerHTML = `Are you sure you want to delete <strong>${esc(animal.name)}</strong> (${esc(animal.regId)})?`;
        openOverlay($('confirmDeleteModal'));
    }

    async function confirmDeleteAnimal() {
        const owner = ownerDatabase[state.activeOwnerId];
        if (!owner) return;

        const animals = [...owner.animals];
        animals.splice(state.deleteIndex, 1);

        try {
            $('confirmDeleteBtn').disabled = true;
            await updateOwnerAnimals(state.activeOwnerId, animals);
            owner.animals = animals;
            closeOverlay($('confirmDeleteModal'));
            renderAnimalCards(owner);
            renderStats();
            renderTable();
            showToast('Animal profile deleted.');
        } catch (err) {
            showToast(`Delete failed: ${err.message}`);
        } finally {
            $('confirmDeleteBtn').disabled = false;
        }
    }

    /* ======================================================================
       9. OWNER REGISTRATION / EDIT MODAL
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
        $('middleInitial').value = o.middleInitial || '';
        $('suffix').value = o.suffix || '';
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
        const municipality = $('municipality').value;
        const barangay = $('barangay').value.trim();

        let valid = true;
        const fail = (id, message) => { showFieldError(id, message); valid = false; };

        if (!contact || !PH_MOBILE_PATTERN.test(contact)) fail('contactNumber', 'Use format 09XX-XXX-XXXX.');
        if (!lastName) fail('lastName', 'Last name is required.');
        if (!firstName) fail('firstName', 'First name is required.');
        if (!municipality) fail('municipality', 'Select a municipality.');
        if (!barangay) fail('barangay', 'Barangay is required.');

        let animal = null;
        if (!isEditing) {
            animal = {
                name: $('animalName').value.trim(),
                species: $('species').value,
                breed: $('breed').value.trim() || 'Mixed',
                sex: $('sex').value,
                neutered: $('neutered').value,
                status: $('vaccinationStatus').value,
                lastVax: $('lastVaxDate').value || 'N/A',
                microchipId: $('microchipId').value.trim()
            };
            if (!animal.name) fail('animalName', 'Animal name is required.');
        }

        if (!valid) return;

        try {
            $('saveRecordSubmitBtn').disabled = true;
            if (isEditing) {
                const updatedFields = {
                    contact, lastName, firstName, middleInitial, suffix,
                    municipality, barangay, photo: state.formPhoto
                };
                await updateOwner(editingId, updatedFields);
                Object.assign(ownerDatabase[editingId], updatedFields);
                showToast('Owner record updated.');
            } else {
                const regId = $('regId').value;
                const newRecord = {
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
                        ...animal
                    }]
                };
                const saved = await saveNewOwner(newRecord);
                ownerDatabase[saved.id] = saved;
                showToast('Owner registered successfully.');
            }
            closeOverlay($('addOwnerModal'));
            renderStats();
            renderTable();
        } catch (err) {
            showToast(`Error: ${err.message}`);
        } finally {
            $('saveRecordSubmitBtn').disabled = false;
        }
    }

    /* ======================================================================
       10. PHOTO UPLOAD & CAMERA
       ====================================================================== */

    function handlePhotoFile(file) {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast('Please choose an image file.');
            return;
        }
        if (file.size > MAX_PHOTO_BYTES) {
            showToast('Image must be under 5MB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => setPhotoPreview(reader.result);
        reader.readAsDataURL(file);
    }

    async function openCamera() {
        openOverlay($('cameraModal'));
        try {
            state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
            $('cameraVideo').srcObject = state.cameraStream;
        } catch (err) {
            $('cameraError').textContent = 'Camera unavailable or permission denied.';
        }
    }

    function captureCamera() {
        const video = $('cameraVideo');
        if (!video.videoWidth) return;
        const canvas = $('cameraCanvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        setPhotoPreview(canvas.toDataURL('image/jpeg', 0.9));
        closeOverlay($('cameraModal'));
    }

    function stopCamera() {
        if (state.cameraStream) {
            state.cameraStream.getTracks().forEach(t => t.stop());
            state.cameraStream = null;
        }
    }

    /* ======================================================================
       11. EXCEL EXPORT
       ====================================================================== */

    function exportExcel() {
        const ids = getVisibleOwnerIds();
        if (!ids.length) {
            showToast('No records to export.');
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
            const animals = o.animals || [];
            if (!animals.length) rows.push([...base, '', '', '', '', '', '', '', '', '']);
            animals.forEach(a => {
                rows.push([...base, a.regId, a.name, a.species, a.breed, a.sex, a.neutered, a.status, a.lastVax, a.microchipId]);
            });
        });

        const table = `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        const blob = new Blob(['\ufeff', table], { type: 'application/vnd.ms-excel;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Animal_Registry_${new Date().toISOString().slice(0, 10)}.xls`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast(`Exported ${ids.length} record(s).`);
    }

    /* ======================================================================
       12. EVENT BINDINGS & INIT
       ====================================================================== */

    function bindEvents() {
        $('searchInput')?.addEventListener('input', renderTable);
        ['filterMunicipality', 'filterSpecies', 'filterVaxStatus'].forEach(id => {
            $(id)?.addEventListener('change', renderTable);
        });

        $('clearFiltersBtn')?.addEventListener('click', () => {
            $('searchInput').value = '';
            $('filterMunicipality').value = '';
            $('filterSpecies').value = '';
            $('filterVaxStatus').value = '';
            renderTable();
        });

        document.querySelector('.data-table thead')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.sort-btn');
            if (!btn) return;
            const col = Number(btn.dataset.sort);
            if (state.sortColumn === col) state.sortAscending = !state.sortAscending;
            else { state.sortColumn = col; state.sortAscending = true; }
            renderTable();
        });

        $('registryTableBody')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            if (btn.dataset.action === 'view') openOwnerFile(btn.dataset.id);
            if (btn.dataset.action === 'edit') openEditOwnerModal(btn.dataset.id);
        });

        $('openAddOwnerModal')?.addEventListener('click', openAddOwnerModal);
        $('exportExcel')?.addEventListener('click', exportExcel);
        $('printRegistry')?.addEventListener('click', () => {
            if ($('printDate')) $('printDate').textContent = new Date().toLocaleString();
            window.print();
        });

        $('closeProfileModalBtn')?.addEventListener('click', () => closeOverlay($('ownerProfileModal')));
        $('cancelProfileModalBtn')?.addEventListener('click', () => closeOverlay($('ownerProfileModal')));
        $('printOwnerFileBtn')?.addEventListener('click', () => {
            if ($('ownerPrintDate')) $('ownerPrintDate').textContent = new Date().toLocaleString();
            document.body.classList.add('print-owner-file');
            window.print();
        });

        $('switchToEditFromViewBtn')?.addEventListener('click', () => {
            const id = state.activeOwnerId;
            closeOverlay($('ownerProfileModal'));
            if (id) openEditOwnerModal(id);
        });

        $('addAnimalProfileFieldBtn')?.addEventListener('click', () => openAnimalProfileModal('add'));
        $('animalProfilesListContainer')?.addEventListener('click', handleAnimalAction);

        $('closeAnimalModalBtn')?.addEventListener('click', () => closeOverlay($('animalProfileModal')));
        $('cancelAnimalModalBtn')?.addEventListener('click', () => closeOverlay($('animalProfileModal')));
        $('animalProfileForm')?.addEventListener('submit', saveAnimalProfile);

        $('closeVaxModalBtn')?.addEventListener('click', () => closeOverlay($('vaccinationModal')));
        $('cancelVaxModalBtn')?.addEventListener('click', () => closeOverlay($('vaccinationModal')));
        $('vaccinationForm')?.addEventListener('submit', saveVaccination);

        $('cancelDeleteBtn')?.addEventListener('click', () => closeOverlay($('confirmDeleteModal')));
        $('confirmDeleteBtn')?.addEventListener('click', confirmDeleteAnimal);

        $('closeAddModalBtn')?.addEventListener('click', () => closeOverlay($('addOwnerModal')));
        $('cancelAddModalBtn')?.addEventListener('click', () => closeOverlay($('addOwnerModal')));
        $('ownerRegistrationForm')?.addEventListener('submit', handleFormSubmit);

        $('uploadPhotoBtn')?.addEventListener('click', () => $('ownerPhotoInput').click());
        $('ownerPhotoInput')?.addEventListener('change', (e) => {
            handlePhotoFile(e.target.files[0]);
            e.target.value = '';
        });
        $('removePhotoBtn')?.addEventListener('click', () => setPhotoPreview(''));
        $('openCameraBtn')?.addEventListener('click', openCamera);
        $('captureBtn')?.addEventListener('click', captureCamera);
        $('cancelCameraBtn')?.addEventListener('click', () => closeOverlay($('cameraModal')));
        $('closeCameraBtn')?.addEventListener('click', () => closeOverlay($('cameraModal')));

        document.querySelectorAll('.modal-overlay').forEach(o => {
            o.addEventListener('click', (e) => { if (e.target === o) closeOverlay(o); });
        });

        window.addEventListener('afterprint', () => document.body.classList.remove('print-owner-file'));
    }

    document.addEventListener('DOMContentLoaded', () => {
        populateMunicipalities();
        bindEvents();
        setPhotoPreview('');
        reloadFromFirestore();
    });
})();