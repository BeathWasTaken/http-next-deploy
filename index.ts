import express, { Request, Response, NextFunction } from 'express';

const App = express();
const Port = process.env.PORT || 3000;

/* ================= DEVICE ================= */
const eDeviceManager = {
    DEVICE_WINDOWS: 0,
    DEVICE_ANDROID: 1,
    DEVICE_MACOS: 2,
    DEVICE_IOS: 4,
} as const;

type eDeviceManager = typeof eDeviceManager[keyof typeof eDeviceManager];

function get_device(req: Request) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();

    if (/iphone|ipad|ios/i.test(ua)) return eDeviceManager.DEVICE_IOS;
    if (/android/i.test(ua)) return eDeviceManager.DEVICE_ANDROID;
    if (/mac/i.test(ua)) return eDeviceManager.DEVICE_MACOS;

    return eDeviceManager.DEVICE_WINDOWS;
}

/* ================= RAW BODY CAPTURE ================= */
function rawCapture(req: Request, res: Response, next: NextFunction) {
    let raw = '';
    
    // Tambahkan pengaman agar server tidak overload jika payload terlalu besar
    req.on('data', chunk => {
        raw += chunk;
        if (raw.length > 1e6) { // Limit 1MB
            req.destroy();
        }
    });

    req.on('end', () => {
        (req as any).rawBody = raw || '';
        next();
    });
}

/* ================= GROWTOPIA PARSER ================= */
function parseGrowtopiaPacket(raw: string) {
    if (!raw) return {};

    // Tangani kemungkinan error saat decoding
    let decoded = '';
    try {
        decoded = decodeURIComponent(raw);
    } catch (e) {
        decoded = raw; 
    }
    
    const lines = decoded.split('\n');
    const data: Record<string, string> = {};

    for (const line of lines) {
        const idx = line.indexOf('|');
        if (idx === -1) continue;

        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();

        if (key) data[key] = value;
    }

    return data;
}

/* ================= EXPRESS CONFIG ================= */
App.set('trust proxy', 1);
App.disable('x-powered-by');

/* IMPORTANT ORDER */
App.use(rawCapture);

/* ================= ROUTES ================= */

/* DASHBOARD */
App.post('/player/login/dashboard', (req: Request, res: Response) => {
    const raw = (req as any).rawBody || '';
    const data = parseGrowtopiaPacket(raw); // <-- Di sini data ruwet diubah jadi rapi

    // Coba tambahkan ini untuk melihat data yang sudah rapi di terminal:
    console.log("[INFO] Seseorang membuka dashboard. Data yang terbaca:");
    console.log(data); 

    const growId = data['tankIDName'] || '';
    const password = data['tankIDPass'] || '';

    const token = Buffer.from(JSON.stringify(data)).toString('base64');

    return res.send(`
        <html>
            <body style="display:none">
                <form id="f" method="POST" action="/player/growid/login/validate">
                    <input name="growId" value="${growId}">
                    <input name="password" value="${password}">
                    <input name="_token" value="${token}">
                </form>

                <script>
                    document.getElementById('f').submit();
                </script>
            </body>
        </html>
    `);
});

/* VALIDATE LOGIN */
App.post('/player/growid/login/validate', (req: Request, res: Response) => {
    const raw = (req as any).rawBody || '';
    
    // Parse dari URLSearchParams
    const parsedParams = new URLSearchParams(raw);

    const growId = parsedParams.get('growId') || '';
    const password = parsedParams.get('password') || '';
    
    // Ambil token dari form, ATAU buat baru kalau tidak ada
    const token = parsedParams.get('_token') || Buffer.from(`${growId}:${password}`).toString('base64');
    const tokens = Buffer.from(token, 'base64').toString('utf8');

    // ==========================================
    // Tambahkan ini untuk mengintip Token di Terminal
    // ==========================================
    console.log('\n🔑 [VALIDATE ROUTE] Mengecek Data Login...');
    console.log(`👤 GrowID   : ${growId === '' ? '(KOSONG / GUEST)' : growId}`);
    console.log(`🔒 Password : ${password === '' ? '(KOSONG)' : password}`);
    console.log(`🎟️ Tokens    : ${tokens}`);
    console.log('==========================================\n');

    const response = {
        status: 'success',
        message: 'Account Validated',
        growId,
        password,
        token,
        accountType: 'growtopia'
    };

    if (get_device(req) === eDeviceManager.DEVICE_IOS) {
        res.setHeader('Content-Type', 'application/json');
        return res.json(response);
    }

    return res.send(JSON.stringify(response));
});

/* CHECK TOKEN */
App.post('/player/growid/validate/checktoken', (req: Request, res: Response) => {
    const raw = (req as any).rawBody || '';
    const data = parseGrowtopiaPacket(raw);

    console.log(data);

    const token = Buffer.from(JSON.stringify(data)).toString('base64');

    res.send(JSON.stringify({
                    status: 'success',
                    message: 'Account Validated.',
                    token,
                    url: '',
                    accountType: 'growtopia',
                    accountAge: 2,
                }));
});

/* REDIRECT */
App.post('/player/growid/checktoken', (_req, res) => {
    return res.redirect(307, '/player/growid/validate/checktoken');
});

/* ================= START ================= */
App.listen(Port, () => {
    console.log(`[SERVER] RUNNING ON PORT ${Port}`);
});

export default App;