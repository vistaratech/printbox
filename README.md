# 🖨️ PrintBox – Smart Printing Vending Machine

Self-service Smart Printing Vending Machine web app and Backend API for colleges, campuses, and libraries.

Students can scan the QR code on the kiosk machine, upload documents from their smartphone, customize print layout, pay via UPI, and collect their prints without waiting in long queues.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Backend API & Web App
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser!

### 3. (Optional) Run the Raspberry Pi Kiosk Simulator
To simulate the physical vending machine / printer hardware polling and printing jobs:
```bash
npm run kiosk:mock
```

### 4. Build for Production
```bash
npm run build
npm start
```

---

## 🏗️ Architecture & Features

```
┌─────────────────────────────────────────┐
│       Student Smartphone / Web UI       │
│           (public/index.html)           │
└────────────────────┬────────────────────┘
                     │ HTTP / SSE
                     ▼
┌─────────────────────────────────────────┐
│        PrintBox Backend Server          │
│        (Node.js + Express + TS)         │
│  - File Upload & Storage (uploads/)     │
│  - Server-side Pricing Verification     │
│  - Job Queue Management                 │
│  - Server-Sent Events (SSE) Live Feed   │
│  - UPI Payment Simulation / Gateway     │
└────────────────────┬────────────────────┘
                     │ Poll & Progress
                     ▼
┌─────────────────────────────────────────┐
│     Raspberry Pi / Kiosk Hardware       │
│  - Machine M-01 Heartbeat & Paper Count │
│  - CUPS / Physical Printer Execution    │
└─────────────────────────────────────────┘
```

---

## 📡 API Endpoints

### 📁 Uploads
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload PDF, DOCX, PPTX, Images, or TXT (`multipart/form-data`) |

### 📑 Print Jobs
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/jobs` | Create a new print job with print settings |
| `GET` | `/api/jobs/:jobCode` | Fetch single job status & details |
| `GET` | `/api/jobs/:jobCode/stream` | Server-Sent Events (SSE) stream for live page printing |
| `GET` | `/api/jobs` | List all recent print jobs |

### 💳 Payments
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/payments/create-order` | Generate UPI intent URI and payment breakdown |
| `POST` | `/api/payments/verify` | Verify payment and trigger machine queue / auto simulation |

### 🤖 Machine & Kiosk (Hardware Agent)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/machines/:machineId` | Get machine online status, paper count, toner level |
| `GET` | `/api/kiosk/:machineId/poll` | Kiosk polls next job waiting to be printed |
| `POST` | `/api/kiosk/:machineId/jobs/:jobCode/progress` | Kiosk reports printing progress (`printedPages`) |
| `POST` | `/api/kiosk/:machineId/jobs/:jobCode/complete` | Kiosk marks job completed & deducts paper count |
| `POST` | `/api/kiosk/:machineId/heartbeat` | Kiosk reports live paper tray sensor count |

---

## 💰 Pricing Logic
* **B&W Printing:** ₹1.00 / page
* **Colour Printing:** ₹5.00 / page
* **Paper Sizes:** A5 (0.8x), A4 (1x), Legal (1.2x), A3 (2x)
* **Double Sided Discount:** 10% off printing rate
* **High Quality Print:** +₹0.50 / page
* **Staple Option:** +₹2.00 / copy
