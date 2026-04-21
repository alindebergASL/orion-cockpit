import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { openclawClient } from '../services/openclaw.js';

export const briefingRouter = Router();

briefingRouter.use(authenticate);

briefingRouter.post('/generate', async (req, res) => {
  const { weather, events, taskCount, displayName, dayOfWeek } = req.body;

  const weatherCtx = weather
    ? `Weather: ${weather.tempF}°F, ${weather.description}, feels like ${weather.feelsLikeF}°F.`
    : 'Weather: unavailable.';

  const eventsCtx = events && events.length > 0
    ? `Today's events (${events.length}): ${events.map((e: { title: string; time: string }) => `${e.title} at ${e.time}`).join(', ')}.`
    : 'No events scheduled today.';

  const prompt = `Generate a warm, personalized 2-3 sentence morning briefing for ${displayName || 'the user'}.
Today is ${dayOfWeek || new Date().toLocaleDateString([], { weekday: 'long' })}.
${weatherCtx}
${eventsCtx}
Open tasks: ${taskCount ?? 0}.

Be conversational and encouraging. Mention the weather naturally. If it's a special day (Monday, Friday, weekend), acknowledge it. Keep it concise.

Return ONLY valid JSON (no markdown, no code fences):
{ "briefing": "your briefing text here" }`;

  try {
    const raw = await openclawClient.chatOnce([
      { role: 'system', content: 'You are a friendly personal assistant. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ]);
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    res.json(JSON.parse(cleaned));
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate briefing', detail: String(err) });
  }
});
