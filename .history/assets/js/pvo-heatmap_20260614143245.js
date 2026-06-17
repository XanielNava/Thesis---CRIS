/**
 * CRIS Heatmap Dashboard Handler Engine - Map Fix Deployment
 */

// 1. MAP INITIALIZATION CONFIGURATIONS
const map = L.map("map", { 
    zoomControl: true,
    minZoom: 2
}).setView([10.90, 122.60], 9); // Center coordinates for Iloilo Province

// Using standard OpenStreetMap production server URL configuration
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// FIX: Force layout boundary recalculations repeatedly until DOM is completely painted
function forceMapRender() {
    map.invalidateSize();
    window.dispatchEvent(new Event('resize'));
}

// Trigger render routines sequentially as layout structures load
setTimeout(forceMapRender, 200);
setTimeout(forceMapRender, 600);
window.onload = function() {
    forceMapRender();
};