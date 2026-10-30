# Third-party dependencies

This package's own source is MIT licensed. Dependencies retain their own licenses;
the MIT license does not replace them. Dependencies are imported from npm rather
than copied into this repository.

| Dependency | License | Purpose |
| --- | --- | --- |
| Vue | MIT | UI and reactivity; shared with the application as a peer dependency |
| Konva | MIT | Canvas interaction |
| vue-konva | MIT | Vue bindings |
| docx-preview | Apache-2.0 | DOCX preview, loaded on demand |
| @aiden0z/pptx-renderer | Apache-2.0 | PPTX preview, loaded on demand |

Konva, vue-konva, and both Office renderers are runtime dependencies installed
automatically by npm. Office rendering modules load on demand when used.

Consult each installed package's LICENSE and THIRD_PARTY_NOTICES, including its
transitive dependencies, when redistributing a built application. WPS WebOffice
is a separately configured third-party online service, governed by its own terms.
Its SDK, credentials, account, backend callbacks and service entitlement are not
included in this package.
