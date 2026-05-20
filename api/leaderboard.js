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
      const { name, score, avatar } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'Имя обязательно' });
      if (typeof score !== 'number' || score < 0) return res.status(400).json({ error: 'Некорректный счёт' });

      const cleanName = name.trim().slice(0, 20);
      const newEntry = {
        name: cleanName,
        score: Math.floor(score),
        avatar: avatar || '🏃',
        date: new Date().toISOString()
      };

      // Обновляем рекорд в аккаунте (если есть такой пользователь)
      const userRaw = await redis.hget('accounts', cleanName);
      if (userRaw) {
        try {
          const userData = JSON.parse(userRaw);
          if (newEntry.score > (userData.record || 0)) {
            userData.record = newEntry.score;
            await redis.hset('accounts', { [cleanName]: JSON.stringify(userData) });
          }
        } catch {}
      }

      // Получаем текущий список лидерборда
      const raw = await redis.get(LEADERBOARD_KEY);
      let entries = [];
      if (typeof raw === 'string') {
        try { entries = JSON.parse(raw); } catch {}
      } else if (Array.isArray(raw)) {
        entries = raw;
      }

      // Ищем существующую запись с таким именем
      const existingIndex = entries.findIndex(e => e.name === cleanName);
      if (existingIndex !== -1) {
        // Если новый счёт выше – обновляем, иначе игнорируем
        if (newEntry.score > entries[existingIndex].score) {
          entries[existingIndex] = newEntry;
        } else {
          // Игрок уже в таблице с лучшим или таким же счётом – ничего не делаем
          const position = existingIndex + 1;
          return res.status(200).json({ success: true, position });
        }
      } else {
        // Новой записи нет – добавляем
        entries.push(newEntry);
      }

      // Сортируем по убыванию и обрезаем до MAX_ENTRIES
      entries.sort((a, b) => b.score - a.score);
      const trimmed = entries.slice(0, MAX_ENTRIES);
      await redis.set(LEADERBOARD_KEY, JSON.stringify(trimmed));

      // Позиция игрока
      const idx = trimmed.findIndex(e => e.name === cleanName);
      const realPosition = idx === -1 ? trimmed.length : idx + 1;
      return res.status(200).json({ success: true, position: realPosition });
    } catch (e) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}