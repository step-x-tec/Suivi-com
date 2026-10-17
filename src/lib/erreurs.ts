// Message affiché pour une erreur inattendue dans le navigateur. SvelteKit n'affiche sinon que « Internal Error », sans la cause :
// on y ajoute le nom et le texte de l'exception, pour qu'une capture d'écran suffise à comprendre.
export function messageErreurClient(error: unknown, status: number, message: string): string {
  if (status === 404) return message;
  const detail = error instanceof Error ? `${error.name} : ${error.message}` : typeof error === 'string' ? error : 'cause inconnue';
  return `Erreur inattendue (${detail.replace(/\s+/g, ' ').trim().slice(0, 220)})`;
}
