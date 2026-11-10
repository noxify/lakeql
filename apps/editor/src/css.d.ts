// Ambient declaration for CSS side-effect imports (the studio stylesheet).
// The import carries no runtime value; it only signals the bundler to include
// the precompiled `@lakeql/studio/styles.css`.
declare module "*.css" {}
