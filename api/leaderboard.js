import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const LEADERBOARD_KEY = 'global_leaderboard';
const MAX_ENTRIES = 50;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const playerName = url.searchParams.get('name') || '';

      const raw = await redis.get(LEADERBOARD_KEY);
      let entries = [];
      if (typeof raw === 'string') {
        try { entries = JSON.parse(raw); } catch {}
      } else if (Array.isArray(raw)) {
        entries = raw;
      }

      const top = entries.slice(0, 10);
      let position = 0;
      if (playerName) {
        const idx = entries.findIndex(e => e.name === playerName);
        position = idx >= 0 ? idx + 1 : 0;
      }

      return res.status(200).json({ top, position });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, score } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'Имя обязательно' });
      if (typeof score !== 'number' || score < 0) return res.status(400).json({ error: 'Некорректный счёт' });

      const cleanName = name.trim().slice(0, 20);
      const entry = {
        name: cleanName,
        score: Math.floor(score),
        date: new Date().toISOString()
      };

      const raw = await redis.get(LEADERBOARD_KEY);
      let entries = [];
      if (typeof raw === 'string') {
        try { entries = JSON.parse(raw); } catch {}
      } else if (Array.isArray(raw)) {
        entries = raw;
      }

      entries.push(entry);
      entries.sort((a, b) => b.score - a.score);
      const trimmed = entries.slice(0, MAX_ENTRIES);
      await redis.set(LEADERBOARD_KEY, JSON.stringify(trimmed));

      const idx = trimmed.findIndex(e => e.name === cleanName && e.score === entry.score);
      const realPosition = idx === -1 ? trimmed.length : idx + 1;

      return res.status(200).json({ success: true, position: realPosition });
    } catch (e) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}