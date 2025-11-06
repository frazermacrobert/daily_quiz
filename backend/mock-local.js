// Local demo backend (no server).
// Stores entries and winners in localStorage only for the current browser.
// Good for prototyping and visual QA. For production, swap to gsheet-adapter.js.
export class Backend{
  constructor(config){ this.config = config; }

  storageKey(k){ return `lnerq:${k}`; }

  async getEntries(dayIndex){
    const raw = localStorage.getItem(this.storageKey(`entries:${dayIndex}`));
    return raw ? JSON.parse(raw) : [];
  }

  async addEntry(dayIndex, name, ip){
    const list = await this.getEntries(dayIndex);
    list.push({ name: name.trim(), ip, ts: Date.now() });
    localStorage.setItem(this.storageKey(`entries:${dayIndex}`), JSON.stringify(list));
    return { ok: true };
  }

  async getWinner(dayIndex){
    const raw = localStorage.getItem(this.storageKey(`winner:${dayIndex}`));
    return raw ? JSON.parse(raw) : null;
  }

  async setWinner(dayIndex, winnerObj){
    localStorage.setItem(this.storageKey(`winner:${dayIndex}`), JSON.stringify(winnerObj));
    return { ok: true };
  }

  async getWinnersArchive(totalDays){
    const out = [];
    for(let i=0;i<totalDays;i++){
      const w = await this.getWinner(i);
      if(w) out.push({ dayIndex: i, winner: w });
    }
    return out;
  }
}
