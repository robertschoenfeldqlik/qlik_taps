"""Authentication handlers for the generic REST API tap.

Supported methods:
  - no_auth:      No authentication
  - api_key:      API key sent as header or query parameter
  - bearer_token: Bearer token in Authorization header
  - basic:        HTTP Basic Authentication (username/password)
  - oauth2:       OAuth 2.0 Client Credentials or Refresh Token flow
"""

import time
import logging

import requests
from requests.auth import HTTPBasicAuth

LOGGER = logging.getLogger(__name__)


class AuthError(Exception):
    """Raised when authentication fails."""


class NoAuth:
    """No authentication -- pass-through."""

    def apply(self, session, params):
        return params


class ApiKeyAuth:
    """API key authentication.

    Can inject the key as a header or query parameter.

    Config keys:
        api_key          - The API key value
        api_key_name     - Header or param name (default: "X-API-Key")
        api_key_location - "header" (default) or "param"
    """

    def __init__(self, config):
        self.api_key = config["api_key"]
        self.key_name = config.get("api_key_name", "X-API-Key")
        self.location = config.get("api_key_location", "header")

    def apply(self, session, params):
        if self.location == "param":
            params = params or {}
            params[self.key_name] = self.api_key
        else:
            session.headers[self.key_name] = self.api_key
        return params


class BearerTokenAuth:
    """Static Bearer token authentication.

    Config keys:
        bearer_token - The bearer token value
    """

    def __init__(self, config):
        self.token = config["bearer_token"]

    def apply(self, session, params):
        session.headers["Authorization"] = f"Bearer {self.token}"
        return params


class BasicAuth:
    """HTTP Basic Authentication.

    Config keys:
        username - The username
        password - The password
    """

    def __init__(self, config):
        self.username = config["username"]
        self.password = config["password"]

    def apply(self, session, params):
        session.auth = HTTPBasicAuth(self.username, self.password)
        return params


class OAuth2Auth:
    """OAuth 2.0 authentication with automatic token refresh.

    Supports two grant types:
      - client_credentials: Uses client_id + client_secret
      - refresh_token: Uses refresh_token to get new access tokens

    Config keys:
        oauth2_token_url    - Token endpoint URL (required)
        oauth2_client_id    - Client ID (required)
        oauth2_client_secret - Client secret (required)
        oauth2_grant_type   - "client_credentials" (default) or "refresh_token"
        oauth2_refresh_token - Refresh token (required for refresh_token grant)
        oauth2_scope        - OAuth scope(s) (optional)
        oauth2_audience     - Audience claim (optional, for Auth0/etc.)
        oauth2_extra_params - Dict of extra params to send to token endpoint
    """

    def __init__(self, config):
        self.token_url = config["oauth2_token_url"]
        self.client_id = config["oauth2_client_id"]
        self.client_secret = config["oauth2_client_secret"]
        self.grant_type = config.get("oauth2_grant_type", "client_credentials")
        self.refresh_token = config.get("oauth2_refresh_token")
        self.scope = config.get("oauth2_scope")
        self.audience = config.get("oauth2_audience")
        self.extra_params = config.get("oauth2_extra_params", {})

        self._access_token = None
        self._token_expires_at = 0

    def _request_token(self):
        """Request a new access token from the OAuth2 provider."""
        payload = {
            "grant_type": self.grant_type,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
        }

        if self.grant_type == "refresh_token":
            if not self.refresh_token:
                raise AuthError("oauth2_refresh_token is required for refresh_token grant type")
            payload["refresh_token"] = self.refresh_token

        if self.scope:
            payload["scope"] = self.scope

        if self.audience:
            payload["audience"] = self.audience

        # Merge any extra params
        payload.update(self.extra_params)

        LOGGER.info("Requesting OAuth2 token from %s (grant_type=%s)",
                     self.token_url, self.grant_type)

        resp = requests.post(self.token_url, data=payload, timeout=30)

        if resp.status_code != 200:
            raise AuthError(
                f"OAuth2 token request failed ({resp.status_code}): {resp.text}"
            )

        data = resp.json()
        self._access_token = data["access_token"]
        expires_in = int(data.get("expires_in", 3600))
        self._token_expires_at = time.time() + expires_in

        # If a new refresh token is returned, update it
        if "refresh_token" in data:
            self.refresh_token = data["refresh_token"]

        LOGGER.info("OAuth2 token acquired, expires in %d seconds", expires_in)

    def _ensure_token(self):
        """Ensure we have a valid (non-expired) token."""
        # Refresh 60 seconds early to avoid edge-case expiry
        if self._access_token and time.time() < (self._token_expires_at - 60):
            return
        self._request_token()

    def apply(self, session, params):
        self._ensure_token()
        session.headers["Authorization"] = f"Bearer {self._access_token}"
        return params

    def force_refresh(self):
        """Force a token refresh on next request (e.g., after a 401)."""
        self._access_token = None
        self._token_expires_at = 0


def build_auth(config):
    """Factory: build the appropriate auth handler from config.

    Args:
        config: The tap config dict. Must contain "auth_method" key.

    Returns:
        An auth handler instance with an apply(session, params) method.
    """
    auth_method = config.get("auth_method", "no_auth")

    if auth_method == "no_auth":
        return NoAuth()
    elif auth_method == "api_key":
        return ApiKeyAuth(config)
    elif auth_method == "bearer_token":
        return BearerTokenAuth(config)
    elif auth_method == "basic":
        return BasicAuth(config)
    elif auth_method == "oauth2":
        return OAuth2Auth(config)
    else:
        raise ValueError(
            f"Unknown auth_method: '{auth_method}'. "
            f"Supported: no_auth, api_key, bearer_token, basic, oauth2"
        )
