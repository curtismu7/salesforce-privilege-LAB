// A refusal from the caller or the engine: becomes a short JSON error with an HTTP status, never a stack trace.
// Messages are fixed text and never echo the caller's input (a credential typed into a field must not come back in an error).
// `extra` carries structured, lab-written data (a sign-in outcome with its cause and fix); it is never caller text.
export class InputError extends Error {
  constructor(code, message, status = 400, extra = undefined) { super(message); this.code = code; this.status = status; this.extra = extra; }
}
export const refuse = (code, message, status = 400, extra = undefined) => new InputError(code, message, status, extra);
