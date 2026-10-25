const ptp = require('pdf-to-printer');

async function check() {
  console.log('🔍 Checking connected printers on Windows...');
  try {
    const printers = await ptp.getPrinters();
    console.log('Available Printers:');
    console.log(printers);
    const defaultPrinter = await ptp.getDefaultPrinter();
    console.log('\nDefault Printer:', defaultPrinter);
  } catch (err) {
    console.error('Error finding printers:', err);
  }
}

check();
