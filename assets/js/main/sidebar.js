// ==========================================================================
// sidebar.js - Universal SaaS Sidebar Toggle & Logout Controller
// ==========================================================================

function setupSidebar() {
    const sidebarToggle = document.getElementById("sidebarToggle");
    const sidebar = document.getElementById("sidebar");
    const container = document.querySelector(".container, .app-container");

    // 1. Sidebar Toggle Setup
    if (sidebarToggle && sidebar) {
        sidebarToggle.onclick = function() {
            const isCollapsed = sidebar.classList.toggle("collapsed");
            if (container) {
                container.classList.toggle("collapsed", isCollapsed);
            }
            localStorage.setItem("sidebarCollapsed", String(isCollapsed));
        };

        // 2. Initial State Restorer
        if (localStorage.getItem("sidebarCollapsed") === "true") {
            sidebar.classList.add("collapsed");
            if (container) {
                container.classList.add("collapsed");
            }
        }
    }

    // 3. Centralized Universal Logout Handler
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.onclick = function(e) {
            e.preventDefault();

            const confirmLogout = confirm("Are you sure you want to log out of the PHO Surveillance Portal?");
            if (!confirmLogout) return;

            alert("You are being logged out of the portal. Redirecting to login page...");

            // Clear session storage if used
            sessionStorage.clear();
            localStorage.removeItem("authUser");

            // Redirect cleanly
            window.location.href = "pho-login.html";
        };
    }
}

// Auto-initialize when the DOM is fully loaded
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupSidebar);
} else {
    setupSidebar();
}