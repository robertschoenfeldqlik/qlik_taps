"""Discovery mode for the generic REST API tap.

Discovery works by:
  1. Reading stream definitions from config
  2. Making sample API requests to each endpoint
  3. Inferring JSON schemas from the sample responses
  4. Flattening nested objects and identifying child streams
  5. Building a Singer Catalog with metadata

If a stream provides a static "schema" in config, that is used instead
of inference.
"""

import json
import logging

import singer
from singer.catalog import Catalog, CatalogEntry
from singer import metadata

from tap_rest_api.client import RestClient
from tap_rest_api.pagination import get_paginator
from tap_rest_api.record_extractor import extract_records
from tap_rest_api.schema_inference import (
    infer_schema_from_records,
    build_flat_schema,
)

LOGGER = singer.get_logger()


def _build_stream_url(config, stream_config):
    """Build the full URL for a stream endpoint."""
    base_url = config["api_url"].rstrip("/")
    path = stream_config.get("path", "")
    if path.startswith("http"):
        return path
    return f"{base_url}/{path.lstrip('/')}" if path else base_url


def _fetch_sample_records(client, config, stream_config, max_sample=200):
    """Fetch sample records from an API endpoint for schema inference.

    Fetches up to max_sample records (possibly across multiple pages).
    """
    url = _build_stream_url(config, stream_config)
    params = dict(stream_config.get("params", {}))
    records_path = stream_config.get("records_path")
    pagination_style = stream_config.get("pagination_style", "none")

    # For discovery, we only need a small sample
    # Override page size to be small
    sample_params = dict(params)
    page_size_param = stream_config.get("pagination_size_param", "per_page")
    sample_page_size = min(stream_config.get("pagination_page_size", 100), max_sample)
    if pagination_style in ("page", "offset"):
        sample_params[page_size_param] = sample_page_size

    paginator = get_paginator(pagination_style)
    records = []

    for page_data in paginator(client, url, sample_params, stream_config):
        page_records = extract_records(page_data, records_path)
        records.extend(page_records)
        if len(records) >= max_sample:
            break

    LOGGER.info("Fetched %d sample records for stream '%s'",
                len(records), stream_config["name"])
    return records[:max_sample]


def _build_catalog_entry(stream_name, flat_schema, key_properties,
                          replication_key, replication_method):
    """Build a CatalogEntry with proper metadata."""
    mdata = metadata.new()

    # Stream-level metadata
    mdata = metadata.write(mdata, (), "table-key-properties", key_properties)
    mdata = metadata.write(mdata, (), "forced-replication-method", replication_method)

    if replication_key:
        mdata = metadata.write(mdata, (), "valid-replication-keys", [replication_key])

    # Field-level metadata
    for field_name in flat_schema.get("properties", {}).keys():
        breadcrumb = ("properties", field_name)

        if field_name in key_properties:
            mdata = metadata.write(mdata, breadcrumb, "inclusion", "automatic")
        elif field_name == replication_key:
            mdata = metadata.write(mdata, breadcrumb, "inclusion", "automatic")
        elif field_name.startswith("_sdc_"):
            mdata = metadata.write(mdata, breadcrumb, "inclusion", "automatic")
        else:
            mdata = metadata.write(mdata, breadcrumb, "inclusion", "available")
            mdata = metadata.write(mdata, breadcrumb, "selected-by-default", True)

    # Default to selected
    mdata = metadata.write(mdata, (), "selected", True)

    return CatalogEntry(
        tap_stream_id=stream_name,
        stream=stream_name,
        schema=flat_schema,
        key_properties=key_properties,
        metadata=metadata.to_list(mdata),
        replication_key=replication_key,
        replication_method=replication_method,
    )


def discover(config):
    """Run discovery mode.

    Reads stream definitions from config, fetches sample data,
    infers schemas, and builds a Singer Catalog.

    Config structure for streams:
    {
        "api_url": "https://api.example.com",
        "streams": [
            {
                "name": "users",
                "path": "/v1/users",
                "primary_keys": ["id"],
                "replication_key": "updated_at",      // optional
                "replication_method": "INCREMENTAL",   // or "FULL_TABLE"
                "records_path": "$.data",              // JSONPath, optional
                "params": {"status": "active"},        // extra URL params
                "headers": {"X-Custom": "value"},      // per-stream headers
                "pagination_style": "page",            // pagination type
                "schema": { ... },                     // optional static schema
                "denest": true                         // default true
            }
        ]
    }

    Returns:
        A Singer Catalog object.
    """
    client = RestClient(config)
    streams = config.get("streams", [])
    entries = []

    for stream_config in streams:
        stream_name = stream_config["name"]
        key_properties = stream_config.get("primary_keys", [])
        replication_key = stream_config.get("replication_key")
        replication_method = stream_config.get("replication_method", "FULL_TABLE")
        should_denest = stream_config.get("denest", True)

        if replication_key and replication_method == "FULL_TABLE":
            replication_method = "INCREMENTAL"

        LOGGER.info("Discovering stream: %s", stream_name)

        # Use static schema if provided, otherwise infer
        if "schema" in stream_config:
            raw_schema = stream_config["schema"]
            LOGGER.info("Using static schema for '%s'", stream_name)
        else:
            # Fetch sample records and infer schema
            try:
                sample_records = _fetch_sample_records(client, config, stream_config)
                if not sample_records:
                    LOGGER.warning(
                        "No sample records for '%s', creating empty schema", stream_name
                    )
                    raw_schema = {"type": ["null", "object"], "properties": {}}
                else:
                    raw_schema = infer_schema_from_records(sample_records)
            except Exception as e:
                LOGGER.error("Failed to discover stream '%s': %s", stream_name, e)
                raw_schema = {"type": ["null", "object"], "properties": {}}

        # Flatten/denest if enabled
        if should_denest:
            flat_schema, child_streams = build_flat_schema(
                raw_schema, stream_name, key_properties
            )
        else:
            flat_schema = raw_schema
            child_streams = {}

        # Build parent catalog entry
        parent_entry = _build_catalog_entry(
            stream_name, flat_schema, key_properties,
            replication_key, replication_method,
        )
        entries.append(parent_entry)

        # Build child stream catalog entries
        for child_name, child_config in child_streams.items():
            child_entry = _build_catalog_entry(
                child_name,
                child_config["schema"],
                child_config["key_properties"],
                replication_key=None,
                replication_method="FULL_TABLE",
            )
            entries.append(child_entry)
            LOGGER.info("Added child stream: %s", child_name)

    LOGGER.info("Discovery complete. %d total streams (including children).",
                len(entries))
    return Catalog(entries)
