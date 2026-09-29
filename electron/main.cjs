/**
 * Dark Rain: Pool of Darkness — Electron main process
 *
 * Dev:      node scripts/electron-dev.cjs   (vite dev server + hot reload)
 * Prod:     npm run app                     (vite build, loads dist/index.html)
 */
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const isDev = process.argv.includes('--dev');
const DEV_URL = 'http://127.0.0.1:5173';

function createWindow() {
    const win = new BrowserWindow({
        width: 1600,
        height: 900,
        minWidth: 1024,
        minHeight: 640,
        backgroundColor: '#0a0a0a',
        title: 'Dark Rain: Pool of Darkness',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false // keep the game loop smooth when unfocused
        }
    });

    if (isDev) {
        win.loadURL(DEV_URL);
        win.webContents.openDevTools({ mode: 'detach' });
    } else {
        win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    // Open external links in the system browser, never inside the game window
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    return win;
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
