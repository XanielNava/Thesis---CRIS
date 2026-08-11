// ==========================================================================
// PROFESSIONAL SAAS SIDEBAR TOGGLE ENGINE
// ==========================================================================

function setupSidebar() {
    const sidebarToggle = document.getElementById("sidebarToggle");
    const sidebar = document.getElementById("sidebar");
    const container = document.querySelector(".container");

    if (!sidebarToggle || !sidebar) return;

    // 1. Toggle Button Click Event
    sidebarToggle.addEventListener("click", () => {
        sidebar.classList.toggle("collapsed");
        
        if (container) {
            container.classList.toggle("collapsed");
        }

        const isCollapsed = sidebar.classList.contains("collapsed");
        localStorage.setItem("sidebarCollapsed", isCollapsed);
    });

    // 2. Initial State Restorer
    const wasCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
    if (wasCollapsed) {
        sidebar.classList.add("collapsed");
        if (container) {
            container.classList.add("collapsed");
        }
    }
}

// Auto-initialize when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", setupSidebar);