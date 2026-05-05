// Content script — injects "Open in AgentLens" button on NGA builder pages.
(function () {
  'use strict';

  var BUTTON_ID = 'agentlens-open-btn';
  var POLL_INTERVAL = 2000;
  var MAX_ATTEMPTS = 30;

  var injected = false;
  var attempts = 0;

  function deepQueryAll(root, selector) {
    var results = Array.from(root.querySelectorAll(selector));
    root.querySelectorAll('*').forEach(function (el) {
      if (el.shadowRoot) {
        results = results.concat(deepQueryAll(el.shadowRoot, selector));
      }
    });
    return results;
  }

  function findCopyCodeButton() {
    var buttons = document.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var text = buttons[i].textContent.trim();
      if (text === 'Copy Code' || text === 'Copy code') return buttons[i];
    }

    var deepButtons = deepQueryAll(document.body, 'button');
    for (var j = 0; j < deepButtons.length; j++) {
      var txt = deepButtons[j].textContent.trim();
      if (txt === 'Copy Code' || txt === 'Copy code') return deepButtons[j];
      if (deepButtons[j].getAttribute('aria-label') === 'Copy Code') return deepButtons[j];
    }

    var lwcButtons = deepQueryAll(document.body, 'lightning-button');
    for (var k = 0; k < lwcButtons.length; k++) {
      if (lwcButtons[k].getAttribute('label') === 'Copy Code') {
        return lwcButtons[k].shadowRoot
          ? lwcButtons[k].shadowRoot.querySelector('button') || lwcButtons[k]
          : lwcButtons[k];
      }
    }

    return null;
  }

  function createAgentLensButton() {
    var btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.textContent = 'Open in AgentLens';
    btn.title = 'Click "Copy Code" first, then click here to visualize the trace';
    btn.style.cssText = [
      'margin-left:8px',
      'padding:6px 14px',
      'font-size:13px',
      'font-weight:600',
      'border-radius:4px',
      'border:1px solid #4e8cff',
      'background:#4e8cff',
      'color:#fff',
      'cursor:pointer',
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif'
    ].join(';');

    btn.addEventListener('mouseenter', function () { btn.style.background = '#3a7ae6'; });
    btn.addEventListener('mouseleave', function () { btn.style.background = '#4e8cff'; });
    btn.addEventListener('click', handleAgentLensClick);
    return btn;
  }

  async function handleAgentLensClick() {
    try {
      var text = await navigator.clipboard.readText();

      if (!text || !text.trim()) {
        alert('AgentLens: Clipboard is empty. Click "Copy Code" first, then "Open in AgentLens".');
        return;
      }

      var json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        alert('AgentLens: Clipboard does not contain valid JSON. Click "Copy Code" first.');
        return;
      }

      if (!json.plan && !json.allPlanSteps && !json.planSteps) {
        alert('AgentLens: JSON does not look like an Agentforce trace. Make sure you copied the trace code.');
        return;
      }

      chrome.runtime.sendMessage({ type: 'openViewer', payload: text });
    } catch (err) {
      alert('AgentLens: Cannot read clipboard. Make sure you clicked "Copy Code" first and granted clipboard access.');
    }
  }

  function injectButton() {
    if (injected || document.getElementById(BUTTON_ID)) return true;

    var copyBtn = findCopyCodeButton();
    if (!copyBtn) return false;

    var agentLensBtn = createAgentLensButton();
    var parent = copyBtn.parentElement;
    if (parent) {
      parent.insertBefore(agentLensBtn, copyBtn.nextSibling);
      injected = true;
      return true;
    }
    return false;
  }

  function startObserving() {
    if (injectButton()) return;

    var observer = new MutationObserver(function () {
      if (!injected) {
        if (injectButton()) observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    var pollTimer = setInterval(function () {
      attempts++;
      if (injected || attempts >= MAX_ATTEMPTS) {
        clearInterval(pollTimer);
        if (injected) observer.disconnect();
        return;
      }
      // Re-check in case button disappeared (SPA navigation)
      if (!document.getElementById(BUTTON_ID)) {
        injected = false;
      }
      injectButton();
    }, POLL_INTERVAL);
  }

  if (document.body) {
    startObserving();
  } else {
    document.addEventListener('DOMContentLoaded', startObserving);
  }
})();
