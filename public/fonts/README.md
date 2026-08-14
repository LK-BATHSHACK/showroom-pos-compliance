# Silka font files go here

Silka is a licensed commercial font, so the actual `.woff2` files aren't
included in this repo - only whoever holds the Bathshack Silka license can
add them.

Drop these exact filenames in this folder (see `app/globals.css` for the
`@font-face` rules that reference them):

- `Silka-Light.woff2`
- `Silka-Regular.woff2`
- `Silka-Medium.woff2`
- `Silka-Bold.woff2`

Until they're added, the site falls back to Poppins (Bathshack's documented
fallback font per the brand guidelines) automatically - nothing breaks.
