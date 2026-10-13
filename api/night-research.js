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
  // รองรับ CORS สำหรับการทดสอบยิงจากหน้าเว็บ
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

  // ตรวจสอบรอบ 3 วันสำหรับสาระวิจัย (3-Day Cycle) หรือบังคับผ่าน Query ?full=true / ?mode=full
  const daysSinceEpoch = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
  const isResearchNight = (daysSinceEpoch % 3 === 0) || (req.query && (req.query.full === 'true' || req.query.mode === 'full'));

  let prompt = "";
  if (isResearchNight) {
    prompt = `คุณคือผู้เชี่ยวชาญด้านการวิจัยทางการศึกษาเปรียบเทียบระดับนานาชาติและกวีเอกผู้เข้าใจจิตวิญญาณของครูไทย
ภารกิจของคุณคือ: จัดเตรียมข้อความก่อนนอนเวลา 21:00 น. (รอบ 3 วัน: เจาะลึกบทความวิจัยด้านสังคมศึกษา/ประวัติศาสตร์/การศึกษา)
สำหรับครูสังคมศึกษาที่กำลังศึกษาระดับปริญญาโท และมุ่งมั่นพัฒนาวิชาชีพสู่ผลงานวิชาการ ว.PA

ให้จัดเตรียมเนื้อหาแยกเป็น 2 ส่วน โดยคั่นระหว่างแต่ละส่วนด้วยคำว่า "[SPLIT]" เพียงคำเดียวเท่านั้น:

กติกาความยาวและคุณภาพ: สรุปให้กระชับ ชัดเจน ลึกซึ้ง เน้นเฉพาะส่วนที่สำคัญ ไม่เยิ่นเย้อ ได้ใจความทางวิชาการครบถ้วน
กฎสำคัญด้านแหล่งข้อมูล: ต้องแนบลิงก์แหล่งข้อมูลจริงหรือ DOI สากลที่คลิกเข้าไปอ่านได้จริง 100% (เช่น https://doi.org/10..., https://scholar.google.com, eric.ed.gov, jstor.org) ห้ามแต่ง URL ย่อยที่ไม่มีอยู่จริงจนเกิด 404 เด็ดขาด

ส่วนที่ 1: 🌙 สาระวิจัยทางการศึกษาสากลก่อนนอน (รอบ 3 วัน)
- บรรทัดแรกสุด: "🌙 สาระวิจัยสากลก่อนนอน • ${thaiDateFull} (เวลา 21:00 น.)"
คัดเลือกงานวิจัยคุณภาพสูงด้านการสอนสังคมศึกษา ประวัติศาสตร์ หรือนวัตกรรมการศึกษา 1 เรื่อง (เช่น Stanford, Harvard, Oxford, UNESCO หรือสแกนดิเนเวีย):
- 📖 ชื่องานวิจัย & แหล่งที่มา: [ชื่อภาษาอังกฤษและไทย ระบุสถาบัน/ปี]
- 🎯 วัตถุประสงค์การวิจัย: [ปัญหาและเป้าหมายสั้นกระชับ 2-3 บรรทัด]
- 🔬 ระเบียบวิธีและกลุ่มตัวอย่าง: [วิธีวิจัยและกลุ่มตัวอย่างสั้นๆ]
- 💡 ข้อค้นพบสำคัญ: [สรุป 3 ข้อสั้นกระชับ คมชัด]
- 🏫 การนำไปใช้สอน & วิจัย ป.โท: [ประโยชน์ต่อการสอนสังคมศึกษาหรือต่อยอดโครงร่างวิจัย ป.โท]
- 🔗 ลิงก์แหล่งข้อมูลจริง/DOI: [ระบุ URL จริงหรือ DOI https://... ที่คลิกเข้าไปศึกษาต่อได้จริง 100% เช่น https://doi.org/... หรือหน้าหลักองค์กรวิจัย เช่น https://sheg.stanford.edu, https://eric.ed.gov]

กฎสำคัญด้านแหล่งข้อมูล: ต้องเป็น URL หรือ DOI จริงที่สามารถคลิกเปิดอ่านได้จริง 100% ห้ามแต่งหรือเดา URL path ย่อยที่ไม่มีอยู่จริงจนเกิด 404 เด็ดขาด หากไม่ทราบ path ย่อยที่แน่นอน ให้ระบุ DOI กลาง หรือ URL หน้าหลักของสถาบันวิจัยนั้นๆ

[SPLIT]

ส่วนที่ 2: ✍️ กลอนกวีพักใจครูก่อนนิทรา
- บรรทัดแรก: "✍️ กลอนกวีพักใจครู • ประจำค่ำคืน ${thaiDateFull}"
ประพันธ์กลอนแปด (กลอนสุภาพ) 1-2 บทที่ไพเราะ สัมผัสนอกในถูกต้อง ปลอบประโลมความเหนื่อยล้า ส่งคุณครูเข้านอนด้วยความสุขใจ หลับฝันดี ราตรีสวัสดิ์`;
  } else {
    prompt = `คุณคือกวีเอกและผู้ช่วยส่วนตัวผู้เข้าใจจิตวิญญาณของครูไทย
ภารกิจของคุณคือ: จัดเตรียมข้อความพักผ่อนก่อนนอนเวลา 21:00 น. สำหรับครูสังคมศึกษา

ให้จัดเตรียมเนื้อหา 1 ส่วนถ้วน:
- บรรทัดแรก: "🌙 ข้อคิด & กลอนพักใจครูก่อนนิทรา • ${thaiDateFull} (21:00 น.)"
คำสั่งเด็ดขาด: ให้แสดงเฉพาะผลลัพธ์สุดท้ายตามโครงสร้างที่ระบุเท่านั้น ห้ามแสดงกระบวนการคิด การทดคำสัมผัส หรือความคิดเบื้องหลังใดๆ ทั้งสิ้น
- 🌿 ถ้อยคำพักใจ: ข้อคิดสั้นๆ 1 ย่อหน้า ปลอบประโลมความเหนื่อยล้าจากการสอนและสร้างพลังบวก
- ✍️ กลอนสุภาพ: ประพันธ์กลอนแปด 1-2 บทที่ไพเราะ สัมผัสถูกต้อง ส่งคุณครูเข้านอนอย่างผ่อนคลาย หลับฝันดี ราตรีสวัสดิ์`;
  }

  try {
    const candidateModels = [
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-2.0-flash'
    ];

    let geminiRes = null;
    let selectedModel = '';

    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        
        const reqBody = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 5000,
            thinkingConfig: { thinkingBudget: 0 }
          }
        };
        // เรียกใช้ Google Search เฉพาะคืนที่มีสาระวิจัยสากล เพื่อความเร็วและป้องกัน Timeout
        if (isResearchNight) {
          reqBody.tools = [{ google_search: {} }];
        }

        const resCandidate = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody)
        });

        if (resCandidate.ok) {
          geminiRes = resCandidate;
          selectedModel = model;
          break;
        } else {
          console.warn(`Night research model ${model} returned status ${resCandidate.status}, trying fallback...`);
        }
      } catch (err) {
        console.warn(`Night research model ${model} threw error:`, err.message);
      }
    }

    if (!geminiRes || !geminiRes.ok) {
      const errText = geminiRes ? await geminiRes.text() : 'All Gemini models failed';
      throw new Error(`Gemini API Error: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    
    // ดึงเฉพาะเนื้อหาข้อความจริงครบทุก Part และกรองข้อความกระบวนการคิดออกอย่างสมบูรณ์
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    let cleanedText = parts
      .filter(p => p.text && !p.thought)
      .map(p => p.text)
      .join('\n')
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .trim();

    // กรองรอยทดคิดก่อนหน้าหัวข้อหลัก (หากมีข้อความทดคำกลอนก่อน 🌙)
    const startIdx = cleanedText.indexOf('🌙');
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
    // สถาปัตยกรรม Dual-Layer: LINE ส่งสรุปกระชับ 1 บับเบิ้ล ส่วน Firestore เก็บฉบับเต็ม 100%
    const isFullPush = req.query && (req.query.full_line === 'true' || req.query.mode === 'full_line');
    
    let linePushMessages = [];
    if (isFullPush) {
      linePushMessages = splitMessages;
    } else {
      if (isResearchNight && rawSections.length >= 2) {
        const researchSec = rawSections[0];
        const poemSec = rawSections[1];

        // สกัดชื่องานวิจัย (รองรับทั้งอยู่บรรทัดเดียวกัน หรือขึ้นบรรทัดใหม่)
        let paperTitle = '';
        const lines = researchSec.split('\n').map(l => l.trim()).filter(Boolean);
        const titleLineIdx = lines.findIndex(l => /ชื่องานวิจัย/i.test(l));
        if (titleLineIdx !== -1) {
          const inlineText = lines[titleLineIdx].replace(/^.*ชื่องานวิจัย[^\:]*[\:]?\s*/i, '').replace(/[\*\_\"]/g, '').trim();
          if (inlineText.length > 3) {
            paperTitle = inlineText;
          } else if (lines[titleLineIdx + 1] && !lines[titleLineIdx + 1].startsWith('💡') && !lines[titleLineIdx + 1].startsWith('**💡')) {
            paperTitle = lines[titleLineIdx + 1].replace(/[\*\_\"]/g, '').trim();
          }
        }
        if (!paperTitle) {
          paperTitle = 'สาระวิจัยสากลทางสังคมศึกษา';
        }

        // สกัดข้อค้นพบสำคัญ
        let findingLines = '';
        const findingsLineIdx = lines.findIndex(l => /ข้อค้นพบ/i.test(l));
        if (findingsLineIdx !== -1) {
          const inlineFindings = lines[findingsLineIdx].replace(/^.*ข้อค้นพบ[^\:]*[\:]?\s*/i, '').replace(/[\*\_]/g, '').trim();
          const findingsList = [];
          if (inlineFindings.length > 5) findingsList.push(inlineFindings);
          for (let i = findingsLineIdx + 1; i < lines.length && findingsList.length < 3; i++) {
            if (/^(🏫|🔗|📱|ส่วนที่|\[SPLIT\]|\*\*🏫|\*\*🔗)/.test(lines[i])) break;
            findingsList.push(lines[i].replace(/^[\-\*\•]\s*/, ''));
          }
          findingLines = findingsList.join('\n');
        }

        // สกัดลิงก์ DOI
        const doiMatch = researchSec.match(/(https?:\/\/[^\s\)\"\'\<\>]+)/);
        const doiUrl = doiMatch ? doiMatch[1] : '';

        // สกัดบทกลอน
        let cleanPoem = poemSec.replace(/^ส่วนที่\s*2:\s*/i, '').trim();

        let compactText = `🌙 สาระวิจัยสากล & กลอนพักใจ • ${thaiDateFull} (21:00 น.)\n\n`;
        compactText += `📖 งานวิจัยเด่น:\n"${paperTitle}"\n\n`;
        if (findingLines) {
          compactText += `💡 ข้อค้นพบสำคัญ:\n${findingLines}\n\n`;
        }
        if (doiUrl) {
          compactText += `🔗 แหล่งข้อมูล/DOI: ${doiUrl}\n\n`;
        }
        compactText += `${cleanPoem}\n\n`;
        compactText += `━━━━━━━━━━━━━━━━━━━━\n📲 อ่านบทวิเคราะห์วิจัยฉบับเต็ม & แนวทาง ว.PA ในระบบ:\n👉 https://krusos-bot-news-02.vercel.app/\n━━━━━━━━━━━━━━━━━━━━`;

        linePushMessages.push({ type: "text", text: compactText.trim() });
      } else {
        // คืนทั่วไป (กลอนกวีพักใจครูก่อนนิทรา)
        let poemSec = (rawSections[0] || '').replace(/^ส่วนที่\s*1:\s*/i, '').trim();
        let compactText = `${poemSec}\n\n━━━━━━━━━━━━━━━━━━━━\n📲 เปิดดูระบบผู้ช่วยครูซอส:\n👉 https://krusos-bot-news-02.vercel.app/\n━━━━━━━━━━━━━━━━━━━━`;
        linePushMessages.push({ type: "text", text: compactText.trim() });
      }
    }

    // สกัดรายการ URL แหล่งข้อมูลจริงทั้งหมดเพื่อเก็บเป็นคลังอ้างอิง (ลบเครื่องหมายวรรคตอนท้ายลิงก์ และคัดเฉพาะลิงก์ภายนอก)
    const extractedUrls = (fullText.match(/(https?:\/\/[^\s\)\"\'\<\>]+)/g) || [])
      .map(u => u.replace(/[\.\,\*\_\)\<\>]+$/, '').trim())
      .filter(u => u.startsWith('http') && !u.includes('krusos-bot-news-02.vercel.app'));
    const uniqueSources = [...new Set(extractedUrls)];

    // บันทึกลง Firestore ใน collection "daily_summaries" (type: night_research) - เก็บฉบับเต็ม 100%
    let firestoreStatus = { saved: false, reason: "ไม่ได้เชื่อมต่อฐานข้อมูล" };

    if (db) {
      try {
        const today = new Date();
        const docRef = await db.collection('daily_summaries').add({
          date: today.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }),
          type: 'night_research',
          cycle: isResearchNight ? '3day_research' : 'daily_relaxation',
          title: isResearchNight 
            ? 'สาระวิจัยสากลสังคมศึกษา/ประวัติศาสตร์ & กลอนก่อนนอน (รอบ 3 วัน)' 
            : 'กลอนกวีพักใจครูก่อนนิทรา (21:00 น.)',
          rawContent: fullText,
          sections: rawSections,
          sources: uniqueSources,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        firestoreStatus = { saved: true, docId: docRef.id, sourcesCount: uniqueSources.length };
        console.log('Successfully saved night research to Firestore:', docRef.id);
      } catch (dbErr) {
        firestoreStatus = { saved: false, error: dbErr.message };
        console.error('Firestore save night research error:', dbErr);
      }
    }

    // ยิงส่งข้อความ Push แจ้งเตือนเข้า LINE (ยิงเป็นชุด Batch ละไม่เกิน 5 ข้อความ)
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
        console.error("LINE Push Error in night-research:", lastPushError);
      }
    }

    if (lastPushError) {
      throw new Error("LINE Push Error: " + lastPushError);
    }

    // ส่งผลลัพธ์ตอบกลับ
    return res.status(200).json({ 
      success: true, 
      message: "ส่งสาระวิจัยสากลและกลอนก่อนนอนเข้า LINE สำเร็จเรียบร้อยแล้วครับ! 🌙✨",
      model: selectedModel,
      sectionsCount: splitMessages.length,
      firestore: firestoreStatus 
    });
  } catch (error) {
    console.error("Night research error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
