"""Pagination strategies for the generic REST API tap.

Supported strategies:
  - none:         No pagination -- single request
  - page:         Page-number based (?page=1&per_page=100)
  - offset:       Offset/limit based (?offset=0&limit=100)
  - cursor:       Cursor/token based (next_token in response body)
  - link_header:  RFC 5988 Link header (rel="next")
  - jsonpath:     Next page URL/token extracted via JSONPath from response body
  - odata:        OData @odata.nextLink pagination

Each paginator is a generator that yields the full JSON response body
for each page.
"""

import logging

from jsonpath_ng import parse as jsonpath_parse

LOGGER = logging.getLogger(__name__)

# Safety guard: maximum number of pages to fetch before stopping.
# Prevents infinite loops from misconfigured APIs or extraction bugs.
MAX_PAGES = 10000


def _extract_jsonpath(data, expression):
    """Extract a value from a dict using a JSONPath expression.

    Returns the first match or None.
    """
    try:
        matches = jsonpath_parse(expression).find(data)
        if matches:
            return matches[0].value
    except Exception as e:
        LOGGER.debug("JSONPath extraction failed for '%s': %s", expression, e)
    return None


def paginate_none(client, url, params, stream_config):
    """Single request, no pagination."""
    data = client.request_json(url, params=params)
    yield data


def paginate_page(client, url, params, stream_config):
    """Page-number based pagination.

    Stream config keys:
        pagination_page_param   - Query param name for page (default: "page")
        pagination_size_param   - Query param name for page size (default: "per_page")
        pagination_page_size    - Records per page (default: 100)
        pagination_start_page   - Starting page number (default: 1)
        pagination_total_path   - JSONPath to total count in response (optional)
    """
    page_param = stream_config.get("pagination_page_param", "page")
    size_param = stream_config.get("pagination_size_param", "per_page")
    page_size = stream_config.get("pagination_page_size", 100)
    page = stream_config.get("pagination_start_page", 1)
    total_path = stream_config.get("pagination_total_path")

    params = dict(params) if params else {}
    params[size_param] = page_size
    pages_fetched = 0

    while True:
        pages_fetched += 1
        if pages_fetched > MAX_PAGES:
            LOGGER.warning("page: Reached max page limit (%d). Stopping.", MAX_PAGES)
            break

        params[page_param] = page
        data = client.request_json(url, params=params)
        yield data

        # Determine if there are more pages
        records_path = stream_config.get("records_path")
        if records_path:
            records = _extract_jsonpath(data, records_path) or []
        elif isinstance(data, list):
            records = data
        elif isinstance(data, dict):
            # Try common keys
            for key in ("data", "results", "items", "records", "value", "entries"):
                if key in data and isinstance(data[key], list):
                    records = data[key]
                    break
            else:
                records = []
        else:
            records = []

        # Check if we've received fewer than page_size records
        if len(records) < page_size:
            break

        # Check total count if available
        if total_path:
            total = _extract_jsonpath(data, total_path)
            if total and page * page_size >= total:
                break

        page += 1


def paginate_offset(client, url, params, stream_config):
    """Offset/limit based pagination.

    Stream config keys:
        pagination_offset_param - Query param for offset (default: "offset")
        pagination_limit_param  - Query param for limit (default: "limit")
        pagination_page_size    - Records per page (default: 100)
    """
    offset_param = stream_config.get("pagination_offset_param", "offset")
    limit_param = stream_config.get("pagination_limit_param", "limit")
    page_size = stream_config.get("pagination_page_size", 100)

    params = dict(params) if params else {}
    params[limit_param] = page_size
    offset = 0
    pages_fetched = 0

    while True:
        pages_fetched += 1
        if pages_fetched > MAX_PAGES:
            LOGGER.warning("offset: Reached max page limit (%d). Stopping.", MAX_PAGES)
            break

        params[offset_param] = offset
        data = client.request_json(url, params=params)
        yield data

        records_path = stream_config.get("records_path")
        if records_path:
            records = _extract_jsonpath(data, records_path) or []
        elif isinstance(data, list):
            records = data
        elif isinstance(data, dict):
            for key in ("data", "results", "items", "records", "value", "entries"):
                if key in data and isinstance(data[key], list):
                    records = data[key]
                    break
            else:
                records = []
        else:
            records = []

        if len(records) < page_size:
            break

        offset += page_size


def paginate_cursor(client, url, params, stream_config):
    """Cursor/token based pagination.

    The cursor value is extracted from the response body and passed
    as a query parameter in the next request.

    Stream config keys:
        pagination_cursor_path  - JSONPath to cursor in response (default: "$.next_cursor")
        pagination_cursor_param - Query param name for cursor (default: "cursor")
    """
    cursor_path = stream_config.get("pagination_cursor_path", "$.next_cursor")
    cursor_param = stream_config.get("pagination_cursor_param", "cursor")

    params = dict(params) if params else {}
    pages_fetched = 0

    while True:
        pages_fetched += 1
        if pages_fetched > MAX_PAGES:
            LOGGER.warning("cursor: Reached max page limit (%d). Stopping.", MAX_PAGES)
            break

        data = client.request_json(url, params=params)
        yield data

        next_cursor = _extract_jsonpath(data, cursor_path)
        if not next_cursor:
            break

        params[cursor_param] = next_cursor


def paginate_link_header(client, url, params, stream_config):
    """RFC 5988 Link header pagination.

    Follows the 'next' link in the response headers.
    """
    pages_fetched = 0

    while True:
        pages_fetched += 1
        if pages_fetched > MAX_PAGES:
            LOGGER.warning("link_header: Reached max page limit (%d). Stopping.", MAX_PAGES)
            break

        resp = client.request_raw(url, params=params)
        data = resp.json()
        yield data

        # Follow the 'next' link from headers
        next_url = resp.links.get("next", {}).get("url")
        if not next_url:
            break

        url = next_url
        params = None  # params are encoded in the next URL


def paginate_jsonpath(client, url, params, stream_config):
    """JSONPath-based pagination.

    Extracts the next page URL or token from the response body using
    a JSONPath expression.

    Stream config keys:
        pagination_next_path    - JSONPath to next page URL/token
                                  (default: "$.next" or "$.paging.next")
        pagination_next_is_url  - If True, the value is a full URL (default: True)
                                  If False, it's a token passed as a param
        pagination_cursor_param - Query param name when next_is_url=False
    """
    next_path = stream_config.get("pagination_next_path", "$.next")
    next_is_url = stream_config.get("pagination_next_is_url", True)
    cursor_param = stream_config.get("pagination_cursor_param", "cursor")

    params = dict(params) if params else {}
    pages_fetched = 0

    while True:
        pages_fetched += 1
        if pages_fetched > MAX_PAGES:
            LOGGER.warning("jsonpath: Reached max page limit (%d). Stopping.", MAX_PAGES)
            break

        data = client.request_json(url, params=params)
        yield data

        next_value = _extract_jsonpath(data, next_path)
        if not next_value:
            break

        if next_is_url:
            url = next_value
            params = None  # Full URL includes params
        else:
            params[cursor_param] = next_value


def paginate_odata(client, url, params, stream_config):
    """OData @odata.nextLink pagination.

    Follows the @odata.nextLink URL in the response body.
    """
    pages_fetched = 0

    while True:
        pages_fetched += 1
        if pages_fetched > MAX_PAGES:
            LOGGER.warning("odata: Reached max page limit (%d). Stopping.", MAX_PAGES)
            break

        data = client.request_json(url, params=params)
        yield data

        next_link = data.get("@odata.nextLink")
        if not next_link:
            break

        url = next_link
        params = None  # nextLink contains all params


# Paginator registry
PAGINATORS = {
    "none": paginate_none,
    "page": paginate_page,
    "offset": paginate_offset,
    "cursor": paginate_cursor,
    "link_header": paginate_link_header,
    "jsonpath": paginate_jsonpath,
    "odata": paginate_odata,
}


def get_paginator(style):
    """Get a paginator function by name.

    Args:
        style: Pagination style name.

    Returns:
        A generator function(client, url, params, stream_config).
    """
    if style not in PAGINATORS:
        raise ValueError(
            f"Unknown pagination_style: '{style}'. "
            f"Supported: {', '.join(PAGINATORS.keys())}"
        )
    return PAGINATORS[style]
