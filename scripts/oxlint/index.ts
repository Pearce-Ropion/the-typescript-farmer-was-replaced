import flatModules from './rules/flat-modules.ts';
import noClasses from './rules/no-classes.ts';
import noDoWhile from './rules/no-do-while.ts';
import noLambdas from './rules/no-lambdas.ts';
import noNumberConversion from './rules/no-number-conversion.ts';
import noUnsupportedCollectionMember from './rules/no-unsupported-collection-member.ts';

/**
 * The lint rules for the TypeScript that is translated to the game's Python.
 */
export default {
  meta: { name: 'typescript-farmer' },
  rules: {
    'flat-modules': flatModules,
    'no-classes': noClasses,
    'no-do-while': noDoWhile,
    'no-lambdas': noLambdas,
    'no-number-conversion': noNumberConversion,
    'no-unsupported-collection-member': noUnsupportedCollectionMember,
  },
};
