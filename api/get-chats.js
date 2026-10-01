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
      console.error('Firebase initialization error in get-chats:', err);
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
  // 1. เปิด CORS Headers เพื่อให้หน้าเว็บดึงข้อมูลได้ทุกโดเมนและ localhost
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const db = getFirestoreDb();
    if (!db) {
      return res.status(200).json({ 
        success: true, 
        data: [], 
        notice: 'Firebase ยังไม่ได้ตั้งค่าตัวแปรใน Vercel' 
      });
    }

    const snapshot = await db.collection('chat_history')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    const data = snapshot.docs.map(doc => {
      const docData = doc.data();
      return {
        id: doc.id,
        ...docData,
        timestamp: docData.timestamp || new Date().toISOString()
      };
    });

    return res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('Fetch chats error:', error);
    return res.status(200).json({ success: false, data: [], error: error.message });
  }
}
