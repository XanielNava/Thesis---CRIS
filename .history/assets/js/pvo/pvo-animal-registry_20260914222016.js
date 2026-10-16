document.addEventListener("DOMContentLoaded", () => {
    // --- 1. SIDEBAR TOGGLE & PERSISTENCE ---
    const sidebar = document.getElementById("sidebar");
    const sidebarToggle = document.getElementById("sidebarToggle");

    if (sidebarToggle && sidebar) {
        const isCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
        if (isCollapsed) sidebar.classList.add("collapsed");

        sidebarToggle.addEventListener("click", () => {
            sidebar.classList.toggle("collapsed");
            localStorage.setItem("sidebarCollapsed", sidebar.classList.contains("collapsed"));
        });
    }

    // --- 2. MODAL TOGGLE & ID GENERATION ---
    const addOwnerModal = document.getElementById("addOwnerModal");
    const openAddOwnerModalBtn = document.getElementById("openAddOwnerModal");
    const closeModalBtn = document.getElementById("closeModal");
    const cancelModalBtn = document.getElementById("cancelModalBtn");
    const registrationForm = document.getElementById("ownerRegistrationForm");

    const openModal = () => {
        generateAutoRegId();
        addOwnerModal.classList.add("active");
    };

    const closeModal = () => {
        addOwnerModal.classList.remove("active");
        if (registrationForm) registrationForm.reset();
        resetOtherSpeciesInput();
        resetPhotoPreview();
        stopCameraStream();
    };

    if (openAddOwnerModalBtn) openAddOwnerModalBtn.addEventListener("click", openModal);
    if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
    if (cancelModalBtn) cancelModalBtn.addEventListener("click", closeModal);

    window.addEventListener("click", (e) => {
        if (e.target === addOwnerModal) closeModal();
    });

    function generateAutoRegId() {
        const regIdInput = document.getElementById("regId");
        if (regIdInput) {
            const randomNum = Math.floor(1000 + Math.random() * 9000);
            const currentYear = new Date().getFullYear();
            regIdInput.value = `REG-${currentYear}-${randomNum}`;
        }
    }

    // --- 3. DYNAMIC SPECIES TOGGLE LOGIC ---
    const speciesSelect = document.getElementById("species");
    const otherSpeciesGroup = document.getElementById("otherSpeciesGroup");
    const otherSpeciesInput = document.getElementById("otherSpecies");

    if (speciesSelect && otherSpeciesGroup) {
        speciesSelect.addEventListener("change", (e) => {
            if (e.target.value === "Other") {
                otherSpeciesGroup.classList.remove("hidden");
                otherSpeciesInput.setAttribute("required", "required");
                otherSpeciesInput.focus();
            } else {
                resetOtherSpeciesInput();
            }
        });
    }

    function resetOtherSpeciesInput() {
        if (otherSpeciesGroup && otherSpeciesInput) {
            otherSpeciesGroup.classList.add("hidden");
            otherSpeciesInput.removeAttribute("required");
            otherSpeciesInput.value = "";
        }
    }

    // --- 4. PHOTO UPLOAD & PREVIEW ---
    const ownerPhotoInput = document.getElementById("ownerPhotoInput");
    const photoPreview = document.getElementById("photoPreview");

    if (ownerPhotoInput) {
        ownerPhotoInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    photoPreview.innerHTML = `<img src="${event.target.result}" alt="Owner Preview" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    function resetPhotoPreview() {
        if (photoPreview) {
            photoPreview.innerHTML = `<i class="fa-solid fa-user-circle placeholder-icon"></i>`;
        }
    }

    // --- 5. CAMERA ACCESS TOGGLE ---
    const openCameraBtn = document.getElementById("openCameraBtn");
    let videoStream = null;

    if (openCameraBtn) {
        openCameraBtn.addEventListener("click", async () => {
            if (videoStream) {
                stopCameraStream();
                resetPhotoPreview();
                openCameraBtn.innerHTML = `<i class="fa-solid fa-camera"></i> Open Camera`;
                return;
            }

            try {
                videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                photoPreview.innerHTML = `<video id="cameraVideo" autoplay playsinline style="width:100%; height:100%; object-fit:cover; border-radius:50%;"></video>`;
                const videoElem = document.getElementById("cameraVideo");
                videoElem.srcObject = videoStream;
                openCameraBtn.innerHTML = `<i class="fa-solid fa-stop"></i> Stop Camera`;
            } catch (err) {
                alert("Unable to access camera. Please check browser permissions.");
                console.error("Camera access error:", err);
            }
        });
    }

    function stopCameraStream() {
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
    }

    // --- 6. ATOMIZED DATA HANDLING & SUBMISSION ---
    if (registrationForm) {
        registrationForm.addEventListener("submit", (e) => {
            e.preventDefault();

            // Extract parsed name values
            const lastName = document.getElementById("lastName").value.trim();
            const firstName = document.getElementById("firstName").value.trim();
            const middleName = document.getElementById("middleName").value.trim();
            const suffix = document.getElementById("suffix").value;

            // Compute composite name
            const middleInitial = middleName ? `${middleName.charAt(0)}.` : "";
            const computedFullName = `${lastName}, ${firstName} ${middleInitial} ${suffix}`.trim();

            const barangay = document.getElementById("barangay").value.trim();
            const municipality = document.getElementById("municipality").value;
            const province = document.getElementById("province").value;

            // Resolve animal species: use typed value if "Other" is chosen
            const rawSpecies = document.getElementById("species").value;
            const finalSpecies = rawSpecies === "Other" ? document.getElementById("otherSpecies").value.trim() : rawSpecies;

            // Structure data object for backend / database submission
            const payload = {
                registrationId: document.getElementById("regId").value,
                owner: {
                    lastName,
                    firstName,
                    middleName,
                    suffix,
                    fullName: computedFullName,
                    contact: document.getElementById("contactNumber").value
                },
                address: {
                    street: document.getElementById("streetAddress").value.trim(),
                    barangay,
                    municipality,
                    province,
                    zipCode: document.getElementById("zipCode").value.trim(),
                    formattedAddress: `${barangay}, ${municipality}, ${province}`
                },
                animal: {
                    name: document.getElementById("animalName").value.trim(),
                    species: finalSpecies,
                    isCustomSpecies: rawSpecies === "Other",
                    breed: document.getElementById("breed").value.trim(),
                    sex: document.getElementById("sex").value,
                    reproductiveStatus: document.getElementById("neuteredStatus").value,
                    vaccinationStatus: document.getElementById("vaccinationStatus").value,
                    lastVaccinated: document.getElementById("lastVaccinated").value
                }
            };

            console.log("Structured Analytics Record:", payload);
            alert(`Owner "${computedFullName}" and animal "${payload.animal.name}" (${finalSpecies}) were successfully registered!`);
            closeModal();
        });
    }

    // --- 7. EXPORT AND PRINT ACTIONS ---
    const exportBtn = document.getElementById("exportExcel");
    const printBtn = document.getElementById("printRegistry");

    if (exportBtn) exportBtn.addEventListener("click", () => alert("Exporting registry data..."));
    if (printBtn) printBtn.addEventListener("click", () => window.print());
});