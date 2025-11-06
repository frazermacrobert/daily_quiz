// Core front-end logic for the LNER Daily Quiz
// Handles: time window gating in Europe/London, rendering, answer flow,
// IP-based single attempt, simple backend adapter for entries and winners.
// Includes a developer time/date override panel (enabled with ?dev=1 or #dev).

const qs = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => [...el.querySelectorAll(s)];

/* =======================
   Developer Override Helpers
   ======================= */
const OVK = 'lnerq:override';

function getOverride(){
  try { return JSON.parse(localStorage.getItem(OVK) || 'null'); }
  catch(e){ return null; }
}
function setOverride(obj){
  if(!obj) localStorage.removeItem(OVK);
  else localStorage.setItem(OVK, JSON.stringify(obj));
}
function showDevUIIfWanted(){
  const want = /[?#&](dev|debug)=?1|#dev/i.test(location.href);
  const btn = qs('#devToggle');
  const panel = qs('#devPanel');
  if(btn && panel){
    btn.style.display = want ? 'inline-flex' : 'none';
    if(want){
      btn.addEventListener('click', () => panel.classList.toggle('open'));
      // Pre-fill fields from stored override
      const ov = getOverride();
      if(ov){
        if(ov.date) qs('#devDate').value = ov.date;
        if(ov.time) qs('#devTime').value = ov.time;
      }
      // Wire controls
      qs('#devApply')?.addEventListener('click', () => {
        const date = qs('#devDate').value || null;
        const time = qs('#devTime').value || null;
        if(!date && !time){ setOverride(null); location.reload(); return; }
        setOverride({ date, time });
        location.reload();
      });
      qs('#devClear')?.addEventListener('click', () => { setOverride(null); location.reload(); });
      qs('#devMinusHour')?.addEventListener('click', () => nudgeOverride({ hours:-1 }));
      qs('#devPlusHour')?.addEventListener('click', () => nudgeOverride({ hours:1 }));
      qs('#devPlusDay')?.addEventListener('click', () => nudgeOverride({ days:1 }));
    }
  }
}
function nudgeOverride({ hours=0, days=0 }){
  const base = effectiveNow('Europe/London');
  base.setHours(base.getHours()+hours);
  base.setDate(base.getDate()+days);
  const pad = n => String(n).padStart(2,'0');
  const date = `${base.getFullYear()}-${pad(base.getMonth()+1)}-${pad(base.getDate())}`;
  const time = `${pad(base.getHours())}:${pad(base.getMinutes())}`;
  setOverride({ date, time });
  location.reload();
}

/* =======================
   Time / Formatting Helpers
   ======================= */
function fmtRange(tz, openHour, closeHour){
  const open = new Date(); const close = new Date(); const now = new Date();
  const nowTz = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour:'2-digit', minute:'2-digit' }).format(now);
  open.setHours(openHour,0,0,0); close.setHours(closeHour,0,0,0);
  const openTz = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour:'2-digit', minute:'2-digit' }).format(open);
  const closeTz = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour:'2-digit', minute:'2-digit' }).format(close);
  return { nowTz, openTz, closeTz };
}

async function getPublicIP(){
  try{
    const res = await fetch('https://api64.ipify.org?format=json', { cache:'no-store' });
    if(!res.ok) throw new Error('ipify failed');
    const j = await res.json();
    return j.ip || '0.0.0.0';
  }catch(e){
    return '0.0.0.0';
  }
}

/**
 * effectiveNow(tz)
 * Returns a Date constructed from either the developer override (if present),
 * or the real current time, projected into the given IANA timezone.
 */
function effectiveNow(tz){
  const ov = getOverride();
  if(ov && (ov.date || ov.time)){
    const nowReal = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
    }).formatToParts(nowReal).reduce((a,p)=> (a[p.type]=p.value, a), {});
    const ymd = ov.date || `${parts.year}-${parts.month}-${parts.day}`;
    const hm  = ov.time || `${parts.hour}:${parts.minute}`;
    return new Date(`${ymd}T${hm}:00`);
  }
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
  }).formatToParts(now).reduce((a,p)=> (a[p.type]=p.value, a), {});
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`);
}

// Backwards-compat wrapper in case anything else calls getLondonNow()
function getLondonNow(tz){ return effectiveNow(tz); }

function dayIndexFromStart(startISO, tz){
  const start = new Date(startISO + 'T00:00:00');
  const now = effectiveNow(tz);
  const ms = now - start;
  return Math.floor(ms / (1000*60*60*24));
}

function inWindow(now, tz, openHour, closeHour){
  // Compare hour value as displayed in the target tz
  const hour = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour:'2-digit', hour12:false }).format(now), 10);
  return hour >= openHour && hour < closeHour;
}

function storageKey(k){ return `lnerq:${k}`; }

async function pickWinnerRandom(entries){
  if(!entries || entries.length === 0) return null;
  const idx = Math.floor(Math.random() * entries.length);
  return { name: entries[idx].name, ts: Date.now() };
}

/* =======================
   App
   ======================= */
export async function runQuiz(CONFIG, backend){
  const {
    startDateISO, totalDays, tz, openHour, closeHour
  } = CONFIG;

  const ui = {
    status: qs('#statusPill'),
    notice: qs('#notice'),
    quizCard: qs('#quizCard'),
    winnerCard: qs('#winnerCard'),
    archiveCard: qs('#archiveCard'),
    dayLabel: qs('#dayLabel'),
    windowLabel: qs('#windowLabel'),
    qText: qs('#questionText'),
    choices: qs('#choices'),
    feedback: qs('#feedback'),
    entryForm: qs('#entryForm'),
    entrantName: qs('#entrantName'),
    winnerName: qs('#winnerName'),
    winnerList: qs('#winnerList')
  };

  // Load questions
  const qres = await fetch('./data/questions.json', { cache:'no-store' });
  const qjson = await qres.json();
  const questions = qjson.questions;

  function renderStatus(state, msg){
    ui.status.classList.remove('open','closed','wait');
    if(state === 'open'){ ui.status.classList.add('open'); ui.status.textContent = 'Open'; }
    else if(state === 'closed'){ ui.status.classList.add('closed'); ui.status.textContent = 'Closed'; }
    else { ui.status.classList.add('wait'); ui.status.textContent = msg || 'Opens at 10:00'; }
  }

  function setNotice(html){ ui.notice.innerHTML = html; ui.notice.classList.remove('hidden'); }
  function hideNotice(){ ui.notice.classList.add('hidden'); }

  const idx = dayIndexFromStart(startDateISO, tz);
  const now = effectiveNow(tz);
  const windowOpen = inWindow(now, tz, openHour, closeHour);

  // Base labels
  ui.dayLabel.textContent = `Day ${Math.min(Math.max(idx+1, 0), totalDays)} of ${totalDays}`;
  const tr = fmtRange(tz, openHour, closeHour);
  ui.windowLabel.textContent = `Today: ${tr.openTz}–${tr.closeTz} (${tz})`;

  // Archive winners
  const archive = await backend.getWinnersArchive(totalDays);
  if(archive.length){
    ui.archiveCard.classList.remove('hidden');
    ui.winnerList.innerHTML = archive
      .sort((a,b)=>a.dayIndex-b.dayIndex)
      .map(x => `<li>Day ${x.dayIndex+1}: <strong>${x.winner.name}</strong></li>`)
      .join('');
  }

  // Out of range (before start or after totalDays)
  if(idx < 0){
    renderStatus('wait', 'Not started');
    setNotice(`<p>First question unlocks at <strong>${tr.openTz}</strong> in ${tz}. Check back then.</p>`);
    return;
  }
  if(idx >= totalDays){
    renderStatus('closed');
    setNotice(`<p>The 24-day quiz is complete. Thanks for playing.</p>`);
    return;
  }

  // Winner already set for today?
  const existingWinner = await backend.getWinner(idx);
  if(existingWinner){
    renderStatus('closed');
    hideNotice();
    ui.quizCard.classList.add('hidden');
    ui.winnerCard.classList.remove('hidden');
    ui.winnerName.textContent = existingWinner.name;
    return;
  }

  // Before open window
  if(!windowOpen){
    // If before 10:00 -> waiting; if after 16:00 and no winner -> pick from backend
    const hour = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour:'2-digit', hour12:false }).format(now), 10);
    if(hour < openHour){
      renderStatus('wait', 'Opens at 10:00');
      setNotice(`<p>Today’s question unlocks at <strong>${tr.openTz}</strong>. See you then.</p>`);
      return;
    } else {
      // After closeHour: lock quiz and, if adminless, pick and persist a winner now.
      renderStatus('closed');
      const entries = await backend.getEntries(idx);
      const winner = await pickWinnerRandom(entries);
      if(winner){
        await backend.setWinner(idx, winner);
        hideNotice();
        ui.winnerCard.classList.remove('hidden');
        ui.winnerName.textContent = winner.name;
      }else{
        setNotice(`<p>Entries are closed for today. No valid entries were recorded.</p>`);
      }
      return;
    }
  }

  // Window open
  renderStatus('open');
  hideNotice();
  ui.quizCard.classList.remove('hidden');

  // Load today’s question
  const q = questions[idx] || questions[questions.length-1];
  ui.qText.textContent = q.question;
  const letters = ['A','B','C','D'];
  ui.choices.innerHTML = q.choices.map((c,i)=>`
    <li><button class="choice" data-i="${i}">
      <span class="letter">${letters[i]}</span> <span>${c}</span>
    </button></li>
  `).join('');

  // Attempt gating by IP + local flag
  const ip = await getPublicIP();
  const attemptKey = storageKey(`attempt:${idx}:${ip}`);
  const deviceKey = storageKey(`attempt:${idx}:device`);
  const alreadyTried = localStorage.getItem(attemptKey) || localStorage.getItem(deviceKey);

  if(alreadyTried){
    ui.qText.textContent = 'You’ve already taken today’s quiz on this connection.';
    ui.choices.innerHTML = '';
    setNotice('<p>Back again tomorrow at 10:00 for a fresh question.</p>');
    return;
  }

  let answered = false;

  qsa('.choice', ui.choices).forEach(btn => {
    btn.addEventListener('click', () => {
      if(answered) return;
      answered = true;
      const i = parseInt(btn.dataset.i, 10);
      const correct = i === q.answerIndex;
      // paint states
      qsa('.choice', ui.choices).forEach(b => b.disabled = true);
      btn.classList.add(correct ? 'correct' : 'incorrect');
      localStorage.setItem(attemptKey, '1');
      localStorage.setItem(deviceKey, '1');

      if(correct){
        ui.feedback.classList.remove('hidden');
        ui.feedback.classList.add('ok');
        ui.feedback.textContent = 'Correct. Nice work.';
        ui.entryForm.classList.remove('hidden');
        ui.entrantName.focus();
      }else{
        ui.feedback.classList.remove('hidden');
        ui.feedback.classList.remove('ok');
        ui.feedback.innerHTML = `<strong>Not quite.</strong> ${q.explain}`;
        setNotice('<p>Come back tomorrow at 10:00 for another go.</p>');
      }
    }, { once: true });
  });

  ui.entryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = ui.entrantName.value.trim();
    if(!name){ ui.entrantName.focus(); return; }
    const btn = ui.entryForm.querySelector('button');
    btn.disabled = true;
    try{
      await backend.addEntry(idx, name, ip);
      ui.entryForm.innerHTML = '<p><strong>Thanks!</strong> Your name is in today’s draw. Check back after 16:00 to see who won.</p>';
    }catch(err){
      ui.entryForm.innerHTML = '<p>Sorry, there was a problem saving your entry. Please try again later.</p>';
    }
  });
}

/* =======================
   Dev UI bootstrap (badge clock)
   ======================= */
document.addEventListener('DOMContentLoaded', () => {
  showDevUIIfWanted();
  const badge = document.getElementById('devNow');
  if(badge){
    const now = effectiveNow('Europe/London');
    const fmt = new Intl.DateTimeFormat('en-GB', {
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit'
    });
    badge.textContent = fmt.format(now);
  }
});
