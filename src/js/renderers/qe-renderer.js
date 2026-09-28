function loadQEFromJSON(containerId, jsonUrl) {
  var CHEVRON_SVG =
    '<svg class="chevron" viewBox="0 0 20 20" fill="currentColor">' +
    '<path d="M7.293 4.707a1 1 0 011.414 0L14.414 10l-5.707 5.293a1 1 0 01-1.414-1.414L11.586 10 7.293 5.879a1 1 0 010-1.172z"/>' +
    '</svg>';

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function pctClass(pct) {
    if (pct === null || pct === undefined) return 'gray';
    if (pct >= 70) return 'green';
    if (pct >= 40) return 'orange';
    return 'red';
  }

  function fmtPct(pct) {
    return (pct === null || pct === undefined) ? 'N/A' : pct.toFixed(1) + '%';
  }

  function statusBadge(pct) {
    if (pct === null || pct === undefined) return '<span class="badge gray">N/A</span>';
    var cls = pctClass(pct);
    var label = pct >= 70 ? 'Good' : pct >= 40 ? 'Moderate' : 'Low';
    return '<span class="badge ' + cls + '">' + label + '</span>';
  }

  function renderEpicSummary(summary) {
    var pills = [
      { val: summary.tickets_count, lbl: 'QE<br>Tickets', cls: 'purple' },
      { val: fmtPct(summary.ac_coverage_pct), lbl: 'AC<br>Coverage', cls: pctClass(summary.ac_coverage_pct) },
      { val: fmtPct(summary.automation_pct), lbl: 'Automation<br>Coverage', cls: pctClass(summary.automation_pct) },
      { val: fmtPct(summary.first_pass_pct), lbl: 'First Pass<br>Rate', cls: pctClass(summary.first_pass_pct) },
      { val: summary.bugs_found, lbl: 'Bugs<br>Found', cls: summary.bugs_found > 0 ? 'red' : 'green' },
      { val: summary.total_tokens, lbl: 'Total<br>Tokens', cls: 'purple' },
      { val: summary.total_cost, lbl: 'Total<br>Cost', cls: 'teal' }
    ];

    return pills.map(function (p) {
      return '<div class="metric-pill ' + (p.cls || '') + '">' +
        '<div class="m-value">' + p.val + '</div>' +
        '<div class="m-label">' + p.lbl + '</div></div>';
    }).join('');
  }

  function renderTicketContent(ticket) {
    var ac = ticket.ac_scenario_coverage;
    var auto = ticket.automation_coverage;
    var fpr = ticket.first_pass_rate;
    var flake = ticket.flake_rate;
    var bugs = ticket.bugs;
    var triage = ticket.triage_accuracy;

    var uncoveredCell = ac.uncovered && ac.uncovered.length > 0
      ? ac.uncovered.map(function (u) { return '<span class="qe-uncovered-tag">' + esc(u) + '</span>'; }).join(' ')
      : '&mdash;';

    var coverageTable =
      '<table class="metric-tbl">' +
        '<thead><tr><th>Metric</th><th>Result</th><th>Coverage</th><th>Status</th><th>Details</th></tr></thead>' +
        '<tbody>' +
          '<tr>' +
            '<td>AC Scenario Coverage</td>' +
            '<td>' + ac.covered + ' / ' + ac.total + '</td>' +
            '<td><strong>' + fmtPct(ac.pct) + '</strong></td>' +
            '<td>' + statusBadge(ac.pct) + '</td>' +
            '<td>' + uncoveredCell + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td>Automation Coverage</td>' +
            '<td>' + auto.automated + ' / ' + auto.total + '</td>' +
            '<td><strong>' + fmtPct(auto.pct) + '</strong></td>' +
            '<td>' + statusBadge(auto.pct) + '</td>' +
            '<td>' + auto.manual + ' manual scenario' + (auto.manual !== 1 ? 's' : '') + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td>First Pass Rate</td>' +
            '<td>' + fpr.passed + ' / ' + fpr.executed + '</td>' +
            '<td><strong>' + fmtPct(fpr.pct) + '</strong></td>' +
            '<td>' + statusBadge(fpr.pct) + '</td>' +
            '<td>' + (fpr.source ? 'Source: ' + esc(fpr.source) : '&mdash;') + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td>Flake Rate</td>' +
            '<td>' + flake.retries_passed + ' / ' + flake.retries + ' retries</td>' +
            '<td><strong>' + fmtPct(flake.pct) + '</strong></td>' +
            '<td>' + (flake.pct === null || flake.pct === undefined ? '<span class="badge gray">N/A</span>' : (flake.pct === 0 ? '<span class="badge green">Clean</span>' : '<span class="badge orange">Flaky</span>')) + '</td>' +
            '<td>&mdash;</td>' +
          '</tr>' +
          '<tr>' +
            '<td>Bugs</td>' +
            '<td>' + bugs.found + ' found</td>' +
            '<td>' + bugs.verified + ' verified</td>' +
            '<td>' + (bugs.found === 0 ? '<span class="badge green">None</span>' : '<span class="badge red">' + bugs.found + ' Bug' + (bugs.found !== 1 ? 's' : '') + '</span>') + '</td>' +
            '<td>&mdash;</td>' +
          '</tr>' +
          '<tr>' +
            '<td>Triage Accuracy</td>' +
            '<td>' + triage.correct + ' / ' + triage.total + '</td>' +
            '<td><strong>' + (triage.pct !== null ? triage.pct + '%' : 'N/A') + '</strong></td>' +
            '<td>' + (triage.pct !== null ? statusBadge(triage.pct) : '<span class="badge gray">N/A</span>') + '</td>' +
            '<td>' + (triage.reason ? esc(triage.reason.replace(/_/g, ' ')) : '&mdash;') + '</td>' +
          '</tr>' +
        '</tbody>' +
      '</table>';

    var statsCards = [
      { lbl: 'Flake Rate', val: fmtPct(ticket.flake_rate.pct), cls: ticket.flake_rate.pct > 0 ? 'warn' : '' },
      { lbl: 'Bugs Found', val: ticket.bugs.found, cls: ticket.bugs.found > 0 ? 'warn' : '' },
      { lbl: 'Bugs Verified', val: ticket.bugs.verified },
      { lbl: 'Triage Accuracy', val: ticket.triage_accuracy.pct !== null ? ticket.triage_accuracy.pct + '%' : 'N/A' },
      { lbl: 'Est. Cost', val: ticket.cost.estimated_cost_usd },
      { lbl: 'Wall Time', val: ticket.cost.wall_time }
    ];

    var statsHtml = statsCards.map(function (c) {
      return '<div class="health-card' + (c.cls ? ' ' + c.cls : '') + '">' +
        '<div class="h-label">' + c.lbl + '</div>' +
        '<div class="h-value">' + c.val + '</div>' +
      '</div>';
    }).join('');

    var stageRows = ticket.cost.per_stage.map(function (s) {
      return '<tr>' +
        '<td>' + esc(s.stage.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); })) + '</td>' +
        '<td>' + format_tokens_js(s.tokens_in) + '</td>' +
        '<td>' + format_tokens_js(s.tokens_out) + '</td>' +
        '<td>' + esc(s.duration) + '</td>' +
      '</tr>';
    }).join('');

    var stageTable = '';
    if (stageRows) {
      stageTable = '<div class="ticket-section-title">Cost Breakdown by Stage</div>' +
        '<table class="metric-tbl">' +
          '<thead><tr><th>Stage</th><th>Tokens In</th><th>Tokens Out</th><th>Duration</th></tr></thead>' +
          '<tbody>' + stageRows + '</tbody>' +
        '</table>';
    }

    return '<div class="health-strip">' + statsHtml + '</div>' +
      '<div class="qe-coverage-section">' +
        '<div class="ticket-section-title">Coverage &amp; Quality Metrics</div>' +
        coverageTable +
      '</div>' +
      stageTable;
  }

  function renderTicket(ticket) {
    var metaLine = '';
    if (ticket.pr_url) {
      metaLine += '<a class="qe-pr-link" href="' + esc(ticket.pr_url) + '" target="_blank">PR &rarr;</a>';
    }
    if (ticket.mode) {
      metaLine += '<span class="badge blue" style="font-size:0.7em;">' + esc(ticket.mode) + '</span>';
    }
    if (ticket.phase !== '' && ticket.phase !== undefined) {
      metaLine += '<span class="badge purple" style="font-size:0.7em;">Phase ' + esc(String(ticket.phase)) + '</span>';
    }

    return '<div class="ticket">' +
      '<div class="ticket-header" onclick="toggle(this,\'.ticket\')">' +
        CHEVRON_SVG +
        '<a class="ticket-label" href="' + esc(ticket.ticket_link) + '" target="_blank" onclick="event.stopPropagation()">' + esc(ticket.ticket_id) + '</a>' +
        '<span class="ticket-summary">' + esc(ticket.change_name || ticket.ticket_name) + '</span>' +
        '<span style="display:flex; gap:6px; align-items:center; flex-shrink:0;">' + metaLine + '</span>' +
      '</div>' +
      '<div class="ticket-body"><div class="ticket-content">' +
        renderTicketContent(ticket) +
      '</div></div>' +
    '</div>';
  }

  function format_tokens_js(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  function renderTicketFlat(ticket) {
    var metaLine = '';
    if (ticket.pr_url) {
      metaLine += '<a class="qe-pr-link" href="' + esc(ticket.pr_url) + '" target="_blank">PR &rarr;</a>';
    }
    if (ticket.mode) {
      metaLine += '<span class="badge blue" style="font-size:0.7em;">' + esc(ticket.mode) + '</span>';
    }
    if (ticket.phase !== '' && ticket.phase !== undefined) {
      metaLine += '<span class="badge purple" style="font-size:0.7em;">Phase ' + esc(String(ticket.phase)) + '</span>';
    }

    return '<div class="epic open">' +
      '<div class="epic-header" onclick="toggle(this,\'.epic\')">' +
        CHEVRON_SVG +
        '<a class="epic-id" href="' + esc(ticket.ticket_link) + '" target="_blank">' + esc(ticket.ticket_id) + '</a>' +
        '<span class="epic-title">' + esc(ticket.change_name || ticket.ticket_name) + '</span>' +
        '<span style="display:flex; gap:6px; align-items:center; flex-shrink:0;">' + metaLine + '</span>' +
      '</div>' +
      '<div class="epic-body"><div class="epic-content">' +
        renderTicketContent(ticket) +
      '</div></div>' +
    '</div>';
  }

  function renderEpic(epic) {
    if (!epic.has_epic) {
      return epic.tickets.map(renderTicketFlat).join('');
    }

    return '<div class="epic open">' +
      '<div class="epic-header" onclick="toggle(this,\'.epic\')">' +
        CHEVRON_SVG +
        '<a class="epic-id" href="' + esc(epic.epic_link) + '" target="_blank">Epic: ' + esc(epic.epic_id) + '</a>' +
        '<span class="epic-title"><a href="' + esc(epic.epic_link) + '" target="_blank">' + esc(epic.epic_title) + '</a></span>' +
      '</div>' +
      '<div class="epic-body"><div class="epic-content">' +
        '<div class="epic-metrics">' + renderEpicSummary(epic.summary) + '</div>' +
        epic.tickets.map(renderTicket).join('') +
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
          '<p style="font-size:1.1em; font-weight:600;">No QE data available yet</p>' +
          '<p style="font-size:0.85em; margin-top:6px;">QE metrics will appear here once QE pipeline runs are completed.</p>' +
          '</div>';
        return;
      }
      el.innerHTML = data.epics.map(renderEpic).join('');
    });
}
