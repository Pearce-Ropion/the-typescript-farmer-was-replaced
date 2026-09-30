// The AST and the rule context come from oxlint, which doesn't export types for JS plugins.
// oxlint-disable-next-line typescript/no-explicit-any
export type Node = { type: string; [key: string]: any };
// oxlint-disable-next-line typescript/no-explicit-any
export type Context = any;
