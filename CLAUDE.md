# ShopWalk 360 — notes for Claude

## When the owner sends a product photo for a 3D model

The owner does not use 3D software. When they send a product photo and ask for a 3D file:

1. `pip install --break-system-packages -r tools/photo-to-3d/requirements.txt` (once per session).
2. Save the photo, then run
   `python3 tools/photo-to-3d/photo_to_glb.py <photo> -o <product-name>.glb --preview <product-name>-cutout.png`
   Add `--height-cm` / `--size-cm` if they gave the real size, and `--shape round|cutout|box` if
   `auto` picks the wrong one (bottles/jars → round, gadgets/shoes/bags → cutout, packaged → box).
3. Look at the preview PNG: the whole product must be there and no background. If not, retry with
   `--background plain` or `--background rembg`, or ask for a photo on a contrasting plain background.
4. Render-check the GLB if possible, then send the `.glb` to the owner with SendUserFile and tell
   them: Admin → Virtual Store → Product experience → choose the product → 3D Product Configuration
   → Uploaded 3D model → GLB, then Save. Remind them to enter the real dimensions (cm) there and to
   place the product on a display (Location in the store).

See `tools/photo-to-3d/README.md` for details.

## Project basics

- Frontend: React + Vite + Three.js (`src/`), the 3D store in `src/components/store3d/`.
- Backend: Express + better-sqlite3 (`server.ts`, `server/`); deployed on Railway, frontend on Vercel.
- `npx tsc --noEmit` typechecks frontend and server; `npx vite build` builds the frontend.
- Products are placed on displays per spot (`store_shelf_items`; spot definitions in
  `src/components/store3d/layout/fixtureSpots.ts`, mirrored as `SPOT_RULES` in `server/store3dV2.ts`).
