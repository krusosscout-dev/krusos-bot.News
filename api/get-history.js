import admin from 'firebase-admin';

// ฟังก์ชันเชื่อมต่อ Firebase Admin อย่างปลอดภัย
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
  maxDuration: 60,
};

export default async function handler(req, res) {
  // 1. เปิด CORS Header เพื่อให้หน้าเว็บสามารถเรียกดูข้อมูลได้ทุกที่
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. เรียกใช้งานฐานข้อมูลอย่างปลอดภัย
  const db = getFirestoreDb();
  if (!db) {
    return res.status(500).json({ 
      success: false, 
      error: "ยังไม่ได้เชื่อมต่อ Firebase (ตรวจสอบตัวแปร FIREBASE_PROJECT_ID หรือ FIREBASE_PRIVATE_KEY บน Vercel)" 
    });
  }

  try {
    // 3. ดึงข้อมูล 30 รายการล่าสุด
    const snapshot = await db.collection('daily_summaries')
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get();

    const data = snapshot.docs.map(doc => {
      const docData = doc.data();
      return {
        id: doc.id,
        ...docData,
        createdAt: docData.createdAt && typeof docData.createdAt.toDate === 'function' 
          ? docData.createdAt.toDate().toISOString() 
          : docData.createdAt || null,
      };
    });

    return res.status(200).json({ 
      success: true, 
      count: data.length,
      data 
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
