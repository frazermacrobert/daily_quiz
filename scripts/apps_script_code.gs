/**
 * Google Apps Script backend for LNER Daily Quiz
 * Storage: 1 Google Sheet with 3 tabs: entries, winners, config.
 *  - entries: dayIndex, name, ip, ts
 *  - winners: dayIndex, name, ts
 *  - config: key, value (optional future use)
 *
 * Publish > Deploy as web app: "Anyone with the link"
 */
function doPost(e){
  const req = JSON.parse(e.postData.contents);
  const action = req.action;
  const payload = req.payload || {};
  const ss = SpreadsheetApp.getActive();
  const entries = ss.getSheetByName('entries') || ss.insertSheet('entries');
  const winners = ss.getSheetByName('winners') || ss.insertSheet('winners');

  if(action === 'addEntry'){
    const { dayIndex, name, ip } = payload;
    entries.appendRow([dayIndex, name, ip, Date.now()]);
    return _json({ ok: true });
  }

  if(action === 'getEntries'){
    const dayIndex = payload.dayIndex;
    const vals = entries.getDataRange().getValues().filter(r => r[0] === dayIndex);
    const out = vals.map(r => ({ dayIndex:r[0], name:r[1], ip:r[2], ts:r[3] }));
    return _json({ entries: out });
  }

  if(action === 'setWinner'){
    const { dayIndex, winner } = payload;
    // Only set once
    const existing = winners.getDataRange().getValues().find(r => r[0] === dayIndex);
    if(!existing){
      winners.appendRow([dayIndex, winner.name, Date.now()]);
    }
    return _json({ ok: true });
  }

  if(action === 'getWinner'){
    const dayIndex = payload.dayIndex;
    const row = winners.getDataRange().getValues().find(r => r[0] === dayIndex);
    if(!row) return _json({ winner: null });
    return _json({ winner: { name: row[1], ts: row[2] } });
  }

  if(action === 'getWinnersArchive'){
    const vals = winners.getDataRange().getValues();
    const out = vals.map(r => ({ dayIndex:r[0], winner: { name:r[1], ts:r[2] } }));
    return _json({ archive: out });
  }

  return _json({ error: 'Unknown action' }, 400);
}

function _json(obj, code){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
