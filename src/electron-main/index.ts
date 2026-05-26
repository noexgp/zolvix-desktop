import { app, shell, BrowserWindow, ipcMain, dialog, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { store } from './store'

// Accept self-signed certificates — this is a closed internal app where users configure their own server
app.on('certificate-error', (_event, _webContents, _url, _error, _certificate, callback) => {
  callback(true)
})

// Conditional import for @thiagoelg/node-printer (native module — may not be compiled on dev machine)
let printerModule: typeof import('@thiagoelg/node-printer') | null = null
try {
  printerModule = require('@thiagoelg/node-printer')
} catch {
  console.warn('[zolvix-desktop] @thiagoelg/node-printer not available — printing disabled')
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false  // closed internal app — allows cross-origin API calls without CORS headers
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // blob: URLs are PDF previews — open in a new Electron window (Chromium PDF viewer)
    if (details.url.startsWith('blob:')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 900,
          height: 800,
          autoHideMenuBar: true,
          title: 'Print Preview',
          webPreferences: { sandbox: false },
        },
      }
    }
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.zolvix.desktop')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Store IPC handlers — key allowlist prevents arbitrary key read/write from renderer
  const STORE_ALLOWED_KEYS = ['serverUrl', 'setupComplete', 'terminalId'] as const
  type StoreKey = typeof STORE_ALLOWED_KEYS[number]

  ipcMain.handle('store:get', (_, key: string) => {
    if (!STORE_ALLOWED_KEYS.includes(key as StoreKey)) throw new Error(`Unknown store key: ${key}`)
    return store.get(key as StoreKey)
  })

  ipcMain.handle('store:set', (_, key: string, value: unknown) => {
    if (!STORE_ALLOWED_KEYS.includes(key as StoreKey)) throw new Error(`Unknown store key: ${key}`)
    store.set(key as StoreKey, value as any)
  })

  // General API proxy — all renderer fetch calls route through here to avoid CORS.
  // net.request uses the session cookie jar so auth cookies are sent/stored automatically.
  ipcMain.handle('api:fetch', (_event, { url, method, headers, body }: {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
  }) => {
    return new Promise<{ status: number; headers: Record<string, string | string[]>; body: string }>((resolve, reject) => {
      try {
        const req = net.request({ url, method, useSessionCookies: true })
        for (const [k, v] of Object.entries(headers ?? {})) req.setHeader(k, v)
        req.on('response', (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => resolve({
            status: res.statusCode,
            headers: res.headers as Record<string, string | string[]>,
            body: Buffer.concat(chunks).toString('utf-8'),
          }))
          res.on('error', reject)
        })
        req.on('error', reject)
        if (body) req.write(body)
        req.end()
      } catch (err) {
        reject(err)
      }
    })
  })

  ipcMain.handle('server:checkHealth', (_event, url: string) => {
    return new Promise<{ ok: boolean; status?: number; error?: string }>((resolve) => {
      try {
        const req = net.request({ url: `${url}/api/health`, method: 'GET' })
        req.on('response', (res) => {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode })
        })
        req.on('error', (err) => {
          resolve({ ok: false, error: err.message })
        })
        req.end()
      } catch (err) {
        resolve({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    })
  })

  ipcMain.handle('print:getPrinters', async () => {
    // Use Electron's built-in cross-platform printer list
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      const list = await win.webContents.getPrintersAsync()
      return list.map((p) => p.name)
    }
    // Fallback to native module if available (Windows)
    if (!printerModule) return []
    return printerModule.getPrinters().map((p: { name: string }) => p.name)
  })


  createWindow()

  // Check for updates after window is ready
  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Not available in dev mode or no update server reachable
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'A new version has been downloaded. Restart now to apply the update.',
      buttons: ['Restart', 'Later'],
    })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
      .catch(() => {
        // Dialog dismissed or window closed
      })
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
