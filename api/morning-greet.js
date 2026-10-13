import admin from 'firebase-admin';

// ฟังก์ชันเชื่อมต่อ Firebase Admin SDK อย่างปลอดภัย
function getFirestoreDb() {
  if (!admin.apps.length) {
    try {
      if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
        });
      }
    } catch (err) {
      console.error('Firebase initialization error:', err);
      return null;
    }
  }
  try {
    return admin.apps.length ? admin.firestore() : null;
  } catch (e) {
    return null;
  }
}

export const config = {
  maxDuration: 60, // ขยายเวลาประมวลผลสูงสุด 60 วินาทีสำหรับ Serverless
};

export default async function handler(req, res) {
  // รองรับ CORS สำหรับการทดสอบยิงจากหน้าเว็บหรือระบบภายนอก
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const LINE_USER_ID = process.env.LINE_USER_ID;

  // ตรวจสอบความพร้อมของตัวแปร Environment Variables สำคัญ
  if (!LINE_ACCESS_TOKEN || !GEMINI_API_KEY || !LINE_USER_ID) {
    return res.status(500).json({ 
      success: false, 
      error: "Missing Environment Variables (ตรวจสอบ LINE_ACCESS_TOKEN, GEMINI_API_KEY หรือ LINE_USER_ID บน Vercel)" 
    });
  }

  const db = getFirestoreDb();
  const now = new Date();
  const thaiDateFull = now.toLocaleDateString('th-TH', { 
    timeZone: 'Asia/Bangkok',
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // ตรวจสอบรอบ 3 วัน (3-Day Cycle) หรือบังคับโหมดผ่าน Query ?full=true / ?mode=full
  const daysSinceEpoch = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
  const isThreeDayCycle = (daysSinceEpoch % 3 === 0) || (req.query && (req.query.full === 'true' || req.query.mode === 'full'));

  // ดึงรายการงานจริงของครูที่บันทึกไว้ในระบบเพื่อสรุปสั้นๆ ยามเช้า (ตามข้อ 4)
  let realTasksText = "";
  if (db) {
    try {
      const bkkDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now); // 'YYYY-MM-DD'
      
      const snap = await db.collection('tasks').where('completed', '==', false).get();
      const dueToday = [];
      const overdue = [];
      const upcoming = [];

      snap.forEach(doc => {
        const t = doc.data();
        const due = t.dueDate || '';
        if (due === bkkDateStr) {
          dueToday.push(`[🚨 ส่งวันนี้] ${t.title}`);
        } else if (due && due < bkkDateStr && due !== 'ไม่ระบุวัน') {
          overdue.push(`[⚠️ ค้างส่ง] ${t.title}`);
        } else {
          upcoming.push(`[📌 คิวงาน] ${t.title}`);
        }
      });

      if (dueToday.length > 0 || overdue.length > 0 || upcoming.length > 0) {
        realTasksText = 
          (dueToday.length > 0 ? "🔥 ส่งวันนี้:\n" + dueToday.slice(0, 3).map(x => `• ${x}`).join("\n") + "\n" : "") +
          (overdue.length > 0 ? "⚠️ เลยกำหนด:\n" + overdue.slice(0, 2).map(x => `• ${x}`).join("\n") + "\n" : "") +
          (upcoming.length > 0 ? "📋 เร็วๆ นี้:\n" + upcoming.slice(0, 3).map(x => `• ${x}`).join("\n") : "");
      }
    } catch (taskErr) {
      console.error("Fetch tasks for morning greet error:", taskErr);
    }
  }

  // กำหนด Prompt ตามรอบ 3 วัน หรือ วันทั่วไป (บังคับระบุแหล่งข้อมูลและลิงก์จริงที่เข้าศึกษาต่อได้)
  let prompt = "";
  if (isThreeDayCycle) {
    // รอบ 3 วัน: มีข่าว 5 มิติ และการสอนแบบใหม่ๆ สากล/ไทย
    prompt = `คุณคือผู้ช่วยส่วนตัวระดับหัวกะทิของครูสังคมศึกษาที่กำลังศึกษาระดับปริญญาโท และยึดมั่นในอุดมการณ์ 'ครูเพื่อศิษย์'
(วันนี้เป็นรอบแจ้งเตือนพิเศษรอบ 3 วัน: มีสรุปข่าว 5 มิติ และการสอนแบบใหม่ๆ เพิ่มเติม)
ให้จัดเตรียมเนื้อหาแยกเป็น 5 ส่วน โดยคั่นระหว่างแต่ละส่วนด้วยคำว่า "[SPLIT]" เพียงคำเดียวเท่านั้น (ห้ามใส่สิ่งอื่นในบรรทัดคั่น):

กฎสำคัญที่สุดด้านแหล่งข้อมูล (Mandatory Source Links):
- ทุกหัวข้อ ทุกข่าว และทุกนวัตกรรม "ต้องแนบลิงก์แหล่งข้อมูลจริงที่สามารถคลิกเข้าไปศึกษาต่อได้ (Real URL https://...)" 
- ให้ดึง URL ข่าว เว็บไซต์ทางการ หรือสถาบันการศึกษาจริงจากผลการสืบค้น Google Search ห้ามใส่ลิงก์ปลอมหรือเว้นว่างเด็ดขาด
- สรุปให้กระชับ ชัดเจน ลึกซึ้ง เน้นเฉพาะส่วนที่สำคัญ ไม่เยิ่นเย้อ ทุกมิติอ่านเข้าใจง่ายและนำไปใช้จริงได้ทันที

ส่วนที่ 1: คำทักทายยามเช้าและพลังใจครู
- บรรทัดแรกสุด: "☀️ อรุณสวัสดิ์ยามเช้า ${thaiDateFull}"
- ตามด้วยข้อความทักทายและส่งมอบพลังใจครู 1 ย่อหน้าสั้นๆ กระชับ

[SPLIT]

ส่วนที่ 2: 📋 สรุปภารกิจและคิวงานประจำวัน (Daily Priorities)
- สรุปภารกิจสั้นๆ กระชับ เน้นสิ่งที่ต้องทำ/ส่งวันนี้ ไม่ต้องยาวมาก:
${realTasksText ? realTasksText : "• เตรียมการจัดการเรียนรู้วันนี้\n• ตรวจเช็กงานนักเรียนและภาระงานธุรการ\n• จัดสรรเวลาค้นคว้างานวิจัย ป.โท"}

[SPLIT]

ส่วนที่ 3: 💡 นวัตกรรมการศึกษายอดฮิตทั้งไทยและต่างชาติประจำวัน (Trending EdTech & Innovations)
นำเสนอนวัตกรรมการศึกษายอดฮิต 1 นวัตกรรม (คัดสรรทั้งของไทยหรือต่างประเทศที่เป็นกระแสและมีประโยชน์สูง):
- 🎯 นวัตกรรมยอดฮิต: [ชื่อนวัตกรรม พร้อมระบุว่าไทยหรือต่างประเทศ]
- 🔍 แก่นสำคัญ: [อธิบายแนวคิดสั้นกระชับ 2-3 บรรทัด]
- 🏫 นำไปใช้จริงในห้องเรียน: [วิธีสอนหรือกิจกรรมเป็นรูปธรรม 2-3 ข้อ]
- 🛠️ การสร้างสื่อ/เครื่องมือ: [เครื่องมือที่ครูนำไปใช้ได้ทันที]
- 🔗 แหล่งข้อมูลศึกษาต่อ: [ระบุชื่อหน่วยงาน/แพลตฟอร์ม พร้อม URL จริง https:// ที่คลิกเข้าไปศึกษาต่อได้จริง]

[SPLIT]

ส่วนที่ 4: 🌍 ข่าวเด่นรอบโลกและประเด็นร่วมสมัย 5 มิติ (รอบ 3 วัน)
นำเสนอข่าวสถานการณ์จริงล่าสุด 5 มิติเชิงลึกสำหรับจัดเก็บในระบบและใช้สอนสังคมศึกษา:
1. ด้านเทคโนโลยี/AI:
- 📌 หัวข้อข่าว: [พาดหัวข่าวสั้นกระชับ คมชัด ตรงประเด็น]
- 📝 สรุปสาระสำคัญ: [สรุปเนื้อหาข่าวเชิงลึก 2-3 บรรทัด อธิบายบริบทโลก ผลกระทบ และความสำคัญที่เชื่อมโยงกับวิชาสังคมศึกษา]
- 💡 ชวนคิดในห้องเรียน: [ประเด็นคำถามปลายเปิด 1 คำถาม ให้นักเรียนฝึกคิดวิเคราะห์]
- 🔗 แหล่งข่าวศึกษาต่อ: [ชื่อสำนักข่าว เช่น Thai PBS, BBC News ไทย, The Standard, UN News, UNESCO] [URL หน้าข่าวที่เปิดได้จริง 100% เช่น https://news.un.org, https://www.thaipbs.or.th/news, https://www.bbc.com/thai, https://thestandard.co, https://www.unesco.org/en/news]

2. ด้านสิ่งแวดล้อม:
- 📌 หัวข้อข่าว: [พาดหัวข่าวสั้นกระชับ คมชัด ตรงประเด็น]
- 📝 สรุปสาระสำคัญ: [สรุปเนื้อหาข่าวเชิงลึก 2-3 บรรทัด อธิบายบริบทโลกและผลกระทบ]
- 💡 ชวนคิดในห้องเรียน: [ประเด็นคำถามปลายเปิด 1 คำถาม]
- 🔗 แหล่งข่าวศึกษาต่อ: [ชื่อสำนักข่าว] [URL หน้าข่าวที่เปิดได้จริง 100%]

3. ด้านเศรษฐกิจ:
- 📌 หัวข้อข่าว: [พาดหัวข่าวสั้นกระชับ คมชัด ตรงประเด็น]
- 📝 สรุปสาระสำคัญ: [สรุปเนื้อหาข่าวเชิงลึก 2-3 บรรทัด อธิบายบริบทเศรษฐกิจและการพัฒนา]
- 💡 ชวนคิดในห้องเรียน: [ประเด็นคำถามปลายเปิด 1 คำถาม]
- 🔗 แหล่งข่าวศึกษาต่อ: [ชื่อสำนักข่าว] [URL หน้าข่าวที่เปิดได้จริง 100%]

4. ด้านสังคมและสิทธิมนุษยชน:
- 📌 หัวข้อข่าว: [พาดหัวข่าวสั้นกระชับ คมชัด ตรงประเด็น]
- 📝 สรุปสาระสำคัญ: [สรุปเนื้อหาข่าวเชิงลึก 2-3 บรรทัด อธิบายประเด็นสังคมและสิทธิมนุษยชน]
- 💡 ชวนคิดในห้องเรียน: [ประเด็นคำถามปลายเปิด 1 คำถาม]
- 🔗 แหล่งข่าวศึกษาต่อ: [ชื่อสำนักข่าว] [URL หน้าข่าวที่เปิดได้จริง 100%]

5. ด้านนวัตกรรมการศึกษา:
- 📌 หัวข้อข่าว: [พาดหัวข่าวสั้นกระชับ คมชัด ตรงประเด็น]
- 📝 สรุปสาระสำคัญ: [สรุปเนื้อหาข่าวเชิงลึก 2-3 บรรทัด อธิบายทิศทางการศึกษาโลก]
- 💡 ชวนคิดในห้องเรียน: [ประเด็นคำถามปลายเปิด 1 คำถาม]
- 🔗 แหล่งข่าวศึกษาต่อ: [ชื่อสำนักข่าว] [URL หน้าข่าวที่เปิดได้จริง 100%]

กฎสำคัญด้านแหล่งข้อมูลข่าว: ต้องเป็น URL ที่มีอยู่จริงและเปิดอ่านได้ 100% ห้ามแต่ง URL path ย่อยที่ไม่มีอยู่จริงจนเกิด 404 เด็ดขาด หากไม่ทราบ path ย่อยที่แน่นอน ให้ระบุ URL หน้าข่าวหลักของสำนักข่าวนั้นๆ เช่น https://news.un.org, https://www.unesco.org/en/news, https://www.thaipbs.or.th/news, https://thestandard.co, https://www.bbc.com/thai

[SPLIT]

ส่วนที่ 5: 🌐 การสอนแบบใหม่ ๆ ทั้งไทยและสากล (รอบ 3 วัน)
นำเสนอโมเดลการสอนหรือแนวคิดการสอนสมัยใหม่ระดับสากลหรือของไทย 1 รูปแบบ:
1. แนวคิด: [ชื่อแนวคิดการสอน และประเทศ/องค์กรต้นแบบ]
🎯 ชื่อแนวคิด/งานวิจัย: [ชื่อเต็ม]
🔍 แก่นสำคัญ: [อธิบายสั้นกระชับ]
🏫 ไอเดียนำไปสอนจริง (กระบวนการ 4 คิด):
- คิดตั้งคำถาม: [1 บรรทัด]
- คิดวิเคราะห์: [1 บรรทัด]
- คิดสังเคราะห์: [1 บรรทัด]
- คิดนำไปใช้: [1 บรรทัด]
🛠️ แนวทางการนำไปสร้างสื่อ: [คำแนะนำการสร้างสื่อ]
📚 แหล่งค้นคว้าและงานวิจัยศึกษาต่อ: [ระบุชื่อสถาบัน/วารสาร พร้อม URL จริง https:// ที่คลิกเข้าไปศึกษาต่อได้จริง]`;
  } else {
    // วันทั่วไป (2 ใน 3 วัน): เน้นภารกิจสั้นกระชับ และนวัตกรรมการศึกษายอดฮิต พร้อมลิงก์ศึกษาต่อจริง
    prompt = `คุณคือผู้ช่วยส่วนตัวระดับหัวกะทิของครูสังคมศึกษาที่กำลังศึกษาระดับปริญญาโท และยึดมั่นในอุดมการณ์ 'ครูเพื่อศิษย์'
(วันทั่วไป: เน้นภารกิจสั้นกระชับ และนวัตกรรมการศึกษายอดฮิตทั้งไทยและต่างชาติ)
ให้จัดเตรียมเนื้อหาแยกเป็น 3 ส่วน โดยคั่นระหว่างแต่ละส่วนด้วยคำว่า "[SPLIT]" เพียงคำเดียวเท่านั้น:

กฎสำคัญด้านแหล่งข้อมูล: ต้องแนบลิงก์แหล่งข้อมูลจริงที่สามารถคลิกเข้าไปศึกษาต่อได้จริง (Real URL https://...) จากสถาบันหรือแพลตฟอร์มทางการ

ส่วนที่ 1: คำทักทายยามเช้าและพลังใจครู
- บรรทัดแรกสุด: "☀️ อรุณสวัสดิ์ยามเช้า ${thaiDateFull}"
- ตามด้วยข้อความทักทายและส่งมอบพลังใจครู 1 ย่อหน้าสั้นๆ กระชับ

[SPLIT]

ส่วนที่ 2: 📋 สรุปภารกิจและคิวงานประจำวัน (Daily Priorities)
- สรุปภารกิจสั้นๆ กระชับ เน้นสิ่งที่ต้องทำ/ส่งวันนี้ ไม่ต้องยาวมาก:
${realTasksText ? realTasksText : "• เตรียมการจัดการเรียนรู้วันนี้\n• ตรวจเช็กงานนักเรียนและภาระงานธุรการ\n• จัดสรรเวลาค้นคว้างานวิจัย ป.โท"}

[SPLIT]

ส่วนที่ 3: 💡 นวัตกรรมการศึกษายอดฮิตทั้งไทยและต่างชาติประจำวัน (Trending EdTech & Innovations)
นำเสนอนวัตกรรมการศึกษายอดฮิต 1 นวัตกรรม (คัดสรรทั้งของไทยหรือต่างประเทศที่เป็นกระแสและมีประโยชน์สูง เช่น AI เพื่อการสอน, Gamification, Active Learning ฯลฯ):
- 🎯 นวัตกรรมยอดฮิต: [ชื่อนวัตกรรม พร้อมระบุว่าไทยหรือต่างประเทศ]
- 🔍 แก่นสำคัญ: [อธิบายแนวคิดสั้นกระชับ 2-3 บรรทัด]
- 🏫 นำไปใช้จริงในห้องเรียน: [วิธีสอนหรือกิจกรรมเป็นรูปธรรม 2-3 ข้อ]
- 🛠️ การสร้างสื่อ/เครื่องมือ: [เครื่องมือที่ครูนำไปใช้ได้ทันที]
- 🔗 แหล่งข้อมูลศึกษาต่อ: [ระบุชื่อหน่วยงาน/แพลตฟอร์ม พร้อม URL จริง https:// ที่คลิกเข้าไปศึกษาต่อได้จริง]
- 💬 ข้อความส่งท้าย: สรุปพลังใจและพร้อมเป็นผู้ช่วยคุณครูเสมอ`;
  }

  const candidateModels = [
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-2.0-flash'
  ];

  try {
    let geminiData = null;
    let selectedModel = '';

    for (const model of candidateModels) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 5000,
              thinkingConfig: { thinkingBudget: 0 }
            }
          })
        });

        if (geminiRes.ok) {
          geminiData = await geminiRes.json();
          selectedModel = model;
          break;
        } else {
          console.warn(`Morning greet model ${model} failed with status ${geminiRes.status}`);
        }
      } catch (mErr) {
        console.warn(`Morning greet model ${model} error:`, mErr.message);
      }
    }

    if (!geminiData) {
      throw new Error("All Gemini models failed in morning-greet");
    }
    
    // ดึงเฉพาะเนื้อหาข้อความจริงครบทุก Part (คัดแยก thinking ออกอย่างสมบูรณ์)
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    let cleanedText = parts
      .filter(p => p.text && !p.thought)
      .map(p => p.text)
      .join('\n')
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .trim();

    // กรองรอยทดคิดก่อนหน้าส่วนที่ 1 (หากมีข้อความทดก่อน ส่วนที่ 1:)
    const startIdx = cleanedText.indexOf('ส่วนที่ 1:');
    if (startIdx !== -1) {
      cleanedText = cleanedText.substring(startIdx).trim();
    }

    const fullText = cleanedText;

    if (!fullText) {
      throw new Error("No text response from Gemini: " + JSON.stringify(geminiData));
    }

    // หั่นข้อความตามสัญลักษณ์ [SPLIT]
    const rawSections = fullText
      .split("[SPLIT]")
      .map(msg => msg.trim())
      .filter(msg => msg.length > 0);

    const splitMessages = rawSections.map(s => ({ type: "text", text: s }));

    // สร้างรายการข้อความที่จะส่งเข้า LINE
    // สถาปัตยกรรม Dual-Layer: LINE ส่งสรุปกระชับอ่านง่าย 2 บับเบิ้ล ส่วน Firestore เก็บฉบับเต็ม 100%
    const isFullPush = req.query && (req.query.full_line === 'true' || req.query.mode === 'full_line');
    
    let linePushMessages = [];
    if (isFullPush) {
      linePushMessages = splitMessages;
    } else {
      // 1. บับเบิ้ลที่ 1: คำทักทาย & ภารกิจเร่งด่วนประจำวัน
      let sec1 = (rawSections[0] || '').replace(/^ส่วนที่\s*1:\s*/i, '').trim();
      let sec2 = (rawSections[1] || '').replace(/^ส่วนที่\s*2:\s*/i, '').trim();
      let msg1 = `${sec1}\n\n${sec2}`.trim();
      linePushMessages.push({ type: "text", text: msg1 });

      // 2. บับเบิ้ลที่ 2: นวัตกรรมยอดฮิต & ไฮไลต์ข่าว/การสอน + ลิงก์เข้าสู่ระบบ
      let sec3 = (rawSections[2] || '').replace(/^ส่วนที่\s*3:\s*/i, '').trim();
      let msg2 = `${sec3}`;

      if (isThreeDayCycle && rawSections.length >= 4) {
        let sec4 = (rawSections[3] || '').replace(/^ส่วนที่\s*4:\s*/i, '').trim();
        const headlines = [];
        const lines = sec4.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i].trim();
          if (/^\d+\.\s*ด้าน/.test(l)) {
            const cat = l.replace(/^\d+\.\s*/, '').replace(/[\*\_:]/g, '').trim();
            let hl = '';
            for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
              if (lines[j].includes('📌') || lines[j].includes('หัวข้อข่าว')) {
                hl = lines[j].replace(/.*(?:📌|หัวข้อข่าว:?)\s*/, '').replace(/[\*\_]/g, '').trim();
                break;
              }
            }
            headlines.push(`• ${cat}: ${hl || 'สรุปประเด็นร่วมสมัยล่าสุด'}`);
          }
        }

        if (headlines.length > 0) {
          msg2 += `\n\n🌍 ไฮไลต์ข่าวเด่น 5 มิติ (รอบ 3 วัน):\n${headlines.slice(0, 5).join('\n')}`;
        }
      }

      msg2 += `\n\n━━━━━━━━━━━━━━━━━━━━\n📲 อ่านสรุปฉบับเต็ม & สาระการสอนเชิงลึกในระบบ:\n👉 https://krusos-bot-news-02.vercel.app/\n━━━━━━━━━━━━━━━━━━━━`;
      linePushMessages.push({ type: "text", text: msg2.trim() });
    }

    // สกัดรายการ URL แหล่งข้อมูลจริงทั้งหมดเพื่อเก็บเป็นคลังอ้างอิง (ลบเครื่องหมายวรรคตอนท้ายลิงก์ และคัดเฉพาะลิงก์ภายนอก)
    const extractedUrls = (fullText.match(/(https?:\/\/[^\s\)\"\'\<\>]+)/g) || [])
      .map(u => u.replace(/[\.\,\*\_\)\<\>]+$/, '').trim())
      .filter(u => u.startsWith('http') && !u.includes('krusos-bot-news-02.vercel.app'));
    const uniqueSources = [...new Set(extractedUrls)];

    // บันทึกลง Firestore ใน collection "daily_summaries" พร้อม sources (เก็บฉบับเต็ม 100%)
    let firestoreStatus = { saved: false, reason: "ไม่ได้เชื่อมต่อฐานข้อมูล" };

    if (db) {
      try {
        const today = new Date();
        const docRef = await db.collection('daily_summaries').add({
          date: today.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }),
          type: 'morning_news',
          cycle: isThreeDayCycle ? '3day_full' : 'daily_regular',
          title: isThreeDayCycle ? 'สรุปข่าว 5 มิติ & นวัตกรรมการสอนสากล (รอบ 3 วัน)' : 'นวัตกรรมการศึกษายอดฮิต & ภารกิจประจำวัน',
          rawContent: fullText,
          sections: rawSections,
          sources: uniqueSources,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        firestoreStatus = { saved: true, docId: docRef.id, sourcesCount: uniqueSources.length };
        console.log('Successfully saved to Firestore with sources:', docRef.id, uniqueSources);
      } catch (dbErr) {
        firestoreStatus = { saved: false, error: dbErr.message };
        console.error('Firestore save error:', dbErr);
      }
    } else {
      firestoreStatus = { 
        saved: false, 
        reason: "ยังไม่ได้ตั้งค่าตัวแปร FIREBASE_PROJECT_ID หรือ FIREBASE_PRIVATE_KEY บน Vercel" 
      };
    }

    // ยิงส่งข้อความ Push แจ้งเตือนเข้า LINE (ยิงเป็นชุด Batch ละไม่เกิน 5 ข้อความตามโควตา LINE)
    let lastPushError = null;
    for (let i = 0; i < linePushMessages.length; i += 5) {
      const batch = linePushMessages.slice(i, i + 5);
      const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LINE_ACCESS_TOKEN}`
        },
        body: JSON.stringify({
          to: LINE_USER_ID,
          messages: batch
        })
      });

      if (!lineRes.ok) {
        lastPushError = await lineRes.text();
        console.error("LINE Push Error:", lastPushError);
      }
    }

    if (lastPushError) {
      throw new Error("LINE Push Error: " + lastPushError);
    }

    // ส่งผลลัพธ์ตอบกลับ
    return res.status(200).json({ 
      success: true, 
      message: isThreeDayCycle 
        ? "ส่งข้อความสรุปข่าวเช้า 5 มิติและนวัตกรรมการสอนสากล (รอบ 3 วัน) สำเร็จเรียบร้อยแล้วครับ!" 
        : "ส่งนวัตกรรมการศึกษายอดฮิตและภารกิจประจำวันเข้า LINE สำเร็จเรียบร้อยแล้วครับ!",
      cycle: isThreeDayCycle ? '3day_full' : 'daily_regular',
      model: selectedModel,
      sectionsCount: splitMessages.length,
      firestore: firestoreStatus 
    });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
