export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Reminder endpoint is active');
  }

  const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
  const { userId, taskDescription } = req.body || {};

  if (!userId || !taskDescription) {
    return res.status(400).json({ error: 'Missing userId or taskDescription' });
  }

  try {
    const lineUrl = 'https://api.line.me/v2/bot/message/push';
    const lineResponse = await fetch(lineUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: userId,
        messages: [{
          type: 'text',
          text: `⏰ แจ้งเตือนภารกิจ / ตารางสอน:\n${taskDescription}\n\nพร้อมลุยหน้าที่ครูเพื่อศิษย์แล้วครับ!`
        }]
      })
    });

    if (!lineResponse.ok) {
      const errBody = await lineResponse.text();
      console.error('LINE Push Error:', errBody);
      return res.status(500).json({ error: errBody });
    }

    return res.status(200).json({ success: true, message: 'Reminder sent successfully' });
  } catch (error) {
    console.error('Error sending reminder:', error);
    return res.status(500).json({ error: error.message });
  }
}
