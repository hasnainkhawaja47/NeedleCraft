module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { password } = req.body;
  if (password === process.env.APP_PASSWORD) {
    return res.json({ success: true, token: Buffer.from(process.env.APP_PASSWORD).toString('base64') });
  }
  return res.status(401).json({ success: false });
};