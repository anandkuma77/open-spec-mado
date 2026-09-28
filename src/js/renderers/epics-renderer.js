function loadEpicsFromJSON(containerId, jsonUrl) {
  var CHEVRON_SVG =
    '<svg class="chevron" viewBox="0 0 20 20" fill="currentColor">' +
    '<path d="M7.293 4.707a1 1 0 011.414 0L14.414 10l-5.707 5.293a1 1 0 01-1.414-1.414L11.586 10 7.293 5.879a1 1 0 010-1.172z"/>' +
    '</svg>';

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function badgeClass(status) {
    var s = status.toLowerCase();
    if (s === 'complete' || s === 'completed') return 'green';
    if (s === 'in progress' || s === 'wip') return 'orange';
    return 'blue';
  }

  function renderEpic(epic) {
    var pills = [
      { val: epic.summary.runs_completed + '/' + epic.summary.runs_total, lbl: 'Runs<br>Done', cls: 'green' },
      { val: epic.summary.total_tokens, lbl: 'Total<br>Tokens', cls: 'purple' },
      { val: epic.summary.agent_success_pct, lbl: 'Agent<br>Success', cls: 'teal' },
      { val: epic.summary.open_blockers, lbl: 'Open<br>Blockers', cls: '' },
      { val: epic.summary.unit_tests, lbl: 'Unit<br>Tests', sty: 'border-left:4px solid #8e44ad;' },
      { val: epic.summary.unit_test_tokens, lbl: 'Unit Test<br>Tokens', sty: 'border-left:4px solid #8e44ad;' }
    ];

    var pillsHtml = pills.map(function (p) {
      var c = 'metric-pill' + (p.cls ? ' ' + p.cls : '');
      var s = p.sty ? ' style="' + p.sty + '"' : '';
      return '<div class="' + c + '"' + s + '>' +
        '<div class="m-value">' + p.val + '</div>' +
        '<div class="m-label">' + p.lbl + '</div></div>';
    }).join('');

    return '<div class="epic open">' +
      '<div class="epic-header" onclick="toggle(this,\'.epic\')">' +
        CHEVRON_SVG +
        '<a class="epic-id" href="' + esc(epic.epic_link) + '" target="_blank">Epic: ' + esc(epic.epic_id) + '</a>' +
        '<span class="epic-title"><a href="' + esc(epic.epic_link) + '" target="_blank">' + esc(epic.epic_title) + '</a></span>' +
        '<div class="epic-meta">' +
          '<span class="badge ' + badgeClass(epic.status) + '">' + esc(epic.status) + '</span>' +
          '<div class="epic-progress"><div class="epic-progress-fill" style="width:' + epic.progress_pct + '%"></div></div>' +
        '</div>' +
      '</div>' +
      '<div class="epic-body"><div class="epic-content">' +
        '<div class="epic-metrics">' + pillsHtml + '</div>' +
        epic.tickets.map(renderTicket).join('') +
      '</div></div>' +
    '</div>';
  }

  function renderTicket(ticket) {
    var cards = [
      { lbl: 'Total Tokens', val: ticket.health.total_tokens },
      { lbl: 'Run Cost', val: ticket.health.run_cost },
      { lbl: 'Wall Time', val: ticket.health.wall_time },
      { lbl: 'Eval Rejections', val: ticket.health.eval_rejections },
      { lbl: 'Agent Success', val: ticket.health.agent_success_pct,
        sub: '(' + ticket.health.tasks_passed + '/' + ticket.health.tasks_total + ' Tasks)' }
    ];

    var healthHtml = cards.map(function (c) {
      return '<div class="health-card">' +
        '<div class="h-label">' + c.lbl + '</div>' +
        '<div class="h-value">' + c.val + '</div>' +
        (c.sub ? '<div class="h-sub">' + c.sub + '</div>' : '') +
      '</div>';
    }).join('');

    var rows = ticket.phases.map(function (p) {
      return '<tr>' +
        '<td>' + esc(p.phase_name) + '</td>' +
        '<td><span class="check">&#9745;</span><span class="status-passed">' + esc(p.status) + '</span></td>' +
        '<td>' + esc(p.iterations) + '</td>' +
        '<td>' + esc(p.time_taken) + '</td>' +
        '<td>' + esc(p.tokens_in_out) + '</td>' +
        '<td>' + esc(p.quality) + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="ticket">' +
      '<div class="ticket-header" onclick="toggle(this,\'.ticket\')">' +
        CHEVRON_SVG +
        '<a class="ticket-label" href="' + esc(ticket.ticket_link) + '" target="_blank" onclick="event.stopPropagation()">' + esc(ticket.ticket_id) + '</a>' +
        '<span class="ticket-summary">' + esc(ticket.ticket_summary) + ' &mdash; <strong>' + esc(ticket.agent_label) + '</strong></span>' +
        '<span class="badge ' + badgeClass(ticket.status) + '" style="flex-shrink:0;">' + esc(ticket.status) + '</span>' +
      '</div>' +
      '<div class="ticket-body"><div class="ticket-content">' +
        '<div class="health-strip">' + healthHtml + '</div>' +
        '<div class="ticket-section-title">Phase-by-Phase Telemetry &amp; Iteration Waterfall</div>' +
        '<table class="metric-tbl">' +
          '<thead><tr><th>Phase</th><th>Status</th><th>Loops / Iter.</th><th>Time Taken</th><th>Tokens In / Out</th><th>Quality / Eval Output</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div></div>' +
    '</div>';
  }

  fetch(jsonUrl)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var el = document.getElementById(containerId);
      if (!el) return;
      if (!data.epics || data.epics.length === 0) {
        el.innerHTML = '<div class="card" style="text-align:center; color:#95a5a6; padding:32px;">' +
          '<p style="font-size:1.1em; font-weight:600;">No epic data available yet</p>' +
          '<p style="font-size:0.85em; margin-top:6px;">Metrics will appear here once pipeline runs are completed.</p>' +
          '</div>';
        return;
      }
      el.innerHTML = data.epics.map(renderEpic).join('');
    });
}
