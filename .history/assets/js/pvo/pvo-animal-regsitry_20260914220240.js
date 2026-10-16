document.addEventListener("DOMContentLoaded", () => {
    // --- 1. SIDEBAR TOGGLE & PERSISTENCE ---
    const sidebar = document.getElementById("sidebar");
    const sidebarToggle = document.getElementById("sidebarToggle");
    const container = document.querySelector(".container");

    if (sidebarToggle) {
        sidebarToggle.addEventListener("click", () => {
            sidebar.classList.toggle("collapsed");
            container.classList.toggle("collapsed");
            const isCollapsed = sidebar.classList.contains("collapsed");
            localStorage.setItem("sidebarCollapsed", isCollapsed);
        });
    }

    // --- 2. MODAL TOGGLE SYSTEM ---
    const addOwnerModal = document.getElementById("addOwnerModal");
    const openAddOwnerModalBtn = document.getElementById("openAddOwnerModal");
    const closeModalBtn = document.getElementById("closeModal");
    const cancelModalBtn = document.getElementById("cancelModalBtn");
    const registrationForm = document.getElementById("ownerRegistrationForm");

    // Function to open modal & generate a new Registration ID
    const openModal = () => {
        generateAutoRegId();
        addOwnerModal.classList.add("active");
    };

    // Function to close modal & reset form
    const closeModal = () => {
        addOwnerModal.classList.remove("active");
        if (registrationForm) registrationForm.reset();
        resetPhotoPreview();
        stopCameraStream(); // Safety stop if camera was left on
    };

    if (openAddOwnerModalBtn) openAddOwnerModalBtn.addEventListener("click", openModal);
    if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
    if (cancelModalBtn) cancelModalBtn.addEventListener("click", closeModal);

    // Close modal when clicking outside content card
    window.addEventListener("click", (e) => {
        if (e.target === addOwnerModal) closeModal();
    });

    // --- 3. AUTO-GENERATE REGISTRATION ID ---
    function generateAutoRegId() {
        const regIdInput = document.getElementById("regId");
        if (regIdInput) {
            const randomNum = Math.floor(1000 + Math.random() * 9000);
            const currentYear = new Date().getFullYear();
            regIdInput.value = `REG-${currentYear}-${randomNum}`;
        }
    }

    // --- 4. IMAGE UPLOAD & PREVIEW ---
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

    // --- 5. CAMERA INTEGRATION ---
    const openCameraBtn = document.getElementById("openCameraBtn");
    let videoStream = null;

    if (openCameraBtn) {
        openCameraBtn.addEventListener("click", async () => {
            // Toggle stream off if already running
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
                alert("Unable to access camera. Please check permissions.");
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

    // --- 6. FORM SUBMISSION HANDLER ---
    if (registrationForm) {
        registrationForm.addEventListener("submit", (e) => {
            e.preventDefault();
            // Form processing logic goes here
            alert("Owner and Animal details successfully saved!");
            closeModal();
        });
    }

    // --- 7. EXPORT & PRINT HANDLERS ---
    const exportBtn = document.getElementById("exportExcel");
    const printBtn = document.getElementById("printRegistry");

    if (exportBtn) {
        exportBtn.addEventListener("click", () => {
            alert("Exporting registry data to Excel...");
        });
    }

    if (printBtn) {
        printBtn.addEventListener("click", () => {
            window.print();
        });
    }
});