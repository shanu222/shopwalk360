# Photo → 3D product model

Turns one product photo into a `.glb` 3D model for the ShopWalk 360 virtual store. No 3D software
needed: send the photo to Claude (or run the script yourself), then upload the `.glb` in
**Admin → Virtual Store → Product experience → 3D Product Configuration → Uploaded 3D model**.

## What it makes

| Shape  | Used for | How |
|--------|----------|-----|
| `round`  | bottles, jars, cans, cups, vases | the outline is spun into a round body; the photo wraps around it |
| `cutout` | gadgets, shoes, bags, tools, toys | a solid of the product's outline with real thickness; photo on front and back |
| `box`    | boxed / rectangular products | a box with the photo on the front |
| `auto`   | default | picks one of the above from the outline |

The model is in metres, standing on the floor, front facing +Z. The store sizes it to the
product's real dimensions (enter them in admin) and never makes it taller than the shelf gap.

## Best photos

- The product **facing the camera**, whole product in frame, nothing covering it.
- A **plain background that contrasts** with the product (a white product on a dark sheet, a dark
  product on white). Busy backgrounds work too — an AI cut-out model is used — but plain is best.
- Bottles and jars: straight from the front, at the product's mid-height.
- Shoes: from the side.

## Run it

```bash
pip install -r tools/photo-to-3d/requirements.txt
python3 tools/photo-to-3d/photo_to_glb.py photo.jpg -o product.glb --preview cutout.png
```

Options: `--shape round|cutout|box`, `--height-cm 24` (real height), `--size-cm 28` (longest side
when the height is unknown), `--depth-cm 9` (thickness for cutout/box),
`--background auto|rembg|plain|none`.

Check `cutout.png` (the product as it was cut out of the photo) before uploading. If part of the
product is missing, retake the photo against a more contrasting background, or use
`--background plain` / `--background rembg` to try the other cut-out method.

Files are small (typically 30–400 KB) so they load fast in the store.
