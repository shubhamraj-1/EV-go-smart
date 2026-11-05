export type ErrorShape = {
  error: { code: string; message: string; requestId: string };
};

export function errorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
): Response {
  const body: ErrorShape = { error: { code, message, requestId } };
  return Response.json(body, { status });
}
