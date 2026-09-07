// Desktop acceptance smoke using installed Edge and its local DevTools endpoint.
// Run from server after npm run build; web 5175 (VITE_API_URL=http://127.0.0.1:4101/api), Edge CDP 9225.
// This script owns a loopback-only API on 4101 with test-origin CORS; application CORS is unchanged.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { writeFile } = require('node:fs/promises');
const { prisma } = require('../dist/config/prisma');
const { createAsset } = require('../dist/modules/assets/asset.service');
const jwt = require('jsonwebtoken');
const http = require('node:http');
const app = require('../dist/app').default;
const testServer = http.createServer((req, res) => {
  const setHeader = res.setHeader.bind(res);
  res.setHeader = (name, value) => setHeader(name, name.toLowerCase() === 'access-control-allow-origin' ? 'http://127.0.0.1:5175' : value);
  app(req, res);
});
const suffix = 'WEB-POC-' + Date.now();
const assets = [], locations = [];
let requestId, socket;
let serial = 0;
const pending = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description);
  return result.result.value;
}
async function until(test, description) {
  for (let i = 0; i < 100; i++) { if (await test()) return; await sleep(100); }
  throw new Error('Timed out: ' + description);
}
async function click(text, scope = 'body') {
  await until(() => evaluate('Array.from(document.querySelectorAll(' + JSON.stringify(scope + ' button') + ')).some(b => b.textContent.trim() === ' + JSON.stringify(text) + ' && !b.disabled)'), 'button ' + text);
  await evaluate('Array.from(document.querySelectorAll(' + JSON.stringify(scope + ' button') + ')).find(b => b.textContent.trim() === ' + JSON.stringify(text) + ').click()');
}
async function fill(label, value, scope = 'dialog', index = 0) {
  await evaluate('(() => { const labels = Array.from(document.querySelectorAll(' + JSON.stringify(scope + ' label') + ')).filter(l => l.firstChild.textContent.trim() === ' + JSON.stringify(label) + '); const el = labels[' + index + ']?.querySelector("input,select,textarea"); if (!el) throw Error("Missing field " + ' + JSON.stringify(label) + '); const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ' + JSON.stringify(String(value)) + '); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); })()');
}
async function done() {
  await until(() => evaluate('!document.querySelector("dialog[open]")'), 'dialog closed');
  await until(() => evaluate('!Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "Refresh")?.disabled'), 'workspace refreshed');
}
async function tab(name) {
  await evaluate('Array.from(document.querySelectorAll("[role=tab]")).find(b => b.textContent.startsWith(' + JSON.stringify(name) + ')).click()');
  await sleep(100);
}
async function rowAction(asset, action) {
  await evaluate('(() => { const row = Array.from(document.querySelectorAll("tbody tr")).find(r => r.textContent.includes(' + JSON.stringify(asset) + ')); const b = Array.from(row?.querySelectorAll("button") || []).find(b => b.textContent === ' + JSON.stringify(action) + '); if (!b) throw Error("Missing action"); b.click(); })()');
  await until(() => evaluate('!!document.querySelector("dialog[open]")'), 'action dialog');
}
async function clickRow(asset, action) {
  await evaluate('(() => { const row = Array.from(document.querySelectorAll("tbody tr")).find(r => r.textContent.includes(' + JSON.stringify(asset) + ')); const b = Array.from(row?.querySelectorAll("button") || []).find(b => b.textContent === ' + JSON.stringify(action) + '); if (!b) throw Error("Missing action"); b.click(); })()');
}
async function main() {
  await new Promise((resolve, reject) => { testServer.once('error', reject); testServer.listen(4101, '127.0.0.1', resolve); });
  const [user, category] = await Promise.all([prisma.user.findFirst({ where: { isActive: true }, include: { role: true } }), prisma.assetCategory.findFirst({ where: { isActive: true } })]);
  assert(user && category);
  const root = await prisma.location.create({ data: { locationCode: suffix + '-ROOT', name: suffix + ' Production', locationType: 'OTHER' } }); locations.push(root.id);
  const child = await prisma.location.create({ data: { locationCode: suffix + '-CHILD', name: 'Machine B', locationType: 'OTHER', parentLocationId: root.id } }); locations.push(child.id);
  const store = await prisma.location.create({ data: { locationCode: suffix + '-STORE', name: suffix + ' Store', locationType: 'STORE' } }); locations.push(store.id);
  for (let i = 0; i < 3; i++) assets.push(await createAsset({ assetCode: suffix + '-' + i, categoryId: category.id, measurementHeight: 333, measurementWidth: 444, locationId: store.id, autoGenerateEpc: true }));
  const pages = await (await fetch('http://127.0.0.1:9225/json')).json();
  socket = new WebSocket(pages.find((p) => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({ data }) => { const message = JSON.parse(data); const p = pending.get(message.id); if (p) { clearTimeout(p.timer); pending.delete(message.id); if (message.error) p.reject(new Error(message.error.message)); else p.resolve(message.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:5175/login' });
  await until(() => evaluate('location.origin === "http://127.0.0.1:5175"'), 'origin');
  const token = jwt.sign({ userId: user.id, username: user.username, roleId: user.roleId, roleName: user.role.name }, process.env.JWT_SECRET, { expiresIn: '10m' });
  await evaluate('localStorage.setItem("token", ' + JSON.stringify(token) + '); localStorage.setItem("user", ' + JSON.stringify(JSON.stringify({ id: user.id, username: user.username, fullName: 'Workspace POC' })) + ')');
  await send('Page.navigate', { url: 'http://127.0.0.1:5175/asset-requests' });
  await until(() => evaluate('!!document.querySelector(".request-tabs") && !document.body.innerText.includes("Loading workspace")'), 'workspace load');
  await click('+ New Request');
  await fill('Job No. *', suffix); await fill('Root Location *', root.id);
  for (let i = 0; i < 2; i++) {
    if (i) await click('+ Add Requirement', 'dialog');
    await fill('Asset Category *', category.id, 'dialog', i); await fill('Measurement H (mm) *', 333, 'dialog', i); await fill('Measurement W (mm) *', 444, 'dialog', i);
  }
  await click('Create Request', 'dialog'); await done();
  requestId = (await prisma.assetRequest.findFirstOrThrow({ where: { jobNo: suffix } })).id;
  await fill('Search Job No / Asset Code / EPC', suffix, '.request-filters');
  await click('Edit Request'); await fill('Remarks', 'Browser edit verified'); await click('Save Request', 'dialog'); await done();
  async function select(index) {
    await click(index === 2 ? 'Find Replacement' : 'Find Asset');
    await until(() => evaluate('Array.from(document.querySelectorAll("dialog tbody tr")).some(r => r.textContent.includes(' + JSON.stringify(assets[index].assetCode) + '))'), 'available assets');
    await rowAction(assets[index].assetCode, 'Select Asset'); await done();
  }
  await select(0);
  await rowAction(assets[0].assetCode, 'Prepare'); await fill('Recipient *', user.id); await fill('Specific Location *', child.id); await click('Prepare Requirement', 'dialog'); await done();
  await rowAction(assets[0].assetCode, 'Cancel Selection'); await click('Cancel Selection', 'dialog'); await done();
  await select(0); await select(1);
  await rowAction(assets[1].assetCode, 'Prepare'); await fill('Recipient *', user.id); await fill('Specific Location *', root.id); await click('Prepare Requirement', 'dialog'); await done();
  assert(await evaluate('document.body.innerText.includes("Ready to Issue")'));
  await tab('Issue & Confirmation');
  async function issue(index) {
    await clickRow(assets[index].assetCode, 'Issue to Operation');
    await until(() => evaluate('Array.from(document.querySelectorAll("tbody tr")).some(r => r.textContent.includes(' + JSON.stringify(assets[index].assetCode) + ') && r.textContent.includes("Awaiting EPC Confirmation"))'), 'issued state');
    assert.equal(await evaluate('!!document.querySelector("dialog[open]")'), false);
    await rowAction(assets[index].assetCode, 'Confirm Issue EPC');
    if (index === 0) {
      await fill('Paste / Enter EPC *', assets[1].epc.epcCode); await click('Confirm Issue EPC', 'dialog');
      await until(() => evaluate('!!document.querySelector("dialog .error-box")'), 'wrong EPC error');
      assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[index].id } })).status, 'PENDING_CONFIRMATION');
    }
    await fill('Paste / Enter EPC *', assets[index].epc.epcCode); await click('Confirm Issue EPC', 'dialog'); await done();
  }
  await issue(0); await issue(1);
  await rowAction(assets[0].assetCode, 'Swap Asset'); await fill('Swap Reason *', 'NOT_SUITABLE'); await click('Start Asset Swap', 'dialog'); await done();
  await tab('Returning');
  async function confirmReturn(index) {
    await rowAction(assets[index].assetCode, 'Confirm Return EPC');
    assert(await evaluate('document.querySelector("dialog").innerText.includes(' + JSON.stringify(store.name) + ')'));
    assert.equal(await evaluate('Array.from(document.querySelectorAll("dialog label")).some(l => l.firstChild.textContent.includes("Store Return Location"))'), false);
    await fill('Paste / Enter EPC *', assets[index].epc.epcCode); await fill('Condition *', 'GOOD'); await click('Confirm Return EPC', 'dialog'); await done();
  }
  await confirmReturn(0); await tab('Requesting');
  assert(await evaluate('document.body.innerText.includes("Replacement Required")'));
  await select(2); await rowAction(assets[2].assetCode, 'Prepare'); await fill('Recipient *', user.id); await fill('Specific Location *', child.id); await click('Prepare Requirement', 'dialog'); await done(); await tab('Issue & Confirmation'); await issue(2);
  await tab('Returning');
  for (const index of [1, 2]) { await rowAction(assets[index].assetCode, 'Initiate Return'); await click('Initiate Return', 'dialog'); await done(); await confirmReturn(index); }
  assert.equal((await prisma.assetRequest.findUniqueOrThrow({ where: { id: requestId } })).status, 'COMPLETED');
  await tab('Requesting');
  await evaluate('document.querySelector(".request-filters input[type=checkbox]").click()');
  await until(() => evaluate('Array.from(document.querySelectorAll(".request-job")).some(j => j.textContent.includes(' + JSON.stringify(suffix) + ') && j.textContent.includes("Completed"))'), 'completed test job visible');
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('.runtime-tests/request-workspace-desktop.png', Buffer.from(screenshot.data, 'base64'));
  console.log('PASS desktop browser 1440x900: create/edit, select, prepare recipient/location, cancel/reselect persistence, issue without re-entry, wrong EPC, automatic home returns, swap, replacement, Completed');
  console.log('Screenshot: server/.runtime-tests/request-workspace-desktop.png');
}
main().catch(async (e) => { console.error(e); process.exitCode = 1; if (socket?.readyState === WebSocket.OPEN) console.error(await evaluate('document.body.innerText').catch(() => 'Browser unavailable')); }).finally(async () => {
  const ids = assets.map((a) => a.id);
  if (!requestId) requestId = (await prisma.assetRequest.findFirst({ where: { jobNo: suffix } }))?.id;
  if (ids.length) {
    await prisma.assetScanConfirmation.deleteMany({ where: { assetId: { in: ids } } });
    await prisma.assetMovement.deleteMany({ where: { assetId: { in: ids } } });
    await prisma.assetAssignment.deleteMany({ where: { assetId: { in: ids } } });
    await prisma.assetRequestAllocation.deleteMany({ where: { assetId: { in: ids } } });
  }
  if (requestId) { await prisma.assetRequestLine.deleteMany({ where: { requestId } }); await prisma.assetRequest.delete({ where: { id: requestId } }); }
  if (ids.length) { await prisma.assetEpc.deleteMany({ where: { assetId: { in: ids } } }); await prisma.asset.deleteMany({ where: { id: { in: ids } } }); }
  for (const id of locations.reverse()) await prisma.location.delete({ where: { id } });
  socket?.close(); testServer.close(); await prisma.$disconnect();
});
