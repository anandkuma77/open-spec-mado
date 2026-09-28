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
