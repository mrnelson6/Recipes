// ====== CONFIG ======
const SHEET_NAME = 'Recipes';
// Paste your Drive folder ID here (create a folder, copy its ID from the URL)
const FOLDER_ID = 'PUT_DRIVE_FOLDER_ID_HERE';

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

// ---------- GET handler ----------
function doGet(e){
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
}

// ---------- POST handler (multipart or JSON) ----------
function doPost(e){
  e = e || { parameter:{}, postData:null, files:null };
  try {
    // If JSON was sent, parse it; for multipart, e.parameter contains fields
    const body   = (e.postData && e.postData.type && e.postData.type.indexOf('application/json') === 0)
                 ? JSON.parse(e.postData.contents) : {};
    const action = String(body.action || (e.parameter && e.parameter.action) || '').toLowerCase();

    if (action === 'add') {
      const r = body.recipe || {};
      const title = r.title || e.parameter.title || '';
      const type  = r.type  || e.parameter.type  || '';
      const description = r.description || e.parameter.description || '';
      const time  = r.time || e.parameter.time || '';

      let ingredients  = r.ingredients  || e.parameter.ingredients  || [];
      let instructions = r.instructions || e.parameter.instructions || [];
      if (typeof ingredients === 'string')  ingredients  = ingredients.split(/\n+/).map(s=>s.trim()).filter(Boolean);
      if (typeof instructions === 'string') instructions = instructions.split(/\n+/).map(s=>s.trim()).filter(Boolean);

      // URLs pasted by user (comma-separated or array)
      let pictureUrls = r.pictures || e.parameter.pictures || [];
      if (typeof pictureUrls === 'string') pictureUrls = pictureUrls.split(/,\s*/).map(s=>s.trim()).filter(Boolean);

      // Files uploaded via multipart -> e.files
      const uploaded = saveUploadedFiles(e);   // returns array of Drive view URLs
      const allPics = pictureUrls.concat(uploaded);

      // Append to sheet
      const id = Utilities.getUuid();
      const sh = getSheet();
      sh.appendRow([
        id, new Date(),
        String(title).slice(0,160),
        String(type).slice(0,60),
        String(description).slice(0,2000),
        String(time).slice(0,60),
        JSON.stringify(ingredients),
        JSON.stringify(instructions),
        JSON.stringify(allPics),
        0
      ]);

      return json({ ok:true, id, pictures: allPics, uploadedCount: uploaded.length });
    }

    if (action === 'like') {
      const id = String(body.id || (e.parameter && e.parameter.id) || '');
      if (!id) return json({ ok:false, error:'missing_id' });

      const sh = getSheet();
      const values = sh.getDataRange().getValues();
      const rows = values.slice(1);
      const idx = rows.findIndex(r => r[0] === id);
      if (idx < 0) return json({ ok:false, error:'not_found' });

      const rowIndex = idx + 2; // header + 1
      const likesRange = sh.getRange(rowIndex, 10); // col J
      const cur = Number(likesRange.getValue() || 0);
      likesRange.setValue(cur + 1);
      return json({ ok:true, likes: cur + 1 });
    }

    return json({ ok:false, error:'unknown_action' });
  } catch (err) {
    return json({ ok:false, error:String(err) });
  }
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