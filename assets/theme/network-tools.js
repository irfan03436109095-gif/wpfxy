(() => {
  'use strict';
  const GEO_ENDPOINT = 'https://free.freeipapi.com/api/v1/json';
  const IP_ENDPOINT = 'https://api64.ipify.org?format=json';
  const GLOBALPING_API = 'https://api.globalping.io/v1/measurements';
  const PING_TARGETS = { cloudflare: 'https://speed.cloudflare.com/__down?bytes=0', ipify: IP_ENDPOINT };
  const ROUNDS = 5;
  const clean = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, 160) : '';
  function parseIPv4(value) {
    if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)) return null;
    const bytes = value.split('.').map(Number);
    if (bytes.some(n => n > 255)) return null;
    return { version: 4, canonical: bytes.join('.'), bytes };
  }
  function parseIP(raw) {
    const value = String(raw || '').trim();
    const v4 = parseIPv4(value);
    if (v4) return v4;
    if (!value.includes(':') || !/^[a-fA-F0-9:.]+$/.test(value) || value.length > 45) return null;
    try {
      const host = new URL('https://[' + value + ']/').hostname;
      if (!host.startsWith('[') || !host.endsWith(']')) return null;
      const canonical = host.slice(1, -1).toLowerCase();
      const parts = canonical.split('::');
      if (parts.length > 2) return null;
      const left = parts[0] ? parts[0].split(':') : [];
      const right = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
      const groups = parts.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
      if (groups.length !== 8 || groups.some(p => !/^[a-f0-9]{1,4}$/.test(p))) return null;
      const words = groups.map(x => parseInt(x, 16));
      const bytes = words.flatMap(x => [x >> 8, x & 255]);
      return { version: 6, canonical, bytes, words };
    } catch { return null; }
  }
  function isPublicIP(ip) {
    if (!ip) return false;
    const b = ip.bytes;
    if (ip.version === 4) {
      return !(b[0] === 0 || b[0] === 10 || b[0] === 127 || b[0] >= 224 ||
        (b[0] === 100 && b[1] >= 64 && b[1] <= 127) ||
        (b[0] === 169 && b[1] === 254) || (b[0] === 172 && b[1] >= 16 && b[1] <= 31) ||
        (b[0] === 192 && ((b[1] === 168) || (b[1] === 0 && (b[2] === 0 || b[2] === 2)) || (b[1] === 88 && b[2] === 99))) ||
        (b[0] === 198 && (b[1] === 18 || b[1] === 19 || (b[1] === 51 && b[2] === 100))) ||
        (b[0] === 203 && b[1] === 0 && b[2] === 113));
    }
    const w = ip.words;
    if (w.slice(0, 5).every(x => x === 0) && w[5] === 0xffff) {
      return isPublicIP({ version: 4, bytes: b.slice(12) });
    }
    if ((b[0] & 0xe0) !== 0x20) return false;
    return !(w[0] === 0x3fff || (w[0] === 0x2001 && w[1] === 0x0db8) ||
      (w[0] === 0x2001 && w[1] === 2 && w[2] === 0) ||
      (w[0] === 0x2001 && (w[1] & 0xfff0) === 0x0010) ||
      (w[0] === 0x2001 && (w[1] & 0xfff0) === 0x0020));
  }
  function validateIP(raw) {
    const ip = parseIP(raw);
    if (!ip) throw new Error('请填写有效的 IPv4 或 IPv6 地址，不要填写网址或域名。');
    if (!isPublicIP(ip)) throw new Error('此地址属于内网、本地或保留范围，不能查询公网归属信息。');
    return ip;
  }
  function validateTarget(raw) {
    const value = String(raw || '').trim();
    if (!value || value.length > 2048) throw new Error('请填写完整的 HTTPS 网址。');
    let url;
    try { url = new URL(value); } catch { throw new Error('请填写完整的 HTTPS 网址，例如 https://example.com/。'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('仅支持不含用户名和密码的 HTTPS 网址。');
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
    const ip = parseIP(hostname);
    if (ip) {
      if (!isPublicIP(ip)) throw new Error('请使用公网 HTTPS 目标，不支持内网、本地或保留地址。');
    } else if (hostname.length > 253 || !hostname.includes('.') || !/^[a-z0-9.-]+$/.test(hostname) || hostname.split('.').some(p => !p || p.length > 63 || p.startsWith('-') || p.endsWith('-')) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(hostname)) {
      throw new Error('请使用有效的公网 HTTPS 网址，不支持本地或保留域名。');
    }
    url.hash = '';
    return url;
  }
  function validateICMPTarget(raw) {
    const value = String(raw || '').trim();
    const ip = parseIP(value);
    if (ip) {
      if (!isPublicIP(ip)) throw new Error('请使用公网 IP，不支持内网、本地或保留地址。');
      return ip.canonical;
    }
    if (!value || value.length > 253 || /[\s\/:@?#\\\[\]]/.test(value)) throw new Error('请填写公网 IP 或域名，不要包含协议、路径、端口或账号。');
    const target = validateTarget('https://' + value + '/');
    const host = target.hostname.toLowerCase().replace(/\.$/, '');
    if (parseIP(host)) throw new Error('请填写完整的标准 IP 地址，不使用数字或缩写地址。');
    return host;
  }
  const safeMeasurementID = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id);
  const finiteMetric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  function timedRequest(url, options = {}) {
    const { signal, timeoutMs = 8000, fetcher = fetch, method = 'GET', body, headers } = options;
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    if (signal && signal.aborted) controller.abort();
    else if (signal) signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    return {
      controller,
      fetch: () => fetcher(url, { mode: 'cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow', signal: controller.signal, method, ...(body === undefined ? {} : { body }), ...(headers ? { headers } : {}) }),
      timedOut: () => timedOut,
      cleanup: () => { clearTimeout(timer); if (signal) signal.removeEventListener('abort', cancel); }
    };
  }
  async function measurementRequest(url, options = {}) {
    const request = timedRequest(url, options);
    try {
      const response = await request.fetch();
      if (response.type === 'opaque' || response.type === 'opaqueredirect') throw Object.assign(new Error('无法读取远程测试服务响应。'), { code: 'unreadable' });
      if (response.status === 429) throw Object.assign(new Error('远程测试额度不足或请求过于频繁，请稍后再试。'), { code: 'rate-limit' });
      const expected = options.method === 'POST' ? 202 : 200;
      if (response.status !== expected) throw Object.assign(new Error('远程测试服务未能完成请求（HTTP ' + response.status + '）。'), { code: 'http-error' });
      try { return await response.json(); }
      catch { throw Object.assign(new Error('远程测试服务返回的数据无法读取。'), { code: 'invalid-response' }); }
    } catch (error) {
      if (options.signal && options.signal.aborted) throw Object.assign(new Error('已停止等待。'), { code: 'cancelled' });
      if (request.timedOut()) throw Object.assign(new Error('等待远程服务响应超时。'), { code: 'timeout' });
      throw error;
    } finally { request.cleanup(); }
  }
  async function queryJSON(url, options = {}) {
    const request = timedRequest(url, options);
    try {
      const response = await request.fetch();
      if (response.type === 'opaque' || response.type === 'opaqueredirect') throw Object.assign(new Error('无法读取查询服务响应。'), { code: 'unreadable' });
      if (response.status === 429) throw Object.assign(new Error('查询服务请求过于频繁，请稍后再试。'), { code: 'rate-limit' });
      if (!response.ok) throw Object.assign(new Error('查询服务暂不可用（HTTP ' + response.status + '）。'), { code: 'http-error' });
      return await response.json();
    } catch (error) {
      if (options.signal && options.signal.aborted) throw Object.assign(new Error('已取消查询。'), { code: 'cancelled' });
      if (request.timedOut()) throw Object.assign(new Error('查询超时，请稍后重试或检查当前网络。'), { code: 'timeout' });
      throw error;
    } finally { request.cleanup(); }
  }
  async function measurePing(target, options = {}) {
    const now = options.now || (() => performance.now());
    const request = timedRequest(target, { ...options, timeoutMs: options.timeoutMs || 5000 });
    const start = now();
    try {
      const response = await request.fetch();
      const milliseconds = now() - start;
      if (response.type === 'opaque' || response.type === 'opaqueredirect' || response.status === 0) return { kind: 'unreadable', responded: false, milliseconds: null, status: null };
      if (response.body && typeof response.body.cancel === 'function') {
        try { Promise.resolve(response.body.cancel()).catch(() => {}); } catch { /* Reading headers already succeeded. */ }
      }
      return { kind: response.ok ? 'ok' : 'http-error', responded: true, milliseconds: Math.max(0, milliseconds), status: response.status };
    } catch {
      const kind = options.signal && options.signal.aborted ? 'cancelled' : request.timedOut() ? 'timeout' : 'network-error';
      return { kind, responded: false, milliseconds: null, status: null };
    } finally { request.cleanup(); }
  }
  function pingSummary(rows) {
    const complete = rows.filter(x => x.kind !== 'cancelled');
    const received = complete.filter(x => x.responded && Number.isFinite(x.milliseconds));
    const times = received.map(x => x.milliseconds);
    return { completed: complete.length, received: received.length, normal: received.filter(x => x.kind === 'ok').length,
      average: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
      minimum: times.length ? Math.min(...times) : null, maximum: times.length ? Math.max(...times) : null };
  }
  const exported = { parseIP, isPublicIP, validateIP, validateTarget, validateICMPTarget, safeMeasurementID, finiteMetric, measurePing, pingSummary, queryJSON, measurementRequest };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (typeof document === 'undefined') return;
  const root = document.querySelector('[data-network-tools]');
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = 'true';
  const find = name => root.querySelector('[data-' + name + ']');
  const setStatus = (element, message, tone = '') => { element.textContent = message; element.dataset.tone = tone; };
  const ms = value => value === null ? '—' : value.toFixed(1) + ' ms';
  let ipRun = null;
  let lastIP = '';
  let pingRun = null;
  let icmpRun = null;
  const ipStatus = find('ip-status');
  const ipInput = find('ip-input');
  const pingStatus = find('ping-status');
  const targetSelect = find('ping-target');
  function setIPBusy(busy) {
    find('ip-card').setAttribute('aria-busy', String(busy));
    find('ip-current').disabled = busy;
    find('ip-query').disabled = busy;
    find('ip-cancel').disabled = !busy;
    ipInput.disabled = busy;
    find('ip-copy').disabled = busy || !lastIP;
  }
  function showIP(data, source, supplied, fallback) {
    const address = validateIP(clean(data.ipAddress || data.ip));
    if (supplied && address.canonical !== supplied.canonical) throw Object.assign(new Error('查询服务返回的 IP 与输入不一致，请稍后重试。'), { code: 'invalid-response' });
    lastIP = address.canonical;
    find('ip-kind').textContent = (supplied ? '指定公网 IP · ' : '当前出口 IP · ') + 'IPv' + address.version;
    find('ip-value').textContent = lastIP;
    find('ip-country').textContent = fallback ? '暂无数据' : clean(data.countryName) || clean(data.countryCode) || '暂无数据';
    const place = [clean(data.regionName), clean(data.cityName)].filter(Boolean);
    find('ip-city').textContent = fallback ? '暂无数据' : [...new Set(place)].join(' / ') || '暂无数据';
    find('ip-organization').textContent = fallback ? '暂无数据' : clean(data.asnOrganization) || '暂无数据';
    const asn = clean(data.asn);
    find('ip-asn').textContent = fallback || !asn ? '暂无数据' : /^AS\d+$/i.test(asn) ? asn.toUpperCase() : /^\d+$/.test(asn) ? 'AS' + asn : asn;
    find('ip-meta').textContent = '数据来源：' + source + ' · ' + new Date().toLocaleString('zh-CN', { hour12: false }) + (fallback ? ' · 备用仅返回 IP，归属信息暂不可用。' : ' · 归属信息为数据库估计，不代表精确位置。');
    find('ip-result').hidden = false;
  }
  async function lookupIP(manual) {
    if (ipRun) return;
    let supplied = null;
    ipInput.removeAttribute('aria-invalid');
    if (manual) {
      try { supplied = validateIP(ipInput.value); }
      catch (error) { ipInput.setAttribute('aria-invalid', 'true'); setStatus(ipStatus, error.message, 'error'); ipInput.focus(); return; }
    }
    const run = { controller: new AbortController() };
    ipRun = run;
    lastIP = '';
    find('ip-result').hidden = true;
    setIPBusy(true);
    setStatus(ipStatus, supplied ? '正在查询指定 IP…' : '正在查询当前公网出口…');
    try {
      let data;
      let fallback = false;
      try {
        data = await queryJSON(GEO_ENDPOINT + (supplied ? '/' + encodeURIComponent(supplied.canonical) : ''), { signal: run.controller.signal });
        if (!data || !parseIP(clean(data.ipAddress))) throw new Error('查询服务未返回有效 IP。');
      } catch (error) {
        if (supplied || error.code === 'rate-limit' || error.code === 'cancelled' || run.controller.signal.aborted) throw error;
        setStatus(ipStatus, '主查询服务暂不可用，正在尝试备用公网 IP 查询…');
        data = await queryJSON(IP_ENDPOINT, { signal: run.controller.signal });
        fallback = true;
      }
      if (ipRun !== run || run.controller.signal.aborted) return;
      showIP(data, fallback ? 'ipify' : 'FreeIPAPI', supplied, fallback);
      setStatus(ipStatus, fallback ? '已获取公网 IP；归属信息暂不可用。' : '查询完成。切换网络或代理后，可再次查询比较。', fallback ? 'warning' : 'success');
    } catch (error) {
      if (ipRun !== run) return;
      const cancelled = run.controller.signal.aborted || error.code === 'cancelled';
      setStatus(ipStatus, cancelled ? '已取消查询。' : error.code ? error.message : '无法完成查询，可能是网络或浏览器跨域限制。请稍后重试。', cancelled ? '' : 'error');
    } finally {
      if (ipRun === run) { ipRun = null; setIPBusy(false); }
    }
  }
  find('ip-current').addEventListener('click', () => { lookupIP(false); });
  find('ip-form').addEventListener('submit', event => { event.preventDefault(); lookupIP(true); });
  find('ip-cancel').addEventListener('click', () => { if (ipRun) ipRun.controller.abort(); });
  find('ip-copy').addEventListener('click', async () => {
    if (!lastIP || ipRun) return;
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') { setStatus(ipStatus, '当前浏览器不支持自动复制，请选中结果中的 IP 复制。', 'warning'); return; }
    try { await navigator.clipboard.writeText(lastIP); setStatus(ipStatus, 'IP 已复制。', 'success'); }
    catch { setStatus(ipStatus, '无法访问剪贴板，请选中结果中的 IP 复制。', 'warning'); }
  });
  function setPingBusy(busy) {
    find('ping-card').setAttribute('aria-busy', String(busy));
    find('ping-start').disabled = busy;
    find('ping-cancel').disabled = !busy;
    targetSelect.disabled = busy;
    find('ping-url-input').disabled = busy;
  }
  function chooseTarget() {
    if (targetSelect.value === 'site') {
      const url = new URL(root.dataset.pingUrl, document.baseURI);
      if (url.origin !== window.location.origin) throw new Error('本站测试资源配置不正确，请选择其他公开目标。');
      return url;
    }
    if (targetSelect.value === 'custom') return validateTarget(find('ping-url-input').value);
    if (PING_TARGETS[targetSelect.value]) return new URL(PING_TARGETS[targetSelect.value]);
    throw new Error('请选择有效的测试目标。');
  }
  function showPingStats(run) {
    const stats = pingSummary(run.rows);
    find('ping-count').textContent = stats.received + ' / ' + stats.completed;
    find('ping-average').textContent = ms(stats.average);
    find('ping-range').textContent = stats.minimum === null ? '—' : stats.minimum.toFixed(1) + ' / ' + stats.maximum.toFixed(1) + ' ms';
    return stats;
  }
  function addPingRow(number, result) {
    const tr = document.createElement('tr');
    const n = document.createElement('td'); n.textContent = String(number);
    const elapsed = document.createElement('td'); elapsed.textContent = ms(result.milliseconds);
    const status = document.createElement('td'); status.dataset.kind = result.kind;
    const labels = { ok: 'HTTP ' + result.status, 'http-error': '已响应 · HTTP ' + result.status + ' 状态异常', timeout: '超时（5 秒）', cancelled: '已取消', 'network-error': '未能读取响应：跨域限制或网络异常', unreadable: '响应不可读取，未计为成功' };
    status.textContent = labels[result.kind] || '未能读取响应';
    tr.append(n, elapsed, status); find('ping-rows').append(tr);
  }
  function pause(milliseconds, signal) {
    return new Promise(resolve => {
      if (signal.aborted) { resolve(); return; }
      const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
      const timer = setTimeout(finish, milliseconds);
      signal.addEventListener('abort', finish, { once: true });
    });
  }
  async function startPing() {
    if (pingRun) return;
    let target;
    try { target = chooseTarget(); }
    catch (error) { setStatus(pingStatus, error.message, 'error'); return; }
    const run = { controller: new AbortController(), rows: [] };
    pingRun = run;
    find('ping-rows').replaceChildren(); find('ping-results').hidden = false;
    setPingBusy(true); showPingStats(run);
    try {
      for (let i = 0; i < ROUNDS; i++) {
        if (run.controller.signal.aborted || pingRun !== run) break;
        setStatus(pingStatus, '正在测试 ' + target.hostname + ' · 第 ' + (i + 1) + ' / ' + ROUNDS + ' 次（到响应头）…');
        const requestURL = new URL(target.href);
        requestURL.searchParams.set('_net_ping', Date.now().toString(36) + '-' + i + '-' + Math.random().toString(36).slice(2, 7));
        const result = await measurePing(requestURL.href, { signal: run.controller.signal });
        if (pingRun !== run) return;
        run.rows.push(result); addPingRow(i + 1, result); showPingStats(run);
        if (result.kind === 'cancelled') break;
        if (i < ROUNDS - 1) await pause(350, run.controller.signal);
      }
      if (pingRun !== run) return;
      const stats = showPingStats(run);
      if (run.controller.signal.aborted) setStatus(pingStatus, '已取消。完成 ' + stats.completed + ' 次请求，收到 ' + stats.received + ' 次可读取响应。');
      else if (!stats.received) setStatus(pingStatus, '测试结束，未能读取响应。可能是跨域限制、超时或网络异常，不能据此认定目标离线。', 'warning');
      else setStatus(pingStatus, '测试完成：收到 ' + stats.received + ' / ' + ROUNDS + ' 次响应，' + stats.normal + ' 次 HTTP 状态正常。平均值只计算可读取响应。', stats.normal === ROUNDS ? 'success' : 'warning');
    } catch {
      if (pingRun === run) setStatus(pingStatus, '测试中断，请检查网络后重试。', 'error');
    } finally {
      if (pingRun === run) { pingRun = null; setPingBusy(false); }
    }
  }
  targetSelect.addEventListener('change', () => { find('ping-custom').hidden = targetSelect.value !== 'custom'; });
  find('ping-form').addEventListener('submit', event => { event.preventDefault(); startPing(); });
  find('ping-cancel').addEventListener('click', () => { if (pingRun) pingRun.controller.abort(); });
  const icmpStatus = find('icmp-status');
  const icmpTarget = find('icmp-target');
  const icmpRegion = find('icmp-region');
  function setICMPBusy(busy) {
    find('icmp-card').setAttribute('aria-busy', String(busy));
    find('icmp-start').disabled = busy;
    find('icmp-stop').disabled = !busy;
    icmpTarget.disabled = busy;
    icmpRegion.disabled = busy;
  }
  function resetICMPResults() {
    find('icmp-results').hidden = true;
    find('icmp-raw-details').hidden = true;
    find('icmp-link-wrap').hidden = true;
    for (const key of ['probe', 'network', 'address', 'average', 'range', 'loss', 'packets']) find('icmp-' + key).textContent = '—';
    find('icmp-raw').textContent = '';
    find('icmp-link').removeAttribute('href');
  }
  function showICMPResult(data) {
    const record = Array.isArray(data.results) ? data.results.find(item => item && typeof item === 'object') : null;
    if (!record) { setStatus(icmpStatus, '远程任务已结束，但没有返回可用的探针结果。', 'warning'); return; }
    const probe = record.probe && typeof record.probe === 'object' ? record.probe : {};
    const result = record.result && typeof record.result === 'object' ? record.result : {};
    const stats = result.stats && typeof result.stats === 'object' ? result.stats : {};
    find('icmp-probe').textContent = [clean(probe.city), clean(probe.country), clean(probe.continent)].filter(Boolean).join(' / ') || '暂无探针位置信息';
    const asn = clean(probe.asn);
    const asnLabel = /^\d+$/.test(asn) ? 'AS' + asn : /^AS\d+$/i.test(asn) ? asn.toUpperCase() : '';
    find('icmp-network').textContent = [asnLabel, clean(probe.network)].filter(Boolean).join(' · ') || '暂无网络信息';
    find('icmp-address').textContent = clean(result.resolvedAddress) || '暂无解析地址';
    const average = finiteMetric(stats.avg), minimum = finiteMetric(stats.min), maximum = finiteMetric(stats.max);
    const loss = finiteMetric(stats.loss), total = finiteMetric(stats.total), received = finiteMetric(stats.rcv);
    find('icmp-average').textContent = ms(average);
    find('icmp-range').textContent = (minimum === null ? '—' : minimum.toFixed(1)) + ' / ' + (maximum === null ? '—' : maximum.toFixed(1)) + (minimum !== null || maximum !== null ? ' ms' : '');
    find('icmp-loss').textContent = loss === null || loss > 100 ? '—' : loss.toFixed(1) + '%';
    find('icmp-packets').textContent = (total === null ? '—' : String(total)) + ' / ' + (received === null ? '—' : String(received));
    const raw = typeof result.rawOutput === 'string' ? result.rawOutput.slice(0, 3000) : '';
    find('icmp-raw').textContent = raw;
    find('icmp-raw-details').hidden = !raw;
    find('icmp-results').hidden = false;
    if (result.status === 'offline') setStatus(icmpStatus, '远程探针离线，未获得完整 ICMP 结果。可稍后选择其他范围再试。', 'warning');
    else if (result.status !== 'finished') setStatus(icmpStatus, '探针测试未成功完成。下方仅展示服务返回的记录，缺失数据以“—”表示。', 'warning');
    else if (received === 0) setStatus(icmpStatus, '远程测试完成，目标未返回 ICMP 响应。目标可能限制 ICMP，不能据此认定其网站离线。', 'warning');
    else if (average === null && minimum === null && maximum === null && loss === null) setStatus(icmpStatus, '远程任务已结束，但未返回可用的统计数据。', 'warning');
    else setStatus(icmpStatus, '远程 ICMP 测试完成。结果来自此公共探针，不代表当前设备的连接延迟。', 'success');
  }
  async function startICMP() {
    if (icmpRun) return;
    let target;
    icmpTarget.removeAttribute('aria-invalid');
    try { target = validateICMPTarget(icmpTarget.value); }
    catch (error) { icmpTarget.setAttribute('aria-invalid', 'true'); setStatus(icmpStatus, error.message, 'error'); icmpTarget.focus(); return; }
    const region = icmpRegion.value;
    if (!['AS', 'EU', 'NA', 'world'].includes(region)) { setStatus(icmpStatus, '请选择有效的探针范围。', 'error'); return; }
    const run = { controller: new AbortController(), phase: 'create', expired: false, id: '' };
    icmpRun = run;
    resetICMPResults(); setICMPBusy(true);
    const deadline = setTimeout(() => { run.expired = true; run.controller.abort(); }, 25000);
    run.deadline = deadline;
    setStatus(icmpStatus, '正在提交远程 ICMP 任务…');
    try {
      const payload = { type: 'ping', target, limit: 1, timeout: 10, measurementOptions: { packets: 5, protocol: 'ICMP' } };
      if (region !== 'world') payload.locations = [{ continent: region }];
      const created = await measurementRequest(GLOBALPING_API, { signal: run.controller.signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (icmpRun !== run || run.controller.signal.aborted) return;
      if (!created || !safeMeasurementID(created.id)) throw Object.assign(new Error('任务提交后未返回可确认的任务编号；创建状态不确定，远程任务可能继续。本页没有自动重发。'), { code: 'creation-uncertain' });
      run.id = created.id; run.phase = 'poll';
      const resultURL = GLOBALPING_API + '/' + encodeURIComponent(run.id);
      find('icmp-link').href = resultURL; find('icmp-link-wrap').hidden = false;
      for (let i = 0; i < 25; i++) {
        await pause(1000, run.controller.signal);
        if (icmpRun !== run || run.controller.signal.aborted) break;
        setStatus(icmpStatus, '远程探针正在测试 ' + target + '，等待公开结果…');
        const data = await measurementRequest(resultURL, { signal: run.controller.signal });
        if (icmpRun !== run || run.controller.signal.aborted) break;
        if (data && data.status === 'finished') { run.phase = 'finished'; showICMPResult(data); return; }
        if (!data || data.status !== 'in-progress') { setStatus(icmpStatus, '远程服务已结束本次任务，但未提供已完成的测量。可查看此任务的公开原始结果。', 'warning'); run.phase = 'finished'; return; }
      }
      if (icmpRun !== run) return;
      setStatus(icmpStatus, run.expired ? '等待已达到 25 秒。远程任务可能继续运行，可查看公开原始结果；本页没有重新提交。' : '已停止等待，远程任务可能继续运行。可查看已创建任务的公开原始结果。', 'warning');
    } catch (error) {
      if (icmpRun !== run) return;
      let message;
      if (run.expired) message = run.phase === 'create' ? '等待已达到 25 秒，任务创建状态不确定。远程任务可能继续，本页没有自动重发。' : '等待已达到 25 秒。远程任务可能继续运行，可查看公开原始结果；本页没有重新提交。';
      else if (run.controller.signal.aborted) message = '已停止本页等待。已经派发的远程任务可能继续运行，本页没有重新提交。';
      else if (error.code === 'rate-limit') message = error.message;
      else if (run.phase === 'create' && !['http-error', 'creation-uncertain'].includes(error.code)) message = '未能确认远程任务是否创建，可能是超时、跨域限制或网络异常。远程任务可能继续，本页没有自动重发。';
      else if (error.code === 'creation-uncertain' || error.code === 'http-error') message = error.message;
      else message = '无法继续读取远程结果，可能是超时、跨域限制或网络异常。任务可能仍在运行，可查看公开原始结果。';
      setStatus(icmpStatus, message, run.controller.signal.aborted ? 'warning' : 'error');
    } finally {
      clearTimeout(deadline);
      if (icmpRun === run) { icmpRun = null; setICMPBusy(false); }
    }
  }
  find('icmp-form').addEventListener('submit', event => { event.preventDefault(); startICMP(); });
  find('icmp-stop').addEventListener('click', () => {
    if (!icmpRun) return;
    const run = icmpRun;
    run.controller.abort(); clearTimeout(run.deadline);
    icmpRun = null; setICMPBusy(false);
    setStatus(icmpStatus, '已停止本页等待。已经派发的远程任务可能继续运行，本页没有重新提交。', 'warning');
  });
  window.addEventListener('pagehide', () => { if (ipRun) ipRun.controller.abort(); if (pingRun) pingRun.controller.abort(); if (icmpRun) icmpRun.controller.abort(); });
  setIPBusy(false); setPingBusy(false); setICMPBusy(false);
})();
