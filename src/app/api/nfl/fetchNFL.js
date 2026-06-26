export async function fetchNFL(endpoint, params = {}) {
  // Use ESPN's public core API for NFL data
  // Base URL: https://site.api.espn.com/apis/site/v2/sports/football/nfl/
  const baseUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/`;
  
  const url = new URL(`${baseUrl}${endpoint}`);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0'
    },
    // Cache heavily because ESPN API updates slowly during week
    next: { revalidate: 3600 } 
  });

  if (!response.ok) {
    throw new Error(`NFL API error: ${response.status}`);
  }

  return response.json();
}
