/**
 * ═══════════════════════════════════════════════════════════════════
 * GHHOST V3 — THE INSIGHTS BRAIN (LLM POWERED)
 * ═══════════════════════════════════════════════════════════════════
 *
 * POST /api/insights
 *
 * Translates the Assembly Line's mathematical projections and Data
 * Lake's qualitative notes into human-readable analysis via OpenAI.
 *
 * Contract:
 *   IN  → { sport, activeGame?, players, question?, conversationHistory?, globalMode?, matchups? }
 *   OUT → { insights: string[], timestamp }
 *
 * v3.0 — Now supports:
 *   - Global chat mode (no activeGame required)
 *   - Conversation memory via conversationHistory
 *   - Pre-formatted player context from the chat widget
 *   - Multi-sport awareness
 * ═══════════════════════════════════════════════════════════════════
 */

import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function pickTopPlayers(players, count = 5) {
  // Find top N highest-confidence edges to save tokens and focus analysis
  const scored = players
    .filter(p => p.evaluations && p.evaluations.length > 0)
    .map(p => {
      const best = p.evaluations.reduce((a, b) =>
        (b.confidence || 0) > (a.confidence || 0) ? b : a
      );
      return { ...p, _bestEval: best, _bestConf: best.confidence || 0 };
    })
    .sort((a, b) => b._bestConf - a._bestConf);

  return scored.slice(0, count);
}

function formatPlayerContext(players) {
  // Handle pre-formatted context from global chat (already has prop, call, etc.)
  if (players.length > 0 && players[0].prop) {
    return players;
  }
  // Handle raw player data from Lab page
  return pickTopPlayers(players, 10).map(p => {
    const ev = p._bestEval;
    return {
      player: p.player,
      team: p.team,
      opponent: p.opponentAbbr || p.opponent,
      sport: p.sport,
      prop: ev.category,
      call: ev.call,
      confidence: ev.confidence,
      projected: ev.projectedTarget,
      average: ev.avg,
      oppRank: ev.rank,
      streakInfo: ev.streakDesc,
      venueAndRest: ev.oppDesc,
      dataLakeNotes: ev.memoryDesc,
    };
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { sport, activeGame, players, question, conversationHistory, globalMode, matchups } = body;

    if (!players || players.length === 0) {
      // In global mode, it's okay to not have players if we have a sport
      if (!globalMode) {
        return NextResponse.json(
          { insights: ['👻 Insufficient data to analyze. Select a matchup first.'], timestamp: Date.now() },
          { status: 400 }
        );
      }
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { insights: ['👻 The LLM Brain is offline. Missing OPENAI_API_KEY in environment.'], timestamp: Date.now() },
        { status: 500 }
      );
    }

    const contextData = players && players.length > 0 ? formatPlayerContext(players) : [];

    // Build matchup string for context
    let matchupContext = '';
    if (activeGame) {
      matchupContext = `Focused matchup: ${activeGame.away} @ ${activeGame.home}.`;
    } else if (matchups && matchups.length > 0) {
      const gameList = matchups.slice(0, 8).map(m => `${m.away} @ ${m.home}`).join(', ');
      matchupContext = `Today's games include: ${gameList}.`;
    }

    // Build sport context
    const sportContext = sport === 'MULTI' 
      ? 'You have data across multiple sports (NBA, WNBA, MLB, NFL).'
      : `You are focused on ${sport}.`;

    const systemPrompt = `You are "Ghhost" — an elite predictive sports analytics AI with a mysterious, confident presence.
Your personality: analytical, slightly cryptic, data-driven. You speak with authority. You occasionally use 👻.
You never use gambling terminology. You reference "projections", "edges", "data signals", "trends", "analysis".

${sportContext}
${matchupContext}

Below is the output from your predictive engine — the "Assembly Line". It contains the highest-confidence edges, projections, and qualitative notes from your Data Lake.

${contextData.length > 0 ? `Player Data:\n${JSON.stringify(contextData, null, 2)}` : 'No player data available for today. Respond based on general knowledge of the sport and current season.'}

Guidelines:
- Generate 2-4 concise insight messages in a terminal/hacker-feed style.
- Use **bold** for player names and key numbers.
- Use 🟢 for OVER projections and 🔴 for UNDER projections.
- If you see dataLakeNotes or streakInfo, call them out as "Data Lake" or "Trend" signals.
- If the user asks a specific question, focus your response entirely on answering it using available data.
- If no player data is available, offer general analysis, note what you'd watch for, or acknowledge the gap.
- Keep each message to 1-3 sentences. Be punchy, not verbose.

CRITICAL: You must return a JSON object with exactly one key "insights", containing an array of strings.`;

    const llmMessages = [
      { role: "system", content: systemPrompt }
    ];

    // Add conversation history for context (up to 8 prior messages)
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-8);
      recentHistory.forEach(msg => {
        llmMessages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.role === 'assistant' ? msg.content : msg.content,
        });
      });
    }

    // Add the current question
    if (question && question.trim().length > 0) {
      llmMessages.push({ role: "user", content: question });
    } else if (!conversationHistory || conversationHistory.length === 0) {
      llmMessages.push({ 
        role: "user", 
        content: activeGame 
          ? `Scan the Assembly Line and provide the top insights for ${activeGame.away} @ ${activeGame.home}.`
          : `Scan the Assembly Line and provide the top insights and edges for today.`
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: llmMessages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "insights_feed",
          strict: true,
          schema: {
            type: "object",
            properties: {
              insights: {
                type: "array",
                items: { type: "string" },
                description: "The list of insight messages to display in the terminal."
              }
            },
            required: ["insights"],
            additionalProperties: false
          }
        }
      }
    });

    const responseContent = JSON.parse(completion.choices[0].message.content);

    return NextResponse.json({ 
      insights: responseContent.insights, 
      timestamp: Date.now() 
    });

  } catch (err) {
    console.error('[LLM Insights API Error]', err);
    return NextResponse.json(
      { insights: ['👻 The LLM Brain encountered a systemic error. Please check server logs.'], timestamp: Date.now() },
      { status: 500 }
    );
  }
}
