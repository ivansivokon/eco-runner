import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { name, passwordHash } = req.body;
    const cleanName = name?.trim().slice(0, 20);
    if (!cleanName || !passwordHash) return res.status(400).json({ error: 'Заполните все поля' });

    const exists = await redis.hexists('accounts', cleanName);
    if (exists) return res.status(409).json({ error: 'Имя уже занято' });

    await redis.hset('accounts', { [cleanName]: passwordHash });
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
}