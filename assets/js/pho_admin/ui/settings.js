/* ==========================================================================
   SYSTEM SETTINGS — PHO ADMIN PAGE CONTROLLER (settings.js)
   Synchronizes system defaults & reference data with Firestore + audit_logs
   ========================================================================== */

import { fetchSystemSettingsFromDb, saveSystemSettingsToDb, logoutAdmin } from '../db/settings-db.js';

(function () {
    'use strict';

    /* ======================================================================
       1. SIDEBAR & LOGOUT
       ====================================================================== */

    const SIDEBAR_KEY = 'sidebarCollapsed';
    const sidebar = document.getElementById('sidebar');
    const appLayout = document.getElementById('appLayout');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const logoutModal = document.getElementById('logoutModal');
    const logoutConfirm = document.getElementById('logoutConfirm');

    function readSidebarState() {
        try {
            return localStorage.getItem(SIDEBAR_KEY) === 'true';
        } catch (e) {
            return false;
        }
    }

    function storeSidebarState(collapsed) {
        try {
            localStorage.setItem(SIDEBAR_KEY, String(collapsed));
        } catch (e) { /* Storage unavailable */ }
    }

    function applySidebarState(collapsed) {
        if (!sidebar || !appLayout) return;
        sidebar.classList.toggle('collapsed', collapsed);
        appLayout.classList.toggle('sidebar-collapsed', collapsed);
        if (sidebarToggle) {
            sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
        }
    }

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function () {
            const collapsed = !sidebar.classList.contains('collapsed');
            applySidebarState(collapsed);
            storeSidebarState(collapsed);
        });
    }

    /* ======================================================================
       2. HELPERS & UTILITIES
       ====================================================================== */

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const clone = (value) => JSON.parse(JSON.stringify(value));

    const toastEl = document.getElementById('toast');
    let toastTimer = null;

    function toast(message) {
        if (!toastEl) return;
        toastEl.textContent = message;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
    }

    function openModal(el) {
        if (!el) return;
        el.classList.add('open');
        el.setAttribute('aria-hidden', 'false');
    }

    function closeModal(el) {
        if (!el) return;
        el.classList.remove('open');
        el.setAttribute('aria-hidden', 'true');
    }

    /* ======================================================================
       3. DEFAULT SETTINGS & REFERENCE LISTS
       ====================================================================== */

    const LOCAL_PREF_KEY = 'cris-admin-settings';

    const DEFAULTS = {
        // General (Synced to Firestore)
        systemName: 'Community-Centric Rabies Information Systems',
        shortName: 'CRIS',
        supportEmail: 'pho.iloilo.rabies@gmail.com',
        supportPhone: '(033) 337-2101',
        timezone: 'Asia/Manila',

        // Appearance (Local to this workstation)
        theme: 'light',
        density: 'comfortable',
        reduceMotion: false,

        // Reference Data (Synced to Firestore)
        animalTypes: ['Dog', 'Cat', 'Monkey', 'Livestock', 'Other'],
        biteCategories: ['Category I (Touching/Feeding)', 'Category II (Minor Scratches/Abrasions)', 'Category III (Transdermal/Punctures)'],
        facilityTypes: ['ABTC', 'RHU Satellite Clinic', 'Provincial Hospital', 'Private Hospital']
    };

    const LISTS = ['animalTypes', 'biteCategories', 'facilityTypes'];

    /* ======================================================================
       4. WORKSTATION APPEARANCE
       ====================================================================== */

    const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function resolveTheme(theme) {
        if (theme === 'system') {
            return systemDark && systemDark.matches ? 'dark' : 'light';
        }
        return theme === 'dark' ? 'dark' : 'light';
    }

    function applyAppearance(values) {
        document.documentElement.setAttribute('data-theme', resolveTheme(values.theme));
        document.body.classList.toggle('density-compact', values.density === 'compact');
        document.body.classList.toggle('reduce-motion', !!values.reduceMotion);
    }

    if (systemDark) {
        systemDark.addEventListener('change', function () {
            if (saved.theme === 'system') applyAppearance(saved);
        });
    }

    /* ======================================================================
       5. STATE MANAGEMENT
       ====================================================================== */

    let saved = clone(DEFAULTS);
    let savedAt = null;
    let draft = clone(DEFAULTS);

    const isDirty = () => JSON.stringify(saved) !== JSON.stringify(draft);

    /* ======================================================================
       6. FIELD BINDING & SAVE BAR
       ====================================================================== */

    const form = document.getElementById('settingsForm');
    const saveBar = document.getElementById('saveBar');
    const saveStatus = document.getElementById('saveStatus');
    const lastSavedEl = document.getElementById('lastSaved');

    function renderFields() {
        $$('[data-key]', form).forEach((el) => {
            const value = draft[el.dataset.key];

            if (el.type === 'radio') {
                el.checked = el.value === String(value);
            } else if (el.type === 'checkbox') {
                el.checked = !!value;
            } else {
                el.value = value ?? '';
            }
        });
    }

    function readField(el) {
        if (el.type === 'checkbox') return el.checked;
        return el.value;
    }

    function onFieldChange(e) {
        const el = e.target;
        if (!el.dataset || !el.dataset.key) return;
        if (el.type === 'radio' && !el.checked) return;

        draft[el.dataset.key] = readField(el);
        el.classList.remove('is-invalid');
        updateSaveBar();
    }

    form.addEventListener('input', onFieldChange);
    form.addEventListener('change', onFieldChange);

    function updateSaveBar() {
        const dirty = isDirty();
        saveBar.classList.toggle('visible', dirty);
        saveStatus.textContent = dirty ? 'You have unsaved changes' : 'All changes saved';
    }

    /* ======================================================================
       7. REFERENCE CHIP EDITORS
       ====================================================================== */

    function renderChips(listKey) {
        const editor = $(`[data-list="${listKey}"]`, form);
        if (!editor) return;

        $('.chip-list', editor).innerHTML = draft[listKey].map((item, index) => `
            <span class="chip">
                ${esc(item)}
                <button type="button" class="chip-remove" data-index="${index}" aria-label="Remove ${esc(item)}">&times;</button>
            </span>`).join('');
    }

    function renderAllChips() {
        LISTS.forEach(renderChips);
    }

    function addChip(editor) {
        const input = $('input', editor);
        const listKey = editor.dataset.list;
        const value = input.value.trim();

        if (!value) {
            toast('Enter a value before adding.');
            input.focus();
            return;
        }

        const exists = draft[listKey].some((item) => item.toLowerCase() === value.toLowerCase());
        if (exists) {
            toast(`"${value}" is already in the list.`);
            return;
        }

        draft[listKey].push(value);
        input.value = '';
        renderChips(listKey);
        updateSaveBar();
        input.focus();
    }

    function removeChip(editor, index) {
        const listKey = editor.dataset.list;
        if (draft[listKey].length <= 1) {
            toast('At least one item is required in this list.');
            return;
        }

        draft[listKey].splice(index, 1);
        renderChips(listKey);
        updateSaveBar();
    }

    /* ======================================================================
       8. TAB NAVIGATION
       ====================================================================== */

    const nav = document.querySelector('.settings-nav');
    const tabButtons = $$('.settings-nav-item', nav);
    const sections = $$('.settings-section', form);

    function showTab(name) {
        if (!sections.some((s) => s.dataset.section === name)) {
            name = 'general';
        }

        tabButtons.forEach((btn) => {
            const active = btn.dataset.tab === name;
            btn.classList.toggle('active', active);
            if (active) {
                btn.setAttribute('aria-current', 'page');
            } else {
                btn.removeAttribute('aria-current');
            }
        });

        sections.forEach((s) => s.classList.toggle('active', s.dataset.section === name));
        history.replaceState(null, '', '#' + name);
        const mainContent = document.getElementById('mainContent');
        if (mainContent) mainContent.scrollTop = 0;
    }

    nav.addEventListener('click', function (e) {
        const btn = e.target.closest('.settings-nav-item');
        if (btn) showTab(btn.dataset.tab);
    });

    /* ======================================================================
       9. VALIDATION & SAVE
       ====================================================================== */

    function validate(values) {
        const errors = [];
        if (!String(values.systemName).trim()) {
            errors.push(['systemName', 'System name is required.']);
        }
        if (!String(values.shortName).trim()) {
            errors.push(['shortName', 'Short name is required.']);
        }
        if (values.supportEmail && !/^\S+@\S+\.\S+$/.test(values.supportEmail)) {
            errors.push(['supportEmail', 'Enter a valid support email address.']);
        }
        LISTS.forEach((key) => {
            if (!values[key].length) {
                errors.push([key, 'Each reference list needs at least one item.']);
            }
        });
        return errors;
    }

    async function saveSettings() {
        const errors = validate(draft);
        if (errors.length) {
            errors.forEach(([key]) => {
                const el = $(`[data-key="${key}"]`, form);
                if (el) el.classList.add('is-invalid');
            });
            toast(errors[0][1]);
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            // 1. Sync global settings to Firestore
            await saveSystemSettingsToDb({
                systemName: draft.systemName,
                shortName: draft.shortName,
                supportEmail: draft.supportEmail,
                supportPhone: draft.supportPhone,
                timezone: draft.timezone,
                animalTypes: draft.animalTypes,
                biteCategories: draft.biteCategories,
                facilityTypes: draft.facilityTypes
            });

            // 2. Persist local appearance preferences
            localStorage.setItem(LOCAL_PREF_KEY, JSON.stringify({
                values: {
                    theme: draft.theme,
                    density: draft.density,
                    reduceMotion: draft.reduceMotion
                },
                savedAt: new Date().toISOString()
            }));

            saved = clone(draft);
            savedAt = new Date().toISOString();

            applyAppearance(saved);
            renderAll();
            toast('Settings saved and synchronized with database.');

        } catch (err) {
            console.error("Save error:", err);
            toast('Failed to save settings: ' + err.message);
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    function discardChanges() {
        draft = clone(saved);
        $$('.is-invalid', form).forEach((el) => el.classList.remove('is-invalid'));
        renderAll();
        toast('Changes discarded.');
    }

    function renderAbout() {
        if (lastSavedEl) {
            lastSavedEl.textContent = savedAt ? new Date(savedAt).toLocaleString('en-PH') : 'Never';
        }
    }

    function renderAll() {
        renderFields();
        renderAllChips();
        updateSaveBar();
        renderAbout();
    }

    /* ======================================================================
       10. EVENTS
       ====================================================================== */

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        saveSettings();
    });

    form.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        const editor = e.target.closest('.chip-add') && e.target.closest('[data-list]');
        if (editor) {
            e.preventDefault();
            addChip(editor);
        }
    });

    document.addEventListener('click', function (e) {
        const addBtn = e.target.closest('[data-add]');
        if (addBtn) {
            addChip(addBtn.closest('[data-list]'));
            return;
        }

        const removeBtn = e.target.closest('.chip-remove');
        if (removeBtn) {
            removeChip(removeBtn.closest('[data-list]'), Number(removeBtn.dataset.index));
            return;
        }

        if (e.target.closest('#discardBtn')) {
            discardChanges();
            return;
        }

        if (e.target.closest('#logoutBtn')) {
            openModal(logoutModal);
            return;
        }

        if (e.target.closest('#logoutConfirm')) {
            logoutAdmin().then(() => {
                localStorage.clear();
                window.location.href = '../pho/pho-login.html';
            }).catch(() => {
                window.location.href = '../pho/pho-login.html';
            });
            return;
        }

        const closeBtn = e.target.closest('[data-close]');
        if (closeBtn) {
            closeModal(logoutModal);
            return;
        }

        if (e.target === logoutModal) {
            closeModal(logoutModal);
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && logoutModal && logoutModal.classList.contains('open')) {
            closeModal(logoutModal);
        }
    });

    window.addEventListener('beforeunload', function (e) {
        if (isDirty()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    /* ======================================================================
       11. INITIALIZATION & CLOUD BOOT
       ====================================================================== */

    async function initSettings() {
        applySidebarState(readSidebarState());

        // 1. Load local preferences
        let localPrefs = {};
        try {
            const raw = localStorage.getItem(LOCAL_PREF_KEY);
            if (raw) localPrefs = JSON.parse(raw).values || {};
        } catch (e) {}

        // 2. Fetch live settings from Firestore
        const cloudSettings = await fetchSystemSettingsFromDb();

        saved = Object.assign(clone(DEFAULTS), cloudSettings || {}, localPrefs);
        savedAt = cloudSettings?.updatedAt?.toDate ? cloudSettings.updatedAt.toDate().toISOString() : null;
        draft = clone(saved);

        applyAppearance(saved);
        renderAll();
        showTab(location.hash.slice(1) || 'general');
    }

    initSettings();
})();