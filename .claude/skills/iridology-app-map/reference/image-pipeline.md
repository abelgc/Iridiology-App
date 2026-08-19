# Image pipeline

## The two upload components (no shared code)

| | File | Resizes to | JPEG quality | Images/eye |
|---|---|---|---|---|
| /practitioner | `src/components/sessions/image-upload.tsx:61` | ≤1024px (long edge) | 0.85 | 1 |
| /client | `src/components/client/iris-image-upload.tsx:12` | ≤1200px (long edge) | 0.80 | 1 |

Both use `<canvas>` + `drawImage` + `toDataURL`/`toBlob` in the browser, before the image ever reaches an API. Neither crops — the full frame is sent as captured by the camera (eyelid, lashes, eyebrow included).

## How they reach the model

`AnalysisRequest` (`src/types/claude.ts:4-5`): `rightIrisBase64: string`, `leftIrisBase64: string` — one string per eye, not an array. There's no type support for multiple shots per iris.

- Anthropic (`anthropic-provider.ts`): the SDK sends the base64 as-is, no resize/detail parameter of its own.
- OpenAI (`openai-provider.ts`): `image_url` has no `detail` field → defaults to `"auto"`, which for images this size enters high-detail mode (512px tiles).

## Real model ceilings (verified against official docs at diagnosis time, not from memory)

- Claude: ~1568px on the long edge is the useful ceiling (tokens ≈ width×height/750); past that, Claude downscales anyway — only adds latency, zero gain. Both current caps (1024/1200) are below that ceiling: there's real headroom with no extra downscale cost.
- GPT-4o: scales to fit a 2048×2048 box, then shortest side to 768px, tiles at 512px; cost = 85 + 170×tiles.

## Why this matters for P2 (false negatives)

See the full diagnosis with the real Wendy case in `reported bug/` and the diagram published in the conversation. Summary: the model never sees more resolution than what survives this compression, and a large share of that already-limited pixel budget is spent on skin/lashes for lack of cropping — not iris. Agreed intervention order: crop first, then raise the resolution cap, and leave "multiple photos per eye" / "separate not-detected from normal" until after measuring with an experiment using real practitioner cases.
