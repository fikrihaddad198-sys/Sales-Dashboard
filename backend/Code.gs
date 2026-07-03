/* ============================================================================
   Fore Coffee Sales Dashboard — GAS backend (staff management + data)

   Responsibilities:
   - Serve the sales CSV (sheet "bacot") ONLY to an active, approved staff.
   - Own the "staff" sheet = identity (Fore ID ↔ email) + status source of truth.
   - Enforce the approval gate: the data endpoint returns rows only when the
     caller's status === 'active'. This is the REAL access gate.

   Security model (no master key needed):
   - Supabase handles password + email confirmation.
   - Registration uses the client's own Supabase signUp() (sends the confirm
     email natively) — this backend only records the Fore ID ↔ email mapping and
     the status. So NO service_role key lives here; only the public anon key,
     which is safe.
   - Every owner-only endpoint re-verifies the caller: their Supabase token →
     email → a staff row with is_owner=TRUE and status=active.

   All responses are JSONP: append ?action=…&callback=cb to the /exec URL.

   SETUP: see backend/SETUP.md.
   ============================================================================ */

const CFG = {
  SPREADSHEET_ID : '1Y49X7Gj2Zy8XaX85ONHQTXnd3ItrmwPZHA2MXlRy4gU',
  DATA_SHEET     : 'bacot',     // sheet the dashboard reads
  STAFF_SHEET    : 'staff',     // fore_id | email | status | is_owner | created_at | approved_at | last_seen

  SUPA_URL       : 'https://umarsaninyxepfgscjts.supabase.co',
  // Public anon key — safe to commit (client-side key, not a secret).
  SUPA_KEY       : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtYXJzYW5pbnl4ZXBmZ3NjanRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MDYwMjgsImV4cCI6MjA5ODI4MjAyOH0.lYA4Kuiz_YnOXuL6ISyQjp-tBOPTYXXEHgcjZxlunf8',

  ONLINE_MIN     : 3,           // last_seen within N minutes = "online"
  FORE_ID_RE     : /^\d{3,8}$/, // numeric, 3–8 digits
};

/* ── Router ─────────────────────────────────────────────────────────────── */
function doGet(e){
  const p  = e.parameter || {};
  const cb = p.callback || 'callback';
  let out;
  try{
    switch(p.action){
      case 'register':     out = apiRegister(p.fore_id, p.email);             break;
      case 'resolveLogin': out = apiResolveLogin(p.fore_id);                  break;
      case 'data':         out = apiData(p.token);                           break;
      case 'me':           out = apiMe(p.token);                             break;
      case 'listStaff':    out = apiListStaff(p.token);                      break;
      case 'setStatus':    out = apiSetStatus(p.token, p.fore_id, p.status); break;
      case 'deleteStaff':  out = apiDeleteStaff(p.token, p.fore_id);         break;
      default:             out = { ok:false, error:'unknown_action' };
    }
  }catch(err){
    out = { ok:false, error: String(err && err.message || err) };
  }
  return jsonp(out, cb);
}
// Kept as a no-op so any old client POST doesn't 500.
function doPost(e){ return jsonp({ ok:false, error:'use_get' }, 'callback'); }

/* ── Supabase (anon key only) ───────────────────────────────────────────── */
// Resolve a user's access token → { email, confirmed } or null.
function sbUser(token){
  if(!token) return null;
  const res = UrlFetchApp.fetch(CFG.SUPA_URL + '/auth/v1/user', {
    method:'get', muteHttpExceptions:true,
    headers:{ 'apikey':CFG.SUPA_KEY, 'Authorization':'Bearer '+token }
  });
  if(res.getResponseCode() !== 200) return null;
  const u = JSON.parse(res.getContentText());
  if(!u || !u.email) return null;
  return { email:String(u.email).toLowerCase(), confirmed: !!u.email_confirmed_at };
}

/* ── staff sheet helpers ────────────────────────────────────────────────── */
const STAFF_COLS = ['fore_id','email','status','is_owner','created_at','approved_at','last_seen'];

function staffSheet(){
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  let sh = ss.getSheetByName(CFG.STAFF_SHEET);
  if(!sh){ sh = ss.insertSheet(CFG.STAFF_SHEET); sh.appendRow(STAFF_COLS); }
  return sh;
}
function staffAll(){
  const sh = staffSheet();
  const vals = sh.getDataRange().getValues();
  const rows = [];
  for(let i=1;i<vals.length;i++){
    const r = vals[i]; if(r[0]===''||r[0]===null||r[0]===undefined) continue;
    rows.push({
      _row:i+1,
      fore_id:String(r[0]).trim(),
      email:String(r[1]||'').trim().toLowerCase(),
      status:String(r[2]||'').trim().toLowerCase(),
      is_owner:(r[3]===true || String(r[3]).toUpperCase()==='TRUE'),
      created_at:String(r[4]||''),
      approved_at:String(r[5]||''),
      last_seen:String(r[6]||'')
    });
  }
  return rows;
}
function staffByForeId(id){ id=String(id).trim(); return staffAll().find(r=>r.fore_id===id) || null; }
function staffByEmail(email){ email=String(email).trim().toLowerCase(); return staffAll().find(r=>r.email===email) || null; }
function staffSet(row, field, value){ staffSheet().getRange(row, STAFF_COLS.indexOf(field)+1).setValue(value); }
function staffAppend(o){ staffSheet().appendRow(STAFF_COLS.map(c=>o[c]!==undefined?o[c]:'')); }
function staffDelete(row){ staffSheet().deleteRow(row); }

/* ── caller identity ────────────────────────────────────────────────────── */
function callerRow(token){ const u=sbUser(token); return u ? staffByEmail(u.email) : null; }
function requireOwner(token){
  const row = callerRow(token);
  if(!row || !row.is_owner || row.status!=='active') throw new Error('not_owner');
  return row;
}
function nowIso(){ return new Date().toISOString(); }

/* ── Endpoints ──────────────────────────────────────────────────────────── */

// Reserve a Fore ID ↔ email as PENDING. Called by the client BEFORE it runs
// Supabase signUp() (which creates the account + sends the confirm email).
function apiRegister(fore_id, email){
  fore_id = String(fore_id||'').trim();
  email   = String(email||'').trim().toLowerCase();
  if(!CFG.FORE_ID_RE.test(fore_id)) return { ok:false, error:'bad_fore_id' };
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok:false, error:'bad_email' };
  if(staffByForeId(fore_id)) return { ok:false, error:'fore_id_exists' };
  if(staffByEmail(email))    return { ok:false, error:'email_exists' };
  staffAppend({ fore_id, email, status:'pending', is_owner:'', created_at:nowIso() });
  notifyOwnersOfRegistration(fore_id, email);   // email the owner(s); never blocks registration
  return { ok:true };
}

// Email every owner that a new staff registered and is waiting for approval.
// Best-effort: any mail failure is swallowed so it never breaks registration.
function notifyOwnersOfRegistration(fore_id, email){
  try{
    const owners = staffAll().filter(r=>r.is_owner && r.email);
    if(!owners.length) return;
    const to = owners.map(o=>o.email).join(',');
    MailApp.sendEmail({
      to: to,
      subject: 'Staff baru menunggu persetujuan — Fore Dashboard',
      body:
        'Ada pendaftaran staff baru di Fore Coffee Sales Dashboard.\n\n' +
        'Fore ID : ' + fore_id + '\n' +
        'Email   : ' + email + '\n' +
        'Waktu   : ' + nowIso() + '\n\n' +
        'Buka menu "Kelola Staff" di dashboard untuk mengaktifkan atau menolak akun ini.\n' +
        'Akun tetap terkunci (tidak bisa lihat data) sampai kamu aktifkan.'
    });
  }catch(err){ /* mail quota / auth issue — ignore, registration still succeeds */ }
}

// Fore ID → the email to sign in with + its status. No secrets returned.
function apiResolveLogin(fore_id){
  const row = staffByForeId(String(fore_id||'').trim());
  if(!row) return { ok:false, error:'not_found' };
  return { ok:true, email:row.email, status:row.status, is_owner:row.is_owner };
}

// THE data gate — rows only for an active caller. Updates last_seen.
function apiData(token){
  const row = callerRow(token);
  if(!row)                    return { ok:false, error:'no_session' };
  if(row.status!=='active')   return { ok:false, error:'inactive', status:row.status };
  staffSet(row._row, 'last_seen', nowIso());
  return { ok:true, csv: readDataCsv(), is_owner: row.is_owner };
}

// Session restore / isOwner.
function apiMe(token){
  const row = callerRow(token);
  if(!row) return { ok:false, error:'no_session' };
  return { ok:true, fore_id:row.fore_id, status:row.status, is_owner:row.is_owner };
}

// Owner: full staff list with an "online" flag.
function apiListStaff(token){
  requireOwner(token);
  const cut = Date.now() - CFG.ONLINE_MIN*60*1000;
  const staff = staffAll().map(r=>({
    fore_id:r.fore_id, email:r.email, status:r.status, is_owner:r.is_owner,
    created_at:r.created_at, approved_at:r.approved_at, last_seen:r.last_seen,
    online: r.last_seen ? (new Date(r.last_seen).getTime() >= cut) : false
  }));
  return { ok:true, staff };
}

// Owner: pending → active (approve) / active → disabled / re-enable.
function apiSetStatus(token, fore_id, status){
  requireOwner(token);
  status = String(status||'').trim().toLowerCase();
  if(['pending','active','disabled'].indexOf(status)===-1) return { ok:false, error:'bad_status' };
  const row = staffByForeId(String(fore_id||'').trim());
  if(!row) return { ok:false, error:'not_found' };
  if(row.is_owner) return { ok:false, error:'cannot_change_owner' };
  staffSet(row._row, 'status', status);
  if(status==='active' && !row.approved_at) staffSet(row._row, 'approved_at', nowIso());
  return { ok:true };
}

// Owner: remove the staff row (revokes access — the orphaned Supabase account
// can no longer map to a Fore ID and is rejected by the data gate).
function apiDeleteStaff(token, fore_id){
  requireOwner(token);
  const row = staffByForeId(String(fore_id||'').trim());
  if(!row) return { ok:false, error:'not_found' };
  if(row.is_owner) return { ok:false, error:'cannot_delete_owner' };
  staffDelete(row._row);
  return { ok:true };
}

/* ── Data CSV (sheet "bacot") ───────────────────────────────────────────── */
function readDataCsv(){
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CFG.DATA_SHEET);
  if(!sh) return '';
  const vals = sh.getDataRange().getValues();
  return vals.map(row => row.map(csvCell).join(',')).join('\n');
}
function csvCell(v){
  const s = (v===null||v===undefined) ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}

/* ── JSONP ──────────────────────────────────────────────────────────────── */
function jsonp(obj, cb){
  return ContentService
    .createTextOutput(cb + '(' + JSON.stringify(obj) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
