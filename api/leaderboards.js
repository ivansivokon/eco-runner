// api/leaderboard.js

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const LEADERBOARD_KEY = 'global_leaderboard';
const MAX_ENTRIES = 50;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Вспомогательная функция для безопасного получения массива из Upstash
  async function getEntries() {
    const response = await fetch(`${KV_URL}/get/${LEADERBOARD_KEY}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const json = await response.json();
    console.log('GET raw response:', JSON.stringify(json));

    if (!json.result) return [];

    let parsed;
    try {
      parsed = JSON.parse(json.result);
    } catch {
      console.error('JSON parse failed, resetting leaderboard');
      return [];
    }

    // Если после парсинга получился не массив – сбрасываем
    return Array.isArray(parsed) ? parsed : [];
  }

  if (req.method === 'GET') {
    try {
      const entries = await getEntries();
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

      // 1. Безопасно получаем массив
      const entries = await getEntries();

      // 2. Добавляем и сортируем
      entries.push(entry);
      entries.sort((a, b) => b.score - a.score);
      const trimmed = entries.slice(0, MAX_ENTRIES);

      // 3. Сохраняем обратно (всегда как строка JSON)
      const setRes = await fetch(`${KV_URL}/set/${LEADERBOARD_KEY}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value: JSON.stringify(trimmed) })
      });
      const setJson = await setRes.json();
      console.log('SET response:', JSON.stringify(setJson));

      if (!setRes.ok || setJson.result !== 'OK') {
        throw new Error('Upstash SET failed');
      }

      // 4. Определяем позицию (просто по месту в массиве)
      const position = trimmed.findIndex(
        e => e.name === cleanName && e.score === entry.score && e.date === entry.date
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