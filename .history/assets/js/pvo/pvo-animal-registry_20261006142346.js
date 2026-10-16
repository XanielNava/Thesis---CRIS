/**
 * PVO Animal Registry Module Script
 * Business Analytics Ready & Multi-Animal Profile Management
 */

// STRUCTURED OWNER DATABASE (BUSINESS ANALYTICS READY)
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
        animals: [
            { regId: "REG-2026-1003-A1", name: "Coco", species: "Dog", otherSpecies: "", breed: "Poodle", sex: "Female", neutered: "Spayed", status: "Vaccinated", lastVax: "2026-04-01", microchipId: "TAG-1042" }
        ]
    }
};

let activeOwnerId = null;
let currentSortColumn = -1;
let currentSortAscending = true;

document.addEventListener("DOMContentLoaded", () => {
    // --- SIDEBAR TOGGLE ---
    const sidebar = document.getElementById("sidebar");
    const sidebarToggle = document.getElementById("sidebarToggle");

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener("click", () => {
            sidebar.classList.toggle("collapsed");
            localStorage.setItem("sidebarCollapsed", sidebar.classList.contains("collapsed"));
        });
    }

    // --- INITIAL TABLE RENDER ---
    renderTableRows();

    // --- SEARCH AND FILTER LISTENERS ---
    document.getElementById("searchInput")?.addEventListener("input", filterAndSearchRegistry);
    document.getElementById("filterMunicipality")?.addEventListener("change", filterAndSearchRegistry);
    document.getElementById("filterSpecies")?.addEventListener("change", filterAndSearchRegistry);
    document.getElementById("filterVaxStatus")?.addEventListener("change", filterAndSearchRegistry);

    // --- OWNER PROFILE MODAL CLOSING ---
    const ownerProfileModal = document.getElementById("ownerProfileModal");
    const closeProfileModalBtn = document.getElementById("closeProfileModalBtn");
    const cancelProfileModalBtn = document.getElementById("cancelProfileModalBtn");

    const closeProfileModal = () => ownerProfileModal.classList.remove("active");
    if (closeProfileModalBtn) closeProfileModalBtn.addEventListener("click", closeProfileModal);
    if (cancelProfileModalBtn) cancelProfileModalBtn.addEventListener("click", closeProfileModal);

    // --- SWITCH TO EDIT FROM VIEW MODAL ---
    document.getElementById("switchToEditFromViewBtn")?.addEventListener("click", () => {
        if (!activeOwnerId) return;
        closeProfileModal();
        openEditOwnerModal(activeOwnerId);
    });

    // --- ADD ANOTHER ANIMAL PROFILE IN VIEW MODAL ---
    document.getElementById("addAnimalProfileFieldBtn")?.addEventListener("click", () => {
        if (!activeOwnerId || !ownerDatabase[activeOwnerId]) return;

        const owner = ownerDatabase[activeOwnerId];
        const nextIndex = owner.animals.length + 1;
        const newAnimal = {
            regId: `${owner.regId}-A${nextIndex}`,
            name: "",
            species: "Dog",
            otherSpecies: "",
            breed: "",
            sex: "Male",
            neutered: "Intact",
            status: "Vaccinated",
            lastVax: new Date().toISOString().split('T')[0],
            microchipId: ""
        };

        owner.animals.push(newAnimal);
        renderAnimalFields(owner.animals);
        renderTableRows();
    });

    // --- ADD / EDIT OWNER MODAL LOGIC ---
    const addOwnerModal = document.getElementById("addOwnerModal");
    const openAddOwnerModalBtn = document.getElementById("openAddOwnerModal");
    const closeAddModalBtn = document.getElementById("closeAddModalBtn");
    const cancelAddModalBtn = document.getElementById("cancelAddModalBtn");

    const openAddModal = () => {
        clearFormErrors();
        document.getElementById("ownerRegistrationForm").reset();
        document.getElementById("editingOwnerId").value = "";
        document.getElementById("addOwnerModalTitle").innerHTML = `<i class="fa-solid fa-id-card"></i> Register New Owner`;
        document.getElementById("saveRecordSubmitBtn").textContent = "Save Entry";
        document.getElementById("primaryAnimalSection").style.display = "block";
        
        // Generate new Registration ID
        document.getElementById("regId").value = `REG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        
        // Hide dynamic species group
        handleSpeciesChange("species", "otherSpeciesGroup", "otherSpecies");

        addOwnerModal.classList.add("active");
    };

    const closeAddModal = () => addOwnerModal.classList.remove("active");

    if (openAddOwnerModalBtn) openAddOwnerModalBtn.addEventListener("click", openAddModal);
    if (closeAddModalBtn) closeAddModalBtn.addEventListener("click", closeAddModal);
    if (cancelAddModalBtn) cancelAddModalBtn.addEventListener("click", closeAddModal);

    // --- REGISTRATION / EDIT FORM SUBMISSION ---
    const ownerRegistrationForm = document.getElementById("ownerRegistrationForm");
    if (ownerRegistrationForm) {
        ownerRegistrationForm.addEventListener("submit", handleFormSubmit);
    }
});

// --- RENDER REGISTRY TABLE ---
function renderTableRows() {
    const tbody = document.getElementById("registryTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    Object.keys(ownerDatabase).forEach(ownerId => {
        const owner = ownerDatabase[ownerId];
        const formattedName = `${owner.lastName}, ${owner.firstName} ${owner.middleInitial ? owner.middleInitial : ''} ${owner.suffix ? owner.suffix : ''}`.trim();
        const animalCount = owner.animals.length;

        const tr = document.createElement("tr");
        tr.setAttribute("data-owner-id", ownerId);
        tr.setAttribute("data-municipality", owner.municipality);

        tr.innerHTML = `
            <td class="col-reg-id">${owner.regId}</td>
            <td>
                <span class="clickable-owner" onclick="openOwnerProfileModal('${ownerId}')" title="Click to view full owner profile">
                    ${formattedName}
                </span>
            </td>
            <td style="text-align: center;">
                <span class="badge-count" id="badge-${ownerId}">${animalCount} Animal(s)</span>
            </td>
            <td style="text-align: center;">
                <div class="action-btn-group">
                    <button class="btn-table-action btn-table-view" onclick="openOwnerProfileModal('${ownerId}')" title="View Owner File" aria-label="View ${formattedName}">
                        <i class="fa-solid fa-eye"></i> View
                    </button>
                    <button class="btn-table-action btn-table-edit" onclick="openEditOwnerModal('${ownerId}')" title="Edit Owner Record" aria-label="Edit ${formattedName}">
                        <i class="fa-solid fa-pen-to-square"></i> Edit
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- DYNAMIC "OTHER" SPECIES HANDLER ---
function handleSpeciesChange(speciesSelectId, otherGroupContainerId, otherInputId) {
    const speciesSelect = document.getElementById(speciesSelectId);
    const otherGroup = document.getElementById(otherGroupContainerId);
    const otherInput = document.getElementById(otherInputId);

    if (!speciesSelect || !otherGroup) return;

    if (speciesSelect.value === "Other") {
        otherGroup.classList.remove("hidden");
        if (otherInput) otherInput.required = true;
    } else {
        otherGroup.classList.add("hidden");
        if (otherInput) {
            otherInput.required = false;
            otherInput.value = "";
        }
    }
}

// --- OPEN & POPULATE VIEW POPUP MODAL ---
function openOwnerProfileModal(ownerId) {
    activeOwnerId = ownerId;
    const owner = ownerDatabase[ownerId];
    if (!owner) return;

    // Fill Owner Demographics
    document.getElementById("viewRegId").value = owner.regId;
    document.getElementById("viewContact").value = owner.contact;
    document.getElementById("viewLastName").value = owner.lastName;
    document.getElementById("viewFirstName").value = owner.firstName;
    document.getElementById("viewMiddleInitial").value = owner.middleInitial || "N/A";
    document.getElementById("viewSuffix").value = owner.suffix || "N/A";
    document.getElementById("viewStreet").value = owner.street;
    document.getElementById("viewBarangay").value = owner.barangay;
    document.getElementById("viewMunicipality").value = owner.municipality;
    document.getElementById("viewZipCode").value = owner.zipCode;

    // Render Animal Fields
    renderAnimalFields(owner.animals);

    // Open Modal
    document.getElementById("ownerProfileModal").classList.add("active");
}

// RENDER ANIMAL PROFILES FOR CURRENT OWNER INSIDE VIEW MODAL
function renderAnimalFields(animals) {
    const container = document.getElementById("animalProfilesListContainer");
    if (!container) return;
    
    container.innerHTML = "";

    animals.forEach((animal, index) => {
        const card = document.createElement("div");
        card.className = "animal-profile-card";
        const speciesDisplay = animal.species === "Other" ? `Other (${animal.otherSpecies})` : animal.species;

        card.innerHTML = `
            <div class="animal-profile-title">
                <span><i class="fa-solid fa-paw"></i> Animal Profile #${index + 1} - ${animal.name}</span>
                <span style="font-size:0.8rem; font-weight:normal;">Reg ID: <strong>${animal.regId}</strong></span>
            </div>
            <div class="form-grid quad-grid mb-10">
                <div class="input-group">
                    <label>Animal Name</label>
                    <input type="text" value="${animal.name}" onchange="updateAnimalData('${activeOwnerId}', ${index}, 'name', this.value)">
                </div>
                <div class="input-group">
                    <label>Species</label>
                    <select id="viewModalSpecies_${index}" onchange="handleModalSpeciesChange('${activeOwnerId}', ${index}, this.value)">
                        <option value="Dog" ${animal.species === 'Dog' ? 'selected' : ''}>Dog</option>
                        <option value="Cat" ${animal.species === 'Cat' ? 'selected' : ''}>Cat</option>
                        <option value="Pig" ${animal.species === 'Pig' ? 'selected' : ''}>Pig</option>
                        <option value="Cattle" ${animal.species === 'Cattle' ? 'selected' : ''}>Cattle</option>
                        <option value="Goat" ${animal.species === 'Goat' ? 'selected' : ''}>Goat</option>
                        <option value="Other" ${animal.species === 'Other' ? 'selected' : ''}>Other</option>
                    </select>
                </div>
                <div class="input-group ${animal.species === 'Other' ? '' : 'hidden'}" id="viewModalOtherGroup_${index}">
                    <label>Specified Species</label>
                    <input type="text" value="${animal.otherSpecies || ''}" placeholder="Specify" onchange="updateAnimalData('${activeOwnerId}', ${index}, 'otherSpecies', this.value)">
                </div>
                <div class="input-group">
                    <label>Breed</label>
                    <input type="text" value="${animal.breed}" onchange="updateAnimalData('${activeOwnerId}', ${index}, 'breed', this.value)">
                </div>
                <div class="input-group">
                    <label>Sex</label>
                    <select onchange="updateAnimalData('${activeOwnerId}', ${index}, 'sex', this.value)">
                        <option value="Male" ${animal.sex === 'Male' ? 'selected' : ''}>Male</option>
                        <option value="Female" ${animal.sex === 'Female' ? 'selected' : ''}>Female</option>
                    </select>
                </div>
            </div>
            <div class="form-grid quad-grid">
                <div class="input-group">
                    <label>Reproductive Status</label>
                    <select onchange="updateAnimalData('${activeOwnerId}', ${index}, 'neutered', this.value)">
                        <option value="Intact" ${animal.neutered === 'Intact' ? 'selected' : ''}>Intact</option>
                        <option value="Castrated" ${animal.neutered === 'Castrated' ? 'selected' : ''}>Castrated</option>
                        <option value="Spayed" ${animal.neutered === 'Spayed' ? 'selected' : ''}>Spayed</option>
                    </select>
                </div>
                <div class="input-group">
                    <label>Vaccination Status</label>
                    <select onchange="updateAnimalData('${activeOwnerId}', ${index}, 'status', this.value)">
                        <option value="Vaccinated" ${animal.status === 'Vaccinated' ? 'selected' : ''}>Vaccinated</option>
                        <option value="Unvaccinated" ${animal.status === 'Unvaccinated' ? 'selected' : ''}>Unvaccinated</option>
                        <option value="Overdue" ${animal.status === 'Overdue' ? 'selected' : ''}>Overdue</option>
                    </select>
                </div>
                <div class="input-group">
                    <label>Last Vaccination Date</label>
                    <input type="date" value="${animal.lastVax !== 'N/A' ? animal.lastVax : ''}" onchange="updateAnimalData('${activeOwnerId}', ${index}, 'lastVax', this.value)">
                </div>
                <div class="input-group">
                    <label>Microchip / Tag ID</label>
                    <input type="text" value="${animal.microchipId || ''}" placeholder="Tag ID" onchange="updateAnimalData('${activeOwnerId}', ${index}, 'microchipId', this.value)">
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function handleModalSpeciesChange(ownerId, animalIndex, newSpecies) {
    const owner = ownerDatabase[ownerId];
    if (!owner) return;

    owner.animals[animalIndex].species = newSpecies;
    const otherGroup = document.getElementById(`viewModalOtherGroup_${animalIndex}`);

    if (newSpecies === "Other") {
        if (otherGroup) otherGroup.classList.remove("hidden");
    } else {
        if (otherGroup) otherGroup.classList.add("hidden");
        owner.animals[animalIndex].otherSpecies = "";
    }
}

function updateAnimalData(ownerId, animalIndex, field, value) {
    if (ownerDatabase[ownerId] && ownerDatabase[ownerId].animals[animalIndex]) {
        ownerDatabase[ownerId].animals[animalIndex][field] = value;
    }
}

// --- OPEN EDIT OWNER MODAL ---
function openEditOwnerModal(ownerId) {
    const owner = ownerDatabase[ownerId];
    if (!owner) return;

    clearFormErrors();
    document.getElementById("editingOwnerId").value = ownerId;
    document.getElementById("addOwnerModalTitle").innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit Registered Owner`;
    document.getElementById("saveRecordSubmitBtn").textContent = "Update Record";

    // Populate Fields
    document.getElementById("regId").value = owner.regId;
    document.getElementById("contactNumber").value = owner.contact;
    document.getElementById("lastName").value = owner.lastName;
    document.getElementById("firstName").value = owner.firstName;
    document.getElementById("middleInitial").value = owner.middleInitial;
    document.getElementById("suffix").value = owner.suffix;
    document.getElementById("municipality").value = owner.municipality;
    document.getElementById("barangay").value = owner.barangay;

    // Hide Primary Animal Section during Owner Edit to preserve separate pet records
    document.getElementById("primaryAnimalSection").style.display = "none";

    document.getElementById("addOwnerModal").classList.add("active");
}

// --- FORM SUBMISSION & VALIDATION ---
function handleFormSubmit(e) {
    e.preventDefault();
    clearFormErrors();

    const editingOwnerId = document.getElementById("editingOwnerId").value;
    const isEditing = editingOwnerId !== "";

    // Field Values
    const contact = document.getElementById("contactNumber").value.trim();
    const lastName = document.getElementById("lastName").value.trim();
    const firstName = document.getElementById("firstName").value.trim();
    const middleInitial = document.getElementById("middleInitial").value.trim().toUpperCase();
    const suffix = document.getElementById("suffix").value;
    const municipality = document.getElementById("municipality").value;
    const barangay = document.getElementById("barangay").value.trim();

    let isValid = true;

    // Validate Owner Demographics
    if (!contact) { showError("contactNumber", "Contact number is required."); isValid = false; }
    if (!lastName) { showError("lastName", "Last name is required."); isValid = false; }
    if (!firstName) { showError("firstName", "First name is required."); isValid = false; }
    if (middleInitial && middleInitial.length > 3) { showError("middleInitial", "Max 3 chars."); isValid = false; }
    if (!municipality) { showError("municipality", "Select municipality."); isValid = false; }
    if (!barangay) { showError("barangay", "Barangay is required."); isValid = false; }

    // Validate Animal Information if NOT editing
    let animalName, species, otherSpecies, breed, sex, neutered, vaccinationStatus, lastVaxDate, microchipId;
    if (!isEditing) {
        animalName = document.getElementById("animalName").value.trim();
        species = document.getElementById("species").value;
        otherSpecies = document.getElementById("otherSpecies").value.trim();
        breed = document.getElementById("breed").value.trim();
        sex = document.getElementById("sex").value;
        neutered = document.getElementById("neutered").value;
        vaccinationStatus = document.getElementById("vaccinationStatus").value;
        lastVaxDate = document.getElementById("lastVaxDate").value || "N/A";
        microchipId = document.getElementById("microchipId").value.trim();

        if (!animalName) { showError("animalName", "Animal name is required."); isValid = false; }
        if (species === "Other" && !otherSpecies) { showError("otherSpecies", "Specify custom species."); isValid = false; }
    }

    if (!isValid) return;

    if (isEditing) {
        // Update Existing Record
        const targetOwner = ownerDatabase[editingOwnerId];
        if (targetOwner) {
            targetOwner.contact = contact;
            targetOwner.lastName = lastName;
            targetOwner.firstName = firstName;
            targetOwner.middleInitial = middleInitial;
            targetOwner.suffix = suffix;
            targetOwner.municipality = municipality;
            targetOwner.barangay = barangay;
        }
    } else {
        // Create New Record
        const newOwnerKey = `OWN-00${Object.keys(ownerDatabase).length + 1}`;
        const newRegId = document.getElementById("regId").value;

        ownerDatabase[newOwnerKey] = {
            regId: newRegId,
            lastName: lastName,
            firstName: firstName,
            middleInitial: middleInitial,
            suffix: suffix,
            contact: contact,
            street: "N/A",
            barangay: barangay,
            municipality: municipality,
            zipCode: "5000",
            animals: [
                {
                    regId: `${newRegId}-A1`,
                    name: animalName,
                    species: species,
                    otherSpecies: species === "Other" ? otherSpecies : "",
                    breed: breed || "Mixed",
                    sex: sex,
                    neutered: neutered,
                    status: vaccinationStatus,
                    lastVax: lastVaxDate,
                    microchipId: microchipId
                }
            ]
        };
    }

    // Refresh UI & Close Modal
    renderTableRows();
    document.getElementById("addOwnerModal").classList.remove("active");
}

function showError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorSpan = document.getElementById(`${fieldId}Error`);
    if (field) field.classList.add("input-error");
    if (errorSpan) errorSpan.textContent = message;
}

function clearFormErrors() {
    document.querySelectorAll(".input-error").forEach(el => el.classList.remove("input-error"));
    document.querySelectorAll(".error-msg").forEach(el => el.textContent = "");
}

// --- BUSINESS ANALYTICS: SEARCH & MULTI-CATEGORY FILTERING ---
function filterAndSearchRegistry() {
    const searchText = document.getElementById("searchInput").value.toLowerCase().trim();
    const selectedMuni = document.getElementById("filterMunicipality").value;
    const selectedSpecies = document.getElementById("filterSpecies").value;
    const selectedVax = document.getElementById("filterVaxStatus").value;

    const rows = document.querySelectorAll("#registryTableBody tr");

    rows.forEach(row => {
        const ownerId = row.getAttribute("data-owner-id");
        const owner = ownerDatabase[ownerId];

        if (!owner) return;

        const fullName = `${owner.lastName} ${owner.firstName} ${owner.middleInitial}`.toLowerCase();
        const regIdMatches = owner.regId.toLowerCase().includes(searchText);
        const nameMatches = fullName.includes(searchText);
        const searchMatches = searchText === "" || regIdMatches || nameMatches;

        const muniMatches = selectedMuni === "" || owner.municipality === selectedMuni;

        const speciesMatches = selectedSpecies === "" || owner.animals.some(a => a.species === selectedSpecies);

        const vaxMatches = selectedVax === "" || owner.animals.some(a => a.status === selectedVax);

        if (searchMatches && muniMatches && speciesMatches && vaxMatches) {
            row.style.display = "";
        } else {
            row.style.display = "none";
        }
    });
}

// --- BUSINESS ANALYTICS: SORT TABLE COLUMNS ---
function sortTable(columnIndex) {
    const tbody = document.getElementById("registryTableBody");
    const rows = Array.from(tbody.querySelectorAll("tr"));

    if (currentSortColumn === columnIndex) {
        currentSortAscending = !currentSortAscending;
    } else {
        currentSortColumn = columnIndex;
        currentSortAscending = true;
    }

    rows.sort((a, b) => {
        let valA, valB;

        if (columnIndex === 0) {
            valA = a.children[0].textContent.trim();
            valB = b.children[0].textContent.trim();
        } else if (columnIndex === 1) {
            valA = a.children[1].textContent.trim();
            valB = b.children[1].textContent.trim();
        } else if (columnIndex === 2) {
            valA = parseInt(a.children[2].textContent.trim(), 10);
            valB = parseInt(b.children[2].textContent.trim(), 10);
        }

        if (valA < valB) return currentSortAscending ? -1 : 1;
        if (valA > valB) return currentSortAscending ? 1 : -1;
        return 0;
    });

    rows.forEach(row => tbody.appendChild(row));
}