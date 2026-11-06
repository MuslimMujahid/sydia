import type { JSONSchema7 } from 'ai';
import type { AssistantToolDefinition } from './tool-executor.service';
import { terminalToolInputSchema } from './terminal-tool-response';

/** Number.MAX_SAFE_INTEGER: a bound every integer parser already enforces. */
const SAFE_INTEGER = 9007199254740991;

/** A schema node: an object schema, or a boolean that accepts or rejects all. */
type JSONSchema7Definition = JSONSchema7 | boolean;

function strip(definition: JSONSchema7Definition): JSONSchema7Definition {
  if (typeof definition === 'boolean') return definition;

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(definition)) {
    if (key === '$schema') continue;
    if (key === 'maximum' && value === SAFE_INTEGER) continue;
    if (key === 'additionalProperties' && value === true) continue;

    if (
      (key === 'properties' || key === 'definitions' || key === '$defs') &&
      value &&
      typeof value === 'object'
    ) {
      result[key] = Object.fromEntries(
        Object.entries(value as Record<string, JSONSchema7Definition>).map(
          ([name, child]) => [name, strip(child)],
        ),
      );
    } else if (Array.isArray(value)) {
      result[key] = value.map((item: unknown) =>
        item && typeof item === 'object'
          ? strip(item as JSONSchema7Definition)
          : item,
      );
    } else if (
      value &&
      typeof value === 'object' &&
      (key === 'items' ||
        key === 'additionalProperties' ||
        key === 'propertyNames' ||
        key === 'not')
    ) {
      result[key] = strip(value as JSONSchema7Definition);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * The input schema sent to the model. Drops keywords that cost tokens without
 * guiding the model: the `$schema` dialect marker, safe-integer upper bounds,
 * and permissive `additionalProperties: true`. Argument validation never
 * relies on the advertised schema; each tool's own parser still enforces the
 * full contract.
 */
export function advertisedInputSchema(
  definition: AssistantToolDefinition,
): JSONSchema7 {
  return strip(terminalToolInputSchema(definition)) as JSONSchema7;
}
