/**
 * CRIS Navigation Sidebar Controller
 */

// Function to open sidebar navigation
function openMenu() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");

    if (sidebar && overlay) {
        sidebar.classList.add("active");
        overlay.classList.add("active");
        document.body.style.overflow = "hidden"; // Prevent background scrolling when open
    }
}

// Function to close sidebar navigation
function closeMenu() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");

    if (sidebar && overlay) {
        sidebar.classList.remove("active");
        overlay.classList.remove("active");
        document.body.style.overflow = ""; // Restore background scrolling
    }
}

// Explicitly bind functions to window object for inline HTML event handlers (onclick)
window.openMenu = openMenu;
window.closeMenu = closeMenu;

// Event listener initialization for keyboard and backdrop interactions
document.addEventListener("DOMContentLoaded", () => {
    // Close sidebar when pressing the Escape key
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMenu();
        }
    });
});