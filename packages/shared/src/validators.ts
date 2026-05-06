/**
 * Argument validators for MCP tool inputs.
 * Each validator throws an Error with a descriptive message on failure,
 * which the MCP server turns into a tool-call error response.
 */

export function validateString(
  args: Record<string, unknown> | undefined,
  key: string,
  required: true
): string;
export function validateString(
  args: Record<string, unknown> | undefined,
  key: string,
  required: false
): string | undefined;
export function validateString(
  args: Record<string, unknown> | undefined,
  key: string,
  required: boolean
): string | undefined {
  const value = args?.[key];
  if (required && (value === undefined || value === null)) {
    throw new Error(`${key} is required`);
  }
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new Error(`${key} must be a string`);
  }
  return value as string | undefined;
}

export function validateNumber(
  args: Record<string, unknown> | undefined,
  key: string,
  opts?: { min?: number; max?: number }
): number | undefined {
  const value = args?.[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number') {
    throw new Error(`${key} must be a number`);
  }
  if (opts?.min !== undefined && value < opts.min) {
    throw new Error(`${key} must be at least ${opts.min}`);
  }
  if (opts?.max !== undefined && value > opts.max) {
    throw new Error(`${key} must be at most ${opts.max}`);
  }
  return value;
}

export function validateBoolean(
  args: Record<string, unknown> | undefined,
  key: string,
  defaultValue = false
): boolean {
  const value = args?.[key];
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== 'boolean') {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

export function validateStringArray(
  args: Record<string, unknown> | undefined,
  key: string,
  required: boolean
): string[] | undefined {
  const value = args?.[key];
  if (value === undefined || value === null) {
    if (required) throw new Error(`${key} is required`);
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array of strings`);
  }
  if (!value.every((v) => typeof v === 'string')) {
    throw new Error(`${key} must contain only strings`);
  }
  if (required && value.length === 0) {
    throw new Error(`${key} must not be empty`);
  }
  return value as string[];
}
