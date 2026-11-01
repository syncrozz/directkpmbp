import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // JSON body parser
  app.use(express.json());

  // CORS headers middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  });

  // In-memory store for simulated email outbox / sent invitations
  interface SentInvite {
    id: string;
    email: string;
    name?: string;
    token: string;
    inviteUrl: string;
    role: string;
    level: number;
    subject: string;
    sentAt: string;
    status: 'sent' | 'verified';
    htmlContent: string;
  }

  const sentInvites: SentInvite[] = [];

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'Directory KPMBP' });
  });

  // API to send Admin Level 2 verification email link
  app.post('/api/send-admin-invite', (req, res) => {
    try {
      const { email, name, token, inviteUrl, role = 'Admin Level 2', level = 2 } = req.body;
      if (!email || !token || !inviteUrl) {
        return res.status(400).json({ error: 'Email, token, and inviteUrl are required' });
      }

      const subject = `[Jemputan Rasmi] Otorisasi Admin Level 2 – DIRECTORY KPMBP`;
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #1e1b4b; margin: 0; font-size: 20px;">DIRECTORY KPMBP</h2>
            <p style="color: #4f46e5; margin: 4px 0 0; font-size: 13px; font-weight: bold;">Kolej Profesional MARA Bandar Penawar</p>
          </div>
          <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
            <h3 style="color: #0f172a; margin-top: 0; font-size: 16px;">Jemputan Otorisasi Pegawai (Admin Level 2)</h3>
            <p style="color: #475569; font-size: 14px; line-height: 1.6;">
              Salam sejahtera ${name ? `<strong>${name}</strong>` : ''},<br/><br/>
              Anda telah dijemput oleh <strong>Master Administrator</strong> untuk diotorisasi sebagai <strong>Admin Level 2</strong> dalam portal DIRECTORY KPMBP.
            </p>
            <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px; margin: 16px 0; border-radius: 4px;">
              <p style="margin: 0; font-size: 13px; color: #1e40af;">
                <strong>Hak Akses Diberikan:</strong> Akses melihat maklumat terhad kakitangan termasuk <strong>No. Kad Pengenalan (IC)</strong>, tarikh lahir, daerah asal, dan no. pendaftaran kenderaan.
              </p>
            </div>
            <p style="color: #475569; font-size: 14px; line-height: 1.6;">
              Sila klik butang di bawah untuk mengesahkan emel dan mengaktifkan akses Admin Level 2 anda:
            </p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${inviteUrl}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 14px; padding: 14px 28px; border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">
                Sahkan & Aktifkan Akaun Admin
              </a>
            </div>
            <p style="color: #64748b; font-size: 12px; word-break: break-all;">
              Atau salin pautan ini ke pelayar anda:<br/>
              <a href="${inviteUrl}" style="color: #4f46e5;">${inviteUrl}</a>
            </p>
          </div>
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
            Emel ini dihantar secara automatik oleh Sistem DIRECTORY KPMBP. Jangan balas emel ini.
          </p>
        </div>
      `;

      const newInvite: SentInvite = {
        id: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        email: email.trim().toLowerCase(),
        name: name?.trim(),
        token,
        inviteUrl,
        role,
        level,
        subject,
        sentAt: new Date().toISOString(),
        status: 'sent',
        htmlContent,
      };

      // Upsert into memory store
      const existingIdx = sentInvites.findIndex(i => i.email === newInvite.email && i.status === 'sent');
      if (existingIdx >= 0) {
        sentInvites[existingIdx] = newInvite;
      } else {
        sentInvites.unshift(newInvite);
      }

      console.log(`[Admin Invite Sent] Emel dihantar ke: ${newInvite.email} | URL: ${inviteUrl}`);

      return res.json({
        success: true,
        message: `Pautan pengesahan telah berjaya dihantar ke inbox ${newInvite.email}.`,
        invite: newInvite
      });
    } catch (err: any) {
      console.error('Error sending invite:', err);
      return res.status(500).json({ error: err.message || 'Gagal menghantar jemputan' });
    }
  });

  // API to list sent invites / inbox simulator
  app.get('/api/admin-invites', (req, res) => {
    res.json({ success: true, invites: sentInvites });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
