export async function trackPayment(path, details, getAccessToken) {
  const token = await getAccessToken();
  if (!token) throw new Error('Payment tracking requires sign-in.');
  const response = await fetch(path, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(details), credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Payment tracking is unavailable. Try again before paying.');
  return response.json();
}
