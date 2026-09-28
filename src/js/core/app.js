document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelector('.tab-btn[data-tab="' + tabId + '"]').classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');
}

function toggleInline(el) {
  el.closest('.epic-inline').classList.toggle('open');
}

function toggle(el, selector) {
  el.closest(selector).classList.toggle('open');
}

function toggleQuantView(view) {
  var tableView = document.getElementById('quantTableView');
  var chartView = document.getElementById('quantChartView');
  var btns = document.querySelectorAll('#quantViewToggle .view-toggle-btn');
  btns.forEach(function(b) { b.classList.remove('active'); });
  document.querySelector('#quantViewToggle .view-toggle-btn[data-view="' + view + '"]').classList.add('active');
  if (view === 'chart') {
    tableView.style.display = 'none';
    chartView.style.display = 'block';
  } else {
    tableView.style.display = 'block';
    chartView.style.display = 'none';
  }
}

function switchChartType(type, btn) {
  var map = { barH: 'chartBarH', barV: 'chartBarV', donut: 'chartDonut' };
  var container = document.getElementById('quantChartView');
  container.querySelectorAll('.chart-type-panel').forEach(function(p) { p.classList.remove('active'); });
  container.querySelectorAll('.chart-type-btn').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById(map[type]).classList.add('active');
  btn.classList.add('active');
}

function toggleEpicView(epic, view) {
  var tableView = document.getElementById(epic + 'TableView');
  var chartView = document.getElementById(epic + 'ChartView');
  var toggle = document.getElementById(epic + 'ViewToggle');
  toggle.querySelectorAll('.view-toggle-btn').forEach(function(b) { b.classList.remove('active'); });
  toggle.querySelector('.view-toggle-btn[data-view="' + view + '"]').classList.add('active');
  if (view === 'chart') {
    tableView.style.display = 'none';
    chartView.style.display = 'block';
  } else {
    tableView.style.display = 'block';
    chartView.style.display = 'none';
  }
}

function switchEpicChart(epic, type, btn) {
  var container = document.getElementById(epic + 'ChartView');
  container.querySelectorAll('.chart-type-panel').forEach(function(p) { p.classList.remove('active'); });
  container.querySelectorAll('.chart-type-btn').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById(epic + '-' + type).classList.add('active');
  btn.classList.add('active');
}

function loadTabContent(tabId, url) {
  return fetch(url)
    .then(function(r) { return r.text(); })
    .then(function(html) {
      document.getElementById('tab-' + tabId).innerHTML = html;
    });
}

window.addEventListener('scroll', function() {
  var btn = document.getElementById('backToTop');
  if (window.scrollY > 300) {
    btn.classList.add('visible');
  } else {
    btn.classList.remove('visible');
  }
});

(function init() {
  var tabs = [
    { id: 'linksrepos', url: 'src/tabs/linksrepos.html' },
    { id: 'cve', url: 'src/tabs/cve.html', cveTabJson: 'data/processed/cve/cve_tab.json' }
  ];

  var cveIssueSources = [
    { label: 'Cert Manager', cssClass: 'certmanager', url: 'data/processed/cve/cert_manager_cve.json' },
    { label: 'ZTWIM', cssClass: 'ztwim', url: 'data/processed/cve/ztwim_cve.json' },
    { label: 'SSCSI', cssClass: 'sscsi', url: 'data/processed/cve/sscsi_cve.json' },
    { label: 'Must Gather', cssClass: 'mustgather', url: 'data/processed/cve/must_gather_cve.json' },
    { label: 'ESO', cssClass: 'eso', url: 'data/processed/cve/eso_cve.json' },
    { label: 'SMC', cssClass: 'smc', url: 'data/processed/cve/smc_cve.json' },
    { label: 'Operator SDK', cssClass: 'operatorsdk', url: 'data/processed/cve/operator_sdk_cve.json' }
  ];

  tabs.forEach(function(tab) {
    loadTabContent(tab.id, tab.url).then(function() {
      if (!tab.cveTabJson) return;
      var script = document.createElement('script');
      script.src = 'src/js/renderers/cve-tab-renderer.js?v=2';
      script.onload = function() {
        initCveTabDashboard('cve-tab-dashboard', tab.cveTabJson);
      };
      document.body.appendChild(script);

      var issuesTableScript = document.createElement('script');
      issuesTableScript.src = 'src/js/renderers/cve-issues-table-renderer.js?v=1';
      issuesTableScript.onload = function() {
        initCveIssuesTable('cve-all-issues-table', cveIssueSources);
      };
      document.body.appendChild(issuesTableScript);
    });
  });

  var epicTabs = [
    { id: 'certmanager', url: 'src/tabs/certmanager.html', container: 'certmanager-epics-container', json: 'data/processed/cert_manager_epics.json', qeContainer: 'certmanager-qe-container', qeJson: 'data/processed/cert_manager_qe.json' },
    { id: 'ztwim', url: 'src/tabs/ztwim.html', container: 'ztwim-epics-container', json: 'data/processed/ztwim_epics.json', qeContainer: 'ztwim-qe-container', qeJson: 'data/processed/ztwim_qe.json' },
    { id: 'sscso', url: 'src/tabs/sscso.html', container: 'sscsi-epics-container', json: 'data/processed/sscsi_epics.json', qeContainer: 'sscsi-qe-container', qeJson: 'data/processed/sscsi_qe.json' },
    { id: 'mustgather', url: 'src/tabs/mustgather.html', container: 'mustgather-epics-container', json: 'data/processed/must_gather_epics.json', qeContainer: 'mustgather-qe-container', qeJson: 'data/processed/must_gather_qe.json' },
    { id: 'eso', url: 'src/tabs/eso.html', container: 'eso-epics-container', json: 'data/processed/eso_epics.json', qeContainer: 'eso-qe-container', qeJson: 'data/processed/eso_qe.json' },
    { id: 'smc', url: 'src/tabs/smc.html', container: 'smc-epics-container', json: 'data/processed/smc_epics.json', qeContainer: 'smc-qe-container', qeJson: 'data/processed/smc_qe.json' }
  ];

  var epicTabPromises = epicTabs.map(function(tab) {
    return { promise: loadTabContent(tab.id, tab.url), container: tab.container, json: tab.json, qeContainer: tab.qeContainer, qeJson: tab.qeJson };
  });

  var rendererScript = document.createElement('script');
  rendererScript.src = 'src/js/renderers/epics-renderer.js';
  rendererScript.onload = function() {
    epicTabPromises.forEach(function(t) {
      t.promise.then(function() {
        loadEpicsFromJSON(t.container, t.json);
      });
    });

    var qeScript = document.createElement('script');
    qeScript.src = 'src/js/renderers/qe-renderer.js';
    qeScript.onload = function() {
      epicTabPromises.forEach(function(t) {
        t.promise.then(function() {
          loadQEFromJSON(t.qeContainer, t.qeJson);
        });
      });
    };
    document.body.appendChild(qeScript);
  };
  document.body.appendChild(rendererScript);

  loadTabContent('overview', 'src/tabs/overview.html').then(function() {
    fetch('src/partials/layered-architecture.html')
      .then(function(r) { return r.text(); })
      .then(function(html) {
        var container = document.getElementById('layeredArchitectureContainer');
        if (container) container.innerHTML = html;
      });

    fetch('src/partials/pipeline-flow2.html?v=11')
      .then(function(r) { return r.text(); })
      .then(function(html) {
        var container = document.getElementById('pf2Container');
        if (container) {
          container.innerHTML = html;
          var s = document.createElement('script');
          s.src = 'src/js/renderers/pipeline-flow2.js?v=6';
          document.body.appendChild(s);
        }
      });

    var sdlcScript = document.createElement('script');
    sdlcScript.src = 'src/js/renderers/sdlc-performance-renderer.js?v=4';
    sdlcScript.onload = function() {
      initSDLCDashboard();
    };
    document.body.appendChild(sdlcScript);
  });
})();
