export async function login(email: string, password: string) {
  const user = await db.users.findByEmail(email)
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error('Invalid credentials')
  }
  return issueTokens(user.id)
}
