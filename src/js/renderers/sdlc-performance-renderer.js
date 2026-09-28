var SDLC_OPERATORS = {
  certmanager: {
    label: 'Cert Manager',
    epicsJson: 'data/processed/cert_manager_epics.json',
    tabId: 'certmanager'
  },
  ztwim: {
    label: 'ZTWIM',
    epicsJson: 'data/processed/ztwim_epics.json',
    tabId: 'ztwim'
  },
  sscso: {
    label: 'SSCSI',
    epicsJson: 'data/processed/sscsi_epics.json',
    tabId: 'sscso'
  },
  eso: {
    label: 'ESO',
    epicsJson: 'data/processed/eso_epics.json',
    tabId: 'eso'
  },
  smc: {
    label: 'SMC',
    epicsJson: 'data/processed/smc_epics.json',
    tabId: 'smc'
  }
};

var SDLC_SUMMARY_DATA = null;

var SDLC_SUMMARY_JSON = 'data/processed/sdlc_summary_by_month.json';

function escHtml(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function parseCost(costStr) {
  if (!costStr) return 0;
  return parseFloat(String(costStr).replace(/[^0-9.]/g, '')) || 0;
}

function parseTokens(tokenStr) {
  if (!tokenStr) return 0;
  var s = String(tokenStr).trim().toLowerCase();
  var num = parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
  if (s.indexOf('m') !== -1) return num * 1000000;
  if (s.indexOf('k') !== -1) return num * 1000;
  return num;
}

function formatTokens(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(Math.round(n));
}

function formatCost(n) {
  return '$' + n.toFixed(2);
}

function formatTimeSavedHours(hours) {
  if (hours === null || hours === undefined) return '\u2014';
  var sign = hours < 0 ? '-' : '';
  var abs = Math.abs(hours);
  var h = Math.floor(abs);
  var m = Math.round((abs - h) * 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  return sign + h + 'h ' + m + 'm (w.r.t. Cursor)';
}

function formatSummaryValue(value, formatter) {
  if (value === null || value === undefined) return '\u2014';
  return formatter(value);
}

function aggregateOperatorData(data) {
  var epics = data.epics || [];
  var tickets = [];
  var totalCost = 0;
  var totalTokens = 0;

  epics.forEach(function(epic) {
    (epic.tickets || []).forEach(function(ticket) {
      tickets.push(ticket);
      totalCost += parseCost(ticket.health && ticket.health.run_cost);
      totalTokens += parseTokens(ticket.health && ticket.health.total_tokens);
    });
  });

  return {
    epics: epics,
    tickets: tickets,
    epicCount: epics.length,
    ticketCount: tickets.length,
    totalCost: totalCost,
    totalTokens: totalTokens
  };
}

function renderSummaryRow(monthKey) {
  var tbody = document.getElementById('sdlcSummaryBody');
  if (!tbody) return;

  if (!SDLC_SUMMARY_DATA || !SDLC_SUMMARY_DATA.months) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#95a5a6;">Loading summary&hellip;</td></tr>';
    return;
  }

  var summary = SDLC_SUMMARY_DATA.months[monthKey];
  if (!summary || summary.run_count === 0) {
    tbody.innerHTML = '<tr><td>&mdash;</td><td>&mdash;</td><td>&mdash;</td><td>&mdash;</td></tr>';
    return;
  }

  tbody.innerHTML = '<tr>' +
    '<td>' + escHtml(formatSummaryValue(summary.story_points, function(v) {
      return Number(v) % 1 === 0 ? String(v) : String(v);
    })) + '</td>' +
    '<td>' + escHtml(formatSummaryValue(summary.total_cost_usd, formatCost)) + '</td>' +
    '<td>' + escHtml(formatSummaryValue(summary.total_tokens, formatTokens)) + '</td>' +
    '<td>' + escHtml(formatTimeSavedHours(summary.time_saved_hours)) + '</td>' +
  '</tr>';
}

function loadSDLCSummaryMonth(monthKey) {
  if (SDLC_SUMMARY_DATA) {
    renderSummaryRow(monthKey);
    return;
  }

  fetch(SDLC_SUMMARY_JSON)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      SDLC_SUMMARY_DATA = data;
      renderSummaryRow(monthKey);
    })
    .catch(function() {
      var tbody = document.getElementById('sdlcSummaryBody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#c0392b;">Failed to load summary metrics</td></tr>';
      }
    });
}

// ---------------------------------------------------------------------------
// Cross-operator aggregation state
// ---------------------------------------------------------------------------

var AGG_OPERATOR_IDS = ['certmanager', 'ztwim', 'sscso', 'eso', 'smc'];
var AGG_DATA = null; // { operators: [ { id, label, tabId, tokens, cost, tickets, epicCount, ticketCount } ], totals: { tokens, cost } }
var AGG_VIEW = 'chart'; // 'chart' | 'table'

function getSelectedAggMetric() {
  var radios = document.getElementsByName('aggMetric');
  for (var i = 0; i < radios.length; i++) {
    if (radios[i].checked) return radios[i].value;
  }
  return 'tokens';
}

function toggleAggView(view) {
  AGG_VIEW = view;
  var btns = document.querySelectorAll('#aggViewToggle .view-toggle-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-view') === view);
  }
  renderAggregationView();
}

// ---------------------------------------------------------------------------
// Aggregation chart builders
// ---------------------------------------------------------------------------

function buildAggBarChart(metric) {
  if (!AGG_DATA) return '';
  var ops = AGG_DATA.operators;
  var maxVal = Math.max.apply(null, ops.map(function(o) { return metric === 'cost' ? o.cost : o.tokens; })) || 1;
  var tickCount = 5;

  var yAxis = '';
  for (var i = tickCount; i >= 0; i--) {
    var tick = maxVal * i / tickCount;
    yAxis += '<span>' + escHtml(metric === 'cost' ? formatCost(tick) : formatTokens(tick)) + '</span>';
  }

  var gridlines = '';
  for (var g = 0; g <= tickCount; g++) {
    gridlines += '<div class="vchart-gridline"></div>';
  }

  var groups = ops.map(function(o) {
    var val = metric === 'cost' ? o.cost : o.tokens;
    var heightPct = maxVal ? (val / maxVal * 100) : 0;
    var formattedVal = metric === 'cost' ? formatCost(val) : formatTokens(val);
    return '<div class="vchart-group">' +
      '<div class="vchart-bars">' +
        '<div class="vchart-bar op-' + o.id + '" style="height:' + heightPct.toFixed(1) + '%" title="' + escHtml(o.label) + ': ' + escHtml(formattedVal) + '">' +
          '<span class="vchart-bar-val">' + escHtml(formattedVal) + '</span>' +
        '</div>' +
      '</div>' +
      '<span class="vchart-label">' + escHtml(o.label) + '</span>' +
    '</div>';
  }).join('');

  return '<div class="vchart-wrapper">' +
    '<div class="vchart-y-axis">' + yAxis + '</div>' +
    '<div class="vchart-area">' +
      '<div class="vchart-gridlines">' + gridlines + '</div>' +
      '<div class="vchart-groups">' + groups + '</div>' +
    '</div>' +
  '</div>' +
  '<div class="chart-legend">' +
    ops.map(function(o) {
      return '<span class="legend-item"><span class="legend-dot op-' + o.id + '"></span> ' + escHtml(o.label) + '</span>';
    }).join('') +
  '</div>';
}

function buildAggTable() {
  if (!AGG_DATA) return '';
  var ops = AGG_DATA.operators;
  var totals = AGG_DATA.totals;

  var rows = ops.map(function(o) {
    return '<tr>' +
      '<td><strong>' + escHtml(o.label) + '</strong></td>' +
      '<td>' + o.ticketCount + '</td>' +
      '<td>' + o.epicCount + '</td>' +
      '<td>' + escHtml(formatTokens(o.tokens)) + '</td>' +
      '<td>' + escHtml(formatCost(o.cost)) + '</td>' +
    '</tr>';
  }).join('');

  var totalTickets = ops.reduce(function(s, o) { return s + o.ticketCount; }, 0);
  var totalEpics   = ops.reduce(function(s, o) { return s + o.epicCount; }, 0);

  return '<table class="tbl">' +
    '<thead><tr>' +
      '<th>Operator</th><th>Tickets</th><th>Epics</th><th>Total Tokens</th><th>Total Cost</th>' +
    '</tr></thead>' +
    '<tbody>' + rows +
      '<tr style="border-top:2px solid #d5dce3; font-weight:700;">' +
        '<td>Total</td>' +
        '<td>' + totalTickets + '</td>' +
        '<td>' + totalEpics + '</td>' +
        '<td>' + escHtml(formatTokens(totals.tokens)) + '</td>' +
        '<td>' + escHtml(formatCost(totals.cost)) + '</td>' +
      '</tr>' +
    '</tbody></table>';
}

// ---------------------------------------------------------------------------
// Render the currently selected aggregation view
// ---------------------------------------------------------------------------

function renderAggregationView() {
  var container = document.getElementById('sdlcAnalyticsContent');
  if (!container || !AGG_DATA) return;

  var metric = getSelectedAggMetric();
  var ops = AGG_DATA.operators;
  var totals = AGG_DATA.totals;

  var kpiHtml =
    '<div class="sdlc-kpi-strip">' +
      '<div class="sdlc-kpi"><span class="sdlc-kpi-val">' + ops.length + '</span><span class="sdlc-kpi-lbl">Operators</span></div>' +
      '<div class="sdlc-kpi"><span class="sdlc-kpi-val">' + ops.reduce(function(s, o) { return s + o.ticketCount; }, 0) + '</span><span class="sdlc-kpi-lbl">Tickets</span></div>' +
      '<div class="sdlc-kpi"><span class="sdlc-kpi-val">' + escHtml(formatTokens(totals.tokens)) + '</span><span class="sdlc-kpi-lbl">Total Tokens</span></div>' +
      '<div class="sdlc-kpi"><span class="sdlc-kpi-val">' + escHtml(formatCost(totals.cost)) + '</span><span class="sdlc-kpi-lbl">Total Cost</span></div>' +
    '</div>';

  if (AGG_VIEW === 'chart') {
    var chartTitle = metric === 'cost' ? 'Cost by Operator' : 'Total Tokens by Operator';
    container.innerHTML = kpiHtml +
      '<h5 class="sdlc-subheading">' + chartTitle + '</h5>' +
      buildAggBarChart(metric) +
      '<h5 class="sdlc-subheading">Operator Summary</h5>' +
      buildAggTable();
  } else {
    container.innerHTML = kpiHtml +
      '<h5 class="sdlc-subheading">Operator Summary</h5>' +
      buildAggTable();
  }
}

// ---------------------------------------------------------------------------
// Load all operators and build AGG_DATA
// ---------------------------------------------------------------------------

function loadAllOperatorData() {
  var container = document.getElementById('sdlcAnalyticsContent');

  var fetches = AGG_OPERATOR_IDS.map(function(id) {
    var op = SDLC_OPERATORS[id];
    if (!op) return Promise.resolve(null);
    return fetch(op.epicsJson)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var agg = aggregateOperatorData(data);
        return {
          id: id === 'sscso' ? 'sscsi' : id,
          label: op.label,
          tabId: op.tabId,
          tokens: agg.totalTokens,
          cost: agg.totalCost,
          tickets: agg.tickets,
          epicCount: agg.epicCount,
          ticketCount: agg.ticketCount
        };
      })
      .catch(function() { return null; });
  });

  Promise.all(fetches).then(function(results) {
    var operators = results.filter(function(r) { return r !== null; });
    var totalTokens = operators.reduce(function(s, o) { return s + o.tokens; }, 0);
    var totalCost   = operators.reduce(function(s, o) { return s + o.cost; }, 0);

    AGG_DATA = {
      operators: operators,
      totals: { tokens: totalTokens, cost: totalCost }
    };

    renderAggregationView();
  }).catch(function() {
    if (container) {
      container.innerHTML =
        '<div class="sdlc-empty-state">' +
          '<p style="font-size:1em; font-weight:600; color:#c0392b; margin:0 0 6px 0;">Failed to load cross-operator metrics</p>' +
          '<p style="font-size:0.88em; color:#95a5a6; margin:0;">Check that processed metrics JSON files exist.</p>' +
        '</div>';
    }
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function initSDLCDashboard() {
  var monthSelect = document.getElementById('sdlcMonthSelect');
  if (monthSelect) {
    loadSDLCSummaryMonth(monthSelect.value);
  }

  loadAllOperatorData();
}
