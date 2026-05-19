// api/leaderboard.js

// Используем правильные имена переменных окружения
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const LEADERBOARD_KEY = 'global_leaderboard';
const MAX_ENTRIES = 50;

export default async function handler(req, res) {
  // Разрешаем запросы с любых источников
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      // Запрос к Upstash REST API: https://docs.upstash.com/redis/features/restapi
      const response = await fetch(`${KV_URL}/get/${LEADERBOARD_KEY}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const json = await response.json();
      const raw = json.result;
      const entries = raw ? JSON.parse(raw) : [];
      const top = entries.slice(0, 10);
      return res.status(200).json(top);
    } catch (error) {
      console.error('GET error:', error);
      return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, score } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Имя обязательно' });
      }
      if (typeof score !== 'number' || score < 0) {
        return res.status(400).json({ error: 'Некорректный счёт' });
      }

      const cleanName = name.trim().slice(0, 20);
      const entry = {
        name: cleanName,
        score: Math.floor(score),
        date: new Date().toISOString()
      };

      // Получаем текущий список
      const getRes = await fetch(`${KV_URL}/get/${LEADERBOARD_KEY}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const getJson = await getRes.json();
      const raw = getJson.result;
      const entries = raw ? JSON.parse(raw) : [];

      entries.push(entry);
      entries.sort((a, b) => b.score - a.score);
      const trimmed = entries.slice(0, MAX_ENTRIES);

      // Сохраняем обновлённый список
      await fetch(`${KV_URL}/set/${LEADERBOARD_KEY}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value: JSON.stringify(trimmed) })
      });

      // Позиция нового игрока
      const position = trimmed.findIndex(
        e => e.name === cleanName && e.score === entry.score && e.date === entry.date
      ) + 1;

      return res.status(200).json({ success: true, position });
    } catch (error) {
      console.error('POST error:', error);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}