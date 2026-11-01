# ShopWalk 360 music library

Original ambient tracks composed for ShopWalk 360 by `compose.py` (pure synthesis,
no samples or third-party recordings), so the store may play them publicly.

| File | Title | Style |
|---|---|---|
| golden-hour.mp3 | Golden Hour | warm electric piano over lush pads |
| gallery-walk.mp3 | Gallery Walk | mellow lo-fi, felt piano, soft beat |
| morning-atrium.mp3 | Morning Atrium | airy pads with wind-chime bells |
| velvet-evening.mp3 | Velvet Evening | slow bossa-tinged groove |

They are added to Admin → Store Music once, on first start. Admins can hide,
reorder or delete them like any uploaded track. Regenerate with
`python3 compose.py <out_dir>` (needs numpy, scipy and ffmpeg).
