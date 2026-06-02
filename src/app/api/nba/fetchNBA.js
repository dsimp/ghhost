export const nbaHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

export async function fetchNBA(endpoint, params = {}) {
  const url = new URL(`https://stats.nba.com/stats/${endpoint}`);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: nbaHeaders,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      console.error('NBA API Error:', res.status, res.statusText);
      throw new Error(`NBA API responded with ${res.status}`);
    }
    
    return await res.json();
  } catch (error) {
    console.error('Failed fetching from NBA:', error);
    throw error;
  }
}
