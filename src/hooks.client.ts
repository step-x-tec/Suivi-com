import type { HandleClientError } from '@sveltejs/kit';
import { messageErreurClient } from '$lib/erreurs';

export const handleError: HandleClientError = ({ error, status, message }) => {
  console.error(error);
  return { message: messageErreurClient(error, status, message) };
};
