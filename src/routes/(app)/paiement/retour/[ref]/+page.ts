import type { PageLoad } from './$types';
export const load: PageLoad = ({ params }) => ({ ref: params.ref });
