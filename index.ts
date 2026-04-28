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
function rawCapture(req: Request, _res: Response, next: NextFunction) {
    let raw = '';

    req.on('data', chunk => {
        raw += chunk;
    });

    req.on('end', () => {
        (req as any).rawBody = raw || '';
        next();
    });
}

/* ================= GROWTOPIA PARSER ================= */
function parseGrowtopiaPacket(raw: string) {
    if (!raw) return {};

    const decoded = decodeURIComponent(raw);
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

/* ================= DEBUG ================= */
App.use((req: Request, _res: Response, next: NextFunction) => {
    console.log('==============================');
    console.log('CONTENT-TYPE:', req.headers['content-type'] || 'NONE');
    console.log('RAW BODY:', (req as any).rawBody || '<<< EMPTY >>>');
    console.log('==============================');
    next();
});

/* ================= ROUTES ================= */

/* DASHBOARD */
App.post('/player/login/dashboard', (req: Request, res: Response) => {
    const raw = (req as any).rawBody || '';
    const data = parseGrowtopiaPacket(raw);

    const growId = data['tankIDName'] || '';
    const password = data['tankIDPass'] || '';

    const token = Buffer.from(`${growId}:${password}`).toString('base64');

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
    const data = parseGrowtopiaPacket(raw);

    const growId = data['growId'] || '';
    const password = data['password'] || '';

    const token = Buffer.from(`${growId}:${password}`).toString('base64');

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

    const clientData = data['clientData'];

    if (!clientData) {
        return res.json({
            status: 'error',
            message: 'Missing clientData'
        });
    }

    const token = Buffer.from(clientData).toString('base64');

    return res.json({
        status: 'success',
        token,
        accountType: 'growtopia',
        accountAge: 2
    });
});

/* REDIRECT */
App.post('/player/growid/checktoken', (_req, res) => {
    return res.redirect(307, '/player/growid/validate/checktoken');
});

/* ================= START ================= */
App.listen(Port, () => {
    console.log(`[SERVER] RUNNING ON ${Port}`);
});

export default App;