// Google Sheets backend adapter (optional).
// Use with the provided Apps Script in scripts/apps_script_code.gs.
// Fill ENDPOINT with your deployed web app URL and remove mock-local import in index.html.
export class Backend{
  constructor(config){
    this.config = config;
    this.ENDPOINT = '';// e.g. 'https://script.google.com/macros/s/AKfycbxyz/exec'
  }

  async call(action, payload){
    if(!this.ENDPOINT) throw new Error('Backend endpoint not configured.');
    const res = await fetch(this.ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action, payload })
    });
    if(!res.ok) throw new Error('Network error');
    return res.json();
  }

  async getEntries(dayIndex){
    const r = await this.call('getEntries', { dayIndex });
    return r.entries || [];
  }

  async addEntry(dayIndex, name, ip){
    const r = await this.call('addEntry', { dayIndex, name, ip });
    return r;
  }

  async getWinner(dayIndex){
    const r = await this.call('getWinner', { dayIndex });
    return r.winner || null;
  }

  async setWinner(dayIndex, winnerObj){
    const r = await this.call('setWinner', { dayIndex, winner: winnerObj });
    return r;
  }

  async getWinnersArchive(totalDays){
    const r = await this.call('getWinnersArchive', { totalDays });
    return r.archive || [];
  }
}
