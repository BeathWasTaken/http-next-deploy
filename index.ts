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

/* ================= SAFE PARSER ================= */
function parseBody(req: Request): URLSearchParams {
    const body = req.body;

    if (!body) return new URLSearchParams();

    if (typeof body === 'string') return new URLSearchParams(body);

    if (typeof body === 'object') return new URLSearchParams(body as any);

    return new URLSearchParams();
}

/* ================= EXPRESS CONFIG ================= */
App.set('trust proxy', 1);
App.disable('x-powered-by');

/* ORDER FIXED */
App.use(express.urlencoded({ extended: true }));
App.use(express.json());
App.use(express.text({ type: '*/*' }));

/* ================= RAW DEBUG (IMPORTANT) ================= */
App.use((req: Request, _res: Response, next: NextFunction) => {
    let raw = '';

    req.on('data', chunk => {
        raw += chunk;
    });

    req.on('end', () => {
        (req as any).rawBody = raw;

        console.log('==============================');
        console.log('CONTENT-TYPE:', req.headers['content-type']);
        console.log('BODY TYPE:', typeof req.body);
        console.log('BODY PARSED:', req.body);
        console.log('RAW STREAM:', raw || '<<< EMPTY >>>');
        console.log('==============================');

        next();
    });
});

/* ================= ROUTES ================= */

/* DASHBOARD */
App.post('/player/login/dashboard', async (req: Request, res: Response) => {
    const params = parseBody(req);

    const tokenRaw = params.get('_token') || '';
    const growId = params.get('growId') || '';
    const password = params.get('password') || '';

    const encoded = Buffer.from(tokenRaw).toString('base64');

    return res.send(`
        <html>
            <body style="display:none">
                <form id="f" action="/player/growid/login/validate" method="POST">
                    <input type="hidden" name="_token" value="${encoded}">
                    <input type="hidden" name="growId" value="${growId}">
                    <input type="hidden" name="password" value="${password}">
                </form>

                <script>
                    document.getElementById('f').submit();
                </script>
            </body>
        </html>
    `);
});

/* VALIDATE */
App.post('/player/growid/login/validate', async (req: Request, res: Response) => {
    const params = parseBody(req);

    const _token = params.get('_token') || '';
    const growId = params.get('growId') || '';
    const password = params.get('password') || '';

    const token = Buffer.from(
        `_token=${_token}&growId=${growId}&password=${password}`
    ).toString('base64');

    const response = {
        status: 'success',
        message: 'Account Validated.',
        token,
        accountType: 'growtopia',
    };

    if (get_device(req) === eDeviceManager.DEVICE_IOS) {
        res.setHeader('Content-Type', 'application/json');
        return res.json(response);
    }

    return res.send(JSON.stringify(response));
});

/* CHECK TOKEN */
App.post('/player/growid/validate/checktoken', async (req: Request, res: Response) => {
    const params = parseBody(req);

    const clientData = params.get('clientData');

    if (!clientData) {
        return res.json({
            status: 'error',
            message: 'Missing clientData',
        });
    }

    const token = Buffer.from(clientData).toString('base64');

    const response = {
        status: 'success',
        message: 'Account Validated.',
        token,
        accountType: 'growtopia',
        accountAge: 2,
    };

    if (get_device(req) === eDeviceManager.DEVICE_IOS) {
        res.setHeader('Content-Type', 'application/json');
        return res.json(response);
    }

    return res.send(JSON.stringify(response));
});

/* REDIRECT */
App.post('/player/growid/checktoken', (_req, res) => {
    return res.redirect(307, '/player/growid/validate/checktoken');
});

/* ================= START ================= */
App.listen(Port, () => {
    console.log(`[SERVER] running on ${Port}`);
});

export default App;