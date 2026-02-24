"""Automatic JSON schema inference and denesting engine.

This module:
  1. Analyzes JSON response data to infer Singer-compatible JSON Schema
  2. Denests nested objects by flattening them with double-underscore separators
  3. Denests nested arrays into separate child streams/tables
  4. Handles mixed types, nulls, and deeply nested structures

Example denesting:
    Input record:
    {
        "id": 1,
        "name": "Acme Corp",
        "address": {
            "street": "123 Main St",
            "city": "Springfield",
            "geo": {"lat": 39.78, "lng": -89.65}
        },
        "tags": ["premium", "active"],
        "orders": [
            {"order_id": 100, "total": 250.00},
            {"order_id": 101, "total": 175.50}
        ]
    }

    Flattened parent record:
    {
        "id": 1,
        "name": "Acme Corp",
        "address__street": "123 Main St",
        "address__city": "Springfield",
        "address__geo__lat": 39.78,
        "address__geo__lng": -89.65,
        "tags": '["premium", "active"]'
    }

    Child stream "parent_orders":
    [
        {"_sdc_source_key_id": 1, "order_id": 100, "total": 250.00},
        {"_sdc_source_key_id": 1, "order_id": 101, "total": 175.50}
    ]
"""

import json
import logging
from collections import OrderedDict
from copy import deepcopy

LOGGER = logging.getLogger(__name__)

# Separator for flattened nested object keys
DENEST_SEPARATOR = "__"

# Maximum nesting depth to flatten (prevents infinite recursion)
MAX_DENEST_DEPTH = 10


# ----------------------------------------------------------------------
# Type inference
# ----------------------------------------------------------------------

def _infer_type(value):
    """Infer the JSON Schema type for a Python value.

    Returns a dict representing the JSON Schema type.
    """
    if value is None:
        return {"type": ["null", "string"]}
    elif isinstance(value, bool):
        return {"type": ["null", "boolean"]}
    elif isinstance(value, int):
        return {"type": ["null", "integer"]}
    elif isinstance(value, float):
        return {"type": ["null", "number"]}
    elif isinstance(value, str):
        # Check if it looks like a datetime
        if _looks_like_datetime(value):
            return {"type": ["null", "string"], "format": "date-time"}
        return {"type": ["null", "string"]}
    elif isinstance(value, dict):
        return {"type": ["null", "object"], "properties": {}}
    elif isinstance(value, list):
        return {"type": ["null", "array"], "items": {}}
    else:
        return {"type": ["null", "string"]}


def _looks_like_datetime(value):
    """Check if a string looks like an ISO 8601 datetime."""
    if not isinstance(value, str) or len(value) < 10:
        return False
    # Common datetime patterns
    # 2024-01-15T10:30:00Z, 2024-01-15T10:30:00.000Z,
    # 2024-01-15T10:30:00+00:00, 2024-01-15 10:30:00
    import re
    datetime_pattern = re.compile(
        r'^\d{4}-\d{2}-\d{2}'  # Date part
        r'[T ]\d{2}:\d{2}:\d{2}'  # Time part
        r'(\.\d+)?'  # Optional fractional seconds
        r'(Z|[+-]\d{2}:?\d{2})?$'  # Optional timezone
    )
    return bool(datetime_pattern.match(value))


def _merge_types(type_a, type_b):
    """Merge two JSON Schema type definitions into a compatible union.

    When two records have different types for the same field, we need
    to produce a schema that accepts both.
    """
    if not type_a:
        return type_b
    if not type_b:
        return type_a

    # Normalize to lists
    types_a = type_a.get("type", [])
    types_b = type_b.get("type", [])
    if isinstance(types_a, str):
        types_a = [types_a]
    if isinstance(types_b, str):
        types_b = [types_b]

    # Merge type arrays (deduplicated, preserving order)
    merged = list(OrderedDict.fromkeys(types_a + types_b))

    result = {"type": merged}

    # Preserve format if both have the same format
    if type_a.get("format") and type_a.get("format") == type_b.get("format"):
        result["format"] = type_a["format"]

    # Merge object properties recursively
    if "object" in merged:
        props_a = type_a.get("properties", {})
        props_b = type_b.get("properties", {})
        merged_props = dict(props_a)
        for key, val in props_b.items():
            if key in merged_props:
                merged_props[key] = _merge_types(merged_props[key], val)
            else:
                merged_props[key] = val
        if merged_props:
            result["properties"] = merged_props

    # Merge array items
    if "array" in merged:
        items_a = type_a.get("items", {})
        items_b = type_b.get("items", {})
        if items_a and items_b:
            result["items"] = _merge_types(items_a, items_b)
        elif items_a:
            result["items"] = items_a
        elif items_b:
            result["items"] = items_b

    return result


# ----------------------------------------------------------------------
# Schema inference from records
# ----------------------------------------------------------------------

def infer_schema_from_records(records, max_records=500):
    """Infer a JSON Schema from a list of sample records.

    Scans up to max_records records and builds a schema that
    accommodates all observed field types.

    Args:
        records: List of record dicts.
        max_records: Maximum number of records to analyze.

    Returns:
        A dict representing a JSON Schema for the records.
    """
    schema = {
        "type": ["null", "object"],
        "properties": {},
    }

    count = 0
    for record in records:
        if count >= max_records:
            break
        if not isinstance(record, dict):
            continue
        _observe_record(schema["properties"], record)
        count += 1

    LOGGER.info("Schema inferred from %d sample records, %d properties found",
                count, len(schema["properties"]))

    return schema


def _observe_record(properties, record, depth=0):
    """Recursively observe a record and update the schema properties."""
    if depth > MAX_DENEST_DEPTH:
        return

    for key, value in record.items():
        inferred = _infer_type(value)

        if key in properties:
            properties[key] = _merge_types(properties[key], inferred)
        else:
            properties[key] = inferred

        # Recurse into nested objects
        if isinstance(value, dict) and "properties" in properties.get(key, {}):
            _observe_record(properties[key]["properties"], value, depth + 1)

        # Recurse into array items
        if isinstance(value, list) and value:
            items_schema = properties[key].get("items", {})
            for item in value[:10]:  # Sample first 10 items
                if isinstance(item, dict):
                    if "properties" not in items_schema:
                        items_schema["properties"] = {}
                    items_schema["type"] = ["null", "object"]
                    _observe_record(items_schema["properties"], item, depth + 1)
                else:
                    item_type = _infer_type(item)
                    items_schema = _merge_types(items_schema, item_type)
            properties[key]["items"] = items_schema


# ----------------------------------------------------------------------
# Denesting / Flattening
# ----------------------------------------------------------------------

def identify_child_streams(schema, stream_name, key_properties):
    """Identify nested arrays of objects that should become child streams.

    Returns a dict of:
        {
            "child_stream_name": {
                "parent_stream": "parent_name",
                "array_key": "original_field_name",
                "schema": {...},
                "key_properties": [...]
            }
        }
    """
    child_streams = {}
    properties = schema.get("properties", {})

    for field_name, field_schema in properties.items():
        field_types = field_schema.get("type", [])
        if isinstance(field_types, str):
            field_types = [field_types]

        if "array" not in field_types:
            continue

        items = field_schema.get("items", {})
        items_types = items.get("type", [])
        if isinstance(items_types, str):
            items_types = [items_types]

        # Only denest arrays of objects
        if "object" not in items_types:
            continue

        if not items.get("properties"):
            continue

        child_name = f"{stream_name}__{field_name}"

        # Build child schema: parent FK fields + array item fields
        child_properties = OrderedDict()

        # Add foreign key references to parent
        for pk in key_properties:
            parent_pk_schema = properties.get(pk, {"type": ["null", "string"]})
            child_properties[f"_sdc_source_key_{pk}"] = deepcopy(parent_pk_schema)

        # Add a sequence index
        child_properties["_sdc_sequence"] = {"type": ["null", "integer"]}

        # Add the item's own properties (flattened)
        item_props = items.get("properties", {})
        for item_key, item_schema in item_props.items():
            child_properties[item_key] = deepcopy(item_schema)

        child_key_props = [f"_sdc_source_key_{pk}" for pk in key_properties]
        child_key_props.append("_sdc_sequence")

        child_schema = {
            "type": ["null", "object"],
            "properties": child_properties,
        }

        child_streams[child_name] = {
            "parent_stream": stream_name,
            "array_key": field_name,
            "schema": child_schema,
            "key_properties": child_key_props,
        }

        LOGGER.info("Identified child stream: %s (from %s.%s, %d properties)",
                     child_name, stream_name, field_name,
                     len(item_props))

    return child_streams


def flatten_record(record, parent_key="", separator=DENEST_SEPARATOR, depth=0):
    """Flatten a nested dict by joining keys with separator.

    Nested objects are flattened:
        {"address": {"city": "NY"}} -> {"address__city": "NY"}

    Arrays of scalars are JSON-serialized:
        {"tags": ["a", "b"]} -> {"tags": '["a", "b"]'}

    Arrays of objects are SKIPPED (handled as child streams):
        {"orders": [{"id": 1}]} -> {} (removed from parent)

    Args:
        record: The record dict to flatten.
        parent_key: Prefix for nested keys (used in recursion).
        separator: Separator between parent and child key names.
        depth: Current recursion depth.

    Returns:
        A flattened dict.
    """
    items = {}

    if depth > MAX_DENEST_DEPTH:
        return items

    for key, value in record.items():
        new_key = f"{parent_key}{separator}{key}" if parent_key else key

        if isinstance(value, dict):
            # Recurse into nested objects
            nested = flatten_record(value, new_key, separator, depth + 1)
            items.update(nested)
        elif isinstance(value, list):
            if value and isinstance(value[0], dict):
                # Skip arrays of objects -- they become child streams
                continue
            else:
                # Arrays of scalars: JSON-serialize
                items[new_key] = json.dumps(value) if value else None
        else:
            items[new_key] = value

    return items


def flatten_schema(schema, parent_key="", separator=DENEST_SEPARATOR, depth=0):
    """Flatten a JSON Schema to match flattened records.

    Mirrors the logic of flatten_record but operates on the schema.
    Object properties are flattened. Array-of-object properties are removed
    (they become child streams). Array-of-scalar properties become strings.

    Returns:
        A new flattened schema dict.
    """
    flat_properties = OrderedDict()

    if depth > MAX_DENEST_DEPTH:
        return flat_properties

    properties = schema.get("properties", {})

    for key, field_schema in properties.items():
        new_key = f"{parent_key}{separator}{key}" if parent_key else key
        field_types = field_schema.get("type", [])
        if isinstance(field_types, str):
            field_types = [field_types]

        if "object" in field_types and "properties" in field_schema:
            # Recurse into nested objects
            nested = flatten_schema(field_schema, new_key, separator, depth + 1)
            flat_properties.update(nested)
        elif "array" in field_types:
            items = field_schema.get("items", {})
            items_types = items.get("type", [])
            if isinstance(items_types, str):
                items_types = [items_types]
            if "object" in items_types and items.get("properties"):
                # Array of objects: skip (becomes child stream)
                continue
            else:
                # Array of scalars: becomes a JSON string
                flat_properties[new_key] = {"type": ["null", "string"]}
        else:
            flat_properties[new_key] = deepcopy(field_schema)

    return flat_properties


def build_flat_schema(raw_schema, stream_name, key_properties):
    """Build a flattened schema for a stream.

    Returns:
        (flat_schema, child_streams)

        flat_schema: The flattened JSON Schema for the parent stream.
        child_streams: Dict of child stream definitions (from array denesting).
    """
    # Identify child streams before flattening
    child_streams = identify_child_streams(raw_schema, stream_name, key_properties)

    # Flatten the schema
    flat_props = flatten_schema(raw_schema)

    flat_schema = {
        "type": ["null", "object"],
        "properties": dict(flat_props),
    }

    return flat_schema, child_streams


def extract_child_records(record, child_stream_config, key_properties):
    """Extract child records from a parent record's nested array.

    Args:
        record: The original (un-flattened) parent record.
        child_stream_config: Child stream config dict from identify_child_streams.
        key_properties: Parent stream key properties.

    Returns:
        A list of child records (flattened, with parent FK columns).
    """
    array_key = child_stream_config["array_key"]
    items = record.get(array_key, [])

    if not items or not isinstance(items, list):
        return []

    child_records = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue

        child_record = OrderedDict()

        # Add parent foreign keys
        for pk in key_properties:
            child_record[f"_sdc_source_key_{pk}"] = record.get(pk)

        # Add sequence number
        child_record["_sdc_sequence"] = idx

        # Flatten the child item
        flat_item = flatten_record(item)
        child_record.update(flat_item)

        child_records.append(child_record)

    return child_records
