/**
 * Direct USB printing for thermal receipt printers (no Windows driver required).
 * Uses libusb to enumerate devices and send raw ESC/POS bytes via bulk OUT endpoint.
 *
 * If a Windows driver is installed, the OS claims the USB interface and this path
 * will throw LIBUSB_ERROR_ACCESS — use @thiagoelg/node-printer (driver path) instead.
 */

let usbModule: typeof import('usb') | null = null
try {
  usbModule = require('usb')
} catch {
  console.warn('[zolvix-desktop] usb module not available')
}

export interface UsbPrinterInfo {
  vid: number
  pid: number
  name: string
  paper: string // suggested paper type: '80mm' | '58mm' | '76mm'
}

// Known thermal/receipt printer VID:PID table
const KNOWN_PRINTERS: UsbPrinterInfo[] = [
  // Epson TM series
  { vid: 0x04b8, pid: 0x0202, name: 'Epson TM-U220', paper: '76mm' },
  { vid: 0x04b8, pid: 0x0005, name: 'Epson TM-T88II', paper: '80mm' },
  { vid: 0x04b8, pid: 0x000b, name: 'Epson TM-T88III', paper: '80mm' },
  { vid: 0x04b8, pid: 0x0007, name: 'Epson TM-T88IV', paper: '80mm' },
  { vid: 0x04b8, pid: 0x0e03, name: 'Epson TM-T88V', paper: '80mm' },
  { vid: 0x04b8, pid: 0x0e15, name: 'Epson TM-T88VI', paper: '80mm' },
  { vid: 0x04b8, pid: 0x0e28, name: 'Epson TM-T88VII', paper: '80mm' },
  { vid: 0x04b8, pid: 0x0e20, name: 'Epson TM-T20', paper: '80mm' },
  { vid: 0x04b8, pid: 0x0e27, name: 'Epson TM-T20III', paper: '80mm' },
  { vid: 0x04b8, pid: 0x0101, name: 'Epson TM-T70', paper: '80mm' },
  { vid: 0x04b8, pid: 0x0111, name: 'Epson TM-T81', paper: '80mm' },
  { vid: 0x04b8, pid: 0x0114, name: 'Epson TM-T82', paper: '80mm' },
  // Star Micronics
  { vid: 0x0519, pid: 0x0003, name: 'Star TSP100', paper: '80mm' },
  { vid: 0x0519, pid: 0x0001, name: 'Star TSP600', paper: '80mm' },
  { vid: 0x0519, pid: 0x0002, name: 'Star TSP700', paper: '76mm' },
  { vid: 0x0519, pid: 0x0006, name: 'Star SP700', paper: '76mm' },
  // Citizen
  { vid: 0x1d90, pid: 0x2060, name: 'Citizen CT-S310', paper: '80mm' },
  { vid: 0x1d90, pid: 0x2040, name: 'Citizen CT-S300', paper: '58mm' },
  { vid: 0x1d90, pid: 0x2050, name: 'Citizen CT-S280', paper: '58mm' },
  // Bixolon
  { vid: 0x1504, pid: 0x0006, name: 'Bixolon SRP-350', paper: '80mm' },
  { vid: 0x1504, pid: 0x0012, name: 'Bixolon SRP-380', paper: '80mm' },
  { vid: 0x1504, pid: 0x0025, name: 'Bixolon SRP-F310', paper: '80mm' },
  // Xprinter
  { vid: 0x0483, pid: 0x5743, name: 'Xprinter XP-58', paper: '58mm' },
  { vid: 0x0483, pid: 0x070b, name: 'Xprinter XP-80', paper: '80mm' },
  // Generic / Sewoo
  { vid: 0x0dd4, pid: 0x0186, name: 'Sewoo SLK-TS400', paper: '80mm' },
  { vid: 0x0dd4, pid: 0x0200, name: 'Sewoo LK-T300', paper: '80mm' },
]

export function detectUsbThermalPrinters(): UsbPrinterInfo[] {
  if (!usbModule) return []
  try {
    const devices = usbModule.getDeviceList()
    const found: UsbPrinterInfo[] = []
    for (const dev of devices) {
      const { idVendor, idProduct } = dev.deviceDescriptor
      const match = KNOWN_PRINTERS.find(p => p.vid === idVendor && p.pid === idProduct)
      if (match) found.push(match)
    }
    return found
  } catch {
    return []
  }
}

export async function printViaUsb(vid: number, pid: number, data: Buffer): Promise<void> {
  if (!usbModule) throw new Error('USB module not available.')

  const device = usbModule.findByIds(vid, pid)
  if (!device) throw new Error('USB printer not found. Check that it is plugged in.')

  device.open()

  // Walk interfaces to find a claimable bulk OUT endpoint
  let outEndpoint: import('usb').OutEndpoint | null = null
  let claimedIface: import('usb').Interface | null = null

  for (const iface of (device.interfaces ?? [])) {
    try {
      if (iface.isKernelDriverActive()) iface.detachKernelDriver()
      iface.claim()
      for (const ep of iface.endpoints) {
        if (ep.direction === 'out' && ep.transferType === 2 /* BULK */) {
          outEndpoint = ep as import('usb').OutEndpoint
          claimedIface = iface
          break
        }
      }
      if (outEndpoint) break
      iface.release(() => {})
    } catch {
      // Interface is owned by OS driver — skip
    }
  }

  if (!outEndpoint || !claimedIface) {
    device.close()
    throw new Error(
      'Could not claim USB interface. A Windows driver is installed for this printer — select it from the Windows printer list instead.'
    )
  }

  return new Promise((resolve, reject) => {
    outEndpoint!.transfer(data, (err) => {
      claimedIface!.release(() => device.close())
      if (err) reject(new Error(`USB transfer failed: ${err.message}`))
      else resolve()
    })
  })
}
