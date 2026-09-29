/**
 * electron-dev.cjs — launch the desktop app against the Vite dev server.
 *
 * Starts `vite` on 127.0.0.1:5173, waits until the port answers, then
 * launches Electron pointed at it. Ctrl+C stops both.
 *
 * Run with: node scripts/electron-dev.cjs   (or: npm run app:dev)
 */
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const PORT = 5173;
const HOST = '127.0.0.1';
const root = path.join(__dirname, '..');

function waitForPort(port, host, timeoutMs = 60000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const attempt = () => {
            const socket = net.connect(port, host);
            socket.on('connect', () => {
                socket.end();
                resolve();
            });
            socket.on('error', () => {
                socket.destroy();
                if (Date.now() - start > timeoutMs) {
                    reject(new Error(`Timed out waiting for ${host}:${port}`));
                } else {
                    setTimeout(attempt, 500);
                }
            });
        };
        attempt();
    });
}

async function main() {
    console.log('Starting Vite dev server...');

    const vite = spawn(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['vite', '--port', String(PORT), '--strictPort', '--host', HOST],
        { cwd: root, stdio: 'inherit', shell: false }
    );

    const shutdown = () => {
        try { vite.kill(); } catch (_) { /* already dead */ }
        process.exit();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    vite.on('exit', (code) => {
        console.error(`Vite exited with code ${code}`);
        process.exit(code ?? 1);
    });

    try {
        await waitForPort(PORT, HOST);
    } catch (err) {
        console.error(err.message);
        shutdown();
        return;
    }

    console.log(`Vite is up at http://${HOST}:${PORT} — launching Electron...`);

    const electron = spawn(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['electron', '.', '--dev'],
        { cwd: root, stdio: 'inherit', shell: false }
    );

    electron.on('exit', () => {
        console.log('Electron closed — stopping Vite.');
        shutdown();
    });
}

main();
