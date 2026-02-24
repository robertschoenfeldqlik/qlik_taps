"""HTTP client for the generic REST API tap.

Handles:
  - Session management with configurable headers
  - Authentication (delegates to auth.py)
  - Retry with exponential backoff (429, 5xx, connection errors)
  - Configurable request timeout
  - Raw and paginated request methods
"""

import math
import time
from email.utils import parsedate_to_datetime

import backoff
import requests
import singer

from tap_rest_api.auth import build_auth, OAuth2Auth, AuthError

LOGGER = singer.get_logger()


def _parse_retry_after(retry_after_value, default=60):
    """Parse Retry-After header value (seconds or HTTP-date format).

    Handles both numeric seconds ("120") and HTTP-date
    ("Wed, 21 Oct 2025 07:28:00 GMT") formats per RFC 7231 Section 7.1.3.
    """
    if not retry_after_value:
        return default

    retry_after_str = str(retry_after_value).strip()

    # Try numeric seconds first
    try:
        return max(1, math.floor(float(retry_after_str)))
    except (ValueError, TypeError):
        pass

    # Try HTTP-date format
    try:
        import datetime
        target_time = parsedate_to_datetime(retry_after_str)
        wait = (target_time - datetime.datetime.now(
            tz=target_time.tzinfo
        )).total_seconds()
        return max(1, math.floor(wait))
    except (ValueError, TypeError, OverflowError):
        pass

    LOGGER.warning("Could not parse Retry-After value '%s', using default %ds",
                   retry_after_str, default)
    return default


class RestApiError(Exception):
    """Base error for REST API requests."""


class RateLimitError(RestApiError):
    """HTTP 429 - Too Many Requests."""


class ServerError(RestApiError):
    """HTTP 5xx server-side error."""


class ClientError(RestApiError):
    """HTTP 4xx client-side error (non-auth, non-rate-limit)."""


def _log_backoff(details):
    LOGGER.warning(
        "Backing off %.1f seconds after %d tries calling %s",
        details["wait"],
        details["tries"],
        details.get("args", [""])[0] if details.get("args") else "",
    )


class RestClient:
    """Generic REST API client with auth, retries, and pagination support."""

    def __init__(self, config):
        self.config = config
        self.base_url = config["api_url"].rstrip("/")
        self.timeout = config.get("request_timeout", 300)
        self.user_agent = config.get("user_agent", "tap-rest-api/1.0")

        # Global headers from config
        self.global_headers = config.get("headers", {})

        # HTTP method (default GET)
        self.http_method = config.get("http_method", "GET").upper()

        # Build session
        self._session = requests.Session()
        self._session.headers.update({
            "Accept": "application/json",
            "User-Agent": self.user_agent,
        })
        if self.global_headers:
            self._session.headers.update(self.global_headers)

        # Build auth handler
        self.auth = build_auth(config)

        # Global URL params
        self.global_params = config.get("params", {})

    # ------------------------------------------------------------------
    # Core request with retry
    # ------------------------------------------------------------------

    @backoff.on_exception(
        backoff.expo,
        ServerError,
        max_tries=5,
        on_backoff=_log_backoff,
    )
    @backoff.on_exception(
        backoff.expo,
        RateLimitError,
        max_tries=7,
        on_backoff=_log_backoff,
        factor=2,
    )
    @backoff.on_exception(
        backoff.expo,
        (requests.ConnectionError, requests.Timeout),
        max_tries=5,
        on_backoff=_log_backoff,
    )
    def request(self, url, params=None, headers=None, method=None):
        """Execute an HTTP request with retry logic.

        Args:
            url: Full URL or path (relative to base_url).
            params: Query parameters dict.
            headers: Per-request headers (merged with session headers).
            method: HTTP method override (default: self.http_method).

        Returns:
            requests.Response object.

        Raises:
            RateLimitError: On 429 responses.
            ServerError: On 5xx responses.
            ClientError: On 4xx responses.
            AuthError: On 401 after token refresh attempt.
        """
        # Build full URL if a relative path was given
        if not url.startswith("http"):
            url = f"{self.base_url}/{url.lstrip('/')}"

        # Merge global params with per-request params
        merged_params = dict(self.global_params)
        if params:
            merged_params.update(params)

        # Apply auth (may add headers or params)
        merged_params = self.auth.apply(self._session, merged_params)

        # Per-request headers
        req_headers = dict(self._session.headers)
        if headers:
            req_headers.update(headers)

        method = method or self.http_method

        LOGGER.debug("REQUEST: %s %s params=%s", method, url, merged_params)

        if method == "POST":
            resp = self._session.post(
                url, json=merged_params, headers=req_headers, timeout=self.timeout
            )
        else:
            resp = self._session.get(
                url, params=merged_params, headers=req_headers, timeout=self.timeout
            )

        # Handle response status codes
        if resp.status_code == 429:
            wait = _parse_retry_after(resp.headers.get("Retry-After"))
            LOGGER.warning("Rate limited (429). Waiting %s seconds", wait)
            time.sleep(wait)
            raise RateLimitError(f"429: {resp.text[:500]}")

        if resp.status_code == 401:
            # Try token refresh for OAuth2
            if isinstance(self.auth, OAuth2Auth):
                LOGGER.warning("Got 401, attempting OAuth2 token refresh...")
                self.auth.force_refresh()
                self.auth.apply(self._session, merged_params)
                # Retry with the ORIGINAL method (not hardcoded GET)
                if method == "POST":
                    resp = self._session.post(
                        url, json=merged_params, headers=req_headers, timeout=self.timeout
                    )
                else:
                    resp = self._session.get(
                        url, params=merged_params, headers=req_headers, timeout=self.timeout
                    )
                if resp.status_code == 401:
                    raise AuthError(f"Authentication failed after refresh: {resp.text[:500]}")
            else:
                raise AuthError(f"Authentication failed (401): {resp.text[:500]}")

        if 500 <= resp.status_code < 600:
            raise ServerError(
                f"Server error {resp.status_code}: {resp.text[:500]}"
            )

        if 400 <= resp.status_code < 500:
            raise ClientError(
                f"Client error {resp.status_code}: {resp.text[:500]}"
            )

        return resp

    def request_json(self, url, params=None, headers=None, method=None):
        """Execute request and return parsed JSON."""
        resp = self.request(url, params=params, headers=headers, method=method)
        try:
            return resp.json()
        except ValueError:
            content_type = resp.headers.get("Content-Type", "")
            raise ClientError(
                f"Expected JSON response but got {content_type}. "
                f"Status: {resp.status_code}. Body preview: {resp.text[:200]}"
            )

    def request_raw(self, url, params=None, headers=None, method=None):
        """Execute request and return the raw Response object (for pagination)."""
        return self.request(url, params=params, headers=headers, method=method)
