# 🖨️ PrintBox — Smart Cloud & Kiosk Self-Service Printing

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Raspberry%20Pi-C51A4A?style=for-the-badge&logo=Raspberry-Pi&logoColor=white" alt="Raspberry Pi" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge" alt="PRs Welcome" />
</p>

<p align="center">
  <b>A complete open-source self-service printing kiosk system for universities, colleges, libraries, co-working spaces, and retail shops.</b><br>
  <i>Scan QR code • Upload documents from smartphone • Customize print layout • Pay via UPI / Razorpay • Collect printout in seconds.</i>
</p>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [✨ Key Features](#-key-features)
- [🏛️ System Architecture](#️-system-architecture)
- [🖨️ 5 Hardware & Print Connection Methods](#️-5-hardware--print-connection-methods)
- [🚀 Quick Start](#-quick-start)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running Backend Server](#running-backend-server)
- [🤖 Running Print Agents](#-running-print-agents)
  - [1. Raspberry Pi Kiosk Agent (Linux / CUPS)](#1-raspberry-pi-kiosk-agent-linux--cups)
  - [2. Desktop Agent (Windows GUI & Tray)](#2-desktop-agent-windows-gui--tray)
  - [3. Windows Hardware Kiosk (Direct Driver)](#3-windows-hardware-kiosk-direct-driver)
  - [4. Epson Connect (Cloud Email Print)](#4-epson-connect-cloud-email-print)
  - [5. Dev Mock Simulator](#5-dev-mock-simulator)
- [📦 Packaging Desktop Agent (.exe Installer)](#-packaging-desktop-agent-exe-installer)
- [🌐 Frontend Web Interfaces](#-frontend-web-interfaces)
- [📡 API Documentation](#-api-documentation)
- [📂 Project Structure](#-project-structure)
- [💰 Configurable Pricing Model](#-configurable-pricing-model)
- [🛡️ Production Deployment](#️-production-deployment)
  - [Deploy to Render / Cloud VPS](#deploy-to-render--cloud-vps)
  - [Raspberry Pi systemd Service (Auto-Start)](#raspberry-pi-systemd-service-auto-start)
  - [Cloudflare Tunnel (Zero-Port-Forwarding)](#cloudflare-tunnel-zero-port-forwarding)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## 🌟 Overview

Traditional printing in college campuses and libraries suffers from long queues, pen-drive virus issues, manual cash transactions, and operator bottlenecks.

**PrintBox** transforms standard consumer or commercial printers (Epson, HP, Canon, Brother, etc.) into **autonomous, cashless smart vending machines**. Students simply scan a machine-specific QR code, upload files directly from their phone, preview cost breakdown, complete instant UPI payment, and watch their pages print live on screen.

---

## ✨ Key Features

- 📱 **Zero-App Mobile Experience:** Students do not need to download an app. Everything runs inside standard mobile browsers (Safari, Chrome) via responsive Web UI.
- 📄 **Multi-Format Document Support:** Upload PDF, DOCX, PPTX, Images (JPG, PNG), and TXT files.
- ⚙️ **Advanced Print Customization:**
  - Color Modes: Black & White (Grayscale) or Vibrant Full Color.
  - Duplex Options: Single-sided or Double-sided (flip on long/short edge).
  - Page Range: Print all pages, custom intervals (`1-3, 5, 8-10`), or even/odd pages.
  - Paper Sizes: A4, A3, A5, and Legal formats.
  - Multi-copy printing, high-resolution photo mode, and auto-stapling calculations.
- 💳 **Seamless Digital Payments:**
  - Instant UPI Intent Links & Dynamic QR codes (PhonePe, Google Pay, Paytm, BHIM).
  - Webhook-verified Razorpay payment integration with demo fallback.
- ⚡ **Real-Time Live Printing Feed (SSE):**
  - Server-Sent Events stream live progress (`Printing page 3 of 10...`) directly to the user's phone in real time.
- 📊 **Centralized Admin Dashboard:**
  - View real-time sales revenue, live ink/toner levels, paper tray sensor count, and job audit logs.
- 🏷️ **QR Sticker Generator:**
  - Built-in machine QR code branding generator ready to print and paste on vending kiosk machines.

---

## 🏛️ System Architecture

```
┌────────────────────────────────────────────────────────┐
│             Student Smartphone / Web UI                │
│                 (public/index.html)                    │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS / SSE
                            ▼
┌────────────────────────────────────────────────────────┐
│                PrintBox Backend Server                 │
│                 (Node.js + Express + TS)               │
│  ├── Document Ingestion & Storage (uploads/)           │
│  ├── PDF Processor & Page Manipulator (pdf-lib)        │
│  ├── SQLite Persistence Layer (data/printbox.db)       │
│  ├── UPI & Razorpay Payment Verification               │
│  └── Server-Sent Events (SSE) Dispatcher               │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
       Polling / Webhook            Epson Email API
              │                           │
              ▼                           ▼
┌───────────────────────────┐   ┌────────────────────────┐
│  Local Print Agents       │   │  Epson Connect Cloud   │
│  • Raspberry Pi (CUPS)    │   │  (Zero local hardware; │
│  • Windows Desktop Agent  │   │   cloud direct print)  │
│  • Windows Kiosk Service  │   └───────────┬────────────┘
└─────────────┬─────────────┘               │
              │ USB / Wi-Fi                 │ Wi-Fi Direct
              ▼                             ▼
┌────────────────────────────────────────────────────────┐
│             Physical Printer (e.g. Epson L3250)         │
└────────────────────────────────────────────────────────┘
```

---

## 🖨️ 5 Hardware & Print Connection Methods

PrintBox is architected to fit any deployment scenario — from a $35 Raspberry Pi to an existing shop Windows PC or pure cloud:

| Method | Best For | Hardware Required | OS Support | Path in Repo |
|---|---|---|---|---|
| **1. Raspberry Pi Kiosk** | Standalone vending boxes, low cost, 24/7 reliability | Raspberry Pi 3/4/Zero 2W | Linux / Raspberry Pi OS | [`src/agents/kiosk-pi/`](src/agents/kiosk-pi/) |
| **2. Windows Desktop Agent** | Xerox / print shops with existing cashier PCs | Any Windows 10/11 Laptop or Desktop | Windows | [`src/agents/desktop/`](src/agents/desktop/) |
| **3. Windows Hardware Kiosk** | Direct driver access, high-speed Windows kiosks | Dedicated Windows PC | Windows | [`src/agents/kiosk-windows/`](src/agents/kiosk-windows/) |
| **4. Epson Connect Cloud** | Zero on-site computers, printer connects to Wi-Fi directly | Epson Connect capable printer | Any (Cloud Server) | [`src/services/print/`](src/services/print/) |
| **5. Dev Mock Simulator** | Software developers testing without printer hardware | Any dev computer | Any OS | [`src/agents/mock/`](src/agents/mock/) |

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher
- `npm` or `yarn` / `pnpm`
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/vistaratech/printbox.git
cd printbox

# Install dependencies
npm install
```

### Environment Variables

Copy `.env.example` to create your local `.env`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port for backend server |
| `NODE_ENV` | `development` | `development` or `production` |
| `UPLOAD_DIR` | `uploads` | Directory to store uploaded & processed documents |
| `MAX_FILE_SIZE_MB` | `50` | Maximum file upload size in Megabytes |
| `DEFAULT_MACHINE_ID`| `M-01` | Unique ID for default vending machine |
| `DEFAULT_MACHINE_LOCATION` | `Library Block` | Machine display name/location |
| `ENABLE_DEMO_PAYMENT` | `true` | Enable simulated UPI payment for instant testing |
| `PRINTER_NAME` | `""` | Target printer name (optional; auto-detects if empty) |
| `API_URL` | `http://localhost:3000/api` | API Base URL for local agents to poll |
| `EPSON_PRINTER_EMAIL` | `""` | Epson Connect email (for Method 4) |
| `SMTP_USER` / `SMTP_PASS` | `""` | SMTP sender credentials for Epson Cloud dispatch |

### Running Backend Server

```bash
# Start backend in watch mode (auto reload)
npm run dev
```

Visit **[http://localhost:3000](http://localhost:3000)** in your browser!

---

## 🤖 Running Print Agents

### 1. Raspberry Pi Kiosk Agent (Linux / CUPS)
Ideal for building custom enclosed vending kiosks using a Raspberry Pi 3B / 4B connected to the printer via USB or local Wi-Fi:

```bash
# 1. On your Raspberry Pi, install CUPS
sudo apt update && sudo apt install -y cups cups-client
sudo usermod -aG lpadmin $USER

# 2. Start the Pi kiosk agent
npm run kiosk:pi
```
*Auto-detects USB printers (`usb://...`) and Wi-Fi IPP/AirPrint queues without manual configuration.*

### 2. Desktop Agent (Windows GUI & Tray)
Designed for shop owners with a local Windows PC. Features an embedded system tray interface and web dashboard:

```bash
# Start desktop agent in development
npm run desktop:dev
```
*Access local agent dashboard at `http://localhost:3001/dashboard.html`.*

### 3. Windows Hardware Kiosk (Direct Driver)
For Windows-based kiosk machines using native Windows spooler and SumatraPDF pipeline:

```bash
npm run kiosk:real
# Or double click: scripts/start-kiosk.bat
```

### 4. Epson Connect (Cloud Email Print)
Zero local hardware required. Fill in `EPSON_PRINTER_EMAIL` and `SMTP_*` in your `.env`. When a user completes payment, PrintBox processes the PDF and emails it directly to Epson's cloud print queue.

### 5. Dev Mock Simulator
Simulates a real kiosk machine polling jobs and reporting live progress without requiring any printer hardware:

```bash
npm run kiosk:mock
```

---

## 📦 Packaging Desktop Agent (.exe Installer)

PrintBox includes an automated build pipeline that bundles the Desktop Agent into a standalone Windows `.exe` setup installer using Webpack and NSIS:

```bash
# 1. Compile TypeScript and bundle with Webpack
npm run desktop:build

# 2. Generate Windows Setup Installer (.exe)
npm run desktop:installer

# 3. Or run the full pipeline in one command:
npm run desktop:full
```
*Output installer will be placed in the `release/` folder.*

---

## 🌐 Frontend Web Interfaces

PrintBox comes with 4 built-in web portals:

| Interface | URL | Purpose |
|---|---|---|
| **Student Web UI** | `http://localhost:3000/` | Document upload, print preferences, live page count & UPI payment |
| **Kiosk Display** | `http://localhost:3000/kiosk` | Fullscreen vending display for touch monitors showing QR & instructions |
| **Admin Portal** | `http://localhost:3000/admin` | Revenue dashboard, live printer ink/paper monitoring, job history |
| **QR Sticker Maker** | `http://localhost:3000/sticker` | Ready-to-print branded machine QR stickers for kiosk hardware |

---

## 📡 API Documentation

### 📁 Uploads
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload document (`multipart/form-data`) — extracts page count & dimensions |

### 📑 Print Jobs
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/jobs` | Create print job with print settings & pricing |
| `GET` | `/api/jobs/:jobCode` | Get single job details and status |
| `GET` | `/api/jobs/:jobCode/stream` | Server-Sent Events (SSE) live printing feed |
| `GET` | `/api/jobs` | List recent print jobs |

### 💳 Payments
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/payments/create-order` | Generate dynamic UPI payment intent / Razorpay order |
| `POST` | `/api/payments/verify` | Verify payment signature and enqueue job for printing |

### 🤖 Kiosk & Machine Polling
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/machines/:machineId` | Retrieve machine status, paper tray count, toner percent |
| `GET` | `/api/kiosk/:machineId/poll` | Hardware agents poll for next pending print job |
| `POST` | `/api/kiosk/:machineId/jobs/:jobCode/progress` | Agent reports current printing page progress |
| `POST` | `/api/kiosk/:machineId/jobs/:jobCode/complete` | Agent reports successful print completion |
| `POST` | `/api/kiosk/:machineId/heartbeat` | Agent reports periodic health and sensor telemetry |

---

## 📂 Project Structure

```text
printbox/
├── bin/                          # Pre-packaged binaries (cloudflared)
├── data/                         # SQLite database storage (printbox.db)
├── dist/                         # Compiled JavaScript for production
├── public/                       # Responsive frontend HTML, CSS & JS
│   ├── index.html                # Mobile-friendly student upload portal
│   ├── admin.html                # Admin statistics & machine monitor
│   ├── kiosk.html                # Kiosk touchscreen user interface
│   └── sticker.html              # Branded QR sticker generator
├── scripts/                      # Build automation & utility scripts
│   ├── build-desktop.ps1         # Webpack & desktop packaging script
│   ├── create-installer.ps1      # NSIS setup installer generator
│   ├── installer.nsi             # NSIS compiler configuration
│   ├── start-kiosk.bat           # Quick launcher for Windows Kiosk
│   ├── start-server.bat          # Quick launcher for Backend Server
│   └── webpack.desktop.config.js # Webpack desktop packaging config
├── src/
│   ├── app.ts                    # Express application & middleware setup
│   ├── config.ts                 # Centralized configuration & pricing schema
│   ├── server.ts                 # HTTP server bootstrap
│   │
│   ├── agents/                   # Hardware print agents
│   │   ├── desktop/              # Windows Desktop GUI Agent & Dashboard
│   │   ├── kiosk-windows/        # Windows direct-driver kiosk polling agent
│   │   ├── kiosk-pi/             # Linux / Raspberry Pi CUPS hardware agent
│   │   ├── mock/                 # Local development hardware simulator
│   │   └── utils/                # Printer detection diagnostic utilities
│   │
│   ├── services/                 # Core business logic
│   │   ├── print/                # Document transformation & cloud print
│   │   │   ├── epsonCloudService.ts
│   │   │   └── pdfProcessorService.ts
│   │   ├── databaseService.ts    # SQLite query & repository methods
│   │   ├── jobService.ts         # Job lifecycle management
│   │   ├── machineService.ts     # Kiosk machine state & sensors
│   │   ├── paymentService.ts     # Payment verification & order generation
│   │   ├── pricingService.ts     # Server-side pricing calculation
│   │   └── sseService.ts         # Real-time Server-Sent Events hub
│   │
│   ├── routes/                   # REST API routing controllers
│   └── types/                    # TypeScript interfaces & types
├── uploads/                      # Temporary directory for uploaded files
├── package.json
└── tsconfig.json
```

---

## 💰 Configurable Pricing Model

PrintBox uses server-side price verification to ensure security:

| Option | Formula / Rate | Notes |
|---|---|---|
| **B&W Print** | ₹1.00 / page | Crisp monochrome printing |
| **Color Print** | ₹5.00 / page | Full color high-quality inkjet / laser |
| **Paper Sizes** | A4: 1.0x, A3: 2.0x, A5: 0.8x, Legal: 1.2x | Multiplier applied to base page rate |
| **Double Sided (Duplex)** | 10% Discount on printing fee | Eco-friendly incentive for saving paper |
| **High Quality Mode** | +₹0.50 / page | Photographic high DPI rendering |
| **Stapling Service** | +₹2.00 / copy | Automatic mechanical staple calculation |

*Rates are fully customizable in [`src/config.ts`](src/config.ts) or dynamically via database.*

---

## 🛡️ Production Deployment

### Deploy to Render / Cloud VPS

1. Connect your GitHub repository to [Render.com](https://render.com) or any cloud host.
2. Configure settings:
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node index.js`
3. Add your environment variables in the host dashboard.

### Raspberry Pi systemd Service (Auto-Start)
To ensure the kiosk agent runs automatically upon Raspberry Pi boot:

```ini
# /etc/systemd/system/printbox-kiosk.service
[Unit]
Description=PrintBox Raspberry Pi Kiosk Agent
After=network.target cups.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/printbox
ExecStart=/usr/bin/npx tsx src/agents/kiosk-pi/piKiosk.ts
Restart=always
RestartSec=5
Environment=API_URL=https://your-domain.com/api
Environment=MACHINE_ID=M-01

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable printbox-kiosk
sudo systemctl start printbox-kiosk
```

### Cloudflare Tunnel (Zero-Port-Forwarding)
Run your backend locally on a campus network with public HTTPS without port forwarding:
```bash
npm run tunnel
```

---

## 🤝 Contributing

Contributions make the open-source community an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

<p align="center">
  Built with ❤️ for students and campuses by <a href="https://github.com/vistaratech">VistaraTech</a>.
</p>
