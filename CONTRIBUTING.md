# Contributing

Use Node.js 22 or later and npm. Clone this repository, then install its development
dependencies and start the examples:

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run build:example
npm pack
```

The UI examples are `/`, `/office.html`, and `/teaching.html`. Generated documents
in `public/fixtures` are artificial, shareable samples. WPS examples require your
own WebOffice application, SDK, and backend callbacks; never commit real tokens,
app secrets, environment files or private documents.

The test tools above are development dependencies of this repository. Applications
that install the published package do not need these tools.

Keep UI, drawing, and document APIs reusable across applications. Use public
props, slots, events, and sessions for application-specific behavior. Documentation
and examples should describe the library's actual behavior without referring to
private projects, application-specific workflows, local paths, or migration history.
Keep the English and Chinese README versions consistent when changing documented
behavior, APIs, or examples.

Test state/history changes at their boundary; record real browser verification
separately from mocked SDK tests.

Report defects with a minimal reproducible example and a shareable sample file.
Do not upload documents containing private student, teacher or business data.
