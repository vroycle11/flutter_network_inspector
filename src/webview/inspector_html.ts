export function getInspectorHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flutter Network Inspector</title>
  <style>
    :root {
      --font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
      --font-size: var(--vscode-font-size, 12px);
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --border: var(--vscode-panel-border, #333333);
      --list-hover: var(--vscode-list-hoverBackground, #2a2d2e);
      --list-active: var(--vscode-list-activeSelectionBackground, #094771);
      --list-active-fg: var(--vscode-list-activeSelectionForeground, #ffffff);
      --badge-bg: var(--vscode-badge-background, #4d4d4d);
      --badge-fg: var(--vscode-badge-foreground, #ffffff);
      --button-bg: var(--vscode-button-background, #0e639c);
      --button-fg: var(--vscode-button-foreground, #ffffff);
      --button-hover: var(--vscode-button-hoverBackground, #1177bb);
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, #3c3c3c);
      --tab-active-bg: var(--vscode-tab-activeBackground, #1e1e1e);
      --tab-inactive-bg: var(--vscode-tab-inactiveBackground, #2d2d2d);

      --color-get: #49cc90;
      --color-post: #4990e2;
      --color-put: #fca130;
      --color-delete: #f93e3e;
      --color-patch: #50e3c2;
      --color-error: #f93e3e;
      --color-success: #49cc90;
      --color-warn: #fca130;
      --color-info: #4990e2;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-family);
      font-size: var(--font-size);
      background-color: var(--bg);
      color: var(--fg);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* Top Toolbar */
    .toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-bottom: 1px solid var(--border);
      background-color: var(--bg);
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      font-size: 11px;
      background-color: var(--button-bg);
      color: var(--button-fg);
      border: none;
      border-radius: 3px;
      cursor: pointer;
      user-select: none;
    }
    .btn:hover { background-color: var(--button-hover); }
    .btn.secondary {
      background-color: transparent;
      color: var(--fg);
      border: 1px solid var(--border);
    }
    .btn.secondary:hover { background-color: var(--list-hover); }
    .btn.active {
      background-color: var(--list-active);
      color: var(--list-active-fg);
    }

    .search-box {
      flex: 1;
      min-width: 140px;
      padding: 4px 8px;
      background-color: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 3px;
      font-size: 11px;
      outline: none;
    }
    .search-box:focus { border-color: var(--button-bg); }

    .filter-group {
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: 3px;
      overflow: hidden;
    }
    .filter-btn {
      background: transparent;
      border: none;
      color: var(--fg);
      padding: 3px 6px;
      font-size: 10px;
      cursor: pointer;
      border-right: 1px solid var(--border);
    }
    .filter-btn:last-child { border-right: none; }
    .filter-btn:hover { background: var(--list-hover); }
    .filter-btn.active {
      background: var(--button-bg);
      color: var(--button-fg);
    }

    .status-pill {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--badge-bg);
      color: var(--badge-fg);
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #888;
    }
    .status-dot.online { background: #49cc90; }

    /* Main Content Area */
    .main-container {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* Left: Request List (Virtualized) */
    .list-container {
      flex: 1;
      min-width: 250px;
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--border);
      position: relative;
    }

    .list-header {
      display: grid;
      grid-template-columns: 50px 1fr 45px 55px 50px;
      padding: 4px 8px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border);
      background: rgba(127, 127, 127, 0.05);
      user-select: none;
    }

    .viewport {
      flex: 1;
      overflow-y: auto;
      position: relative;
      outline: none;
    }

    .virtual-scroll-spacer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      pointer-events: none;
    }

    .virtual-items-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
    }

    .request-row {
      display: grid;
      grid-template-columns: 50px 1fr 45px 55px 50px;
      padding: 5px 8px;
      border-bottom: 1px solid rgba(127, 127, 127, 0.1);
      cursor: pointer;
      user-select: none;
      align-items: center;
      font-size: 11px;
      height: 28px;
    }
    .request-row:hover { background-color: var(--list-hover); }
    .request-row.selected {
      background-color: var(--list-active);
      color: var(--list-active-fg);
    }

    .method-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 4px;
      border-radius: 2px;
      text-align: center;
      display: inline-block;
      width: 42px;
      color: #fff;
    }
    .method-GET { background-color: var(--color-get); }
    .method-POST { background-color: var(--color-post); }
    .method-PUT { background-color: var(--color-put); }
    .method-DELETE { background-color: var(--color-delete); }
    .method-PATCH { background-color: var(--color-patch); }
    .method-OTHER { background-color: #888; }

    .url-cell {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-right: 8px;
    }

    .status-code {
      font-weight: 600;
      font-size: 10px;
    }
    .status-2xx { color: var(--color-success); }
    .status-3xx { color: var(--color-info); }
    .status-4xx { color: var(--color-warn); }
    .status-5xx { color: var(--color-error); }
    .status-err { color: var(--color-error); }
    .status-pending { color: #888; }

    .duration-cell, .size-cell {
      font-size: 10px;
      color: #888;
      text-align: right;
    }
    .request-row.selected .duration-cell,
    .request-row.selected .size-cell {
      color: inherit;
    }

    /* Right: Detail View */
    .detail-container {
      flex: 1.2;
      min-width: 300px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg);
    }

    .detail-tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
      background: rgba(127, 127, 127, 0.04);
      overflow-x: auto;
    }
    .detail-tab {
      padding: 7px 12px;
      font-size: 11px;
      cursor: pointer;
      user-select: none;
      border-bottom: 2px solid transparent;
      color: #888;
      white-space: nowrap;
    }
    .detail-tab:hover { color: var(--fg); }
    .detail-tab.active {
      color: var(--fg);
      border-bottom-color: var(--button-bg);
      font-weight: 600;
    }

    .detail-actions {
      display: flex;
      gap: 6px;
      padding: 6px 12px;
      border-bottom: 1px solid var(--border);
      background: rgba(127, 127, 127, 0.02);
    }

    .detail-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    .key-value-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    .key-value-table th {
      text-align: left;
      padding: 4px 6px;
      border-bottom: 1px solid var(--border);
      color: #888;
      font-size: 10px;
    }
    .key-value-table td {
      padding: 5px 6px;
      border-bottom: 1px solid rgba(127, 127, 127, 0.1);
      vertical-align: top;
      word-break: break-all;
    }
    .key-value-table td.key {
      width: 140px;
      color: #888;
      font-family: monospace;
    }

    /* JSON Viewer */
    .json-viewer {
      font-family: monospace;
      font-size: 11px;
      line-height: 1.5;
    }
    .json-node {
      margin-left: 14px;
    }
    .json-toggle {
      cursor: pointer;
      user-select: none;
      color: #888;
      margin-right: 4px;
    }
    .json-toggle:hover { color: var(--fg); }
    .json-key { color: #9cdcfe; }
    .json-string { color: #ce9178; }
    .json-number { color: #b5cea8; }
    .json-boolean { color: #569cd6; }
    .json-null { color: #569cd6; }
    .json-collapsed-text { color: #888; font-style: italic; }

    /* Empty States */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #888;
      text-align: center;
      padding: 20px;
      gap: 10px;
    }

    /* Footer status */
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 3px 10px;
      font-size: 10px;
      color: #888;
      border-top: 1px solid var(--border);
      background: rgba(127, 127, 127, 0.05);
      flex-shrink: 0;
    }
  </style>
</head>
<body>

  <!-- Top Toolbar -->
  <div class="toolbar">
    <div class="status-pill">
      <span class="status-dot" id="statusDot"></span>
      <span id="statusText">Disconnected</span>
    </div>

    <button class="btn" id="btnConnect">Connect</button>
    <button class="btn secondary" id="btnPause">Pause</button>
    <button class="btn secondary" id="btnClear">Clear</button>

    <input type="text" class="search-box" id="searchBox" placeholder="Filter URL, status, or text...">

    <div class="filter-group" id="methodFilters">
      <button class="filter-btn active" data-method="ALL">ALL</button>
      <button class="filter-btn" data-method="GET">GET</button>
      <button class="filter-btn" data-method="POST">POST</button>
      <button class="filter-btn" data-method="PUT">PUT</button>
      <button class="filter-btn" data-method="DELETE">DEL</button>
    </div>

    <div class="filter-group" id="statusFilters">
      <button class="filter-btn active" data-status="ALL">ALL</button>
      <button class="filter-btn" data-status="2xx">2xx</button>
      <button class="filter-btn" data-status="4xx">4xx</button>
      <button class="filter-btn" data-status="5xx">5xx</button>
      <button class="filter-btn" data-status="ERR">ERR</button>
    </div>

    <button class="btn secondary" id="btnExport">Export</button>
  </div>

  <!-- Main View -->
  <div class="main-container">
    <!-- Virtualized Request List -->
    <div class="list-container">
      <div class="list-header">
        <span>Method</span>
        <span>URL / Endpoint</span>
        <span>Status</span>
        <span style="text-align:right;">Time</span>
        <span style="text-align:right;">Size</span>
      </div>

      <div class="viewport" id="viewport">
        <div class="virtual-scroll-spacer" id="scrollSpacer"></div>
        <div class="virtual-items-layer" id="itemsLayer"></div>
        <div class="empty-state" id="listEmpty" style="display:flex;">
          <div style="font-size: 26px; margin-bottom: 2px;">📡</div>
          <p style="font-weight: 500; color: var(--fg);">No Network Requests Captured</p>
          <p style="font-size:11px; max-width: 250px; line-height: 1.4; color: #888;">
            Launch your Flutter app in debug mode (F5) to capture automatically, or click Connect to attach to a running VM Service.
          </p>
          <button class="btn" id="btnEmptyConnect" style="margin-top: 6px;">⚡ Connect to VM Service</button>
        </div>
      </div>
    </div>

    <!-- Request Details Inspector -->
    <div class="detail-container" id="detailContainer">
      <div class="detail-tabs" id="detailTabs">
        <div class="detail-tab active" data-tab="overview">Overview</div>
        <div class="detail-tab" data-tab="headers">Headers</div>
        <div class="detail-tab" data-tab="params">Params</div>
        <div class="detail-tab" data-tab="reqBody">Request Body</div>
        <div class="detail-tab" data-tab="respBody">Response Body</div>
        <div class="detail-tab" data-tab="timing">Timing</div>
        <div class="detail-tab" data-tab="errors">Errors</div>
      </div>

      <div class="detail-actions" id="detailActions">
        <button class="btn secondary" id="btnCopyUrl">Copy URL</button>
        <button class="btn secondary" id="btnCopyCurl">Copy cURL</button>
        <button class="btn secondary" id="btnCopyReq">Copy Req</button>
        <button class="btn secondary" id="btnCopyResp">Copy Resp</button>
      </div>

      <div class="detail-content" id="detailContent">
        <div class="empty-state">
          <p>Select a request to inspect details.</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span id="footerLeft">Requests: 0</span>
    <span id="footerRight">Memory: 0 KB | Evicted: 0</span>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // State
    let allRecords = [];
    let filteredRecords = [];
    let selectedRecordId = null;
    let selectedRecord = null;
    let activeTab = 'overview';
    let isConnected = false;
    let isPaused = false;

    const filterCriteria = {
      searchText: '',
      methods: [],
      statusGroup: 'ALL',
      failedOnly: false,
    };

    // Virtual list constants
    const ROW_HEIGHT = 28;
    const viewport = document.getElementById('viewport');
    const scrollSpacer = document.getElementById('scrollSpacer');
    const itemsLayer = document.getElementById('itemsLayer');
    const listEmpty = document.getElementById('listEmpty');

    // UI elements
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const btnConnect = document.getElementById('btnConnect');
    const btnPause = document.getElementById('btnPause');
    const btnClear = document.getElementById('btnClear');
    const btnExport = document.getElementById('btnExport');
    const searchBox = document.getElementById('searchBox');
    const footerLeft = document.getElementById('footerLeft');
    const footerRight = document.getElementById('footerRight');

    const detailContent = document.getElementById('detailContent');
    const detailTabs = document.getElementById('detailTabs');
    const btnCopyUrl = document.getElementById('btnCopyUrl');
    const btnCopyCurl = document.getElementById('btnCopyCurl');
    const btnCopyReq = document.getElementById('btnCopyReq');
    const btnCopyResp = document.getElementById('btnCopyResp');

    // Formatters
    function formatBytes(bytes) {
      if (!bytes || bytes <= 0) return '-';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatDuration(ms) {
      if (ms === undefined || ms === null) return '...';
      if (ms < 1000) return Math.round(ms) + ' ms';
      return (ms / 1000).toFixed(2) + ' s';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Virtual List Render
    function renderVirtualList() {
      const total = filteredRecords.length;
      scrollSpacer.style.height = (total * ROW_HEIGHT) + 'px';

      if (total === 0) {
        itemsLayer.innerHTML = '';
        listEmpty.style.display = 'flex';
        return;
      }
      listEmpty.style.display = 'none';

      const scrollTop = viewport.scrollTop;
      const viewportHeight = viewport.clientHeight;

      const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3);
      const endIndex = Math.min(total, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + 3);

      itemsLayer.style.transform = 'translateY(' + (startIndex * ROW_HEIGHT) + 'px)';

      let html = '';
      for (let i = startIndex; i < endIndex; i++) {
        const r = filteredRecords[i];
        const isSelected = r.id === selectedRecordId;

        let statusClass = 'status-pending';
        let statusDisplay = '...';
        if (r.error) {
          statusClass = 'status-err';
          statusDisplay = 'ERR';
        } else if (r.statusCode) {
          const prefix = Math.floor(r.statusCode / 100);
          statusClass = 'status-' + prefix + 'xx';
          statusDisplay = String(r.statusCode);
        }

        const methodClass = 'method-' + (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(r.method) ? r.method : 'OTHER');

        html += '<div class="request-row ' + (isSelected ? 'selected' : '') + '" data-id="' + r.id + '" title="' + escapeHtml(r.uri) + '">';
        html += '<span class="method-badge ' + methodClass + '">' + r.method + '</span>';
        html += '<span class="url-cell">' + escapeHtml(r.path || r.uri) + '</span>';
        html += '<span class="status-code ' + statusClass + '">' + statusDisplay + '</span>';
        html += '<span class="duration-cell">' + formatDuration(r.durationMs) + '</span>';
        html += '<span class="size-cell">' + formatBytes(r.responseSize || r.requestSize) + '</span>';
        html += '</div>';
      }

      itemsLayer.innerHTML = html;
    }

    viewport.addEventListener('scroll', renderVirtualList);

    itemsLayer.addEventListener('click', (e) => {
      const row = e.target.closest('.request-row');
      if (!row) return;
      const id = row.getAttribute('data-id');
      selectRequest(id);
    });

    function selectRequest(id) {
      selectedRecordId = id;
      renderVirtualList();

      const cached = allRecords.find(r => r.id === id);
      if (cached) {
        renderDetail(cached);
      }

      vscode.postMessage({
        type: 'selectRecord',
        id: id,
      });
    }

    // Detail Render
    function renderDetail(record) {
      selectedRecord = record;
      if (!record) {
        detailContent.innerHTML = '<div class="empty-state"><p>Select a request to inspect details.</p></div>';
        return;
      }

      switch (activeTab) {
        case 'overview':
          renderOverviewTab(record);
          break;
        case 'headers':
          renderHeadersTab(record);
          break;
        case 'params':
          renderParamsTab(record);
          break;
        case 'reqBody':
          renderBodyTab(record.requestBody, record.isRequestBodyTruncated, 'Request Body');
          break;
        case 'respBody':
          renderBodyTab(record.responseBody, record.isResponseBodyTruncated, 'Response Body');
          break;
        case 'timing':
          renderTimingTab(record);
          break;
        case 'errors':
          renderErrorsTab(record);
          break;
      }
    }

    function renderOverviewTab(r) {
      let html = '<table class="key-value-table">';
      html += '<tr><td class="key">Request URL</td><td>' + escapeHtml(r.uri) + '</td></tr>';
      html += '<tr><td class="key">Request Method</td><td><strong>' + r.method + '</strong></td></tr>';
      html += '<tr><td class="key">Status Code</td><td>' + (r.statusCode ? r.statusCode + ' ' + (r.statusText || '') : (r.error ? '<span style="color:var(--color-error)">Failed (' + escapeHtml(r.error) + ')</span>' : 'Pending')) + '</td></tr>';
      html += '<tr><td class="key">Duration</td><td>' + formatDuration(r.durationMs) + '</td></tr>';
      html += '<tr><td class="key">Start Time</td><td>' + new Date(Math.floor(r.startTime / 1000)).toLocaleString() + '</td></tr>';
      html += '<tr><td class="key">Capture Source</td><td>' + r.source + (r.isolateId ? ' (' + r.isolateId + ')' : '') + '</td></tr>';
      html += '<tr><td class="key">Request Size</td><td>' + formatBytes(r.requestSize) + '</td></tr>';
      html += '<tr><td class="key">Response Size</td><td>' + formatBytes(r.responseSize) + '</td></tr>';
      html += '</table>';
      detailContent.innerHTML = html;
    }

    function renderHeadersTab(r) {
      let html = '<h4 style="margin-bottom:6px; font-size:11px; color:#888;">Response Headers</h4>';
      html += renderHeaderTable(r.responseHeaders);

      html += '<h4 style="margin: 14px 0 6px 0; font-size:11px; color:#888;">Request Headers</h4>';
      html += renderHeaderTable(r.requestHeaders);

      detailContent.innerHTML = html;
    }

    function renderHeaderTable(headers) {
      const keys = Object.keys(headers || {});
      if (keys.length === 0) {
        return '<p style="color:#888; font-size:11px; margin-bottom:8px;">No headers available from capture source.</p>';
      }
      let html = '<table class="key-value-table">';
      for (const k of keys.sort()) {
        const val = headers[k].join(', ');
        html += '<tr><td class="key">' + escapeHtml(k) + '</td><td>' + escapeHtml(val) + '</td></tr>';
      }
      html += '</table>';
      return html;
    }

    function renderParamsTab(r) {
      const keys = Object.keys(r.queryParams || {});
      if (keys.length === 0) {
        detailContent.innerHTML = '<div class="empty-state"><p>No query parameters in this URL.</p></div>';
        return;
      }
      let html = '<table class="key-value-table">';
      html += '<tr><th>Parameter</th><th>Value</th></tr>';
      for (const k of keys.sort()) {
        const val = r.queryParams[k].join(', ');
        html += '<tr><td class="key">' + escapeHtml(k) + '</td><td>' + escapeHtml(val) + '</td></tr>';
      }
      html += '</table>';
      detailContent.innerHTML = html;
    }

    function renderBodyTab(body, isTruncated, title) {
      if (body === undefined || body === null) {
        if (selectedRecord && !selectedRecord.hasDetails) {
          detailContent.innerHTML = '<div class="empty-state"><p>Loading ' + escapeHtml(title) + '...</p><p style="font-size:10px; color:#888;">Fetching from Dart VM Service...</p></div>';
          return;
        }
        detailContent.innerHTML = '<div class="empty-state"><p>Not available from capture source.</p><p style="font-size:10px;">Select the request or use the companion Dio package if custom adapters are active.</p></div>';
        return;
      }
      if (body === '') {
        detailContent.innerHTML = '<div class="empty-state"><p>Empty body (0 bytes).</p></div>';
        return;
      }

      let html = '';
      if (isTruncated) {
        html += '<div style="padding:4px 8px; margin-bottom:8px; background:rgba(252,161,48,0.15); border:1px solid var(--color-warn); border-radius:3px; font-size:10px;">' +
          'Body truncated to avoid excessive memory usage.</div>';
      }

      // Try JSON parsing
      try {
        const json = JSON.parse(body);
        html += '<div class="json-viewer">' + buildJsonTree(json) + '</div>';
        detailContent.innerHTML = html;
        bindJsonCollapsers();
        return;
      } catch (_) {}

      // Plain text / HTML / error
      html += '<pre style="font-family:monospace; font-size:11px; white-space:pre-wrap; word-break:break-all;">' + escapeHtml(body) + '</pre>';
      detailContent.innerHTML = html;
    }

    function buildJsonTree(val, key = null) {
      if (val === null) {
        return (key !== null ? '<span class="json-key">"' + escapeHtml(key) + '"</span>: ' : '') + '<span class="json-null">null</span>';
      }
      if (typeof val === 'boolean') {
        return (key !== null ? '<span class="json-key">"' + escapeHtml(key) + '"</span>: ' : '') + '<span class="json-boolean">' + val + '</span>';
      }
      if (typeof val === 'number') {
        return (key !== null ? '<span class="json-key">"' + escapeHtml(key) + '"</span>: ' : '') + '<span class="json-number">' + val + '</span>';
      }
      if (typeof val === 'string') {
        return (key !== null ? '<span class="json-key">"' + escapeHtml(key) + '"</span>: ' : '') + '<span class="json-string">"' + escapeHtml(val) + '"</span>';
      }

      const isArray = Array.isArray(val);
      const entries = Object.entries(val);
      const openBracket = isArray ? '[' : '{';
      const closeBracket = isArray ? ']' : '}';

      if (entries.length === 0) {
        return (key !== null ? '<span class="json-key">"' + escapeHtml(key) + '"</span>: ' : '') + openBracket + closeBracket;
      }

      let res = '<div>';
      res += (key !== null ? '<span class="json-key">"' + escapeHtml(key) + '"</span>: ' : '');
      res += '<span class="json-toggle">▼</span> ' + openBracket;
      res += '<div class="json-node">';
      for (let i = 0; i < entries.length; i++) {
        const [k, v] = entries[i];
        res += '<div>' + buildJsonTree(v, isArray ? null : k) + (i < entries.length - 1 ? ',' : '') + '</div>';
      }
      res += '</div>';
      res += closeBracket;
      res += '</div>';
      return res;
    }

    function bindJsonCollapsers() {
      detailContent.querySelectorAll('.json-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const node = btn.parentElement.querySelector('.json-node');
          if (!node) return;
          if (node.style.display === 'none') {
            node.style.display = 'block';
            btn.textContent = '▼';
          } else {
            node.style.display = 'none';
            btn.textContent = '▶';
          }
        });
      });
    }

    function renderTimingTab(r) {
      if (!r.events || r.events.length === 0) {
        detailContent.innerHTML = '<div class="empty-state"><p>No timing events recorded.</p></div>';
        return;
      }
      let html = '<table class="key-value-table">';
      html += '<tr><th>Event</th><th>Relative Time</th></tr>';
      const baseTime = r.startTime;
      for (const e of r.events) {
        const offsetMs = ((e.timestamp - baseTime) / 1000).toFixed(1);
        html += '<tr><td class="key">' + escapeHtml(e.event) + '</td><td>+' + offsetMs + ' ms</td></tr>';
      }
      html += '</table>';
      detailContent.innerHTML = html;
    }

    function renderErrorsTab(r) {
      if (!r.error) {
        detailContent.innerHTML = '<div class="empty-state"><p>No errors reported for this request.</p></div>';
        return;
      }
      detailContent.innerHTML = '<div style="color:var(--color-error); padding:10px; background:rgba(249,62,62,0.1); border:1px solid var(--color-error); border-radius:4px; font-family:monospace; white-space:pre-wrap;">' +
        escapeHtml(r.error) +
        '</div>';
    }

    // Detail Tabs Click
    detailTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.detail-tab');
      if (!tab) return;
      detailTabs.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.getAttribute('data-tab');
      const rec = (selectedRecordId && allRecords.find(r => r.id === selectedRecordId)) || selectedRecord;
      if (rec) {
        renderDetail(rec);
      }
    });

    // Filtering logic
    function applyFilter() {
      const query = filterCriteria.searchText.toLowerCase().trim();
      const methods = filterCriteria.methods;
      const statusGroup = filterCriteria.statusGroup;

      filteredRecords = allRecords.filter(r => {
        if (methods.length > 0 && !methods.includes(r.method.toUpperCase())) return false;

        if (statusGroup === 'ERR') {
          if (!r.error && (!r.statusCode || r.statusCode < 400)) return false;
        } else if (statusGroup !== 'ALL') {
          if (!r.statusCode) return false;
          const prefix = Math.floor(r.statusCode / 100);
          if (statusGroup === '2xx' && prefix !== 2) return false;
          if (statusGroup === '4xx' && prefix !== 4) return false;
          if (statusGroup === '5xx' && prefix !== 5) return false;
        }

        if (query) {
          if (r.uri.toLowerCase().includes(query)) return true;
          if (r.statusCode && String(r.statusCode).includes(query)) return true;
          if (r.error && r.error.toLowerCase().includes(query)) return true;
          return false;
        }

        return true;
      });

      footerLeft.textContent = 'Requests: ' + filteredRecords.length + ' / ' + allRecords.length;
      renderVirtualList();
    }

    // Search input debounced
    let searchTimeout = null;
    searchBox.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        filterCriteria.searchText = searchBox.value;
        applyFilter();
      }, 150);
    });

    // Method filter buttons
    document.getElementById('methodFilters').addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      document.querySelectorAll('#methodFilters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const m = btn.getAttribute('data-method');
      filterCriteria.methods = (m === 'ALL') ? [] : [m];
      applyFilter();
    });

    // Status filter buttons
    document.getElementById('statusFilters').addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      document.querySelectorAll('#statusFilters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterCriteria.statusGroup = btn.getAttribute('data-status');
      applyFilter();
    });

    // Actions
    btnConnect.addEventListener('click', () => {
      if (isConnected) {
        vscode.postMessage({ type: 'disconnect' });
      } else {
        vscode.postMessage({ type: 'connect' });
      }
    });

    btnPause.addEventListener('click', () => {
      if (isPaused) {
        vscode.postMessage({ type: 'resume' });
      } else {
        vscode.postMessage({ type: 'pause' });
      }
    });

    btnClear.addEventListener('click', () => {
      vscode.postMessage({ type: 'clear' });
    });

    btnExport.addEventListener('click', () => {
      vscode.postMessage({ type: 'export' });
    });

    btnCopyUrl.addEventListener('click', () => {
      const rec = (selectedRecordId && allRecords.find(r => r.id === selectedRecordId)) || selectedRecord;
      if (rec) {
        vscode.postMessage({ type: 'copy', text: rec.uri, label: 'URL' });
      }
    });

    btnCopyCurl.addEventListener('click', () => {
      const rec = (selectedRecordId && allRecords.find(r => r.id === selectedRecordId)) || selectedRecord;
      if (rec) {
        vscode.postMessage({ type: 'copyCurl', id: rec.id });
      }
    });

    btnCopyReq.addEventListener('click', () => {
      const rec = (selectedRecordId && allRecords.find(r => r.id === selectedRecordId)) || selectedRecord;
      if (rec && rec.requestBody) {
        vscode.postMessage({ type: 'copy', text: rec.requestBody, label: 'Request Body' });
      }
    });

    btnCopyResp.addEventListener('click', () => {
      const rec = (selectedRecordId && allRecords.find(r => r.id === selectedRecordId)) || selectedRecord;
      if (rec && rec.responseBody) {
        vscode.postMessage({ type: 'copy', text: rec.responseBody, label: 'Response Body' });
      }
    });

    // Listen to messages from Extension Host
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (!msg) return;

      switch (msg.type) {
        case 'initialState':
          allRecords = msg.records || [];
          if (selectedRecordId) {
            const found = allRecords.find(r => r.id === selectedRecordId);
            if (found) {
              renderDetail(found);
            }
          }
          applyFilter();
          updateStateUI(msg.state);
          break;

        case 'recordsBatch':
          // Merge or append batch while preserving already loaded bodies and details
          const existingMap = new Map(allRecords.map(r => [r.id, r]));
          for (const newRec of msg.records) {
            const oldRec = existingMap.get(newRec.id);
            if (oldRec && (oldRec.hasDetails || oldRec.responseBody !== undefined || oldRec.requestBody !== undefined)) {
              existingMap.set(newRec.id, {
                ...newRec,
                requestBody: oldRec.requestBody,
                responseBody: oldRec.responseBody,
                isRequestBodyTruncated: oldRec.isRequestBodyTruncated,
                isResponseBodyTruncated: oldRec.isResponseBodyTruncated,
                hasDetails: oldRec.hasDetails,
              });
            } else {
              existingMap.set(newRec.id, newRec);
            }
          }
          allRecords = Array.from(existingMap.values());
          if (selectedRecordId) {
            const currentSelected = existingMap.get(selectedRecordId);
            if (currentSelected) {
              selectedRecord = currentSelected;
              if (activeTab === 'overview' || activeTab === 'timing') {
                renderDetail(selectedRecord);
              }
            }
          }
          applyFilter();
          break;

        case 'recordUpdated':
          const idx = allRecords.findIndex(r => r.id === msg.record.id);
          if (idx >= 0) {
            allRecords[idx] = msg.record;
          } else {
            allRecords.push(msg.record);
          }
          if (selectedRecordId === msg.record.id) {
            selectedRecord = msg.record;
            renderDetail(msg.record);
          }
          applyFilter();
          break;

        case 'stateChanged':
          updateStateUI(msg.state);
          break;

        case 'historyCleared':
          allRecords = [];
          filteredRecords = [];
          selectedRecordId = null;
          selectedRecord = null;
          renderVirtualList();
          renderDetail(null);
          footerLeft.textContent = 'Requests: 0';
          break;
      }
    });

    function updateStateUI(state) {
      if (!state) return;
      isConnected = state.isConnected;
      isPaused = state.isPaused;

      if (isConnected) {
        statusDot.className = 'status-dot online';
        statusText.textContent = state.activeUri ? 'Connected (' + state.activeUri + ')' : 'Connected';
        btnConnect.textContent = 'Disconnect';
        btnConnect.classList.add('secondary');
      } else {
        statusDot.className = 'status-dot';
        statusText.textContent = 'Disconnected';
        btnConnect.textContent = 'Connect';
        btnConnect.classList.remove('secondary');
      }

      btnPause.textContent = isPaused ? 'Resume' : 'Pause';
      if (isPaused) {
        btnPause.classList.add('active');
      } else {
        btnPause.classList.remove('active');
      }

      footerRight.textContent = 'Memory: ' + formatBytes(state.bodyMemoryBytes) + ' | Evicted: ' + state.evictedBodies;
    }

    const btnEmptyConnect = document.getElementById('btnEmptyConnect');
    if (btnEmptyConnect) {
      btnEmptyConnect.addEventListener('click', () => {
        vscode.postMessage({ type: 'connect' });
      });
    }

    // Initial render and signal Extension Host that webview DOM is fully loaded
    renderVirtualList();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

