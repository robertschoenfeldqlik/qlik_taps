"""HTTP client for Dynamics 365 Finance & Operations OData API.

Handles OAuth 2.0 client credentials authentication, token refresh,
OData pagination via @odata.nextLink, and retry with backoff.
"""

import math
import re
import time
from email.utils import parsedate_to_datetime

import backoff
import requests
import singer

LOGGER = singer.get_logger()

TOKEN_URL_TEMPLATE = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
API_PATH = "/data"

# OData max page size supported by D365 F&O
MAX_PAGE_SIZE = 10000


class Dynamics365AuthError(Exception):
    """Authentication failure."""


class Dynamics365RateLimitError(Exception):
    """HTTP 429 - Too Many Requests."""


class Dynamics365ServerError(Exception):
    """HTTP 5xx server-side error."""


class Dynamics365ClientError(Exception):
    """HTTP 4xx client-side error (non-auth, non-rate-limit)."""


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
        target_time = parsedate_to_datetime(retry_after_str)
        wait = (target_time - __import__('datetime').datetime.now(
            tz=target_time.tzinfo
        )).total_seconds()
        return max(1, math.floor(wait))
    except (ValueError, TypeError, OverflowError):
        pass

    LOGGER.warning("Could not parse Retry-After value '%s', using default %ds",
                   retry_after_str, default)
    return default


def _log_backoff(details):
    LOGGER.warning(
        "Backing off %.1f seconds after %d tries",
        details["wait"],
        details["tries"],
    )


class DynamicsClient:
    """OData client for D365 Finance & Operations."""

    def __init__(self, config):
        # Validate required config keys
        for key in ("environment_url", "tenant_id", "client_id", "client_secret"):
            if not config.get(key):
                raise ValueError(f"Missing required config key: '{key}'")

        self.config = config
        self.environment_url = config["environment_url"].rstrip("/")
        self.tenant_id = config["tenant_id"]
        self.client_id = config["client_id"]
        self.client_secret = config["client_secret"]
        self.user_agent = config.get("user_agent", "tap-dynamics365-erp")

        # Optional: custom OAuth token URL (for mock testing)
        self.oauth_token_url = config.get("oauth_token_url")

        # Validate environment URL format
        if not re.match(r'^https?://', self.environment_url):
            raise ValueError(
                f"environment_url must start with http:// or https://, "
                f"got: '{self.environment_url}'"
            )

        # Validate tenant_id looks like a GUID or domain
        if not re.match(r'^[a-zA-Z0-9._-]+$', self.tenant_id):
            raise ValueError(
                f"tenant_id contains invalid characters: '{self.tenant_id}'"
            )

        self._session = requests.Session()
        self._access_token = None
        self._token_expires_at = 0

        self.base_url = f"{self.environment_url}{API_PATH}"

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------

    def _ensure_access_token(self):
        """Obtain or refresh the OAuth 2.0 access token."""
        # Refresh 30 seconds early to avoid edge-case expiry
        if self._access_token and time.time() < (self._token_expires_at - 30):
            return

        # Use custom token URL if provided (e.g., for mock API testing),
        # otherwise use the standard Azure AD token endpoint
        if self.oauth_token_url:
            token_url = self.oauth_token_url.format(tenant_id=self.tenant_id)
        else:
            token_url = TOKEN_URL_TEMPLATE.format(tenant_id=self.tenant_id)

        payload = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scope": f"{self.environment_url}/.default",
        }

        resp = requests.post(token_url, data=payload, timeout=30)
        if resp.status_code != 200:
            raise Dynamics365AuthError(
                f"Token request failed ({resp.status_code}): {resp.text}"
            )

        data = resp.json()
        self._access_token = data["access_token"]
        self._token_expires_at = time.time() + int(data.get("expires_in", 3600))
        LOGGER.info("OAuth token acquired, expires in %s seconds", data.get("expires_in"))

    def _get_headers(self):
        self._ensure_access_token()
        return {
            "Authorization": f"Bearer {self._access_token}",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
            "Accept": "application/json",
            "Prefer": f"odata.maxpagesize={MAX_PAGE_SIZE}",
            "User-Agent": self.user_agent,
        }

    # ------------------------------------------------------------------
    # Request helpers
    # ------------------------------------------------------------------

    @backoff.on_exception(
        backoff.expo,
        Dynamics365ServerError,
        max_tries=5,
        on_backoff=_log_backoff,
    )
    @backoff.on_exception(
        backoff.expo,
        Dynamics365RateLimitError,
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
    def _make_request(self, url, params=None):
        """Execute a GET request with retry logic."""
        headers = self._get_headers()
        resp = self._session.get(url, headers=headers, params=params, timeout=120)

        if resp.status_code == 429:
            wait = _parse_retry_after(resp.headers.get("Retry-After"))
            LOGGER.warning("Rate limited (429). Waiting %s seconds", wait)
            time.sleep(wait)
            raise Dynamics365RateLimitError(f"429: {resp.text}")

        if resp.status_code == 401:
            # Force token refresh and retry once
            self._access_token = None
            self._ensure_access_token()
            headers = self._get_headers()
            resp = self._session.get(url, headers=headers, params=params, timeout=120)
            if resp.status_code == 401:
                raise Dynamics365AuthError(f"Authentication failed: {resp.text}")

        if 500 <= resp.status_code < 600:
            raise Dynamics365ServerError(
                f"Server error {resp.status_code}: {resp.text[:500]}"
            )

        if 400 <= resp.status_code < 500:
            raise Dynamics365ClientError(
                f"Client error {resp.status_code}: {resp.text[:500]}"
            )

        try:
            return resp.json()
        except ValueError:
            content_type = resp.headers.get("Content-Type", "")
            raise Dynamics365ClientError(
                f"Expected JSON response but got {content_type}. "
                f"Status: {resp.status_code}. Body preview: {resp.text[:200]}"
            )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_entity(self, entity_set_name, params=None):
        """Fetch a single page from an entity set."""
        url = f"{self.base_url}/{entity_set_name}"
        return self._make_request(url, params=params)

    def get_all_records(self, entity_set_name, params=None):
        """Yield all records from an entity set, following @odata.nextLink."""
        url = f"{self.base_url}/{entity_set_name}"
        while url:
            data = self._make_request(url, params=params)
            records = data.get("value", [])
            yield from records

            # After first page, params are encoded in nextLink
            url = data.get("@odata.nextLink")
            params = None

    def get_records_with_filter(self, entity_set_name, odata_filter, select=None, orderby=None):
        """Fetch records with an OData $filter, following pagination."""
        params = {"$filter": odata_filter}
        if select:
            params["$select"] = select
        if orderby:
            params["$orderby"] = orderby
        yield from self.get_all_records(entity_set_name, params=params)

    def get_metadata_entity_sets(self):
        """Fetch the OData service document listing all entity sets."""
        url = self.base_url
        data = self._make_request(url)
        return data.get("value", [])
