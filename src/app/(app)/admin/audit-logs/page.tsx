// Signed-in pages fetch their data on the client (the session lives in memory), so navigations into them
// can't be instant by design. `instant` must be set per page and can't live in a Client Component,
// hence this thin server entry around the client view.
export const instant = false;

export { default } from "./view";
