// ====== CONFIG ======
const SHEET_NAME = 'Recipes';
// Paste your Drive folder ID here (create a folder, copy its ID from the URL)
const FOLDER_ID = '1G9rjYFXsVZzYeMZ6TCTmn3o_cXSdTIDm';

// ---------- Utilities ----------
function json(o){
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(){
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1,1,1,10).setValues([[
      'id','timestamp','title','type','description','time','ingredients_json','instructions_json','pictures_json','likes'
    ]]);
  }
  return sh;
}

function rowToObj(r){
  return {
    id: r[0],
    timestamp: r[1],
    title: r[2],
    type: r[3],
    description: r[4],
    time: r[5],
    ingredients: JSON.parse(r[6] || '[]'),
    instructions: JSON.parse(r[7] || '[]'),
    pictures: JSON.parse(r[8] || '[]'),
    likes: Number(r[9] || 0)
  };
}

function doGet(e) {
  Logger.log('--- doGet hit ---');
  Logger.log('Timestamp: %s', new Date());
  Logger.log('Query params: %s', JSON.stringify(e && e.parameter));

  return ContentService
    .createTextOutput('Hello from test-doGet. Check the logs in Apps Script.')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ---------- GET handler ----------
/*function doGet(e){
  e = e || { parameter:{} };
  const action = (e.parameter.action || 'list').toLowerCase();
  const sh = getSheet();

  if (action === 'get' && e.parameter.id) {
    const id = e.parameter.id;
    const values = sh.getDataRange().getValues();
    const rows = values.slice(1);
    const idx = rows.findIndex(r => r[0] === id);
    if (idx < 0) return json({ ok:false, error:'not_found' });
    return json({ ok:true, row: rowToObj(rows[idx]) });
  }

  if (action === 'types') {
    const values = sh.getDataRange().getValues();
    const types = [...new Set(values.slice(1).map(r => String(r[3]||'').trim()).filter(Boolean))];
    return json({ ok:true, types });
  }

  // default: list all rows
  const values = sh.getDataRange().getValues();
  const rows = values.slice(1).map(rowToObj);
  return json({ ok:true, rows });
}*/


function doPost(e) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('WebAppLog');
  const timestamp = new Date();

  let postType = '';
  let raw = '';
  let body = {};

  // -----------------------------
  // 1. Read POST body (text/plain)
  // -----------------------------
  if (e && e.postData) {
    postType = e.postData.type || '';
    raw = e.postData.contents || '';
    Logger.log('postData.type: %s', postType);

    // Try to parse JSON no matter what (we sent as text/plain)
    try {
      body = JSON.parse(raw);
    } catch (err) {
      Logger.log('JSON parse error: %s', err);
      body = {};
    }
  }

  const action = String(body.action || '').toLowerCase();
  Logger.log('action: %s', action);

  // For debugging, also log param keys
  const paramKeysArr = Object.keys(e?.parameter || []);
  Logger.log('parameter keys: %s', JSON.stringify(paramKeysArr));

  // Default response
  let result = { ok: true, note: 'no action' };

  // -----------------------------------
  // 2. Handle debugBase64 image upload
  // -----------------------------------
  if (action === 'debugbase64') {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const images = body.images || [];
    const saved = [];

    Logger.log('debugBase64: images.length = %s', images.length);

    images.forEach(img => {
      try {
        const name = img.name || 'upload.bin';
        const mime = img.type || 'application/octet-stream';
        const base64 = img.base64 || '';

        // Decode
        const bytes = Utilities.base64Decode(base64);
        const blob = Utilities.newBlob(bytes, mime, name);

        // Save to Drive
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        const url = 'https://drive.google.com/uc?export=view&id=' + file.getId();

        saved.push({
          name: file.getName(),
          mimeType: file.getMimeType(),
          size: file.getSize(),
          url: url
        });

        // Append to WebAppLog
        sh.appendRow([
          timestamp,              // A
          postType,               // B
          'debugBase64',          // C (action)
          '',                     // D (fileKeys unused)
          true,                   // E (hasFile)
          'base64',               // F (source)
          file.getName(),         // G
          file.getMimeType(),     // H
          file.getSize(),         // I
          url                     // J (Drive URL)
        ]);

      } catch (err) {
        Logger.log('Error saving base64 image: %s', err);
      }
    });

    result = { ok: true, saved };
  } 
  else {
    // Fallback: log the request but no file
    sh.appendRow([
      timestamp,
      postType,
      action || '(none)',
      '',
      false,    // no file
      '', '', '', '', ''
    ]);

    result = { ok: true, note: 'logged (no file)' };
  }

  // -----------------------------------
  // 3. Return JSON output
  // -----------------------------------
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- Drive upload from e.files ----------
function saveUploadedFiles(e){
  const urls = [];
  if (!(e && e.files)) return urls;

  const folder = DriveApp.getFolderById(FOLDER_ID); // must exist & owned by script owner
  const keys = Object.keys(e.files); // Apps Script may use photos, photos1, photos2...
  keys.forEach(k => {
    const blob = e.files[k];
    if (!blob) return;
    const safeName = (blob.getName() || ('photo-' + Date.now())).replace(/[^\w.\-]+/g, '_');
    const file = folder.createFile(blob.copyBlob().setName(safeName));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const id = file.getId();
    urls.push('https://drive.google.com/uc?export=view&id=' + id);
  });

  return urls;
}