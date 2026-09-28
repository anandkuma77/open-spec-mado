/* ── Pipeline Flow 2 — Floating Tooltip ── */
(function () {
  var tipData = {
    'spec': {
      title: 'Spec Validation',
      text: '',
      links: [['Prompt and result', 'https://github.com/anandkuma77/open-spec-mado/tree/main/docs/prompt-examples/spec-generation']]
    },
    'repo-assess': {
      title: 'Repo Assessment',
      text: '',
      links: [['Prompt and result', 'https://github.com/anandkuma77/open-spec-mado/tree/main/docs/prompt-examples/Repo-Assessment']]
    },
    'planning': {
      title: 'Planning Phase',
      text: '',
      links: [['Prompt and result', 'https://github.com/anandkuma77/open-spec-mado/tree/main/docs/prompt-examples/Planning']]
    },
    'tasks': {
      title: 'Task Generation',
      text: '',
      links: [['Prompt and result', 'https://github.com/anandkuma77/open-spec-mado/tree/main/docs/prompt-examples/Tasks']]
    },
    'evals': {
      title: 'Eval Pipeline',
      text: '',
      links: [['eval-generation', 'https://github.com/sujkini/openspec/tree/openspec-operator-generic/eval-generation']]
    },
    'codegen': {
      title: 'Code & Unit Tests Generation',
      text: '',
      links: [['Prompt and result', 'https://github.com/anandkuma77/open-spec-mado/tree/main/docs/prompt-examples/Code-Generation-evals-example-ztwim']]
    },
    'agents-md': {
      title: 'agents.md',
      text: '',
      links: [['agents.md', 'https://github.com/nhegde07/zero-trust-workload-identity-manager/blob/OAPE-859/openspec/inputs/agents.md']]
    }
  };

  var tip = document.createElement('div');
  tip.id = 'pf2Tip';
  document.body.appendChild(tip);
  var hideTimer;

  function showTip(node, key) {
    var d = tipData[key];
    if (!d) return;
    clearTimeout(hideTimer);
    var linksHtml = d.links.map(function (l) {
      return '<a href="' + l[1] + '" target="_blank">' + l[0] + '</a>';
    }).join('');
    tip.innerHTML = '<h4>' + d.title + '</h4><p>' + d.text + '</p><div class="pf2-links">' + linksHtml + '</div>';
    tip.style.display = 'block';
    tip.style.pointerEvents = 'auto';
    var rect = node.getBoundingClientRect();
    var left = rect.left + rect.width / 2 - 160;
    var top = rect.bottom + 6;
    if (left < 12) left = 12;
    if (left + 320 > window.innerWidth - 12) left = window.innerWidth - 332;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    if (top + tip.offsetHeight > window.innerHeight - 12) {
      tip.style.top = (rect.top - tip.offsetHeight - 6) + 'px';
    }
    requestAnimationFrame(function () { tip.classList.add('visible'); });
  }

  function hideTip() {
    hideTimer = setTimeout(function () {
      tip.classList.remove('visible');
      setTimeout(function () {
        tip.style.display = 'none';
        tip.style.pointerEvents = 'none';
      }, 200);
    }, 250);
  }

  document.addEventListener('mouseenter', function (e) {
    var node = e.target.closest('[data-tip]');
    if (node) showTip(node, node.getAttribute('data-tip'));
  }, true);

  document.addEventListener('mouseleave', function (e) {
    var node = e.target.closest('[data-tip]');
    if (node) hideTip();
  }, true);

  tip.addEventListener('mouseenter', function () {
    clearTimeout(hideTimer);
    tip.classList.add('visible');
    tip.style.pointerEvents = 'auto';
  });
  tip.addEventListener('mouseleave', function () {
    tip.classList.remove('visible');
    setTimeout(function () {
      tip.style.display = 'none';
      tip.style.pointerEvents = 'none';
    }, 200);
  });
})();
