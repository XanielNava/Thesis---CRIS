document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("sidebar-collapse-btn");
    const container = document.querySelector(".container");

    if (!toggleBtn || !container) return; // Failsafe if elements don't exist

    // 1. Handle Toggle Click
    toggleBtn.addEventListener("click", () => {
        const currentlyCollapsed = container.classList.toggle("collapsed");
        localStorage.setItem("sidebarCollapsed", currentlyCollapsed);
    });
});