import type { Context, Node } from './types.ts';

/**
 * Finds the variable an identifier refers to, if it was declared in the file.
 */
export function findVariable(context: Context, identifier: Node) {
  let scope = context.sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) {
      return variable;
    }
    scope = scope.upper;
  }
  return null;
}

/**
 * Whether an identifier refers to a global (`Number`, `Object`...) rather than something declared in the file.
 */
export function isGlobalReference(context: Context, identifier: Node): boolean {
  const variable = findVariable(context, identifier);
  return !variable || variable.defs.length === 0;
}
