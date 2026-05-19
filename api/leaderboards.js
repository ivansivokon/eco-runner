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

  if (req.method === 'GET') {
    try {
      const response = await fetch(`${KV_URL}/get/${LEADERBOARD_KEY}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const json = await response.json();
      console.log('GET response:', JSON.stringify(json));

      // result может быть null (ключ не существует) или строкой с JSON
      let entries = [];
      if (json.result) {
        try {
          entries = JSON.parse(json.result);
        } catch (e) {
          console.error('JSON parse error on GET:', e);
          entries = [];
        }
      }
      return res.status(200).json(entries.slice(0, 10));
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

      // 1. Получаем текущий список
      const getRes = await fetch(`${KV_URL}/get/${LEADERBOARD_KEY}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const getJson = await getRes.json();
      console.log('GET before save:', JSON.stringify(getJson));

      let entries = [];
      if (getJson.result) {
        try {
          entries = JSON.parse(getJson.result);
        } catch (e) {
          console.error('JSON parse error on POST:', e);
          entries = [];
        }
      }

      // 2. Добавляем и сортируем
      entries.push(entry);
      entries.sort((a, b) => b.score - a.score);
      const trimmed = entries.slice(0, MAX_ENTRIES);

      // 3. Сохраняем обратно
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
        throw new Error('Failed to save to Upstash');
      }

      // 4. Находим позицию (может быть не уникальной, берём первый совпадающий)
      const position = trimmed.findIndex(
        e => e.name === cleanName && e.score === entry.score
      ) + 1;

      return res.status(200).json({ success: true, position: position > 0 ? position : trimmed.length });
    } catch (error) {
      console.error('POST error:', error);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}