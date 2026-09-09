export function errorMessage(error: unknown, fallback: string) {
  const value = error as { response?: { data?: { message?: string } }; message?: string };
  return value.response?.data?.message || value.message || fallback;
}
