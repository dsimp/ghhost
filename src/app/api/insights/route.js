/**
 * ═══════════════════════════════════════════════════════════════════
 * GHHOST V2 — THE INSIGHTS BRAIN (LLM POWERED - Phase 9)
 * ═══════════════════════════════════════════════════════════════════
 *
 * POST /api/insights
 *
 * Translates the Assembly Line's mathematical projections and Data
 * Lake's qualitative notes into human-readable analysis via OpenAI.
 *
 * Contract:
 *   IN  → { sport, activeGame, players, question? }
 *   OUT → { insights: string[], timestamp }
 * ═══════════════════════════════════════════════════════════════════
 */

import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function pickTopPlayers(players) {
  // Find top 5 highest-confidence edges to save tokens and focus analysis
  const scored = players
    .filter(p => p.evaluations && p.evaluations.length > 0)
    .map(p => {
      const best = p.evaluations.reduce((a, b) =>
        (b.confidence || 0) > (a.confidence || 0) ? b : a
      );
      return { ...p, _bestEval: best, _bestConf: best.confidence || 0 };
    })
    .sort((a, b) => b._bestConf - a._bestConf);

  return scored.slice(0, 5);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { sport, activeGame, players, question } = body;

    if (!activeGame || !players || !sport) {
      return NextResponse.json(
        { insights: ['👻 Insufficient data to analyze. Select a matchup first.'], timestamp: Date.now() },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { insights: ['👻 The LLM Brain is offline. Missing OPENAI_API_KEY in environment.'], timestamp: Date.now() },
        { status: 500 }
      );
    }

    const topPlayers = pickTopPlayers(players);
    
    // Format the context for the LLM
    const contextData = topPlayers.map(p => {
      const ev = p._bestEval;
      return {
        player: p.player,
        team: p.team,
        prop: ev.category,
        call: ev.call,
        confidence: ev.confidence,
        projected: ev.projectedTarget,
        average: ev.avg,
        oppRank: ev.rank,
        streakInfo: ev.streakDesc,
        venueAndRest: ev.oppDesc,
        dataLakeNotes: ev.memoryDesc // Contains our Phase 8 Scouting Notes!
      };
    });

    const systemPrompt = `
You are "Ghhost", an elite, predictive sports analytics AI. 
Your tone is confident, hacker-esque, analytical, and slightly mysterious (use the 👻 emoji occasionally).
You are analyzing a ${sport} matchup: ${activeGame.away} @ ${activeGame.home}.
Below is the highly-filtered output from your "Assembly Line" prediction engine. It contains the top edges for this game, along with qualitative notes pulled from your "Data Lake".

Data:
${JSON.stringify(contextData, null, 2)}

Your task is to generate a hacker-terminal style feed of insights (3-5 short messages).
If the user asks a "What If" hypothetical, focus entirely on answering their scenario using the data provided.
Otherwise, summarize the best edges. 
Use markdown formatting like **bolding** player names and lines. Use 🟢 for OVERS and 🔴 for UNDERS. 
If you see a "Scouting Note" in the dataLakeNotes, call it out as a "Data Lake insight".

CRITICAL: You must return a JSON object with exactly one key "insights", containing an array of strings.
`;

    const messages = [
      { role: "system", content: systemPrompt }
    ];

    if (question && question.trim().length > 0) {
      messages.push({ role: "user", content: `User Scenario: "${question}"` });
    } else {
      messages.push({ role: "user", content: `Scan the Assembly Line and provide the top insights for ${activeGame.away} @ ${activeGame.home}.` });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
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
