/**
 * PVO Animal Registry Module Script
 */

// HARDCODED DATABASE STATE (FOR INTERACTIVE DEMO)
const ownerDatabase = {
    "OWN-001": {
        regId: "REG-2026-1001",
        lastName: "Dela Cruz",
        firstName: "Juan",
        middleName: "Santos",
        suffix: "",
        contact: "0917-123-4567",
        street: "Block 4 Lot 12",
        barangay: "Poblacion Zone 1",
        municipality: "Santa Barbara",
        zipCode: "5002",
        animals: [
            { regId: "REG-2026-1001-A1", name: "Browny", species: "Dog", breed: "Aspin", sex: "Male", neutered: "Castrated", status: "Vaccinated", lastVax: "2026-01-15" }
        ]
    },
    "OWN-002": {
        regId: "REG-2026-1002",
        lastName: "Limosnero",
        firstName: "John Rheb",
        middleName: "B.",
        suffix: "",
        contact: "0928-555-0192",
        street: "Purok 3",
        barangay: "Ungka",
        municipality: "Pavia",
        zipCode: "5001",
        animals: [
            { regId: "REG-2026-1002-A1", name: "Mimi", species: "Cat", breed: "Persian", sex: "Female", neutered: "Spayed", status: "Vaccinated", lastVax: "2026-02-10" },
            { regId: "REG-2026-1002-A2", name: "Tiger", species: "Cat", breed: "Domestic Shorthair", sex: "Male", neutered: "Intact", status: "Overdue", lastVax: "2025-03-12" }
        ]
    },
    "OWN-003": {
        regId: "REG-2026-1003",
        lastName: "Guancia",
        firstName: "Shenna Jane",
        middleName: "M.",
        suffix: "",
        contact: "0919-888-3411",
        street: "St. Jude Village",
        barangay: "Mandurriao",
        municipality: "Iloilo City",
        zipCode: "5000",
        animals: [
            { regId: "REG-2026-1003-A1", name: "Coco", species: "Dog", breed: "Poodle", sex: "Female", neutered: "Spayed", status: "Vaccinated", lastVax: "2026-04-01" }
        ]
    }
};

let activeOwnerId = null;

document.addEventListener("DOMContentLoaded", () => {
    // --- SIDEBAR TOGGLE LOGIC ---
    const sidebar = document.getElementById("sidebar");
    const sidebarToggle = document.getElementById("sidebarToggle");

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener("click", () => {
            sidebar.classList.toggle("collapsed");
            localStorage.setItem("sidebarCollapsed", sidebar.classList.contains("collapsed"));
        });
    }

    // --- LIVE FILTERING ON HARDCODED TABLE ROWS ---
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const filter = e.target.value.toLowerCase().trim();
            const rows = document.querySelectorAll("#registryTableBody tr");
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(filter) ? "" : "none";
            });
        });
    }

    // --- OWNER PROFILE MODAL CLOSING ---
    const ownerProfileModal = document.getElementById("ownerProfileModal");
    const closeProfileModalBtn = document.getElementById("closeProfileModalBtn");
    const cancelProfileModalBtn = document.getElementById("cancelProfileModalBtn");

    const closeProfileModal = () => ownerProfileModal.classList.remove("active");
    if (closeProfileModalBtn) closeProfileModalBtn.addEventListener("click", closeProfileModal);
    if (cancelProfileModalBtn) cancelProfileModalBtn.addEventListener("click", closeProfileModal);

    // --- ADD ANOTHER ANIMAL PROFILE BUTTON CLICK ---
    const addAnimalBtn = document.getElementById("addAnimalProfileFieldBtn");
    if (addAnimalBtn) {
        addAnimalBtn.addEventListener("click", () => {
            if (!activeOwnerId || !ownerDatabase[activeOwnerId]) return;

            const owner = ownerDatabase[activeOwnerId];
            const nextIndex = owner.animals.length + 1;
            const newAnimal = {
                regId: `${owner.regId}-A${nextIndex}`,
                name: "",
                species: "Dog",
                breed: "",
                sex: "Male",
                neutered: "Intact",
                status: "Vaccinated",
                lastVax: new Date().toISOString().split('T')[0]
            };

            // Push to local data and render field
            owner.animals.push(newAnimal);
            renderAnimalFields(owner.animals);

            // Update badge on main table
            const badge = document.getElementById(`badge-${activeOwnerId}`);
            if (badge) badge.textContent = `${owner.animals.length} Animal(s)`;
        });
    }

    // --- ADD NEW OWNER MODAL LOGIC ---
    const addOwnerModal = document.getElementById("addOwnerModal");
    const openAddOwnerModalBtn = document.getElementById("openAddOwnerModal");
    const closeAddModalBtn = document.getElementById("closeAddModalBtn");
    const cancelAddModalBtn = document.getElementById("cancelAddModalBtn");

    const openAddModal = () => {
        const regField = document.getElementById("regId");
        if (regField) {
            regField.value = `REG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        }
        addOwnerModal.classList.add("active");
    };
    const closeAddModal = () => addOwnerModal.classList.remove("active");

    if (openAddOwnerModalBtn) openAddOwnerModalBtn.addEventListener("click", openAddModal);
    if (closeAddModalBtn) closeAddModalBtn.addEventListener("click", closeAddModal);
    if (cancelAddModalBtn) cancelAddModalBtn.addEventListener("click", closeAddModal);
});

// --- GLOBAL FUNCTION: OPEN & POPULATE OWNER POPUP MODAL ---
function openOwnerProfileModal(ownerId) {
    activeOwnerId = ownerId;
    const owner = ownerDatabase[ownerId];
    if (!owner) return;

    // Fill Owner Demographics
    document.getElementById("viewRegId").value = owner.regId;
    document.getElementById("viewContact").value = owner.contact;
    document.getElementById("viewLastName").value = owner.lastName;
    document.getElementById("viewFirstName").value = owner.firstName;
    document.getElementById("viewMiddleName").value = owner.middleName;
    document.getElementById("viewSuffix").value = owner.suffix || "N/A";
    document.getElementById("viewStreet").value = owner.street;
    document.getElementById("viewBarangay").value = owner.barangay;
    document.getElementById("viewMunicipality").value = owner.municipality;
    document.getElementById("viewZipCode").value = owner.zipCode;

    // Render Animal Fields list
    renderAnimalFields(owner.animals);

    // Open Modal
    document.getElementById("ownerProfileModal").classList.add("active");
}

// RENDER ALL ANIMAL PROFILES FOR CURRENT OWNER INSIDE MODAL
function renderAnimalFields(animals) {
    const container = document.getElementById("animalProfilesListContainer");
    if (!container) return;
    
    container.innerHTML = "";

    animals.forEach((animal, index) => {
        const card = document.createElement("div");
        card.className = "animal-profile-card";
        card.innerHTML = `
            <div class="animal-profile-title">
                <span><i class="fa-solid fa-paw"></i> Animal Profile #${index + 1}</span>
                <span style="font-size:0.8rem; font-weight:normal;">Reg ID: <strong>${animal.regId}</strong></span>
            </div>
            <div class="form-grid quad-grid mb-10">
                <div class="input-group">
                    <label>Animal Name</label>
                    <input type="text" value="${animal.name}" placeholder="e.g. Fluffy">
                </div>
                <div class="input-group">
                    <label>Species</label>
                    <select>
                        <option value="Dog" ${animal.species === 'Dog' ? 'selected' : ''}>Dog (Canine)</option>
                        <option value="Cat" ${animal.species === 'Cat' ? 'selected' : ''}>Cat (Feline)</option>
                        <option value="Other" ${animal.species !== 'Dog' && animal.species !== 'Cat' ? 'selected' : ''}>Other</option>
                    </select>
                </div>
                <div class="input-group">
                    <label>Breed</label>
                    <input type="text" value="${animal.breed}" placeholder="e.g. Labrador">
                </div>
                <div class="input-group">
                    <label>Sex</label>
                    <select>
                        <option value="Male" ${animal.sex === 'Male' ? 'selected' : ''}>Male</option>
                        <option value="Female" ${animal.sex === 'Female' ? 'selected' : ''}>Female</option>
                    </select>
                </div>
            </div>
            <div class="form-grid quad-grid">
                <div class="input-group">
                    <label>Reproductive Status</label>
                    <select>
                        <option value="Intact" ${animal.neutered === 'Intact' ? 'selected' : ''}>Intact</option>
                        <option value="Castrated" ${animal.neutered === 'Castrated' ? 'selected' : ''}>Castrated</option>
                        <option value="Spayed" ${animal.neutered === 'Spayed' ? 'selected' : ''}>Spayed</option>
                    </select>
                </div>
                <div class="input-group">
                    <label>Vaccination Status</label>
                    <select>
                        <option value="Vaccinated" ${animal.status === 'Vaccinated' ? 'selected' : ''}>Vaccinated</option>
                        <option value="Unvaccinated" ${animal.status === 'Unvaccinated' ? 'selected' : ''}>Unvaccinated</option>
                        <option value="Overdue" ${animal.status === 'Overdue' ? 'selected' : ''}>Overdue</option>
                    </select>
                </div>
                <div class="input-group">
                    <label>Last Vaccination Date</label>
                    <input type="date" value="${animal.lastVax !== 'N/A' ? animal.lastVax : ''}">
                </div>
                <div class="input-group">
                    <label>Microchip / Tag ID</label>
                    <input type="text" placeholder="Optional Tag ID">
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}