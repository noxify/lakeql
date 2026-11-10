// Ambient declaration for CSS side-effect imports (e.g. the standalone entry
// and the CSS-only build entry). The imports carry no runtime value; they
// only signal the bundler to include the stylesheet.
declare module "*.css" {}
