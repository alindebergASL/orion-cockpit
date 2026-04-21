import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { streamAiText } from '../services/ai-stream.js';

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

  const userPrompt = `Generate a warm, personalized 2-3 sentence morning briefing for ${displayName || 'the user'}.
Today is ${dayOfWeek || new Date().toLocaleDateString([], { weekday: 'long' })}.
${weatherCtx}
${eventsCtx}
Open tasks: ${taskCount ?? 0}.

Be conversational and encouraging. Mention the weather naturally. If it's a special day (Monday, Friday, weekend), acknowledge it. Keep it concise. Respond with only the briefing text — no preamble, no JSON, no code fences.`;

  await streamAiText(
    res,
    'You are a friendly personal assistant. Respond with only the briefing text.',
    userPrompt,
  );
});
