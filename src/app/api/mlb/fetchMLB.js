export async function fetchMLB(endpoint, params = {}) {
  const url = new URL(`https://statsapi.mlb.com/api/v1/${endpoint}`);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      // Next.js caching: revalidate every hour or keep it fresh
      next: { revalidate: 3600 }
    });
    
    if (!res.ok) {
      console.error('MLB API Error:', res.status, res.statusText);
      throw new Error(`MLB API responded with ${res.status}`);
    }
    
    return await res.json();
  } catch (error) {
    console.error('Failed fetching from MLB Stats API:', error);
    throw error;
  }
}
