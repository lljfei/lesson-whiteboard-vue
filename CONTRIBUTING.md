# Contributing

Use Node.js 22 or later and npm. This directory is an independent package; it does
not require the lesson application, its API, login state, or environment files.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run build:example
npm pack
```

The standalone UI examples are `/`, `/office.html`, and `/teaching.html`.
Generated documents in `public/fixtures` are artificial examples, not lesson
content. WPS examples require your own integration; never commit real tokens,
app secrets, environment files or private courseware.

Keep generic UI, drawing and file handling here. Route navigation, user identity,
resource lists, permission checks and classroom completion belong in host apps.
Use slots/events for host features. Test state/history changes at their boundary;
record real browser verification separately from mocked SDK tests.

Report defects with a minimal reproducible example and a shareable sample file.
Do not upload documents containing private student, teacher or business data.
