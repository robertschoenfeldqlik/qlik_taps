"""Sync logic for Dynamics 365 Finance & Operations ERP tap.

Supports two replication strategies:
  - INCREMENTAL: Uses $filter on a replication_key (e.g. ModifiedDateTime)
    to only fetch records newer than the last bookmark.
  - FULL_TABLE: Fetches all records every run.
"""

import singer
from singer import Transformer, metadata, bookmarks
from dateutil.parser import parse as parse_dt

from tap_dynamics365_erp.client import DynamicsClient
from tap_dynamics365_erp.streams import STREAMS

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

    # Try datetime comparison (handles ISO 8601, OData datetime formats)
    try:
        dt_a = parse_dt(str_a)
        dt_b = parse_dt(str_b)
        return dt_a > dt_b
    except (ValueError, TypeError):
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


def _build_odata_params(stream_config):
    """Build base OData query parameters for a stream."""
    params = {}
    if stream_config.get("cross_company"):
        params["cross-company"] = "true"
    return params


def _sync_full_table(client, stream_name, stream_config, schema, mdata, transformer):
    """Sync all records for a FULL_TABLE stream."""
    entity_set = stream_config["entity_set_name"]
    params = _build_odata_params(stream_config)

    LOGGER.info("FULL_TABLE sync for %s (%s)", stream_name, entity_set)

    record_count = 0
    extraction_time = singer.utils.now()

    for record in client.get_all_records(entity_set, params=params):
        transformed = transformer.transform(record, schema, mdata)
        singer.write_record(stream_name, transformed, time_extracted=extraction_time)
        record_count += 1

        if record_count % 10000 == 0:
            LOGGER.info("%s: Synced %d records so far...", stream_name, record_count)

    LOGGER.info("%s: Completed. Total records: %d", stream_name, record_count)
    return record_count


def _sync_incremental(client, state, stream_name, stream_config, schema, mdata, transformer):
    """Sync records incrementally using $filter on the replication key."""
    entity_set = stream_config["entity_set_name"]
    replication_key = stream_config["replication_key"]
    params = _build_odata_params(stream_config)

    # Get the bookmark (last synced value for the replication key)
    bookmark_value = bookmarks.get_bookmark(state, stream_name, replication_key)

    if bookmark_value:
        LOGGER.info(
            "INCREMENTAL sync for %s (%s) since %s=%s",
            stream_name, entity_set, replication_key, bookmark_value,
        )
        odata_filter = f"{replication_key} ge {bookmark_value}"
        params["$filter"] = odata_filter
    else:
        LOGGER.info(
            "INCREMENTAL sync for %s (%s) - no bookmark, fetching all",
            stream_name, entity_set,
        )

    params["$orderby"] = f"{replication_key} asc"

    record_count = 0
    max_replication_value = bookmark_value
    extraction_time = singer.utils.now()

    for record in client.get_all_records(entity_set, params=params):
        transformed = transformer.transform(record, schema, mdata)
        singer.write_record(stream_name, transformed, time_extracted=extraction_time)
        record_count += 1

        # Track the maximum replication key value seen
        record_rep_value = record.get(replication_key)
        if record_rep_value:
            if _compare_replication_values(record_rep_value, max_replication_value):
                max_replication_value = str(record_rep_value)

        if record_count % 10000 == 0:
            LOGGER.info("%s: Synced %d records so far...", stream_name, record_count)
            # Write intermediate bookmark for crash recovery
            if max_replication_value:
                state = bookmarks.write_bookmark(
                    state, stream_name, replication_key, max_replication_value
                )
                singer.write_state(state)

    # Write final bookmark
    if max_replication_value:
        state = bookmarks.write_bookmark(
            state, stream_name, replication_key, max_replication_value
        )

    LOGGER.info("%s: Completed. Total records: %d", stream_name, record_count)
    return state, record_count


def sync(config, state, catalog):
    """Main sync entry point.

    Iterates over selected streams and syncs each one according to its
    replication method.
    """
    client = DynamicsClient(config)
    selected_streams = _get_selected_streams(catalog)

    if not selected_streams:
        LOGGER.warning("No streams selected. Exiting sync.")
        return state

    LOGGER.info("Starting sync for %d selected stream(s)", len(selected_streams))

    for entry in selected_streams:
        stream_name = entry.tap_stream_id
        stream_config = STREAMS.get(stream_name)

        if not stream_config:
            LOGGER.warning("Stream %s not found in STREAMS config, skipping", stream_name)
            continue

        schema = entry.schema.to_dict() if hasattr(entry.schema, "to_dict") else entry.schema
        mdata = metadata.to_map(entry.metadata)
        key_properties = stream_config["key_properties"]
        replication_key = stream_config["replication_key"]
        replication_method = stream_config["replication_method"]

        # Mark stream as currently syncing
        state = singer.set_currently_syncing(state, stream_name)
        singer.write_state(state)

        # Write schema message
        singer.write_schema(
            stream_name,
            schema,
            key_properties=key_properties,
            replication_key=replication_key,
        )

        with Transformer() as transformer:
            if replication_method == "INCREMENTAL":
                state, _ = _sync_incremental(
                    client, state, stream_name, stream_config,
                    schema, mdata, transformer,
                )
            else:
                _sync_full_table(
                    client, stream_name, stream_config,
                    schema, mdata, transformer,
                )

        singer.write_state(state)

    # Clear currently syncing
    state = singer.set_currently_syncing(state, None)
    singer.write_state(state)

    LOGGER.info("Sync complete.")
    return state
