import express, { Request, Response, NextFunction } from 'express';

const App = express();
const Port = process.env.PORT || 3000;

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

function rawCapture(req: Request, res: Response, next: NextFunction) {
    let raw = '';
    
    req.on('data', chunk => {
        raw += chunk;
        if (raw.length > 1e6) {
            req.destroy();
        }
    });

    req.on('end', () => {
        (req as any).rawBody = raw || '';
        next();
    });
}

function parseGrowtopiaPacket(raw: string) {
    if (!raw) return {};

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

App.set('trust proxy', 1);
App.disable('x-powered-by');
App.use(rawCapture);

App.post('/player/login/dashboard', (req: Request, res: Response) => {
    const raw = (req as any).rawBody || '';
    const data = parseGrowtopiaPacket(raw);
    
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

App.post('/player/growid/login/validate', (req: Request, res: Response) => {
    const raw = (req as any).rawBody || '';
    
    const parsedParams = new URLSearchParams(raw);

    const growId = parsedParams.get('growId') || '';
    const password = parsedParams.get('password') || '';

    const token = parsedParams.get('_token') || Buffer.from(`${growId}:${password}`).toString('base64');
    const tokens = Buffer.from(token, 'base64').toString('utf8');

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

App.post('/player/growid/validate/checktoken', (req: Request, res: Response) => {
    const raw = (req as any).rawBody || '';
    const data = parseGrowtopiaPacket(raw);

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

App.post('/player/growid/checktoken', (_req, res) => {
    return res.redirect(307, '/player/growid/validate/checktoken');
});

App.listen(Port, () => {
    console.log(`[SERVER] RUNNING ON PORT ${Port}`);
});

export default App;