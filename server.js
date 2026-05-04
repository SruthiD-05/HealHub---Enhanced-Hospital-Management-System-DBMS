const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');
const QRCode  = require('qrcode');
const mysql   = require('mysql2/promise');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ═══════════════════════════════════════════
//  SERVE HTML FROM ROOT (for QR scan flow)
// ═══════════════════════════════════════════
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/HealHub_v5_backend.html');
});

// ═══════════════════════════════════════════
//  MYSQL CONNECTION POOL
// ═══════════════════════════════════════════
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'healhub',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  dateStrings:        true,   // keep DATE columns as 'YYYY-MM-DD' strings
});

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection failed:', err.message);
  });

// ═══════════════════════════════════════════
//  OTP SESSIONS  (in-memory, no DB needed)
// ═══════════════════════════════════════════
const otpSessions = {};
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ═══════════════════════════════════════════
//  PATIENTS
// ═══════════════════════════════════════════
app.get('/api/patients', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM patient ORDER BY id');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/patients', async (req, res) => {
  const { id, name, age, phone, address, disease } = req.body;
  if (!id || !name || !age || !phone || !address || !disease)
    return res.status(400).json({ error: 'All fields required' });
  try {
    await pool.query(
      'INSERT INTO patient (id, name, age, phone, address, disease) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, age, phone, address, disease]
    );
    res.json({ success: true, patient: { id, name, age, phone, address, disease } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ error: `Patient ID "${id}" already exists` });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/patients/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM patient WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Patient not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// QR code for patient
app.get('/api/patients/:id/qr', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM patient WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Patient not found' });
    const patient = rows[0];
    const url = req.query.url || `Patient ID: ${patient.id} | Name: ${patient.name} | Age: ${patient.age} | Diagnosis: ${patient.disease}`;
    const qr   = await QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: '#0D7377', light: '#FFFFFF' } });
    res.json({ success: true, qr, patient });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
//  DOCTORS
// ═══════════════════════════════════════════
app.get('/api/doctors', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM doctor ORDER BY id');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/doctors', async (req, res) => {
  const { id, name, spec, phone, status } = req.body;
  if (!id || !name || !spec || !phone)
    return res.status(400).json({ error: 'All fields required' });
  try {
    await pool.query(
      'INSERT INTO doctor (id, name, spec, phone, status) VALUES (?, ?, ?, ?, ?)',
      [id, name, spec, phone, status || 'Active']
    );
    res.json({ success: true, doctor: { id, name, spec, phone, status: status || 'Active' } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ error: `Doctor ID "${id}" already exists` });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/doctors/:id/status', async (req, res) => {
  try {
    const [result] = await pool.query('UPDATE doctor SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Doctor not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/doctors/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM doctor WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Doctor not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
//  ROOMS
// ═══════════════════════════════════════════
app.get('/api/rooms', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM room ORDER BY num');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/rooms', async (req, res) => {
  const { id, num, type, status } = req.body;
  if (!id || !num) return res.status(400).json({ error: 'Room ID and Number required' });
  try {
    await pool.query(
      'INSERT INTO room (id, num, type, status) VALUES (?, ?, ?, ?)',
      [id, num, type || 'General Ward', status || 'Available']
    );
    res.json({ success: true, room: { id, num, type: type || 'General Ward', status: status || 'Available' } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ error: `Room ID "${id}" already exists` });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/rooms/:id/status', async (req, res) => {
  try {
    const [result] = await pool.query('UPDATE room SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Room not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/rooms/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM room WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Room not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
//  ADMISSIONS
// ═══════════════════════════════════════════
app.get('/api/admissions', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM admission ORDER BY dateIn DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admissions', async (req, res) => {
  const { id, patient, doctor, room, dateIn, dateOut, type, status } = req.body;
  if (!id || !patient || !doctor || !room || !dateIn)
    return res.status(400).json({ error: 'Required fields missing' });
  try {
    await pool.query(
      'INSERT INTO admission (id, patient, doctor, room, dateIn, dateOut, type, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, patient, doctor, room, dateIn, dateOut || null, type || 'Planned', status || 'Admitted']
    );
    // Mark room as occupied
    await pool.query("UPDATE room SET status = 'Occupied' WHERE id = ?", [room]);
    res.json({ success: true, admission: { id, patient, doctor, room, dateIn, dateOut: dateOut || null, type: type || 'Planned', status: status || 'Admitted' } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ error: `Admission ID "${id}" already exists` });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admissions/:id/status', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM admission WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Admission not found' });
    await pool.query('UPDATE admission SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    // Free room if discharged
    if (req.body.status === 'Discharged') {
      await pool.query("UPDATE room SET status = 'Available' WHERE id = ?", [rows[0].room]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admissions/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM admission WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Admission not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
//  TREATMENTS
// ═══════════════════════════════════════════
app.get('/api/treatments', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM treatment ORDER BY id');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/treatments', async (req, res) => {
  const { id, name, cost, admissionId, patient, organId } = req.body;
  if (!id || !name || cost === undefined || !admissionId)
    return res.status(400).json({ error: 'Required fields missing' });
  try {
    await pool.query(
      'INSERT INTO treatment (id, name, cost, admissionId, patient, organId) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, cost, admissionId, patient || null, organId || null]
    );
    res.json({ success: true, treatment: { id, name, cost, admissionId, patient, organId } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ error: `Treatment ID "${id}" already exists` });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/treatments/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM treatment WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Treatment not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
//  BILLS
// ═══════════════════════════════════════════
app.get('/api/bills', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM bill ORDER BY date DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/bills', async (req, res) => {
  const { id, date, amount, status, admissionId, patient } = req.body;
  if (!id || !date || amount === undefined || !admissionId)
    return res.status(400).json({ error: 'Required fields missing' });
  try {
    await pool.query(
      'INSERT INTO bill (id, date, amount, status, admissionId, patient) VALUES (?, ?, ?, ?, ?, ?)',
      [id, date, amount, status || 'Pending', admissionId, patient || null]
    );
    res.json({ success: true, bill: { id, date, amount, status: status || 'Pending', admissionId, patient } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ error: `Bill ID "${id}" already exists` });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/bills/:id/status', async (req, res) => {
  try {
    const [result] = await pool.query('UPDATE bill SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Bill not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/bills/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM bill WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Bill not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
//  ORGANS
// ═══════════════════════════════════════════
app.get('/api/organs', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM organ ORDER BY id');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/organs', async (req, res) => {
  const { id, name, donorType, avail } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'Organ ID and Name required' });
  try {
    await pool.query(
      'INSERT INTO organ (id, name, donorType, avail) VALUES (?, ?, ?, ?)',
      [id, name, donorType || 'Anonymous', avail || 'Available']
    );
    res.json({ success: true, organ: { id, name, donorType, avail } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ error: `Organ ID "${id}" already exists` });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/organs/:id/status', async (req, res) => {
  try {
    const [result] = await pool.query('UPDATE organ SET avail = ? WHERE id = ?', [req.body.avail, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Organ not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/organs/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM organ WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Organ not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
//  OPD VISITS
// ═══════════════════════════════════════════
app.get('/api/visits', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM visit ORDER BY date DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/visits', async (req, res) => {
  const { id, date, patient, doctor, symptoms, diagnosis, prescription, fee, status } = req.body;
  if (!id || !date || !patient || !doctor || !symptoms || !diagnosis || fee === undefined)
    return res.status(400).json({ error: 'Required fields missing' });
  try {
    await pool.query(
      'INSERT INTO visit (id, date, patient, doctor, symptoms, diagnosis, prescription, fee, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, date, patient, doctor, symptoms, diagnosis, prescription || '', fee, status || 'Completed']
    );
    res.json({ success: true, visit: { id, date, patient, doctor, symptoms, diagnosis, prescription, fee, status } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ error: `Visit ID "${id}" already exists` });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/visits/:id/status', async (req, res) => {
  try {
    const [result] = await pool.query('UPDATE visit SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Visit not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/visits/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM visit WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Visit not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
//  OTP — SEND
// ═══════════════════════════════════════════
app.post('/send-otp', async (req, res) => {
  const { patientId, phone } = req.body;
  if (!patientId || !phone)
    return res.status(400).json({ error: 'patientId and phone required' });

  try {
    const [rows] = await pool.query('SELECT * FROM patient WHERE id = ?', [patientId]);
    if (!rows.length) return res.status(404).json({ error: 'Patient not found' });
    const patient = rows[0];

    const otp       = generateOTP();
    const sessionId = crypto.randomUUID();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    otpSessions[sessionId] = { otp, patientId, expiresAt };

    // Clean expired sessions
    Object.keys(otpSessions).forEach(sid => {
      if (otpSessions[sid].expiresAt < Date.now()) delete otpSessions[sid];
    });

    console.log(`\n📱 OTP for ${patient.name} (${phone}): ${otp}\n`);

    res.json({
      success:   true,
      sessionId,
      mock:      true,
      otp,
      message:   `Mock OTP sent. In production, SMS would go to +91${phone}`
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
//  OTP — VERIFY
// ═══════════════════════════════════════════
app.post('/verify-otp', (req, res) => {
  const { sessionId, otp } = req.body;
  if (!sessionId || !otp)
    return res.status(400).json({ error: 'sessionId and otp required' });

  const session = otpSessions[sessionId];
  if (!session)
    return res.status(400).json({ error: 'Invalid or expired session. Please request a new OTP.' });

  if (Date.now() > session.expiresAt) {
    delete otpSessions[sessionId];
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }

  if (session.otp !== String(otp)) {
    return res.status(400).json({ error: 'Incorrect OTP. Please try again.' });
  }

  delete otpSessions[sessionId];
  res.json({ success: true, patientId: session.patientId });
});

// ═══════════════════════════════════════════
//  START SERVER
// ═══════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n🏥 HealHub HMS Server running at http://localhost:${PORT}`);
  console.log(`📋 Endpoints: patients, doctors, rooms, admissions, treatments, bills, organs, visits`);
  console.log(`🔒 OTP: POST /send-otp  |  POST /verify-otp`);
  console.log(`📱 QR:  GET  /api/patients/:id/qr\n`);
});