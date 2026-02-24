"""Record extraction from API responses.

Handles extracting the actual record data from various API response
structures using JSONPath or auto-detection.

API responses come in many shapes:
  - Direct array: [{"id": 1}, {"id": 2}]
  - Wrapped: {"data": [{"id": 1}]}
  - Nested: {"response": {"results": [{"id": 1}]}}
  - OData: {"value": [{"id": 1}], "@odata.nextLink": "..."}
  - Envelope: {"status": "ok", "items": [...], "total": 100}
"""

import logging

from jsonpath_ng import parse as jsonpath_parse

LOGGER = logging.getLogger(__name__)

# Common wrapper keys (in priority order) for auto-detection
COMMON_RECORD_KEYS = [
    "data",
    "results",
    "items",
    "records",
    "value",       # OData
    "entries",
    "objects",
    "rows",
    "content",
    "hits",
    "documents",
    "list",
    "response",
    "payload",
]


def extract_records(response_data, records_path=None):
    """Extract record list from an API response.

    Args:
        response_data: The parsed JSON response (dict or list).
        records_path: Optional JSONPath expression to locate records
                      (e.g., "$.data[*]", "$.results", "$.response.items").

    Returns:
        A list of record dicts.
    """
    if response_data is None:
        return []

    # If the response is already a list, return it directly
    if isinstance(response_data, list):
        return [r for r in response_data if isinstance(r, dict)]

    # If a JSONPath is specified, use it
    if records_path:
        return _extract_jsonpath(response_data, records_path)

    # Auto-detect: look for common wrapper keys
    if isinstance(response_data, dict):
        return _auto_detect_records(response_data)

    return []


def _extract_jsonpath(data, expression):
    """Extract records using a JSONPath expression.

    Supports both "$.data[*]" style (returns individual items)
    and "$.data" style (returns the array itself).
    """
    try:
        matches = jsonpath_parse(expression).find(data)
        if not matches:
            LOGGER.warning("JSONPath '%s' matched nothing in response", expression)
            return []

        results = []
        for match in matches:
            value = match.value
            if isinstance(value, list):
                results.extend([r for r in value if isinstance(r, dict)])
            elif isinstance(value, dict):
                results.append(value)

        return results

    except Exception as e:
        LOGGER.error("JSONPath extraction failed for '%s': %s", expression, e)
        return []


def _auto_detect_records(data):
    """Auto-detect where records are in a response dict.

    Tries common wrapper keys, then falls back to the largest
    list value in the dict.
    """
    # Try common keys
    for key in COMMON_RECORD_KEYS:
        if key in data:
            value = data[key]
            if isinstance(value, list):
                records = [r for r in value if isinstance(r, dict)]
                if records:
                    LOGGER.debug("Auto-detected records at key '%s' (%d records)",
                                 key, len(records))
                    return records
            elif isinstance(value, dict):
                # Try one level deeper (e.g., {"response": {"items": [...]}})
                for sub_key in COMMON_RECORD_KEYS:
                    if sub_key in value and isinstance(value[sub_key], list):
                        records = [r for r in value[sub_key] if isinstance(r, dict)]
                        if records:
                            LOGGER.debug("Auto-detected records at '%s.%s' (%d records)",
                                         key, sub_key, len(records))
                            return records

    # Fallback: find the largest list of dicts in the response
    best_key = None
    best_count = 0
    for key, value in data.items():
        if isinstance(value, list):
            dict_count = sum(1 for item in value if isinstance(item, dict))
            if dict_count > best_count:
                best_count = dict_count
                best_key = key

    if best_key and best_count > 0:
        LOGGER.debug("Fallback: using key '%s' with %d dict records", best_key, best_count)
        return [r for r in data[best_key] if isinstance(r, dict)]

    # Last resort: treat the entire response as a single record
    LOGGER.debug("No record array found; treating response as single record")
    return [data]
