---
title: Authentication Flow
---

How a browser session is established, from the first unauthenticated request through to
the app shell rendering. Four steps, each highlighting the part of the diagram it explains.

## user-entry - User arrives

An unauthenticated request reaches the app. There is no session cookie, so the router
sends the user to the login page rather than rendering the shell.

## credential-check - Credentials are checked

The submitted credentials are compared against the user store. A failure loops straight
back to the login page — deliberately without saying which field was wrong.

## token-issue - A token is issued

On success a short-lived JWT is minted and the session is recorded.

```json
{
  "sub": "user_8f2a",
  "exp": 1735689600,
  "scope": ["read:profile", "write:profile"]
}
```

The session store row lets us revoke a token before it expires.

## app-entry - The app shell renders

With a valid token the shell mounts and the user lands where they were originally headed.
