// Ambient declarations for non-TypeScript imports the bundler understands but
// the type system does not. CSS is imported for its side effects (the bundler
// injects it); it has no JS shape, so it's typed as an empty module.
declare module "*.css";
