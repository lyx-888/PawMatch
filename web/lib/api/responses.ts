// Consistent JSON response shape for all API routes.

export function jsonResponse<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, {
    status: 200,
    ...init,
    headers: { 'Cache-Control': 'no-store', ...(init?.headers ?? {}) },
  })
}

export function errorResponse(
  status: number,
  message: string,
  extras: Record<string, unknown> = {},
): Response {
  return Response.json({ error: message, ...extras }, { status })
}
