PrintBox - Printing Vending Machine (student web app)

Run:
  1. Double-click index.html to open it in a browser (Chrome recommended).
  2. Or serve it: npx serve .   (or: python -m http.server 8080)

Notes:
  - Single file app (HTML + CSS + JS). No build step.
  - Internet is needed for the font and for PDF page previews (pdf.js loads from cdnjs).
  - Payment is demo mode only. File upload, edits and printing are not connected to a backend yet.
  - Price rates are in the calc() function in index.html (B&W Rs 1, Colour Rs 5 per page).

Next: Backend (Node + Express + TypeScript) and Pi agent (mock mode).
