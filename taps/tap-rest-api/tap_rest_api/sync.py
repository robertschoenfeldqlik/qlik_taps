"""Sync logic for the generic REST API tap.

Supports:
  - FULL_TABLE: Fetches all records every run
  - INCREMENTAL: Uses a bookmark (replication key) to only fetch new/updated records

Handles parent and child streams (denested arrays), state management,
and configurable pagination.
"""

from urllib.parse import quote as url_quote

import singer
from singer import Transformer, metadata, bookmarks

from tap_rest_api.client import RestClient
from tap_rest_api.pagination import get_paginator
from tap_rest_api.record_extractor import extract_records
from tap_rest_api.schema_inference import (
    flatten_record,
    extract_child_records,
    identify_child_streams,
    infer_schema_from_records,
    build_flat_schema,
)

LOGGER = singer.get_logger()


def _compare_replication_values(value_a, value_b):
    """Compare two replication key values correctly.

    Attempts datetime parsing first (handles ISO 8601 formats),
    then numeric comparison, falling back to string comparison.
    Returns True if value_a > value_b.
    """
    if value_a is None:
        return False
    if value_b is None:
        return True

    str_a, str_b = str(value_a), str(value_b)

    # Try datetime comparison
    try:
        from dateutil.parser import parse as parse_dt
        dt_a = parse_dt(str_a)
        dt_b = parse_dt(str_b)
        return dt_a > dt_b
    except (ValueError, TypeError, ImportError):
        pass

    # Try numeric comparison
    try:
        return float(str_a) > float(str_b)
    except (ValueError, TypeError):
        pass

    # Fallback to string comparison
    return str_a > str_b


def _get_selected_streams(catalog):
    """Return list of CatalogEntry objects that the user has selected."""
    selected = []
    for entry in catalog.streams:
        mdata = metadata.to_map(entry.metadata)
        # A stream is selected if metadata has selected=True at the top level
        if metadata.get(mdata, (), "selected"):
            selected.append(entry)
    return selected


def _find_stream_config(config, stream_name):
    """Find the stream config dict by stream name.

    Handles both parent and child streams (child names are "parent__field").
    """
    streams = config.get("streams", [])

    # Direct match
    for sc in streams:
        if sc["name"] == stream_name:
            return sc

    # Child stream: parent__field -> find parent config
    if "__" in stream_name:
        parent_name = stream_name.split("__")[0]
        for sc in streams:
            if sc["name"] == parent_name:
                return sc

    return None


def _build_stream_url(config, stream_config):
    """Build the full URL for a stream endpoint."""
    base_url = config["api_url"].rstrip("/")
    path = stream_config.get("path", "")
    if path.startswith("http"):
        return path
    return f"{base_url}/{path.lstrip('/')}" if path else base_url


def _build_request_params(stream_config, bookmark_value=None):
    """Build request parameters, injecting bookmark filter if needed."""
    params = dict(stream_config.get("params", {}))

    # If there's a bookmark and a filter template, apply it
    replication_key = stream_config.get("replication_key")
    if bookmark_value and replication_key:
        filter_template = stream_config.get("bookmark_filter")
        if filter_template:
            # Template-based filter: e.g. "updated_at>{bookmark}"
            # URL-encode the bookmark value to prevent injection
            safe_bookmark = url_quote(str(bookmark_value), safe='')
            filter_value = filter_template.replace("{bookmark}", safe_bookmark)
            # Check if there's a filter param name configured
            filter_param = stream_config.get("bookmark_filter_param")
            if filter_param:
                params[filter_param] = filter_value
            else:
                # Try to parse as key=value or key>value
                for op in [">=", ">", "=", "gte:", "gt:"]:
                    if op in filter_value:
                        parts = filter_value.split(op, 1)
                        params[parts[0].strip()] = op + parts[1].strip() if op in (">", ">=") else parts[1].strip()
                        break
                else:
                    # Fallback: use the replication key as param
                    params[replication_key] = bookmark_value

        else:
            # Default: pass replication key as URL param
            # Many APIs support ?updated_since=<datetime> or similar
            param_name = stream_config.get("bookmark_param", replication_key)
            params[param_name] = bookmark_value

    return params


def _sync_parent_stream(client, config, state, stream_name, stream_config,
                         schema, mdata_map, key_properties, child_streams_config):
    """Sync a parent stream and its child streams."""
    replication_key = stream_config.get("replication_key")
    replication_method = stream_config.get("replication_method", "FULL_TABLE")
    records_path = stream_config.get("records_path")
    pagination_style = stream_config.get("pagination_style", "none")
    should_denest = stream_config.get("denest", True)

    url = _build_stream_url(config, stream_config)

    # Get bookmark for incremental
    bookmark_value = None
    if replication_method == "INCREMENTAL" and replication_key:
        bookmark_value = bookmarks.get_bookmark(state, stream_name, replication_key)
        if not bookmark_value:
            bookmark_value = config.get("start_date")

        if bookmark_value:
            LOGGER.info("INCREMENTAL sync for '%s' since %s=%s",
                        stream_name, replication_key, bookmark_value)
        else:
            LOGGER.info("INCREMENTAL sync for '%s' - no bookmark, fetching all",
                        stream_name)
    else:
        LOGGER.info("FULL_TABLE sync for '%s'", stream_name)

    # Build request params (with bookmark injection)
    params = _build_request_params(stream_config, bookmark_value)

    # Per-stream headers
    stream_headers = stream_config.get("headers")

    # Get paginator
    paginator = get_paginator(pagination_style)

    record_count = 0
    child_record_counts = {name: 0 for name in child_streams_config}
    max_replication_value = bookmark_value
    extraction_time = singer.utils.now()

    # Write schemas for child streams
    for child_name, child_config in child_streams_config.items():
        singer.write_schema(
            child_name,
            child_config["schema"],
            key_properties=child_config["key_properties"],
        )

    with Transformer() as transformer:
        for page_data in paginator(client, url, params, stream_config):
            raw_records = extract_records(page_data, records_path)

            for record in raw_records:
                # Flatten the record for the parent stream
                if should_denest:
                    flat_record = flatten_record(record)
                else:
                    flat_record = record

                # Write parent record
                try:
                    transformed = transformer.transform(flat_record, schema, mdata_map)
                except Exception as e:
                    LOGGER.warning("Transform error on record in '%s': %s. Writing raw.",
                                   stream_name, e)
                    transformed = flat_record

                singer.write_record(
                    stream_name, transformed, time_extracted=extraction_time
                )
                record_count += 1

                # Extract and write child records
                for child_name, child_config in child_streams_config.items():
                    child_records = extract_child_records(
                        record, child_config, key_properties
                    )
                    for child_record in child_records:
                        try:
                            child_transformed = transformer.transform(
                                child_record, child_config["schema"],
                                metadata.to_map(
                                    metadata.to_list(metadata.new())
                                )
                            )
                        except Exception:
                            child_transformed = child_record

                        singer.write_record(
                            child_name, child_transformed,
                            time_extracted=extraction_time
                        )
                        child_record_counts[child_name] = (
                            child_record_counts.get(child_name, 0) + 1
                        )

                # Track max replication key value
                if replication_key:
                    rep_value = flat_record.get(replication_key) or record.get(replication_key)
                    if rep_value:
                        if _compare_replication_values(rep_value, max_replication_value):
                            max_replication_value = str(rep_value)

                # Log progress every 10,000 records
                if record_count % 10000 == 0:
                    LOGGER.info("%s: Synced %d records so far...", stream_name, record_count)
                    # Write intermediate state for crash recovery
                    if max_replication_value and replication_key:
                        state = bookmarks.write_bookmark(
                            state, stream_name, replication_key, max_replication_value
                        )
                        singer.write_state(state)

    # Write final bookmark
    if replication_key and max_replication_value:
        state = bookmarks.write_bookmark(
            state, stream_name, replication_key, max_replication_value
        )

    LOGGER.info("%s: Completed. Total records: %d", stream_name, record_count)
    for child_name, child_count in child_record_counts.items():
        if child_count > 0:
            LOGGER.info("  Child %s: %d records", child_name, child_count)

    return state, record_count


def sync(config, state, catalog):
    """Main sync entry point.

    Iterates over selected streams in the catalog and syncs each one.
    Handles parent-child relationships from denesting.

    Args:
        config: Tap configuration dict.
        state: Current state dict (bookmarks).
        catalog: Singer Catalog object.

    Returns:
        Updated state dict.
    """
    client = RestClient(config)
    selected_streams = _get_selected_streams(catalog)

    if not selected_streams:
        LOGGER.warning("No streams selected. Exiting sync.")
        return state

    LOGGER.info("Starting sync for %d selected stream(s)", len(selected_streams))

    # Build a set of all selected stream names
    selected_names = {entry.tap_stream_id for entry in selected_streams}

    # Identify parent streams (not child streams)
    parent_streams = []
    child_stream_names = set()
    for entry in selected_streams:
        name = entry.tap_stream_id
        if "__" in name:
            # This is a child stream -- it will be synced with its parent
            child_stream_names.add(name)
        else:
            parent_streams.append(entry)

    # Sync each parent stream
    for entry in parent_streams:
        stream_name = entry.tap_stream_id
        stream_config = _find_stream_config(config, stream_name)

        if not stream_config:
            LOGGER.warning("No config found for stream '%s', skipping", stream_name)
            continue

        schema = entry.schema.to_dict() if hasattr(entry.schema, "to_dict") else entry.schema
        mdata_map = metadata.to_map(entry.metadata)
        key_properties = stream_config.get("primary_keys", [])
        replication_key = stream_config.get("replication_key")
        replication_method = stream_config.get("replication_method", "FULL_TABLE")

        if replication_key and replication_method == "FULL_TABLE":
            LOGGER.warning(
                "Stream '%s' has replication_key '%s' with FULL_TABLE — "
                "set replication_method to INCREMENTAL to use incremental sync.",
                stream_name, replication_key
            )

        # Mark stream as currently syncing
        state = singer.set_currently_syncing(state, stream_name)
        singer.write_state(state)

        # Write parent schema
        singer.write_schema(
            stream_name,
            schema,
            key_properties=key_properties,
            replication_key=replication_key,
        )

        # Find selected child streams for this parent
        child_streams_config = {}
        for child_entry in selected_streams:
            child_name = child_entry.tap_stream_id
            if child_name.startswith(f"{stream_name}__") and child_name in selected_names:
                child_schema = (
                    child_entry.schema.to_dict()
                    if hasattr(child_entry.schema, "to_dict")
                    else child_entry.schema
                )
                # Extract the array field name from "parent__field"
                array_key = child_name[len(stream_name) + 2:]
                child_key_props = (
                    child_entry.key_properties
                    if hasattr(child_entry, "key_properties") and child_entry.key_properties
                    else [f"_sdc_source_key_{pk}" for pk in key_properties] + ["_sdc_sequence"]
                )

                child_streams_config[child_name] = {
                    "parent_stream": stream_name,
                    "array_key": array_key,
                    "schema": child_schema,
                    "key_properties": child_key_props,
                }

        # Sync the stream
        state, _ = _sync_parent_stream(
            client, config, state, stream_name, stream_config,
            schema, mdata_map, key_properties, child_streams_config,
        )

        singer.write_state(state)

    # Clear currently syncing
    state = singer.set_currently_syncing(state, None)
    singer.write_state(state)

    LOGGER.info("Sync complete.")
    return state
