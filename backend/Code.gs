/*  Fore Coffee Sales Dashboard - Access Gatekeeper (Google Apps Script)
 *  --------------------------------------------------------------------
 *  Replaces the old PIN. Users register with (ID Fore + Nama). The owner
 *  approves each request from Telegram. An approved session lasts 30 min,
 *  after which the user must register again. ALL dashboard data flows
 *  through here and is only returned when a valid, unexpired token is
 *  presented - the raw Google Sheet stays private.
 *
 *  Endpoints:
 *    doGet  -> app calls via JSONP  (?action=register|poll|data|me|heartbeat)
 *    doPost -> Telegram webhook     (approve / reject button callbacks)
 *
 *  SETUP: see backend/SETUP.md. Fill the CONFIG block below, deploy as a
 *  Web App (Execute as: Me, Who has access: Anyone), then set the Telegram
 *  webhook to the /exec URL.
 */

// ======================= CONFIG =======================
const CFG = {
  // The spreadsheet that holds the sales data (the one with sheet "bacot").
  SPREADSHEET_ID : '1Y49X7Gj2Zy8XaX85ONHQTXnd3ItrmwPZHA2MXlRy4gU',
  DATA_SHEET     : 'bacot',          // sheet name the dashboard reads
  ACCESS_SHEET   : 'access',         // auto-created; stores registrations

  // Telegram
  TG_BOT_TOKEN   : '8868940589:AAGXIwtUISRupnB5vHtxBtk0I8tvKbLLmHg',  // from @BotFather
  TG_OWNER_CHAT  : '7316023785',  // your Telegram numeric chat id

  // Session
  SESSION_MIN    : 30,               // access duration in minutes

  // Owner: auto-approved, never expire. Must match BOTH id AND name.
  OWNER_IDS      : ['1'],
  OWNER_NAME     : 'Fikri',
};
// ======================================================

// Owner = ID in OWNER_IDS AND name matches OWNER_NAME (case-insensitive).
// Anyone who enters an owner ID with a different name is treated as a
// normal user and must still be approved.
function isOwner(idFore, name){
  if (CFG.OWNER_IDS.indexOf(String(idFore)) === -1) return false;
  return String(name||'').trim().toLowerCase() === CFG.OWNER_NAME.toLowerCase();
}

const ACCESS_HEADERS =
  ['requestId','idFore','name','status','token','createdAt','approvedAt','expiresAt','tgMsgId'];

// ----------------------- ENTRY POINTS -----------------------
function doGet(e){
  const p  = (e && e.parameter) || {};
  const cb = p.callback || '';
  let out;
  try {
    switch (p.action) {
      case 'register':  out = apiRegister(p.idFore, p.name); break;
      case 'poll':      out = apiPoll(p.requestId);          break;
      case 'data':      out = apiData(p.token);              break;
      case 'me':        out = apiMe(p.token);                break;
      case 'heartbeat': out = { ok:true };                   break;
      default:          out = { ok:false, error:'unknown_action' };
    }
  } catch (err) {
    out = { ok:false, error:'server_error', detail:String(err) };
  }
  return jsonp(out, cb);
}

function doPost(e){
  // Telegram webhook updates land here.
  try {
    const update = JSON.parse(e.postData.contents);
    handleTelegramUpdate(update);
  } catch (err) {
    // swallow - Telegram only needs a 200
  }
  return ContentService.createTextOutput('ok');
}

// ----------------------- APP API -----------------------
function apiRegister(idFore, name){
  idFore = String(idFore || '').trim();
  name   = sanitizeName(name);

  if (!/^\d{1,8}$/.test(idFore)) return { ok:false, error:'invalid_id' };
  if (name.length < 2)           return { ok:false, error:'invalid_name' };

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = accessSheet();
    const requestId = Utilities.getUuid();
    const now = new Date();

    // Owner -> auto approve, no expiry. Requires ID + name match.
    if (isOwner(idFore, name)) {
      const token = makeToken();
      const far   = new Date(now.getTime() + 1000*60*60*24*365*10); // 10y
      sh.appendRow([requestId, idFore, name || CFG.OWNER_NAME, 'approved',
                    token, now, now, far, '']);
      return { ok:true, status:'approved', token:token, name:name||CFG.OWNER_NAME,
               idFore:idFore, isOwner:true, expiresAt:far.getTime() };
    }

    // Normal user -> pending, notify owner.
    sh.appendRow([requestId, idFore, name, 'pending', '', now, '', '', '']);
    const msgId = notifyOwner(requestId, idFore, name);
    if (msgId) setCell(sh, requestId, 'tgMsgId', String(msgId));

    return { ok:true, status:'pending', requestId:requestId };
  } finally {
    lock.releaseLock();
  }
}

function apiPoll(requestId){
  if (!requestId) return { ok:false, error:'no_request' };
  const row = findRow(requestId);
  if (!row) return { ok:false, error:'not_found' };

  if (row.status === 'approved') {
    if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
      return { ok:true, status:'expired' };
    }
    return { ok:true, status:'approved', token:row.token, name:row.name,
             idFore:row.idFore, expiresAt:new Date(row.expiresAt).getTime() };
  }
  return { ok:true, status:row.status }; // pending | rejected
}

function apiData(token){
  const v = validateToken(token);
  if (!v.ok) return v;
  const csv = readDataCsv();
  return { ok:true, csv:csv, expiresAt:v.expiresAt, name:v.name, isOwner:v.isOwner };
}

function apiMe(token){
  const v = validateToken(token);
  if (!v.ok) return v;
  return { ok:true, name:v.name, idFore:v.idFore, isOwner:v.isOwner,
           expiresAt:v.expiresAt, remainingMs: v.expiresAt - Date.now() };
}

// ----------------------- TELEGRAM -----------------------
function notifyOwner(requestId, idFore, name){
  if (!CFG.TG_BOT_TOKEN || CFG.TG_BOT_TOKEN.indexOf('PASTE') === 0) return null;
  const text =
    '🔔 *Permintaan akses baru*\n\n' +
    '👤 Nama: *' + tgEsc(name) + '*\n' +
    '🆔 ID Fore: `' + tgEsc(idFore) + '`\n' +
    '🕒 ' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd MMM yyyy HH:mm') +
    '\n\nDurasi akses bila disetujui: *' + CFG.SESSION_MIN + ' menit*';
  const reply = {
    inline_keyboard: [[
      { text:'✅ Setujui', callback_data:'approve:' + requestId },
      { text:'❌ Tolak',   callback_data:'reject:'  + requestId }
    ]]
  };
  const res = tgApi('sendMessage', {
    chat_id: CFG.TG_OWNER_CHAT,
    text: text,
    parse_mode: 'Markdown',
    reply_markup: JSON.stringify(reply)
  });
  return res && res.result ? res.result.message_id : null;
}

function handleTelegramUpdate(update){
  // /start or /id -> reply with chat id (handy during setup)
  if (update.message && update.message.text) {
    const t = update.message.text.trim();
    if (t === '/start' || t === '/id') {
      tgApi('sendMessage', { chat_id: update.message.chat.id,
        text: 'Chat ID kamu: ' + update.message.chat.id });
    }
    return;
  }

  const cq = update.callback_query;
  if (!cq || !cq.data) return;

  // Only the owner may approve/reject.
  if (String(cq.from.id) !== String(CFG.TG_OWNER_CHAT)) {
    tgApi('answerCallbackQuery', { callback_query_id: cq.id,
      text: 'Hanya owner yang bisa menyetujui.', show_alert: true });
    return;
  }

  const parts = cq.data.split(':');
  const decision = parts[0], requestId = parts[1];
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh  = accessSheet();
    const row = findRow(requestId);
    if (!row) {
      tgApi('answerCallbackQuery', { callback_query_id: cq.id, text:'Permintaan tak ditemukan.' });
      return;
    }
    if (row.status !== 'pending') {
      tgApi('answerCallbackQuery', { callback_query_id: cq.id, text:'Sudah diproses.' });
      return;
    }

    let banner;
    if (decision === 'approve') {
      const token = makeToken();
      const now   = new Date();
      const exp   = new Date(now.getTime() + CFG.SESSION_MIN*60000);
      setCell(sh, requestId, 'status', 'approved');
      setCell(sh, requestId, 'token', token);
      setCell(sh, requestId, 'approvedAt', now);
      setCell(sh, requestId, 'expiresAt', exp);
      banner = '✅ *DISETUJUI* - ' + tgEsc(row.name) + ' (`' + tgEsc(row.idFore) + '`)\n' +
               'Akses ' + CFG.SESSION_MIN + ' menit, sampai ' +
               Utilities.formatDate(exp, 'Asia/Jakarta', 'HH:mm');
    } else {
      setCell(sh, requestId, 'status', 'rejected');
      banner = '❌ *DITOLAK* - ' + tgEsc(row.name) + ' (`' + tgEsc(row.idFore) + '`)';
    }

    if (row.tgMsgId) {
      tgApi('editMessageText', {
        chat_id: CFG.TG_OWNER_CHAT,
        message_id: row.tgMsgId,
        text: banner,
        parse_mode: 'Markdown'
      });
    }
    tgApi('answerCallbackQuery', { callback_query_id: cq.id,
      text: decision === 'approve' ? 'Disetujui' : 'Ditolak' });
  } finally {
    lock.releaseLock();
  }
}

function tgApi(method, payload){
  if (!CFG.TG_BOT_TOKEN || CFG.TG_BOT_TOKEN.indexOf('PASTE') === 0) return null;
  const url = 'https://api.telegram.org/bot' + CFG.TG_BOT_TOKEN + '/' + method;
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  try { return JSON.parse(res.getContentText()); } catch (e) { return null; }
}

// ----------------------- DATA -----------------------
function readDataCsv(){
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CFG.DATA_SHEET);
  if (!sh) return '';
  const values = sh.getDataRange().getDisplayValues();
  return values.map(function(r){
    return r.map(csvCell).join(',');
  }).join('\n');
}
function csvCell(v){
  v = (v == null) ? '' : String(v);
  if (/[",\n]/.test(v)) v = '"' + v.replace(/"/g,'""') + '"';
  return v;
}

// ----------------------- TOKEN -----------------------
function makeToken(){
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g,'');
}
function validateToken(token){
  if (!token) return { ok:false, error:'no_token' };
  const data = accessSheet().getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][4]) === String(token)) {  // token col
      const status = data[i][3];
      const exp = data[i][7] ? new Date(data[i][7]).getTime() : 0;
      if (status !== 'approved') return { ok:false, error:'revoked' };
      if (exp && exp < Date.now()) return { ok:false, error:'expired' };
      const idFore = String(data[i][1]);
      return { ok:true, name:data[i][2], idFore:idFore,
               isOwner: isOwner(idFore, data[i][2]), expiresAt:exp };
    }
  }
  return { ok:false, error:'invalid_token' };
}

// ----------------------- SHEET HELPERS -----------------------
function accessSheet(){
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  let sh = ss.getSheetByName(CFG.ACCESS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CFG.ACCESS_SHEET);
    sh.appendRow(ACCESS_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}
function findRow(requestId){
  const data = accessSheet().getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(requestId)) {
      return {
        rowIndex:i+1, requestId:data[i][0], idFore:data[i][1], name:data[i][2],
        status:data[i][3], token:data[i][4], createdAt:data[i][5],
        approvedAt:data[i][6], expiresAt:data[i][7], tgMsgId:data[i][8]
      };
    }
  }
  return null;
}
function setCell(sh, requestId, header, value){
  const col = ACCESS_HEADERS.indexOf(header) + 1;
  if (col < 1) return;
  const data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(requestId)) {
      sh.getRange(i+1, col).setValue(value);
      return;
    }
  }
}

// ----------------------- UTIL -----------------------
function sanitizeName(name){
  return String(name || '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}
function tgEsc(s){ return String(s).replace(/([_*`\[\]])/g, '\\$1'); }
function jsonp(obj, cb){
  const body = JSON.stringify(obj);
  if (cb) {
    return ContentService
      .createTextOutput(cb + '(' + body + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}

// Run ONCE after first deploy to authorize all permissions (Spreadsheet +
// UrlFetch + LockService). Must complete without error before webhook works.
function initSetup(){
  // 1. Touch spreadsheet (creates "access" sheet if missing)
  const sh = accessSheet();
  Logger.log('Sheet rows: ' + sh.getLastRow());

  // 2. Touch LockService
  const lock = LockService.getScriptLock();
  lock.waitLock(3000);
  lock.releaseLock();
  Logger.log('LockService OK');

  // 3. Touch UrlFetchApp via Telegram
  const r = tgApi('sendMessage', {
    chat_id: CFG.TG_OWNER_CHAT,
    text: '✅ initSetup selesai — semua permission aktif, webhook siap dipakai.'
  });
  Logger.log('Telegram: ' + JSON.stringify(r));
}

// Run once manually to verify the bot token + chat id are correct.
function testTelegram(){
  const r = tgApi('sendMessage', { chat_id: CFG.TG_OWNER_CHAT,
    text: 'Bot tersambung. Setup berhasil.' });
  Logger.log(JSON.stringify(r));
}

// Run once manually to check webhook status.
function checkWebhook(){
  const url = 'https://api.telegram.org/bot' + CFG.TG_BOT_TOKEN + '/getWebhookInfo';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  Logger.log(res.getContentText());
}

// Simulate a Tolak button press — lets you test reject flow without a real
// Telegram callback. Paste a real requestId from the "access" sheet.
function testReject(){
  const requestId = 'PASTE_REQUEST_ID_HERE';  // from access sheet column A
  const fakeUpdate = {
    callback_query: {
      id: 'fake',
      from: { id: Number(CFG.TG_OWNER_CHAT) },
      data: 'reject:' + requestId,
      message: { message_id: 0, chat: { id: Number(CFG.TG_OWNER_CHAT) } }
    }
  };
  handleTelegramUpdate(fakeUpdate);
  Logger.log('done');
}
