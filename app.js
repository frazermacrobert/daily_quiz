// Core front-end logic for the LNER Daily Quiz
// Handles: time window gating in Europe/London, rendering, answer flow,
// IP-based single attempt, simple backend adapter for entries and winners.
const qs = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => [...el.querySelectorAll(s)];

function fmtRange(tz, openHour, closeHour){
  const open = new Date(); const close = new Date();
  const now = new Date();
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

function getLondonNow(tz){
  // Use the tz to compute the current date/time components reliably.
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
  }).formatToParts(now);
  const by = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const iso = `${by.year}-${by.month}-${by.day}T${by.hour}:${by.minute}:${by.second}`;
  return new Date(iso.replace(' ', 'T'));
}

function dayIndexFromStart(startISO, tz){
  const start = new Date(startISO + 'T00:00:00');
  const now = getLondonNow(tz);
  const ms = now - start;
  return Math.floor(ms / (1000*60*60*24));
}

function inWindow(now, tz, openHour, closeHour){
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const open = new Date(Date.UTC(y, m, d, openHour-1, 0, 0));
  const close = new Date(Date.UTC(y, m, d, closeHour-1, 0, 0));
  // The -1 adjustment is a crude shim; we rely on rendering via getLondonNow for correctness.
  // Gate by comparing hour values in the tz directly:
  const hour = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour:'2-digit', hour12:false }).format(now), 10);
  return hour >= openHour && hour < closeHour;
}

function storageKey(k){ return `lnerq:${k}`; }

async function pickWinnerRandom(entries){
  if(!entries || entries.length === 0) return null;
  const idx = Math.floor(Math.random() * entries.length);
  return { name: entries[idx].name, ts: Date.now() };
}

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
  const now = getLondonNow(tz);
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
    setNotice(`<p>The 24‑day quiz is complete. Thanks for playing.</p>`);
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
