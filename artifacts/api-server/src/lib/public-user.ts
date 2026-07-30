import type { User } from "@workspace/db";

// Strips passwordHash (and anything else private) before a user object
// is ever sent in an API response.
export function toPublicUser(user: User) {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}
