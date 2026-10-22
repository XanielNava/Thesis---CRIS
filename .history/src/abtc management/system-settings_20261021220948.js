/* ==========================================================================
   SYSTEM SETTINGS — page script
   Self-contained: no shared files are required.

   Sections:
     1. Sidebar (TRANSITIONAL — replace when the master sidebar is finalized)
     2. Helpers
     3. Defaults, validation rules, and storage
     4. Appearance (theme, density, motion)
     5. State (saved vs. draft)
     6. Field binding
     7. Reference lists (chips)
     8. Tabs
     9. Validation and actions
     10. Events
     11. Initialization
   ========================================================================== */
(function () {
    'use strict';

    /* ======================================================================
       1. SIDEBAR (TRANSITIONAL)
       Collapse/expand behavior matches sidebar-master.css. The state uses the
       same localStorage key as the master sidebar, so the preference carries
       across pages. Remove or replace this section when the sidebar is final.
       ====================================================================== */

    const SIDEBAR_KEY = 'sidebarCollapsed';

    const sidebar = document.getElementById('sidebar');
    const appLayout = document.getElementById('appLayout');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const logoutModal = document.getElementById('logoutModal');

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
        } catch (e) { /* storage unavailable: state is not persisted */ }
    }

    function applySidebarState(collapsed) {
        sidebar.classList.toggle('collapsed', collapsed);
        appLayout.classList.toggle('sidebar-collapsed', collapsed);
        sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    }

    sidebarToggle.addEventListener('click', function () {
        const collapsed = !sidebar.classList.contains('collapsed');
        applySidebarState(collapsed);
        storeSidebarState(collapsed);
    });

    /* ======================================================================
       2. HELPERS
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
        toastEl.textContent = message;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
    }

    function openModal(el) {
        el.classList.add('open');
        el.setAttribute('aria-hidden', 'false');
    }

    function closeModal(el) {
        if (!el) return;
        el.classList.remove('open');
        el.setAttribute('aria-hidden', 'true');
    }

    /* ======================================================================
       3. DEFAULTS, VALIDATION RULES, AND STORAGE
       ====================================================================== */

    const STORAGE_KEY = 'cris-admin-settings';

    const DEFAULTS = {
        // General
        systemName: 'Community-Centric Rabies Information Systems',
        shortName: 'CRIS',
        supportEmail: 'support@example.com',
        supportPhone: '',
        timezone: 'Asia/Manila',
        dateFormat: 'MM/DD/YYYY',
        language: 'en',

        // Appearance
        theme: 'light',
        density: 'comfortable',
        reduceMotion: false,

        // Security
        sessionTimeout: 30,
        passwordMinLength: 8,
        require2fa: false,
        maxFailedLogins: 5,
        lockoutMinutes: 15,

        // Notifications
        notifyNewRegistration: true,
        notifyRoleChange: true,
        notifyComplaints: true,
        digestFrequency: 'daily',

        // Facility registration
        requireApproval: true,
        allowSelfRegistration: false,
        defaultFacilityStatus: 'Active',
        reactivationReview: true,

        // Reference data
        animalTypes: ['Dog', 'Cat', 'Monkey', 'Other'],
        biteCategories: ['Category I', 'Category II', 'Category III'],
        facilityTypes: ['ABTC', 'Satellite Clinic'],

        // Data and audit
        auditRetentionDays: 365,
        logRoleChanges: true
    };

    // Numeric fields and their allowed ranges (inclusive)
    const RANGES = {
        sessionTimeout: [5, 240],
        passwordMinLength: [8, 32],
        maxFailedLogins: [3, 10],
        lockoutMinutes: [5, 120],
        auditRetentionDays: [30, 3650]
    };

    const LISTS = ['animalTypes', 'biteCategories', 'facilityTypes'];

    function loadStored() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { values: clone(DEFAULTS), savedAt: null };

            const parsed = JSON.parse(raw);
            return {
                values: Object.assign(clone(DEFAULTS), parsed.values || {}),
                savedAt: parsed.savedAt || null
            };
        } catch (e) {
            return { values: clone(DEFAULTS), savedAt: null };
        }
    }

    function persist(values, savedAt) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ values, savedAt }));
        } catch (e) { /* storage unavailable: settings apply for this session only */ }
    }

    /* ======================================================================
       4. APPEARANCE (theme, density, motion)
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

    // When the theme is "System", follow changes to the OS setting
    if (systemDark) {
        systemDark.addEventListener('change', function () {
            if (saved.theme === 'system') applyAppearance(saved);
        });
    }

    /* ======================================================================
       5. STATE (saved values vs. draft being edited)
       ====================================================================== */

    const stored = loadStored();
    let saved = stored.values;       // last saved values
    let savedAt = stored.savedAt;    // ISO timestamp of last save
    let draft = clone(saved);        // values currently shown in the form

    const isDirty = () => JSON.stringify(saved) !== JSON.stringify(draft);

    /* ======================================================================
       6. FIELD BINDING
       Every element with data-key is bound to draft[key].
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
        if (el.type === 'number') return el.value === '' ? '' : Number(el.value);
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
       7. REFERENCE LISTS (chips)
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
       8. TABS
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
        document.getElementById('mainContent').scrollTop = 0;
    }

    nav.addEventListener('click', function (e) {
        const btn = e.target.closest('.settings-nav-item');
        if (btn) showTab(btn.dataset.tab);
    });

    /* ======================================================================
       9. VALIDATION AND ACTIONS
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

        Object.entries(RANGES).forEach(([key, [min, max]]) => {
            const v = values[key];
            if (v === '' || Number.isNaN(v) || v < min || v > max) {
                errors.push([key, `Enter a number from ${min} to ${max}.`]);
            }
        });

        LISTS.forEach((key) => {
            if (!values[key].length) {
                errors.push([key, 'Each reference list needs at least one item.']);
            }
        });

        return errors;
    }

    function reportErrors(errors) {
        $$('.is-invalid', form).forEach((el) => el.classList.remove('is-invalid'));

        errors.forEach(([key]) => {
            const el = $(`[data-key="${key}"]`, form);
            if (el) el.classList.add('is-invalid');
        });

        const [firstKey, message] = errors[0];
        toast(message);

        const field = $(`[data-key="${firstKey}"]`, form) || $(`[data-list="${firstKey}"]`, form);
        if (field) {
            const section = field.closest('.settings-section');
            if (section) showTab(section.dataset.section);

            const target = field.matches('[data-list]') ? $('input', field) : field;
            if (target) target.focus();
        }
    }

    function saveSettings() {
        const errors = validate(draft);
        if (errors.length) {
            reportErrors(errors);
            return;
        }

        saved = clone(draft);
        savedAt = new Date().toISOString();
        persist(saved, savedAt);

        applyAppearance(saved);
        renderAll();
        toast('Settings saved.');
    }

    function discardChanges() {
        draft = clone(saved);
        $$('.is-invalid', form).forEach((el) => el.classList.remove('is-invalid'));
        renderAll();
        toast('Changes discarded.');
    }

    function resetToDefaults() {
        const confirmed = window.confirm(
            'Reset all settings to their default values? Nothing changes until you save.'
        );
        if (!confirmed) return;

        draft = clone(DEFAULTS);
        $$('.is-invalid', form).forEach((el) => el.classList.remove('is-invalid'));
        renderAll();
        toast('Defaults restored. Save to apply.');
    }

    function exportSettings() {
        const payload = {
            exportedAt: new Date().toISOString(),
            settings: saved
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'cris-admin-settings.json';
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 0);
        toast('Settings exported.');
    }

    function renderAbout() {
        lastSavedEl.textContent = savedAt ? new Date(savedAt).toLocaleString() : 'Never';
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

    // Enter in a chip input adds the item instead of submitting the form
    form.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        const editor = e.target.closest('.chip-add') && e.target.closest('[data-list]');
        if (editor) {
            e.preventDefault();
            addChip(editor);
        }
    });

    document.addEventListener('click', function (e) {
        // Add a reference item
        const addBtn = e.target.closest('[data-add]');
        if (addBtn) {
            addChip(addBtn.closest('[data-list]'));
            return;
        }

        // Remove a reference item
        const removeBtn = e.target.closest('.chip-remove');
        if (removeBtn) {
            removeChip(removeBtn.closest('[data-list]'), Number(removeBtn.dataset.index));
            return;
        }

        if (e.target.closest('#discardBtn')) {
            discardChanges();
            return;
        }

        if (e.target.closest('#resetBtn')) {
            resetToDefaults();
            return;
        }

        if (e.target.closest('#exportBtn')) {
            exportSettings();
            return;
        }

        // Logout flow
        if (e.target.closest('#logoutBtn')) {
            openModal(logoutModal);
            return;
        }

        if (e.target.closest('#logoutConfirm')) {
            window.location.href = 'admin-login.html'; // adjust to your login page
            return;
        }

        const closeBtn = e.target.closest('[data-close]');
        if (closeBtn) {
            closeModal(closeBtn.closest('.logout-modal'));
            return;
        }

        if (e.target === logoutModal) {
            closeModal(logoutModal);
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && logoutModal.classList.contains('open')) {
            closeModal(logoutModal);
        }
    });

    // Warn before leaving the page with unsaved changes
    window.addEventListener('beforeunload', function (e) {
        if (isDirty()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    /* ======================================================================
       11. INITIALIZATION
       ====================================================================== */

    applySidebarState(readSidebarState());
    applyAppearance(saved);
    renderAll();
    showTab(location.hash.slice(1) || 'general');
})();