# Rags & Wrenches — Client Intake & Service Authorization

Single-page, static web app for premium client intake, service authorization, and record capture.

## Usage

1. Open `index.html` in a browser (or host with GitHub Pages).
2. Complete form sections, draw client signature, and optionally upload intake photos.
3. Use:
   - **Save Draft** for manual local draft saves
   - **Submit & Lock** to validate, lock read-only, and store immutable finalized record
   - **Print / Save as PDF** for printable document output
   - **Export JSON** for full intake export (including signature and photos as data URLs)
   - **Reset Form** to clear active intake data
4. If a draft exists, use the restore banner to reload it.
5. Use the **Records** dropdown to load finalized records in read-only mode.

## Notes

- Drafts auto-save every 5 seconds and on input changes.
- Large photo payloads are kept in-memory and excluded from localStorage if size limits are exceeded.
- Works with vanilla HTML/CSS/JS only (no build tools required).
