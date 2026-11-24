export class ApiError extends Error {
  constructor(code, status = 400, field = null, params = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.field = field;
    this.params = params;
  }
}

export function assert(condition, code, status = 400, field = null) {
  if (!condition) throw new ApiError(code, status, field);
}
