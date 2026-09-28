import admin from 'firebase-admin';

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getFirestoreDb();
  if (!db) {
    return res.status(500).json({ 
      success: false, 
      error: 'ยังไม่ได้เชื่อมต่อ Firebase (ตรวจสอบตัวแปร FIREBASE_PROJECT_ID บน Vercel)' 
    });
  }

  try {
    if (req.method === 'GET') {
      const snap = await db.collection('tasks').orderBy('createdAt', 'desc').limit(50).get();
      const tasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json({ success: true, tasks });
    }

    if (req.method === 'POST') {
      const { action, task, id, completed } = req.body || {};

      if (action === 'create' && task) {
        const docRef = await db.collection('tasks').add({
          title: task.title || '',
          dueDate: task.dueDate || 'ไม่ระบุวัน',
          category: task.category || 'ทั่วไป',
          completed: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return res.status(200).json({ success: true, id: docRef.id });
      }

      if (action === 'toggle' && id) {
        await db.collection('tasks').doc(id).update({
          completed: !!completed,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return res.status(200).json({ success: true, id });
      }

      if (action === 'delete' && id) {
        await db.collection('tasks').doc(id).delete();
        return res.status(200).json({ success: true, id });
      }

      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Task API error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
