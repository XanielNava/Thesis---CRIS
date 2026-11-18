(function () {
    'use strict';

    const { $, toast, findById } = AdminUI;
    const { createFacilities, createUsers, createAudit, setFacilityStatus } = AdminData;

    // Sample data for this page (in-memory only)
    const facilities = createFacilities();
    const users = createUsers();
    const audit = createAudit();

    function renderStats() {
        const countWhere = (list, fn) => list.filter(fn).length;
        $('#statTotalFacilities').textContent = facilities.length;
        $('#statActiveUsers').textContent = countWhere(users, (u) => u.status === 'Active');
        $('#statActiveFacilities').textContent = countWhere(facilities, (f) => f.status === 'Active');
        $('#statPending').textContent = countWhere(facilities, (f) => f.status === 'Pending');
        $('#statSuspended').textContent = countWhere(facilities, (f) => f.status === 'Suspended' || f.status === 'Inactive');
    }

    function renderOverviewLists() {
        const esc = AdminUI.esc;
        const pending = facilities.filter((f) => f.status === 'Pending');

        $('#pendingList').innerHTML = pending.length
            ? pending.map((f) => `
                <li>
                    <div class="li-main">
                        <strong>${esc(f.name)}</strong>
                        <small>${esc(f.district)} · Registered ${esc(f.registered)}</small>
                    </div>
                    <button class="btn btn-success btn-sm" data-action="approve-facility" data-id="${esc(f.id)}">Approve</button>
                </li>`).join('')
            : '<li><span class="muted">No pending approvals.</span></li>';

        $('#recentActivity').innerHTML = audit.slice(0, 5).map((a) => `
            <li>
                <div class="li-main">
                    <strong>${esc(a.action)}</strong>
                    <small>${esc(a.affected)} · ${esc(a.performedBy)}</small>
                </div>
                <small>${esc(a.timestamp)}</small>
            </li>`).join('');
    }

    function renderAll() {
        renderStats();
        renderOverviewLists();
    }

    document.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-action="approve-facility"]');
        if (!btn) return;

        const f = findById(facilities, btn.dataset.id);
        if (f) {
            setFacilityStatus(audit, f, 'Active');
            toast(`${f.name} approved.`);
        }
        renderAll();
    });

    renderAll();
})();