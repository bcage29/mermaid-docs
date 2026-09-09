---
title: Website Sign-In and Startup
---

How a protected website authenticates through an external identity provider, establishes
its own session, and assembles a personalized page. The flow uses the authorization code
flow with PKCE rather than sending credentials to the website.

## site-request - The protected page redirects

The user opens a protected route. Because the browser has no application session, the
backend redirects it to the identity provider with a random state value and a PKCE
challenge. These values bind the eventual callback to this browser request.

## identity-check - The identity provider authenticates

The identity provider owns the sign-in interaction. It can apply passwordless login,
multifactor authentication, and consent policies without exposing credentials to the
website. After success, it returns a short-lived authorization code.

## session-create - The website establishes a session

The backend rejects callbacks whose state does not match. It then exchanges the code and
PKCE verifier directly with the identity provider. Tokens remain server-side, while the
browser receives only a secure, HTTP-only session cookie.

## profile-load - The user profile is loaded

With the authenticated subject established, the website retrieves the user's display
name, roles, and interface preferences. The backend exposes only the profile fields the
browser needs.

**Example profile response:**

```json
{
	"id": "user_8f2a",
	"displayName": "Avery Morgan",
	"roles": ["editor", "analyst"],
	"preferences": {
		"theme": "dark",
		"density": "compact"
	}
}
```

## site-load - The personalized site renders

The browser loads authorized dashboard content while applying the profile's preferences
and permissions. Once both are ready, it renders the personalized site for the user.