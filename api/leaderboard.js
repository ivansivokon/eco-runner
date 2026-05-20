// api/leaderboard.js
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

  // GET — вернуть топ-10
  if (req.method === 'GET') {
    try {
      const data = await redis.get(LEADERBOARD_KEY);
      let entries = [];
      if (typeof data === 'string') {
        try { entries = JSON.parse(data); } catch {}
      } else if (Array.isArray(data)) {
        entries = data;
      }
      const top = entries.slice(0, 10);
      return res.status(200).json(top);
    } catch (error) {
      console.error('GET error:', error);
      return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  }

  // POST — добавить результат
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

      // Читаем текущий список
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

      // Сохраняем
      await redis.set(LEADERBOARD_KEY, JSON.stringify(trimmed));

      // Определяем позицию
      const position = trimmed.findIndex(
        e => e.name === cleanName && e.score === entry.score
      );
      const realPosition = position === -1 ? trimmed.length : position + 1;

      return res.status(200).json({ success: true, position: realPosition });
    } catch (error) {
      console.error('POST error:', error);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}