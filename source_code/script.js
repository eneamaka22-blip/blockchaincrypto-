/* BlockchainCrypto demo: client-side recreation.
   Accounts and stats live in localStorage (the original likely used a server). */
const $ = id => document.getElementById(id);
const enc = new TextEncoder();
const ec = new elliptic.ec('secp256k1');

/* ---------- storage helpers ---------- */
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
let session = store.get('bc_session', null);
const ops = () => store.get('bc_ops_' + session, []);
function record(type, name, ms, extra = {}) {
  const o = ops(); o.push({ type, name, ms, at: Date.now(), ...extra });
  store.set('bc_ops_' + session, o.slice(-200));
}

/* ---------- hashing primitives ---------- */
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const keccak = text => sha3.keccak256(text);
const timed = async fn => { const t = performance.now(); const r = await fn(); return [r, performance.now() - t]; };
const fmt = ms => ms.toFixed(2) + ' ms';
const pwHash = (u, p) => sha256(u + ':' + p);

/* ---------- auth + routing ---------- */
const pages = ['hashing', 'signing', 'merkle', 'blockchain', 'dashboard', 'profile'];
function route() {
  const id = location.hash.slice(1);
  const logged = !!session;
  $('app').hidden = !logged;
  $('auth').hidden = logged;
  if (logged) $('who').textContent = session;
  pages.forEach(p => {
    $(p).hidden = !(logged && (p === id || (!pages.includes(id) && p === 'hashing')));
  });
  document.querySelectorAll('#menu a').forEach(a => a.classList.toggle('active', a.hash === '#' + id));
  if (logged && id === 'dashboard') renderDashboard();
  if (logged && id === 'profile') renderProfile();
  if (logged && id === 'blockchain') loadChain().then(() => { $('b-msg').hidden = true; drawChain(); });
}
window.addEventListener('hashchange', route);

$('to-signup').onclick = e => { e.preventDefault(); $('signin').hidden = true; $('signup').hidden = false; };
$('to-signin').onclick = e => { e.preventDefault(); $('signup').hidden = true; $('signin').hidden = false; };
const say = (el, text, ok) => { el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'bad'); };

const findUser = (users, id) => Object.keys(users).find(k => k.toLowerCase() === id.toLowerCase() || (users[k].email || '').toLowerCase() === id.toLowerCase());
$('su-btn').onclick = async () => {
  try {
    const u = $('su-user').value.trim(), em = $('su-email').value.trim(), p = $('su-pass').value;
    const users = store.get('bc_users', {});
    if (!u || !em) return say($('su-msg'), 'Enter a username and email.');
    if (p.length < 8) return say($('su-msg'), 'Password must be at least 8 characters.');
    if (p !== $('su-pass2').value) return say($('su-msg'), 'Passwords do not match.');
    if (findUser(users, u)) return say($('su-msg'), 'That username is taken.');
    users[u] = { email: em, hash: await pwHash(u, p), id: '#' + Date.now(), since: new Date().toISOString() };
    localStorage.setItem('bc_users', JSON.stringify(users));
    if (!localStorage.getItem('bc_users')) throw new Error('browser storage is blocked');
    $('signup').hidden = true; $('signin').hidden = false;
    $('si-user').value = u; $('si-pass').value = '';
    say($('si-msg'), 'Account created. Sign in below.', true);
  } catch (e) {
    say($('su-msg'), 'Could not save the account: ' + (e.message || e) + '. Try another browser, or allow site data for this page.');
  }
};
$('si-btn').onclick = async () => {
  try {
    const id = $('si-user').value.trim(), users = store.get('bc_users', {}), u = findUser(users, id);
    if (!u) return say($('si-msg'), 'No account found. Check the spelling, or create one first.');
    if (users[u].hash !== await pwHash(u, $('si-pass').value)) return say($('si-msg'), 'Incorrect password. Please try again.');
    session = u; store.set('bc_session', u); location.hash = '#hashing'; route();
  } catch (e) { say($('si-msg'), 'Sign-in failed: ' + (e.message || e)); }
};
$('logout').onclick = () => { session = null; store.set('bc_session', null); location.hash = ''; route(); };

/* ---------- hashing module ---------- */
async function doHash() {
  const t = $('h-in').value;
  $('h-chars').textContent = t.length; $('h-bytes').textContent = enc.encode(t).length;
  if (!t) {
    ['h-sha', 'h-kec'].forEach(i => $(i).textContent = 'Enter text above to compute hash...');
    ['h-sha-len', 'h-sha-t', 'h-kec-len', 'h-kec-t'].forEach(i => $(i).textContent = '—');
    return;
  }
  const [a, ta] = await timed(() => sha256(t)), [b, tb] = await timed(() => keccak(t));
  $('h-sha').textContent = a; $('h-sha-len').textContent = '256 bits (' + a.length + ' hex chars)'; $('h-sha-t').textContent = fmt(ta);
  $('h-kec').textContent = b; $('h-kec-len').textContent = '256 bits (' + b.length + ' hex chars)'; $('h-kec-t').textContent = fmt(tb);
  clearTimeout(doHash.t);
  doHash.t = setTimeout(() => { record('hash', 'SHA-256', ta); record('hash', 'Keccak-256', tb); }, 800);
}
$('h-in').oninput = doHash;
$('h-sample').onclick = () => { $('h-in').value = 'Hello, Blockchain!'; doHash(); };
$('h-clear').onclick = () => { $('h-in').value = ''; doHash(); };

/* ---------- ECDSA module ---------- */
let key = null, sig = null, txData = '', origHash = '';
const showStep = n => {
  [1, 2, 3].forEach(i => $('step' + i).hidden = i !== n);
  document.querySelectorAll('.st').forEach(st => { const k = +st.dataset.s; st.classList.toggle('done', k < n); st.classList.toggle('on', k === n); });
};
$('gen').onclick = () => {
  key = ec.genKeyPair();
  $('pub').textContent = key.getPublic('hex'); $('priv').textContent = key.getPrivate('hex');
  $('keys').hidden = false;
};
$('to2').onclick = () => showStep(2);
$('sign').onclick = async () => {
  if (!key) return;
  txData = JSON.stringify({ sender: $('t-from').value, recipient: $('t-to').value, amount: +$('t-amt').value, data: $('t-data').value, timestamp: new Date().toISOString() });
  const t = performance.now();
  origHash = await sha256(txData);
  sig = key.sign(origHash);
  const ms = performance.now() - t;
  $('s-hash').textContent = origHash; $('s-r').textContent = sig.r.toString(16); $('s-s').textContent = sig.s.toString(16);
  $('s-t').textContent = fmt(ms); $('signed').hidden = false;
  record('sign', 'ECDSA sign', ms);
};
$('to3').onclick = () => { $('v-data').value = txData; $('v-res').hidden = true; showStep(3); };
async function verify(data) {
  const t = performance.now(), h = await sha256(data);
  const ok = ec.keyFromPublic($('pub').textContent, 'hex').verify(h, sig), ms = performance.now() - t;
  record('verify', 'ECDSA verify', ms, { ok });
  const short = x => x.slice(0, 16) + '...' + x.slice(-12);
  $('v-res').className = 'result ' + (ok ? 'good' : 'bad'); $('v-res').hidden = false;
  $('v-res').innerHTML = `<h4><i class="fa-solid ${ok ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> Signature ${ok ? 'Valid' : 'Invalid'}</h4>
    <p>${ok ? 'The signature matches the transaction data and public key. The transaction has not been modified since signing.' : 'The signature does <b>not</b> match the transaction data. The transaction data has been modified after signing.'}</p>
    <p class="hashes">Original hash: <span class="g">${short(origHash)}</span><br>Current hash: <span class="${ok ? 'g' : 'r'}">${short(h)}</span></p>
    <small>Verification time: ${ms.toFixed(3)} ms</small>`;
}
$('verify').onclick = () => verify($('v-data').value);
$('tamper').onclick = () => {
  const o = JSON.parse(txData); o.amount = +(o.amount * 14 + 0.6).toFixed(1); o.tampered = true;
  $('v-data').value = JSON.stringify(o); verify($('v-data').value);
};
$('restart').onclick = () => { key = sig = null; $('keys').hidden = $('signed').hidden = $('v-res').hidden = true; showStep(1); };

/* ---------- Merkle module ---------- */
const SAMPLES = ['G gives 2000 to H', 'J gives 4000 to P', 'W gives 5000 to I', 'N gives 6000 to K'];
let mTxs = [...SAMPLES], mLevels = [], mLeaves = [];
const esc = t => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function renderTxList() {
  $('m-list').innerHTML = mTxs.map((t, i) => `<div class="txrow"><span>Tx ${i + 1}</span><input data-i="${i}" value="${esc(t)}" placeholder="e.g. Alice gives 5 to Bob"><button class="icon del" data-i="${i}" aria-label="Remove"><i class="fa-regular fa-trash-can"></i></button></div>`).join('');
  $('m-list').querySelectorAll('input').forEach(inp => inp.oninput = () => mTxs[inp.dataset.i] = inp.value);
  $('m-list').querySelectorAll('.del').forEach(b => b.onclick = () => { mTxs.splice(+b.dataset.i, 1); renderTxList(); });
}
$('m-load').onclick = () => { mTxs = [...SAMPLES]; renderTxList(); };
$('m-add').onclick = () => { mTxs.push(''); renderTxList(); };
$('m-reset').onclick = () => { mTxs = ['']; renderTxList(); ['m-res', 'm-viz', 'm-pcard'].forEach(i => $(i).hidden = true); };

async function buildMerkle(txs) {
  let level = await Promise.all(txs.map(sha256)); const levels = [level];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(await sha256(level[i] + (level[i + 1] ?? level[i])));
    levels.push(level = next);
  }
  return levels;
}
$('m-build').onclick = async () => {
  const txs = mTxs.filter(t => t.trim());
  if (!txs.length) return;
  mLeaves = txs;
  const [lv, ms] = await timed(() => buildMerkle(txs));
  mLevels = lv; record('merkle', 'Build tree', ms, { leaves: txs.length, depth: lv.length });
  $('m-root').textContent = lv.at(-1)[0]; $('m-lv').textContent = lv.length; $('m-lf').textContent = txs.length; $('m-t').textContent = fmt(ms);
  drawTree(); $('m-pcard').hidden = true; $('m-res').hidden = false; $('m-viz').hidden = false;
};
function drawTree(path = []) {
  const W = 900, L = mLevels.length, gap = W / mLevels[0].length, pos = [];
  mLevels.forEach((lvl, l) => pos.push(lvl.map((_, i) => l ? (pos[l - 1][2 * i] + (pos[l - 1][2 * i + 1] ?? pos[l - 1][2 * i])) / 2 : gap * (i + .5))));
  const y = l => 50 + (L - 1 - l) * 95, on = (l, i) => path.includes(l + ':' + i);
  let links = '', nodes = '';
  mLevels.forEach((lvl, l) => lvl.forEach((h, i) => {
    const x = pos[l][i], root = l === L - 1, leaf = l === 0;
    if (l) [2 * i, 2 * i + 1].filter(c => c < mLevels[l - 1].length).forEach(c => {
      const cx = pos[l - 1][c], my = (y(l) + y(l - 1)) / 2;
      links += `<path d="M${x} ${y(l)}C${x} ${my} ${cx} ${my} ${cx} ${y(l - 1)}" class="lk ${on(l, i) && on(l - 1, c) ? 'on' : ''}"/>`;
    });
    nodes += `<g ${leaf ? `class="lf" data-i="${i}"` : ''}><circle cx="${x}" cy="${y(l)}" r="${root ? 14 : 11}" fill="${root ? '#f59e0b' : leaf ? '#8b5cf6' : '#3b82f6'}" class="${on(l, i) ? 'on' : ''}"/>` +
      (root ? `<text x="${x}" y="${y(l) - 34}" class="t3" text-anchor="middle">Merkle Root</text>` : '') +
      `<text x="${x}" y="${leaf ? y(l) + 28 : y(l) - 20}" class="t1" text-anchor="middle">${h.slice(0, 8)}...</text>` +
      (leaf ? `<text x="${x}" y="${y(l) + 41}" class="t2" text-anchor="middle">${esc(mLeaves[i])}</text>` : '') + '</g>';
  }));
  $('m-tree').innerHTML = `<svg viewBox="0 0 ${W} ${y(0) + 60}" class="tsvg">${links}${nodes}</svg>`;
  $('m-tree').querySelectorAll('.lf').forEach(g => g.onclick = () => showProof(+g.dataset.i));
}
async function showProof(idx) {
  const t0 = performance.now(), steps = [], path = ['0:' + idx]; let i = idx;
  for (let l = 0; l < mLevels.length - 1; l++) {
    const sib = i % 2 ? i - 1 : i + 1;
    steps.push({ hash: mLevels[l][sib] ?? mLevels[l][i], side: i % 2 ? 'left' : 'right' });
    i >>= 1; path.push((l + 1) + ':' + i);
  }
  drawTree(path);
  const leaf = mLevels[0][idx], n = steps.length, total = mLevels[0].length;
  $('m-proof').innerHTML = `<p class="muted">Proving: "${esc(mLeaves[idx])}" (leaf index: ${idx})</p>
    <label>Leaf Hash</label><div class="hashbox"><code>${leaf}</code></div>
    <h4 class="ps"><i class="fa-solid fa-route"></i> Proof Path (${n} step${n === 1 ? '' : 's'})</h4>
    ${steps.map((s, k) => `<div class="proofrow"><span class="step">Step ${k + 1}</span><span class="ph">${s.hash}</span><span class="dir ${s.side}">${s.side.toUpperCase()}</span></div>`).join('')}
    <div id="m-pv"></div><button id="m-vp" class="outline sm"><i class="fa-solid fa-check-double"></i> Verify This Proof</button>`;
  const run = async () => {
    let h = leaf;
    for (const s of steps) h = await sha256(s.side === 'left' ? s.hash + h : h + s.hash);
    const ok = h === mLevels.at(-1)[0];
    $('m-pv').className = 'result ' + (ok ? 'good' : 'bad');
    $('m-pv').innerHTML = ok
      ? `<h4><i class="fa-solid fa-circle-check"></i> Proof Valid: following this path from the leaf hash through ${n} sibling hash${n === 1 ? '' : 'es'} reconstructs the Merkle root.</h4>
         <small>This proves the transaction is included in the block without needing all ${total} transactions. Only ${n} hash${n === 1 ? ' is' : 'es are'} needed instead of ${total}${total > 1 ? ` (a ${Math.round((1 - n / total) * 100)}% reduction)` : ''}.</small>`
      : '<h4><i class="fa-solid fa-circle-xmark"></i> Proof Invalid: the path does not reconstruct the Merkle root.</h4>';
  };
  $('m-vp').onclick = run; await run();
  $('m-pcard').hidden = false;
  record('proof', 'Merkle proof', performance.now() - t0, { depth: n });
}

/* ---------- Blockchain module ---------- */
let chain = [], clean = null, draft = [], selected = null;
const ZERO = '0'.repeat(64), ckey = () => 'bc_chain_' + session;
const blockHash = b => sha256([b.index, b.prev, b.root, b.time, b.nonce, JSON.stringify(b.txs)].join('|'));
async function mkBlock(txs, prev, index) {
  const b = { index, prev, root: (await buildMerkle(txs)).at(-1)[0], time: Date.now(), nonce: Math.floor(Math.random() * 4e9), txs };
  b.hash = await blockHash(b); return b;
}
async function loadChain() {
  chain = store.get(ckey(), []);
  if (!chain.length) chain = [await mkBlock(['Genesis block'], ZERO, 1)];
  store.set(ckey(), chain);
}
async function checkChain() {
  const rows = [];
  for (let i = 0; i < chain.length; i++) {
    const b = chain[i];
    rows.push({ b, hashOk: (await blockHash(b)) === b.hash && (await buildMerkle(b.txs)).at(-1)[0] === b.root,
      linkOk: b.prev === (i ? chain[i - 1].hash : ZERO) });
  }
  return rows;
}
const short = h => h.slice(0, 10) + '...' + h.slice(-8);
function drawChain(rows) {
  $('b-chain').innerHTML = chain.map((b, i) => {
    const r = rows && rows[i], ok = r && r.hashOk && r.linkOk;
    return `<div class="block ${r ? (ok ? 'good' : 'bad') : ''}"><div class="bh"><b><i class="fa-solid fa-cube"></i>Block #${b.index}</b>
      ${r ? `<span class="badge ${ok ? 'good' : 'bad'}">${ok ? 'Verified' : 'Hash Error'}</span>` : ''}</div>
      <dl><div><dt>Hash</dt><dd>${short(b.hash)}</dd></div><div><dt>Prev Hash</dt><dd>${short(b.prev)}</dd></div>
      <div><dt>Merkle Root</dt><dd>${short(b.root)}</dd></div><div><dt>Transactions</dt><dd>${b.txs.length}</dd></div>
      <div><dt>Nonce</dt><dd>${b.nonce}</dd></div><div><dt>Timestamp</dt><dd>${new Date(b.time).toLocaleString('en-GB')}</dd></div></dl>
      <a data-i="${i}"><i class="fa-solid fa-magnifying-glass"></i> View Details</a></div>${i < chain.length - 1 ? '<i class="fa-solid fa-arrow-right arrow"></i>' : ''}`;
  }).join('');
  $('b-chain').querySelectorAll('a').forEach(a => a.onclick = () => {
    selected = +a.dataset.i; $('b-pre').textContent = JSON.stringify(chain[selected], null, 2); $('b-detail').hidden = false;
  });
  store.set(ckey(), chain);
}
function showIntegrity(rows) {
  const bad = rows.filter(r => !r.hashOk || !r.linkOk).length, ok = !bad, n = rows.length;
  $('b-msg').className = 'result ' + (ok ? 'good' : 'bad'); $('b-msg').hidden = false;
  $('b-msg').innerHTML = `<h4><i class="fa-solid ${ok ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> Chain Integrity ${ok ? `Valid (${n}/${n} Blocks Verified)` : `BROKEN (${bad} of ${n} Blocks Failed)`}</h4>
    <p>${ok ? 'Every block has been cryptographically validated: SHA-256 block hashes match stored data and previous block hashes form an unbroken chain.' : `Tampering or corruption detected! The blockchain verification evaluated all ${n} block(s):`}</p>
    <table><tr><th>Block</th><th>Hash Integrity</th><th>Parent Link</th><th>Result</th></tr>${rows.map(r => {
      const p = r.hashOk && r.linkOk;
      return `<tr><td>Block #${r.b.index}</td><td class="${r.hashOk ? 'g' : 'r'}">${r.hashOk ? 'Hash Valid' : 'Hash Mismatch'}</td>
      <td class="${r.linkOk ? 'g' : 'r'}">${r.linkOk ? 'Linked' : 'Broken'}</td><td><span class="pill ${p ? 'good' : 'bad'}">${p ? 'PASSED' : 'FAILED'}</span></td></tr>`;
    }).join('')}</table>${ok ? '' : '<button id="b-restore" class="outline"><i class="fa-solid fa-rotate-left"></i> Restore Clean Blockchain</button>'}`;
  if (!ok) $('b-restore').onclick = async () => { if (clean) chain = JSON.parse(clean); $('b-detail').hidden = true; await runVerify(); };
}
async function runVerify() { const rows = await checkChain(); showIntegrity(rows); drawChain(rows); }
const drawDraft = () => {
  $('b-txs').innerHTML = draft.map((t, i) => `<label>Transaction ${i + 1}<input data-i="${i}" value="${t}"></label>`).join('');
  $('b-txs').querySelectorAll('input').forEach(inp => inp.oninput = () => draft[inp.dataset.i] = inp.value);
};
$('b-new').onclick = () => { draft = ['']; drawDraft(); $('b-form').hidden = false; };
$('b-addtx').onclick = () => { draft.push(''); drawDraft(); };
$('b-cancel').onclick = () => $('b-form').hidden = true;
$('b-create').onclick = async () => {
  const txs = draft.filter(t => t.trim()); if (!txs.length) return;
  chain.push(await mkBlock(txs, chain.at(-1).hash, chain.length + 1)); clean = null; record('block', 'Create block', 0, { n: txs.length });
  $('b-form').hidden = true; $('b-msg').hidden = true; drawChain();
};
$('b-verify').onclick = runVerify;
$('b-refresh').onclick = async () => { await loadChain(); $('b-msg').hidden = true; drawChain(); };
$('b-reset').onclick = async () => { store.set(ckey(), []); clean = null; $('b-detail').hidden = true; $('b-msg').hidden = true; await loadChain(); drawChain(); };
$('b-tamper').onclick = () => {
  if (!clean) clean = JSON.stringify(chain);
  chain[selected].txs[0] += ' (edited)'; $('b-pre').textContent = JSON.stringify(chain[selected], null, 2); drawChain();
};
$('b-close').onclick = () => $('b-detail').hidden = true;

/* ---------- Dashboard ---------- */
const charts = {};
function drawChart(el, labels, sets, empty) {
  if (charts[el]) { charts[el].destroy(); delete charts[el]; }
  if (!sets.some(d => d.data.some(v => v))) { $(el).innerHTML = `<p class="muted">${empty}</p>`; return; }
  $(el).innerHTML = '<div class="cv"><canvas></canvas></div>';
  const axis = { ticks: { color: '#8b93a8', font: { size: 10 } }, grid: { color: '#222638' } };
  charts[el] = new Chart($(el).querySelector('canvas'), { type: 'bar', data: { labels, datasets: sets },
    options: { maintainAspectRatio: false, scales: { x: axis, y: axis },
      plugins: { legend: { display: sets.length > 1, labels: { color: '#c3c9d9', boxWidth: 40, font: { size: 11 } } } } } });
}
function renderDashboard() {
  const o = ops(), by = n => o.filter(x => x.name === n), cnt = t => o.filter(x => x.type === t).length;
  const avg = (a, k = 'ms') => a.length ? a.reduce((s, x) => s + (x[k] || 0), 0) / a.length : 0, r = v => +v.toFixed(2);
  const kp = [['fa-cube', 'amber', 'Blocks Created', cnt('block')], ['fa-right-left', 'green', 'Transactions', o.filter(x => x.type === 'block').reduce((s, x) => s + (x.n || 0), 0)],
    ['fa-route', 'purple', 'Merkle Proofs', cnt('proof')], ['fa-hashtag', 'cyan', 'Hash Operations', cnt('hash')],
    ['fa-signature', 'amber', 'Sign/Verify Ops', cnt('sign') + cnt('verify')], ['fa-diagram-project', 'pink', 'Merkle Ops', cnt('merkle')]];
  $('d-kpis').innerHTML = kp.map(([i, c, l, v]) => `<div class="tile"><i class="fa-solid ${i} ic ${c}"></i><div><b>${v}</b><small>${l}</small></div></div>`).join('');

  const hs = n => { const t = by(n).map(x => x.ms); return t.length ? [r(avg(by(n))), r(Math.min(...t)), r(Math.max(...t))] : [0, 0, 0]; };
  drawChart('d-hash', ['Avg Time (ms)', 'Min Time (ms)', 'Max Time (ms)'], [
    { label: 'SHA-256', data: hs('SHA-256'), backgroundColor: 'rgba(59,110,200,.85)' },
    { label: 'Keccak-256', data: hs('Keccak-256'), backgroundColor: 'rgba(110,70,190,.85)' }],
    'No hashing operations recorded yet. Use the Hashing module to generate data.');

  const ss = n => { const a = by(n); return [a.length, r(avg(a)), a.filter(x => x.ok !== false).length, a.filter(x => x.ok === false).length]; };
  drawChart('d-sign', ['Operations', 'Avg Time (ms)', 'Success', 'Failures'], [
    { label: 'Sign', data: ss('ECDSA sign'), backgroundColor: 'rgba(16,150,110,.85)' },
    { label: 'Verify', data: ss('ECDSA verify'), backgroundColor: 'rgba(200,130,20,.85)' }],
    'No signing operations recorded yet. Use the Digital Signatures module to generate data.');

  const b = by('Build tree'), p = by('Merkle proof');
  drawChart('d-merkle', ['Build Ops', 'Build Avg (ms)', 'Avg Leaves', 'Proof Ops', 'Proof Avg (ms)', 'Avg Depth'], [
    { label: 'Merkle', data: [b.length, r(avg(b)), r(avg(b, 'leaves')), p.length, r(avg(p)), r(avg(p, 'depth'))],
      backgroundColor: ['rgba(110,70,190,.9)', 'rgba(110,70,190,.55)', 'rgba(110,70,190,.45)', 'rgba(110,70,190,.9)', 'rgba(110,70,190,.55)', 'rgba(110,70,190,.45)'] }],
    'No Merkle operations recorded yet. Use the Merkle Trees module to generate data.');

  const kind = x => ({ sign: ['signing', 'sign'], verify: ['signing', 'verify'], hash: ['hash', x.name], merkle: ['merkle', 'build'], proof: ['merkle', 'proof'], block: ['blockchain', 'create block'] })[x.type];
  const ico = { signing: 'fa-signature', hash: 'fa-hashtag', merkle: 'fa-diagram-project', blockchain: 'fa-link' };
  $('d-recent').innerHTML = o.length ? `<table class="act"><tr><th>TYPE</th><th>DETAIL</th><th>TIME</th><th>DATE</th></tr>${o.slice(-12).reverse().map(x => {
    const [t, d] = kind(x); return `<tr><td><i class="fa-solid ${ico[t]}"></i>${t}</td><td>${d}</td><td>${x.ms.toFixed(3)} ms</td><td>${new Date(x.at).toLocaleString('en-GB')}</td></tr>`;
  }).join('')}</table>` : '<p class="muted">No activity recorded yet. Start using the modules to see operations here.</p>';
}

/* ---------- Profile ---------- */
function renderProfile() {
  const u = store.get('bc_users', {})[session] || {}, o = ops();
  $('p-av').textContent = session.slice(0, 2).toUpperCase(); $('p-id').textContent = u.id || '—'; $('p-user').textContent = session; $('p-email').textContent = u.email || '—';
  $('p-since').textContent = u.since ? new Date(u.since).toLocaleString('en-GB') : '—';
  $('p-h').textContent = o.filter(x => x.type === 'hash').length;
  $('p-s').textContent = o.filter(x => /sign|verify/.test(x.type)).length;
  $('p-m').textContent = o.filter(x => x.type === 'merkle').length;
  $('p-b').textContent = o.filter(x => x.type === 'block').length;
}
$('pw-open').onclick = () => $('pw-form').hidden = false;
$('pw-cancel').onclick = () => $('pw-form').hidden = true;
$('pw-save').onclick = async () => {
  const users = store.get('bc_users', {}), n = $('pw-new').value;
  if (users[session].hash !== await pwHash(session, $('pw-cur').value)) return say($('pw-msg'), 'Current password is incorrect.');
  if (n.length < 8) return say($('pw-msg'), 'New password must be at least 8 characters.');
  if (n !== $('pw-new2').value) return say($('pw-msg'), 'New passwords do not match.');
  users[session].hash = await pwHash(session, n); store.set('bc_users', users);
  say($('pw-msg'), 'Password updated.', true);
};

/* ---------- init ---------- */
$('burger').onclick = () => $('app').classList.toggle('collapsed');
if (innerWidth < 800) $('app').classList.add('collapsed');
renderTxList(); route();

/* ---------- copy + show/hide key ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-copy]');
  if (b) try { navigator.clipboard.writeText($(b.dataset.copy).textContent); } catch {}
});
$('eye').onclick = () => $('priv').closest('.hashbox').classList.toggle('masked');

/* ---------- show/hide password eye + Enter to submit ---------- */
document.querySelectorAll('input[type=password]').forEach(inp => {
  const wrap = document.createElement('div'); wrap.className = 'pw';
  inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'icon pweye'; btn.setAttribute('aria-label', 'Show password');
  btn.innerHTML = '<i class="fa-regular fa-eye"></i>';
  btn.onclick = () => {
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    btn.innerHTML = `<i class="fa-regular fa-eye${show ? '-slash' : ''}"></i>`;
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  };
  wrap.appendChild(btn);
});
[['si-pass', 'si-btn'], ['su-pass2', 'su-btn']].forEach(([f, b]) => $(f).addEventListener('keydown', e => { if (e.key === 'Enter') $(b).click(); }));
