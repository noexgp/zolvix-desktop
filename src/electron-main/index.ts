import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { store } from './store'
import { buildEscpPreprinted, buildEscpPlain } from './escp-builder'

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
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
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
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Store IPC handlers — key allowlist prevents arbitrary key read/write from renderer
  const STORE_ALLOWED_KEYS = ['serverUrl', 'lx310PrinterName', 'formOffsets', 'setupComplete'] as const
  type StoreKey = typeof STORE_ALLOWED_KEYS[number]

  ipcMain.handle('store:get', (_, key: string) => {
    if (!STORE_ALLOWED_KEYS.includes(key as StoreKey)) throw new Error(`Unknown store key: ${key}`)
    return store.get(key as StoreKey)
  })

  ipcMain.handle('store:set', (_, key: string, value: unknown) => {
    if (!STORE_ALLOWED_KEYS.includes(key as StoreKey)) throw new Error(`Unknown store key: ${key}`)
    store.set(key as StoreKey, value as any)
  })

  ipcMain.handle('print:getPrinters', () => {
    if (!printerModule) return []
    return printerModule.getPrinters().map((p: { name: string }) => p.name)
  })

  ipcMain.handle('print:lx310', async (_event, { data, mode }: { data: unknown; mode: 'preprinted' | 'plain' }) => {
    const printer = printerModule
    if (!printer) throw new Error('Printer support is not available in this build. Use the Windows build to print to the LX-310.')
    const printerName = store.get('lx310PrinterName') as string
    if (!printerName) throw new Error('Printer not configured. Go to Settings to select your LX-310 printer.')
    const offsets = (store.get('formOffsets') as { row: number; col: number } | undefined) ?? { row: 3, col: 5 }
    const invoiceData = data as import('./escp-builder').InvoiceData
    const buffer = mode === 'preprinted' ? buildEscpPreprinted(invoiceData, offsets) : buildEscpPlain(invoiceData)
    return new Promise<void>((resolve, reject) => {
      printer.printDirect({
        data: buffer,
        printer: printerName,
        type: 'RAW',
        success: () => resolve(),
        error: (err: unknown) => reject(err instanceof Error ? err : new Error(String(err))),
      })
    })
  })

  createWindow()

  // Check for updates after window is ready
  try {
    autoUpdater.checkForUpdatesAndNotify()
  } catch {
    // Not available in dev mode
  }

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'A new version has been downloaded. Restart now to apply the update.',
      buttons: ['Restart', 'Later'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
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
